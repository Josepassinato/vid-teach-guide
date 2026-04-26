/**
 * Centralized logger with Sentry + Supabase error_logs integration.
 *
 * - dev mode: all levels go to console
 * - prod mode: warn/error go to console + Sentry + Supabase error_logs table
 *
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   logger.debug('[Module]', 'message');
 *   logger.error('[Module]', 'crash', err);
 *
 * Visualizar logs salvos: https://escola.12brain.org/admin/logs
 */
import * as Sentry from '@sentry/react';
import { supabase } from '@/integrations/supabase/client';

const isDev = import.meta.env.DEV;

function noop(..._args: unknown[]) {
  // intentionally empty
}

// Persiste log na tabela error_logs do Supabase. Fire-and-forget — nao trava UI.
async function persistToSupabase(level: 'warn' | 'error', args: unknown[]) {
  try {
    const err = args.find((a) => a instanceof Error) as Error | undefined;
    const message = args.map(String).join(' ').slice(0, 2000);
    const context: Record<string, unknown> = {};
    args.forEach((a, i) => {
      if (a && typeof a === 'object' && !(a instanceof Error)) {
        try {
          context[`arg_${i}`] = JSON.parse(JSON.stringify(a));
        } catch {
          // ignore circular refs
        }
      }
    });
    await supabase.from('error_logs').insert({
      level,
      message,
      error_stack: err?.stack ?? null,
      context: Object.keys(context).length ? context : null,
      url: typeof window !== 'undefined' ? window.location.href : null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    });
  } catch {
    // Falha silenciosa — nao queremos cascade crashes do logger
  }
}

export const logger = {
  /** Only visible during development. */
  debug: isDev ? console.log.bind(console) : noop,

  /** Only visible during development. */
  info: isDev ? console.info.bind(console) : noop,

  /** Always visible. In prod: console + Sentry + Supabase error_logs. */
  warn: (...args: unknown[]) => {
    console.warn(...args);
    if (!isDev) {
      Sentry.captureMessage(args.map(String).join(' '), 'warning');
      persistToSupabase('warn', args);
    }
  },

  /** Always visible. In prod: console + Sentry + Supabase error_logs. */
  error: (...args: unknown[]) => {
    console.error(...args);
    if (!isDev) {
      const err = args.find(a => a instanceof Error);
      if (err) {
        Sentry.captureException(err);
      } else {
        Sentry.captureMessage(args.map(String).join(' '), 'error');
      }
      persistToSupabase('error', args);
    }
  },
};

// Captura erros nao-tratados globais (window.onerror + unhandledrejection)
if (typeof window !== 'undefined' && !isDev) {
  window.addEventListener('error', (event) => {
    persistToSupabase('error', [
      `[window.error] ${event.message}`,
      event.error || event.message,
    ]);
  });
  window.addEventListener('unhandledrejection', (event) => {
    persistToSupabase('error', [`[unhandledrejection]`, event.reason]);
  });
}
