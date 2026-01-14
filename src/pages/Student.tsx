import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { VoiceChat } from '@/components/VoiceChat';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GraduationCap, Video, ChevronLeft, ChevronRight } from 'lucide-react';

interface SavedVideo {
  id: string;
  youtube_id: string;
  title: string;
  transcript: string | null;
  analysis: string | null;
  thumbnail_url: string | null;
}

interface VideoInfo {
  videoId: string;
  title: string;
  author: string;
  thumbnail: string;
  hasTranscript?: boolean;
  transcript?: string | null;
  analysis: string;
}

const Student = () => {
  const [savedVideos, setSavedVideos] = useState<SavedVideo[]>([]);
  const [isLoadingVideos, setIsLoadingVideos] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState<VideoInfo | null>(null);
  const [showVideoList, setShowVideoList] = useState(true);

  useEffect(() => {
    const loadSavedVideos = async () => {
      try {
        const { data, error } = await supabase
          .from('videos')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;
        setSavedVideos(data || []);
        
        // Auto-select first video
        if (data && data.length > 0) {
          selectVideo(data[0]);
        }
      } catch (err) {
        console.error('Error loading saved videos:', err);
      } finally {
        setIsLoadingVideos(false);
      }
    };

    loadSavedVideos();
  }, []);

  const selectVideo = (video: SavedVideo) => {
    setSelectedVideo({
      videoId: video.youtube_id,
      title: video.title,
      author: '',
      thumbnail: video.thumbnail_url || `https://img.youtube.com/vi/${video.youtube_id}/hqdefault.jpg`,
      hasTranscript: !!video.transcript,
      transcript: video.transcript,
      analysis: video.analysis || `Vídeo: ${video.title}`,
    });
    // On mobile, hide the video list after selection
    if (window.innerWidth < 1024) {
      setShowVideoList(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-3 sm:px-4 py-3 flex items-center gap-2 sm:gap-3">
          <div className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl gradient-primary">
            <GraduationCap className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg sm:text-xl font-bold truncate">Sala de Aula</h1>
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              {selectedVideo?.title || 'Selecione um vídeo para começar'}
            </p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Video List Sidebar */}
        <div 
          className={`
            ${showVideoList ? 'w-full lg:w-64 xl:w-72' : 'w-0'} 
            border-r bg-card transition-all duration-300 overflow-hidden flex-shrink-0
          `}
        >
          <div className="p-3 h-full overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Video className="h-4 w-4 text-primary" />
                Aulas
              </h2>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 lg:hidden"
                onClick={() => setShowVideoList(false)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>

            {isLoadingVideos ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
                ))}
              </div>
            ) : savedVideos.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Nenhuma aula disponível
              </div>
            ) : (
              <div className="space-y-2">
                {savedVideos.map((video) => (
                  <Card
                    key={video.id}
                    className={`cursor-pointer transition-all hover:bg-accent ${
                      selectedVideo?.videoId === video.youtube_id 
                        ? 'ring-2 ring-primary bg-accent' 
                        : ''
                    }`}
                    onClick={() => selectVideo(video)}
                  >
                    <CardContent className="p-2 flex gap-2">
                      <img
                        src={video.thumbnail_url || `https://img.youtube.com/vi/${video.youtube_id}/default.jpg`}
                        alt={video.title}
                        className="w-16 h-10 object-cover rounded flex-shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium line-clamp-2">{video.title}</p>
                        {video.transcript && (
                          <p className="text-[9px] text-green-600 mt-0.5">✓ Com transcrição</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Toggle Sidebar Button (when hidden) */}
        {!showVideoList && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-0 top-1/2 -translate-y-1/2 z-20 h-12 w-6 rounded-l-none bg-card border border-l-0"
            onClick={() => setShowVideoList(true)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}

        {/* Main Content Area - Video + Chat */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedVideo ? (
            <VoiceChat
              videoContext={selectedVideo.transcript || selectedVideo.analysis}
              videoId={selectedVideo.videoId}
              videoTitle={selectedVideo.title}
              videoTranscript={selectedVideo.transcript}
              isStudentMode={true}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center bg-muted/30">
              <div className="text-center p-8">
                <GraduationCap className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
                <h2 className="text-xl font-semibold mb-2">Bem-vindo à Sala de Aula</h2>
                <p className="text-muted-foreground mb-4">
                  Selecione uma aula na lista para começar a aprender
                </p>
                <Button onClick={() => setShowVideoList(true)}>
                  <Video className="h-4 w-4 mr-2" />
                  Ver Aulas Disponíveis
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Student;
