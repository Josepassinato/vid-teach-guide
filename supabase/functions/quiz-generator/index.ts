import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * QUIZ GENERATOR AGENT
 * 
 * Gera automaticamente quizzes de múltipla escolha a partir da transcrição do vídeo.
 * Cria perguntas contextuais que verificam compreensão real do conteúdo.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface QuizQuestion {
  question: string;
  options: string[];
  correct_option_index: number;
  explanation: string;
  timestamp_seconds: number | null;
  difficulty: 'básico' | 'intermediário' | 'avançado';
}

interface GeneratorRequest {
  transcript: string;
  title: string;
  videoDurationMinutes?: number;
  numberOfQuestions?: number;
  teachingMoments?: Array<{ timestamp_seconds: number; topic: string; key_insight: string }>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: GeneratorRequest = await req.json();
    
    if (!request.transcript) {
      return new Response(
        JSON.stringify({ error: "Transcript is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const numQuestions = request.numberOfQuestions || 5;
    const duration = request.videoDurationMinutes || 10;

    // Build context from teaching moments if available
    let momentsContext = "";
    if (request.teachingMoments && request.teachingMoments.length > 0) {
      momentsContext = `\n\n📍 MOMENTOS-CHAVE DA AULA (use como base para as perguntas):
${request.teachingMoments.map((m, i) => `${i + 1}. [${Math.floor(m.timestamp_seconds / 60)}:${(m.timestamp_seconds % 60).toString().padStart(2, '0')}] ${m.topic}: ${m.key_insight}`).join('\n')}`;
    }

    const systemPrompt = `Você é o QUIZ GENERATOR AGENT - especialista em criar avaliações pedagógicas para cursos de programação e vibe coding.

🎯 SUA MISSÃO:
Criar ${numQuestions} perguntas de múltipla escolha que avaliem a compreensão REAL do conteúdo da aula.

📋 REGRAS PARA CRIAR BOAS PERGUNTAS:

1. **ESPECÍFICAS AO CONTEÚDO**
   - Cada pergunta DEVE ser impossível de responder sem ter assistido a aula
   - Evite perguntas genéricas como "O que é programação?"
   - Foque em conceitos, exemplos e aplicações ESPECÍFICAS mencionadas

2. **OPÇÕES PLAUSÍVEIS**
   - As 4 opções devem ser todas plausíveis
   - Evite opções obviamente erradas
   - Inclua "pegadinhas" que testam atenção aos detalhes

3. **VARIEDADE DE DIFICULDADE**
   - Inclua 1-2 perguntas básicas (definições, conceitos simples)
   - Inclua 2-3 perguntas intermediárias (aplicação, relações)
   - Inclua 1-2 perguntas avançadas (síntese, análise crítica)

4. **EXPLICAÇÕES EDUCATIVAS**
   - Cada explicação deve ensinar algo além de "a resposta correta é X"
   - Explique POR QUE as outras opções estão erradas
   - Adicione dicas para aplicar o conhecimento

5. **TIMESTAMPS RELEVANTES**
   - Associe cada pergunta ao momento do vídeo onde o conceito aparece
   - Use os momentos-chave fornecidos como referência`;

    const userPrompt = `GERE ${numQuestions} PERGUNTAS DE QUIZ PARA ESTA AULA:

📹 TÍTULO: "${request.title}"
⏱️ DURAÇÃO: ${duration} minutos
${momentsContext}

📝 TRANSCRIÇÃO/CONTEÚDO:
${request.transcript.substring(0, 12000)}

---

Retorne APENAS JSON válido no formato:
{
  "quizzes": [
    {
      "question": "[pergunta específica ao conteúdo]",
      "options": ["[opção A]", "[opção B]", "[opção C]", "[opção D]"],
      "correct_option_index": [0-3],
      "explanation": "[explicação educativa de por que essa é a resposta correta]",
      "timestamp_seconds": [segundo do vídeo relacionado ou null],
      "difficulty": "[básico|intermediário|avançado]"
    }
  ]
}

IMPORTANTE:
- Todas as perguntas devem ser sobre o CONTEÚDO ESPECÍFICO desta aula
- As opções devem estar em português
- Distribua as perguntas ao longo do vídeo (timestamps variados)
- Varie os níveis de dificuldade`;

    console.log("[quiz-generator] Generating", numQuestions, "questions for:", request.title);

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
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[quiz-generator] AI error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded, try again later" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error("AI generation failed");
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content || "";

    let quizzes: QuizQuestion[] = [];
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        quizzes = parsed.quizzes || [];
        
        // Validate and clean up quizzes
        quizzes = quizzes.map((q, index) => ({
          question: q.question || `Pergunta ${index + 1}`,
          options: Array.isArray(q.options) && q.options.length === 4 
            ? q.options 
            : ["Opção A", "Opção B", "Opção C", "Opção D"],
          correct_option_index: typeof q.correct_option_index === 'number' && q.correct_option_index >= 0 && q.correct_option_index <= 3 
            ? q.correct_option_index 
            : 0,
          explanation: q.explanation || "Revise o conteúdo da aula para entender melhor este conceito.",
          timestamp_seconds: typeof q.timestamp_seconds === 'number' ? q.timestamp_seconds : null,
          difficulty: ['básico', 'intermediário', 'avançado'].includes(q.difficulty) 
            ? q.difficulty 
            : 'intermediário',
        }));

        console.log("[quiz-generator] Successfully generated", quizzes.length, "quizzes");
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("[quiz-generator] Parse error:", parseError);
      console.error("[quiz-generator] Content preview:", content.substring(0, 500));
      
      // Fallback: generate basic quizzes
      quizzes = [{
        question: `Qual é o principal conceito apresentado na aula "${request.title}"?`,
        options: [
          "O conceito principal mencionado no início",
          "Um conceito secundário da aula",
          "Uma aplicação prática discutida",
          "A conclusão final da aula"
        ],
        correct_option_index: 0,
        explanation: "Revise o início da aula para identificar o conceito principal apresentado.",
        timestamp_seconds: 60,
        difficulty: 'básico'
      }];
    }

    return new Response(
      JSON.stringify({ quizzes, count: quizzes.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[quiz-generator] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
