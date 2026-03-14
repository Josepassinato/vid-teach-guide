/**
 * Lightweight logger that suppresses debug/info logs in production.
 * Only warnings and errors are always visible.
 *
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   logger.debug('[GeminiLive]', 'connecting...');
 *   logger.warn('[GeminiLive]', 'fallback model');
 *   logger.error('[GeminiLive]', 'connection failed', err);
 */

const isDev = import.meta.env.DEV;

function noop(..._args: unknown[]) {
  // intentionally empty
}

export const logger = {
  /** Only visible during development (vite dev server). */
  debug: isDev ? console.log.bind(console) : noop,

  /** Only visible during development. */
  info: isDev ? console.info.bind(console) : noop,

  /** Always visible. */
  warn: console.warn.bind(console),

  /** Always visible. */
  error: console.error.bind(console),
};
