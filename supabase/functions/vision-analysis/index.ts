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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { image } = await req.json();
    
    if (!image) {
      throw new Error("No image provided");
    }

    console.log("[vision-analysis] Analyzing student image...");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Você é um analisador de expressões faciais e estados emocionais para um sistema educacional.
Analise a imagem do aluno e identifique:
1. O estado emocional principal (feliz, confuso, frustrado, animado, entediado, focado, cansado, curioso, pensativo)
2. O nível de engajamento (alto, médio, baixo)
3. Sugestões para o professor baseadas no estado observado

Responda APENAS com um JSON válido no formato:
{
  "emotion": "estado_emocional",
  "confidence": 0.0-1.0,
  "details": "descrição breve do que você observou",
  "engagement_level": "high|medium|low",
  "suggestions": ["sugestão1", "sugestão2"]
}

Se não conseguir detectar uma face claramente, retorne:
{
  "emotion": "indefinido",
  "confidence": 0,
  "details": "Não foi possível detectar uma face claramente",
  "engagement_level": "medium",
  "suggestions": []
}`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analise a expressão facial e estado emocional do aluno nesta imagem:"
              },
              {
                type: "image_url",
                image_url: {
                  url: image
                }
              }
            ]
          }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[vision-analysis] API error:", response.status, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error("No response from AI");
    }

    console.log("[vision-analysis] Raw response:", content);

    // Parse the JSON response
    let analysis;
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("[vision-analysis] Parse error:", parseError);
      // Return a default response if parsing fails
      analysis = {
        emotion: "indefinido",
        confidence: 0,
        details: "Erro ao processar a análise",
        engagement_level: "medium",
        suggestions: []
      };
    }

    console.log("[vision-analysis] Analysis result:", analysis);

    return new Response(
      JSON.stringify({ analysis }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[vision-analysis] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
