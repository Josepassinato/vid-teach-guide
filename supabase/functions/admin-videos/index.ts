import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simple admin password - in production, use proper auth
const ADMIN_PASSWORD = Deno.env.get("ADMIN_PASSWORD") || "admin123";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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
          .order("created_at", { ascending: false });

        if (error) throw error;
        return new Response(
          JSON.stringify({ videos: data }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "add": {
        if (!video?.youtube_id || !video?.title) {
          throw new Error("youtube_id e title são obrigatórios");
        }

        const { data, error } = await supabase
          .from("videos")
          .insert({
            youtube_id: video.youtube_id,
            title: video.title,
            transcript: video.transcript || null,
            analysis: video.analysis || null,
            thumbnail_url: video.thumbnail_url || `https://img.youtube.com/vi/${video.youtube_id}/hqdefault.jpg`,
          })
          .select()
          .single();

        if (error) throw error;
        return new Response(
          JSON.stringify({ video: data, message: "Vídeo adicionado com sucesso" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "update": {
        if (!video?.id) {
          throw new Error("id é obrigatório para atualização");
        }

        const { data, error } = await supabase
          .from("videos")
          .update({
            title: video.title,
            transcript: video.transcript,
            analysis: video.analysis,
            thumbnail_url: video.thumbnail_url,
          })
          .eq("id", video.id)
          .select()
          .single();

        if (error) throw error;
        return new Response(
          JSON.stringify({ video: data, message: "Vídeo atualizado com sucesso" }),
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
