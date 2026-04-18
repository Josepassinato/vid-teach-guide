/**
 * toastError — Centralized error-to-user-message helper for Supabase edge
 * function failures. Shows a clear pt-BR toast so users know *something*
 * went wrong (the silent-failure bug QA agent flagged).
 *
 * Intent: call this from every catch block that wraps
 * `supabase.functions.invoke(...)`. Progressive migration — add here first,
 * then the project can standardize over time.
 */
import { toast } from 'sonner';

interface SupabaseFnError {
  message?: string;
  context?: Response;
  name?: string;
}

export interface EdgeErrorOptions {
  /** User-facing action label in pt-BR — e.g. "carregar memória do tutor". */
  action: string;
  /** Optional: log prefix (e.g. "[TutorMemory]") for dev console grouping. */
  logScope?: string;
  /** Optional: show the toast only after N consecutive failures (avoid spam). */
  suppressFirstN?: number;
  /** Internal failure counter shared by scope. */
  counter?: { value: number };
}

export function toastEdgeError(err: unknown, opts: EdgeErrorOptions): void {
  const e = err as SupabaseFnError;
  const rawMsg = e?.message || (typeof err === 'string' ? err : 'unknown');

  const userMsg = humanize(rawMsg, opts.action);

  if (opts.counter) {
    opts.counter.value++;
    if (opts.suppressFirstN && opts.counter.value <= opts.suppressFirstN) {
      console.warn(`[${opts.logScope || 'edge'}] suppressed toast #${opts.counter.value}: ${rawMsg}`);
      return;
    }
  }

  toast.error(userMsg, {
    description: rawMsg.length > 120 ? rawMsg.slice(0, 120) + '…' : rawMsg,
    duration: 6000,
  });

  console.error(`[${opts.logScope || 'edge'}] ${opts.action}:`, err);
}

function humanize(raw: string, action: string): string {
  if (/cors|blocked by cors policy/i.test(raw)) {
    return `Falha de rede ao ${action}. O serviço pode estar offline — tentando de novo em instantes.`;
  }
  if (/failed to fetch|err_failed|networkerror/i.test(raw)) {
    return `Sem conexão com o servidor ao ${action}. Verifique sua internet.`;
  }
  if (/not_found|404/i.test(raw)) {
    return `Serviço não encontrado ao ${action}. Avise o suporte.`;
  }
  if (/unauthorized|401/i.test(raw)) {
    return `Sessão expirada. Faça login novamente.`;
  }
  if (/5\d\d|internal server error/i.test(raw)) {
    return `Erro interno do servidor ao ${action}. Tente novamente em alguns segundos.`;
  }
  return `Não foi possível ${action}. Tente novamente.`;
}
