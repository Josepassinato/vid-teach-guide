import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { VoiceChat } from '@/components/VoiceChat';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GraduationCap, Video, ChevronLeft, ChevronRight, CheckCircle, Circle, PlayCircle, Clock, BookOpen } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface SavedVideo {
  id: string;
  youtube_id: string;
  title: string;
  transcript: string | null;
  analysis: string | null;
  thumbnail_url: string | null;
  lesson_order: number;
  description: string | null;
  duration_minutes: number | null;
}

interface VideoInfo {
  videoId: string;
  title: string;
  author: string;
  thumbnail: string;
  hasTranscript?: boolean;
  transcript?: string | null;
  analysis: string;
  lessonNumber: number;
  description?: string | null;
  duration?: number | null;
}

const Student = () => {
  const [savedVideos, setSavedVideos] = useState<SavedVideo[]>([]);
  const [isLoadingVideos, setIsLoadingVideos] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState<VideoInfo | null>(null);
  const [showVideoList, setShowVideoList] = useState(true);
  const [currentLessonIndex, setCurrentLessonIndex] = useState(0);

  useEffect(() => {
    const loadSavedVideos = async () => {
      try {
        const { data, error } = await supabase
          .from('videos')
          .select('*')
          .order('lesson_order', { ascending: true });

        if (error) throw error;
        setSavedVideos(data || []);
        
        // Auto-select first lesson
        if (data && data.length > 0) {
          selectVideo(data[0], 0);
        }
      } catch (err) {
        console.error('Error loading saved videos:', err);
      } finally {
        setIsLoadingVideos(false);
      }
    };

    loadSavedVideos();
  }, []);

  const selectVideo = (video: SavedVideo, index: number) => {
    setSelectedVideo({
      videoId: video.youtube_id,
      title: video.title,
      author: '',
      thumbnail: video.thumbnail_url || `https://img.youtube.com/vi/${video.youtube_id}/hqdefault.jpg`,
      hasTranscript: !!video.transcript,
      transcript: video.transcript,
      analysis: video.analysis || `Vídeo: ${video.title}`,
      lessonNumber: video.lesson_order,
      description: video.description,
      duration: video.duration_minutes,
    });
    setCurrentLessonIndex(index);
    // On mobile, hide the video list after selection
    if (window.innerWidth < 1024) {
      setShowVideoList(false);
    }
  };

  const goToNextLesson = () => {
    if (currentLessonIndex < savedVideos.length - 1) {
      const nextVideo = savedVideos[currentLessonIndex + 1];
      selectVideo(nextVideo, currentLessonIndex + 1);
    }
  };

  const goToPreviousLesson = () => {
    if (currentLessonIndex > 0) {
      const prevVideo = savedVideos[currentLessonIndex - 1];
      selectVideo(prevVideo, currentLessonIndex - 1);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-3 sm:px-4 py-2 sm:py-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl gradient-primary">
              <GraduationCap className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold truncate">Sala de Aula</h1>
                {selectedVideo && (
                  <Badge variant="secondary" className="text-[10px]">
                    Aula {selectedVideo.lessonNumber} de {savedVideos.length}
                  </Badge>
                )}
              </div>
              <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                {selectedVideo?.title || 'Selecione uma aula para começar'}
              </p>
            </div>
            
            {/* Lesson Navigation */}
            {selectedVideo && (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={goToPreviousLesson}
                  disabled={currentLessonIndex === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={goToNextLesson}
                  disabled={currentLessonIndex === savedVideos.length - 1}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
            
            <ThemeToggle />
          </div>
          
          {/* Progress bar */}
          {savedVideos.length > 0 && (
            <div className="mt-2">
              <Progress value={((currentLessonIndex + 1) / savedVideos.length) * 100} className="h-1" />
            </div>
          )}
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
                {savedVideos.map((video, index) => (
                  <Card
                    key={video.id}
                    className={`cursor-pointer transition-all hover:bg-accent ${
                      selectedVideo?.videoId === video.youtube_id 
                        ? 'ring-2 ring-primary bg-accent' 
                        : ''
                    }`}
                    onClick={() => selectVideo(video, index)}
                  >
                    <CardContent className="p-2 flex gap-2 items-center">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                        {video.lesson_order}
                      </div>
                      <img
                        src={video.thumbnail_url || `https://img.youtube.com/vi/${video.youtube_id}/default.jpg`}
                        alt={video.title}
                        className="w-12 h-8 object-cover rounded flex-shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium line-clamp-1">{video.title}</p>
                        <div className="flex items-center gap-2 text-[9px] text-muted-foreground mt-0.5">
                          {video.duration_minutes && (
                            <span className="flex items-center gap-0.5">
                              <Clock className="h-2.5 w-2.5" />
                              {video.duration_minutes} min
                            </span>
                          )}
                          {video.transcript && (
                            <span className="text-green-600">✓ Transcrição</span>
                          )}
                        </div>
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
