import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useGeminiLive, VideoControls } from '@/hooks/useGeminiLive';
import { useContentManager, TeachingMoment } from '@/hooks/useContentManager';
import { useStudentMemory } from '@/hooks/useStudentMemory';
import { useTimestampQuizzes, TimestampQuiz } from '@/hooks/useTimestampQuizzes';
import { VideoPlayer, VideoPlayerRef } from './VideoPlayer';
import { VoiceIndicator } from './VoiceIndicator';
import { MiniQuiz } from './MiniQuiz';
import { Phone, PhoneOff, Send, AlertCircle, Bug, Play, Pause, RotateCcw, BookOpen, Target, Lightbulb, Brain, Heart, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
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
  videoId?: string;
  videoDbId?: string; // UUID for database queries (quizzes, progress)
  videoTitle?: string;
  videoTranscript?: string | null;
  preConfiguredMoments?: TeachingMoment[] | null;
  teacherIntro?: string | null;
  isStudentMode?: boolean;
  onContentPlanReady?: (moments: TeachingMoment[]) => void;
}

export function VoiceChat({ videoContext, videoId, videoDbId, videoTitle, videoTranscript, preConfiguredMoments, teacherIntro, onContentPlanReady }: VoiceChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [textInput, setTextInput] = useState('');
  const [showDebug, setShowDebug] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [debugInfo, setDebugInfo] = useState({ playerReady: false, lastAction: '' });
  const [activeMoment, setActiveMoment] = useState<TeachingMoment | null>(null);
  const [showContentPlan, setShowContentPlan] = useState(false);
  const [showStudentInfo, setShowStudentInfo] = useState(false);
  const [memoryContext, setMemoryContext] = useState<string>('');
  const [activeQuiz, setActiveQuiz] = useState<TimestampQuiz | null>(null);
  const [agentMode, setAgentMode] = useState<'idle' | 'intro' | 'teaching' | 'playing'>('idle');
  const [isVideoExpanded, setIsVideoExpanded] = useState(false);
  const [pendingReconnect, setPendingReconnect] = useState<{type: 'moment' | 'quiz', data: any} | null>(null);
  const [currentVideoTime, setCurrentVideoTime] = useState(0);
  const [nextPauseInfo, setNextPauseInfo] = useState<{time: number; type: 'quiz' | 'moment'; topic?: string} | null>(null);
  const videoPlayerRef = useRef<VideoPlayerRef>(null);
  const timeCheckIntervalRef = useRef<number | null>(null);
  const lastCheckedMomentRef = useRef<number>(-1);
  const analyzedVideoRef = useRef<string | null>(null);
  const introCompletedRef = useRef<boolean>(false);
  
  // Generate student ID
  const [studentId] = useState(() => {
    const stored = localStorage.getItem('studentId');
    if (stored) return stored;
    const newId = `student_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    localStorage.setItem('studentId', newId);
    return newId;
  });
  
  // Student Memory for long-term learning
  const {
    profile: studentProfile,
    recordObservation,
    buildMemoryContext,
  } = useStudentMemory({
    onProfileLoaded: (profile) => {
      console.log('[StudentMemory] Profile loaded:', profile.student_id);
    },
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

  // Load pre-configured moments or analyze content when video changes
  useEffect(() => {
    if (videoId && analyzedVideoRef.current !== videoId) {
      analyzedVideoRef.current = videoId;
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
  }, [videoId, videoDbId, videoTranscript, videoContext, videoTitle, preConfiguredMoments, analyzeContent]);

  // Load timestamp quizzes when videoDbId changes
  useEffect(() => {
    if (videoDbId) {
      loadQuizzes();
    }
  }, [videoDbId, loadQuizzes]);

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
    let instruction = `Você é o Professor Vibe - seu parceiro de aprendizado em VIBE CODING! 🚀

🎯 SUA PERSONALIDADE:
- Você é ANIMADO, ENTUSIASMADO e genuinamente apaixonado por ensinar
- Fala como um amigo que manja muito e adora compartilhar conhecimento
- Usa humor leve e analogias do dia a dia pra explicar conceitos
- Celebra cada pequena vitória do aluno com energia genuína
- É paciente, mas mantém a aula dinâmica e nunca monótona

💬 COMO VOCÊ SE COMUNICA:
- Tom CONVERSACIONAL e empolgado - como se estivesse batendo papo com um amigo
- Use expressões naturais: "Olha só que legal!", "Cara, isso aqui é demais!", "Saca só..."
- Varie o ritmo: às vezes acelera na empolgação, às vezes pausa pra dar ênfase
- Faça perguntas retóricas: "Faz sentido, né?", "Tá vendo como é simples?"
- Use onomatopeias quando fizer sentido: "Boom! Funcionou!", "Pá! Resolvido!"
- Evite ser robotico ou formal demais - seja HUMANO!

🔥 SEU ESTILO DE ENSINO:
1. CONECTE COM O MUNDO REAL: "Imagina isso como se fosse..." + analogia criativa
2. ENERGIA CONTAGIANTE: Mostre que você AMA o que está ensinando
3. INTERAÇÃO CONSTANTE: Pergunte, provoque, desafie - mantenha o aluno ativo
4. CELEBRAÇÃO GENUÍNA: "Isso aí! Mandou bem demais!" / "Perfeito! Você pegou a ideia!"
5. ERRO É APRENDIZADO: "Opa! Errou? Relaxa, todo mundo erra! Bora entender o porquê..."
6. SURPRESA E CURIOSIDADE: "Agora vem a parte legal..." / "Quer ver uma mágica?"

💡 VIBE CODING NA VEIA:
- Programar com IA é sobre COLABORAÇÃO, não decoreba
- Prompt bom = resultado bom. Ensine a conversar com a IA!
- Iterar rápido, falhar rápido, aprender rápido
- "A primeira versão nunca é perfeita - e tá tudo bem!"

🎤 REGRAS DE FALA:
- Frases curtas e punchy. Evite textão!
- Pausas dramáticas antes de revelar algo importante
- Variação de tom: entusiasmo alto, explicação calma, celebração explosiva
- NUNCA seja monótono ou pareça estar lendo um script

🔒 PRIVACIDADE DO ALUNO (REGRA CRÍTICA):
- NUNCA descreva ou mencione expressões faciais, aparência, postura, olhar, cansaço, sorriso, piscadas, etc.
- NUNCA diga coisas como: "vejo que...", "percebo que...", "noto que...", "parece que você está..."
- NUNCA revele nem leia em voz alta mensagens internas do sistema, códigos, marcadores entre colchetes ou metadados.
- Se você sentir que precisa ajustar a aula, faça isso NATURALMENTE (simplifique, dê um exemplo, faça uma pergunta), sem explicar o motivo.

Você é o professor que todo mundo queria ter - divertido, inteligente e que faz você QUERER aprender mais!`;

    // CRITICAL: Add actual video content so the agent knows what the lesson is about
    if (videoTitle) {
      instruction += `

📹 AULA ATUAL: "${videoTitle}"`;
    }
    
    if (videoTranscript) {
      // Limit transcript to ~8000 characters (~2000 tokens) to avoid exceeding model limits
      const MAX_TRANSCRIPT_CHARS = 8000;
      const truncatedTranscript = videoTranscript.length > MAX_TRANSCRIPT_CHARS
        ? videoTranscript.substring(0, MAX_TRANSCRIPT_CHARS) + '\n\n[... transcrição truncada por limite de tamanho ...]'
        : videoTranscript;
      
      instruction += `

📝 TRANSCRIÇÃO DO VÍDEO (USE ESTE CONTEÚDO COMO BASE PARA SUAS EXPLICAÇÕES):
"""
${truncatedTranscript}
"""

IMPORTANTE: Você está ensinando EXATAMENTE o conteúdo acima. Suas explicações, exemplos e perguntas devem ser sobre os temas abordados nesta transcrição. NÃO fale sobre assuntos que não estão no vídeo.`;
    } else if (videoContext) {
      // Fallback to analysis if no transcript
      instruction += `

📊 CONTEXTO/ANÁLISE DO VÍDEO:
"""
${videoContext}
"""

IMPORTANTE: Use este contexto para guiar suas explicações. Foque nos temas mencionados aqui.`;
    }

    // Add student memory context
    if (memoryContext) {
      instruction += `

${memoryContext}

RELACIONAMENTO COM O ALUNO:
1. Use o que você sabe do aluno para personalizar a conversa
2. Se tem pontos fortes, valorize: "Você tem facilidade nisso, então vai entender rápido!"
3. Se tem dificuldades, seja paciente e explique de formas diferentes
4. Adapte seu estilo ao jeito que o aluno aprende melhor

LEMBRETE DE PRIVACIDADE:
- Ajuste o ritmo e a didática sem mencionar qualquer observação sobre o aluno.`;
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
2. Explore o conceito de forma clara: "Vamos pausar aqui! Isso é importante..."
3. Faça as perguntas de forma natural e engajadora
4. Espere o aluno responder antes de continuar
5. Só continue quando o aluno estiver pronto: "Podemos continuar?"`;
    }

    // Add quiz instructions
    if (timestampQuizzes.length > 0) {
      instruction += `

MINI QUIZZES (Perguntas interativas):
- Durante a aula, em momentos específicos, um quiz aparecerá na tela
- Quando receber "🎯 MINI QUIZ!", você deve:
  1. Ler a pergunta de forma clara e pausada
  2. Ler cada opção (A, B, C, D) uma por uma
  3. Dizer algo como "Pense um pouco! Você tem alguns segundos..."
  4. O sistema vai revelar a resposta automaticamente
- Depois que o sistema informar o resultado ([SISTEMA]):
  - Se acertou: Celebre! "Muito bem! Resposta correta!"
  - Se errou: Seja encorajador e explique brevemente
  - Continue a aula naturalmente`;
    }

    return instruction;
  }, [videoContext, videoTitle, videoTranscript, contentPlan, memoryContext, timestampQuizzes.length]);

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

  // Handle agent connection events - process pending actions
  useEffect(() => {
    let introTimeout: ReturnType<typeof setTimeout> | null = null;
    
    if (status === 'connected') {
      // Start microphone when connected
      if (!isListening) {
        startListening();
      }
      
      // Process any pending reconnect actions
      if (pendingReconnect) {
        const { type, data } = pendingReconnect;
        setPendingReconnect(null);
        
        if (type === 'moment') {
          setActiveMoment(data);
          const instruction = generateTeacherInstructions(data);
          setTimeout(() => sendText(instruction), 500);
          toast.info(`🎯 Momento de aprofundamento: ${data.topic}`, { duration: 5000 });
        } else if (type === 'quiz') {
          setActiveQuiz(data);
          const quizInstruction = `🎯 MINI QUIZ! Hora de testar o conhecimento do aluno!
          
Pergunta: "${data.question}"

Opções:
${data.options.map((opt: string, i: number) => `${String.fromCharCode(65 + i)}) ${opt}`).join('\n')}

INSTRUÇÕES:
1. Leia a pergunta de forma clara e pausada
2. Leia cada opção (A, B, C, D)
3. Diga "Você tem alguns segundos para pensar!"
4. Aguarde - o sistema vai revelar a resposta automaticamente na tela`;
          setTimeout(() => sendText(quizInstruction), 500);
          toast.info('📝 Mini Quiz!', { duration: 3000 });
        }
      }
      
      // Handle intro mode - agent starts class
      if (agentMode === 'intro' && !introCompletedRef.current) {
        introCompletedRef.current = true;
        
        // Use custom teacher intro if provided, otherwise use default
        const customIntro = teacherIntro?.trim();
        
        const introInstruction = customIntro
          ? `[SISTEMA] Você acabou de se conectar com o aluno para começar uma nova aula.

INTRODUÇÃO PERSONALIZADA (USE EXATAMENTE ESTE TEXTO COMO BASE):
"${customIntro}"

INSTRUÇÕES:
1. Use a introdução personalizada acima como guia para seu tom e estilo
2. Adapte naturalmente, mas mantenha a essência do texto
3. Após a introdução, pergunte se o aluno está pronto para começar
4. Seja breve - máximo 30 segundos`
          : `[SISTEMA] Você acabou de se conectar com o aluno para começar uma nova aula.

INSTRUÇÕES DE INTRODUÇÃO:
1. Cumprimente o aluno de forma calorosa e profissional
2. Apresente brevemente o tema da aula: "${videoTitle || 'Vibe Coding'}"
3. Diga que o vídeo vai começar em alguns segundos
4. Explique que você vai pausar em momentos importantes para aprofundar o aprendizado
5. Pergunte se o aluno está pronto para começar

Seja breve e objetivo - máximo 30 segundos de introdução.`;
        
        setTimeout(() => {
          if (statusRef.current === 'connected' && sendTextRef.current) {
            sendTextRef.current(introInstruction);
          }
        }, 1000);
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
            const quizInstruction = `🎯 MINI QUIZ! Hora de testar o conhecimento do aluno!
            
Pergunta: "${quiz.question}"

Opções:
${quiz.options.map((opt, i) => `${String.fromCharCode(65 + i)}) ${opt}`).join('\n')}

INSTRUÇÕES:
1. Leia a pergunta de forma clara e pausada
2. Leia cada opção (A, B, C, D)
3. Diga "Você tem alguns segundos para pensar!"
4. Aguarde - o sistema vai revelar a resposta automaticamente na tela`;
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

  const getStatusColor = () => {
    if (agentMode === 'playing' && status === 'disconnected') return 'bg-google-blue';
    switch (status) {
      case 'connected': return 'bg-google-green';
      case 'connecting': return 'bg-google-yellow';
      case 'error': return 'bg-google-red';
      default: return 'bg-muted';
    }
  };

  const getStatusText = () => {
    if (agentMode === 'playing' && status === 'disconnected') return '▶️ Assistindo';
    if (agentMode === 'intro') return '👋 Introdução';
    if (agentMode === 'teaching') return '🎓 Ensinando';
    switch (status) {
      case 'connected': return 'Professor ativo';
      case 'connecting': return 'Conectando...';
      case 'error': return 'Erro de conexão';
      default: return 'Aguardando';
    }
  };

  return (
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
              <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
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
              <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
              Professor IA
            </CardTitle>
            <div className="flex items-center gap-2">
              {/* Debug badge */}
              
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
      )}
      
      <CardContent className={`flex-1 flex flex-col gap-3 sm:gap-4 overflow-hidden px-3 sm:px-6 pb-3 sm:pb-6 ${
        isVideoExpanded ? 'pt-0' : ''
      }`}>
        {/* Video Player with Quiz Overlay */}
        {videoId && (
          <div className={`relative transition-all duration-500 ${
            isVideoExpanded 
              ? 'flex-1 min-h-0' 
              : 'flex-shrink-0'
          }`}>
            <div className={isVideoExpanded ? 'h-full' : ''}>
              <VideoPlayer 
                ref={videoPlayerRef} 
                videoId={videoId} 
                title={videoTitle}
                expanded={isVideoExpanded}
              />
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
            {showDebug && studentProfile.emotional_patterns?.length > 0 && (
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
            {status === 'disconnected' && agentMode !== 'playing' ? (
              <Button onClick={handleStartClass} className="flex-1 h-10 sm:h-11 text-sm sm:text-base">
                <Phone className="h-4 w-4 mr-2" />
                Iniciar Aula
              </Button>
            ) : status === 'connecting' ? (
              <Button disabled className="flex-1 h-10 sm:h-11 text-sm sm:text-base">
                Conectando...
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
                      <span className="text-sm text-muted-foreground">Momento de aprendizado</span>
                    </>
                  )}
                </div>
                <Button onClick={disconnect} variant="destructive" className="h-10 sm:h-11 px-4">
                  <PhoneOff className="h-4 w-4 mr-2" />
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
  );
}
