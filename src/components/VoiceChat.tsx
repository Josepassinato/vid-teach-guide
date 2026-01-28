import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useOpenAIRealtime, VideoControls, ConnectionStep } from '@/hooks/useOpenAIRealtime';
import { useContentManager, TeachingMoment } from '@/hooks/useContentManager';
import { useTimestampQuizzes, TimestampQuiz } from '@/hooks/useTimestampQuizzes';
import { useEngagementDetection, InterventionReason } from '@/hooks/useEngagementDetection';
import { VideoPlayer, VideoPlayerRef } from './VideoPlayer';
import { DirectVideoPlayer, DirectVideoPlayerRef } from './DirectVideoPlayer';
import { VoiceIndicator } from './VoiceIndicator';
import { ProcessingIndicator } from './ProcessingIndicator';
import { MiniQuiz } from './MiniQuiz';
import { LessonEndScreen } from './LessonEndScreen';
import { EngagementPanel } from './EngagementPanel';
import { VisionConsentDialog } from './VisionConsentDialog';
import { Phone, PhoneOff, Send, AlertCircle, Bug, Play, Pause, RotateCcw, BookOpen, Target, Lightbulb, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { AnimatePresence } from 'framer-motion';

interface Message {
  id: string;
  text: string;
  role: 'user' | 'assistant';
  timestamp: Date;
}

interface VoiceChatProps {
  videoContext?: string;
  videoId?: string | null; // YouTube ID
  videoUrl?: string | null; // Direct video URL
  videoType?: string | null; // 'youtube' | 'direct' | 'external'
  videoDbId?: string; // UUID for database queries (quizzes, progress)
  videoTitle?: string;
  videoTranscript?: string | null;
  preConfiguredMoments?: TeachingMoment[] | null;
  teacherIntro?: string | null;
  isStudentMode?: boolean;
  onContentPlanReady?: (moments: TeachingMoment[]) => void;
}

export function VoiceChat({ videoContext, videoId, videoUrl, videoType, videoDbId, videoTitle, videoTranscript, preConfiguredMoments, teacherIntro, onContentPlanReady }: VoiceChatProps) {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [textInput, setTextInput] = useState('');
  const [showDebug, setShowDebug] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [debugInfo, setDebugInfo] = useState({ playerReady: false, lastAction: '' });
  const [activeMoment, setActiveMoment] = useState<TeachingMoment | null>(null);
  const [showContentPlan, setShowContentPlan] = useState(false);
  const [activeQuiz, setActiveQuiz] = useState<TimestampQuiz | null>(null);
  const [agentMode, setAgentMode] = useState<'idle' | 'intro' | 'teaching' | 'playing' | 'ended'>('idle');
  const [isVideoExpanded, setIsVideoExpanded] = useState(false);
  const [pendingReconnect, setPendingReconnect] = useState<{type: 'moment' | 'quiz', data: any} | null>(null);
  const [currentVideoTime, setCurrentVideoTime] = useState(0);
  const [nextPauseInfo, setNextPauseInfo] = useState<{time: number; type: 'quiz' | 'moment'; topic?: string} | null>(null);
  const [lessonEndData, setLessonEndData] = useState<{ weeklyTask?: string; summaryPoints?: string[] }>({});
  const [showVisionConsent, setShowVisionConsent] = useState(false);
  const [connectionStep, setConnectionStep] = useState<'idle' | 'fetching_key' | 'connecting_ws' | 'configuring' | 'ready'>('idle');
  const videoPlayerRef = useRef<VideoPlayerRef | DirectVideoPlayerRef>(null);
  const timeCheckIntervalRef = useRef<number | null>(null);
  const lastCheckedMomentRef = useRef<number>(-1);
  const analyzedVideoRef = useRef<string | null>(null);
  const introCompletedRef = useRef<boolean>(false);
  const isCapturingEndDataRef = useRef<boolean>(false);
  const endMessageBufferRef = useRef<string>('');
  
  // Generate student ID
  const [studentId] = useState(() => {
    const stored = localStorage.getItem('studentId');
    if (stored) return stored;
    const newId = `student_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    localStorage.setItem('studentId', newId);
    return newId;
  });
  
  // Refs for callbacks that need access to sendText/status
  const sendTextRef = useRef<((text: string) => void) | null>(null);
  const statusRef = useRef<string>('disconnected');


  // Content Manager for teaching moments
  const {
    isLoading: isAnalyzingContent,
    contentPlan,
    analyzeContent,
    checkForTeachingMoment,
    generateTeacherInstructions,
  } = useContentManager({
    onPlanReady: (plan) => {
      console.log('[ContentManager] Plan ready:', plan);
      // Notify parent component when teaching moments are ready
      if (plan.teaching_moments.length > 0 && onContentPlanReady) {
        onContentPlanReady(plan.teaching_moments);
      }
    },
    onError: (error) => {
      console.error('[ContentManager] Error:', error);
    },
  });

  // Timestamp-based quizzes - use videoDbId (UUID) for database queries
  const {
    quizzes: timestampQuizzes,
    loadQuizzes,
    getQuizForTimestamp,
    markQuizTriggered,
    recordAttempt,
  } = useTimestampQuizzes({ videoId: videoDbId, studentId });

  // Engagement detection system (Audio + Behavioral + Vision opt-in)
  // Note: The intervention handler will be set up after useGeminiLive is initialized
  const engagementInterventionHandlerRef = useRef<((reason: InterventionReason) => void) | null>(null);
  
  const engagement = useEngagementDetection({
    enabled: true,
    onInterventionTriggered: (reason) => {
      // Use ref to avoid stale closure
      engagementInterventionHandlerRef.current?.(reason);
    },
    config: {
      attentionThreshold: 0.4,
      attentionDurationMs: 4000,
    },
  });

  // Determine if we have a video to display
  const hasVideo = videoId || videoUrl;
  const isDirectVideo = videoType === 'direct' || videoType === 'external';

  // Load pre-configured moments or analyze content when video changes
  useEffect(() => {
    const videoKey = videoId || videoUrl;
    if (videoKey && analyzedVideoRef.current !== videoKey) {
      analyzedVideoRef.current = videoKey;
      // Use pre-configured moments if available, otherwise analyze and auto-save
      // Pass videoDbId for auto-save, and duration (default 10 min)
      analyzeContent(
        videoTranscript || null, 
        videoTitle || '', 
        videoContext, 
        preConfiguredMoments,
        undefined, // videoDurationMinutes - will use default
        videoDbId, // Pass database ID for auto-saving
        true // autoSave enabled
      );
      lastCheckedMomentRef.current = -1;
      setActiveMoment(null);
      setActiveQuiz(null);
    }
  }, [videoId, videoUrl, videoDbId, videoTranscript, videoContext, videoTitle, preConfiguredMoments, analyzeContent]);

  // Load timestamp quizzes when videoDbId changes
  useEffect(() => {
    if (videoDbId) {
      loadQuizzes();
    }
  }, [videoDbId, loadQuizzes]);

  // Build system instruction with video context, content plan, and student memory
  const buildSystemInstruction = useCallback(() => {
    const hasVisionEnabled = engagement.vision.isEnabled;
    
    let instruction = `Você é o Professor Vibe - um tutor SUPER EXPRESSIVO, cheio de energia e paixão por ensinar VIBE CODING!

=== SUA PERSONALIDADE VIBRANTE ===
Você é aquele professor que TODO MUNDO adora - cheio de vida, expressivo e genuinamente empolgado com o aprendizado do aluno!

TRAÇOS MARCANTES:
- ENTUSIASMO CONTAGIANTE: Você ADORA o que ensina! "Cara, isso aqui é INCRÍVEL!", "Olha que coisa LINDA!"
- EXPRESSIVIDADE VOCAL: Varie o tom, faça pausas dramáticas, enfatize palavras importantes
- CELEBRAÇÃO EFUSIVA: "ISSO AÍ! Mandou MUITO bem!", "Uhuuul! Você ARRASOU!", "Tá PEGANDO o jeito!"
- EMPATIA GENUÍNA: "Ei, relaxa! Todo mundo passa por isso", "Eu sei que parece difícil, mas CONFIA em mim!"
- HUMOR LEVE: Faça piadas e comentários divertidos para descontrair
- ENERGIA POSITIVA: Transmita animação mesmo em correções - "Quase lá! Vamos ajustar uma coisinha..."

COMO VOCÊ SE EXPRESSA:
- Use interjeições: "Uau!", "Nossa!", "Olha só!", "Eita!", "Opa!", "Vixe!", "Caramba!"
- Enfatize palavras: "Isso é MUITO importante", "A sacada PRINCIPAL é...", "O SEGREDO está aqui!"
- Faça pausas dramáticas antes de revelar algo importante
- Varie entre empolgação e momentos mais calmos de explicação
- Use comparações engraçadas e analogias do dia-a-dia
- Fale como se estivesse conversando com um amigo - natural e descontraído
- Às vezes repita palavras para dar ênfase: "Isso, isso, ISSO!"

EXEMPLOS DE FALAS EXPRESSIVAS:
- "Então, OLHA SÓ que coisa interessante..."
- "Agora vem a parte que eu MAIS GOSTO de explicar!"
- "Cara, quando eu descobri isso aqui, minha mente EXPLODIU!"
- "Calma, calma... deixa eu te mostrar um truque SENSACIONAL!"
- "Ei, tá indo SUPER bem! Continua assim!"
- "Opa opa opa! Pausa dramática... AGORA sim você entendeu!"
- "Viu? Não era um bicho de sete cabeças, era?"

=== PROIBIÇÕES ABSOLUTAS ===
- Jamais use emojis, pictogramas ou símbolos gráficos
${!hasVisionEnabled ? `- Você NÃO tem acesso a câmera, vídeo do aluno ou qualquer entrada visual
- Nunca descreva aparência, expressões faciais, olhar, postura ou linguagem corporal
- Nunca faça comentários sobre rosto/expressões, nem como metáfora
- Nunca diga "eu vi", "estou vendo", "percebo pela sua cara"
- Não faça suposições emocionais sem que o aluno verbalize` : `
=== VISÃO COMPUTACIONAL ATIVADA ===
O aluno CONSENTIU em compartilhar sua câmera. Você receberá imagens periódicas dele.
DIRETRIZES DE USO:
- Use as imagens SUTILMENTE para adaptar seu ensino
- Se perceber distração: "Ei, tudo bem? Vamos fazer uma pausinha?"
- Se perceber confusão: "Opa, acho que fui rápido demais! Deixa eu explicar de outro jeito..."
- Se perceber cansaço: "Que tal um intervalinho de 2 minutos? Você merece!"
- NUNCA descreva a aparência física do aluno
- Seja NATURAL - a visão é ferramenta de empatia, não vigilância`}

=== TÉCNICAS DIDÁTICAS EXPRESSIVAS ===
1. ANTECIPAÇÃO: "Agora vem a parte MAIS legal..." (cria expectativa)
2. CELEBRAÇÃO: Comemore cada acerto como se fosse uma vitória épica
3. ANALOGIAS DIVERTIDAS: "É tipo quando você..." (conecte ao cotidiano de forma engraçada)
4. REFORMULAÇÃO ANIMADA: "Opa, deixa eu explicar de um jeito MAIS legal..."
5. REFORÇO ENTUSIASMADO: "Isso! EXATAMENTE isso! Você PEGOU a ideia!"
6. PAUSAS DRAMÁTICAS: Use silêncio antes de revelar conceitos importantes

=== LIDANDO COM ERROS ===
- Transforme erros em momentos de aprendizado POSITIVOS
- "Opa! Quase lá! Olha só a pegadinha aqui..."
- "Ei, eu ADOREI seu raciocínio! Só precisamos ajustar uma coisinha..."
- "Sabe o que é ÓTIMO? Esse erro aqui ensina MUITO!"

=== FILOSOFIA VIBE CODING ===
- Programar com IA é uma AVENTURA, não um teste!
- Cada erro é um passo para o sucesso
- Curiosidade vale MAIS que perfeição
- Aprender deve ser DIVERTIDO!

=== CONTROLE DO VIDEO ===
Você tem funções para controlar o vídeo. SEMPRE use quando o aluno pedir:
1. play_video: "da play", "continua", "roda", "pode ir"
2. pause_video: "pausa", "para", "espera", "segura"  
3. restart_video: "reinicia", "do início", "de novo"
4. seek_backward: "volta", "volte X segundos", "repete essa parte"
5. seek_forward: "avança", "pula", "adianta X segundos"

CHAME a função correspondente - não apenas responda verbalmente!`;

    // Contexto da aula atual
    if (videoTitle) {
      instruction += `

=== AULA ATUAL ===
Título: "${videoTitle}"`;
    }
    
    if (videoTranscript) {
      const MAX_TRANSCRIPT_CHARS = 8000;
      const truncatedTranscript = videoTranscript.length > MAX_TRANSCRIPT_CHARS
        ? videoTranscript.substring(0, MAX_TRANSCRIPT_CHARS) + '\n[... transcrição truncada ...]'
        : videoTranscript;
      
      instruction += `

=== CONTEÚDO DA AULA ===
${truncatedTranscript}

Suas explicações devem ser baseadas EXCLUSIVAMENTE neste conteúdo. Não invente tópicos que não estão aqui.`;
    } else if (videoContext) {
      instruction += `

=== CONTEXTO DA AULA ===
${videoContext}

Use este contexto para guiar suas explicações.`;
    }
    // Plano de ensino
    if (contentPlan) {
      instruction += `

=== MOMENTOS DE APROFUNDAMENTO ===
${contentPlan.teaching_moments.map((m, i) => 
  `${i + 1}. [${Math.floor(m.timestamp_seconds / 60)}:${(m.timestamp_seconds % 60).toString().padStart(2, '0')}] ${m.topic} - ${m.key_insight}`
).join('\n')}

Quando receber "MOMENTO DE APROFUNDAMENTO":
1. Explique o insight principal em 2-3 frases
2. Faça APENAS UMA pergunta e PARE DE FALAR
3. ESPERE em silêncio a resposta do aluno
4. Só depois que o aluno responder, continue a conversa
5. NUNCA faça múltiplas perguntas consecutivas - isso confunde o aluno`;
    }

    // Quizzes
    if (timestampQuizzes.length > 0) {
      instruction += `

=== MINI QUIZZES ===
Quando receber "MINI QUIZ!":
1. Leia a pergunta claramente
2. Leia cada opção (A, B, C, D)
3. Aguarde a resposta
4. Após o resultado do sistema:
   - Acertou: celebre brevemente
   - Errou: explique e encoraje`;
    }

    // Encerramento da aula
    instruction += `

=== ENCERRAMENTO DA AULA ===
Quando o vídeo terminar (você receberá a mensagem "O vídeo terminou"):
1. Diga "Aula concluída!" para sinalizar o encerramento
2. Faça um breve resumo dos principais pontos aprendidos (máximo 3-4 pontos), começando cada ponto com "PONTO:"
3. Celebre o progresso do aluno: "Mandou muito bem hoje!"
4. Proponha uma TAREFA DA SEMANA iniciando com "TAREFA DA SEMANA:" seguido da descrição:
   - Deve ser prática e aplicável
   - Algo que o aluno possa fazer usando o que aprendeu
   - Ex: "TAREFA DA SEMANA: criar um projeto simples usando X" ou "TAREFA DA SEMANA: Pratique Y fazendo Z"
5. Despeça-se de forma motivadora e informal`;


    return instruction;
  }, [videoContext, videoTitle, videoTranscript, contentPlan, timestampQuizzes.length, engagement.vision.isEnabled]);

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
    if (!hasVideo) return null;

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
  }, [hasVideo]);

  const {
    status,
    isListening,
    isSpeaking,
    isVoiceDetected,
    connect,
    disconnect,
    startListening,
    stopListening,
    sendText,
  } = useOpenAIRealtime({
    systemInstruction,
    videoControls,
    onTranscript: (text, role) => {
      console.log(`📝 [VOICECHAT TRANSCRIPT] ${role}: ${text.substring(0, 100)}...`);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        text,
        role,
        timestamp: new Date()
      }]);
      
      // Capture end-of-lesson data from assistant messages
      if (role === 'assistant' && isCapturingEndDataRef.current) {
        endMessageBufferRef.current += ' ' + text;
        
        // Extract weekly task if present
        const taskMatch = endMessageBufferRef.current.match(/TAREFA DA SEMANA[:\s]+(.+?)(?=PONTO:|$)/i);
        if (taskMatch) {
          setLessonEndData(prev => ({ ...prev, weeklyTask: taskMatch[1].trim() }));
        }
        
        // Extract summary points (lines starting with PONTO:)
        const bulletPoints = endMessageBufferRef.current.match(/PONTO:\s*[^P]+/gi);
        if (bulletPoints && bulletPoints.length > 0) {
          const points = bulletPoints.map(p => p.replace(/^PONTO:\s*/i, '').trim()).filter(p => p.length > 0);
          setLessonEndData(prev => ({ ...prev, summaryPoints: points }));
        }
      }
    },
    onError: (error) => {
      console.error('🚨 [VOICECHAT ERROR] Erro recebido:', error);
      toast.error(error);
    },
    onStatusChange: (newStatus) => {
      console.log(`🔄 [VOICECHAT STATUS] Status mudou para: ${newStatus}`);
      console.log(`🔄 [VOICECHAT STATUS] agentMode atual: ${agentMode}`);
      if (newStatus === 'disconnected') {
        setConnectionStep('idle');
      }
    },
    onConnectionStepChange: (step) => {
      console.log(`🔄 [VOICECHAT STEP] Etapa de conexão: ${step}`);
      setConnectionStep(step);
    }
  });

  // Send MediaPipe analysis (text) to OpenAI instead of raw frames (cheaper & more private)
  const lastVisionUpdateRef = useRef<number>(0);
  const lastVisionStateRef = useRef<string>('');
  
  // Periodically send MediaPipe vision analysis to OpenAI as text context
  useEffect(() => {
    if (!engagement.vision.isEnabled || status !== 'connected') return;
    
    const intervalId = setInterval(() => {
      const now = Date.now();
      // Rate limit: max 1 update every 8 seconds
      if (now - lastVisionUpdateRef.current < 8000) return;
      
      const visionSignals = engagement.vision.signals;
      if (!visionSignals.enabled || !visionSignals.faceDetected) return;
      
      // Build a text description of the student's state
      let stateDescription = '';
      
      // Gaze analysis
      if (!visionSignals.isLookingAtScreen) {
        stateDescription = 'O aluno está olhando para fora da tela.';
      } else if (visionSignals.gazeOnVideoRatio < 0.5) {
        stateDescription = 'O aluno parece distraído, olhando pouco para a tela.';
      }
      
      // Expression/fatigue analysis
      if (visionSignals.expression === 'confused') {
        stateDescription = 'O aluno parece confuso ou pensativo.';
      } else if (visionSignals.expression === 'tired') {
        stateDescription = 'O aluno parece cansado.';
      }
      
      // Distance analysis
      if (visionSignals.distanceFromScreen > 1.2) {
        stateDescription = 'O aluno está se afastando da tela.';
      }
      
      // Only send if there's something noteworthy AND it's different from last update
      if (stateDescription && stateDescription !== lastVisionStateRef.current) {
        lastVisionUpdateRef.current = now;
        lastVisionStateRef.current = stateDescription;
        
        console.log('[VoiceChat] Sending MediaPipe analysis to tutor:', stateDescription);
        
        // Send as silent context (the AI won't read this aloud but will use it)
        sendText(`[CONTEXTO VISUAL SILENCIOSO - NÃO LEIA EM VOZ ALTA, apenas adapte seu comportamento] ${stateDescription}`);
      }
    }, 3000); // Check every 3 seconds
    
    return () => clearInterval(intervalId);
  }, [engagement.vision.isEnabled, engagement.vision.signals, status, sendText]);

  // Update refs when values change
  useEffect(() => {
    sendTextRef.current = sendText;
    statusRef.current = status;
  }, [sendText, status]);

  // Set up engagement intervention handler after status and connect are available
  useEffect(() => {
    engagementInterventionHandlerRef.current = (reason: InterventionReason) => {
      console.log('[VoiceChat] Intervention triggered:', reason);
      
      // Only intervene when video is playing and agent is not connected
      if (agentMode !== 'playing' || statusRef.current === 'connected') {
        console.log('[VoiceChat] Intervention skipped - not in playing mode or agent connected');
        return;
      }

      switch (reason.type) {
        case 'low_attention':
          // Pause video and ask check-in question
          videoPlayerRef.current?.pause();
          setAgentMode('teaching');
          setIsVideoExpanded(false);
          setPendingReconnect({ 
            type: 'moment', 
            data: { 
              topic: 'Verificação de atenção',
              key_insight: 'Parece que você se distraiu. Vamos retomar?',
              questions_to_ask: ['Está conseguindo acompanhar?', 'Quer que eu repita algo?'],
              discussion_points: [],
              timestamp_seconds: currentVideoTime,
            } as TeachingMoment 
          });
          connect();
          toast.info('🎯 O professor notou que você se distraiu...', { duration: 3000 });
          break;

        case 'tab_switch':
          // Just pause the video silently
          videoPlayerRef.current?.pause();
          toast.info('⏸️ Vídeo pausado - você saiu da aba', { duration: 2000 });
          break;

        case 'high_confusion':
          // Pause and offer help
          videoPlayerRef.current?.pause();
          setAgentMode('teaching');
          setIsVideoExpanded(false);
          setPendingReconnect({ 
            type: 'moment', 
            data: { 
              topic: 'Momento de dúvida',
              key_insight: 'Percebi que você pode estar com dúvidas. Vamos esclarecer!',
              questions_to_ask: ['O que não ficou claro?', 'Quer que eu explique de outra forma?'],
              discussion_points: [],
              timestamp_seconds: currentVideoTime,
            } as TeachingMoment 
          });
          connect();
          toast.info('💡 O professor quer te ajudar com uma dúvida...', { duration: 3000 });
          break;

        case 'fatigue':
          toast.info('😴 Você parece cansado. Que tal uma pausa?', { duration: 5000 });
          break;

        default:
          console.log('[VoiceChat] Unhandled intervention type:', reason.type);
      }
    };
  }, [agentMode, currentVideoTime, connect]);

  // Feed audio signals from transcripts
  useEffect(() => {
    // Analyze transcripts for engagement signals
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      engagement.audio.analyzeTranscript(lastMessage.text, lastMessage.role);
    }
  }, [messages, engagement.audio]);

  // Track voice detection for engagement
  useEffect(() => {
    if (isVoiceDetected) {
      engagement.audio.onUserSpeechStart();
    }
  }, [isVoiceDetected, engagement.audio]);

  // Track agent speaking for engagement
  useEffect(() => {
    if (!isSpeaking) {
      engagement.audio.onAgentSpeechEnd();
    }
  }, [isSpeaking, engagement.audio]);

  // Handle agent connection events - process pending actions
  useEffect(() => {
    let introTimeout: ReturnType<typeof setTimeout> | null = null;
    
    console.log(`🎬 [VOICECHAT EFFECT] Status changed effect - status: ${status}, agentMode: ${agentMode}`);
    
    if (status === 'connected') {
      console.log('🎬 [VOICECHAT EFFECT] ✅ Conectado! isListening:', isListening);
      
      // Start microphone when connected
      if (!isListening) {
        console.log('🎤 [VOICECHAT EFFECT] Iniciando microfone...');
        startListening();
      }
      
      // Process any pending reconnect actions
      if (pendingReconnect) {
        console.log('🎬 [VOICECHAT EFFECT] Processando pendingReconnect:', pendingReconnect.type);
        const { type, data } = pendingReconnect;
        setPendingReconnect(null);
        
        if (type === 'moment') {
          console.log('🎬 [VOICECHAT EFFECT] Configurando teaching moment:', data.topic);
          setActiveMoment(data);
          const instruction = generateTeacherInstructions(data);
          setTimeout(() => sendText(instruction), 500);
          toast.info(`🎯 Momento de aprofundamento: ${data.topic}`, { duration: 5000 });
        } else if (type === 'quiz') {
          setActiveQuiz(data);
          const quizInstruction = `MINI QUIZ! Hora de testar o conhecimento do aluno.
          
Pergunta: "${data.question}"

Opções:
${data.options.map((opt: string, i: number) => `${String.fromCharCode(65 + i)}) ${opt}`).join('\n')}

INSTRUÇÕES:
1. Leia a pergunta de forma clara e pausada
2. Leia cada opção (A, B, C, D)
3. Diga "Você tem alguns segundos para pensar"
4. Aguarde; o sistema vai revelar a resposta automaticamente na tela`;
          setTimeout(() => sendText(quizInstruction), 500);
          toast.info('📝 Mini Quiz!', { duration: 3000 });
        }
      }
      
      // Handle intro mode - agent starts class only if custom intro is configured
      if (agentMode === 'intro' && !introCompletedRef.current) {
        console.log('🎬 [VOICECHAT EFFECT] Modo intro detectado, configurando...');
        introCompletedRef.current = true;
        
        // Only send intro if admin configured a custom teacher intro
        const customIntro = teacherIntro?.trim();
        console.log('🎬 [VOICECHAT EFFECT] Custom intro:', customIntro ? 'SIM' : 'NÃO');
        
        if (customIntro) {
          const introInstruction = `[SISTEMA] Você acabou de se conectar com o aluno para começar uma nova aula.

INTRODUÇÃO PERSONALIZADA (USE EXATAMENTE ESTE TEXTO COMO BASE):
"${customIntro}"

INSTRUÇÕES:
1. Use a introdução personalizada acima como guia para seu tom e estilo
2. Adapte naturalmente, mas mantenha a essência do texto
3. Após a introdução, pergunte se o aluno está pronto para começar
4. Seja breve - máximo 30 segundos`;
          
          setTimeout(() => {
            if (statusRef.current === 'connected' && sendTextRef.current) {
              sendTextRef.current(introInstruction);
            }
          }, 1000);
        }
        // If no custom intro, agent stays silent and waits for user interaction
      }
    }
    
    // Always return cleanup function to avoid hooks order issues
    return () => {
      if (introTimeout) {
        clearTimeout(introTimeout);
      }
    };
  }, [status, pendingReconnect, agentMode, isListening, startListening, sendText, generateTeacherInstructions, disconnect]);

  // Monitor video time for teaching moments and quizzes (works even when disconnected)
  useEffect(() => {
    if (!videoId) {
      if (timeCheckIntervalRef.current) {
        clearInterval(timeCheckIntervalRef.current);
        timeCheckIntervalRef.current = null;
      }
      return;
    }

    timeCheckIntervalRef.current = window.setInterval(() => {
      const currentTime = videoPlayerRef.current?.getCurrentTime() || 0;
      const isPaused = videoPlayerRef.current?.isPaused() ?? true;
      
      // Update current time for timer display
      setCurrentVideoTime(currentTime);
      
      // Calculate next pause (quiz or teaching moment)
      const allPauses: {time: number; type: 'quiz' | 'moment'; topic?: string}[] = [];
      
      // Add upcoming quizzes
      timestampQuizzes.forEach(q => {
        if (q.timestampSeconds && q.timestampSeconds > currentTime) {
          allPauses.push({ time: q.timestampSeconds, type: 'quiz', topic: 'Quiz' });
        }
      });
      
      // Add upcoming teaching moments
      if (contentPlan) {
        contentPlan.teaching_moments.forEach(m => {
          if (m.timestamp_seconds > currentTime) {
            allPauses.push({ time: m.timestamp_seconds, type: 'moment', topic: m.topic });
          }
        });
      }
      
      // Sort and get the next one
      allPauses.sort((a, b) => a.time - b.time);
      setNextPauseInfo(allPauses[0] || null);
      
      // Only check when video is playing and no quiz is active
      // NOTE: Do not gate by agentMode: the student may start playback manually (e.g. during intro)
      // and pauses still must trigger reliably.
      if (!isPaused && !activeQuiz) {
        // Check for timestamp quizzes first
        const quiz = getQuizForTimestamp(currentTime);
        if (quiz) {
          markQuizTriggered(quiz.id);
          videoPlayerRef.current?.pause();
          setAgentMode('teaching');
          setIsVideoExpanded(false); // Collapse video for quiz interaction
          
          // If agent is connected, send instruction. Otherwise, reconnect first.
          if (status === 'connected') {
            setActiveQuiz(quiz);
            const quizInstruction = `MINI QUIZ! Hora de testar o conhecimento do aluno.
            
Pergunta: "${quiz.question}"

Opções:
${quiz.options.map((opt, i) => `${String.fromCharCode(65 + i)}) ${opt}`).join('\n')}

INSTRUÇÕES:
1. Leia a pergunta de forma clara e pausada
2. Leia cada opção (A, B, C, D)
3. Diga "Você tem alguns segundos para pensar"
4. Aguarde; o sistema vai revelar a resposta automaticamente na tela`;
            sendText(quizInstruction);
            toast.info('📝 Mini Quiz!', { duration: 3000 });
          } else {
            // Queue the quiz and reconnect
            setPendingReconnect({ type: 'quiz', data: quiz });
            connect();
          }
          return;
        }

        // Check for teaching moments
        if (contentPlan) {
          const moment = checkForTeachingMoment(currentTime);
          
          if (moment && lastCheckedMomentRef.current !== contentPlan.teaching_moments.indexOf(moment)) {
            lastCheckedMomentRef.current = contentPlan.teaching_moments.indexOf(moment);
            videoPlayerRef.current?.pause();
            setAgentMode('teaching');
            setIsVideoExpanded(false); // Collapse video for teaching moment
            
            // If agent is connected, send instruction. Otherwise, reconnect first.
            if (status === 'connected') {
              setActiveMoment(moment);
              const instruction = generateTeacherInstructions(moment);
              sendText(instruction);
              toast.info(`🎯 Momento de aprofundamento: ${moment.topic}`, { duration: 5000 });
            } else {
              // Queue the moment and reconnect
              setPendingReconnect({ type: 'moment', data: moment });
              connect();
            }
          }
        }
      }
    }, 1000);

    return () => {
      if (timeCheckIntervalRef.current) {
        clearInterval(timeCheckIntervalRef.current);
        timeCheckIntervalRef.current = null;
      }
    };
  }, [status, contentPlan, videoId, activeQuiz, checkForTeachingMoment, generateTeacherInstructions, sendText, getQuizForTimestamp, markQuizTriggered, connect, timestampQuizzes]);

  // Resume video helper with retry logic
  const resumeVideo = useCallback(() => {
    console.log('[VoiceChat] resumeVideo called');
    
    if (!videoPlayerRef.current) {
      console.error('[VoiceChat] videoPlayerRef.current is null');
      return;
    }
    
    // Call play directly - the VideoPlayer queues the action if not ready
    console.log('[VoiceChat] Calling videoPlayerRef.current.play()');
    videoPlayerRef.current.play();
    
    // Check after a delay if video started, retry if needed
    const checkAndRetry = (attempt: number) => {
      setTimeout(() => {
        if (!videoPlayerRef.current) return;
        
        const isPaused = videoPlayerRef.current.isPaused();
        console.log(`[VoiceChat] Check attempt ${attempt}: isPaused=${isPaused}`);
        
        if (isPaused && attempt < 3) {
          console.log('[VoiceChat] Video still paused, retrying play()...');
          videoPlayerRef.current.play();
          checkAndRetry(attempt + 1);
        } else if (isPaused) {
          console.error('[VoiceChat] Failed to start video after 3 attempts');
          toast.error('Não foi possível iniciar o vídeo. Clique no play manualmente.');
        } else {
          console.log('[VoiceChat] Video is playing!');
        }
      }, 800); // Give more time for YouTube player to respond
    };
    
    checkAndRetry(1);
  }, []);

  // Handle video ended - trigger class wrap-up
  const handleVideoEnded = useCallback(() => {
    console.log('[VoiceChat] Video ended, triggering class wrap-up');
    
    // Start capturing end data
    isCapturingEndDataRef.current = true;
    endMessageBufferRef.current = '';
    setLessonEndData({});
    
    // Collapse video and set to teaching mode for wrap-up
    setIsVideoExpanded(false);
    setAgentMode('teaching');
    
    // If agent is connected, send the wrap-up instruction
    if (statusRef.current === 'connected' && sendTextRef.current) {
      sendTextRef.current('[SISTEMA] O vídeo terminou. Hora de encerrar a aula! Diga "Aula concluída!", faça um resumo breve marcando cada ponto com "PONTO:", celebre o progresso, proponha a TAREFA DA SEMANA, e despeça-se.');
      
      // Show end screen after a delay for agent to finish
      setTimeout(() => {
        setAgentMode('ended');
        isCapturingEndDataRef.current = false;
      }, 15000);
    } else {
      // Reconnect to deliver wrap-up
      setPendingReconnect({ type: 'moment', data: { topic: 'Encerramento da aula' } as any });
      connect();
    }
  }, [connect]);

  // Handle quiz completion
  const handleQuizComplete = useCallback((selectedIndex: number, isCorrect: boolean) => {
    if (!activeQuiz) return;
    
    // Record the attempt
    recordAttempt(activeQuiz.id, selectedIndex, isCorrect);
    
    // Tell the agent the result
    const resultText = isCorrect 
      ? `[SISTEMA] O aluno acertou o quiz! A resposta correta era "${activeQuiz.options[activeQuiz.correctIndex]}". Parabenize brevemente e depois diga "Vamos continuar!".`
      : selectedIndex === -1
        ? `[SISTEMA] O tempo do quiz acabou sem resposta. A resposta correta era "${activeQuiz.options[activeQuiz.correctIndex]}". Explique em uma frase e depois diga "Continuando o vídeo!".`
        : `[SISTEMA] O aluno errou o quiz. A correta era "${activeQuiz.options[activeQuiz.correctIndex]}". Explique brevemente de forma encorajadora e depois diga "Vamos seguir!".`;
    
    if (status === 'connected') {
      sendText(resultText);
    }
    setActiveQuiz(null);
    
    // Resume video after brief delay for agent to respond
    setTimeout(() => {
      console.log('[VoiceChat] Quiz complete, resuming video');
      resumeVideo();
      setAgentMode('playing');
      // Disconnect to save tokens while video plays
      setTimeout(() => {
        if (statusRef.current === 'connected') {
          disconnect();
        }
      }, 5000); // Give time for agent to finish speaking
    }, 2000);
  }, [activeQuiz, recordAttempt, sendText, status, disconnect, resumeVideo]);

  const handleSendText = () => {
    if (!textInput.trim()) return;
    sendText(textInput);
    setTextInput('');
  };

  const handleStartClass = useCallback(() => {
    // One-click student flow: use this user gesture to unlock YouTube programmatic playback
    videoPlayerRef.current?.unlockPlayback?.();
    introCompletedRef.current = false;
    setAgentMode('intro');
    connect();
  }, [connect]);

  // Called when student confirms they're ready to start the video
  const handleStartVideo = useCallback(() => {
    if (status === 'connected') {
      sendText('[SISTEMA] O aluno confirmou que está pronto. Diga algo breve como "Vamos lá! Começando o vídeo..." e prepare-se para voltar nos momentos de pausa.');
      setTimeout(() => {
        console.log('[VoiceChat] Starting video after intro');
        resumeVideo();
        setAgentMode('playing');
        setIsVideoExpanded(true); // Expand video when playing
        // Disconnect after agent finishes speaking
        setTimeout(() => {
          if (statusRef.current === 'connected') {
            disconnect();
          }
        }, 3000);
      }, 2000);
    }
  }, [status, sendText, disconnect, resumeVideo]);

  // Handle dismissing teaching moment - resume video and disconnect
  const handleDismissMoment = useCallback(() => {
    console.log('[VoiceChat] handleDismissMoment called');
    setActiveMoment(null);
    if (status === 'connected') {
      sendText('[SISTEMA] O aluno quer continuar o vídeo. Diga algo breve como "Vamos lá!" e prepare-se para a próxima parada.');
      setTimeout(() => {
        console.log('[VoiceChat] Moment dismissed, resuming video');
        resumeVideo();
        setAgentMode('playing');
        setIsVideoExpanded(true); // Re-expand video when resuming
        setTimeout(() => disconnect(), 3000);
      }, 1500);
    } else {
      console.log('[VoiceChat] Moment dismissed (not connected), resuming video directly');
      resumeVideo();
      setAgentMode('playing');
      setIsVideoExpanded(true); // Re-expand video when resuming
    }
  }, [disconnect, sendText, status, resumeVideo]);

  const dismissActiveMoment = () => {
    handleDismissMoment();
  };

  // Format seconds to MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate time remaining until next pause
  const timeUntilNextPause = nextPauseInfo ? Math.max(0, nextPauseInfo.time - currentVideoTime) : null;

  const statusColor = useMemo(() => {
    if (agentMode === 'playing' && status === 'disconnected') return 'bg-google-blue';
    switch (status) {
      case 'connected': return 'bg-google-green';
      case 'connecting': return 'bg-google-yellow';
      case 'error': return 'bg-google-red';
      default: return 'bg-muted';
    }
  }, [status, agentMode]);

  const statusText = useMemo(() => {
    if (agentMode === 'playing' && status === 'disconnected') return '▶️ Assistindo';
    if (agentMode === 'intro') return '👋 Introdução';
    if (agentMode === 'teaching') return '🎓 Ensinando';
    switch (status) {
      case 'connected': return 'Professor ativo';
      case 'connecting': return 'Conectando...';
      case 'error': return 'Erro de conexão';
      default: return 'Aguardando';
    }
  }, [status, agentMode]);

  // Detailed connection step text for better UX
  const connectionStepText = useMemo(() => {
    switch (connectionStep) {
      case 'fetching_key': return 'Buscando credenciais...';
      case 'connecting_ws': return 'Conectando ao tutor...';
      case 'configuring': return 'Configurando sessão...';
      case 'ready': return 'Pronto!';
      default: return 'Conectando...';
    }
  }, [connectionStep]);

  return (
    <>
    <Card className={`flex flex-col transition-all duration-500 ${
      isVideoExpanded 
        ? 'h-[90vh] fixed inset-x-0 top-0 z-50 rounded-none border-x-0 border-t-0' 
        : 'h-full min-h-[400px] sm:min-h-0'
    }`}>
      {/* Collapsed Header when video is expanded */}
      {isVideoExpanded ? (
        <CardHeader className="py-2 px-3 sm:px-6 flex-shrink-0 bg-card/95 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${statusColor}`} />
              <span className="text-sm font-medium truncate max-w-[200px]">{videoTitle}</span>
            </div>
            <div className="flex items-center gap-2">
              {/* Next Pause Timer - Compact in header when expanded */}
              {agentMode === 'playing' && nextPauseInfo && timeUntilNextPause !== null && timeUntilNextPause > 0 && (
                <div className="flex items-center gap-1.5 text-xs">
                  <Target className="h-3 w-3 text-google-yellow" />
                  <span className="font-mono text-google-yellow">{formatTime(timeUntilNextPause)}</span>
                </div>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsVideoExpanded(false)}
                className="h-7 px-2 text-xs"
              >
                Minimizar
              </Button>
            </div>
          </div>
        </CardHeader>
      ) : (
        <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${statusColor}`} />
              Professor IA
            </CardTitle>
            <div className="flex items-center gap-2">
              {/* Debug badge */}
              
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
              <span className="text-[10px] sm:text-xs text-muted-foreground">{statusText}</span>
            </div>
          </div>
        </CardHeader>
      )}
      
      <CardContent className={`flex-1 flex flex-col gap-3 sm:gap-4 overflow-hidden px-3 sm:px-6 pb-3 sm:pb-6 ${
        isVideoExpanded ? 'pt-0' : ''
      }`}>
        {/* Video Player with Quiz Overlay */}
        {hasVideo && (
          <div className={`relative transition-all duration-500 ${
            isVideoExpanded 
              ? 'flex-1 min-h-0' 
              : 'flex-shrink-0'
          }`}>
            <div className={isVideoExpanded ? 'h-full' : ''}>
              {isDirectVideo && videoUrl ? (
                <DirectVideoPlayer 
                  ref={videoPlayerRef as React.RefObject<DirectVideoPlayerRef>} 
                  videoUrl={videoUrl} 
                  title={videoTitle}
                  expanded={isVideoExpanded}
                  onEnded={handleVideoEnded}
                />
              ) : videoId ? (
                <VideoPlayer 
                  ref={videoPlayerRef as React.RefObject<VideoPlayerRef>} 
                  videoId={videoId} 
                  title={videoTitle}
                  expanded={isVideoExpanded}
                  onEnded={handleVideoEnded}
                />
              ) : null}
            </div>
            
            {/* Next Pause Timer - Discrete overlay at bottom of video */}
            {agentMode === 'playing' && nextPauseInfo && timeUntilNextPause !== null && timeUntilNextPause > 0 && (
              <div className="absolute bottom-2 right-2 z-10">
                <div className="bg-black/70 backdrop-blur-sm text-white px-2 py-1 rounded-md text-xs flex items-center gap-1.5 animate-fade-in">
                  <Target className="h-3 w-3 text-google-yellow" />
                  <span className="text-muted-foreground/80">Próxima pausa:</span>
                  <span className="font-mono font-medium text-google-yellow">{formatTime(timeUntilNextPause)}</span>
                  {nextPauseInfo.type === 'quiz' && (
                    <Badge variant="outline" className="text-[8px] h-4 px-1 border-google-blue text-google-blue">Quiz</Badge>
                  )}
                </div>
              </div>
            )}
            
            {/* Mini Quiz Overlay */}
            <AnimatePresence>
              {activeQuiz && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-20 p-4">
                  <div className="w-full max-w-md">
                    <MiniQuiz
                      question={{
                        id: activeQuiz.id,
                        question: activeQuiz.question,
                        options: activeQuiz.options,
                        correctIndex: activeQuiz.correctIndex,
                        explanation: activeQuiz.explanation,
                      }}
                      onComplete={handleQuizComplete}
                      revealDelay={10}
                      autoAdvanceDelay={5}
                    />
                  </div>
                </div>
              )}
            </AnimatePresence>
            
            {/* Pause Times List */}
            {(contentPlan?.teaching_moments?.length > 0 || timestampQuizzes.length > 0) && (
              <div className="flex flex-wrap items-center gap-1 mt-1.5 text-[9px] text-muted-foreground">
                <span className="font-medium">Pausas:</span>
                {[
                  ...timestampQuizzes
                    .filter(q => q.timestampSeconds)
                    .map(q => ({ time: q.timestampSeconds!, type: 'quiz' as const })),
                  ...(contentPlan?.teaching_moments || [])
                    .map(m => ({ time: m.timestamp_seconds, type: 'moment' as const }))
                ]
                  .sort((a, b) => a.time - b.time)
                  .map((pause, i) => (
                    <span 
                      key={i} 
                      className={`font-mono px-1 py-0.5 rounded ${
                        pause.type === 'quiz' 
                          ? 'bg-google-blue/20 text-google-blue' 
                          : 'bg-google-yellow/20 text-google-yellow'
                      }`}
                    >
                      {formatTime(pause.time)}
                    </span>
                  ))
                }
              </div>
            )}
            
            <div className="flex items-center justify-between mt-1">
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
        
        {/* Collapsible Chat Section */}
        <div className="border rounded-lg overflow-hidden flex-shrink-0">
          <button
            onClick={() => setShowChat(!showChat)}
            className="w-full flex items-center justify-between p-2 sm:p-3 bg-muted/30 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <MessageSquare className="h-4 w-4" />
              <span>Chat de Texto</span>
              {messages.length > 0 && (
                <Badge variant="secondary" className="text-[10px] h-5">
                  {messages.length}
                </Badge>
              )}
            </div>
            {showChat ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          
          {showChat && (
            <div className="p-2 sm:p-3 border-t space-y-2">
              {/* Messages */}
              <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                {messages.length === 0 ? (
                  <div className="text-center text-muted-foreground p-3">
                    <p className="text-xs">Nenhuma mensagem ainda</p>
                  </div>
                ) : (
                  messages.map((msg) => (
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
                  ))
                )}
              </div>
              
              {/* Text input - only when connected */}
              {status === 'connected' && (
                <div className="flex gap-2 pt-2 border-t">
                  <Input
                    placeholder="Digite sua pergunta..."
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
                    className="h-9 text-sm"
                  />
                  <Button onClick={handleSendText} size="icon" variant="secondary" className="h-9 w-9">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Voice indicators */}
        {status === 'connected' && (
          <div className="flex justify-center gap-6 sm:gap-8 py-1.5 sm:py-2">
            {isListening && (
              <div className="text-center">
                <VoiceIndicator isActive={isListening} type="listening" isVoiceDetected={isVoiceDetected} />
                <p className={`text-[10px] sm:text-xs mt-0.5 sm:mt-1 transition-colors ${isVoiceDetected ? 'text-green-600 dark:text-green-400 font-medium' : 'text-muted-foreground'}`}>
                  {isVoiceDetected ? 'Voz detectada' : 'Ouvindo...'}
                </p>
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
        
        {/* Engagement Panel - shows attention metrics */}
        <EngagementPanel
          stateVector={engagement.stateVector}
          visionEnabled={engagement.vision.isEnabled}
          visionConsent={engagement.vision.hasConsent}
          onToggleVision={() => {
            if (engagement.vision.isEnabled) {
              engagement.vision.disableVision();
            } else if (engagement.vision.hasConsent) {
              engagement.vision.enableVision();
            } else {
              setShowVisionConsent(true);
            }
          }}
          isInterventionTriggered={engagement.isInterventionTriggered}
          className="flex-shrink-0"
        />
        
        {/* Controls */}
        <div className="space-y-2 sm:space-y-3 pt-2 border-t flex-shrink-0">
          <div className="flex gap-2">
            {status === 'disconnected' && agentMode !== 'playing' ? (
              <Button onClick={handleStartClass} className="flex-1 h-12 sm:h-11 text-sm sm:text-base">
                <Phone className="h-5 w-5 sm:h-4 sm:w-4 mr-2" />
                Iniciar Aula
              </Button>
            ) : status === 'connecting' ? (
              <Button disabled className="flex-1 h-12 sm:h-11 text-sm sm:text-base gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  <span>{connectionStepText}</span>
                </div>
              </Button>
            ) : agentMode === 'intro' && status === 'connected' ? (
              <>
                {/* Intro mode - show "Start Video" button */}
                <div className="flex-1 flex items-center justify-center gap-2 h-10 sm:h-11 bg-primary/10 rounded-md px-3">
                  {isListening ? (
                    <>
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      <span className="text-sm text-primary">Professor apresentando...</span>
                    </>
                  ) : isSpeaking ? (
                    <>
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                      <span className="text-sm text-primary">Ouvindo introdução...</span>
                    </>
                  ) : (
                    <>
                      <div className="w-2 h-2 bg-green-500 rounded-full" />
                      <span className="text-sm text-muted-foreground">Preparando aula...</span>
                    </>
                  )}
                </div>
                <Button 
                  onClick={handleStartVideo} 
                  className="h-10 sm:h-11 px-4 bg-google-green hover:bg-google-green/90"
                >
                  <Play className="h-4 w-4 mr-2" />
                  <span>Começar Vídeo</span>
                </Button>
              </>
            ) : agentMode === 'playing' && status === 'disconnected' ? (
              <>
                {/* Video playing mode - agent disconnected */}
                <div className="flex-1 flex items-center justify-center gap-2 h-10 sm:h-11 bg-blue-500/10 rounded-md px-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                  <span className="text-sm text-blue-600 dark:text-blue-400">▶️ Vídeo em andamento...</span>
                </div>
              </>
            ) : status === 'connected' ? (
              <>
                {/* Connected and teaching */}
                <div className="flex-1 flex items-center justify-center gap-2 h-12 sm:h-11 bg-primary/10 rounded-md px-3">
                  {isListening ? (
                    isSpeaking ? (
                      <>
                        <div className="w-2 h-2 bg-google-blue rounded-full animate-pulse" />
                        <span className="text-sm text-primary">Professor falando...</span>
                        <VoiceIndicator isActive={true} type="speaking" />
                      </>
                    ) : isVoiceDetected ? (
                      <>
                        <div className="w-2 h-2 bg-google-green rounded-full animate-pulse" />
                        <span className="text-sm text-google-green">Voz detectada</span>
                        <VoiceIndicator isActive={true} type="listening" isVoiceDetected={true} />
                      </>
                    ) : (
                      <>
                        <ProcessingIndicator size="sm" />
                        <span className="text-sm text-google-yellow">Processando...</span>
                      </>
                    )
                  ) : isSpeaking ? (
                    <>
                      <div className="w-2 h-2 bg-google-blue rounded-full animate-pulse" />
                      <span className="text-sm text-primary">Professor falando...</span>
                      <VoiceIndicator isActive={true} type="speaking" />
                    </>
                  ) : (
                    <>
                      <div className="w-2 h-2 bg-google-green rounded-full" />
                      <span className="text-sm text-muted-foreground">Momento de aprendizado</span>
                    </>
                  )}
                </div>
                <Button onClick={disconnect} variant="destructive" className="h-12 sm:h-11 px-4">
                  <PhoneOff className="h-5 w-5 sm:h-4 sm:w-4 mr-2" />
                  <span className="hidden sm:inline">Encerrar</span>
                </Button>
              </>
            ) : (
              <Button onClick={handleStartClass} className="flex-1 h-10 sm:h-11 text-sm sm:text-base">
                <Phone className="h-4 w-4 mr-2" />
                Iniciar Aula
              </Button>
            )}
          </div>
          
        </div>
      </CardContent>
    </Card>
    
    {/* Lesson End Screen */}
    <LessonEndScreen
      isVisible={agentMode === 'ended'}
      videoTitle={videoTitle}
      weeklyTask={lessonEndData.weeklyTask}
      summaryPoints={lessonEndData.summaryPoints}
      onGoHome={() => navigate('/aluno/dashboard')}
      onRestartLesson={() => {
        setAgentMode('idle');
        setLessonEndData({});
        introCompletedRef.current = false;
        lastCheckedMomentRef.current = -1;
        videoPlayerRef.current?.restart();
      }}
    />
    
    {/* Vision Consent Dialog */}
    <VisionConsentDialog
      isOpen={showVisionConsent}
      onGrantConsent={() => {
        engagement.vision.grantConsent();
        engagement.vision.enableVision();
        setShowVisionConsent(false);
      }}
      onDeny={() => setShowVisionConsent(false)}
    />
    </>
  );
}
