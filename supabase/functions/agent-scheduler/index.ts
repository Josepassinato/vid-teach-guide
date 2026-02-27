import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Agent execution schedule (order matters — data flows bottom-up to CEO)
const AGENT_SCHEDULE = [
  { agent: "CPO", function: "agent-cpo", action: "daily_report", order: 1 },
  { agent: "CSO", function: "agent-cso", action: "daily_report", order: 2 },
  { agent: "CMO", function: "agent-cmo", action: "daily_report", order: 3 },
  { agent: "CTO", function: "agent-cto", action: "daily_report", order: 4 },
  { agent: "CFO", function: "agent-cfo", action: "daily_report", order: 5 },
  { agent: "CEO", function: "agent-orchestrator", action: "daily_consolidation", order: 6 },
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    const action = body.action || "run_all";
    console.log(`[agent-scheduler] Action: ${action}`);

    let result: Record<string, unknown> = {};

    switch (action) {
      case "run_all": {
        result = await runAllAgents(supabase, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        break;
      }
      case "run_single": {
        const { agent_name, agent_action } = body;
        result = await runSingleAgent(supabase, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, agent_name, agent_action);
        break;
      }
      case "run_sequence": {
        const { agents } = body;
        result = await runAgentSequence(supabase, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, agents);
        break;
      }
      case "status": {
        result = await getSchedulerStatus(supabase);
        break;
      }
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[agent-scheduler] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function runAllAgents(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<Record<string, unknown>> {
  const results: Array<Record<string, unknown>> = [];
  const startTime = Date.now();

  // Log scheduler start
  await supabase.from("agent_actions_log").insert({
    agent_name: "SCHEDULER",
    action_type: "execution",
    action_category: "green",
    title: "Scheduler: Execucao diaria completa",
    description: "Iniciando execucao sequencial de todos os agentes",
    status: "completed",
  });

  // Get active agents
  const { data: activeConfigs } = await supabase
    .from("agent_config")
    .select("agent_name, is_active")
    .eq("is_active", true);

  const activeAgents = new Set((activeConfigs || []).map((c: Record<string, string>) => c.agent_name));

  // Run agents in order
  for (const schedule of AGENT_SCHEDULE) {
    if (!activeAgents.has(schedule.agent)) {
      results.push({
        agent: schedule.agent,
        status: "skipped",
        reason: "Agent is not active",
      });
      continue;
    }

    // Check budget before running
    const canRun = await checkBudget(supabase, schedule.agent);
    if (!canRun) {
      results.push({
        agent: schedule.agent,
        status: "skipped",
        reason: "Budget exceeded",
      });

      // Notify CEO about budget issue
      await supabase.from("agent_messages").insert({
        from_agent: "SCHEDULER",
        to_agent: "CEO",
        message_type: "alert",
        priority: "high",
        subject: `${schedule.agent} nao executou: orcamento excedido`,
        payload: { agent: schedule.agent, reason: "budget_exceeded" },
      });
      continue;
    }

    try {
      const agentStart = Date.now();

      // Call the agent's edge function
      const response = await fetch(`${supabaseUrl}/functions/v1/${schedule.function}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: schedule.action }),
      });

      const agentResult = await response.json();
      const agentDuration = Date.now() - agentStart;

      results.push({
        agent: schedule.agent,
        status: response.ok ? "completed" : "failed",
        duration_ms: agentDuration,
        result: response.ok ? "OK" : agentResult.error,
      });

      console.log(`[agent-scheduler] ${schedule.agent}: ${response.ok ? "OK" : "FAILED"} (${agentDuration}ms)`);

      // Small delay between agents to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      results.push({
        agent: schedule.agent,
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      });

      console.error(`[agent-scheduler] ${schedule.agent} error:`, error);
    }
  }

  const totalDuration = Date.now() - startTime;

  // Log scheduler completion
  await supabase.from("agent_actions_log").insert({
    agent_name: "SCHEDULER",
    action_type: "execution",
    action_category: "green",
    title: "Scheduler: Execucao completa",
    description: `Todos os agentes executados em ${totalDuration}ms`,
    output_data: { results, total_duration_ms: totalDuration },
    status: "completed",
    duration_ms: totalDuration,
  });

  return {
    total_agents: AGENT_SCHEDULE.length,
    completed: results.filter(r => r.status === "completed").length,
    failed: results.filter(r => r.status === "failed" || r.status === "error").length,
    skipped: results.filter(r => r.status === "skipped").length,
    total_duration_ms: totalDuration,
    results,
  };
}

async function runSingleAgent(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceRoleKey: string,
  agentName: string,
  agentAction: string
): Promise<Record<string, unknown>> {
  const schedule = AGENT_SCHEDULE.find(s => s.agent === agentName);
  if (!schedule) {
    // Allow custom agent/action combos
    const functionMap: Record<string, string> = {
      CEO: "agent-orchestrator",
      CTO: "agent-cto",
      CPO: "agent-cpo",
      CMO: "agent-cmo",
      CFO: "agent-cfo",
      CSO: "agent-cso",
    };

    const functionName = functionMap[agentName];
    if (!functionName) throw new Error(`Unknown agent: ${agentName}`);

    const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: agentAction }),
    });

    return await response.json();
  }

  // Check if active
  const { data: config } = await supabase
    .from("agent_config")
    .select("is_active")
    .eq("agent_name", agentName)
    .single();

  if (!config?.is_active) throw new Error(`Agent ${agentName} is not active`);

  const response = await fetch(`${supabaseUrl}/functions/v1/${schedule.function}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: agentAction || schedule.action }),
  });

  return await response.json();
}

async function runAgentSequence(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceRoleKey: string,
  agents: Array<{ agent: string; action: string }>
): Promise<Record<string, unknown>> {
  const results = [];

  for (const { agent, action } of agents) {
    const result = await runSingleAgent(supabase, supabaseUrl, serviceRoleKey, agent, action);
    results.push({ agent, action, result });
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return { sequence: results };
}

async function getSchedulerStatus(
  supabase: ReturnType<typeof createClient>
): Promise<Record<string, unknown>> {
  const today = new Date().toISOString().split("T")[0];

  // Get today's scheduler runs
  const { data: schedulerActions } = await supabase
    .from("agent_actions_log")
    .select("*")
    .eq("agent_name", "SCHEDULER")
    .gte("created_at", `${today}T00:00:00`)
    .order("created_at", { ascending: false });

  // Get agent configs
  const { data: configs } = await supabase
    .from("agent_config")
    .select("agent_name, display_name, is_active, schedule_cron, budget_daily_usd");

  // Get today's reports
  const { data: reports } = await supabase
    .from("agent_daily_reports")
    .select("agent_name, report_type, summary, created_at")
    .eq("report_date", today);

  // Get pending escalations
  const { data: escalations } = await supabase
    .from("agent_escalations")
    .select("*")
    .eq("status", "pending");

  return {
    scheduler_runs_today: (schedulerActions || []).length,
    last_run: schedulerActions?.[0]?.created_at || null,
    agents: configs || [],
    reports_today: reports || [],
    pending_escalations: escalations || [],
    schedule: AGENT_SCHEDULE,
  };
}

async function checkBudget(
  supabase: ReturnType<typeof createClient>,
  agentName: string
): Promise<boolean> {
  const today = new Date().toISOString().split("T")[0];

  const { data: budget } = await supabase
    .from("agent_budgets")
    .select("spent_usd, is_over_budget")
    .eq("agent_name", agentName)
    .eq("period_start", today)
    .single();

  if (!budget) return true; // No budget record yet = OK to run
  return !budget.is_over_budget;
}
