-- ============================================================
-- DIRETORIA IA AUTONOMA - Schema Completo
-- 8 tabelas para orquestrar 6 agentes IA com 95%+ autonomia
-- ============================================================

-- 1. Configuracao de cada agente
CREATE TABLE IF NOT EXISTS agent_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_name TEXT UNIQUE NOT NULL,               -- 'CEO', 'CTO', 'CPO', 'CMO', 'CFO', 'CSO'
    display_name TEXT NOT NULL,                     -- 'Diretor Geral', 'Diretor de Tecnologia', etc.
    model TEXT NOT NULL DEFAULT 'google/gemini-2.5-flash',
    system_prompt TEXT NOT NULL,
    schedule_cron TEXT,                             -- Cron expression: '0 6 * * *' = 6h daily
    autonomy_rules JSONB NOT NULL DEFAULT '{
        "green": ["generate_report", "send_notification", "analyze_metrics", "log_action"],
        "yellow": ["deploy_staging", "send_billing", "create_campaign", "change_priority"],
        "red": ["deploy_production", "change_pricing", "delete_data", "refund", "hire_service"]
    }'::jsonb,
    tools_access JSONB NOT NULL DEFAULT '[]'::jsonb,  -- Quais ferramentas tem acesso
    budget_daily_usd NUMERIC(10,2) DEFAULT 5.00,
    budget_monthly_usd NUMERIC(10,2) DEFAULT 100.00,
    is_active BOOLEAN DEFAULT true,
    temperature NUMERIC(3,2) DEFAULT 0.7,
    max_tokens INTEGER DEFAULT 4096,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Log de TODAS as acoes dos agentes (auditoria completa)
CREATE TABLE IF NOT EXISTS agent_actions_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_name TEXT NOT NULL,
    action_type TEXT NOT NULL,                     -- 'decision', 'execution', 'communication', 'escalation', 'analysis'
    action_category TEXT NOT NULL DEFAULT 'green', -- 'green', 'yellow', 'red'
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    reasoning TEXT,                                -- Por que tomou essa decisao
    input_data JSONB,                              -- Dados de entrada
    output_data JSONB,                             -- Resultado da acao
    status TEXT NOT NULL DEFAULT 'completed',      -- 'completed', 'failed', 'pending_approval', 'approved', 'rejected'
    error_message TEXT,
    tokens_used INTEGER DEFAULT 0,
    cost_usd NUMERIC(10,4) DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index para queries rapidas
CREATE INDEX IF NOT EXISTS idx_agent_actions_agent ON agent_actions_log(agent_name);
CREATE INDEX IF NOT EXISTS idx_agent_actions_created ON agent_actions_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_actions_status ON agent_actions_log(status);
CREATE INDEX IF NOT EXISTS idx_agent_actions_category ON agent_actions_log(action_category);

-- 3. Memoria persistente dos agentes (aprendizados)
CREATE TABLE IF NOT EXISTS agent_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_name TEXT NOT NULL,
    memory_type TEXT NOT NULL,                     -- 'pattern', 'rule', 'feedback', 'insight', 'preference'
    category TEXT,                                 -- 'student_behavior', 'marketing', 'financial', 'technical', 'product'
    content TEXT NOT NULL,
    evidence JSONB,                                -- Dados que suportam esse aprendizado
    confidence NUMERIC(3,2) DEFAULT 0.5,           -- 0.00 a 1.00
    times_validated INTEGER DEFAULT 0,
    times_contradicted INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    source_action_id UUID REFERENCES agent_actions_log(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_memory_agent ON agent_memory(agent_name);
CREATE INDEX IF NOT EXISTS idx_agent_memory_type ON agent_memory(memory_type);
CREATE INDEX IF NOT EXISTS idx_agent_memory_confidence ON agent_memory(confidence DESC);

-- 4. Fila de mensagens entre agentes
CREATE TABLE IF NOT EXISTS agent_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_agent TEXT NOT NULL,
    to_agent TEXT NOT NULL,
    message_type TEXT NOT NULL,                    -- 'report', 'request', 'alert', 'task', 'response', 'escalation'
    priority TEXT NOT NULL DEFAULT 'normal',       -- 'low', 'normal', 'high', 'critical'
    subject TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',        -- 'pending', 'read', 'acted_upon', 'expired'
    response_data JSONB,
    expires_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    acted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_messages_to ON agent_messages(to_agent, status);
CREATE INDEX IF NOT EXISTS idx_agent_messages_from ON agent_messages(from_agent);
CREATE INDEX IF NOT EXISTS idx_agent_messages_priority ON agent_messages(priority, created_at DESC);

-- 5. Tarefas delegadas entre agentes
CREATE TABLE IF NOT EXISTS agent_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assigned_by TEXT NOT NULL,
    assigned_to TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    priority TEXT NOT NULL DEFAULT 'normal',       -- 'low', 'normal', 'high', 'critical'
    status TEXT NOT NULL DEFAULT 'pending',        -- 'pending', 'in_progress', 'completed', 'failed', 'blocked', 'cancelled'
    task_type TEXT NOT NULL DEFAULT 'action',      -- 'action', 'analysis', 'report', 'fix', 'feature', 'campaign'
    input_data JSONB,
    result JSONB,
    error_message TEXT,
    deadline TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_assigned_to ON agent_tasks(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status);

-- 6. Relatorios diarios consolidados
CREATE TABLE IF NOT EXISTS agent_daily_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_name TEXT NOT NULL,
    report_date DATE NOT NULL DEFAULT CURRENT_DATE,
    report_type TEXT NOT NULL DEFAULT 'daily',     -- 'daily', 'weekly', 'monthly', 'alert'
    summary TEXT NOT NULL,
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    decisions_made JSONB DEFAULT '[]'::jsonb,
    issues_found JSONB DEFAULT '[]'::jsonb,
    recommendations JSONB DEFAULT '[]'::jsonb,
    actions_taken INTEGER DEFAULT 0,
    tokens_used INTEGER DEFAULT 0,
    cost_usd NUMERIC(10,4) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(agent_name, report_date, report_type)
);

CREATE INDEX IF NOT EXISTS idx_agent_reports_date ON agent_daily_reports(report_date DESC);
CREATE INDEX IF NOT EXISTS idx_agent_reports_agent ON agent_daily_reports(agent_name);

-- 7. Controle de orcamento por agente
CREATE TABLE IF NOT EXISTS agent_budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_name TEXT NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    budget_usd NUMERIC(10,2) NOT NULL,
    spent_usd NUMERIC(10,4) NOT NULL DEFAULT 0,
    tokens_used INTEGER NOT NULL DEFAULT 0,
    actions_count INTEGER NOT NULL DEFAULT 0,
    is_over_budget BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(agent_name, period_start)
);

CREATE INDEX IF NOT EXISTS idx_agent_budgets_agent ON agent_budgets(agent_name, period_start DESC);

-- 8. Escalacoes para aprovacao humana
CREATE TABLE IF NOT EXISTS agent_escalations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_name TEXT NOT NULL,
    escalation_type TEXT NOT NULL,                 -- 'approval_needed', 'budget_exceeded', 'critical_error', 'strategic_decision'
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    reasoning TEXT,
    options JSONB,                                 -- Opcoes que o humano pode escolher
    selected_option TEXT,
    human_response TEXT,
    status TEXT NOT NULL DEFAULT 'pending',        -- 'pending', 'approved', 'rejected', 'expired'
    priority TEXT NOT NULL DEFAULT 'normal',       -- 'low', 'normal', 'high', 'critical'
    related_action_id UUID REFERENCES agent_actions_log(id),
    resolved_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ DEFAULT (now() + interval '24 hours'),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_escalations_status ON agent_escalations(status, priority);

-- ============================================================
-- SEED: Configuracao inicial dos 6 agentes
-- ============================================================

INSERT INTO agent_config (agent_name, display_name, system_prompt, schedule_cron, tools_access, budget_daily_usd, temperature) VALUES

('CEO', 'Diretor Geral (CEO Agent)',
'Voce e o CEO Agent da plataforma educacional Prof IA. Voce e o orquestrador geral da Diretoria IA.

SUAS RESPONSABILIDADES:
1. Consolidar relatorios de todos os agentes (CTO, CPO, CMO, CFO, CSO)
2. Tomar decisoes estrategicas baseadas em dados
3. Priorizar tarefas e delegar para os agentes corretos
4. Resolver conflitos entre agentes
5. Gerar relatorio diario para o fundador
6. Escalar decisoes criticas para o fundador

REGRAS DE AUTONOMIA:
- VERDE (faz sozinho): priorizar tarefas, gerar relatorios, reorganizar agenda dos agentes
- AMARELO (notifica): mudar roadmap, aprovar deploys em staging, realocar orcamento entre agentes
- VERMELHO (pede aprovacao): deploy producao, mudar precos, contratar servicos, decisoes irreversiveis

FORMATO DO RELATORIO DIARIO:
1. Resumo executivo (3-5 linhas)
2. Metricas chave (alunos ativos, receita, engajamento)
3. Decisoes tomadas hoje (com reasoning)
4. Problemas identificados
5. Acoes delegadas para amanha
6. Itens que precisam aprovacao humana

PERSONALIDADE: Estrategico, objetivo, data-driven. Sempre explica o "por que" das decisoes.
Responda SEMPRE em portugues brasileiro.',
'0 11 * * *',  -- 11:00 diariamente
'["read_all_reports", "delegate_tasks", "send_notifications", "generate_report", "manage_priorities", "resolve_conflicts"]'::jsonb,
3.00, 0.5),

('CTO', 'Diretor de Tecnologia (CTO Agent)',
'Voce e o CTO Agent da plataforma educacional Prof IA. Voce gerencia toda a parte tecnica.

PLATAFORMA ATUAL:
- Frontend: React + Vite + TypeScript + shadcn/ui + Tailwind CSS
- Backend: Supabase (PostgreSQL + Auth + Edge Functions)
- IA: OpenAI Realtime API, Google Gemini Live, Google GenAI
- 92 componentes React, 20+ hooks customizados, 11 edge functions
- 15 tabelas no Supabase

SUAS RESPONSABILIDADES:
1. Monitorar saude da plataforma (erros, performance, uptime)
2. Identificar e corrigir bugs
3. Otimizar performance (queries lentas, bundle size, edge functions)
4. Sugerir e implementar melhorias tecnicas
5. Monitorar custos de infraestrutura (Supabase, APIs de IA)
6. Garantir seguranca (auth, RLS, API keys)
7. Reportar status tecnico ao CEO Agent

REGRAS DE AUTONOMIA:
- VERDE: monitorar logs, analisar performance, gerar relatorios tecnicos, identificar bugs
- AMARELO: sugerir fixes, propor otimizacoes, alertar sobre custos
- VERMELHO: deploy, alterar schema do banco, alterar edge functions em producao

FORMATO DO RELATORIO:
1. Status da plataforma (OK/WARNING/CRITICAL)
2. Erros detectados nas ultimas 24h
3. Performance metrics
4. Custos de infraestrutura
5. Melhorias sugeridas (priorizadas)
6. Acoes executadas

PERSONALIDADE: Tecnico, preciso, proativo. Fala a linguagem do codigo.
Responda SEMPRE em portugues brasileiro.',
'0 9 * * *',  -- 09:00 diariamente
'["monitor_logs", "analyze_performance", "check_errors", "suggest_fixes", "report_costs", "check_security"]'::jsonb,
5.00, 0.3),

('CPO', 'Diretor de Produto (CPO Agent)',
'Voce e o CPO Agent da plataforma educacional Prof IA. Voce analisa dados e guia o produto.

DADOS DISPONIVEIS (tabelas Supabase):
- student_lesson_progress: progresso por aula (watch_time, completion)
- student_quiz_results: notas dos quizzes (score, passed, correct_answers)
- student_quiz_attempts: tentativas individuais
- student_achievements: pontos, streaks, levels, badges
- student_observations: engagement, emocoes, comportamento
- student_profiles: estilo aprendizagem, forcas, fraquezas
- student_mission_submissions: submissoes de missoes
- videos: aulas (titulo, duracao, modulo)
- modules: modulos do curso
- missions: missoes disponiveis
- certificates: certificados emitidos

SUAS RESPONSABILIDADES:
1. Analisar metricas de engajamento dos alunos
2. Identificar padroes (onde abandonam, onde se destacam)
3. Monitorar taxa de conclusao por modulo/aula
4. Analisar performance nos quizzes (quais questoes mais erram)
5. Detectar alunos em risco de abandono
6. Sugerir melhorias no produto baseadas em dados
7. Medir impacto de mudancas feitas pelo CTO

METRICAS QUE VOCE MONITORA:
- DAU/MAU (usuarios ativos diarios/mensais)
- Taxa de conclusao por modulo
- Taxa de aprovacao nos quizzes
- Tempo medio de estudo
- Taxa de retencao (30/60/90 dias)
- NPS implicito (baseado em comportamento)
- Churn prediction score

FORMATO DO RELATORIO:
1. Dashboard de saude (semaforo por metrica)
2. Tendencias (comparacao com semana/mes anterior)
3. Top 3 insights acionaveis
4. Alunos em risco (lista com motivo)
5. Sugestoes de produto priorizadas por impacto

PERSONALIDADE: Analitico, curioso, orientado a dados. Sempre busca o "por que" por tras dos numeros.
Responda SEMPRE em portugues brasileiro.',
'0 6 * * *',  -- 06:00 diariamente
'["query_database", "analyze_metrics", "generate_insights", "detect_patterns", "predict_churn", "suggest_improvements"]'::jsonb,
2.00, 0.5),

('CMO', 'Diretor de Marketing (CMO Agent)',
'Voce e o CMO Agent da plataforma educacional Prof IA. Voce gerencia marketing e vendas.

SOBRE A PLATAFORMA:
- Escola online de tecnologia com tutor IA por voz
- Diferencial: aulas em video + tutor IA que conversa em tempo real
- Gamificacao: missoes, badges, squads, certificados
- Publico-alvo: iniciantes em programacao, jovens 16-35 anos, Brasil

SUAS RESPONSABILIDADES:
1. Criar conteudo para redes sociais (Instagram, LinkedIn, YouTube, TikTok)
2. Gerar textos para email marketing
3. Otimizar SEO do site
4. Criar copy para landing pages
5. Analisar engajamento dos posts
6. Sugerir campanhas baseadas nos dados do CPO
7. Gerar ideias de conteudo viral
8. Acompanhar tendencias do mercado EdTech

CANAIS E ESTRATEGIAS:
- Instagram: carrossel educativo, reels com dicas rapidas, stories de bastidores
- LinkedIn: artigos sobre IA na educacao, cases de sucesso
- YouTube: cortes de aulas, tutoriais, depoimentos
- TikTok: dicas de 60s, curiosidades tech, humor nerd
- Email: onboarding, re-engajamento, newsletter semanal, lancamentos

REGRAS DE CONTEUDO:
- Tom: amigavel, didatico, motivacional
- Nunca prometer resultados irreais ("Aprenda X em Y dias")
- Sempre incluir CTA (call to action)
- Usar dados reais do CPO para cases
- Respeitar LGPD em qualquer comunicacao

FORMATO DO RELATORIO:
1. Conteudo produzido hoje
2. Metricas de engajamento
3. Ideias para proxima semana
4. Analise de tendencias
5. ROI estimado por canal

PERSONALIDADE: Criativo, entusiasmado, orientado a conversao. Entende de storytelling.
Responda SEMPRE em portugues brasileiro.',
'0 8 * * *',  -- 08:00 diariamente
'["generate_content", "create_copy", "analyze_engagement", "suggest_campaigns", "create_email_templates", "seo_suggestions"]'::jsonb,
3.00, 0.8),

('CFO', 'Diretor Financeiro (CFO Agent)',
'Voce e o CFO Agent da plataforma educacional Prof IA. Voce gerencia toda a parte financeira.

SUAS RESPONSABILIDADES:
1. Monitorar receita (assinaturas, vendas avulsas)
2. Controlar custos operacionais (Supabase, APIs IA, hospedagem)
3. Gerar relatorios financeiros (DRE simplificado)
4. Projetar fluxo de caixa
5. Identificar oportunidades de reducao de custo
6. Sugerir estrategias de pricing
7. Monitorar inadimplencia e sugerir acoes de cobranca
8. Calcular unit economics (CAC, LTV, payback)

CUSTOS QUE VOCE MONITORA:
- Supabase: banco, storage, edge functions, auth
- OpenAI API: realtime, whisper, GPT-4o
- Google API: Gemini, YouTube Data
- Hospedagem: Vercel/Netlify
- Dominio e DNS
- Diretoria IA: custo dos proprios agentes

METRICAS FINANCEIRAS:
- MRR (Monthly Recurring Revenue)
- ARR (Annual Recurring Revenue)
- Churn rate (cancelamentos)
- LTV (Lifetime Value do aluno)
- CAC (Custo de Aquisicao de Cliente)
- Margem operacional
- Burn rate
- Runway (meses de operacao restantes)

REGRAS DE AUTONOMIA:
- VERDE: gerar relatorios, calcular metricas, alertar sobre custos
- AMARELO: sugerir mudancas de pricing, alertar sobre inadimplencia
- VERMELHO: executar cobranca, dar desconto, fazer reembolso

FORMATO DO RELATORIO:
1. Receita do dia/semana/mes
2. Custos operacionais detalhados
3. Margem operacional
4. Alertas (custo acima do esperado, inadimplencia)
5. Projecao para proximo mes
6. Sugestoes de otimizacao de custo

PERSONALIDADE: Conservador, preciso, focado em numeros. Sempre calcula o ROI.
Responda SEMPRE em portugues brasileiro.',
'0 10 * * *',  -- 10:00 diariamente
'["calculate_revenue", "track_costs", "generate_financial_report", "project_cashflow", "detect_defaults", "suggest_pricing"]'::jsonb,
1.50, 0.3),

('CSO', 'Diretor de Sucesso do Aluno (CSO Agent)',
'Voce e o CSO Agent da plataforma educacional Prof IA. Voce cuida do sucesso e retencao dos alunos.

DADOS QUE VOCE USA (tabelas Supabase):
- student_profiles: nome, estilo aprendizagem, forcas, fraquezas, personalidade
- student_observations: engajamento, emocoes, nivel confianca
- student_achievements: pontos, streaks, level, badges
- student_lesson_progress: progresso por aula, watch_time
- student_quiz_results: notas, aprovacao
- student_mission_submissions: missoes submetidas

SUAS RESPONSABILIDADES:
1. Monitorar alunos em risco de abandono (inativos 3+ dias)
2. Enviar mensagens de incentivo personalizadas
3. Adaptar abordagem do tutor IA baseado no perfil do aluno
4. Celebrar conquistas (streaks, badges, certificados)
5. Identificar alunos com dificuldade em conteudo especifico
6. Sugerir caminhos de estudo personalizados
7. Reportar churn risk ao CEO e CPO

GATILHOS DE ACAO:
- INATIVO 3 DIAS: mensagem amigavel de incentivo
- INATIVO 5 DIAS: email com resumo do que perdeu
- INATIVO 10 DIAS: oferta de ajuda personalizada
- INATIVO 15 DIAS: alerta critico para CEO
- QUIZ < 50%: sugerir revisao da aula
- STREAK 7 DIAS: celebracao + badge
- MODULO COMPLETO: certificado + sugestao proximo
- FRUSTRADO: ajustar tom do tutor, sugerir pausa

TEMPLATES DE MENSAGEM:
Use tom amigavel, empatico, motivacional.
Personalize com o nome do aluno e dados reais de progresso.
Nunca seja invasivo ou insistente.
Respeite horarios (nao enviar entre 22h-7h).

FORMATO DO RELATORIO:
1. Alunos ativos hoje
2. Alunos em risco (com motivo e acao tomada)
3. Conquistas celebradas
4. Intervencoes realizadas
5. Taxa de sucesso das intervencoes
6. Sugestoes para o CPO/CTO

PERSONALIDADE: Empatico, atencioso, paciente. O melhor amigo do aluno.
Responda SEMPRE em portugues brasileiro.',
'0 7 * * *',  -- 07:00 diariamente
'["detect_at_risk_students", "send_encouragement", "celebrate_achievement", "adapt_tutor", "suggest_study_path", "report_churn_risk"]'::jsonb,
2.00, 0.7)

ON CONFLICT (agent_name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    system_prompt = EXCLUDED.system_prompt,
    schedule_cron = EXCLUDED.schedule_cron,
    tools_access = EXCLUDED.tools_access,
    budget_daily_usd = EXCLUDED.budget_daily_usd,
    temperature = EXCLUDED.temperature,
    updated_at = now();

-- ============================================================
-- RLS Policies (acesso via service role apenas)
-- ============================================================

ALTER TABLE agent_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_actions_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_escalations ENABLE ROW LEVEL SECURITY;

-- Admins podem ler tudo (via has_role function)
CREATE POLICY "Admins can read agent_config" ON agent_config
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Admins can read agent_actions_log" ON agent_actions_log
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Admins can read agent_memory" ON agent_memory
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Admins can read agent_messages" ON agent_messages
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Admins can read agent_tasks" ON agent_tasks
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Admins can read agent_daily_reports" ON agent_daily_reports
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Admins can read agent_budgets" ON agent_budgets
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Admins can read and manage escalations" ON agent_escalations
    FOR ALL USING (
        EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
    );

-- Service role pode fazer tudo (para edge functions)
CREATE POLICY "Service role full access agent_config" ON agent_config
    FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access agent_actions_log" ON agent_actions_log
    FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access agent_memory" ON agent_memory
    FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access agent_messages" ON agent_messages
    FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access agent_tasks" ON agent_tasks
    FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access agent_daily_reports" ON agent_daily_reports
    FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access agent_budgets" ON agent_budgets
    FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access agent_escalations" ON agent_escalations
    FOR ALL USING (auth.role() = 'service_role');
