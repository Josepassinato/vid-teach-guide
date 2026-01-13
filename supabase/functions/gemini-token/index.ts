import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY");
    if (!GOOGLE_API_KEY) {
      throw new Error("GOOGLE_API_KEY is not configured");
    }

    const { systemInstruction } = await req.json().catch(() => ({}));

    const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    // Return the API key directly for Live API WebSocket connection
    // The Live API uses the API key in the WebSocket URL
    console.log("Returning API key for Live API connection");
    
    return new Response(
      JSON.stringify({ 
        token: GOOGLE_API_KEY,
        expiresAt: expireTime,
        model: "gemini-2.5-flash",
        systemInstruction: systemInstruction || "Você é um professor amigável e didático. Seu objetivo é ensinar de forma clara e envolvente. Quando o aluno mencionar um vídeo ou conteúdo, analise e explique os pontos principais de forma acessível. Fale em português brasileiro.",
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
