import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, conversationId } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const lastMessage = messages[messages.length - 1]?.content || "";

    // Try to find relevant document chunks using text search
    // First, try to get embeddings for the query (same approach as document processing)
    let relevantChunks: any[] = [];
    
    // Fallback: use text-based search
    const { data: chunks } = await supabase
      .from("document_chunks")
      .select("content, document_id, documents(title, category)")
      .textSearch("content", lastMessage.split(" ").slice(0, 5).join(" & "), { type: "plain" });

    if (chunks && chunks.length > 0) {
      relevantChunks = chunks.slice(0, 5);
    } else {
      // If text search returns nothing, get some recent chunks as context
      const { data: recentChunks } = await supabase
        .from("document_chunks")
        .select("content, document_id, documents(title, category)")
        .limit(3);
      relevantChunks = recentChunks || [];
    }

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
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
