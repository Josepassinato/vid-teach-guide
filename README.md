# Vibe Class - Plataforma de Ensino Interativo com IA

Plataforma educacional que combina aulas em vídeo com tutoria por IA em tempo real, quizzes adaptativos, missões práticas e gamificação.

## Stack

- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend:** Supabase (PostgreSQL + Auth + Edge Functions + Storage)
- **IA:** OpenAI Realtime API + Google Gemini Live
- **Monitoring:** Sentry (error tracking + performance)

## Features

- Aulas em vídeo com transcrição em tempo real
- Chat de voz com IA (OpenAI e Gemini)
- Quizzes adaptativos por dificuldade
- Missões práticas com avaliação por IA
- Sistema de gamificação (XP, streaks, badges, leaderboard)
- Perfil de aprendizado do aluno (memória contextual)
- Squads colaborativos
- Certificados de conclusão
- RAG com pgvector para busca semântica em transcrições
- Questões abertas com avaliação por IA
- PWA com suporte offline

## Setup

```sh
git clone <repo-url>
cd vid-teach-guide
npm install
cp .env.example .env  # Configure suas variáveis
npm run dev
```

### Variáveis de ambiente

```
VITE_SUPABASE_URL=https://atkektzlfijvoyuexqes.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<your-anon-key>
VITE_SENTRY_DSN=<your-sentry-dsn>
```

## Migrations

Aplique as migrations no Supabase:

```sh
npx supabase login
npx supabase link --project-ref atkektzlfijvoyuexqes
npx supabase db push
```

## Arquitetura

```
src/
├── components/     # Componentes React (VoiceChat, Quiz, Missions, etc.)
├── hooks/          # Custom hooks (useTimestampQuizzes, useStudentMemory, etc.)
├── integrations/   # Supabase client e tipos
├── pages/          # Páginas da aplicação
├── services/       # Serviços (audio, AI providers)
└── utils/          # Utilitários
supabase/
├── functions/      # Edge Functions (Deno)
└── migrations/     # SQL migrations
```
