import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useGeminiLive, VideoControls } from '@/hooks/useGeminiLive';
import { useContentManager, TeachingMoment, ContentPlan } from '@/hooks/useContentManager';
import { useStudentMemory } from '@/hooks/useStudentMemory';
import { useVisionAnalysis, EmotionAnalysis } from '@/hooks/useVisionAnalysis';
import { VideoPlayer, VideoPlayerRef } from './VideoPlayer';
import { VoiceIndicator } from './VoiceIndicator';
import { Mic, MicOff, Phone, PhoneOff, Send, AlertCircle, Bug, Play, Pause, RotateCcw, BookOpen, Target, Lightbulb, Camera, CameraOff, Brain, Heart } from 'lucide-react';
import { toast } from 'sonner';

interface Message {
  id: string;
  text: string;
  role: 'user' | 'assistant';
  timestamp: Date;
}

interface VoiceChatProps {
  videoContext?: string;
  videoId?: string;
  videoTitle?: string;
  videoTranscript?: string | null;
  preConfiguredMoments?: TeachingMoment[] | null;
  isStudentMode?: boolean;
}

export function VoiceChat({ videoContext, videoId, videoTitle, videoTranscript, preConfiguredMoments, isStudentMode = false }: VoiceChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [textInput, setTextInput] = useState('');
  const [showDebug, setShowDebug] = useState(false);
  const [debugInfo, setDebugInfo] = useState({ playerReady: false, lastAction: '' });
  const [activeMoment, setActiveMoment] = useState<TeachingMoment | null>(null);
  const [showContentPlan, setShowContentPlan] = useState(false);
  const [showStudentInfo, setShowStudentInfo] = useState(false);
  const [memoryContext, setMemoryContext] = useState<string>('');
  const videoPlayerRef = useRef<VideoPlayerRef>(null);
  const timeCheckIntervalRef = useRef<number | null>(null);
  const lastCheckedMomentRef = useRef<number>(-1);
  const analyzedVideoRef = useRef<string | null>(null);
  
  // Student Memory for long-term learning
  const {
    profile: studentProfile,
    recordObservation,
    updateProfile,
    buildMemoryContext,
  } = useStudentMemory({
    onProfileLoaded: (profile) => {
      console.log('[StudentMemory] Profile loaded:', profile.student_id);
    },
  });

  // Refs for callbacks that need access to sendText/status
  const sendTextRef = useRef<((text: string) => void) | null>(null);
  const statusRef = useRef<string>('disconnected');

  // Vision Analysis for emotional detection
  const {
    isActive: isVisionActive,
    currentEmotion,
    hasPermission: cameraPermission,
    startAnalysis,
    stopAnalysis,
  } = useVisionAnalysis({
    analysisInterval: 10000, // Analyze every 10 seconds
    onEmotionDetected: async (analysis) => {
      console.log('[VisionAnalysis] Emotion detected:', analysis);
      
      // Record observation to memory
      recordObservation({
        observation_type: 'emotion',
        observation_data: analysis,
        emotional_state: analysis.emotion,
        confidence_level: analysis.confidence,
        context: videoTitle || 'Interação com professor',
        video_id: videoId,
      });

      // If engagement is low or student seems confused/frustrated, notify the AI
      if (analysis.engagement_level === 'low' || 
          ['confuso', 'frustrado', 'entediado', 'cansado'].includes(analysis.emotion)) {
        if (statusRef.current === 'connected' && sendTextRef.current) {
          sendTextRef.current(`[SISTEMA - OBSERVAÇÃO DO ALUNO] Estado emocional detectado: ${analysis.emotion}. Engajamento: ${analysis.engagement_level}. ${analysis.details}. Sugestões: ${analysis.suggestions?.join(', ') || 'Nenhuma'}`);
        }
      }
    },
    onError: (error) => {
      console.error('[VisionAnalysis] Error:', error);
    },
  });

  // Content Manager for teaching moments
  const {
    isLoading: isAnalyzingContent,
    contentPlan,
    analyzeContent,
    checkForTeachingMoment,
    generateTeacherInstructions,
    resetMoments,
  } = useContentManager({
    onPlanReady: (plan) => {
      console.log('[ContentManager] Plan ready:', plan);
    },
    onError: (error) => {
      console.error('[ContentManager] Error:', error);
    },
  });

  // Load pre-configured moments or analyze content when video changes
  useEffect(() => {
    if (videoId && analyzedVideoRef.current !== videoId) {
      analyzedVideoRef.current = videoId;
      // Use pre-configured moments if available, otherwise analyze
      analyzeContent(videoTranscript || null, videoTitle || '', videoContext, preConfiguredMoments);
      lastCheckedMomentRef.current = -1;
      setActiveMoment(null);
    }
  }, [videoId, videoTranscript, videoContext, videoTitle, preConfiguredMoments, analyzeContent]);

  // Load memory context when profile is ready
  useEffect(() => {
    if (studentProfile) {
      buildMemoryContext().then(ctx => {
        setMemoryContext(ctx);
      });
    }
  }, [studentProfile, buildMemoryContext]);

  // Build system instruction with video context, content plan, and student memory
  const buildSystemInstruction = useCallback(() => {
    let instruction = videoContext 
      ? `Você é o Professor Vibe, um instrutor de programação jovem mas que manja MUITO do assunto. Você tem autoridade no que fala, mas sem ser arrogante - é confiante e direto.

PERSONALIDADE E ESTILO:
- Tom jovem mas com autoridade: você sabe do que está falando e passa confiança
- Usa linguagem direta e objetiva, sem enrolação
- Gírias modernas com moderação ("mano", "cara", "show", "bora", "sacou?")
- Faz analogias inteligentes que mostram domínio do assunto
- Quando o aluno acerta, reconhece com firmeza: "Isso! Exatamente isso!"
- Quando erra, corrige com respeito mas sem rodeios: "Olha, não é bem assim. Deixa eu te mostrar..."
- Você desafia o aluno a pensar, não dá tudo mastigado

FLUXO DA CONVERSA:
1. QUEBRA-GELO: Comece casual mas profissional:
   - "E aí! Pronto pra evoluir hoje? Bora lá!"
   - "Fala! Vamos direto ao ponto - tem bastante coisa boa pra ver hoje"
2. TRANSIÇÃO: Entre no conteúdo com energia e foco
3. DURANTE A AULA: Mantenha o ritmo, faça perguntas que desafiam

CONTEXTO DO VÍDEO:
${videoContext}

INSTRUÇÕES DE ENSINO:
1. Baseie suas explicações no conteúdo REAL do vídeo
2. Se não souber algo, seja honesto: "Cara, isso não tá no vídeo, mas posso pesquisar depois"
3. Use exemplos práticos e analogias criativas
4. Quando o aluno acertar algo, celebre: "Isso aí! Mandou bem demais!"
5. Quando errar, seja gentil: "Quase lá! Vamos ver junto o que aconteceu..."

CONTROLE DO VÍDEO:
- Você pode controlar o vídeo: dar play, pausar, reiniciar ou pular para partes específicas
- REGRA CRÍTICA: Termine COMPLETAMENTE sua fala ANTES de dar play no vídeo
- Nunca fale enquanto o vídeo roda - o aluno não consegue ouvir os dois
- Exemplo: "Bora ver esse trecho que é muito bom!" [para de falar] [chama play_video]

Título do vídeo: ${videoTitle || 'Aula de hoje'}`
      : `Você é o Professor Vibe, um instrutor de programação super descontraído e apaixonado por código.

PERSONALIDADE:
- Informal e amigável, usa gírias modernas
- Faz analogias criativas e piadas leves sobre código
- Celebra vitórias e é paciente com erros
- Fala como um amigo que manja muito de programação

FLUXO OBRIGATÓRIO:
1. SEMPRE comece com um quebra-gelo descontraído antes de ensinar
2. Pergunte como o aluno está, crie conexão
3. Só depois entre no conteúdo de forma natural

Fale em português brasileiro, de forma clara e envolvente.`;

    // Add student memory context
    if (memoryContext) {
      instruction += `

${memoryContext}

RELACIONAMENTO COM O ALUNO:
1. Use o que você sabe do aluno para personalizar a conversa
2. Se tem pontos fortes, valorize: "Você é bom nisso, então vai pegar fácil!"
3. Se tem dificuldades, seja paciente e explique de formas diferentes
4. Adapte seu estilo ao jeito que o aluno aprende melhor

SOBRE OBSERVAÇÕES DO SISTEMA:
- Mensagens [SISTEMA - OBSERVAÇÃO DO ALUNO] são informações internas
- NUNCA mencione essas observações em voz alta
- Use silenciosamente para ajustar sua abordagem:
   - Aluno confuso? "Opa, deixa eu explicar de outro jeito..."
   - Aluno entediado? Traga um exemplo legal ou faça uma pergunta
   - Aluno frustrado? "Relaxa, isso é normal! Todo mundo passa por isso"
   - Aluno cansado? "Quer dar uma pausa rápida? Tá tranquilo!"`;
    }

    // Add content plan context if available
    if (contentPlan) {
      instruction += `

PLANO DE ENSINO (Momentos para aprofundar):
${contentPlan.teaching_moments.map((m, i) => `
${i + 1}. [${Math.floor(m.timestamp_seconds / 60)}:${(m.timestamp_seconds % 60).toString().padStart(2, '0')}] ${m.topic}
   - Insight: ${m.key_insight}
   - Perguntas: ${m.questions_to_ask.join('; ')}
`).join('')}

Quando receber "🎯 MOMENTO DE APROFUNDAMENTO":
1. Pause o vídeo
2. Explore o conceito de forma descontraída: "Opa, para tudo! Isso aqui é importante..."
3. Faça as perguntas de um jeito natural, não robotizado
4. Espere o aluno responder antes de continuar
5. Só dê play quando o aluno estiver pronto: "Bora continuar?"`;
    }

    return instruction;
  }, [videoContext, videoTitle, contentPlan, memoryContext]);

  const systemInstruction = buildSystemInstruction();

  // Check player ref status periodically for debug panel
  useEffect(() => {
    if (!showDebug) return;
    const interval = setInterval(() => {
      setDebugInfo(prev => ({
        ...prev,
        playerReady: videoPlayerRef.current !== null
      }));
    }, 500);
    return () => clearInterval(interval);
  }, [showDebug]);

  // Controls are always available when a video exists; the VideoPlayer will queue commands until ready.
  // Using a getter pattern to always access the current ref value
  const videoControls: VideoControls | null = useMemo(() => {
    if (!videoId) return null;

    return {
      play: () => {
        console.log('[VoiceChat] play called, ref:', videoPlayerRef.current ? 'EXISTS' : 'NULL');
        setDebugInfo(prev => ({ ...prev, lastAction: 'play @ ' + new Date().toLocaleTimeString() }));
        videoPlayerRef.current?.play();
      },
      pause: () => {
        console.log('[VoiceChat] pause called, ref:', videoPlayerRef.current ? 'EXISTS' : 'NULL');
        setDebugInfo(prev => ({ ...prev, lastAction: 'pause @ ' + new Date().toLocaleTimeString() }));
        videoPlayerRef.current?.pause();
      },
      restart: () => {
        console.log('[VoiceChat] restart called, ref:', videoPlayerRef.current ? 'EXISTS' : 'NULL');
        setDebugInfo(prev => ({ ...prev, lastAction: 'restart @ ' + new Date().toLocaleTimeString() }));
        videoPlayerRef.current?.restart();
      },
      seekTo: (seconds: number) => {
        console.log('[VoiceChat] seekTo called:', seconds, 'ref:', videoPlayerRef.current ? 'EXISTS' : 'NULL');
        setDebugInfo(prev => ({ ...prev, lastAction: `seekTo(${seconds}) @ ` + new Date().toLocaleTimeString() }));
        videoPlayerRef.current?.seekTo(seconds);
      },
      getCurrentTime: () => videoPlayerRef.current?.getCurrentTime() || 0,
      isPaused: () => videoPlayerRef.current?.isPaused() ?? true,
    };
  }, [videoId]);

  const {
    status,
    isListening,
    isSpeaking,
    connect,
    disconnect,
    startListening,
    stopListening,
    sendText
  } = useGeminiLive({
    systemInstruction,
    videoControls,
    onTranscript: (text, role) => {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        text,
        role,
        timestamp: new Date()
      }]);
    },
    onError: (error) => {
      toast.error(error);
    }
  });

  // Update refs when values change
  useEffect(() => {
    sendTextRef.current = sendText;
    statusRef.current = status;
  }, [sendText, status]);

  // Auto-start vision analysis when agent connects
  // Auto-start everything when agent connects (vision + microphone)
  useEffect(() => {
    if (status === 'connected' && isStudentMode) {
      // Small delay to ensure everything is ready, then start vision and microphone
      const timer = setTimeout(() => {
        if (!isVisionActive) {
          startAnalysis();
        }
        if (!isListening) {
          startListening();
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [status, isStudentMode, isVisionActive, isListening, startAnalysis, startListening]);

  // Monitor video time for teaching moments
  useEffect(() => {
    if (status !== 'connected' || !contentPlan || !videoId) {
      if (timeCheckIntervalRef.current) {
        clearInterval(timeCheckIntervalRef.current);
        timeCheckIntervalRef.current = null;
      }
      return;
    }

    timeCheckIntervalRef.current = window.setInterval(() => {
      const currentTime = videoPlayerRef.current?.getCurrentTime() || 0;
      const isPaused = videoPlayerRef.current?.isPaused() ?? true;
      
      // Only check for moments when video is playing
      if (!isPaused && contentPlan) {
        const moment = checkForTeachingMoment(currentTime);
        
        if (moment && lastCheckedMomentRef.current !== contentPlan.teaching_moments.indexOf(moment)) {
          lastCheckedMomentRef.current = contentPlan.teaching_moments.indexOf(moment);
          setActiveMoment(moment);
          
          // Pause the video
          videoPlayerRef.current?.pause();
          
          // Send teaching moment instruction to the AI
          const instruction = generateTeacherInstructions(moment);
          sendText(instruction);
          
          toast.info(`🎯 Momento de aprofundamento: ${moment.topic}`, {
            duration: 5000,
          });
        }
      }
    }, 1000);

    return () => {
      if (timeCheckIntervalRef.current) {
        clearInterval(timeCheckIntervalRef.current);
        timeCheckIntervalRef.current = null;
      }
    };
  }, [status, contentPlan, videoId, checkForTeachingMoment, generateTeacherInstructions, sendText]);

  const handleSendText = () => {
    if (!textInput.trim()) return;
    sendText(textInput);
    setTextInput('');
  };

  const handleStartClass = useCallback(() => {
    // One-click student flow: use this user gesture to unlock YouTube programmatic playback
    // (removes the "Clique para habilitar" overlay).
    videoPlayerRef.current?.unlockPlayback?.();
    connect();
  }, [connect]);

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const dismissActiveMoment = () => {
    setActiveMoment(null);
  };

  const getStatusColor = () => {
    switch (status) {
      case 'connected': return 'bg-green-500';
      case 'connecting': return 'bg-yellow-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-muted';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'connected': return 'Conectado';
      case 'connecting': return 'Conectando...';
      case 'error': return 'Erro de conexão';
      default: return 'Desconectado';
    }
  };

  return (
    <Card className="flex flex-col h-full min-h-[400px] sm:min-h-0">
      <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
            Professor IA
          </CardTitle>
          <div className="flex items-center gap-2">
            {/* Vision status indicator (auto-enabled when connected) */}
            {isVisionActive && (
              <Badge variant="outline" className="text-[10px] border-green-500 text-green-600">
                <Camera className="h-2.5 w-2.5 mr-1" />
                <span className="hidden sm:inline">Visão ativa</span>
              </Badge>
            )}
            
            {/* Current emotion indicator */}
            {currentEmotion && isVisionActive && (
              <Badge 
                variant="outline" 
                className={`text-[10px] ${
                  currentEmotion.engagement_level === 'high' ? 'border-green-500 text-green-600' :
                  currentEmotion.engagement_level === 'low' ? 'border-red-500 text-red-600' :
                  'border-yellow-500 text-yellow-600'
                }`}
              >
                <Heart className="h-2.5 w-2.5 mr-1" />
                {currentEmotion.emotion}
              </Badge>
            )}
            
            {/* Student memory indicator */}
            {studentProfile && (
              <Button
                size="sm"
                variant={showStudentInfo ? "secondary" : "ghost"}
                onClick={() => setShowStudentInfo(!showStudentInfo)}
                className="h-6 px-2 text-xs"
                title="Ver informações do aluno"
              >
                <Brain className="h-3 w-3 mr-1" />
                <span className="hidden sm:inline">Memória</span>
              </Button>
            )}
            
            {contentPlan && (
              <Button
                size="sm"
                variant={showContentPlan ? "secondary" : "ghost"}
                onClick={() => setShowContentPlan(!showContentPlan)}
                className="h-6 px-2 text-xs"
              >
                <BookOpen className="h-3 w-3 mr-1" />
                {contentPlan.teaching_moments.length} momentos
              </Button>
            )}
            {isAnalyzingContent && (
              <Badge variant="outline" className="text-xs animate-pulse">
                Analisando...
              </Badge>
            )}
            <span className="text-[10px] sm:text-xs text-muted-foreground">{getStatusText()}</span>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col gap-3 sm:gap-4 overflow-hidden px-3 sm:px-6 pb-3 sm:pb-6">
        {/* Video Player */}
        {videoId && (
          <div className="flex-shrink-0">
            <VideoPlayer 
              ref={videoPlayerRef} 
              videoId={videoId} 
              title={videoTitle}
            />
            <div className="flex items-center justify-between mt-1.5 sm:mt-2">
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                💡 Diga "dê play", "pause" ou "reinicie o vídeo"
              </p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowDebug(!showDebug)}
                className="h-5 sm:h-6 px-1.5 sm:px-2"
              >
                <Bug className="h-3 w-3" />
              </Button>
            </div>
            
            {/* Debug Panel */}
            {showDebug && (
              <div className="mt-2 p-2 bg-muted/50 rounded text-xs space-y-2 border">
                <div className="font-medium">🔧 Debug Panel</div>
                <div className="grid grid-cols-2 gap-1">
                  <span className="text-muted-foreground">Status:</span>
                  <span className={status === 'connected' ? 'text-green-600' : 'text-yellow-600'}>{status}</span>
                  
                  <span className="text-muted-foreground">Player Ref:</span>
                  <span className={debugInfo.playerReady ? 'text-green-600' : 'text-red-600'}>
                    {debugInfo.playerReady ? '✓ Conectado' : '✗ NULL'}
                  </span>
                  
                  <span className="text-muted-foreground">Última ação:</span>
                  <span>{debugInfo.lastAction || 'Nenhuma'}</span>
                </div>
                
                {/* Manual Test Buttons */}
                <div className="flex gap-1 pt-1 border-t">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-xs"
                    onClick={() => {
                      console.log('[Debug] Manual play test');
                      toast.info('Testando Play...');
                      videoPlayerRef.current?.play();
                      setDebugInfo(prev => ({ ...prev, lastAction: 'MANUAL play @ ' + new Date().toLocaleTimeString() }));
                    }}
                  >
                    <Play className="h-3 w-3 mr-1" /> Test Play
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-xs"
                    onClick={() => {
                      console.log('[Debug] Manual pause test');
                      toast.info('Testando Pause...');
                      videoPlayerRef.current?.pause();
                      setDebugInfo(prev => ({ ...prev, lastAction: 'MANUAL pause @ ' + new Date().toLocaleTimeString() }));
                    }}
                  >
                    <Pause className="h-3 w-3 mr-1" /> Test Pause
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-xs"
                    onClick={() => {
                      console.log('[Debug] Manual restart test');
                      toast.info('Testando Restart...');
                      videoPlayerRef.current?.restart();
                      setDebugInfo(prev => ({ ...prev, lastAction: 'MANUAL restart @ ' + new Date().toLocaleTimeString() }));
                    }}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" /> Test Restart
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Student Info Panel */}
        {showStudentInfo && studentProfile && (
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 rounded-lg p-3 border space-y-2 flex-shrink-0">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Brain className="h-4 w-4 text-primary" />
              Memória do Aluno
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Interações:</span>
                <span className="ml-1 font-medium">{studentProfile.interaction_count}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Tempo de estudo:</span>
                <span className="ml-1 font-medium">{studentProfile.total_study_time_minutes} min</span>
              </div>
              {studentProfile.learning_style && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Estilo:</span>
                  <span className="ml-1 font-medium">{studentProfile.learning_style}</span>
                </div>
              )}
            </div>
            {studentProfile.emotional_patterns?.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1 border-t">
                {studentProfile.emotional_patterns.slice(0, 4).map((pattern, idx) => (
                  <Badge key={idx} variant="outline" className="text-[10px]">
                    {pattern.emotion} ({pattern.count}x)
                  </Badge>
                ))}
              </div>
            )}
            {studentProfile.strengths?.length > 0 && (
              <div className="text-xs pt-1 border-t">
                <span className="text-muted-foreground">Pontos fortes:</span>
                <span className="ml-1">{studentProfile.strengths.join(', ')}</span>
              </div>
            )}
          </div>
        )}

        {/* Content Plan Panel */}
        {showContentPlan && contentPlan && (
          <div className="bg-muted/30 rounded-lg p-3 border space-y-2 flex-shrink-0 max-h-48 overflow-y-auto">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Target className="h-4 w-4 text-primary" />
              Plano de Ensino
            </div>
            {contentPlan.teaching_moments.map((moment, index) => (
              <div 
                key={index}
                className={`p-2 rounded text-xs border ${
                  activeMoment === moment ? 'bg-primary/10 border-primary' : 'bg-background'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-[10px]">
                    {Math.floor(moment.timestamp_seconds / 60)}:{(moment.timestamp_seconds % 60).toString().padStart(2, '0')}
                  </Badge>
                  <span className="font-medium">{moment.topic}</span>
                </div>
                <p className="text-muted-foreground">{moment.key_insight}</p>
              </div>
            ))}
          </div>
        )}

        {/* Active Teaching Moment Alert */}
        {activeMoment && (
          <div className="bg-primary/10 border border-primary rounded-lg p-3 flex-shrink-0 animate-pulse">
            <div className="flex items-start gap-2">
              <Lightbulb className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm">{activeMoment.topic}</span>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-6 px-2 text-xs"
                    onClick={dismissActiveMoment}
                  >
                    ✓ Entendi
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{activeMoment.key_insight}</p>
              </div>
            </div>
          </div>
        )}
        
        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-2 sm:space-y-3 pr-1 sm:pr-2 min-h-0">
          {messages.length === 0 && status === 'disconnected' && (
            <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground p-3 sm:p-4">
              <AlertCircle className="h-8 w-8 sm:h-10 sm:w-10 mb-2 sm:mb-3 opacity-50" />
              <p className="text-xs sm:text-sm">Clique em "Iniciar Aula" para começar a conversar com o professor IA</p>
            </div>
          )}
          
          {messages.map((msg) => (
            <div 
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div 
                className={`max-w-[90%] sm:max-w-[85%] rounded-lg px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm ${
                  msg.role === 'user' 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-muted'
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}
        </div>
        
        {/* Voice indicators */}
        {status === 'connected' && (
          <div className="flex justify-center gap-6 sm:gap-8 py-1.5 sm:py-2">
            {isListening && (
              <div className="text-center">
                <VoiceIndicator isActive={isListening} type="listening" />
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">Ouvindo...</p>
              </div>
            )}
            {isSpeaking && (
              <div className="text-center">
                <VoiceIndicator isActive={isSpeaking} type="speaking" />
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">Falando...</p>
              </div>
            )}
          </div>
        )}
        
        {/* Controls */}
        <div className="space-y-2 sm:space-y-3 pt-2 border-t flex-shrink-0">
          <div className="flex gap-2">
            {status === 'disconnected' || status === 'error' ? (
              <Button onClick={handleStartClass} className="flex-1 h-10 sm:h-11 text-sm sm:text-base">
                <Phone className="h-4 w-4 mr-2" />
                Iniciar Aula
              </Button>
            ) : status === 'connecting' ? (
              <Button disabled className="flex-1 h-10 sm:h-11 text-sm sm:text-base">
                Conectando...
              </Button>
            ) : (
              <>
                {/* Show listening status indicator */}
                <div className="flex-1 flex items-center justify-center gap-2 h-10 sm:h-11 bg-primary/10 rounded-md px-3">
                  {isListening ? (
                    <>
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      <span className="text-sm text-primary">Ouvindo...</span>
                      <VoiceIndicator isActive={true} type="listening" />
                    </>
                  ) : isSpeaking ? (
                    <>
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                      <span className="text-sm text-primary">Professor falando...</span>
                      <VoiceIndicator isActive={true} type="speaking" />
                    </>
                  ) : (
                    <>
                      <div className="w-2 h-2 bg-green-500 rounded-full" />
                      <span className="text-sm text-muted-foreground">Aula em andamento</span>
                    </>
                  )}
                </div>
                <Button onClick={disconnect} variant="destructive" className="h-10 sm:h-11 px-4">
                  <PhoneOff className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Encerrar</span>
                </Button>
              </>
            )}
          </div>
          
          {status === 'connected' && (
            <div className="flex gap-2">
              <Input
                placeholder="Ou digite sua pergunta..."
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
                className="h-9 sm:h-10 text-sm"
              />
              <Button onClick={handleSendText} size="icon" variant="secondary" className="h-9 w-9 sm:h-10 sm:w-10">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
