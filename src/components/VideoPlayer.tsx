import { forwardRef, useImperativeHandle, useRef, useState, useEffect } from 'react';
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
  onReady?: () => void;
}

export const VideoPlayer = forwardRef<VideoPlayerRef, VideoPlayerProps>(
  ({ videoId, title, onReady }, ref) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(true);
    const [currentTime, setCurrentTime] = useState(0);
    const playerRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const isReadyRef = useRef(false);
    const timeIntervalRef = useRef<number | null>(null);
    const pendingActionsRef = useRef<Array<() => void>>([]);
    const [userInteracted, setUserInteracted] = useState(false);
    const userInteractedRef = useRef(false);
    const initTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
      let cancelled = false;

      setLoadError(null);

      const safeInit = () => {
        if (cancelled) return;
        if (!containerRef.current) {
          console.log('VideoPlayer: container not ready yet');
          // We'll retry via the polling loop below.
          return;
        }
        initPlayer();
      };

      // Load YouTube IFrame API (only once)
      if (!document.getElementById('youtube-iframe-api')) {
        const tag = document.createElement('script');
        tag.id = 'youtube-iframe-api';
        tag.src = 'https://www.youtube.com/iframe_api';
        tag.async = true;
        tag.onerror = () => {
          console.warn('VideoPlayer: failed to load YouTube IFrame API');
          setLoadError('Não foi possível carregar o player do YouTube.');
        };
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
      }

      // If API already exists, init immediately.
      if (window.YT && window.YT.Player) {
        safeInit();
      }

      // Wait for API to load (polling fallback)
      const checkAPI = window.setInterval(() => {
        if (window.YT && window.YT.Player) {
          // Try to init; if the container isn't mounted yet, keep polling.
          safeInit();
          if (isReadyRef.current) {
            clearInterval(checkAPI);
          }
        }
      }, 100);

      // Safety timeout in case the API is blocked (adblock/network)
      initTimeoutRef.current = window.setTimeout(() => {
        if (!isReadyRef.current) {
          setLoadError('O YouTube não respondeu. Verifique bloqueador de anúncios/rede e tente novamente.');
        }
      }, 12000);

      return () => {
        cancelled = true;
        clearInterval(checkAPI);
        if (initTimeoutRef.current) {
          clearTimeout(initTimeoutRef.current);
          initTimeoutRef.current = null;
        }
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
      setUserInteracted(false);
      userInteractedRef.current = false;
      setLoadError(null);

      if (timeIntervalRef.current) {
        clearInterval(timeIntervalRef.current);
        timeIntervalRef.current = null;
      }

      pendingActionsRef.current = [];

      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }

      if (!containerRef.current) {
        console.warn('VideoPlayer: initPlayer called but containerRef is null');
        setLoadError('Falha ao inicializar o player do YouTube.');
        return;
      }

      // Clear previous iframe (helps when switching videos / re-initializing)
      containerRef.current.innerHTML = '';

      try {
        playerRef.current = new window.YT.Player(containerRef.current, {
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
              setLoadError(null);

              if (initTimeoutRef.current) {
                clearTimeout(initTimeoutRef.current);
                initTimeoutRef.current = null;
              }

              // Keep muted by default so the first programmatic play isn't blocked.
              // (We unmute when the agent explicitly plays/restarts.)
              try {
                playerRef.current?.mute();
                setIsMuted(true);
              } catch {
                // ignore
              }

              // Notify parent
              try {
                onReady?.();
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
            onError: (event: any) => {
              console.warn('VideoPlayer: YT error', event?.data);
              setLoadError('Erro ao carregar o vídeo do YouTube.');
            },
          },
        });
      } catch (e) {
        console.warn('VideoPlayer: failed to init YT player', e);
        setLoadError('Falha ao inicializar o player do YouTube.');
        return;
      }

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
          console.log('VideoPlayer: unlockPlayback called, userInteracted:', userInteractedRef.current, 'isReady:', isReadyRef.current);

          if (userInteractedRef.current) return;

          // IMPORTANT: This must run during a real user gesture.
          // If the player isn't ready yet, we do nothing and keep the overlay,
          // so the user can still click it once it appears.
          if (!playerRef.current || !isReadyRef.current) {
            console.log('VideoPlayer: unlockPlayback skipped (player not ready yet)');
            return;
          }

          userInteractedRef.current = true;
          setUserInteracted(true);

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
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
          <div ref={containerRef} className="absolute inset-0 w-full h-full" />
          
          {loadError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted gap-3 px-4 text-center">
              <p className="text-sm text-foreground">{loadError}</p>
              <Button size="sm" variant="secondary" onClick={initPlayer}>
                Tentar novamente
              </Button>
            </div>
          ) : !isReady ? (
            <div className="absolute inset-0 flex items-center justify-center bg-muted">
              <div className="animate-pulse text-muted-foreground">Carregando player...</div>
            </div>
          ) : null}
          
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
      </div>
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
