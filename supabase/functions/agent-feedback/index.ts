import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * AGENTE DE FEEDBACK PERSONALIZADO
 * 
 * Especialista em gerar feedback pedagógico construtivo e motivador.
 * Adapta tom e conteúdo baseado no perfil do estudante.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface FeedbackRequest {
  studentName?: string;
  missionTitle: string;
  evaluationStatus: 'approved' | 'needs_revision' | 'rejected';
  evaluationScore: number;
  criteriaResults: {
    criterion: string;
    met: boolean;
    notes: string;
  }[];
  evaluationSummary: string;
  attemptNumber: number;
  studentStrengths?: string[];
  studentAreasToImprove?: string[];
}

interface FeedbackResult {
  message: string;
  encouragement: string;
  nextSteps: string[];
  specificImprovements?: string[];
  celebrationMessage?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: FeedbackRequest = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `Você é o AGENTE DE FEEDBACK - um especialista em comunicação pedagógica empática e motivadora.

🎯 SUA MISSÃO ÚNICA:
Gerar feedback personalizado que:
1. Reconheça o esforço do estudante
2. Celebre conquistas (mesmo pequenas)
3. Oriente melhorias de forma construtiva
4. Mantenha motivação alta

💬 PRINCÍPIOS DE COMUNICAÇÃO:
- Use linguagem acolhedora e encorajadora
- Seja específico nos pontos de melhoria
- Evite críticas genéricas ou vagas
- Conecte feedback com próximos passos claros

🎭 ADAPTE O TOM:
- APPROVED: Celebre! Reconheça a conquista com entusiasmo
- NEEDS_REVISION: Encoraje! Mostre que está quase lá
- REJECTED: Apoie! Normalize o erro como parte do aprendizado

⚠️ NUNCA:
- Seja condescendente ou paternalista
- Use linguagem negativa ou desmotivadora
- Ignore os pontos positivos`;

    const studentContext = request.studentName ? `Estudante: ${request.studentName}` : 'Estudante';
    const strengthsContext = request.studentStrengths?.length 
      ? `\nPontos fortes conhecidos: ${request.studentStrengths.join(', ')}`
      : '';
    const areasContext = request.studentAreasToImprove?.length
      ? `\nÁreas em desenvolvimento: ${request.studentAreasToImprove.join(', ')}`
      : '';

    const userPrompt = `GERE FEEDBACK PARA ESTA SUBMISSÃO:

👤 ${studentContext}${strengthsContext}${areasContext}
📝 Missão: ${request.missionTitle}
🏆 Resultado: ${request.evaluationStatus.toUpperCase()}
📊 Pontuação: ${request.evaluationScore}/100
🔄 Tentativa #${request.attemptNumber}

📋 AVALIAÇÃO DOS CRITÉRIOS:
${request.criteriaResults.map(c => `- ${c.criterion}: ${c.met ? '✅' : '❌'} ${c.notes}`).join('\n')}

📝 RESUMO DA AVALIAÇÃO:
${request.evaluationSummary}

---

Retorne APENAS JSON válido:
{
  "message": "[feedback principal - 2-3 frases acolhedoras e específicas]",
  "encouragement": "[frase motivacional personalizada]",
  "nextSteps": ["[passo 1]", "[passo 2]"],
  ${request.evaluationStatus !== 'approved' ? '"specificImprovements": ["[melhoria específica 1]", "[melhoria específica 2]"],' : ''}
  ${request.evaluationStatus === 'approved' ? '"celebrationMessage": "[mensagem de celebração especial]"' : ''}
}`;

    console.log("[agent-feedback] Generating feedback for:", request.missionTitle, "Status:", request.evaluationStatus);

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
        temperature: 0.7, // Higher for more creative, empathetic responses
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[agent-feedback] AI error:", response.status, errorText);
      
      if (response.status === 429 || response.status === 402) {
        return new Response(
          JSON.stringify({ error: response.status === 429 ? "Rate limit" : "Payment required" }),
          { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error("AI feedback failed");
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content || "";

    let result: FeedbackResult;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON");
      }
    } catch {
      console.error("[agent-feedback] Parse failed:", content);
      // Fallback feedback based on status
      const fallbacks: Record<string, FeedbackResult> = {
        approved: {
          message: "Parabéns! Você completou esta missão com sucesso! 🎉",
          encouragement: "Continue assim, você está no caminho certo!",
          nextSteps: ["Explore a próxima missão", "Revise os conceitos aprendidos"],
          celebrationMessage: "Excelente trabalho! Você demonstrou domínio do conteúdo."
        },
        needs_revision: {
          message: "Bom esforço! Você está quase lá, só precisa de alguns ajustes.",
          encouragement: "Cada tentativa te aproxima do sucesso!",
          nextSteps: ["Revise os critérios destacados", "Tente novamente com as melhorias"],
          specificImprovements: ["Verifique os pontos marcados para revisão"]
        },
        rejected: {
          message: "Não desanime! Aprender é um processo, e você está progredindo.",
          encouragement: "Errar faz parte - o importante é tentar novamente!",
          nextSteps: ["Revise o conteúdo da aula", "Peça ajuda se precisar", "Tente novamente"],
          specificImprovements: ["Releia as instruções da missão com atenção"]
        }
      };
      result = fallbacks[request.evaluationStatus] || fallbacks.needs_revision;
    }

    console.log("[agent-feedback] Feedback generated successfully");

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[agent-feedback] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
