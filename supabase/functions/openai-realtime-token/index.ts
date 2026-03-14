import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const { systemInstruction } = await req.json().catch(() => ({}));

    console.log("Returning OpenAI API key for Realtime API connection");
    
    return new Response(
      JSON.stringify({ 
        apiKey: OPENAI_API_KEY,
        model: "gpt-4o-realtime-preview-2024-12-17",
        systemInstruction: systemInstruction || "Você é um professor amigável e didático. Seu objetivo é ensinar de forma clara e envolvente. Fale em português brasileiro.",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
