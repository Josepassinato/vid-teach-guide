# DIRETORIA IA AUTONOMA - PLANO COMPLETO DE IMPLEMENTACAO

## Visao Geral

Sistema de 6 agentes IA especializados operando 24/7 com autonomia acima de 95%.
Cada agente tem papel definido, ferramentas proprias, e niveis de autonomia configuráveis.
Orquestrados por um CEO Agent via CrewAI-like hierarchical pattern.

## Arquitetura

### Agentes

| Agente | Modelo IA | Funcao | Autonomia |
|--------|-----------|--------|-----------|
| CEO Agent | Gemini 2.5 Flash | Orquestrador geral, decisoes estrategicas | 95% |
| CTO Agent | Gemini 2.5 Flash | Codigo, infraestrutura, deploy, bugs | 90% |
| CPO Agent | Gemini 2.5 Flash | Analytics, dados, produto, metricas | 98% |
| CMO Agent | Gemini 2.5 Flash | Marketing, conteudo, SEO, social media | 95% |
| CFO Agent | Gemini 2.5 Flash | Financeiro, cobrancas, relatorios, custos | 92% |
| CSO Agent | Gemini 2.5 Flash | Sucesso do aluno, retencao, suporte | 97% |

### Tabelas Novas no Supabase

1. `agent_config` - Configuracao de cada agente
2. `agent_actions_log` - Log de todas as acoes
3. `agent_memory` - Memoria persistente e aprendizados
4. `agent_messages` - Fila de mensagens entre agentes
5. `agent_tasks` - Tarefas delegadas entre agentes
6. `agent_daily_reports` - Relatorios diarios consolidados
7. `agent_budgets` - Controle de custo por agente
8. `agent_escalations` - Decisoes que precisam de aprovacao humana

### Edge Functions Novas

1. `agent-orchestrator` - CEO Agent / Orquestrador
2. `agent-cto` - Diretor de Tecnologia
3. `agent-cpo` - Diretor de Produto
4. `agent-cmo` - Diretor de Marketing
5. `agent-cfo` - Diretor Financeiro
6. `agent-cso` - Diretor de Sucesso do Aluno
7. `agent-scheduler` - Agendador de execucoes

### Frontend

1. Nova pagina: `/admin/diretoria` - Dashboard da Diretoria IA
2. Novo hook: `useAgentDashboard` - Dados do dashboard
3. Componentes: AgentCard, AgentTimeline, AgentMetrics, EscalationPanel

## Niveis de Autonomia

### Verde (Acao Automatica - 95% das acoes)
- Gerar relatorios
- Enviar notificacoes padrao
- Analisar metricas
- Publicar conteudo pre-aprovado
- Enviar lembretes de estudo
- Corrigir bugs simples
- Otimizar queries

### Amarelo (Acao com Notificacao - 4% das acoes)
- Deploy em staging
- Nova feature
- Campanha de marketing nova
- Enviar cobranca
- Mudar prioridades

### Vermelho (Requer Aprovacao - 1% das acoes)
- Deploy em producao
- Mudar precos
- Deletar dados
- Reembolsar
- Contratar servico externo
- Mudar branding

## Fluxo de Execucao Diario

06:00 - CPO roda analise de metricas
07:00 - CSO identifica alunos em risco e age
08:00 - CMO publica conteudo e analisa engajamento
09:00 - CTO monitora saude da plataforma
10:00 - CFO gera relatorio financeiro
11:00 - CEO consolida tudo e toma decisoes
22:00 - CTO faz manutencao noturna
00:00 - CEO gera relatorio diario final

## Seguranca

- Kill switch por agente (desliga instantaneamente)
- Budget cap diario por agente ($5 max padrao)
- Rate limit de acoes por hora
- Log completo e auditavel de cada acao
- Fallback manual para cada funcao automatizada
- Backup de banco antes de qualquer migration
