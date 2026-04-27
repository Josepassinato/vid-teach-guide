/**
 * Editor de overlays de video — admin pode adicionar texto/animacao/destaque
 * sincronizados com timestamps do video. Salva em lesson_overlays.
 */
import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import type { Overlay } from '@/components/VideoOverlays';

interface VideoData {
  id: string;
  title: string;
  video_url: string | null;
  video_type: string;
  overlays_enabled: boolean;
}

export default function EditVideo() {
  const { id } = useParams<{ id: string }>();
  const [video, setVideo] = useState<VideoData | null>(null);
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [editing, setEditing] = useState<Partial<Overlay>>({});
  const [isOpen, setIsOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const loadVideo = async () => {
    if (!id) return;
    const { data: vid } = await supabase
      .from('videos')
      .select('id,title,video_url,video_type,overlays_enabled')
      .eq('id', id)
      .single();
    if (vid) setVideo(vid as VideoData);
    const { data: ovs } = await supabase.from('lesson_overlays').select('*').eq('video_id', id).order('start_sec');
    if (ovs) setOverlays(ovs as Overlay[]);
  };

  const toggleEnabled = async () => {
    if (!video) return;
    const next = !video.overlays_enabled;
    await supabase.from('videos').update({ overlays_enabled: next }).eq('id', video.id);
    setVideo({ ...video, overlays_enabled: next });
    toast.success(next ? 'Overlays ATIVADOS — alunos verão as animações' : 'Overlays desativados — vídeo roda normal');
  };

  useEffect(() => { loadVideo(); /* eslint-disable-next-line */ }, [id]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setCurrentTime(v.currentTime);
    v.addEventListener('timeupdate', onTime);
    return () => v.removeEventListener('timeupdate', onTime);
  }, [video]);

  const newOverlay = () => {
    setEditing({
      type: 'text',
      content: '',
      start_sec: Math.floor(currentTime),
      end_sec: Math.floor(currentTime) + 5,
      position_x: 50,
      position_y: 80,
      animation: 'fadeIn',
      bg_color: '#000000aa',
      text_color: '#ffffff',
      font_size: 24,
    });
    setIsOpen(true);
  };

  const editOverlay = (o: Overlay) => {
    setEditing(o);
    setIsOpen(true);
  };

  const saveOverlay = async () => {
    if (!id || !editing.content) {
      toast.error('Conteúdo é obrigatório');
      return;
    }
    const payload = {
      video_id: id,
      type: editing.type || 'text',
      content: editing.content,
      start_sec: Number(editing.start_sec) || 0,
      end_sec: Number(editing.end_sec) || 5,
      position_x: Number(editing.position_x) || 50,
      position_y: Number(editing.position_y) || 80,
      animation: editing.animation || 'fadeIn',
      bg_color: editing.bg_color || '#000000aa',
      text_color: editing.text_color || '#ffffff',
      font_size: Number(editing.font_size) || 24,
    };
    if (editing.id) {
      await supabase.from('lesson_overlays').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('lesson_overlays').insert(payload);
    }
    toast.success('Overlay salvo');
    setIsOpen(false);
    loadVideo();
  };

  const deleteOverlay = async (overlayId: string) => {
    if (!confirm('Apagar este overlay?')) return;
    await supabase.from('lesson_overlays').delete().eq('id', overlayId);
    toast.success('Overlay apagado');
    loadVideo();
  };

  const seekTo = (sec: number) => {
    if (videoRef.current) videoRef.current.currentTime = sec;
  };

  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  const activeNow = overlays.filter((o) => currentTime >= o.start_sec && currentTime <= o.end_sec);

  if (!video) return <div className="p-6">Carregando…</div>;

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <Link to="/admin"><Button variant="outline" size="sm">← Admin</Button></Link>
          <h1 className="text-2xl font-bold mt-2">Editor: {video.title}</h1>
          <p className="text-sm text-muted-foreground">Adicione textos e destaques sincronizados com o vídeo</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Toggle: ativar/desativar overlays para os alunos */}
          <Button
            onClick={toggleEnabled}
            variant={video.overlays_enabled ? 'default' : 'outline'}
            className={video.overlays_enabled ? 'bg-green-600 hover:bg-green-700' : ''}
          >
            {video.overlays_enabled ? '🟢 Animações ATIVADAS' : '⚪ Animações desativadas'}
          </Button>
          <Button onClick={newOverlay}>+ Adicionar Overlay</Button>
        </div>
      </div>
      {!video.overlays_enabled && overlays.length > 0 && (
        <div className="mb-4 p-3 rounded bg-yellow-100 border border-yellow-300 text-yellow-900 text-sm">
          ⚠ Você tem {overlays.length} overlay(s) cadastrado(s), mas as animações estão <strong>desativadas</strong>.
          Os alunos vão ver o vídeo normal. Clique em "🟢 Animações ATIVADAS" para liberar.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Video player com preview de overlays */}
        <div className="lg:col-span-2">
          <Card className="overflow-hidden">
            <div className="relative bg-black aspect-video">
              {video.video_url && (
                <video
                  ref={videoRef}
                  src={video.video_url}
                  controls
                  className="absolute inset-0 w-full h-full object-contain"
                />
              )}
              {/* Preview overlays */}
              <div className="absolute inset-0 pointer-events-none">
                {activeNow.map((o) => (
                  <div
                    key={o.id}
                    className="absolute"
                    style={{
                      left: `${o.position_x}%`,
                      top: `${o.position_y}%`,
                      transform: 'translate(-50%, -50%)',
                      background: o.bg_color,
                      color: o.text_color,
                      padding: '12px 24px',
                      borderRadius: o.type === 'highlight' ? '999px' : '12px',
                      fontSize: `${o.font_size}px`,
                      fontWeight: o.type === 'highlight' ? 700 : 600,
                      whiteSpace: o.type === 'highlight' ? 'nowrap' : 'pre-wrap',
                      maxWidth: '80%',
                      textAlign: 'center',
                    }}
                  >
                    {o.content}
                  </div>
                ))}
              </div>
            </div>
            <div className="p-3 text-sm text-muted-foreground">
              Tempo atual: <span className="font-mono font-bold">{fmtTime(currentTime)}</span>
            </div>
          </Card>
        </div>

        {/* Lista de overlays */}
        <div>
          <Card className="p-4">
            <h3 className="font-bold mb-3">Overlays ({overlays.length})</h3>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {overlays.length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhum overlay. Clique em "Adicionar Overlay".</p>
              )}
              {overlays.map((o) => (
                <div key={o.id} className="border rounded p-2 hover:bg-accent text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold capitalize">{o.type}</span>
                    <span className="font-mono">{fmtTime(o.start_sec)} → {fmtTime(o.end_sec)}</span>
                  </div>
                  <div className="my-1 truncate">{o.content}</div>
                  <div className="flex gap-1 mt-1">
                    <Button size="sm" variant="ghost" onClick={() => seekTo(o.start_sec)}>▶ Ir</Button>
                    <Button size="sm" variant="ghost" onClick={() => editOverlay(o)}>✎ Editar</Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteOverlay(o.id)}>🗑</Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Modal de edicao */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">{editing.id ? 'Editar' : 'Novo'} Overlay</h3>
            <div className="space-y-3">
              <div>
                <Label>Tipo</Label>
                <select
                  className="w-full border rounded p-2 bg-background"
                  value={editing.type || 'text'}
                  onChange={(e) => setEditing({ ...editing, type: e.target.value as Overlay['type'] })}
                >
                  <option value="text">Texto</option>
                  <option value="highlight">Destaque (pílula)</option>
                  <option value="image">Imagem (URL)</option>
                </select>
              </div>
              <div>
                <Label>Conteúdo</Label>
                <Input
                  value={editing.content || ''}
                  onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                  placeholder="Texto a exibir ou URL da imagem"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Início (s)</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={editing.start_sec ?? 0}
                    onChange={(e) => setEditing({ ...editing, start_sec: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Fim (s)</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={editing.end_sec ?? 5}
                    onChange={(e) => setEditing({ ...editing, end_sec: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Posição X (%)</Label>
                  <Input
                    type="number"
                    min="0" max="100"
                    value={editing.position_x ?? 50}
                    onChange={(e) => setEditing({ ...editing, position_x: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Posição Y (%)</Label>
                  <Input
                    type="number"
                    min="0" max="100"
                    value={editing.position_y ?? 80}
                    onChange={(e) => setEditing({ ...editing, position_y: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div>
                <Label>Animação</Label>
                <select
                  className="w-full border rounded p-2 bg-background"
                  value={editing.animation || 'fadeIn'}
                  onChange={(e) => setEditing({ ...editing, animation: e.target.value })}
                >
                  <option value="fadeIn">Fade In</option>
                  <option value="slideUp">Slide Up</option>
                  <option value="slideDown">Slide Down</option>
                  <option value="pulse">Pulse</option>
                  <option value="bounce">Bounce</option>
                  <option value="none">Sem animação</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Cor fundo</Label>
                  <Input
                    type="text"
                    value={editing.bg_color || '#000000aa'}
                    onChange={(e) => setEditing({ ...editing, bg_color: e.target.value })}
                    placeholder="#000000aa"
                  />
                </div>
                <div>
                  <Label>Cor texto</Label>
                  <Input
                    type="text"
                    value={editing.text_color || '#ffffff'}
                    onChange={(e) => setEditing({ ...editing, text_color: e.target.value })}
                    placeholder="#ffffff"
                  />
                </div>
              </div>
              <div>
                <Label>Tamanho fonte (px)</Label>
                <Input
                  type="number"
                  min="10" max="80"
                  value={editing.font_size ?? 24}
                  onChange={(e) => setEditing({ ...editing, font_size: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-6">
              <Button variant="outline" onClick={() => setIsOpen(false)}>Cancelar</Button>
              <Button onClick={saveOverlay}>Salvar</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
