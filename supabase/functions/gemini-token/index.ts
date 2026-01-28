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

    // Discover a Live-compatible model dynamically.
    // The WS endpoint (BidiGenerateContent) requires models that include "bidiGenerateContent"
    // in supportedGenerationMethods.
    let chosenModel: string | null = null;
    try {
      const listResp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${GOOGLE_API_KEY}`,
        { method: "GET" },
      );

      if (listResp.ok) {
        const listJson = await listResp.json();
        const models: Array<{ name?: string; supportedGenerationMethods?: string[] }> =
          Array.isArray(listJson?.models) ? listJson.models : [];

        const bidiModels = models
          .filter((m) => (m.supportedGenerationMethods || []).includes("bidiGenerateContent"))
          .map((m) => m.name)
          .filter((n): n is string => typeof n === "string" && n.length > 0);

        // Prefer historically common IDs first if they exist for this key.
        const preferred = [
          "models/gemini-2.0-flash-exp",
          "models/gemini-2.0-flash-live-preview",
          "models/gemini-2.0-flash-live-preview-04-09",
          "models/gemini-live-2.5-flash-preview",
        ];

        chosenModel =
          preferred.find((p) => bidiModels.includes(p)) ??
          bidiModels.find((m) => m.includes("flash")) ??
          bidiModels[0] ??
          null;

        console.log(
          "[gemini-token] ListModels OK. bidi models:",
          bidiModels.length,
          "chosen:",
          chosenModel,
        );
      } else {
        const t = await listResp.text();
        console.warn("[gemini-token] ListModels failed:", listResp.status, t);
      }
    } catch (e) {
      console.warn("[gemini-token] ListModels error:", e);
    }

    if (!chosenModel) {
      // Fail fast with actionable message.
      throw new Error(
        "Nenhum modelo compatível com bidiGenerateContent foi encontrado para esta chave. Verifique se a API Live/Reatime está habilitada para a chave e tente novamente.",
      );
    }

    // Return the API key directly for Live API WebSocket connection
    // The Live API uses the API key in the WebSocket URL
    console.log("Returning API key for Live API connection");
    
    return new Response(
      JSON.stringify({ 
        token: GOOGLE_API_KEY,
        expiresAt: expireTime,
        model: chosenModel,
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
