import { forwardRef, useImperativeHandle, useRef, useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { VideoTimeline } from '@/components/VideoTimeline';
import { Play, Pause, RotateCcw, Volume2, VolumeX, Volume1, Maximize, Minimize } from 'lucide-react';

export interface DirectVideoPlayerRef {
  play: () => void;
  pause: () => void;
  restart: () => void;
  seekTo: (seconds: number) => void;
  getCurrentTime: () => number;
  isPaused: () => boolean;
  unlockPlayback: () => void;
}

export type DirectVideoPlayerProps = {
  videoUrl: string;
  title?: string;
  expanded?: boolean;
  onEnded?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  onSeek?: (seconds: number) => void;
  teachingMoments?: Array<{ timestamp_seconds: number; topic?: string }>;
  quizTimestamps?: number[];
};

export const DirectVideoPlayer = forwardRef<DirectVideoPlayerRef, DirectVideoPlayerProps>(
  function DirectVideoPlayer({ videoUrl, title, expanded = false, onEnded, onPlay, onPause, onSeek, teachingMoments = [], quizTimestamps = [] }, ref) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [volume, setVolume] = useState(100);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isReady, setIsReady] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      const handleLoadedMetadata = () => {
        setDuration(video.duration);
        setIsReady(true);
      };

      const handleTimeUpdate = () => {
        setCurrentTime(video.currentTime);
      };

      const handlePlay = () => {
        setIsPlaying(true);
        onPlay?.();
      };
      const handlePause = () => {
        setIsPlaying(false);
        onPause?.();
      };
      const handleEnded = () => {
        setIsPlaying(false);
        onEnded?.();
      };
      const handleSeeked = () => {
        onSeek?.(video.currentTime);
      };

      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      video.addEventListener('timeupdate', handleTimeUpdate);
      video.addEventListener('play', handlePlay);
      video.addEventListener('pause', handlePause);
      video.addEventListener('ended', handleEnded);
      video.addEventListener('seeked', handleSeeked);

      return () => {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.removeEventListener('timeupdate', handleTimeUpdate);
        video.removeEventListener('play', handlePlay);
        video.removeEventListener('pause', handlePause);
        video.removeEventListener('ended', handleEnded);
        video.removeEventListener('seeked', handleSeeked);
      };
    }, [onEnded, onPlay, onPause, onSeek]);

    useImperativeHandle(ref, () => ({
      play: () => {
        videoRef.current?.play();
      },
      pause: () => {
        videoRef.current?.pause();
      },
      restart: () => {
        if (videoRef.current) {
          videoRef.current.currentTime = 0;
          videoRef.current.play();
        }
      },
      seekTo: (seconds: number) => {
        if (videoRef.current) {
          videoRef.current.currentTime = seconds;
        }
      },
      getCurrentTime: () => {
        return videoRef.current?.currentTime || 0;
      },
      isPaused: () => {
        return videoRef.current?.paused ?? true;
      },
      unlockPlayback: () => {
        // Direct video doesn't need unlock, but keep API compatible
        console.log('DirectVideoPlayer: unlockPlayback called (no-op for direct video)');
      },
    }), []);

    const handlePlay = () => videoRef.current?.play();
    const handlePause = () => videoRef.current?.pause();
    const handleRestart = () => {
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.play();
      }
    };

    const handleMute = () => {
      if (videoRef.current) {
        videoRef.current.muted = !isMuted;
        setIsMuted(!isMuted);
      }
    };

    const handleVolumeChange = (value: number[]) => {
      const newVolume = value[0];
      setVolume(newVolume);
      if (videoRef.current) {
        videoRef.current.volume = newVolume / 100;
        if (newVolume === 0) {
          videoRef.current.muted = true;
          setIsMuted(true);
        } else if (isMuted) {
          videoRef.current.muted = false;
          setIsMuted(false);
        }
      }
    };

    const getVolumeIcon = () => {
      if (isMuted || volume === 0) return <VolumeX className="h-3.5 w-3.5 sm:h-4 sm:w-4" />;
      if (volume < 50) return <Volume1 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />;
      return <Volume2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />;
    };

    const toggleFullscreen = async () => {
      if (!containerRef.current) return;
      
      try {
        if (!document.fullscreenElement) {
          await containerRef.current.requestFullscreen();
          setIsFullscreen(true);
        } else {
          await document.exitFullscreen();
          setIsFullscreen(false);
        }
      } catch (err) {
        console.warn('Fullscreen error:', err);
      }
    };

    useEffect(() => {
      const handleFullscreenChange = () => {
        setIsFullscreen(!!document.fullscreenElement);
      };
      
      document.addEventListener('fullscreenchange', handleFullscreenChange);
      return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    return (
      <Card ref={containerRef} className={`overflow-hidden transition-all duration-300 ${expanded || isFullscreen ? 'h-full border-0 rounded-none' : ''} ${isFullscreen ? 'bg-black' : ''}`}>
        <div className={`relative bg-black ${expanded || isFullscreen ? 'h-[calc(100%-56px)]' : 'aspect-video'}`}>
          <video
            ref={videoRef}
            src={videoUrl}
            className="absolute inset-0 w-full h-full object-contain"
            playsInline
            preload="metadata"
          />
          
          {!isReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted">
              <div className="animate-pulse text-muted-foreground">Carregando vídeo...</div>
            </div>
          )}
        </div>
        
        {/* Custom Controls */}
        <div className={`p-2 sm:p-3 border-t ${isFullscreen ? 'bg-black/90' : 'bg-card'}`}>
          <VideoTimeline
            currentTime={currentTime}
            duration={duration}
            onSeek={(seconds) => {
              if (videoRef.current) videoRef.current.currentTime = seconds;
            }}
            teachingMoments={teachingMoments}
            quizTimestamps={quizTimestamps}
            className="mb-3"
          />
          
          <div className="flex items-center justify-between gap-2 sm:gap-3">
            <div className="flex items-center gap-1 sm:gap-2">
              {isPlaying ? (
                <Button size="sm" variant="outline" onClick={handlePause} className="h-11 w-11 sm:h-9 sm:w-9 p-0">
                  <Pause className="h-4 w-4" />
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={handlePlay} className="h-11 w-11 sm:h-9 sm:w-9 p-0">
                  <Play className="h-4 w-4" />
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={handleRestart} className="h-11 w-11 sm:h-9 sm:w-9 p-0">
                <RotateCcw className="h-4 w-4" />
              </Button>
              
              <div className="flex items-center gap-1 sm:gap-2">
                <Button size="sm" variant="ghost" onClick={handleMute} className="h-11 w-11 sm:h-9 sm:w-9 p-0">
                  {getVolumeIcon()}
                </Button>
                <Slider
                  value={[isMuted ? 0 : volume]}
                  onValueChange={handleVolumeChange}
                  max={100}
                  step={5}
                  className="w-16 sm:w-24"
                />
              </div>
            </div>
            
            <div className="flex items-center gap-1 sm:gap-2">
              <Button size="sm" variant="ghost" onClick={toggleFullscreen} className="h-11 w-11 sm:h-9 sm:w-9 p-0">
                {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          
          {title && !isFullscreen && (
            <p className="text-xs sm:text-sm font-medium mt-1.5 sm:mt-2 line-clamp-1">{title}</p>
          )}
        </div>
      </Card>
    );
  }
);

DirectVideoPlayer.displayName = 'DirectVideoPlayer';
