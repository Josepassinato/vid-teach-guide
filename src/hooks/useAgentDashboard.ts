import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface AgentConfig {
  id: string;
  agent_name: string;
  display_name: string;
  model: string;
  is_active: boolean;
  schedule_cron: string | null;
  budget_daily_usd: number;
  temperature: number;
  created_at: string;
}

export interface AgentAction {
  id: string;
  agent_name: string;
  action_type: string;
  action_category: string;
  title: string;
  description: string;
  reasoning: string | null;
  status: string;
  duration_ms: number;
  cost_usd: number;
  created_at: string;
}

export interface AgentReport {
  id: string;
  agent_name: string;
  report_date: string;
  report_type: string;
  summary: string;
  metrics: Record<string, unknown>;
  decisions_made: unknown[];
  issues_found: unknown[];
  recommendations: unknown[];
  actions_taken: number;
  cost_usd: number;
  created_at: string;
}

export interface AgentEscalation {
  id: string;
  agent_name: string;
  escalation_type: string;
  title: string;
  description: string;
  reasoning: string | null;
  options: unknown;
  selected_option: string | null;
  human_response: string | null;
  status: string;
  priority: string;
  created_at: string;
}

export interface AgentBudget {
  id: string;
  agent_name: string;
  period_start: string;
  budget_usd: number;
  spent_usd: number;
  tokens_used: number;
  actions_count: number;
  is_over_budget: boolean;
}

export interface AgentMessage {
  id: string;
  from_agent: string;
  to_agent: string;
  message_type: string;
  priority: string;
  subject: string;
  payload: Record<string, unknown>;
  status: string;
  created_at: string;
}

export interface AgentMemory {
  id: string;
  agent_name: string;
  memory_type: string;
  category: string | null;
  content: string;
  confidence: number;
  times_validated: number;
  is_active: boolean;
  created_at: string;
}

export interface DirectorateStatus {
  agents: AgentConfig[];
  todayReports: AgentReport[];
  pendingEscalations: AgentEscalation[];
  recentActions: AgentAction[];
  budgets: AgentBudget[];
  recentMessages: AgentMessage[];
  memories: AgentMemory[];
  isLoading: boolean;
  error: string | null;
}

export function useAgentDashboard() {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [todayReports, setTodayReports] = useState<AgentReport[]>([]);
  const [pendingEscalations, setPendingEscalations] = useState<AgentEscalation[]>([]);
  const [recentActions, setRecentActions] = useState<AgentAction[]>([]);
  const [budgets, setBudgets] = useState<AgentBudget[]>([]);
  const [recentMessages, setRecentMessages] = useState<AgentMessage[]>([]);
  const [memories, setMemories] = useState<AgentMemory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const today = new Date().toISOString().split('T')[0];

      const [
        agentsRes,
        reportsRes,
        escalationsRes,
        actionsRes,
        budgetsRes,
        messagesRes,
        memoriesRes,
      ] = await Promise.all([
        supabase.from('agent_config').select('*').order('agent_name'),
        supabase.from('agent_daily_reports').select('*').eq('report_date', today).order('created_at', { ascending: false }),
        supabase.from('agent_escalations').select('*').eq('status', 'pending').order('created_at', { ascending: false }),
        supabase.from('agent_actions_log').select('*').gte('created_at', `${today}T00:00:00`).order('created_at', { ascending: false }).limit(50),
        supabase.from('agent_budgets').select('*').eq('period_start', today),
        supabase.from('agent_messages').select('*').order('created_at', { ascending: false }).limit(30),
        supabase.from('agent_memory').select('*').eq('is_active', true).order('confidence', { ascending: false }).limit(20),
      ]);

      setAgents((agentsRes.data as AgentConfig[]) || []);
      setTodayReports((reportsRes.data as AgentReport[]) || []);
      setPendingEscalations((escalationsRes.data as AgentEscalation[]) || []);
      setRecentActions((actionsRes.data as AgentAction[]) || []);
      setBudgets((budgetsRes.data as AgentBudget[]) || []);
      setRecentMessages((messagesRes.data as AgentMessage[]) || []);
      setMemories((memoriesRes.data as AgentMemory[]) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dashboard');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    // Refresh every 30 seconds
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const toggleAgent = useCallback(async (agentName: string, active: boolean) => {
    try {
      const { error } = await supabase.functions.invoke('agent-orchestrator', {
        body: { action: 'kill_switch', agent_name: agentName, active },
      });
      if (error) throw error;
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao alternar agente');
    }
  }, [fetchAll]);

  const resolveEscalation = useCallback(async (escalationId: string, selectedOption: string, response: string) => {
    try {
      const { error } = await supabase.functions.invoke('agent-orchestrator', {
        body: { action: 'resolve_escalation', escalation_id: escalationId, selected_option: selectedOption, human_response: response },
      });
      if (error) throw error;
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao resolver escalacao');
    }
  }, [fetchAll]);

  const runAgent = useCallback(async (agentName: string, agentAction: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('agent-scheduler', {
        body: { action: 'run_single', agent_name: agentName, agent_action: agentAction },
      });
      if (error) throw error;
      await fetchAll();
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao executar agente');
      return null;
    }
  }, [fetchAll]);

  const runAllAgents = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('agent-scheduler', {
        body: { action: 'run_all' },
      });
      if (error) throw error;
      await fetchAll();
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao executar todos os agentes');
      return null;
    }
  }, [fetchAll]);

  const delegateTask = useCallback(async (targetAgent: string, title: string, description: string, priority: string = 'normal') => {
    try {
      const { error } = await supabase.functions.invoke('agent-orchestrator', {
        body: { action: 'delegate_task', task_title: title, task_description: description, target_agent: targetAgent, priority },
      });
      if (error) throw error;
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao delegar tarefa');
    }
  }, [fetchAll]);

  return {
    agents,
    todayReports,
    pendingEscalations,
    recentActions,
    budgets,
    recentMessages,
    memories,
    isLoading,
    error,
    refresh: fetchAll,
    toggleAgent,
    resolveEscalation,
    runAgent,
    runAllAgents,
    delegateTask,
  };
}
