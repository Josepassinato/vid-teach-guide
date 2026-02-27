import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AgentReport {
  agent_name: string;
  summary: string;
  metrics: Record<string, unknown>;
  decisions_made: unknown[];
  issues_found: unknown[];
  recommendations: unknown[];
}

interface AgentMessage {
  from_agent: string;
  to_agent: string;
  message_type: string;
  priority: string;
  subject: string;
  payload: Record<string, unknown>;
}

interface CEODecision {
  decision: string;
  reasoning: string;
  delegations: Array<{
    to_agent: string;
    task: string;
    priority: string;
  }>;
  escalations: Array<{
    title: string;
    description: string;
    options: string[];
  }>;
}

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
    console.log(`[agent-orchestrator] Action: ${action}`);

    const startTime = Date.now();

    // Load CEO config
    const { data: ceoConfig } = await supabase
      .from("agent_config")
      .select("*")
      .eq("agent_name", "CEO")
      .eq("is_active", true)
      .single();

    if (!ceoConfig) {
      throw new Error("CEO Agent is not active or not configured");
    }

    // Check budget
    const today = new Date().toISOString().split("T")[0];
    const { data: budget } = await supabase
      .from("agent_budgets")
      .select("*")
      .eq("agent_name", "CEO")
      .eq("period_start", today)
      .single();

    if (budget && budget.is_over_budget) {
      throw new Error("CEO Agent budget exceeded for today");
    }

    let result: Record<string, unknown> = {};

    switch (action) {
      case "daily_consolidation": {
        result = await runDailyConsolidation(supabase, ceoConfig, LOVABLE_API_KEY);
        break;
      }
      case "process_messages": {
        result = await processIncomingMessages(supabase, ceoConfig, LOVABLE_API_KEY);
        break;
      }
      case "delegate_task": {
        const { task_title, task_description, target_agent, priority } = await req.json();
        result = await delegateTask(supabase, target_agent, task_title, task_description, priority);
        break;
      }
      case "resolve_escalation": {
        const { escalation_id, selected_option, human_response } = await req.json();
        result = await resolveEscalation(supabase, escalation_id, selected_option, human_response);
        break;
      }
      case "get_status": {
        result = await getDirectorateStatus(supabase);
        break;
      }
      case "kill_switch": {
        const { agent_name: targetAgent, active } = await req.json();
        result = await toggleAgent(supabase, targetAgent, active);
        break;
      }
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    // Log the action
    const duration = Date.now() - startTime;
    await supabase.from("agent_actions_log").insert({
      agent_name: "CEO",
      action_type: "execution",
      action_category: "green",
      title: `CEO: ${action}`,
      description: `Executou acao: ${action}`,
      output_data: result,
      status: "completed",
      duration_ms: duration,
    });

    // Update budget tracking
    await updateBudget(supabase, "CEO", 0, duration);

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[agent-orchestrator] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ============================================================
// Daily Consolidation — The CEO's main job
// ============================================================
async function runDailyConsolidation(
  supabase: ReturnType<typeof createClient>,
  config: Record<string, unknown>,
  apiKey: string
): Promise<Record<string, unknown>> {
  const today = new Date().toISOString().split("T")[0];

  // 1. Collect reports from all agents
  const { data: reports } = await supabase
    .from("agent_daily_reports")
    .select("*")
    .eq("report_date", today)
    .order("created_at", { ascending: true });

  // 2. Collect pending messages
  const { data: pendingMessages } = await supabase
    .from("agent_messages")
    .select("*")
    .eq("to_agent", "CEO")
    .eq("status", "pending")
    .order("priority", { ascending: false });

  // 3. Collect pending escalations
  const { data: pendingEscalations } = await supabase
    .from("agent_escalations")
    .select("*")
    .eq("status", "pending")
    .order("priority", { ascending: false });

  // 4. Collect today's actions across all agents
  const { data: todayActions } = await supabase
    .from("agent_actions_log")
    .select("agent_name, action_type, title, status, action_category")
    .gte("created_at", `${today}T00:00:00`)
    .order("created_at", { ascending: true });

  // 5. Get key platform metrics
  const metrics = await gatherPlatformMetrics(supabase);

  // 6. Ask AI to consolidate everything
  const consolidationPrompt = `
Voce e o CEO Agent. Consolide as seguintes informacoes do dia e gere um relatorio executivo.

RELATORIOS DOS AGENTES HOJE:
${JSON.stringify(reports || [], null, 2)}

MENSAGENS PENDENTES PARA VOCE:
${JSON.stringify(pendingMessages || [], null, 2)}

ESCALACOES PENDENTES:
${JSON.stringify(pendingEscalations || [], null, 2)}

ACOES EXECUTADAS HOJE (todos os agentes):
${JSON.stringify(todayActions || [], null, 2)}

METRICAS DA PLATAFORMA:
${JSON.stringify(metrics, null, 2)}

GERE UM JSON com esta estrutura:
{
  "executive_summary": "Resumo executivo do dia em 3-5 frases",
  "platform_health": "healthy|warning|critical",
  "key_metrics": {
    "active_students_today": number,
    "total_students": number,
    "lessons_completed_today": number,
    "quizzes_passed_today": number,
    "engagement_score": number (0-100)
  },
  "decisions_made": [
    {
      "decision": "descricao da decisao",
      "reasoning": "por que tomou essa decisao",
      "delegated_to": "agente responsavel"
    }
  ],
  "issues_identified": [
    {
      "severity": "low|medium|high|critical",
      "description": "descricao do problema",
      "suggested_action": "acao sugerida"
    }
  ],
  "tomorrow_priorities": [
    {
      "priority": "high|medium|low",
      "task": "descricao da tarefa",
      "assigned_to": "agente"
    }
  ],
  "needs_human_approval": [
    {
      "title": "titulo",
      "description": "descricao",
      "options": ["opcao 1", "opcao 2"]
    }
  ]
}

Responda APENAS com o JSON, sem markdown.`;

  const aiResponse = await callAI(apiKey, config.system_prompt as string, consolidationPrompt, config.temperature as number);

  let consolidation: Record<string, unknown>;
  try {
    consolidation = JSON.parse(aiResponse);
  } catch {
    consolidation = {
      executive_summary: aiResponse,
      platform_health: "warning",
      key_metrics: metrics,
      decisions_made: [],
      issues_identified: [],
      tomorrow_priorities: [],
      needs_human_approval: [],
    };
  }

  // 7. Save CEO daily report
  await supabase.from("agent_daily_reports").upsert({
    agent_name: "CEO",
    report_date: today,
    report_type: "daily",
    summary: (consolidation.executive_summary as string) || "Relatorio consolidado gerado",
    metrics: consolidation.key_metrics || {},
    decisions_made: consolidation.decisions_made || [],
    issues_found: consolidation.issues_identified || [],
    recommendations: consolidation.tomorrow_priorities || [],
  }, { onConflict: "agent_name,report_date,report_type" });

  // 8. Create escalations for items needing human approval
  const needsApproval = (consolidation.needs_human_approval as Array<Record<string, unknown>>) || [];
  for (const item of needsApproval) {
    await supabase.from("agent_escalations").insert({
      agent_name: "CEO",
      escalation_type: "approval_needed",
      title: item.title as string,
      description: item.description as string,
      options: item.options,
      priority: "high",
    });
  }

  // 9. Delegate tomorrow's tasks
  const priorities = (consolidation.tomorrow_priorities as Array<Record<string, unknown>>) || [];
  for (const task of priorities) {
    await supabase.from("agent_tasks").insert({
      assigned_by: "CEO",
      assigned_to: task.assigned_to as string,
      title: task.task as string,
      priority: task.priority as string,
      task_type: "action",
    });
  }

  // 10. Mark messages as acted upon
  if (pendingMessages && pendingMessages.length > 0) {
    const messageIds = pendingMessages.map((m: Record<string, unknown>) => m.id);
    await supabase
      .from("agent_messages")
      .update({ status: "acted_upon", acted_at: new Date().toISOString() })
      .in("id", messageIds);
  }

  return consolidation;
}

// ============================================================
// Process incoming messages from other agents
// ============================================================
async function processIncomingMessages(
  supabase: ReturnType<typeof createClient>,
  config: Record<string, unknown>,
  apiKey: string
): Promise<Record<string, unknown>> {
  const { data: messages } = await supabase
    .from("agent_messages")
    .select("*")
    .eq("to_agent", "CEO")
    .eq("status", "pending")
    .order("priority", { ascending: false })
    .limit(10);

  if (!messages || messages.length === 0) {
    return { processed: 0, message: "Nenhuma mensagem pendente" };
  }

  const prompt = `
Voce e o CEO Agent. Analise estas mensagens dos outros agentes e decida como agir.

MENSAGENS:
${JSON.stringify(messages, null, 2)}

Para cada mensagem, decida:
1. Se precisa delegar alguma tarefa
2. Se precisa escalar para o fundador
3. Se pode resolver automaticamente

Responda em JSON:
{
  "responses": [
    {
      "message_id": "uuid",
      "action": "delegate|escalate|resolve|acknowledge",
      "response": "sua resposta",
      "delegate_to": "agente (se aplicavel)",
      "task_description": "descricao (se delegando)"
    }
  ]
}

Responda APENAS com o JSON.`;

  const aiResponse = await callAI(apiKey, config.system_prompt as string, prompt, config.temperature as number);

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(aiResponse);
  } catch {
    parsed = { responses: [] };
  }

  const responses = (parsed.responses as Array<Record<string, unknown>>) || [];
  for (const resp of responses) {
    // Update message status
    await supabase
      .from("agent_messages")
      .update({
        status: "acted_upon",
        response_data: resp,
        acted_at: new Date().toISOString(),
      })
      .eq("id", resp.message_id);

    // Delegate if needed
    if (resp.action === "delegate" && resp.delegate_to) {
      await supabase.from("agent_tasks").insert({
        assigned_by: "CEO",
        assigned_to: resp.delegate_to as string,
        title: resp.task_description as string || resp.response as string,
        priority: "normal",
        task_type: "action",
      });
    }

    // Escalate if needed
    if (resp.action === "escalate") {
      await supabase.from("agent_escalations").insert({
        agent_name: "CEO",
        escalation_type: "strategic_decision",
        title: `Escalacao: ${resp.response}`,
        description: JSON.stringify(resp),
        priority: "high",
      });
    }
  }

  return { processed: responses.length, responses };
}

// ============================================================
// Delegate task to specific agent
// ============================================================
async function delegateTask(
  supabase: ReturnType<typeof createClient>,
  targetAgent: string,
  title: string,
  description: string,
  priority: string = "normal"
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.from("agent_tasks").insert({
    assigned_by: "CEO",
    assigned_to: targetAgent,
    title,
    description,
    priority,
    task_type: "action",
  }).select().single();

  if (error) throw error;

  // Also send a message to the agent
  await supabase.from("agent_messages").insert({
    from_agent: "CEO",
    to_agent: targetAgent,
    message_type: "task",
    priority,
    subject: `Nova tarefa: ${title}`,
    payload: { task_id: data.id, title, description },
  });

  return { task: data };
}

// ============================================================
// Resolve human escalation
// ============================================================
async function resolveEscalation(
  supabase: ReturnType<typeof createClient>,
  escalationId: string,
  selectedOption: string,
  humanResponse: string
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from("agent_escalations")
    .update({
      status: selectedOption === "rejected" ? "rejected" : "approved",
      selected_option: selectedOption,
      human_response: humanResponse,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", escalationId)
    .select()
    .single();

  if (error) throw error;

  // Log the human decision
  await supabase.from("agent_actions_log").insert({
    agent_name: "HUMAN",
    action_type: "decision",
    action_category: "red",
    title: `Decisao humana: ${data.title}`,
    description: `Opcao selecionada: ${selectedOption}. Resposta: ${humanResponse}`,
    output_data: data,
    status: "completed",
  });

  // Store in CEO memory
  await supabase.from("agent_memory").insert({
    agent_name: "CEO",
    memory_type: "feedback",
    category: "human_decisions",
    content: `Fundador ${selectedOption === "rejected" ? "rejeitou" : "aprovou"}: ${data.title}. Resposta: ${humanResponse}`,
    confidence: 1.0,
  });

  return { escalation: data };
}

// ============================================================
// Get full directorate status
// ============================================================
async function getDirectorateStatus(
  supabase: ReturnType<typeof createClient>
): Promise<Record<string, unknown>> {
  const today = new Date().toISOString().split("T")[0];

  const [configs, todayReports, pendingEscalations, pendingTasks, todayActions, budgets] = await Promise.all([
    supabase.from("agent_config").select("agent_name, display_name, is_active, schedule_cron, budget_daily_usd"),
    supabase.from("agent_daily_reports").select("*").eq("report_date", today),
    supabase.from("agent_escalations").select("*").eq("status", "pending"),
    supabase.from("agent_tasks").select("*").in("status", ["pending", "in_progress"]),
    supabase.from("agent_actions_log").select("agent_name, action_type, status").gte("created_at", `${today}T00:00:00`),
    supabase.from("agent_budgets").select("*").eq("period_start", today),
  ]);

  const metrics = await gatherPlatformMetrics(supabase);

  return {
    agents: configs.data || [],
    today_reports: todayReports.data || [],
    pending_escalations: pendingEscalations.data || [],
    pending_tasks: pendingTasks.data || [],
    today_actions_count: (todayActions.data || []).length,
    actions_by_agent: groupBy(todayActions.data || [], "agent_name"),
    budgets: budgets.data || [],
    platform_metrics: metrics,
  };
}

// ============================================================
// Kill switch — toggle agent on/off
// ============================================================
async function toggleAgent(
  supabase: ReturnType<typeof createClient>,
  agentName: string,
  active: boolean
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from("agent_config")
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq("agent_name", agentName)
    .select()
    .single();

  if (error) throw error;

  // Log the action
  await supabase.from("agent_actions_log").insert({
    agent_name: "CEO",
    action_type: "execution",
    action_category: "yellow",
    title: `Kill switch: ${agentName} ${active ? "ATIVADO" : "DESATIVADO"}`,
    description: `Agente ${agentName} foi ${active ? "ativado" : "desativado"} pelo sistema`,
    status: "completed",
  });

  return { agent: data, message: `${agentName} ${active ? "ativado" : "desativado"} com sucesso` };
}

// ============================================================
// Gather platform metrics from existing tables
// ============================================================
async function gatherPlatformMetrics(
  supabase: ReturnType<typeof createClient>
): Promise<Record<string, unknown>> {
  const today = new Date().toISOString().split("T")[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const [
    totalStudents,
    activeToday,
    activeThisWeek,
    lessonsCompletedToday,
    quizzesToday,
    missionsToday,
    totalVideos,
    totalModules,
    certificates,
    achievements,
  ] = await Promise.all([
    supabase.from("student_profiles").select("id", { count: "exact", head: true }),
    supabase.from("student_lesson_progress").select("student_id", { count: "exact", head: true }).gte("updated_at", `${today}T00:00:00`),
    supabase.from("student_lesson_progress").select("student_id", { count: "exact", head: true }).gte("updated_at", `${weekAgo}T00:00:00`),
    supabase.from("student_lesson_progress").select("id", { count: "exact", head: true }).gte("completed_at", `${today}T00:00:00`),
    supabase.from("student_quiz_results").select("id", { count: "exact", head: true }).gte("completed_at", `${today}T00:00:00`),
    supabase.from("student_mission_submissions").select("id", { count: "exact", head: true }).gte("submitted_at", `${today}T00:00:00`),
    supabase.from("videos").select("id", { count: "exact", head: true }),
    supabase.from("modules").select("id", { count: "exact", head: true }),
    supabase.from("certificates").select("id", { count: "exact", head: true }),
    supabase.from("student_achievements").select("total_points, level, current_streak"),
  ]);

  const achievementData = achievements.data || [];
  const avgPoints = achievementData.length > 0
    ? achievementData.reduce((sum: number, a: Record<string, number>) => sum + (a.total_points || 0), 0) / achievementData.length
    : 0;
  const avgLevel = achievementData.length > 0
    ? achievementData.reduce((sum: number, a: Record<string, number>) => sum + (a.level || 0), 0) / achievementData.length
    : 0;

  return {
    total_students: totalStudents.count || 0,
    active_students_today: activeToday.count || 0,
    active_students_week: activeThisWeek.count || 0,
    lessons_completed_today: lessonsCompletedToday.count || 0,
    quizzes_taken_today: quizzesToday.count || 0,
    missions_submitted_today: missionsToday.count || 0,
    total_videos: totalVideos.count || 0,
    total_modules: totalModules.count || 0,
    total_certificates: certificates.count || 0,
    avg_student_points: Math.round(avgPoints),
    avg_student_level: Math.round(avgLevel * 10) / 10,
    active_streaks: achievementData.filter((a: Record<string, number>) => (a.current_streak || 0) > 0).length,
  };
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
    const errorText = await response.text();
    throw new Error(`AI API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

function groupBy(arr: Array<Record<string, unknown>>, key: string): Record<string, number> {
  return arr.reduce((acc: Record<string, number>, item) => {
    const k = item[key] as string;
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
}

async function updateBudget(
  supabase: ReturnType<typeof createClient>,
  agentName: string,
  tokensUsed: number,
  durationMs: number
): Promise<void> {
  const today = new Date().toISOString().split("T")[0];
  const estimatedCost = tokensUsed * 0.000001; // rough estimate

  const { data: existing } = await supabase
    .from("agent_budgets")
    .select("*")
    .eq("agent_name", agentName)
    .eq("period_start", today)
    .single();

  if (existing) {
    await supabase
      .from("agent_budgets")
      .update({
        spent_usd: existing.spent_usd + estimatedCost,
        tokens_used: existing.tokens_used + tokensUsed,
        actions_count: existing.actions_count + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    // Get budget limit from config
    const { data: config } = await supabase
      .from("agent_config")
      .select("budget_daily_usd")
      .eq("agent_name", agentName)
      .single();

    await supabase.from("agent_budgets").insert({
      agent_name: agentName,
      period_start: today,
      period_end: today,
      budget_usd: config?.budget_daily_usd || 5.00,
      spent_usd: estimatedCost,
      tokens_used: tokensUsed,
      actions_count: 1,
    });
  }
}
