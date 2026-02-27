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
    console.log(`[agent-cfo] Action: ${action}`);

    const startTime = Date.now();

    const { data: config } = await supabase
      .from("agent_config")
      .select("*")
      .eq("agent_name", "CFO")
      .eq("is_active", true)
      .single();

    if (!config) throw new Error("CFO Agent is not active");

    let result: Record<string, unknown> = {};

    switch (action) {
      case "financial_report":
        result = await generateFinancialReport(supabase, config, LOVABLE_API_KEY);
        break;
      case "cost_tracking":
        result = await trackCosts(supabase, config, LOVABLE_API_KEY);
        break;
      case "revenue_analysis":
        result = await analyzeRevenue(supabase, config, LOVABLE_API_KEY);
        break;
      case "budget_forecast":
        result = await forecastBudget(supabase, config, LOVABLE_API_KEY);
        break;
      case "daily_report":
        result = await generateDailyReport(supabase, config, LOVABLE_API_KEY);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    const duration = Date.now() - startTime;
    await supabase.from("agent_actions_log").insert({
      agent_name: "CFO",
      action_type: "analysis",
      action_category: "green",
      title: `CFO: ${action}`,
      description: `Financeiro executado: ${action}`,
      output_data: result,
      status: "completed",
      duration_ms: duration,
    });

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[agent-cfo] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function generateFinancialReport(
  supabase: ReturnType<typeof createClient>,
  config: Record<string, unknown>,
  apiKey: string
): Promise<Record<string, unknown>> {
  const today = new Date().toISOString().split("T")[0];
  const monthStart = today.substring(0, 7) + "-01";

  // AI Directorate costs
  const { data: budgets } = await supabase
    .from("agent_budgets")
    .select("agent_name, spent_usd, tokens_used, actions_count")
    .gte("period_start", monthStart);

  const aiCosts: Record<string, number> = {};
  let totalAICost = 0;
  for (const b of (budgets || [])) {
    aiCosts[b.agent_name] = (aiCosts[b.agent_name] || 0) + b.spent_usd;
    totalAICost += b.spent_usd;
  }

  // Platform metrics (proxy for revenue potential)
  const { count: totalStudents } = await supabase
    .from("student_profiles")
    .select("id", { count: "exact", head: true });

  const { count: activeStudents } = await supabase
    .from("student_lesson_progress")
    .select("student_id", { count: "exact", head: true })
    .gte("updated_at", `${monthStart}T00:00:00`);

  const { count: certificatesIssued } = await supabase
    .from("certificates")
    .select("id", { count: "exact", head: true })
    .gte("created_at", `${monthStart}T00:00:00`);

  // Estimated infrastructure costs
  const infraCosts = {
    supabase_estimate: 25.00, // Pro plan estimate
    ai_apis: totalAICost,
    hosting_estimate: 20.00, // Vercel/Netlify
    domain_monthly: 1.50,
    total_estimated: 25.00 + totalAICost + 20.00 + 1.50,
  };

  const financials = {
    period: today.substring(0, 7),
    students: {
      total: totalStudents || 0,
      active_this_month: activeStudents || 0,
      certificates_issued: certificatesIssued || 0,
    },
    costs: {
      ai_directorate: aiCosts,
      ai_directorate_total: Math.round(totalAICost * 100) / 100,
      infrastructure: infraCosts,
      total_monthly_cost: Math.round(infraCosts.total_estimated * 100) / 100,
    },
    unit_economics: {
      cost_per_student: (totalStudents || 0) > 0
        ? Math.round((infraCosts.total_estimated / (totalStudents || 1)) * 100) / 100
        : 0,
      cost_per_active_student: (activeStudents || 0) > 0
        ? Math.round((infraCosts.total_estimated / (activeStudents || 1)) * 100) / 100
        : 0,
    },
  };

  const prompt = `
Analise este relatorio financeiro e gere insights:

${JSON.stringify(financials, null, 2)}

Gere JSON:
{
  "financial_health": "healthy|attention|critical",
  "summary": "Resumo em 3-5 frases",
  "cost_breakdown_pct": {"ai": number, "infrastructure": number, "hosting": number},
  "optimization_opportunities": [{"description": "string", "potential_savings_usd": number}],
  "alerts": ["string"],
  "pricing_suggestions": [{"plan": "string", "price_brl": number, "justification": "string"}],
  "projections": {"next_month_cost_usd": number, "breakeven_students": number}
}

Responda APENAS com o JSON.`;

  const aiResponse = await callAI(apiKey, config.system_prompt as string, prompt, config.temperature as number);
  let analysis;
  try { analysis = JSON.parse(aiResponse); } catch { analysis = { financial_health: "unknown", summary: aiResponse }; }

  return { financials, analysis };
}

async function trackCosts(
  supabase: ReturnType<typeof createClient>,
  _config: Record<string, unknown>,
  _apiKey: string
): Promise<Record<string, unknown>> {
  const today = new Date().toISOString().split("T")[0];

  // Get today's costs
  const { data: todayBudgets } = await supabase
    .from("agent_budgets")
    .select("*")
    .eq("period_start", today);

  // Get agent configs for budget limits
  const { data: configs } = await supabase
    .from("agent_config")
    .select("agent_name, budget_daily_usd, is_active");

  const costTracking = (configs || []).map((c: Record<string, unknown>) => {
    const budget = (todayBudgets || []).find((b: Record<string, string>) => b.agent_name === c.agent_name);
    return {
      agent: c.agent_name,
      is_active: c.is_active,
      daily_budget: c.budget_daily_usd,
      spent_today: budget?.spent_usd || 0,
      remaining: (c.budget_daily_usd as number) - (budget?.spent_usd || 0),
      usage_pct: budget ? Math.round((budget.spent_usd / (c.budget_daily_usd as number)) * 100) : 0,
      actions_today: budget?.actions_count || 0,
      is_over_budget: budget?.is_over_budget || false,
    };
  });

  const totalSpent = costTracking.reduce((s: number, c: Record<string, number>) => s + (c.spent_today as number), 0);
  const totalBudget = costTracking.reduce((s: number, c: Record<string, number>) => s + (c.daily_budget as number), 0);

  // Alert if any agent is over 80% of daily budget
  const overBudgetAgents = costTracking.filter((c: Record<string, number>) => (c.usage_pct as number) > 80);
  if (overBudgetAgents.length > 0) {
    await supabase.from("agent_messages").insert({
      from_agent: "CFO",
      to_agent: "CEO",
      message_type: "alert",
      priority: "high",
      subject: `${overBudgetAgents.length} agentes perto do limite de orcamento`,
      payload: { over_budget: overBudgetAgents },
    });
  }

  return {
    date: today,
    agents: costTracking,
    totals: {
      spent: Math.round(totalSpent * 100) / 100,
      budget: totalBudget,
      remaining: Math.round((totalBudget - totalSpent) * 100) / 100,
      usage_pct: Math.round((totalSpent / totalBudget) * 100),
    },
    alerts: overBudgetAgents,
  };
}

async function analyzeRevenue(
  supabase: ReturnType<typeof createClient>,
  config: Record<string, unknown>,
  apiKey: string
): Promise<Record<string, unknown>> {
  // Since payment system isn't implemented yet, analyze potential revenue
  const { data: students } = await supabase
    .from("student_profiles")
    .select("student_id, total_study_time_minutes, last_seen_at");

  const { data: achievements } = await supabase
    .from("student_achievements")
    .select("student_id, level, missions_completed");

  const { data: certificates } = await supabase
    .from("certificates")
    .select("student_id, certificate_type");

  const prompt = `
Analise o potencial de receita desta plataforma educacional:

ALUNOS: ${(students || []).length} total
NIVEIS DE ENGAJAMENTO:
- Com certificados: ${(certificates || []).length}
- Missoes completadas: ${(achievements || []).reduce((s: number, a: Record<string, number>) => s + a.missions_completed, 0)}
- Tempo total de estudo: ${(students || []).reduce((s: number, p: Record<string, number>) => s + (p.total_study_time_minutes || 0), 0)} minutos

Sugira estrategia de monetizacao em JSON:
{
  "revenue_potential": {
    "freemium_model": {"free_tier": "string", "paid_tier": "string", "price_brl": number, "projected_conversion_pct": number},
    "subscription_model": {"monthly_brl": number, "annual_brl": number, "projected_subscribers": number},
    "one_time_model": {"course_price_brl": number, "certificate_price_brl": number}
  },
  "recommended_model": "freemium|subscription|one_time|hybrid",
  "justification": "string",
  "projected_mrr_brl": number,
  "implementation_priority": ["string"]
}

Responda APENAS com o JSON.`;

  const aiResponse = await callAI(apiKey, config.system_prompt as string, prompt, config.temperature as number);
  let revenue;
  try { revenue = JSON.parse(aiResponse); } catch { revenue = { raw: aiResponse }; }

  return { students_count: (students || []).length, revenue };
}

async function forecastBudget(
  supabase: ReturnType<typeof createClient>,
  config: Record<string, unknown>,
  apiKey: string
): Promise<Record<string, unknown>> {
  // Get historical spending
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const { data: historicalBudgets } = await supabase
    .from("agent_budgets")
    .select("agent_name, spent_usd, period_start, actions_count")
    .gte("period_start", thirtyDaysAgo)
    .order("period_start", { ascending: true });

  const dailySpending = (historicalBudgets || []).reduce((acc: Record<string, number>, b: Record<string, unknown>) => {
    const date = b.period_start as string;
    acc[date] = (acc[date] || 0) + (b.spent_usd as number);
    return acc;
  }, {});

  const prompt = `
Projete o orcamento para os proximos 30/60/90 dias:

GASTOS DIARIOS (historico):
${JSON.stringify(dailySpending, null, 2)}

GASTOS POR AGENTE (mes atual):
${JSON.stringify(historicalBudgets, null, 2)}

Gere projecao em JSON:
{
  "current_daily_average": number,
  "trend": "increasing|stable|decreasing",
  "forecast_30_days_usd": number,
  "forecast_60_days_usd": number,
  "forecast_90_days_usd": number,
  "recommendations": ["string"],
  "budget_adjustments": [{"agent": "string", "current_daily": number, "recommended_daily": number, "reason": "string"}]
}

Responda APENAS com o JSON.`;

  const aiResponse = await callAI(apiKey, config.system_prompt as string, prompt, config.temperature as number);
  let forecast;
  try { forecast = JSON.parse(aiResponse); } catch { forecast = { raw: aiResponse }; }

  return { historical: dailySpending, forecast };
}

async function generateDailyReport(
  supabase: ReturnType<typeof createClient>,
  config: Record<string, unknown>,
  apiKey: string
): Promise<Record<string, unknown>> {
  const financial = await generateFinancialReport(supabase, config, apiKey);
  const costs = await trackCosts(supabase, config, apiKey);

  const today = new Date().toISOString().split("T")[0];
  const report = {
    summary: `Custos do dia: $${(costs.totals as Record<string, number>).spent}/${(costs.totals as Record<string, number>).budget}. ${(financial.analysis as Record<string, string>)?.financial_health || "Status analisado"}.`,
    costs_today: costs.totals,
    financial_health: (financial.analysis as Record<string, string>)?.financial_health || "unknown",
    alerts: costs.alerts,
  };

  await supabase.from("agent_daily_reports").upsert({
    agent_name: "CFO",
    report_date: today,
    report_type: "daily",
    summary: report.summary,
    metrics: costs.totals as Record<string, unknown>,
    issues_found: (costs.alerts as unknown[]) || [],
  }, { onConflict: "agent_name,report_date,report_type" });

  await supabase.from("agent_messages").insert({
    from_agent: "CFO",
    to_agent: "CEO",
    message_type: "report",
    priority: (costs.alerts as unknown[])?.length > 0 ? "high" : "normal",
    subject: `Relatorio Financeiro: ${report.financial_health}`,
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
