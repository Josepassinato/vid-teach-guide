import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Youtube, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface VideoInfo {
  videoId: string;
  title: string;
  author: string;
  thumbnail: string;
  hasTranscript?: boolean;
  analysis: string;
}

interface VideoAnalysisProps {
  onVideoAnalyzed: (videoInfo: VideoInfo) => void;
}

export function VideoAnalysis({ onVideoAnalyzed }: VideoAnalysisProps) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);

  const handleAnalyze = async () => {
    if (!url.trim()) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: fnError } = await supabase.functions.invoke('analyze-youtube', {
        body: { youtubeUrl: url }
      });
      
      if (fnError) throw new Error(fnError.message);
      if (data.error) throw new Error(data.error);
      
      setVideoInfo(data);
      onVideoAnalyzed(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze video');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Cole o link do YouTube aqui..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
            className="pl-11"
          />
        </div>
        <Button onClick={handleAnalyze} disabled={loading || !url.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Analisar'}
        </Button>
      </div>
      
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
      
      {videoInfo && (
        <Card className="overflow-hidden">
          <div className="flex flex-col md:flex-row">
            <div className="relative w-full md:w-64 flex-shrink-0">
              <img 
                src={videoInfo.thumbnail} 
                alt={videoInfo.title}
                className="w-full h-36 md:h-full object-cover"
              />
              <a 
                href={`https://youtube.com/watch?v=${videoInfo.videoId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 transition-opacity"
              >
                <ExternalLink className="h-8 w-8 text-white" />
              </a>
            </div>
            <div className="flex-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg line-clamp-2">{videoInfo.title}</CardTitle>
                <p className="text-sm text-muted-foreground">{videoInfo.author}</p>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="text-sm font-medium">📚 Pontos principais:</h4>
                    {videoInfo.hasTranscript ? (
                      <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 px-2 py-0.5 rounded-full">
                        ✓ Baseado na transcrição
                      </span>
                    ) : (
                      <span className="text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 px-2 py-0.5 rounded-full">
                        Baseado no título
                      </span>
                    )}
                  </div>
                  <div className="text-sm whitespace-pre-wrap text-muted-foreground">
                    {videoInfo.analysis}
                  </div>
                </div>
              </CardContent>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
