import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

/**
 * SEARCH TRANSCRIPT
 *
 * Receives a query + video_id, generates embedding for the query,
 * and returns the top N most similar transcript chunks via pgvector.
 */

serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  try {
    const { query, video_id, match_count = 5 } = await req.json();

    if (!query || !video_id) {
      return new Response(
        JSON.stringify({ error: "query and video_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Generate embedding for the query
    const embResponse = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: query,
      }),
    });

    if (!embResponse.ok) {
      const err = await embResponse.text();
      throw new Error(`OpenAI embeddings failed: ${err}`);
    }

    const embData = await embResponse.json();
    const queryEmbedding = embData.data[0].embedding;

    // Search using pgvector similarity function
    const { data: chunks, error: searchError } = await supabase.rpc(
      "match_transcript_chunks",
      {
        query_embedding: JSON.stringify(queryEmbedding),
        match_video_id: video_id,
        match_count,
        match_threshold: 0.5,
      }
    );

    if (searchError) throw searchError;

    console.log(`[search-transcript] Found ${chunks?.length || 0} chunks for query: "${query.substring(0, 50)}..."`);

    return new Response(
      JSON.stringify({ chunks: chunks || [] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[search-transcript] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
