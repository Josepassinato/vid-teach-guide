import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

interface ErrorLog {
  id: string;
  level: 'warn' | 'error';
  message: string;
  error_stack: string | null;
  context: Record<string, unknown> | null;
  url: string | null;
  user_agent: string | null;
  user_id: string | null;
  created_at: string;
}

export default function Logs() {
  const [logs, setLogs] = useState<ErrorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'error' | 'warn'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from('error_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (filter !== 'all') q = q.eq('level', filter);
    const { data } = await q;
    setLogs((data as ErrorLog[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000); // refresh every 10s
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const clearOld = async () => {
    if (!confirm('Apagar logs com mais de 7 dias?')) return;
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('error_logs').delete().lt('created_at', cutoff);
    load();
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Logs de Erro</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Captura automaticamente warnings e errors em produção (atualiza a cada 10s)
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/admin">
            <Button variant="outline">← Admin</Button>
          </Link>
          <Button onClick={load} variant="outline">↻ Refresh</Button>
          <Button onClick={clearOld} variant="destructive">🗑 Apagar +7d</Button>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <Button
          variant={filter === 'all' ? 'default' : 'outline'}
          onClick={() => setFilter('all')}
          size="sm"
        >
          Todos ({logs.length})
        </Button>
        <Button
          variant={filter === 'error' ? 'default' : 'outline'}
          onClick={() => setFilter('error')}
          size="sm"
        >
          🔴 Errors
        </Button>
        <Button
          variant={filter === 'warn' ? 'default' : 'outline'}
          onClick={() => setFilter('warn')}
          size="sm"
        >
          🟡 Warnings
        </Button>
      </div>

      {loading && <p className="text-muted-foreground">Carregando…</p>}

      {!loading && logs.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">
            Nenhum log encontrado. Bugs aparecerão aqui automaticamente em produção.
          </p>
        </Card>
      )}

      <div className="space-y-2">
        {logs.map((log) => {
          const isOpen = expanded === log.id;
          return (
            <Card
              key={log.id}
              className="p-4 cursor-pointer hover:bg-accent transition-colors"
              onClick={() => setExpanded(isOpen ? null : log.id)}
            >
              <div className="flex items-start gap-3">
                <Badge
                  variant={log.level === 'error' ? 'destructive' : 'default'}
                  className="flex-shrink-0"
                >
                  {log.level === 'error' ? '🔴 ERROR' : '🟡 WARN'}
                </Badge>
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-sm break-all">{log.message}</div>
                  <div className="text-xs text-muted-foreground mt-1 flex gap-3 flex-wrap">
                    <span>{new Date(log.created_at).toLocaleString('pt-BR')}</span>
                    {log.url && (
                      <span className="truncate max-w-xs" title={log.url}>
                        🌐 {new URL(log.url).pathname}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {isOpen && (
                <div className="mt-4 pt-4 border-t space-y-3 text-xs font-mono">
                  {log.error_stack && (
                    <div>
                      <div className="font-semibold text-muted-foreground mb-1">Stack:</div>
                      <pre className="whitespace-pre-wrap bg-muted p-2 rounded overflow-x-auto">
                        {log.error_stack}
                      </pre>
                    </div>
                  )}
                  {log.context && (
                    <div>
                      <div className="font-semibold text-muted-foreground mb-1">Context:</div>
                      <pre className="whitespace-pre-wrap bg-muted p-2 rounded overflow-x-auto">
                        {JSON.stringify(log.context, null, 2)}
                      </pre>
                    </div>
                  )}
                  {log.url && (
                    <div>
                      <div className="font-semibold text-muted-foreground">URL:</div>
                      <div className="break-all">{log.url}</div>
                    </div>
                  )}
                  {log.user_agent && (
                    <div>
                      <div className="font-semibold text-muted-foreground">User Agent:</div>
                      <div className="break-all">{log.user_agent}</div>
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
