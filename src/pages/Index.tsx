import { useState } from 'react';
import { VideoAnalysis } from '@/components/VideoAnalysis';
import { VoiceChat } from '@/components/VoiceChat';
import { ThemeToggle } from '@/components/ThemeToggle';
import { GraduationCap, Sparkles } from 'lucide-react';

interface VideoInfo {
  videoId: string;
  title: string;
  author: string;
  thumbnail: string;
  hasTranscript?: boolean;
  transcript?: string | null;
  analysis: string;
}

const Index = () => {
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center gap-2 sm:gap-3">
          <div className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl gradient-primary">
            <GraduationCap className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg sm:text-xl font-bold truncate">Professor IA</h1>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Aprenda com voz em tempo real</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
              <Sparkles className="h-3 w-3" />
              <span>Powered by OpenAI</span>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-3 sm:px-4 py-4 sm:py-6 overflow-y-auto">
        <div className="flex flex-col lg:grid lg:grid-cols-2 gap-4 sm:gap-6 lg:h-[calc(100vh-120px)]">
          {/* Left Panel - Video Analysis */}
          <div className="space-y-3 sm:space-y-4 lg:overflow-auto">
            <div className="bg-card rounded-lg sm:rounded-xl p-4 sm:p-6 shadow-soft">
              <h2 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 flex items-center gap-2">
                <span className="text-xl sm:text-2xl">📹</span>
                Adicionar Vídeo-Aula
              </h2>
              <VideoAnalysis onVideoAnalyzed={setVideoInfo} />
            </div>
            
            {!videoInfo && (
              <div className="bg-muted/50 rounded-lg sm:rounded-xl p-4 sm:p-8 text-center">
                <div className="text-3xl sm:text-4xl mb-2 sm:mb-3">🎓</div>
                <h3 className="font-medium mb-2 text-sm sm:text-base">Como funciona</h3>
                <ol className="text-xs sm:text-sm text-muted-foreground text-left max-w-md mx-auto space-y-1.5 sm:space-y-2">
                  <li className="flex gap-2">
                    <span className="font-semibold text-primary">1.</span>
                    Cole o link de um vídeo-aula do YouTube
                  </li>
                  <li className="flex gap-2">
                    <span className="font-semibold text-primary">2.</span>
                    O professor IA analisa os pontos principais
                  </li>
                  <li className="flex gap-2">
                    <span className="font-semibold text-primary">3.</span>
                    Converse por voz em tempo real para tirar dúvidas
                  </li>
                </ol>
              </div>
            )}
          </div>
          
          {/* Right Panel - Voice Chat */}
          <div className="min-h-[400px] lg:h-full">
            <VoiceChat 
              videoContext={videoInfo?.transcript || videoInfo?.analysis} 
              videoId={videoInfo?.videoId}
              videoTitle={videoInfo?.title}
            />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
