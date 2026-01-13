import { useState } from 'react';
import { VideoAnalysis } from '@/components/VideoAnalysis';
import { VoiceChat } from '@/components/VoiceChat';
import { GraduationCap, Sparkles } from 'lucide-react';

interface VideoInfo {
  videoId: string;
  title: string;
  author: string;
  thumbnail: string;
  analysis: string;
}

const Index = () => {
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <div className="p-2 rounded-xl gradient-primary">
            <GraduationCap className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Professor IA</h1>
            <p className="text-xs text-muted-foreground">Aprenda com voz em tempo real</p>
          </div>
          <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <Sparkles className="h-3 w-3" />
            <span>Powered by Gemini</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-2 gap-6 h-[calc(100vh-120px)]">
          {/* Left Panel - Video Analysis */}
          <div className="space-y-4 overflow-auto">
            <div className="bg-card rounded-xl p-6 shadow-soft">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="text-2xl">📹</span>
                Adicionar Vídeo-Aula
              </h2>
              <VideoAnalysis onVideoAnalyzed={setVideoInfo} />
            </div>
            
            {!videoInfo && (
              <div className="bg-muted/50 rounded-xl p-8 text-center">
                <div className="text-4xl mb-3">🎓</div>
                <h3 className="font-medium mb-2">Como funciona</h3>
                <ol className="text-sm text-muted-foreground text-left max-w-md mx-auto space-y-2">
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
          <div className="h-full">
            <VoiceChat videoContext={videoInfo?.analysis} />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
