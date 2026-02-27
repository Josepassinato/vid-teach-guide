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
    console.log(`[agent-cto] Action: ${action}`);

    const startTime = Date.now();

    // Check if agent is active
    const { data: config } = await supabase
      .from("agent_config")
      .select("*")
      .eq("agent_name", "CTO")
      .eq("is_active", true)
      .single();

    if (!config) throw new Error("CTO Agent is not active");

    let result: Record<string, unknown> = {};

    switch (action) {
      case "health_check": {
        result = await runHealthCheck(supabase, config, LOVABLE_API_KEY);
        break;
      }
      case "analyze_performance": {
        result = await analyzePerformance(supabase, config, LOVABLE_API_KEY);
        break;
      }
      case "monitor_errors": {
        result = await monitorErrors(supabase, config, LOVABLE_API_KEY);
        break;
      }
      case "cost_analysis": {
        result = await analyzeCosts(supabase, config, LOVABLE_API_KEY);
        break;
      }
      case "daily_report": {
        result = await generateDailyReport(supabase, config, LOVABLE_API_KEY);
        break;
      }
      case "process_tasks": {
        result = await processPendingTasks(supabase, config, LOVABLE_API_KEY);
        break;
      }
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    const duration = Date.now() - startTime;
    await logAction(supabase, "CTO", action, result, duration);

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[agent-cto] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ============================================================
// Health Check — Verifica saude da plataforma
// ============================================================
async function runHealthCheck(
  supabase: ReturnType<typeof createClient>,
  _config: Record<string, unknown>,
  _apiKey: string
): Promise<Record<string, unknown>> {
  const checks: Record<string, unknown> = {};

  // 1. Database connectivity
  const dbStart = Date.now();
  const { error: dbError } = await supabase.from("videos").select("id", { count: "exact", head: true });
  checks.database = {
    status: dbError ? "error" : "healthy",
    response_time_ms: Date.now() - dbStart,
    error: dbError?.message,
  };

  // 2. Edge functions (check if key functions exist by testing tables they depend on)
  const tables = ["videos", "modules", "student_profiles", "student_achievements", "certificates", "missions"];
  const tableChecks: Record<string, unknown> = {};
  for (const table of tables) {
    const start = Date.now();
    const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true });
    tableChecks[table] = {
      status: error ? "error" : "healthy",
      row_count: count || 0,
      response_time_ms: Date.now() - start,
    };
  }
  checks.tables = tableChecks;

  // 3. Data integrity checks
  const { data: orphanedProgress } = await supabase
    .from("student_lesson_progress")
    .select("video_id")
    .is("is_completed", null);
  checks.data_integrity = {
    orphaned_progress_records: (orphanedProgress || []).length,
  };

  // 4. Check for stale data
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const { count: staleProfiles } = await supabase
    .from("student_profiles")
    .select("id", { count: "exact", head: true })
    .lt("updated_at", threeDaysAgo);
  checks.stale_data = {
    stale_profiles: staleProfiles || 0,
  };

  // 5. Overall status
  const hasErrors = Object.values(tableChecks).some((t: unknown) => (t as Record<string, string>).status === "error");
  checks.overall_status = hasErrors ? "warning" : "healthy";

  return checks;
}

// ============================================================
// Analyze Performance — Metricas de performance
// ============================================================
async function analyzePerformance(
  supabase: ReturnType<typeof createClient>,
  config: Record<string, unknown>,
  apiKey: string
): Promise<Record<string, unknown>> {
  // Collect data sizes and response times
  const metrics: Record<string, unknown> = {};

  // Video content metrics
  const { data: videos } = await supabase
    .from("videos")
    .select("id, title, transcript, analysis, teaching_moments, is_configured");

  const videoMetrics = (videos || []).map((v: Record<string, unknown>) => ({
    id: v.id,
    title: v.title,
    has_transcript: !!v.transcript,
    has_analysis: !!v.analysis,
    has_teaching_moments: !!(v.teaching_moments as unknown[])?.length,
    is_configured: v.is_configured,
    transcript_length: ((v.transcript as string) || "").length,
  }));

  metrics.videos = {
    total: videoMetrics.length,
    configured: videoMetrics.filter((v: Record<string, unknown>) => v.is_configured).length,
    with_transcript: videoMetrics.filter((v: Record<string, unknown>) => v.has_transcript).length,
    with_analysis: videoMetrics.filter((v: Record<string, unknown>) => v.has_analysis).length,
    with_teaching_moments: videoMetrics.filter((v: Record<string, unknown>) => v.has_teaching_moments).length,
    unconfigured: videoMetrics.filter((v: Record<string, unknown>) => !v.is_configured),
  };

  // Quiz coverage
  const { data: quizzes } = await supabase
    .from("video_quizzes")
    .select("video_id");
  const videosWithQuizzes = new Set((quizzes || []).map((q: Record<string, string>) => q.video_id));
  metrics.quiz_coverage = {
    total_quizzes: (quizzes || []).length,
    videos_with_quizzes: videosWithQuizzes.size,
    videos_without_quizzes: videoMetrics.length - videosWithQuizzes.size,
  };

  // Module organization
  const { data: modules } = await supabase
    .from("modules")
    .select("id, title, is_released");
  const { data: unassignedVideos } = await supabase
    .from("videos")
    .select("id, title")
    .is("module_id", null);
  metrics.modules = {
    total: (modules || []).length,
    released: (modules || []).filter((m: Record<string, unknown>) => m.is_released).length,
    unreleased: (modules || []).filter((m: Record<string, unknown>) => !m.is_released).length,
    unassigned_videos: (unassignedVideos || []).length,
  };

  // Agent system health
  const today = new Date().toISOString().split("T")[0];
  const { data: agentActions } = await supabase
    .from("agent_actions_log")
    .select("agent_name, status, duration_ms")
    .gte("created_at", `${today}T00:00:00`);

  const failedActions = (agentActions || []).filter((a: Record<string, string>) => a.status === "failed");
  metrics.agent_system = {
    total_actions_today: (agentActions || []).length,
    failed_actions: failedActions.length,
    avg_duration_ms: (agentActions || []).length > 0
      ? Math.round((agentActions || []).reduce((sum: number, a: Record<string, number>) => sum + (a.duration_ms || 0), 0) / (agentActions || []).length)
      : 0,
  };

  // Ask AI for analysis
  const prompt = `
Analise estas metricas de performance da plataforma e identifique:
1. Problemas criticos
2. Areas que precisam de atencao
3. Sugestoes de otimizacao

METRICAS:
${JSON.stringify(metrics, null, 2)}

Responda em JSON:
{
  "status": "healthy|needs_attention|critical",
  "issues": [{"severity": "low|medium|high", "area": "string", "description": "string", "suggestion": "string"}],
  "optimizations": [{"impact": "low|medium|high", "description": "string", "effort": "low|medium|high"}],
  "summary": "string"
}

Responda APENAS com o JSON.`;

  const aiResponse = await callAI(apiKey, config.system_prompt as string, prompt, config.temperature as number);
  let analysis;
  try {
    analysis = JSON.parse(aiResponse);
  } catch {
    analysis = { status: "unknown", summary: aiResponse, issues: [], optimizations: [] };
  }

  return { metrics, analysis };
}

// ============================================================
// Monitor Errors — Detecta erros recentes
// ============================================================
async function monitorErrors(
  supabase: ReturnType<typeof createClient>,
  _config: Record<string, unknown>,
  _apiKey: string
): Promise<Record<string, unknown>> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Check for failed agent actions
  const { data: failedActions } = await supabase
    .from("agent_actions_log")
    .select("*")
    .eq("status", "failed")
    .gte("created_at", oneDayAgo)
    .order("created_at", { ascending: false });

  // Check for over-budget agents
  const today = new Date().toISOString().split("T")[0];
  const { data: overBudget } = await supabase
    .from("agent_budgets")
    .select("*")
    .eq("period_start", today)
    .eq("is_over_budget", true);

  // Check for expired escalations
  const { data: expiredEscalations } = await supabase
    .from("agent_escalations")
    .select("*")
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString());

  // Check for stuck tasks
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const { data: stuckTasks } = await supabase
    .from("agent_tasks")
    .select("*")
    .eq("status", "in_progress")
    .lt("started_at", twoDaysAgo);

  const errors = {
    failed_actions: failedActions || [],
    over_budget_agents: overBudget || [],
    expired_escalations: expiredEscalations || [],
    stuck_tasks: stuckTasks || [],
    total_issues: (failedActions?.length || 0) + (overBudget?.length || 0) + (expiredEscalations?.length || 0) + (stuckTasks?.length || 0),
  };

  // If critical issues, send message to CEO
  if (errors.total_issues > 0) {
    await supabase.from("agent_messages").insert({
      from_agent: "CTO",
      to_agent: "CEO",
      message_type: "alert",
      priority: errors.total_issues > 3 ? "critical" : "high",
      subject: `${errors.total_issues} problemas detectados`,
      payload: errors,
    });
  }

  return errors;
}

// ============================================================
// Analyze Costs — Custos de infraestrutura
// ============================================================
async function analyzeCosts(
  supabase: ReturnType<typeof createClient>,
  config: Record<string, unknown>,
  apiKey: string
): Promise<Record<string, unknown>> {
  const today = new Date().toISOString().split("T")[0];
  const monthStart = today.substring(0, 7) + "-01";

  // Get agent costs this month
  const { data: monthBudgets } = await supabase
    .from("agent_budgets")
    .select("agent_name, spent_usd, tokens_used, actions_count")
    .gte("period_start", monthStart);

  const costByAgent: Record<string, number> = {};
  const tokensByAgent: Record<string, number> = {};
  let totalCost = 0;

  for (const b of (monthBudgets || [])) {
    costByAgent[b.agent_name] = (costByAgent[b.agent_name] || 0) + b.spent_usd;
    tokensByAgent[b.agent_name] = (tokensByAgent[b.agent_name] || 0) + b.tokens_used;
    totalCost += b.spent_usd;
  }

  // Get action counts by agent
  const { data: actionCounts } = await supabase
    .from("agent_actions_log")
    .select("agent_name")
    .gte("created_at", `${monthStart}T00:00:00`);

  const actionsByAgent: Record<string, number> = {};
  for (const a of (actionCounts || [])) {
    actionsByAgent[a.agent_name] = (actionsByAgent[a.agent_name] || 0) + 1;
  }

  const costs = {
    month: today.substring(0, 7),
    total_cost_usd: Math.round(totalCost * 100) / 100,
    cost_by_agent: costByAgent,
    tokens_by_agent: tokensByAgent,
    actions_by_agent: actionsByAgent,
    daily_average: Math.round((totalCost / new Date().getDate()) * 100) / 100,
    projected_monthly: Math.round((totalCost / new Date().getDate() * 30) * 100) / 100,
  };

  // Ask AI for cost optimization suggestions
  const prompt = `
Analise estes custos da Diretoria IA e sugira otimizacoes:

${JSON.stringify(costs, null, 2)}

Responda em JSON:
{
  "status": "within_budget|approaching_limit|over_budget",
  "summary": "string",
  "optimizations": [{"description": "string", "estimated_savings_usd": number}],
  "alerts": ["string"]
}

Responda APENAS com o JSON.`;

  const aiResponse = await callAI(apiKey, config.system_prompt as string, prompt, config.temperature as number);
  let analysis;
  try {
    analysis = JSON.parse(aiResponse);
  } catch {
    analysis = { status: "unknown", summary: aiResponse };
  }

  return { costs, analysis };
}

// ============================================================
// Daily Report — Relatorio diario do CTO
// ============================================================
async function generateDailyReport(
  supabase: ReturnType<typeof createClient>,
  config: Record<string, unknown>,
  apiKey: string
): Promise<Record<string, unknown>> {
  // Gather all CTO-relevant data
  const healthCheck = await runHealthCheck(supabase, config, apiKey);
  const performance = await analyzePerformance(supabase, config, apiKey);
  const errors = await monitorErrors(supabase, config, apiKey);
  const costs = await analyzeCosts(supabase, config, apiKey);

  const prompt = `
Voce e o CTO Agent. Gere seu relatorio diario com base nesses dados:

HEALTH CHECK:
${JSON.stringify(healthCheck, null, 2)}

PERFORMANCE:
${JSON.stringify(performance.analysis, null, 2)}

ERROS:
${JSON.stringify(errors, null, 2)}

CUSTOS:
${JSON.stringify(costs, null, 2)}

Gere um relatorio conciso em JSON:
{
  "platform_status": "healthy|warning|critical",
  "summary": "Resumo em 3-5 frases",
  "critical_issues": ["string"],
  "improvements_made": ["string"],
  "recommendations": [{"priority": "high|medium|low", "description": "string"}],
  "cost_status": "string",
  "next_actions": ["string"]
}

Responda APENAS com o JSON.`;

  const aiResponse = await callAI(apiKey, config.system_prompt as string, prompt, config.temperature as number);
  let report;
  try {
    report = JSON.parse(aiResponse);
  } catch {
    report = { platform_status: "unknown", summary: aiResponse };
  }

  // Save daily report
  const today = new Date().toISOString().split("T")[0];
  await supabase.from("agent_daily_reports").upsert({
    agent_name: "CTO",
    report_date: today,
    report_type: "daily",
    summary: report.summary || "Relatorio tecnico gerado",
    metrics: { healthCheck, costs: costs.costs },
    decisions_made: report.improvements_made || [],
    issues_found: report.critical_issues || [],
    recommendations: report.recommendations || [],
  }, { onConflict: "agent_name,report_date,report_type" });

  // Send report to CEO
  await supabase.from("agent_messages").insert({
    from_agent: "CTO",
    to_agent: "CEO",
    message_type: "report",
    priority: report.platform_status === "critical" ? "critical" : "normal",
    subject: `Relatorio Tecnico: ${report.platform_status}`,
    payload: report,
  });

  return report;
}

// ============================================================
// Process pending tasks from CEO
// ============================================================
async function processPendingTasks(
  supabase: ReturnType<typeof createClient>,
  config: Record<string, unknown>,
  apiKey: string
): Promise<Record<string, unknown>> {
  const { data: tasks } = await supabase
    .from("agent_tasks")
    .select("*")
    .eq("assigned_to", "CTO")
    .eq("status", "pending")
    .order("priority", { ascending: false })
    .limit(5);

  if (!tasks || tasks.length === 0) {
    return { processed: 0, message: "Nenhuma tarefa pendente" };
  }

  const results = [];

  for (const task of tasks) {
    // Mark as in progress
    await supabase
      .from("agent_tasks")
      .update({ status: "in_progress", started_at: new Date().toISOString() })
      .eq("id", task.id);

    // Analyze what the task requires
    const prompt = `
Voce e o CTO Agent. Analise esta tarefa e determine o que pode ser feito:

TAREFA: ${task.title}
DESCRICAO: ${task.description || "Sem descricao adicional"}
PRIORIDADE: ${task.priority}

Com base no seu conhecimento da plataforma (React + Vite + Supabase), responda em JSON:
{
  "can_do_autonomously": true/false,
  "analysis": "sua analise da tarefa",
  "steps_needed": ["passo 1", "passo 2"],
  "estimated_complexity": "low|medium|high",
  "requires_code_changes": true/false,
  "requires_db_changes": true/false,
  "recommendation": "o que voce recomenda fazer",
  "autonomy_level": "green|yellow|red"
}

Responda APENAS com o JSON.`;

    const aiResponse = await callAI(apiKey, config.system_prompt as string, prompt, config.temperature as number);
    let analysis;
    try {
      analysis = JSON.parse(aiResponse);
    } catch {
      analysis = { can_do_autonomously: false, analysis: aiResponse, autonomy_level: "red" };
    }

    // If it's green level, mark as completed with analysis
    // If yellow/red, report back to CEO
    if (analysis.autonomy_level === "green" && analysis.can_do_autonomously) {
      await supabase
        .from("agent_tasks")
        .update({
          status: "completed",
          result: analysis,
          completed_at: new Date().toISOString(),
        })
        .eq("id", task.id);
    } else {
      // Send analysis back to CEO for decision
      await supabase.from("agent_messages").insert({
        from_agent: "CTO",
        to_agent: "CEO",
        message_type: "response",
        priority: task.priority,
        subject: `Analise da tarefa: ${task.title}`,
        payload: {
          task_id: task.id,
          analysis,
          message: `Tarefa requer nivel ${analysis.autonomy_level}. ${analysis.recommendation}`,
        },
      });

      await supabase
        .from("agent_tasks")
        .update({ status: "blocked", result: analysis })
        .eq("id", task.id);
    }

    results.push({ task_id: task.id, title: task.title, analysis });
  }

  return { processed: results.length, results };
}

// ============================================================
// Helpers
// ============================================================
async function callAI(apiKey: string, systemPrompt: string, userPrompt: string, temperature: number): Promise<string> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    throw new Error(`AI API error ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

async function logAction(
  supabase: ReturnType<typeof createClient>,
  agentName: string,
  action: string,
  result: Record<string, unknown>,
  durationMs: number
): Promise<void> {
  await supabase.from("agent_actions_log").insert({
    agent_name: agentName,
    action_type: "execution",
    action_category: "green",
    title: `${agentName}: ${action}`,
    description: `Executou: ${action}`,
    output_data: result,
    status: "completed",
    duration_ms: durationMs,
  });
}
