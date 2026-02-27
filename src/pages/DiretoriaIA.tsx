import { useState } from 'react';
import { useAgentDashboard, AgentConfig, AgentEscalation } from '@/hooks/useAgentDashboard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Bot, Brain, TrendingUp, Megaphone, DollarSign, Heart,
  Play, RefreshCw, AlertTriangle, CheckCircle, Clock, Zap,
  Shield, MessageSquare, BarChart3, Settings, Send, Power,
  XCircle, ArrowRight, Activity
} from 'lucide-react';
import { toast } from 'sonner';

const AGENT_ICONS: Record<string, React.ElementType> = {
  CEO: Brain,
  CTO: Bot,
  CPO: BarChart3,
  CMO: Megaphone,
  CFO: DollarSign,
  CSO: Heart,
};

const AGENT_COLORS: Record<string, string> = {
  CEO: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  CTO: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  CPO: 'bg-green-500/10 text-green-500 border-green-500/20',
  CMO: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  CFO: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  CSO: 'bg-pink-500/10 text-pink-500 border-pink-500/20',
};

const AGENT_ACTIONS: Record<string, Array<{ label: string; value: string }>> = {
  CEO: [
    { label: 'Consolidacao Diaria', value: 'daily_consolidation' },
    { label: 'Processar Mensagens', value: 'process_messages' },
    { label: 'Status Geral', value: 'get_status' },
  ],
  CTO: [
    { label: 'Health Check', value: 'health_check' },
    { label: 'Analisar Performance', value: 'analyze_performance' },
    { label: 'Monitorar Erros', value: 'monitor_errors' },
    { label: 'Analise de Custos', value: 'cost_analysis' },
    { label: 'Relatorio Diario', value: 'daily_report' },
    { label: 'Processar Tarefas', value: 'process_tasks' },
  ],
  CPO: [
    { label: 'Analisar Engajamento', value: 'analyze_engagement' },
    { label: 'Detectar Alunos em Risco', value: 'detect_at_risk_students' },
    { label: 'Performance de Quizzes', value: 'analyze_quiz_performance' },
    { label: 'Efetividade do Conteudo', value: 'content_effectiveness' },
    { label: 'Relatorio Diario', value: 'daily_report' },
  ],
  CMO: [
    { label: 'Gerar Conteudo Social', value: 'generate_social_content' },
    { label: 'Campanha de Email', value: 'generate_email_campaign' },
    { label: 'Analise SEO', value: 'seo_analysis' },
    { label: 'Calendario de Conteudo', value: 'content_calendar' },
    { label: 'Relatorio Diario', value: 'daily_report' },
  ],
  CFO: [
    { label: 'Relatorio Financeiro', value: 'financial_report' },
    { label: 'Rastrear Custos', value: 'cost_tracking' },
    { label: 'Analise de Receita', value: 'revenue_analysis' },
    { label: 'Previsao Orcamentaria', value: 'budget_forecast' },
    { label: 'Relatorio Diario', value: 'daily_report' },
  ],
  CSO: [
    { label: 'Verificar Alunos em Risco', value: 'check_at_risk' },
    { label: 'Celebrar Conquistas', value: 'celebrate_achievements' },
    { label: 'Gerar Intervencoes', value: 'generate_interventions' },
    { label: 'Health Check Alunos', value: 'student_health_check' },
    { label: 'Relatorio Diario', value: 'daily_report' },
  ],
};

export default function DiretoriaIA() {
  const {
    agents, todayReports, pendingEscalations, recentActions,
    budgets, recentMessages, memories, isLoading, error,
    refresh, toggleAgent, resolveEscalation, runAgent, runAllAgents, delegateTask,
  } = useAgentDashboard();

  const [selectedEscalation, setSelectedEscalation] = useState<AgentEscalation | null>(null);
  const [escalationResponse, setEscalationResponse] = useState('');
  const [escalationOption, setEscalationOption] = useState('');
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [runningAgent, setRunningAgent] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<Record<string, string>>({});
  const [showDelegateDialog, setShowDelegateDialog] = useState(false);
  const [delegateForm, setDelegateForm] = useState({ agent: '', title: '', description: '', priority: 'normal' });

  const handleRunAll = async () => {
    setIsRunningAll(true);
    toast.info('Executando todos os agentes...');
    const result = await runAllAgents();
    setIsRunningAll(false);
    if (result) {
      toast.success(`Concluido: ${result.completed}/${result.total_agents} agentes executados`);
    }
  };

  const handleRunAgent = async (agentName: string) => {
    const action = selectedAction[agentName] || AGENT_ACTIONS[agentName]?.[0]?.value;
    if (!action) return;

    setRunningAgent(agentName);
    toast.info(`Executando ${agentName}: ${action}...`);
    const result = await runAgent(agentName, action);
    setRunningAgent(null);
    if (result) {
      toast.success(`${agentName} concluiu: ${action}`);
    }
  };

  const handleResolveEscalation = async () => {
    if (!selectedEscalation) return;
    await resolveEscalation(selectedEscalation.id, escalationOption, escalationResponse);
    setSelectedEscalation(null);
    setEscalationResponse('');
    setEscalationOption('');
    toast.success('Escalacao resolvida');
  };

  const handleDelegate = async () => {
    await delegateTask(delegateForm.agent, delegateForm.title, delegateForm.description, delegateForm.priority);
    setShowDelegateDialog(false);
    setDelegateForm({ agent: '', title: '', description: '', priority: 'normal' });
    toast.success('Tarefa delegada');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Bot className="w-12 h-12 animate-pulse mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Carregando Diretoria IA...</p>
        </div>
      </div>
    );
  }

  const totalActionsToday = recentActions.length;
  const totalCostToday = budgets.reduce((s, b) => s + b.spent_usd, 0);
  const activeAgents = agents.filter(a => a.is_active).length;

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Brain className="w-8 h-8 text-primary" />
            Diretoria IA
          </h1>
          <p className="text-muted-foreground mt-1">
            {activeAgents}/6 agentes ativos | {totalActionsToday} acoes hoje | ${totalCostToday.toFixed(2)} gasto
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowDelegateDialog(true)}>
            <Send className="w-4 h-4 mr-1" /> Delegar Tarefa
          </Button>
          <Button
            size="sm"
            onClick={handleRunAll}
            disabled={isRunningAll}
          >
            <Play className="w-4 h-4 mr-1" />
            {isRunningAll ? 'Executando...' : 'Executar Todos'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 mb-4 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          <span className="text-sm text-destructive">{error}</span>
        </div>
      )}

      {/* Pending Escalations Alert */}
      {pendingEscalations.length > 0 && (
        <Card className="mb-4 border-orange-500/50 bg-orange-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              {pendingEscalations.length} Decisao(oes) Pendente(s)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingEscalations.map((esc) => (
                <div key={esc.id} className="flex items-center justify-between p-2 bg-background rounded border">
                  <div>
                    <Badge variant="outline" className={AGENT_COLORS[esc.agent_name]}>
                      {esc.agent_name}
                    </Badge>
                    <span className="ml-2 text-sm font-medium">{esc.title}</span>
                    <p className="text-xs text-muted-foreground mt-1">{esc.description}</p>
                  </div>
                  <Button size="sm" onClick={() => setSelectedEscalation(esc)}>
                    Resolver
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="agents" className="space-y-4">
        <TabsList className="grid grid-cols-2 md:grid-cols-6 w-full">
          <TabsTrigger value="agents">Agentes</TabsTrigger>
          <TabsTrigger value="reports">Relatorios</TabsTrigger>
          <TabsTrigger value="actions">Acoes</TabsTrigger>
          <TabsTrigger value="messages">Mensagens</TabsTrigger>
          <TabsTrigger value="memory">Memoria</TabsTrigger>
          <TabsTrigger value="budget">Orcamento</TabsTrigger>
        </TabsList>

        {/* AGENTS TAB */}
        <TabsContent value="agents">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map((agent) => {
              const Icon = AGENT_ICONS[agent.agent_name] || Bot;
              const colors = AGENT_COLORS[agent.agent_name] || '';
              const report = todayReports.find(r => r.agent_name === agent.agent_name);
              const budget = budgets.find(b => b.agent_name === agent.agent_name);
              const agentActions = recentActions.filter(a => a.agent_name === agent.agent_name);
              const actions = AGENT_ACTIONS[agent.agent_name] || [];

              return (
                <Card key={agent.id} className={`${!agent.is_active ? 'opacity-50' : ''}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`p-2 rounded-lg border ${colors}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{agent.agent_name}</CardTitle>
                          <CardDescription className="text-xs">{agent.display_name}</CardDescription>
                        </div>
                      </div>
                      <Switch
                        checked={agent.is_active}
                        onCheckedChange={(checked) => toggleAgent(agent.agent_name, checked)}
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {report && (
                      <div className="text-xs bg-muted/50 rounded p-2">
                        <p className="font-medium mb-1">Relatorio de Hoje:</p>
                        <p className="text-muted-foreground line-clamp-3">{report.summary}</p>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Activity className="w-3 h-3" />
                        {agentActions.length} acoes hoje
                      </span>
                      <span className="flex items-center gap-1">
                        <DollarSign className="w-3 h-3" />
                        ${budget?.spent_usd?.toFixed(2) || '0.00'}
                      </span>
                    </div>

                    {/* Action selector + run button */}
                    <div className="flex gap-2">
                      <Select
                        value={selectedAction[agent.agent_name] || actions[0]?.value}
                        onValueChange={(val) => setSelectedAction(prev => ({ ...prev, [agent.agent_name]: val }))}
                      >
                        <SelectTrigger className="h-8 text-xs flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {actions.map(a => (
                            <SelectItem key={a.value} value={a.value} className="text-xs">
                              {a.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        disabled={!agent.is_active || runningAgent === agent.agent_name}
                        onClick={() => handleRunAgent(agent.agent_name)}
                      >
                        {runningAgent === agent.agent_name ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <Play className="w-3 h-3" />
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* REPORTS TAB */}
        <TabsContent value="reports">
          <div className="space-y-4">
            {todayReports.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  Nenhum relatorio gerado hoje. Execute os agentes para gerar.
                </CardContent>
              </Card>
            ) : (
              todayReports.map((report) => {
                const Icon = AGENT_ICONS[report.agent_name] || Bot;
                return (
                  <Card key={report.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-2">
                        <Icon className="w-5 h-5" />
                        <CardTitle className="text-base">{report.agent_name} - Relatorio {report.report_type}</CardTitle>
                        <Badge variant="outline" className="text-xs">
                          {new Date(report.created_at).toLocaleTimeString('pt-BR')}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm mb-3">{report.summary}</p>

                      {report.metrics && Object.keys(report.metrics).length > 0 && (
                        <div className="bg-muted/50 rounded p-3 mb-3">
                          <p className="text-xs font-medium mb-2">Metricas:</p>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            {Object.entries(report.metrics).map(([key, value]) => (
                              <div key={key} className="text-xs">
                                <span className="text-muted-foreground">{key}: </span>
                                <span className="font-medium">{typeof value === 'number' ? value.toLocaleString() : String(value)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {(report.issues_found as unknown[])?.length > 0 && (
                        <div className="bg-destructive/5 rounded p-3 mb-3">
                          <p className="text-xs font-medium mb-1 text-destructive">Problemas:</p>
                          {(report.issues_found as Array<Record<string, string>>).slice(0, 3).map((issue, i) => (
                            <p key={i} className="text-xs text-muted-foreground">
                              {typeof issue === 'string' ? issue : JSON.stringify(issue)}
                            </p>
                          ))}
                        </div>
                      )}

                      {(report.recommendations as unknown[])?.length > 0 && (
                        <div className="bg-primary/5 rounded p-3">
                          <p className="text-xs font-medium mb-1 text-primary">Recomendacoes:</p>
                          {(report.recommendations as Array<Record<string, string>>).slice(0, 3).map((rec, i) => (
                            <p key={i} className="text-xs text-muted-foreground">
                              {typeof rec === 'string' ? rec : JSON.stringify(rec)}
                            </p>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </TabsContent>

        {/* ACTIONS TAB */}
        <TabsContent value="actions">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Acoes de Hoje ({recentActions.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <div className="space-y-2">
                  {recentActions.map((action) => (
                    <div key={action.id} className="flex items-start gap-3 p-2 rounded border text-sm">
                      <div className={`w-2 h-2 rounded-full mt-2 ${
                        action.action_category === 'green' ? 'bg-green-500' :
                        action.action_category === 'yellow' ? 'bg-yellow-500' : 'bg-red-500'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`text-xs ${AGENT_COLORS[action.agent_name]}`}>
                            {action.agent_name}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(action.created_at).toLocaleTimeString('pt-BR')}
                          </span>
                          {action.status === 'completed' ? (
                            <CheckCircle className="w-3 h-3 text-green-500" />
                          ) : action.status === 'failed' ? (
                            <XCircle className="w-3 h-3 text-red-500" />
                          ) : (
                            <Clock className="w-3 h-3 text-yellow-500" />
                          )}
                        </div>
                        <p className="text-xs mt-1 truncate">{action.title}</p>
                        {action.duration_ms > 0 && (
                          <span className="text-xs text-muted-foreground">{action.duration_ms}ms</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* MESSAGES TAB */}
        <TabsContent value="messages">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Comunicacao entre Agentes</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <div className="space-y-2">
                  {recentMessages.map((msg) => (
                    <div key={msg.id} className="p-3 rounded border text-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className={`text-xs ${AGENT_COLORS[msg.from_agent]}`}>
                          {msg.from_agent}
                        </Badge>
                        <ArrowRight className="w-3 h-3 text-muted-foreground" />
                        <Badge variant="outline" className={`text-xs ${AGENT_COLORS[msg.to_agent]}`}>
                          {msg.to_agent}
                        </Badge>
                        <Badge variant={msg.priority === 'critical' ? 'destructive' : msg.priority === 'high' ? 'default' : 'secondary'} className="text-xs">
                          {msg.priority}
                        </Badge>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {new Date(msg.created_at).toLocaleTimeString('pt-BR')}
                        </span>
                      </div>
                      <p className="font-medium text-xs">{msg.subject}</p>
                      <Badge variant="outline" className="text-xs mt-1">{msg.status}</Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* MEMORY TAB */}
        <TabsContent value="memory">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Brain className="w-5 h-5" />
                Memoria dos Agentes ({memories.length} aprendizados)
              </CardTitle>
              <CardDescription>O que os agentes aprenderam ao longo do tempo</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <div className="space-y-2">
                  {memories.map((mem) => (
                    <div key={mem.id} className="p-3 rounded border text-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className={`text-xs ${AGENT_COLORS[mem.agent_name]}`}>
                          {mem.agent_name}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">{mem.memory_type}</Badge>
                        {mem.category && (
                          <Badge variant="outline" className="text-xs">{mem.category}</Badge>
                        )}
                        <span className="text-xs text-muted-foreground ml-auto">
                          Confianca: {Math.round(mem.confidence * 100)}%
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{mem.content}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* BUDGET TAB */}
        <TabsContent value="budget">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map((agent) => {
              const budget = budgets.find(b => b.agent_name === agent.agent_name);
              const Icon = AGENT_ICONS[agent.agent_name] || Bot;
              const spent = budget?.spent_usd || 0;
              const limit = agent.budget_daily_usd;
              const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;

              return (
                <Card key={agent.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4" />
                      <CardTitle className="text-base">{agent.agent_name}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>${spent.toFixed(2)}</span>
                        <span className="text-muted-foreground">/ ${limit.toFixed(2)}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${
                            pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-yellow-500' : 'bg-green-500'
                          }`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{pct}% usado</span>
                        <span>{budget?.actions_count || 0} acoes</span>
                        <span>{budget?.tokens_used || 0} tokens</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {/* Total */}
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  Total Diretoria
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 text-sm">
                  <p>Gasto hoje: <strong>${totalCostToday.toFixed(2)}</strong></p>
                  <p>Limite total: <strong>${agents.reduce((s, a) => s + a.budget_daily_usd, 0).toFixed(2)}</strong></p>
                  <p>Acoes hoje: <strong>{recentActions.length}</strong></p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Projecao mensal: ~${(totalCostToday * 30).toFixed(2)}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Escalation Resolution Dialog */}
      <Dialog open={!!selectedEscalation} onOpenChange={() => setSelectedEscalation(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolver Escalacao</DialogTitle>
            <DialogDescription>{selectedEscalation?.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">De: {selectedEscalation?.agent_name}</p>
              <p className="text-sm text-muted-foreground">{selectedEscalation?.reasoning}</p>
            </div>
            {selectedEscalation?.options && (
              <div>
                <p className="text-sm font-medium mb-2">Opcoes:</p>
                <div className="space-y-2">
                  {(selectedEscalation.options as string[]).map((opt, i) => (
                    <Button
                      key={i}
                      variant={escalationOption === opt ? 'default' : 'outline'}
                      size="sm"
                      className="mr-2"
                      onClick={() => setEscalationOption(opt)}
                    >
                      {opt}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <Textarea
              placeholder="Sua resposta/instrucoes adicionais..."
              value={escalationResponse}
              onChange={(e) => setEscalationResponse(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedEscalation(null)}>Cancelar</Button>
            <Button onClick={handleResolveEscalation} disabled={!escalationOption}>
              Resolver
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delegate Task Dialog */}
      <Dialog open={showDelegateDialog} onOpenChange={setShowDelegateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delegar Tarefa</DialogTitle>
            <DialogDescription>Envie uma tarefa para um agente especifico</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={delegateForm.agent} onValueChange={(val) => setDelegateForm(prev => ({ ...prev, agent: val }))}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o agente" />
              </SelectTrigger>
              <SelectContent>
                {agents.map(a => (
                  <SelectItem key={a.agent_name} value={a.agent_name}>{a.agent_name} - {a.display_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Titulo da tarefa"
              value={delegateForm.title}
              onChange={(e) => setDelegateForm(prev => ({ ...prev, title: e.target.value }))}
            />
            <Textarea
              placeholder="Descricao detalhada..."
              value={delegateForm.description}
              onChange={(e) => setDelegateForm(prev => ({ ...prev, description: e.target.value }))}
            />
            <Select value={delegateForm.priority} onValueChange={(val) => setDelegateForm(prev => ({ ...prev, priority: val }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Baixa</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">Alta</SelectItem>
                <SelectItem value="critical">Critica</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelegateDialog(false)}>Cancelar</Button>
            <Button onClick={handleDelegate} disabled={!delegateForm.agent || !delegateForm.title}>
              <Send className="w-4 h-4 mr-1" /> Delegar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
