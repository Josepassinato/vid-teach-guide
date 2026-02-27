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
    console.log(`[agent-cpo] Action: ${action}`);

    const startTime = Date.now();

    const { data: config } = await supabase
      .from("agent_config")
      .select("*")
      .eq("agent_name", "CPO")
      .eq("is_active", true)
      .single();

    if (!config) throw new Error("CPO Agent is not active");

    let result: Record<string, unknown> = {};

    switch (action) {
      case "analyze_engagement":
        result = await analyzeEngagement(supabase, config, LOVABLE_API_KEY);
        break;
      case "detect_at_risk_students":
        result = await detectAtRiskStudents(supabase, config, LOVABLE_API_KEY);
        break;
      case "analyze_quiz_performance":
        result = await analyzeQuizPerformance(supabase, config, LOVABLE_API_KEY);
        break;
      case "content_effectiveness":
        result = await analyzeContentEffectiveness(supabase, config, LOVABLE_API_KEY);
        break;
      case "daily_report":
        result = await generateDailyReport(supabase, config, LOVABLE_API_KEY);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    const duration = Date.now() - startTime;
    await supabase.from("agent_actions_log").insert({
      agent_name: "CPO",
      action_type: "analysis",
      action_category: "green",
      title: `CPO: ${action}`,
      description: `Analise executada: ${action}`,
      output_data: result,
      status: "completed",
      duration_ms: duration,
    });

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[agent-cpo] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function analyzeEngagement(
  supabase: ReturnType<typeof createClient>,
  config: Record<string, unknown>,
  apiKey: string
): Promise<Record<string, unknown>> {
  const today = new Date().toISOString().split("T")[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  // Active students by period
  const [dailyActive, weeklyActive, monthlyActive] = await Promise.all([
    supabase.from("student_lesson_progress").select("student_id").gte("updated_at", `${today}T00:00:00`),
    supabase.from("student_lesson_progress").select("student_id").gte("updated_at", `${weekAgo}T00:00:00`),
    supabase.from("student_lesson_progress").select("student_id").gte("updated_at", `${monthAgo}T00:00:00`),
  ]);

  const uniqueDaily = new Set((dailyActive.data || []).map((d: Record<string, string>) => d.student_id)).size;
  const uniqueWeekly = new Set((weeklyActive.data || []).map((d: Record<string, string>) => d.student_id)).size;
  const uniqueMonthly = new Set((monthlyActive.data || []).map((d: Record<string, string>) => d.student_id)).size;

  // Completion rates
  const { data: allProgress } = await supabase
    .from("student_lesson_progress")
    .select("student_id, is_completed, watch_time_seconds");

  const totalRecords = (allProgress || []).length;
  const completedRecords = (allProgress || []).filter((p: Record<string, unknown>) => p.is_completed).length;
  const totalWatchTime = (allProgress || []).reduce((sum: number, p: Record<string, number>) => sum + (p.watch_time_seconds || 0), 0);

  // Achievement distribution
  const { data: achievements } = await supabase
    .from("student_achievements")
    .select("level, total_points, current_streak, missions_completed, average_score");

  const levelDistribution: Record<number, number> = {};
  for (const a of (achievements || [])) {
    levelDistribution[a.level] = (levelDistribution[a.level] || 0) + 1;
  }

  // Student observations (emotional patterns)
  const { data: observations } = await supabase
    .from("student_observations")
    .select("observation_type, emotional_state, confidence_level")
    .gte("created_at", `${weekAgo}T00:00:00`);

  const emotionCounts: Record<string, number> = {};
  for (const o of (observations || [])) {
    if (o.emotional_state) {
      emotionCounts[o.emotional_state] = (emotionCounts[o.emotional_state] || 0) + 1;
    }
  }

  const metrics = {
    dau: uniqueDaily,
    wau: uniqueWeekly,
    mau: uniqueMonthly,
    dau_wau_ratio: uniqueWeekly > 0 ? Math.round((uniqueDaily / uniqueWeekly) * 100) : 0,
    completion_rate: totalRecords > 0 ? Math.round((completedRecords / totalRecords) * 100) : 0,
    total_watch_time_hours: Math.round(totalWatchTime / 3600 * 10) / 10,
    level_distribution: levelDistribution,
    emotional_patterns: emotionCounts,
    avg_points: (achievements || []).length > 0
      ? Math.round((achievements || []).reduce((s: number, a: Record<string, number>) => s + a.total_points, 0) / (achievements || []).length)
      : 0,
    avg_score: (achievements || []).length > 0
      ? Math.round((achievements || []).reduce((s: number, a: Record<string, number>) => s + (a.average_score || 0), 0) / (achievements || []).length)
      : 0,
  };

  // AI analysis
  const prompt = `
Analise estas metricas de engajamento da plataforma educacional:

${JSON.stringify(metrics, null, 2)}

Gere insights acionaveis em JSON:
{
  "engagement_score": number (0-100),
  "health": "excellent|good|needs_attention|critical",
  "top_insights": [{"insight": "string", "impact": "high|medium|low", "action": "string"}],
  "trends": {"direction": "up|stable|down", "details": "string"},
  "recommendations": ["string"]
}

Responda APENAS com o JSON.`;

  const aiResponse = await callAI(apiKey, config.system_prompt as string, prompt, config.temperature as number);
  let analysis;
  try { analysis = JSON.parse(aiResponse); } catch { analysis = { engagement_score: 50, health: "unknown", top_insights: [], recommendations: [aiResponse] }; }

  return { metrics, analysis };
}

async function detectAtRiskStudents(
  supabase: ReturnType<typeof createClient>,
  config: Record<string, unknown>,
  apiKey: string
): Promise<Record<string, unknown>> {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
  const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

  // Get all student profiles with last activity
  const { data: profiles } = await supabase
    .from("student_profiles")
    .select("student_id, name, learning_style, strengths, areas_to_improve, last_seen_at, total_study_time_minutes");

  const atRisk = {
    inactive_3_days: [] as Record<string, unknown>[],
    inactive_5_days: [] as Record<string, unknown>[],
    inactive_10_plus: [] as Record<string, unknown>[],
    low_performance: [] as Record<string, unknown>[],
  };

  for (const profile of (profiles || [])) {
    const lastSeen = profile.last_seen_at;
    if (!lastSeen) {
      atRisk.inactive_10_plus.push(profile);
      continue;
    }

    if (lastSeen < tenDaysAgo) {
      atRisk.inactive_10_plus.push(profile);
    } else if (lastSeen < fiveDaysAgo) {
      atRisk.inactive_5_days.push(profile);
    } else if (lastSeen < threeDaysAgo) {
      atRisk.inactive_3_days.push(profile);
    }
  }

  // Check for low quiz performers
  const { data: quizResults } = await supabase
    .from("student_quiz_results")
    .select("student_id, score_percentage, passed");

  const studentScores: Record<string, number[]> = {};
  for (const r of (quizResults || [])) {
    if (!studentScores[r.student_id]) studentScores[r.student_id] = [];
    studentScores[r.student_id].push(r.score_percentage);
  }

  for (const [studentId, scores] of Object.entries(studentScores)) {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    if (avg < 50) {
      const profile = (profiles || []).find((p: Record<string, string>) => p.student_id === studentId);
      atRisk.low_performance.push({
        student_id: studentId,
        name: profile?.name,
        average_score: Math.round(avg),
        total_quizzes: scores.length,
      });
    }
  }

  // Send to CSO for action
  const totalAtRisk = atRisk.inactive_3_days.length + atRisk.inactive_5_days.length + atRisk.inactive_10_plus.length + atRisk.low_performance.length;
  if (totalAtRisk > 0) {
    await supabase.from("agent_messages").insert({
      from_agent: "CPO",
      to_agent: "CSO",
      message_type: "alert",
      priority: totalAtRisk > 5 ? "high" : "normal",
      subject: `${totalAtRisk} alunos em risco detectados`,
      payload: atRisk,
    });
  }

  return {
    total_at_risk: totalAtRisk,
    breakdown: atRisk,
    total_students: (profiles || []).length,
    risk_percentage: (profiles || []).length > 0 ? Math.round((totalAtRisk / (profiles || []).length) * 100) : 0,
  };
}

async function analyzeQuizPerformance(
  supabase: ReturnType<typeof createClient>,
  config: Record<string, unknown>,
  apiKey: string
): Promise<Record<string, unknown>> {
  // Get all quiz results with video info
  const { data: results } = await supabase
    .from("student_quiz_results")
    .select("video_id, score_percentage, passed, correct_answers, total_questions");

  const { data: videos } = await supabase
    .from("videos")
    .select("id, title, module_id");

  const videoMap = new Map((videos || []).map((v: Record<string, string>) => [v.id, v.title]));

  // Aggregate by video
  const byVideo: Record<string, { scores: number[]; passed: number; total: number; title: string }> = {};
  for (const r of (results || [])) {
    if (!byVideo[r.video_id]) {
      byVideo[r.video_id] = { scores: [], passed: 0, total: 0, title: videoMap.get(r.video_id) || "Unknown" };
    }
    byVideo[r.video_id].scores.push(r.score_percentage);
    byVideo[r.video_id].total++;
    if (r.passed) byVideo[r.video_id].passed++;
  }

  const videoPerformance = Object.entries(byVideo).map(([videoId, data]) => ({
    video_id: videoId,
    title: data.title,
    avg_score: Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length),
    pass_rate: Math.round((data.passed / data.total) * 100),
    total_attempts: data.total,
    needs_attention: data.scores.reduce((a, b) => a + b, 0) / data.scores.length < 60,
  }));

  // Sort by worst performing
  videoPerformance.sort((a, b) => a.avg_score - b.avg_score);

  // Get question-level analysis
  const { data: attempts } = await supabase
    .from("student_quiz_attempts")
    .select("quiz_id, is_correct");

  const quizAccuracy: Record<string, { correct: number; total: number }> = {};
  for (const a of (attempts || [])) {
    if (!quizAccuracy[a.quiz_id]) quizAccuracy[a.quiz_id] = { correct: 0, total: 0 };
    quizAccuracy[a.quiz_id].total++;
    if (a.is_correct) quizAccuracy[a.quiz_id].correct++;
  }

  const hardestQuestions = Object.entries(quizAccuracy)
    .map(([quizId, data]) => ({
      quiz_id: quizId,
      accuracy: Math.round((data.correct / data.total) * 100),
      attempts: data.total,
    }))
    .filter(q => q.accuracy < 50)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 10);

  const prompt = `
Analise a performance dos quizzes e sugira melhorias:

PERFORMANCE POR VIDEO:
${JSON.stringify(videoPerformance.slice(0, 10), null, 2)}

QUESTOES MAIS DIFICEIS:
${JSON.stringify(hardestQuestions, null, 2)}

Gere insights em JSON:
{
  "overall_pass_rate": number,
  "problem_areas": [{"video": "string", "issue": "string", "suggestion": "string"}],
  "quiz_quality_issues": ["string"],
  "recommendations": ["string"]
}

Responda APENAS com o JSON.`;

  const aiResponse = await callAI(apiKey, config.system_prompt as string, prompt, config.temperature as number);
  let analysis;
  try { analysis = JSON.parse(aiResponse); } catch { analysis = { overall_pass_rate: 0, recommendations: [aiResponse] }; }

  return { video_performance: videoPerformance, hardest_questions: hardestQuestions, analysis };
}

async function analyzeContentEffectiveness(
  supabase: ReturnType<typeof createClient>,
  config: Record<string, unknown>,
  apiKey: string
): Promise<Record<string, unknown>> {
  const { data: videos } = await supabase
    .from("videos")
    .select("id, title, module_id, duration_minutes, is_released");

  const { data: progress } = await supabase
    .from("student_lesson_progress")
    .select("video_id, is_completed, watch_time_seconds");

  // Calculate completion and engagement per video
  const videoStats: Record<string, { views: number; completions: number; avg_watch_time: number; watch_times: number[] }> = {};
  for (const p of (progress || [])) {
    if (!videoStats[p.video_id]) videoStats[p.video_id] = { views: 0, completions: 0, avg_watch_time: 0, watch_times: [] };
    videoStats[p.video_id].views++;
    if (p.is_completed) videoStats[p.video_id].completions++;
    videoStats[p.video_id].watch_times.push(p.watch_time_seconds || 0);
  }

  const contentAnalysis = (videos || []).map((v: Record<string, unknown>) => {
    const stats = videoStats[v.id as string] || { views: 0, completions: 0, watch_times: [] };
    const avgWatch = stats.watch_times.length > 0
      ? stats.watch_times.reduce((a: number, b: number) => a + b, 0) / stats.watch_times.length
      : 0;

    return {
      video_id: v.id,
      title: v.title,
      duration_minutes: v.duration_minutes,
      views: stats.views,
      completions: stats.completions,
      completion_rate: stats.views > 0 ? Math.round((stats.completions / stats.views) * 100) : 0,
      avg_watch_minutes: Math.round(avgWatch / 60 * 10) / 10,
      is_released: v.is_released,
    };
  });

  return { content: contentAnalysis };
}

async function generateDailyReport(
  supabase: ReturnType<typeof createClient>,
  config: Record<string, unknown>,
  apiKey: string
): Promise<Record<string, unknown>> {
  const engagement = await analyzeEngagement(supabase, config, apiKey);
  const atRisk = await detectAtRiskStudents(supabase, config, apiKey);
  const quizPerf = await analyzeQuizPerformance(supabase, config, apiKey);

  const prompt = `
Gere o relatorio diario do CPO Agent:

ENGAJAMENTO: ${JSON.stringify(engagement.analysis, null, 2)}
ALUNOS EM RISCO: ${atRisk.total_at_risk} de ${(atRisk as Record<string, unknown>).total_students} (${(atRisk as Record<string, unknown>).risk_percentage}%)
QUIZZES: ${JSON.stringify(quizPerf.analysis, null, 2)}

Gere JSON:
{
  "summary": "Resumo em 3-5 frases",
  "health_score": number (0-100),
  "key_metrics": {"dau": number, "engagement": number, "at_risk": number, "quiz_pass_rate": number},
  "top_3_actions": [{"action": "string", "assigned_to": "string", "priority": "string"}],
  "insights": ["string"]
}

Responda APENAS com o JSON.`;

  const aiResponse = await callAI(apiKey, config.system_prompt as string, prompt, config.temperature as number);
  let report;
  try { report = JSON.parse(aiResponse); } catch { report = { summary: aiResponse, health_score: 50 }; }

  const today = new Date().toISOString().split("T")[0];
  await supabase.from("agent_daily_reports").upsert({
    agent_name: "CPO",
    report_date: today,
    report_type: "daily",
    summary: report.summary || "Relatorio de produto gerado",
    metrics: report.key_metrics || {},
    recommendations: report.top_3_actions || [],
    issues_found: report.insights || [],
  }, { onConflict: "agent_name,report_date,report_type" });

  await supabase.from("agent_messages").insert({
    from_agent: "CPO",
    to_agent: "CEO",
    message_type: "report",
    priority: "normal",
    subject: `Relatorio Produto: Score ${report.health_score}/100`,
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
