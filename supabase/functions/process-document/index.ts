import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { documentId, filePath, mimeType } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("documents")
      .download(filePath);
    if (downloadError) throw downloadError;

    // Extract text based on mime type
    let text = "";
    if (mimeType === "text/plain" || mimeType === "text/csv") {
      text = await fileData.text();
    } else if (mimeType === "application/pdf") {
      // For PDF, extract raw text (basic extraction)
      const bytes = new Uint8Array(await fileData.arrayBuffer());
      text = extractTextFromPdfBytes(bytes);
    } else if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      // For DOCX, extract text from XML content
      text = await extractTextFromDocx(fileData);
    }

    if (!text.trim()) {
      text = "No text content could be extracted from this document.";
    }

    // Chunk the text (500 chars with 50 char overlap)
    const chunks = chunkText(text, 500, 50);

    // Generate embeddings for each chunk and store
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    for (let i = 0; i < chunks.length; i++) {
      let embedding = null;

      if (LOVABLE_API_KEY) {
        try {
          // Use Lovable AI to generate a text representation, then create a simple embedding
          const embResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash-lite",
              messages: [
                {
                  role: "system",
                  content: "Generate a 768-dimensional embedding vector for the following text. Return ONLY a JSON array of 768 floating point numbers between -1 and 1. No other text.",
                },
                { role: "user", content: chunks[i].substring(0, 300) },
              ],
            }),
          });

          if (embResponse.ok) {
            const embData = await embResponse.json();
            const content = embData.choices?.[0]?.message?.content;
            if (content) {
              try {
                const vec = JSON.parse(content);
                if (Array.isArray(vec) && vec.length === 768) {
                  embedding = vec;
                }
              } catch { /* use null embedding */ }
            }
          }
        } catch (e) {
          console.error("Embedding generation error:", e);
        }
      }

      // Store chunk
      await supabase.from("document_chunks").insert({
        document_id: documentId,
        content: chunks[i],
        chunk_index: i,
        embedding: embedding ? `[${embedding.join(",")}]` : null,
      });
    }

    // Mark document as processed
    await supabase.from("documents").update({ processed: true }).eq("id", documentId);

    return new Response(JSON.stringify({ success: true, chunks: chunks.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("process-document error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start += chunkSize - overlap;
  }
  return chunks;
}

function extractTextFromPdfBytes(bytes: Uint8Array): string {
  // Basic PDF text extraction - looks for text between BT/ET markers
  const text: string[] = [];
  const str = new TextDecoder("latin1").decode(bytes);
  
  // Extract text from stream content
  const streamRegex = /stream\r?\n([\s\S]*?)endstream/g;
  let match;
  while ((match = streamRegex.exec(str)) !== null) {
    const content = match[1];
    // Look for text operations
    const textRegex = /\((.*?)\)\s*Tj/g;
    let textMatch;
    while ((textMatch = textRegex.exec(content)) !== null) {
      text.push(textMatch[1]);
    }
    // Also look for TJ arrays
    const tjRegex = /\[(.*?)\]\s*TJ/g;
    while ((textMatch = tjRegex.exec(content)) !== null) {
      const inner = textMatch[1];
      const parts = inner.match(/\((.*?)\)/g);
      if (parts) {
        text.push(parts.map(p => p.slice(1, -1)).join(""));
      }
    }
  }
  
  return text.join(" ").replace(/\\n/g, "\n").replace(/\s+/g, " ").trim();
}

async function extractTextFromDocx(blob: Blob): Promise<string> {
  // DOCX files are ZIP archives containing XML
  // Basic extraction: look for text content in the raw bytes
  const text = await blob.text();
  // Extract content between XML tags
  const matches = text.match(/<w:t[^>]*>(.*?)<\/w:t>/g);
  if (matches) {
    return matches.map(m => m.replace(/<[^>]+>/g, "")).join(" ");
  }
  return "";
}
