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
    // Method 1: Try fetching YouTube page and extracting captions URL directly
    console.log("Attempting YouTube page scraping for video:", videoId);
    
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const pageResponse = await fetch(watchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      }
    });
    
    if (pageResponse.ok) {
      const html = await pageResponse.text();
      
      // Try to extract captions URL from playerCaptionsTracklistRenderer
      const captionMatch = html.match(/"captionTracks":\s*(\[.*?\])/s);
      if (captionMatch) {
        try {
          const captionTracks = JSON.parse(captionMatch[1]);
          
          if (captionTracks && captionTracks.length > 0) {
            console.log("Found caption tracks:", captionTracks.length);
            
            // Prefer Portuguese, then English, then any available
            let selectedTrack = captionTracks.find((t: any) => t.languageCode === 'pt' || t.languageCode === 'pt-BR');
            if (!selectedTrack) {
              selectedTrack = captionTracks.find((t: any) => t.languageCode?.startsWith('pt'));
            }
            if (!selectedTrack) {
              selectedTrack = captionTracks.find((t: any) => t.languageCode === 'en' || t.languageCode?.startsWith('en'));
            }
            if (!selectedTrack) {
              selectedTrack = captionTracks[0];
            }
            
            const captionUrl = selectedTrack.baseUrl;
            if (captionUrl) {
              console.log("Fetching captions from URL for language:", selectedTrack.languageCode);
              const captionResponse = await fetch(captionUrl);
              
              if (captionResponse.ok) {
                const captionXml = await captionResponse.text();
                
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
                
                if (texts.length > 0) {
                  const transcript = texts.join(' ');
                  console.log("Transcript extracted from YouTube page:", transcript.length, "chars");
                  if (transcript.length > 200) {
                    return transcript.length > 12000 ? transcript.substring(0, 12000) + '...' : transcript;
                  }
                }
              }
            }
          }
        } catch (e) {
          console.error("Failed to parse caption tracks:", e);
        }
      }
    }
    
    // Method 2: Try using youtubetranscript.com API
    console.log("Attempting to fetch transcript via youtubetranscript.com...");
    
    const transcriptApiUrl = `https://youtubetranscript.com/?server_vid2=${videoId}`;
    const response = await fetch(transcriptApiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      }
    });
    
    if (response.ok) {
      const html = await response.text();
      
      // Parse the transcript from the response
      const textMatches = html.matchAll(/<text[^>]*>([^<]*)<\/text>/g);
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
      
      if (texts.length > 0) {
        const transcript = texts.join(' ');
        console.log("Transcript found via youtubetranscript.com:", transcript.length, "chars");
        if (transcript.length > 200) {
          return transcript.length > 12000 ? transcript.substring(0, 12000) + '...' : transcript;
        }
      }
    }
    
    // Method 3: Try YouTube's timedtext API directly
    console.log("Attempting direct timedtext API...");
    
    const languages = ['pt', 'pt-BR', 'en', 'a.pt', 'a.en'];
    
    for (const lang of languages) {
      const timedTextUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}`;
      
      try {
        const ttResponse = await fetch(timedTextUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          }
        });
        
        if (ttResponse.ok) {
          const xml = await ttResponse.text();
          
          if (xml && xml.includes('<text')) {
            const textMatches = xml.matchAll(/<text[^>]*>([^<]*)<\/text>/g);
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
            
            if (texts.length > 0) {
              const transcript = texts.join(' ');
              console.log(`Transcript found via timedtext API (${lang}):`, transcript.length, "chars");
              if (transcript.length > 200) {
                return transcript.length > 12000 ? transcript.substring(0, 12000) + '...' : transcript;
              }
            }
          }
        }
      } catch (e) {
        console.log(`timedtext API failed for ${lang}:`, e);
      }
    }
    
    console.log("No usable transcript found via any method");
    return null;
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
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const { youtubeUrl, manualTranscript } = await req.json();
    
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
    
    // Use manual transcript if provided, otherwise try to fetch automatically
    let transcript: string | null = null;
    
    if (manualTranscript && manualTranscript.trim().length > 50) {
      console.log("Using manual transcript:", manualTranscript.length, "chars");
      let cleanTranscript = manualTranscript.trim();
      // Limit to avoid token limits
      if (cleanTranscript.length > 12000) {
        cleanTranscript = cleanTranscript.substring(0, 12000) + '...';
      }
      transcript = cleanTranscript;
    } else {
      console.log("Fetching transcript for video:", videoId);
      transcript = await fetchTranscript(videoId);
      console.log("Transcript found:", transcript ? `${transcript.length} chars` : "none");
    }

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

    // Use OpenAI API to analyze
    const aiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [{
            role: "user",
            content: prompt
          }],
          max_completion_tokens: 2000
        }),
      }
    );

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("OpenAI API error:", aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        throw new Error("Rate limit exceeded. Please try again later.");
      }
      if (aiResponse.status === 401) {
        throw new Error("Invalid OpenAI API key.");
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
        transcript: transcript || null, // Include raw transcript for the agent
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
