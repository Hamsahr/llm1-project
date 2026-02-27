import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // --- Authentication ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the user's JWT - reject anon/service tokens
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ensure this is a real user token, not an anon/service key
    const userId = claimsData.claims.sub;
    const tokenRole = (claimsData.claims as Record<string, unknown>).role;
    if (!userId || tokenRole === "anon" || tokenRole === "service_role") {
      return new Response(JSON.stringify({ error: "Unauthorized: user token required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user role using service client
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: roleData } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    const role = roleData?.role;

    // Determine allowed categories based on role
    let categoryFilter: string[];
    if (role === "admin") {
      categoryFilter = ["hr", "technical", "general"];
    } else if (role === "hr") {
      categoryFilter = ["hr", "general"];
    } else if (role === "developer") {
      categoryFilter = ["technical", "general"];
    } else {
      categoryFilter = ["general"];
    }

    // --- RAG Pipeline ---
    const { messages, conversationId } = await req.json();

    // Input validation
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 100) {
      return new Response(JSON.stringify({ error: "Invalid messages array" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    for (const msg of messages) {
      if (!msg.content || typeof msg.content !== "string" || msg.content.length > 10000) {
        return new Response(JSON.stringify({ error: "Message too long (max 10,000 characters)" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const lastMessage = messages[messages.length - 1]?.content || "";

    // Log total indexed documents and chunks
    const { count: totalChunks } = await serviceClient
      .from("document_chunks")
      .select("*", { count: "exact", head: true });
    const { count: totalDocs } = await serviceClient
      .from("documents")
      .select("*", { count: "exact", head: true });
    console.log(`[RAG] Total indexed documents: ${totalDocs}, Total chunks: ${totalChunks}`);
    console.log(`[RAG] User: ${userId}, Role: ${role}, Allowed categories: ${categoryFilter.join(", ")}`);

    // Text-based search filtered by user's allowed categories
    let relevantChunks: any[] = [];
    const sanitize = (t: string) => t.replace(/[&|!<>():*\\'"]/g, "").trim();
    const searchTerms = lastMessage
      .split(/\s+/)
      .map(sanitize)
      .filter((w: string) => w.length > 2)
      .slice(0, 8)
      .join(" & ");

    const { data: chunks } = await serviceClient
      .from("document_chunks")
      .select("content, document_id, documents!inner(title, category)")
      .in("documents.category", categoryFilter)
      .textSearch("content", searchTerms, { type: "plain" })
      .limit(15);

    if (chunks && chunks.length > 0) {
      relevantChunks = chunks.slice(0, 10);
    } else {
      // Fallback: get recent chunks from allowed categories only
      const { data: recentChunks } = await serviceClient
        .from("document_chunks")
        .select("content, document_id, documents!inner(title, category)")
        .in("documents.category", categoryFilter)
        .limit(10);
      relevantChunks = recentChunks || [];
    }

    console.log(`[RAG] Retrieved ${relevantChunks.length} chunks for query: "${lastMessage.substring(0, 80)}"`);

    // Build context from relevant chunks
    const context = relevantChunks
      .map((c: any) => `[Source: ${(c as any).documents?.title || "Unknown"}]\n${c.content}`)
      .join("\n\n---\n\n");

    const sources = relevantChunks.map((c: any) => ({
      title: (c as any).documents?.title || "Unknown",
      category: (c as any).documents?.category || "general",
    }));

    // Remove duplicate sources
    const uniqueSources = sources.filter(
      (s: any, i: number, arr: any[]) => arr.findIndex((x: any) => x.title === s.title) === i
    );

    const systemPrompt = context
      ? `You are an enterprise knowledge assistant. Use the following document excerpts to answer the user's question. Always cite which document(s) you used. If the documents don't contain relevant information, say so honestly.

DOCUMENT CONTEXT:
${context}`
      : `You are an enterprise knowledge assistant. No documents have been uploaded yet, or no relevant documents were found for this query. Let the user know they may need to upload relevant documents first.`;

    // Stream response from Lovable AI
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI usage limit reached. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    // Create a transform stream to inject sources at the beginning
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Send sources first as a custom SSE event
    if (uniqueSources.length > 0) {
      writer.write(encoder.encode(`data: ${JSON.stringify({ sources: uniqueSources })}\n\n`));
    }

    // Pipe the AI response through
    const reader = response.body!.getReader();
    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await writer.write(value);
        }
      } finally {
        writer.close();
      }
    })();

    return new Response(readable, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: "An error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
