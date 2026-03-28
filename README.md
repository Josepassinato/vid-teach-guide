# Vibe Class

Plataforma de ensino por video com tutor IA por voz.

## Stack

- Vite + React + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase (auth, database, edge functions)
- Cloudflare Stream (videos)
- OpenAI Realtime API (tutor de voz)
- Gemini Live (tutor alternativo)

## Setup local

```sh
git clone <REPO_URL>
cd vid-teach-guide
npm install
npm run dev
```

## Variaveis de ambiente

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon-key>
VITE_SENTRY_DSN=<dsn>
```

## Build

```sh
npm run build
npm run preview
```
