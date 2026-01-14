import { forwardRef, useImperativeHandle, useRef, useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, Pause, RotateCcw, Volume2, VolumeX } from 'lucide-react';

export interface VideoPlayerRef {
  play: () => void;
  pause: () => void;
  restart: () => void;
  seekTo: (seconds: number) => void;
  getCurrentTime: () => number;
  isPaused: () => boolean;
  /**
   * Must be called from a real user gesture (e.g. click) to unlock programmatic playback.
   * This removes the "Clique para habilitar" overlay.
   */
  unlockPlayback: () => void;
}

interface VideoPlayerProps {
  videoId: string;
  title?: string;
}

export const VideoPlayer = forwardRef<VideoPlayerRef, VideoPlayerProps>(
  ({ videoId, title }, ref) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(true);
    const [currentTime, setCurrentTime] = useState(0);
    const playerRef = useRef<any>(null);
    const [isReady, setIsReady] = useState(false);
    const isReadyRef = useRef(false);
    const timeIntervalRef = useRef<number | null>(null);
    const pendingActionsRef = useRef<Array<() => void>>([]);
    const [userInteracted, setUserInteracted] = useState(false);
    const userInteractedRef = useRef(false);

    useEffect(() => {
      // Load YouTube IFrame API
      if (!window.YT) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
      }

      // Wait for API to load
      const checkAPI = window.setInterval(() => {
        if (window.YT && window.YT.Player) {
          clearInterval(checkAPI);
          initPlayer();
        }
      }, 100);

      return () => {
        clearInterval(checkAPI);
        if (timeIntervalRef.current) {
          clearInterval(timeIntervalRef.current);
          timeIntervalRef.current = null;
        }
        pendingActionsRef.current = [];
        isReadyRef.current = false;
        if (playerRef.current) {
          playerRef.current.destroy();
          playerRef.current = null;
        }
      };
    }, [videoId]);

    const initPlayer = () => {
      setIsReady(false);
      isReadyRef.current = false;
      setIsPlaying(false);

      if (timeIntervalRef.current) {
        clearInterval(timeIntervalRef.current);
        timeIntervalRef.current = null;
      }

      pendingActionsRef.current = [];

      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }

      playerRef.current = new window.YT.Player(`youtube-player-${videoId}`, {
        videoId: videoId,
        playerVars: {
          autoplay: 0,
          controls: 0,
          modestbranding: 1,
          rel: 0,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            setIsReady(true);
            isReadyRef.current = true;

            // Keep muted by default so the first programmatic play isn't blocked.
            // (We unmute when the agent explicitly plays/restarts.)
            try {
              playerRef.current?.mute();
              setIsMuted(true);
            } catch {
              // ignore
            }

            // Flush any queued actions that happened before the iframe was ready
            const queued = pendingActionsRef.current.splice(0);
            for (const fn of queued) {
              try {
                fn();
              } catch (e) {
                console.warn('VideoPlayer: queued action failed', e);
              }
            }

            console.log('YouTube player ready');
          },
          onStateChange: (event: any) => {
            setIsPlaying(event.data === window.YT.PlayerState.PLAYING);
          },
        },
      });

      // Update current time periodically
      timeIntervalRef.current = window.setInterval(() => {
        if (playerRef.current?.getCurrentTime) {
          setCurrentTime(playerRef.current.getCurrentTime());
        }
      }, 1000);
    };

    useImperativeHandle(ref, () => {
      const runOrQueue = (fn: () => void) => {
        if (playerRef.current && isReadyRef.current) {
          fn();
          return;
        }
        pendingActionsRef.current.push(fn);
        console.log('VideoPlayer: action queued (player not ready yet)');
      };

      return {
        play: () => {
          console.log('VideoPlayer: play called');
          runOrQueue(() => {
            // Important: programmatic play (triggered by the agent) is often blocked
            // if the player is unmuted. So we start muted to guarantee play works,
            // then we *attempt* to unmute shortly after.
            try {
              playerRef.current?.mute();
              setIsMuted(true);
            } catch {}

            playerRef.current?.playVideo();

            window.setTimeout(() => {
              try {
                playerRef.current?.unMute();
                setIsMuted(false);
              } catch {
                // If the browser blocks unmute, user can click the volume button.
              }
            }, 350);
          });
        },
        pause: () => {
          console.log('VideoPlayer: pause called');
          runOrQueue(() => {
            playerRef.current?.pauseVideo();
          });
        },
        restart: () => {
          console.log('VideoPlayer: restart called');
          runOrQueue(() => {
            playerRef.current?.seekTo(0, true);

            try {
              playerRef.current?.mute();
              setIsMuted(true);
            } catch {}

            playerRef.current?.playVideo();

            window.setTimeout(() => {
              try {
                playerRef.current?.unMute();
                setIsMuted(false);
              } catch {
                // If blocked, user can click the volume button.
              }
            }, 350);
          });
        },
        seekTo: (seconds: number) => {
          console.log('VideoPlayer: seekTo called', seconds);
          runOrQueue(() => {
            playerRef.current?.seekTo(seconds, true);
          });
        },
        getCurrentTime: () => {
          return playerRef.current?.getCurrentTime?.() || 0;
        },
        isPaused: () => {
          return !isPlaying;
        },
        unlockPlayback: () => {
          console.log('VideoPlayer: unlockPlayback called, userInteracted:', userInteractedRef.current);
          
          // Check using ref to avoid stale closures
          if (userInteractedRef.current) {
            console.log('VideoPlayer: Already unlocked, skipping');
            return;
          }

          // Set immediately to prevent double-calls
          userInteractedRef.current = true;
          setUserInteracted(true);

          runOrQueue(() => {
            if (!playerRef.current) {
              console.log('VideoPlayer: No player, skipping unlock');
              return;
            }

            // Start playing (muted) then immediately pause to unlock programmatic control
            try {
              playerRef.current.mute();
              setIsMuted(true);
              playerRef.current.playVideo();
              window.setTimeout(() => {
                try {
                  playerRef.current?.pauseVideo();
                  playerRef.current?.seekTo(0, true);
                  console.log('VideoPlayer: Playback unlocked by user interaction');
                } catch (e) {
                  console.warn('Failed to finalize unlock playback:', e);
                }
              }, 100);
            } catch (e) {
              console.warn('Failed to unlock playback:', e);
            }
          });
        },
      };
    }, [isPlaying]);

    const handlePlay = () => {
      // Programmatic play may be blocked unless muted; we keep default muted.
      playerRef.current?.playVideo();
    };
    const handlePause = () => playerRef.current?.pauseVideo();
    const handleRestart = () => {
      playerRef.current?.seekTo(0, true);
      playerRef.current?.playVideo();
    };
    const handleMute = () => {
      if (isMuted) {
        playerRef.current?.unMute();
      } else {
        playerRef.current?.mute();
      }
      setIsMuted(!isMuted);
    };

    const formatTime = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Handle first interaction to unlock programmatic playback (manual click)
    const handleUnlockPlayback = () => {
      if (!userInteractedRef.current && playerRef.current) {
        userInteractedRef.current = true;
        setUserInteracted(true);
        // Start playing then immediately pause to unlock
        try {
          playerRef.current.mute();
          playerRef.current.playVideo();
          setTimeout(() => {
            playerRef.current?.pauseVideo();
            playerRef.current?.seekTo(0, true);
            console.log('VideoPlayer: Playback unlocked by user interaction (manual click)');
          }, 100);
        } catch (e) {
          console.warn('Failed to unlock playback:', e);
        }
      }
    };

    return (
      <Card className="overflow-hidden">
        <div className="relative aspect-video bg-black">
          <div id={`youtube-player-${videoId}`} className="absolute inset-0" />
          
          {!isReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted">
              <div className="animate-pulse text-muted-foreground">Carregando player...</div>
            </div>
          )}
          
          {/* Unlock overlay - requires user click to enable programmatic control */}
          {isReady && !userInteracted && (
            <div 
              className="absolute inset-0 flex items-center justify-center bg-black/60 cursor-pointer z-10"
              onClick={handleUnlockPlayback}
            >
              <div className="text-center text-white">
                <Play className="h-12 w-12 mx-auto mb-2 opacity-90" />
                <p className="text-sm font-medium">Clique para habilitar</p>
                <p className="text-xs opacity-75">Permite controle por voz</p>
              </div>
            </div>
          )}
        </div>
        
        {/* Custom Controls */}
        <div className="p-2 sm:p-3 bg-card border-t">
          <div className="flex items-center justify-between gap-2 sm:gap-3">
            <div className="flex items-center gap-1 sm:gap-2">
              {isPlaying ? (
                <Button size="sm" variant="outline" onClick={handlePause} className="h-8 w-8 sm:h-9 sm:w-9 p-0">
                  <Pause className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={handlePlay} className="h-8 w-8 sm:h-9 sm:w-9 p-0">
                  <Play className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={handleRestart} className="h-8 w-8 sm:h-9 sm:w-9 p-0">
                <RotateCcw className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={handleMute} className="h-8 w-8 sm:h-9 sm:w-9 p-0">
                {isMuted ? <VolumeX className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <Volume2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
              </Button>
            </div>
            
            <span className="text-xs sm:text-sm text-muted-foreground font-mono">
              {formatTime(currentTime)}
            </span>
          </div>
          
          {title && (
            <p className="text-xs sm:text-sm font-medium mt-1.5 sm:mt-2 line-clamp-1">{title}</p>
          )}
        </div>
      </Card>
    );
  }
);

VideoPlayer.displayName = 'VideoPlayer';

// Extend window for YouTube API
declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}
