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
    console.log(`[agent-cso] Action: ${action}`);

    const startTime = Date.now();

    const { data: config } = await supabase
      .from("agent_config")
      .select("*")
      .eq("agent_name", "CSO")
      .eq("is_active", true)
      .single();

    if (!config) throw new Error("CSO Agent is not active");

    let result: Record<string, unknown> = {};

    switch (action) {
      case "check_at_risk":
        result = await checkAtRiskStudents(supabase, config, LOVABLE_API_KEY);
        break;
      case "celebrate_achievements":
        result = await celebrateAchievements(supabase, config, LOVABLE_API_KEY);
        break;
      case "generate_interventions":
        result = await generateInterventions(supabase, config, LOVABLE_API_KEY);
        break;
      case "student_health_check":
        result = await studentHealthCheck(supabase, config, LOVABLE_API_KEY);
        break;
      case "daily_report":
        result = await generateDailyReport(supabase, config, LOVABLE_API_KEY);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    const duration = Date.now() - startTime;
    await supabase.from("agent_actions_log").insert({
      agent_name: "CSO",
      action_type: "execution",
      action_category: "green",
      title: `CSO: ${action}`,
      description: `Sucesso do aluno: ${action}`,
      output_data: result,
      status: "completed",
      duration_ms: duration,
    });

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[agent-cso] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function checkAtRiskStudents(
  supabase: ReturnType<typeof createClient>,
  config: Record<string, unknown>,
  apiKey: string
): Promise<Record<string, unknown>> {
  // Get all students with their activity data
  const { data: profiles } = await supabase
    .from("student_profiles")
    .select("student_id, name, learning_style, strengths, areas_to_improve, last_seen_at, total_study_time_minutes, personality_notes, emotional_patterns");

  const { data: achievements } = await supabase
    .from("student_achievements")
    .select("student_id, level, current_streak, total_points, missions_completed, average_score");

  const { data: recentProgress } = await supabase
    .from("student_lesson_progress")
    .select("student_id, is_completed, watch_time_seconds, updated_at")
    .order("updated_at", { ascending: false });

  const { data: recentQuizzes } = await supabase
    .from("student_quiz_results")
    .select("student_id, score_percentage, passed, completed_at")
    .order("completed_at", { ascending: false });

  const now = new Date();
  const studentRisk: Array<Record<string, unknown>> = [];

  for (const profile of (profiles || [])) {
    const achievement = (achievements || []).find((a: Record<string, string>) => a.student_id === profile.student_id);
    const progress = (recentProgress || []).filter((p: Record<string, string>) => p.student_id === profile.student_id);
    const quizzes = (recentQuizzes || []).filter((q: Record<string, string>) => q.student_id === profile.student_id);

    const lastSeen = profile.last_seen_at ? new Date(profile.last_seen_at) : null;
    const daysSinceLastSeen = lastSeen ? Math.floor((now.getTime() - lastSeen.getTime()) / (1000 * 60 * 60 * 24)) : 999;

    // Calculate risk score (0-100, higher = more at risk)
    let riskScore = 0;
    const riskFactors: string[] = [];

    // Inactivity risk
    if (daysSinceLastSeen >= 10) { riskScore += 40; riskFactors.push(`Inativo ha ${daysSinceLastSeen} dias`); }
    else if (daysSinceLastSeen >= 5) { riskScore += 25; riskFactors.push(`Inativo ha ${daysSinceLastSeen} dias`); }
    else if (daysSinceLastSeen >= 3) { riskScore += 10; riskFactors.push(`Inativo ha ${daysSinceLastSeen} dias`); }

    // Performance risk
    const avgScore = achievement?.average_score || 0;
    if (avgScore < 40 && quizzes.length > 0) { riskScore += 20; riskFactors.push(`Nota media baixa: ${avgScore}%`); }
    else if (avgScore < 60 && quizzes.length > 0) { riskScore += 10; riskFactors.push(`Nota media preocupante: ${avgScore}%`); }

    // Streak broken
    if (achievement?.current_streak === 0 && (achievement?.total_points || 0) > 0) {
      riskScore += 10; riskFactors.push("Streak quebrado");
    }

    // Low engagement (little study time)
    if ((profile.total_study_time_minutes || 0) < 15 && progress.length > 0) {
      riskScore += 15; riskFactors.push("Pouco tempo de estudo");
    }

    // Recent quiz failures
    const recentFails = quizzes.filter((q: Record<string, unknown>) => !q.passed).length;
    if (recentFails >= 3) { riskScore += 15; riskFactors.push(`${recentFails} reprovacoes recentes`); }

    if (riskScore > 0) {
      studentRisk.push({
        student_id: profile.student_id,
        name: profile.name,
        risk_score: Math.min(riskScore, 100),
        risk_level: riskScore >= 50 ? "high" : riskScore >= 25 ? "medium" : "low",
        days_inactive: daysSinceLastSeen,
        risk_factors: riskFactors,
        learning_style: profile.learning_style,
        total_points: achievement?.total_points || 0,
        level: achievement?.level || 0,
      });
    }
  }

  // Sort by risk score (highest first)
  studentRisk.sort((a, b) => (b.risk_score as number) - (a.risk_score as number));

  // For high-risk students, generate personalized interventions
  const highRisk = studentRisk.filter(s => s.risk_level === "high");
  if (highRisk.length > 0) {
    const prompt = `
Voce e o CSO Agent. Gere intervencoes personalizadas para estes alunos em risco:

${JSON.stringify(highRisk.slice(0, 10), null, 2)}

Para cada aluno, gere uma mensagem personalizada em JSON:
{
  "interventions": [
    {
      "student_id": "string",
      "student_name": "string",
      "risk_level": "high",
      "message_whatsapp": "string (curta, amigavel, personalizada)",
      "message_email_subject": "string",
      "message_email_body": "string (HTML simples)",
      "suggested_action": "string",
      "urgency": "immediate|today|this_week"
    }
  ]
}

REGRAS:
- Tom amigavel, NUNCA culpar o aluno
- Personalizar com o nome
- Mencionar progresso ja feito ("Voce ja completou X!")
- Oferecer ajuda especifica
- Horario: nao enviar entre 22h-7h
- Portugues brasileiro

Responda APENAS com o JSON.`;

    const aiResponse = await callAI(apiKey, config.system_prompt as string, prompt, config.temperature as number);
    let interventions;
    try { interventions = JSON.parse(aiResponse); } catch { interventions = { interventions: [] }; }

    // Log interventions
    for (const intervention of (interventions.interventions || [])) {
      await supabase.from("agent_actions_log").insert({
        agent_name: "CSO",
        action_type: "communication",
        action_category: "green",
        title: `Intervencao: ${intervention.student_name}`,
        description: intervention.message_whatsapp,
        output_data: intervention,
        status: "completed",
      });
    }

    return {
      total_students: (profiles || []).length,
      at_risk: studentRisk.length,
      high_risk: highRisk.length,
      students: studentRisk.slice(0, 20),
      interventions: interventions.interventions || [],
    };
  }

  return {
    total_students: (profiles || []).length,
    at_risk: studentRisk.length,
    high_risk: 0,
    students: studentRisk.slice(0, 20),
    interventions: [],
  };
}

async function celebrateAchievements(
  supabase: ReturnType<typeof createClient>,
  config: Record<string, unknown>,
  apiKey: string
): Promise<Record<string, unknown>> {
  const today = new Date().toISOString().split("T")[0];

  // Find today's achievements
  const { data: todayProgress } = await supabase
    .from("student_lesson_progress")
    .select("student_id, video_id")
    .gte("completed_at", `${today}T00:00:00`)
    .eq("is_completed", true);

  const { data: todayCertificates } = await supabase
    .from("certificates")
    .select("student_id, student_name, certificate_type, module_title")
    .gte("created_at", `${today}T00:00:00`);

  const { data: achievements } = await supabase
    .from("student_achievements")
    .select("student_id, current_streak, level, total_points, badges")
    .gt("current_streak", 0);

  // Streak milestones (7, 14, 30 days)
  const streakMilestones = (achievements || []).filter((a: Record<string, number>) =>
    a.current_streak === 7 || a.current_streak === 14 || a.current_streak === 30
  );

  const celebrations = {
    lessons_completed: (todayProgress || []).length,
    certificates_earned: todayCertificates || [],
    streak_milestones: streakMilestones,
  };

  // Generate celebration messages
  if (celebrations.certificates_earned.length > 0 || celebrations.streak_milestones.length > 0) {
    const prompt = `
Gere mensagens de celebracao para estas conquistas:

CERTIFICADOS HOJE: ${JSON.stringify(celebrations.certificates_earned)}
STREAKS ESPECIAIS: ${JSON.stringify(celebrations.streak_milestones)}
AULAS COMPLETADAS HOJE: ${celebrations.lessons_completed}

Gere JSON:
{
  "celebrations": [
    {
      "student_name": "string",
      "achievement": "string",
      "message": "string (curta, entusiasmada, portugues brasileiro)",
      "emoji_badge": "string"
    }
  ]
}

Responda APENAS com o JSON.`;

    const aiResponse = await callAI(apiKey, config.system_prompt as string, prompt, config.temperature as number);
    let messages;
    try { messages = JSON.parse(aiResponse); } catch { messages = { celebrations: [] }; }

    celebrations.celebration_messages = messages.celebrations;
  }

  return celebrations;
}

async function generateInterventions(
  supabase: ReturnType<typeof createClient>,
  config: Record<string, unknown>,
  apiKey: string
): Promise<Record<string, unknown>> {
  // Check for CPO messages about at-risk students
  const { data: cpoMessages } = await supabase
    .from("agent_messages")
    .select("*")
    .eq("to_agent", "CSO")
    .eq("status", "pending")
    .eq("from_agent", "CPO");

  const interventions: Array<Record<string, unknown>> = [];

  for (const msg of (cpoMessages || [])) {
    const atRiskData = msg.payload;

    // Process each risk tier
    for (const tier of ["inactive_3_days", "inactive_5_days", "inactive_10_plus", "low_performance"]) {
      const students = (atRiskData as Record<string, unknown[]>)?.[tier] || [];
      for (const student of students) {
        interventions.push({
          student,
          tier,
          source: "CPO",
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Mark message as acted upon
    await supabase
      .from("agent_messages")
      .update({ status: "acted_upon", acted_at: new Date().toISOString() })
      .eq("id", msg.id);
  }

  return {
    processed_messages: (cpoMessages || []).length,
    interventions_created: interventions.length,
    interventions,
  };
}

async function studentHealthCheck(
  supabase: ReturnType<typeof createClient>,
  _config: Record<string, unknown>,
  _apiKey: string
): Promise<Record<string, unknown>> {
  const { data: profiles } = await supabase
    .from("student_profiles")
    .select("student_id, name, last_seen_at, total_study_time_minutes, learning_style");

  const { data: achievements } = await supabase
    .from("student_achievements")
    .select("student_id, level, current_streak, missions_completed, average_score");

  const now = new Date();

  const health = {
    total: (profiles || []).length,
    active_today: 0,
    active_this_week: 0,
    inactive: 0,
    avg_study_time: 0,
    avg_level: 0,
    avg_score: 0,
    with_streaks: 0,
  };

  for (const p of (profiles || [])) {
    const lastSeen = p.last_seen_at ? new Date(p.last_seen_at) : null;
    const daysSince = lastSeen ? Math.floor((now.getTime() - lastSeen.getTime()) / (1000 * 60 * 60 * 24)) : 999;

    if (daysSince === 0) health.active_today++;
    if (daysSince <= 7) health.active_this_week++;
    if (daysSince > 7) health.inactive++;

    health.avg_study_time += p.total_study_time_minutes || 0;
  }

  if (health.total > 0) {
    health.avg_study_time = Math.round(health.avg_study_time / health.total);
  }

  for (const a of (achievements || [])) {
    health.avg_level += a.level || 0;
    health.avg_score += a.average_score || 0;
    if ((a.current_streak || 0) > 0) health.with_streaks++;
  }

  if ((achievements || []).length > 0) {
    health.avg_level = Math.round((health.avg_level / (achievements || []).length) * 10) / 10;
    health.avg_score = Math.round(health.avg_score / (achievements || []).length);
  }

  return health;
}

async function generateDailyReport(
  supabase: ReturnType<typeof createClient>,
  config: Record<string, unknown>,
  apiKey: string
): Promise<Record<string, unknown>> {
  const atRisk = await checkAtRiskStudents(supabase, config, apiKey);
  const celebrations = await celebrateAchievements(supabase, config, apiKey);
  const health = await studentHealthCheck(supabase, config, apiKey);
  const interventions = await generateInterventions(supabase, config, apiKey);

  const report = {
    summary: `${(health as Record<string, number>).active_today} alunos ativos hoje. ${(atRisk as Record<string, number>).at_risk} em risco. ${(celebrations as Record<string, number>).lessons_completed} aulas completadas. ${(atRisk as Record<string, unknown[]>).interventions?.length || 0} intervencoes geradas.`,
    health,
    at_risk_count: (atRisk as Record<string, number>).at_risk,
    high_risk_count: (atRisk as Record<string, number>).high_risk,
    celebrations_count: (celebrations as Record<string, number>).lessons_completed,
    interventions_count: (interventions as Record<string, number>).interventions_created,
  };

  const today = new Date().toISOString().split("T")[0];
  await supabase.from("agent_daily_reports").upsert({
    agent_name: "CSO",
    report_date: today,
    report_type: "daily",
    summary: report.summary,
    metrics: health as Record<string, unknown>,
    issues_found: ((atRisk as Record<string, unknown[]>).students || []).slice(0, 5),
    recommendations: (atRisk as Record<string, unknown[]>).interventions || [],
  }, { onConflict: "agent_name,report_date,report_type" });

  await supabase.from("agent_messages").insert({
    from_agent: "CSO",
    to_agent: "CEO",
    message_type: "report",
    priority: (atRisk as Record<string, number>).high_risk > 3 ? "high" : "normal",
    subject: `Sucesso do Aluno: ${(atRisk as Record<string, number>).at_risk} em risco, ${(health as Record<string, number>).active_today} ativos`,
    payload: report,
  });

  return report;
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
