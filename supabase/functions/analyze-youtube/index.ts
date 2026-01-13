import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY");
    if (!GOOGLE_API_KEY) {
      throw new Error("GOOGLE_API_KEY is not configured");
    }

    const { youtubeUrl } = await req.json();
    
    if (!youtubeUrl) {
      throw new Error("YouTube URL is required");
    }

    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
      throw new Error("Invalid YouTube URL");
    }

    // Get video info using YouTube oEmbed API (no auth required)
    const oembedResponse = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    );

    if (!oembedResponse.ok) {
      throw new Error("Could not fetch video information");
    }

    const videoInfo = await oembedResponse.json();

    // Use Gemini to analyze the video content based on title
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Você é um professor especialista. Analise este título de vídeo-aula e sugira 5 pontos principais que provavelmente serão abordados:

Título: "${videoInfo.title}"
Canal: "${videoInfo.author_name}"

Responda em português brasileiro com uma lista numerada dos tópicos principais que o aluno deve prestar atenção nesta aula.`
            }]
          }]
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("Gemini API error:", geminiResponse.status, errorText);
      throw new Error("Failed to analyze video");
    }

    const geminiData = await geminiResponse.json();
    const analysis = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "Não foi possível analisar o vídeo.";

    return new Response(
      JSON.stringify({
        videoId,
        title: videoInfo.title,
        author: videoInfo.author_name,
        thumbnail: videoInfo.thumbnail_url,
        analysis
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error analyzing video:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
