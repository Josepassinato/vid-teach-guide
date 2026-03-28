# HISTORICO — vid-teach-guide (Vibe Class)

## 2026-03-17 — Implementacao completa das 4 fases do TAREFAS_CLAUDE_CODE.json

### O que foi feito
- **21 tarefas concluidas** em 4 fases, 56 arquivos, +3471 linhas
- Branch: `claude/review-vid-teach-guide-CR1xp`
- Sandbox: `/root/sandbox/vid-teach-guide_2026-03-17/`

### Fase 1: Fundacao
- F1-T1: Legendas em tempo real (LiveCaptions.tsx)
- F1-T2: Reconexao WebSocket com backoff exponencial (useWebSocketReconnect.ts)
- F1-T3: AudioWorklet off main thread (audio-processor.worklet.js)
- F1-T4: Controle de velocidade 0.75x-2x
- F1-T5: Sentry monitoring (@sentry/react)
- F1-T6: +19 testes unitarios

### Fase 2: Experiencia
- F2-T1: Quiz adaptativo por dificuldade
- F2-T2: Feedback contextual por opcao errada (useContextualFeedback.ts)
- F2-T3: PWA com Service Worker (vite-plugin-pwa)
- F2-T4: Picture-in-Picture
- F2-T5: HLS.js streaming adaptativo
- F2-T6: OAuth Google login

### Fase 3: Inteligencia
- F3-T1: RAG com pgvector (embed-transcript + search-transcript)
- F3-T2: Intervencao contextual do professor (useContextualIntervention.ts)
- F3-T3: Audio pipeline unificado (useAudioPipeline.ts + useAudioPlayback.ts)
- F3-T4: Fallback automatico OpenAI/Gemini (useVoiceProvider.ts)
- F3-T5: Dashboard analytics (/admin/analytics)

### Fase 4: Escala
- F4-T1: i18n com react-intl (pt-BR, en-US, es-ES)
- F4-T2: Gamificacao XP/streaks/leaderboard
- F4-T3: Perguntas abertas avaliadas por IA
- F4-T4: Plano de migracao Next.js (documentado, nao executado)

### Pendencias (resolvidas em 2026-03-28)
- ~~Rodar 4 migrations SQL~~ FEITO
- ~~Deploy edge functions: embed-transcript, search-transcript~~ FEITO
- ~~Aprovar deploy do sandbox para producao~~ FEITO
- Configurar: VITE_SENTRY_DSN, Google OAuth no Supabase Dashboard
- Substituir PWA icons placeholder por icones reais do Vibe Class

### Integracoes ativas
- Supabase: projeto "Escola 12 brain" (armabaquiyqmdgwflslq)
- Cloudflare Stream: videos hospedados
- OpenAI Realtime API: tutor de voz
- Gemini Live: tutor alternativo

---

## 2026-03-28 — Migracao para Grok + Deploy producao

### O que foi feito
- **Limpeza total do Lovable** — removido de 8+ arquivos (index.html, vite.config.ts, package.json, README.md, 4 edge functions)
- **4 migrations SQL aplicadas** no Supabase: quiz_difficulty, pgvector_embeddings, gamification, open_questions
- **Edge functions deployadas** via MCP: embed-transcript, search-transcript, openai-realtime-token
- **Migracao para Grok (xAI)** — 5 edge functions de texto trocadas de OpenAI/Lovable para `api.x.ai` + `grok-3-mini-fast`
- **Tutor de voz migrado** — Grok Voice Agent API como primario (`wss://api.x.ai/v1/realtime`, voz Ara), OpenAI Realtime como fallback automatico
- **Secret XAI_API_KEY** configurado no Supabase
- **Deploy em producao** — https://escola.12brain.org com HTTPS (Let's Encrypt)
- **DNS configurado** — escola.12brain.org -> 76.13.109.151 (A record)
- **Sandbox:** `/root/sandbox/vid-teach-guide_2026-03-27/`

### Arquitetura de IA atual
| Funcao | Provider | Modelo | Fallback |
|--------|----------|--------|----------|
| Tutor de voz (realtime) | Grok xAI | Voice Agent API (Ara) | OpenAI Realtime (echo) |
| Quiz generator | Grok xAI | grok-3-mini-fast | — |
| Agent evaluator | Grok xAI | grok-3-mini-fast | — |
| Agent feedback | Grok xAI | grok-3-mini-fast | — |
| Content manager | Grok xAI | grok-3-mini-fast | — |
| Analyze YouTube | Grok xAI | grok-3-mini-fast | — |
| Embeddings (RAG) | OpenAI | text-embedding-3-small | — |
| Transcricao audio | OpenAI | whisper-1 | — |

### Pendencias restantes
- Configurar OPENAI_API_KEY no Supabase (para fallback voz + embeddings + Whisper)
- Configurar VITE_SENTRY_DSN
- Configurar Google OAuth no Supabase Dashboard
- Substituir PWA icons placeholder por icones reais do Vibe Class

### Integracoes ativas
- Supabase: projeto "Escola 12 brain" (armabaquiyqmdgwflslq)
- Cloudflare Stream: videos hospedados
- Grok Voice Agent API (xAI): tutor de voz primario
- OpenAI Realtime API: tutor de voz fallback
- OpenAI Embeddings + Whisper: RAG e transcricao
- DNS: escola.12brain.org (Hostinger API)
- HTTPS: Let's Encrypt (auto-renew, expira 2026-06-25)
