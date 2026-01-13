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

    // Generate ephemeral token using Google's API
    const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const newSessionExpireTime = new Date(Date.now() + 2 * 60 * 1000).toISOString();

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1alpha/authTokens?key=" + GOOGLE_API_KEY,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          uses: 1,
          expireTime: expireTime,
          newSessionExpireTime: newSessionExpireTime,
          liveConnectConstraints: {
            model: "gemini-2.5-flash-native-audio-preview-12-2025",
            config: {
              responseModalities: ["AUDIO"],
              systemInstruction: systemInstruction || "Você é um professor amigável e didático. Seu objetivo é ensinar de forma clara e envolvente. Quando o aluno mencionar um vídeo ou conteúdo, analise e explique os pontos principais de forma acessível. Fale em português brasileiro.",
            }
          }
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Google API error:", response.status, errorText);
      throw new Error(`Failed to generate ephemeral token: ${response.status}`);
    }

    const tokenData = await response.json();

    return new Response(
      JSON.stringify({ 
        token: tokenData.name,
        expiresAt: expireTime
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error generating token:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
