import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

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
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { action } = await req.json();
    console.log(`[agent-cmo] Action: ${action}`);

    const startTime = Date.now();

    const { data: config } = await supabase
      .from("agent_config")
      .select("*")
      .eq("agent_name", "CMO")
      .eq("is_active", true)
      .single();

    if (!config) throw new Error("CMO Agent is not active");

    let result: Record<string, unknown> = {};

    switch (action) {
      case "generate_social_content":
        result = await generateSocialContent(supabase, config, LOVABLE_API_KEY);
        break;
      case "generate_email_campaign":
        result = await generateEmailCampaign(supabase, config, LOVABLE_API_KEY);
        break;
      case "seo_analysis":
        result = await analyzeSEO(supabase, config, LOVABLE_API_KEY);
        break;
      case "content_calendar":
        result = await generateContentCalendar(supabase, config, LOVABLE_API_KEY);
        break;
      case "daily_report":
        result = await generateDailyReport(supabase, config, LOVABLE_API_KEY);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    const duration = Date.now() - startTime;
    await supabase.from("agent_actions_log").insert({
      agent_name: "CMO",
      action_type: "execution",
      action_category: "green",
      title: `CMO: ${action}`,
      description: `Marketing executado: ${action}`,
      output_data: result,
      status: "completed",
      duration_ms: duration,
    });

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[agent-cmo] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function generateSocialContent(
  supabase: ReturnType<typeof createClient>,
  config: Record<string, unknown>,
  apiKey: string
): Promise<Record<string, unknown>> {
  // Get platform data for content inspiration
  const { data: videos } = await supabase
    .from("videos")
    .select("title, description, analysis")
    .eq("is_released", true)
    .order("created_at", { ascending: false })
    .limit(5);

  const { data: achievements } = await supabase
    .from("student_achievements")
    .select("total_points, level, missions_completed")
    .order("total_points", { ascending: false })
    .limit(5);

  // Get recent memories/insights
  const { data: memories } = await supabase
    .from("agent_memory")
    .select("content, confidence")
    .eq("agent_name", "CMO")
    .eq("is_active", true)
    .order("confidence", { ascending: false })
    .limit(5);

  const prompt = `
Voce e o CMO da plataforma Prof IA - uma escola online com tutor IA por voz.

CONTEUDO RECENTE DA PLATAFORMA:
${JSON.stringify(videos, null, 2)}

DADOS DE GAMIFICACAO (top alunos):
${JSON.stringify(achievements, null, 2)}

APRENDIZADOS ANTERIORES:
${JSON.stringify(memories, null, 2)}

Gere conteudo para CADA rede social. Responda em JSON:
{
  "instagram": {
    "post": {"caption": "string (com hashtags)", "type": "carrossel|reels|imagem", "visual_suggestion": "string"},
    "stories": [{"text": "string", "type": "enquete|quiz|texto"}],
    "reels_idea": {"script": "string", "duration_seconds": 30}
  },
  "linkedin": {
    "post": {"text": "string (profissional, sobre IA na educacao)", "hashtags": ["string"]}
  },
  "tiktok": {
    "idea": {"script": "string", "hook": "string (primeiros 3 segundos)", "duration_seconds": 60}
  },
  "youtube": {
    "short": {"title": "string", "script": "string", "description": "string"}
  },
  "content_tips": ["string"],
  "best_posting_times": {"instagram": "string", "linkedin": "string", "tiktok": "string"}
}

REGRAS:
- Tom amigavel e didatico
- Nunca prometer resultados irreais
- Incluir CTAs
- Foco no diferencial: tutor IA por voz
- Conteudo em portugues brasileiro

Responda APENAS com o JSON.`;

  const aiResponse = await callAI(apiKey, config.system_prompt as string, prompt, config.temperature as number);
  let content;
  try { content = JSON.parse(aiResponse); } catch { content = { raw_content: aiResponse }; }

  // Save successful content patterns as memory
  await supabase.from("agent_memory").insert({
    agent_name: "CMO",
    memory_type: "pattern",
    category: "content_creation",
    content: `Conteudo gerado: ${JSON.stringify(content.content_tips || [])}`,
    confidence: 0.6,
  });

  return { content, generated_at: new Date().toISOString() };
}

async function generateEmailCampaign(
  supabase: ReturnType<typeof createClient>,
  config: Record<string, unknown>,
  apiKey: string
): Promise<Record<string, unknown>> {
  // Get student segments
  const { data: profiles } = await supabase
    .from("student_profiles")
    .select("student_id, name, last_seen_at, total_study_time_minutes, learning_style");

  const { data: achievements } = await supabase
    .from("student_achievements")
    .select("student_id, level, current_streak, missions_completed");

  const now = new Date();
  const segments = {
    new_students: [] as string[],
    active_engaged: [] as string[],
    inactive_recoverable: [] as string[],
    at_risk: [] as string[],
  };

  for (const p of (profiles || [])) {
    const daysSinceLastSeen = p.last_seen_at
      ? Math.floor((now.getTime() - new Date(p.last_seen_at).getTime()) / (1000 * 60 * 60 * 24))
      : 999;
    const studyMinutes = p.total_study_time_minutes || 0;

    if (studyMinutes < 30) segments.new_students.push(p.name || p.student_id);
    else if (daysSinceLastSeen <= 3) segments.active_engaged.push(p.name || p.student_id);
    else if (daysSinceLastSeen <= 10) segments.inactive_recoverable.push(p.name || p.student_id);
    else segments.at_risk.push(p.name || p.student_id);
  }

  const prompt = `
Crie campanhas de email para cada segmento de alunos:

SEGMENTOS:
- Novos (${segments.new_students.length} alunos): acabaram de se cadastrar
- Ativos (${segments.active_engaged.length} alunos): engajados, estudando
- Inativos recuperaveis (${segments.inactive_recoverable.length} alunos): 3-10 dias sem entrar
- Em risco (${segments.at_risk.length} alunos): 10+ dias sem entrar

Para cada segmento, gere em JSON:
{
  "campaigns": [
    {
      "segment": "string",
      "subject_line": "string",
      "preview_text": "string",
      "body_html": "string (HTML simples)",
      "cta_text": "string",
      "cta_url": "/aluno",
      "send_time": "string (horario ideal)",
      "tone": "string"
    }
  ],
  "general_tips": ["string"]
}

REGRAS:
- Portugues brasileiro, tom amigavel
- Personalizar com {{nome}} onde possivel
- Emails curtos e diretos
- CTA claro
- Nunca ser invasivo ou pressionar
- Respeitar LGPD

Responda APENAS com o JSON.`;

  const aiResponse = await callAI(apiKey, config.system_prompt as string, prompt, config.temperature as number);
  let campaigns;
  try { campaigns = JSON.parse(aiResponse); } catch { campaigns = { raw: aiResponse }; }

  return { segments_count: segments, campaigns };
}

async function analyzeSEO(
  supabase: ReturnType<typeof createClient>,
  config: Record<string, unknown>,
  apiKey: string
): Promise<Record<string, unknown>> {
  const { data: videos } = await supabase
    .from("videos")
    .select("title, description")
    .eq("is_released", true);

  const { data: modules } = await supabase
    .from("modules")
    .select("title, description");

  const prompt = `
Analise o conteudo da plataforma para SEO:

TITULOS DE AULAS: ${JSON.stringify((videos || []).map((v: Record<string, string>) => v.title))}
DESCRICOES: ${JSON.stringify((videos || []).map((v: Record<string, string>) => v.description).filter(Boolean))}
MODULOS: ${JSON.stringify((modules || []).map((m: Record<string, string>) => m.title))}

Gere recomendacoes SEO em JSON:
{
  "current_keywords": ["string"],
  "suggested_keywords": ["string"],
  "title_improvements": [{"current": "string", "suggested": "string", "reason": "string"}],
  "meta_descriptions": [{"page": "string", "description": "string"}],
  "content_gaps": ["string"],
  "blog_post_ideas": [{"title": "string", "target_keyword": "string", "outline": ["string"]}],
  "technical_seo": ["string"]
}

Foco: mercado brasileiro, educacao online, IA, programacao.
Responda APENAS com o JSON.`;

  const aiResponse = await callAI(apiKey, config.system_prompt as string, prompt, config.temperature as number);
  let seo;
  try { seo = JSON.parse(aiResponse); } catch { seo = { raw: aiResponse }; }

  return { seo };
}

async function generateContentCalendar(
  supabase: ReturnType<typeof createClient>,
  config: Record<string, unknown>,
  apiKey: string
): Promise<Record<string, unknown>> {
  const { data: memories } = await supabase
    .from("agent_memory")
    .select("content, confidence")
    .eq("agent_name", "CMO")
    .order("confidence", { ascending: false })
    .limit(10);

  const prompt = `
Gere um calendario de conteudo para os proximos 7 dias para a plataforma Prof IA.

APRENDIZADOS ANTERIORES:
${JSON.stringify(memories, null, 2)}

Gere em JSON:
{
  "calendar": [
    {
      "day": "segunda|terca|quarta|quinta|sexta|sabado|domingo",
      "date": "YYYY-MM-DD",
      "posts": [
        {
          "platform": "instagram|linkedin|tiktok|youtube|email",
          "time": "HH:MM",
          "type": "post|story|reel|artigo|email|short",
          "topic": "string",
          "brief": "string"
        }
      ]
    }
  ],
  "themes_of_the_week": ["string"],
  "content_pillars": ["string"]
}

Distribua conteudo de forma equilibrada. Melhores horarios para Brasil.
Responda APENAS com o JSON.`;

  const aiResponse = await callAI(apiKey, config.system_prompt as string, prompt, config.temperature as number);
  let calendar;
  try { calendar = JSON.parse(aiResponse); } catch { calendar = { raw: aiResponse }; }

  return { calendar };
}

async function generateDailyReport(
  supabase: ReturnType<typeof createClient>,
  config: Record<string, unknown>,
  apiKey: string
): Promise<Record<string, unknown>> {
  const content = await generateSocialContent(supabase, config, apiKey);
  const calendar = await generateContentCalendar(supabase, config, apiKey);

  const today = new Date().toISOString().split("T")[0];
  const report = {
    summary: "Conteudo de marketing gerado para todas as plataformas. Calendario semanal atualizado.",
    content_generated: true,
    calendar_updated: true,
    platforms_covered: ["instagram", "linkedin", "tiktok", "youtube", "email"],
  };

  await supabase.from("agent_daily_reports").upsert({
    agent_name: "CMO",
    report_date: today,
    report_type: "daily",
    summary: report.summary,
    metrics: { platforms: report.platforms_covered },
    recommendations: [],
  }, { onConflict: "agent_name,report_date,report_type" });

  await supabase.from("agent_messages").insert({
    from_agent: "CMO",
    to_agent: "CEO",
    message_type: "report",
    priority: "normal",
    subject: "Relatorio Marketing: Conteudo gerado",
    payload: report,
  });

  return { report, content: content.content, calendar: calendar.calendar };
}

async function callAI(apiKey: string, systemPrompt: string, userPrompt: string, temperature: number): Promise<string> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      temperature, max_tokens: 4096,
    }),
  });
  if (!response.ok) throw new Error(`AI API error ${response.status}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}
