/**
 * Renders timed overlays on top of a video player.
 * Fetches from lesson_overlays table by video_id.
 * Activates when currentTime is between start_sec and end_sec.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Overlay {
  id: string;
  video_id: string;
  type: 'text' | 'highlight' | 'image';
  content: string;
  start_sec: number;
  end_sec: number;
  position_x: number;
  position_y: number;
  animation: string;
  bg_color: string;
  text_color: string;
  font_size: number;
}

interface VideoOverlaysProps {
  videoId: string;
  currentTime: number;
}

export function VideoOverlays({ videoId, currentTime }: VideoOverlaysProps) {
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;

    // Verifica se o video tem overlays HABILITADOS — admin precisa ligar manualmente.
    // Se nao, o video roda normal (sem nenhum overlay aparecendo).
    supabase
      .from('videos')
      .select('overlays_enabled')
      .eq('id', videoId)
      .single()
      .then(({ data }) => {
        if (cancelled) return;
        const isOn = !!(data && (data as { overlays_enabled?: boolean }).overlays_enabled);
        setEnabled(isOn);
        if (!isOn) return;

        // Busca overlays so se enabled
        supabase
          .from('lesson_overlays')
          .select('*')
          .eq('video_id', videoId)
          .order('start_sec', { ascending: true })
          .then(({ data: ovs }) => {
            if (!cancelled && ovs) setOverlays(ovs as Overlay[]);
          });
      });
    return () => { cancelled = true; };
  }, [videoId]);

  if (!enabled) return null;

  const active = overlays.filter(
    (o) => currentTime >= o.start_sec && currentTime <= o.end_sec
  );

  if (active.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      {active.map((o) => {
        const animationClass = (() => {
          switch (o.animation) {
            case 'fadeIn': return 'animate-in fade-in duration-500';
            case 'slideUp': return 'animate-in slide-in-from-bottom-4 fade-in duration-500';
            case 'slideDown': return 'animate-in slide-in-from-top-4 fade-in duration-500';
            case 'pulse': return 'animate-pulse';
            case 'typewriter': return 'overlay-typewriter';
            case 'bounce': return 'animate-bounce';
            default: return 'animate-in fade-in duration-300';
          }
        })();

        if (o.type === 'image') {
          return (
            <div
              key={o.id}
              className={`absolute ${animationClass}`}
              style={{
                left: `${o.position_x}%`,
                top: `${o.position_y}%`,
                transform: 'translate(-50%, -50%)',
                maxWidth: '40%',
              }}
            >
              <img src={o.content} alt="" className="rounded-lg shadow-2xl" />
            </div>
          );
        }

        if (o.type === 'highlight') {
          return (
            <div
              key={o.id}
              className={`absolute ${animationClass}`}
              style={{
                left: `${o.position_x}%`,
                top: `${o.position_y}%`,
                transform: 'translate(-50%, -50%)',
                background: o.bg_color,
                color: o.text_color,
                padding: '8px 16px',
                borderRadius: '999px',
                fontSize: `${o.font_size}px`,
                fontWeight: 700,
                boxShadow: `0 0 20px ${o.bg_color}`,
                whiteSpace: 'nowrap',
              }}
            >
              {o.content}
            </div>
          );
        }

        // text (default)
        return (
          <div
            key={o.id}
            className={`absolute ${animationClass}`}
            style={{
              left: `${o.position_x}%`,
              top: `${o.position_y}%`,
              transform: 'translate(-50%, -50%)',
              background: o.bg_color,
              color: o.text_color,
              padding: '12px 24px',
              borderRadius: '12px',
              fontSize: `${o.font_size}px`,
              fontWeight: 600,
              backdropFilter: 'blur(8px)',
              maxWidth: '80%',
              textAlign: 'center',
              whiteSpace: 'pre-wrap',
            }}
          >
            {o.content}
          </div>
        );
      })}
    </div>
  );
}
