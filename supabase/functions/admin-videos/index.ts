import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

// Simple admin password - in production, use proper auth
const ADMIN_PASSWORD = Deno.env.get("ADMIN_PASSWORD") || "admin123";

serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  try {
    const { action, password, video } = await req.json();

    // Verify admin password
    if (password !== ADMIN_PASSWORD) {
      return new Response(
        JSON.stringify({ error: "Senha incorreta" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    switch (action) {
      case "list": {
        const { data, error } = await supabase
          .from("videos")
          .select("*")
          .order("lesson_order", { ascending: true });

        if (error) throw error;
        return new Response(
          JSON.stringify({ videos: data }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "add": {
        if (!video?.title) {
          throw new Error("title é obrigatório");
        }
        const videoType = video.video_type || (video.youtube_id ? 'youtube' : 'direct');
        if (videoType === 'youtube' && !video.youtube_id) {
          throw new Error("youtube_id obrigatório para video_type=youtube");
        }
        if (videoType !== 'youtube' && !video.video_url) {
          throw new Error("video_url obrigatório para video_type=direct");
        }

        let finalVideoUrl: string | null = video.video_url || null;
        let storageMirrored = false;

        // Se for URL externa (S3 signed, MP4, qualquer http externo), baixa e mirroreia no Supabase Storage.
        // Garante persistencia: URLs S3 pre-signed expiram → video fica permanente no nosso bucket.
        if (videoType !== 'youtube' && finalVideoUrl && /^https?:\/\//.test(finalVideoUrl)) {
          try {
            console.log('[admin-videos] Mirroreando video externo:', finalVideoUrl.substring(0, 80));
            const dl = await fetch(finalVideoUrl);
            if (!dl.ok) throw new Error(`download HTTP ${dl.status}`);
            const blob = await dl.blob();
            const sizeMB = Math.round(blob.size / 1024 / 1024);
            console.log(`[admin-videos] Baixado: ${sizeMB}MB, content-type: ${dl.headers.get('content-type')}`);

            const ext = (dl.headers.get('content-type') || '').includes('mp4') ? 'mp4' : 'mp4';
            const fileName = `${crypto.randomUUID()}.${ext}`;
            const path = `lessons/${fileName}`;

            // Tenta upload no bucket 'videos' (criar se nao existir)
            const { error: bucketErr } = await supabase.storage.createBucket('videos', {
              public: true,
              fileSizeLimit: 500 * 1024 * 1024, // 500MB
              allowedMimeTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
            });
            // Ignora erro se bucket ja existe
            if (bucketErr && !bucketErr.message?.includes('already exists')) {
              console.warn('[admin-videos] createBucket warn:', bucketErr.message);
            }

            const { error: upErr } = await supabase.storage
              .from('videos')
              .upload(path, blob, { contentType: 'video/mp4', upsert: false });
            if (upErr) throw upErr;

            const { data: pub } = supabase.storage.from('videos').getPublicUrl(path);
            finalVideoUrl = pub.publicUrl;
            storageMirrored = true;
            console.log('[admin-videos] Storage URL:', finalVideoUrl);
          } catch (e) {
            // Mirror falhou — mantem URL original como fallback (pelo menos cadastra)
            console.warn('[admin-videos] Mirror falhou, mantendo URL original:', (e as Error).message);
          }
        }

        const { data, error } = await supabase
          .from("videos")
          .insert({
            youtube_id: video.youtube_id || null,
            video_url: finalVideoUrl,
            video_type: videoType,
            title: video.title,
            transcript: video.transcript || null,
            analysis: video.analysis || null,
            description: video.description || null,
            duration_minutes: video.duration_minutes || null,
            lesson_order: video.lesson_order || 1,
            teaching_moments: video.teaching_moments || [],
            is_configured: video.is_configured || false,
            thumbnail_url: video.thumbnail_url || (video.youtube_id ? `https://img.youtube.com/vi/${video.youtube_id}/hqdefault.jpg` : null),
          })
          .select()
          .single();

        if (error) throw error;
        return new Response(
          JSON.stringify({
            video: data,
            message: storageMirrored
              ? 'Aula adicionada — vídeo mirroreado no Supabase Storage (URL permanente)'
              : 'Aula adicionada com sucesso',
            storageMirrored,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "update": {
        if (!video?.id) {
          throw new Error("id é obrigatório para atualização");
        }

        // Build update object with only provided fields
        const updateData: Record<string, unknown> = {};
        if (video.title !== undefined) updateData.title = video.title;
        if (video.transcript !== undefined) updateData.transcript = video.transcript;
        if (video.analysis !== undefined) updateData.analysis = video.analysis;
        if (video.description !== undefined) updateData.description = video.description;
        if (video.duration_minutes !== undefined) updateData.duration_minutes = video.duration_minutes;
        if (video.lesson_order !== undefined) updateData.lesson_order = video.lesson_order;
        if (video.thumbnail_url !== undefined) updateData.thumbnail_url = video.thumbnail_url;
        if (video.teaching_moments !== undefined) updateData.teaching_moments = video.teaching_moments;
        if (video.is_configured !== undefined) updateData.is_configured = video.is_configured;
        if (video.is_released !== undefined) updateData.is_released = video.is_released;
        if (video.teacher_intro !== undefined) updateData.teacher_intro = video.teacher_intro;

        const { data, error } = await supabase
          .from("videos")
          .update(updateData)
          .eq("id", video.id)
          .select()
          .single();

        if (error) throw error;
        return new Response(
          JSON.stringify({ video: data, message: "Aula atualizada com sucesso" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "reorder": {
        // Receive an array of { id, lesson_order } and update all
        const { videos } = await req.json().catch(() => ({ videos: video }));
        const videosToUpdate = videos || video;
        
        if (!Array.isArray(videosToUpdate)) {
          throw new Error("Array de vídeos é obrigatório para reordenação");
        }

        for (const v of videosToUpdate) {
          const { error } = await supabase
            .from("videos")
            .update({ lesson_order: v.lesson_order })
            .eq("id", v.id);
          
          if (error) throw error;
        }

        return new Response(
          JSON.stringify({ message: "Ordem atualizada com sucesso" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "delete": {
        if (!video?.id) {
          throw new Error("id é obrigatório para exclusão");
        }

        const { error } = await supabase
          .from("videos")
          .delete()
          .eq("id", video.id);

        if (error) throw error;
        return new Response(
          JSON.stringify({ message: "Vídeo excluído com sucesso" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        throw new Error("Ação inválida");
    }
  } catch (error) {
    console.error("Admin videos error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
