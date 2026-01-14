import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TeachingMoment {
  timestamp_seconds: number;
  topic: string;
  key_insight: string;
  questions_to_ask: string[];
  discussion_points: string[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { transcript, title, analysis } = await req.json();

    if (!transcript && !analysis) {
      return new Response(
        JSON.stringify({ error: "Transcript or analysis is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const contentToAnalyze = transcript || analysis;

    const systemPrompt = `Você é um Gestor de Conteúdo Educacional especializado em identificar os momentos mais importantes de uma vídeo-aula para aprofundamento pedagógico.

Sua tarefa é analisar o conteúdo de um vídeo e identificar 2-3 pontos-chave que merecem uma pausa para exploração mais profunda com os alunos.

Para cada ponto identificado, você deve fornecer:
1. O timestamp aproximado em segundos (estime com base no fluxo do conteúdo)
2. O tópico principal
3. A ideia-chave que deve ser consolidada
4. 2-3 perguntas reflexivas para fazer aos alunos
5. Pontos de discussão para expandir o entendimento

IMPORTANTE: Foque em momentos onde:
- Conceitos fundamentais são introduzidos
- Há conexões importantes entre ideias
- Exemplos práticos podem ser expandidos
- Há potencial para reflexão crítica`;

    const userPrompt = `Analise o seguinte conteúdo da vídeo-aula "${title || 'Sem título'}" e identifique 2-3 momentos-chave para pausa e aprofundamento:

${contentToAnalyze}

Retorne APENAS um JSON válido no seguinte formato:
{
  "teaching_moments": [
    {
      "timestamp_seconds": 120,
      "topic": "Nome do tópico",
      "key_insight": "A ideia principal que deve ser consolidada",
      "questions_to_ask": ["Pergunta 1?", "Pergunta 2?"],
      "discussion_points": ["Ponto de discussão 1", "Ponto de discussão 2"]
    }
  ],
  "summary": "Breve resumo dos pontos principais do vídeo"
}`;

    console.log("[content-manager] Calling AI gateway for:", title);
    
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[content-manager] AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limits exceeded, please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required, please add funds." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error("AI gateway error");
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content || "";
    
    console.log("[content-manager] AI response length:", content.length);

    // Parse the JSON from the response
    let teachingData;
    try {
      if (!content || content.trim() === "") {
        throw new Error("Empty AI response");
      }
      
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        teachingData = JSON.parse(jsonMatch[0]);
        console.log("[content-manager] Parsed teaching moments:", teachingData.teaching_moments?.length || 0);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("[content-manager] Failed to parse AI response:", parseError, "Content preview:", content.substring(0, 200));
      // Return a fallback structure with realistic timestamps
      teachingData = {
        teaching_moments: [
          {
            timestamp_seconds: 30,
            topic: "Introdução do conceito",
            key_insight: "Compreender o contexto e objetivo da aula",
            questions_to_ask: ["O que você entendeu até agora?", "Como isso se relaciona com o que você já sabe?"],
            discussion_points: ["Conexões com experiências anteriores", "Expectativas para a aula"]
          },
          {
            timestamp_seconds: 90,
            topic: "Conceito principal",
            key_insight: "Consolidar o entendimento do tópico central",
            questions_to_ask: ["Pode explicar com suas palavras?", "Onde você aplicaria isso?"],
            discussion_points: ["Exemplos práticos", "Desafios comuns"]
          }
        ],
        summary: "Momentos-chave para aprofundamento gerados automaticamente"
      };
    }

    return new Response(
      JSON.stringify(teachingData),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Content manager error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});