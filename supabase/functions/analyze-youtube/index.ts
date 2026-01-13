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

async function fetchTranscript(videoId: string): Promise<string | null> {
  try {
    // Fetch the video page to get caption tracks
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const response = await fetch(watchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      }
    });
    
    if (!response.ok) {
      console.error("Failed to fetch YouTube page:", response.status);
      return null;
    }
    
    const html = await response.text();
    
    // Extract captions URL from the page
    const captionMatch = html.match(/"captionTracks":\s*(\[.*?\])/);
    if (!captionMatch) {
      console.log("No captions found for video");
      return null;
    }
    
    let captionTracks;
    try {
      captionTracks = JSON.parse(captionMatch[1]);
    } catch {
      console.error("Failed to parse caption tracks");
      return null;
    }
    
    if (!captionTracks || captionTracks.length === 0) {
      return null;
    }
    
    // Prefer Portuguese, then auto-generated Portuguese, then any available
    let selectedTrack = captionTracks.find((t: any) => t.languageCode === 'pt');
    if (!selectedTrack) {
      selectedTrack = captionTracks.find((t: any) => t.languageCode?.startsWith('pt'));
    }
    if (!selectedTrack) {
      selectedTrack = captionTracks[0];
    }
    
    const captionUrl = selectedTrack.baseUrl;
    if (!captionUrl) {
      return null;
    }
    
    // Fetch the captions XML
    const captionResponse = await fetch(captionUrl);
    if (!captionResponse.ok) {
      console.error("Failed to fetch captions:", captionResponse.status);
      return null;
    }
    
    const captionXml = await captionResponse.text();
    
    // Parse the XML to extract text
    const textMatches = captionXml.matchAll(/<text[^>]*>([^<]*)<\/text>/g);
    const texts: string[] = [];
    
    for (const match of textMatches) {
      let text = match[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n/g, ' ')
        .trim();
      
      if (text) {
        texts.push(text);
      }
    }
    
    const transcript = texts.join(' ');
    
    // Limit transcript to avoid token limits (roughly 8000 chars)
    if (transcript.length > 8000) {
      return transcript.substring(0, 8000) + '...';
    }
    
    return transcript || null;
  } catch (error) {
    console.error("Error fetching transcript:", error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
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
    
    // Fetch transcript
    console.log("Fetching transcript for video:", videoId);
    const transcript = await fetchTranscript(videoId);
    console.log("Transcript found:", transcript ? `${transcript.length} chars` : "none");

    // Build the analysis prompt
    let prompt: string;
    if (transcript) {
      prompt = `Você é um professor especialista analisando uma vídeo-aula. Analise a TRANSCRIÇÃO REAL do vídeo abaixo e:

1. Identifique os 5 pontos principais abordados
2. Resuma cada ponto de forma clara e didática
3. Destaque conceitos-chave que o aluno deve memorizar

Título: "${videoInfo.title}"
Canal: "${videoInfo.author_name}"

TRANSCRIÇÃO DO VÍDEO:
${transcript}

Responda em português brasileiro com uma análise estruturada baseada no conteúdo REAL do vídeo.`;
    } else {
      prompt = `Você é um professor especialista. Analise este título de vídeo-aula e sugira 5 pontos principais que provavelmente serão abordados:

Título: "${videoInfo.title}"
Canal: "${videoInfo.author_name}"

NOTA: Não foi possível obter a transcrição deste vídeo. A análise é baseada apenas no título.

Responda em português brasileiro com uma lista numerada dos tópicos principais que o aluno deve prestar atenção nesta aula.`;
    }

    // Use Lovable AI to analyze
    const aiResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [{
            role: "user",
            content: prompt
          }]
        }),
      }
    );

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("Lovable AI error:", aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        throw new Error("Rate limit exceeded. Please try again later.");
      }
      if (aiResponse.status === 402) {
        throw new Error("AI credits exhausted. Please add funds.");
      }
      throw new Error("Failed to analyze video");
    }

    const aiData = await aiResponse.json();
    const analysis = aiData.choices?.[0]?.message?.content || "Não foi possível analisar o vídeo.";

    return new Response(
      JSON.stringify({
        videoId,
        title: videoInfo.title,
        author: videoInfo.author_name,
        thumbnail: videoInfo.thumbnail_url,
        hasTranscript: !!transcript,
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
