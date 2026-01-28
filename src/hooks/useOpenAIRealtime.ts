import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface VideoControls {
  play: () => void;
  pause: () => void;
  restart: () => void;
  seekTo: (seconds: number) => void;
  getCurrentTime: () => number;
  isPaused: () => boolean;
}

export type ConnectionStep = 'idle' | 'fetching_key' | 'connecting_ws' | 'configuring' | 'ready';

interface UseOpenAIRealtimeOptions {
  systemInstruction?: string;
  onTranscript?: (text: string, role: 'user' | 'assistant') => void;
  onError?: (error: string) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
  onConnectionStepChange?: (step: ConnectionStep) => void;
  videoControls?: VideoControls | null;
  // Memory callbacks
  onSaveStudentName?: (name: string) => void;
  onSaveEmotionalObservation?: (emotion: string, context: string) => void;
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// Silence timeout configuration (ms)
const SILENCE_TIMEOUT_MS = 3000;

// Proactive prompts to encourage student engagement
const PROACTIVE_PROMPTS = [
  "Ei, está tudo bem aí? Quer que eu explique de outro jeito?",
  "E aí, ficou alguma dúvida? Pode perguntar!",
  "Está acompanhando? Posso repetir se quiser.",
  "Opa, está me ouvindo? Quer continuar?",
  "Alguma pergunta até aqui? Estou aqui pra ajudar!",
  "Tá difícil? Posso explicar de forma mais simples se preferir.",
];

export function useOpenAIRealtime(options: UseOpenAIRealtimeOptions = {}) {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const compressorNodeRef = useRef<DynamicsCompressorNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);
  const videoControlsRef = useRef<VideoControls | null>(null);
  const processedCallIdsRef = useRef<Set<string>>(new Set());
  
  // Silence detection refs
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastAgentSpeechEndRef = useRef<number | null>(null);
  const proactivePromptIndexRef = useRef(0);
  
  // Store callbacks in refs to avoid dependency issues
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  // Keep videoControls ref updated
  useEffect(() => {
    videoControlsRef.current = options.videoControls || null;
  }, [options.videoControls]);

  const updateStatus = useCallback((newStatus: ConnectionStatus) => {
    setStatus(newStatus);
    optionsRef.current.onStatusChange?.(newStatus);
  }, []);

  // Clear silence timeout
  const clearSilenceTimeout = useCallback(() => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
      console.log('[SILENCE] Timer cancelado');
    }
  }, []);

  // Send proactive message to encourage student
  const sendProactivePrompt = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.log('[SILENCE] WebSocket não conectado, ignorando prompt proativo');
      return;
    }
    
    // Don't interrupt if agent is speaking
    if (isPlayingRef.current || audioQueueRef.current.length > 0) {
      console.log('[SILENCE] Agente ainda falando, adiando prompt proativo');
      // Retry in 1 second
      silenceTimeoutRef.current = setTimeout(sendProactivePrompt, 1000);
      return;
    }

    const prompt = PROACTIVE_PROMPTS[proactivePromptIndexRef.current % PROACTIVE_PROMPTS.length];
    proactivePromptIndexRef.current++;
    
    console.log('[SILENCE] ⏰ 3 segundos sem resposta - Professor tomando iniciativa!');
    console.log('[SILENCE] Enviando prompt proativo:', prompt);
    
    // Send a system-like message to prompt the agent to speak
    wsRef.current.send(JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{
          type: "input_text",
          text: `[SISTEMA: O aluno está em silêncio há alguns segundos. Tome a iniciativa e incentive-o a participar. Use uma abordagem amigável como: "${prompt}"]`
        }]
      }
    }));
    
    // Request a response
    wsRef.current.send(JSON.stringify({
      type: "response.create"
    }));
  }, []);

  // Start silence timeout after agent finishes speaking (only if video is paused)
  const startSilenceTimeout = useCallback(() => {
    // Only start silence timer if video is paused - student won't talk while watching
    if (videoControlsRef.current && !videoControlsRef.current.isPaused()) {
      console.log('[SILENCE] Video está rodando, não inicia timer de silêncio');
      return;
    }
    
    clearSilenceTimeout();
    
    console.log('[SILENCE] Video pausado - Iniciando timer de', SILENCE_TIMEOUT_MS / 1000, 'segundos');
    lastAgentSpeechEndRef.current = Date.now();
    
    silenceTimeoutRef.current = setTimeout(() => {
      // Double-check video is still paused before prompting
      if (videoControlsRef.current && !videoControlsRef.current.isPaused()) {
        console.log('[SILENCE] Timer expirou mas video voltou a rodar, ignorando');
        return;
      }
      console.log('[SILENCE] ⏰ Timer expirou! Aluno não respondeu em', SILENCE_TIMEOUT_MS / 1000, 'segundos');
      sendProactivePrompt();
    }, SILENCE_TIMEOUT_MS);
  }, [clearSilenceTimeout, sendProactivePrompt]);

  const playQueue = useCallback(async (ctx: AudioContext) => {
    // Audio chain: source -> gain -> compressor -> destination
    // Reduced gain to prevent crackling/distortion
    if (!compressorNodeRef.current) {
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -12; // Higher threshold (less aggressive)
      compressor.knee.value = 20;
      compressor.ratio.value = 4; // Lower ratio for more natural sound
      compressor.attack.value = 0.01; // Slower attack to avoid pumping
      compressor.release.value = 0.15;
      compressor.connect(ctx.destination);
      compressorNodeRef.current = compressor;
    }

    if (!gainNodeRef.current) {
      const gain = ctx.createGain();
      gain.gain.value = 2.0; // Reduced from 8.0 to prevent distortion
      gain.connect(compressorNodeRef.current);
      gainNodeRef.current = gain;
    }
    
    // Collect all queued samples into one buffer for smoother playback
    const allSamples: Float32Array[] = [];
    while (audioQueueRef.current.length > 0) {
      allSamples.push(audioQueueRef.current.shift()!);
    }
    
    if (allSamples.length === 0) {
      isPlayingRef.current = false;
      setIsSpeaking(false);
      return;
    }
    
    // Merge all samples into one continuous buffer
    const totalLength = allSamples.reduce((acc, arr) => acc + arr.length, 0);
    const mergedSamples = new Float32Array(totalLength);
    let offset = 0;
    for (const samples of allSamples) {
      mergedSamples.set(samples, offset);
      offset += samples.length;
    }
    
    const buffer = ctx.createBuffer(1, mergedSamples.length, 24000);
    const channelData = buffer.getChannelData(0);
    channelData.set(mergedSamples);
    
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gainNodeRef.current!);
    source.start();
    
    await new Promise(resolve => {
      source.onended = resolve;
    });
    
    // Check if more audio arrived while playing
    if (audioQueueRef.current.length > 0) {
      playQueue(ctx);
    } else {
      isPlayingRef.current = false;
      setIsSpeaking(false);
    }
  }, []);

  const playAudioChunk = useCallback(async (base64Audio: string) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });
    }
    
    const ctx = audioContextRef.current;
    
    // Decode base64 to PCM
    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Convert to Int16 array
    const int16Array = new Int16Array(bytes.buffer);
    
    // Convert to Float32
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768;
    }
    
    audioQueueRef.current.push(float32Array);
    
    if (!isPlayingRef.current) {
      isPlayingRef.current = true;
      setIsSpeaking(true);
      playQueue(ctx);
    }
  }, [playQueue]);

  const stopListening = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    
    setIsListening(false);
  }, []);

  const connect = useCallback(async () => {
    console.log('🔌 [OPENAI CONNECT] Iniciando conexão...');
    console.log('🔌 [OPENAI CONNECT] Status atual antes de conectar:', status);
    
    try {
      updateStatus('connecting');
      optionsRef.current.onConnectionStepChange?.('fetching_key');
      console.log('🔌 [OPENAI CONNECT] Status atualizado para: connecting');
      
      const currentOptions = optionsRef.current;
      
      // Get API key from edge function
      console.log('🔌 [OPENAI CONNECT] Buscando API key...');
      const { data, error } = await supabase.functions.invoke('openai-realtime-token', {
        body: { systemInstruction: currentOptions.systemInstruction }
      });
      
      if (error || !data?.apiKey) {
        console.error('🔌 [OPENAI CONNECT] ❌ Erro ao buscar API key:', error);
        optionsRef.current.onConnectionStepChange?.('idle');
        throw new Error(error?.message || 'Failed to get API key');
      }
      
      console.log('🔌 [OPENAI CONNECT] ✅ API key obtida, conectando WebSocket...');
      optionsRef.current.onConnectionStepChange?.('connecting_ws');
      
      // Connect to OpenAI Realtime API
      const wsUrl = `wss://api.openai.com/v1/realtime?model=${data.model}`;
      console.log('🔌 [OPENAI CONNECT] URL:', wsUrl);
      
      const ws = new WebSocket(wsUrl, [
        "realtime",
        `openai-insecure-api-key.${data.apiKey}`,
        "openai-beta.realtime-v1"
      ]);
      wsRef.current = ws;
      console.log('🔌 [OPENAI CONNECT] WebSocket criado');
      
      ws.onopen = () => {
        console.log('WebSocket connected to OpenAI');
        processedCallIdsRef.current.clear();
        optionsRef.current.onConnectionStepChange?.('configuring');
        
        // Define tools for video control and memory - use detailed descriptions for better understanding
        const tools = [
          {
            type: "function",
            name: "play_video",
            description: "OBRIGATORIO: Chame esta funcao para iniciar ou retomar o video. Gatilhos: 'play', 'da play', 'inicia', 'comeca', 'continua', 'roda', 'reproduz', 'volta a tocar', 'pode continuar'. Sempre que o aluno quiser que o video volte a rodar, use esta funcao.",
            parameters: { type: "object", properties: {}, required: [] }
          },
          {
            type: "function",
            name: "pause_video",
            description: "OBRIGATORIO: Chame esta funcao para pausar o video. Gatilhos: 'pausa', 'para', 'pause', 'espera', 'segura', 'para ai', 'um momento', 'calma', 'interrompe'. Sempre que o aluno quiser parar o video temporariamente, use esta funcao.",
            parameters: { type: "object", properties: {}, required: [] }
          },
          {
            type: "function",
            name: "restart_video",
            description: "OBRIGATORIO: Chame esta funcao para reiniciar o video do inicio. Gatilhos: 'reinicia', 'recomeca', 'volta pro inicio', 'do zero', 'desde o comeco', 'de novo', 'novamente'. Sempre que o aluno quiser ver o video desde o principio, use esta funcao.",
            parameters: { type: "object", properties: {}, required: [] }
          },
          {
            type: "function",
            name: "seek_video",
            description: "Pula para um momento especifico do video em segundos. Use quando o aluno mencionar um tempo especifico como 'vai para 30 segundos' ou 'pula pro minuto 2'.",
            parameters: {
              type: "object",
              properties: {
                seconds: { type: "number", description: "O tempo em segundos para pular" }
              },
              required: ["seconds"]
            }
          },
          {
            type: "function",
            name: "seek_backward",
            description: "OBRIGATORIO: Volta o video alguns segundos. Gatilhos: 'volta', 'volte', 'retrocede', 'volta X segundos', 'volta um pouco', 'repete essa parte', 'nao entendi volta'. Quando o aluno pedir para voltar sem especificar quanto, use 10 segundos como padrao.",
            parameters: {
              type: "object",
              properties: {
                seconds: { type: "number", description: "Quantos segundos voltar. Padrao: 10 segundos" }
              },
              required: []
            }
          },
          {
            type: "function",
            name: "seek_forward",
            description: "OBRIGATORIO: Avanca o video alguns segundos. Gatilhos: 'avanca', 'adianta', 'pula', 'pula X segundos', 'avanca um pouco', 'vai pra frente', 'skip'. Quando o aluno pedir para avancar sem especificar quanto, use 10 segundos como padrao.",
            parameters: {
              type: "object",
              properties: {
                seconds: { type: "number", description: "Quantos segundos avancar. Padrao: 10 segundos" }
              },
              required: []
            }
          },
          // Memory tools
          {
            type: "function",
            name: "save_student_name",
            description: "MUITO IMPORTANTE: Salva o nome do aluno na memoria de longo prazo. SEMPRE chame esta funcao quando o aluno disser o nome dele. Exemplo: se o aluno disser 'Meu nome é João' ou 'Pode me chamar de Maria', extraia o nome e salve.",
            parameters: {
              type: "object",
              properties: {
                name: { type: "string", description: "O nome do aluno extraido da conversa" }
              },
              required: ["name"]
            }
          },
          {
            type: "function",
            name: "save_emotional_observation",
            description: "Registra uma observacao sobre o estado emocional do aluno. Use quando perceber estados emocionais marcantes como: empolgado, confuso, frustrado, cansado, entediado, curioso, feliz, ansioso. Isso ajuda a personalizar futuras interacoes.",
            parameters: {
              type: "object",
              properties: {
                emotion: { 
                  type: "string", 
                  description: "O estado emocional detectado: empolgado, confuso, frustrado, cansado, entediado, curioso, feliz, ansioso, neutro" 
                },
                context: { 
                  type: "string", 
                  description: "Contexto breve de quando/porque o estado foi detectado. Ex: 'Ficou empolgado ao entender o conceito de variaveis'" 
                }
              },
              required: ["emotion", "context"]
            }
          }
        ];
        
        // Send session update with configuration and tools
        // Using "echo" voice - young masculine voice, energetic and friendly
        // Other options: "coral" (warm female), "nova" (warm female), "alloy" (neutral), "onyx" (deep male)
        ws.send(JSON.stringify({
          type: "session.update",
          session: {
            modalities: ["text", "audio"],
            instructions: currentOptions.systemInstruction || "Você é um professor jovem, descontraído e didático. Fale de forma natural como um amigo mais experiente que quer ajudar. Use gírias leves e seja animado. Fale em português brasileiro.",
            voice: "echo",
            input_audio_format: "pcm16",
            output_audio_format: "pcm16",
            input_audio_transcription: {
              model: "whisper-1"
            },
            turn_detection: {
              type: "server_vad",
              threshold: 0.7,
              prefix_padding_ms: 400,
              silence_duration_ms: 800
            },
            tools: tools,
            tool_choice: "auto"
          }
        }));
        
        updateStatus('connected');
        optionsRef.current.onConnectionStepChange?.('ready');
      };
      
      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);

          // Lightweight debug to confirm which event types we are receiving
          if (typeof data?.type === 'string') {
            console.log('[realtime:event]', data.type);
          }

          // Handle audio response
          if (data.type === "response.audio.delta" && data.delta) {
            await playAudioChunk(data.delta);
          }

          // Handle text transcript from assistant
          if (data.type === "response.audio_transcript.done" && data.transcript) {
            optionsRef.current.onTranscript?.(data.transcript, 'assistant');
          }

          // Handle user transcript
          if (data.type === "conversation.item.input_audio_transcription.completed" && data.transcript) {
            console.log('[SILENCE] Aluno falou! Cancelando timer de silêncio');
            clearSilenceTimeout();
            optionsRef.current.onTranscript?.(data.transcript, 'user');
          }
          
          // Also cancel silence timeout when user starts speaking (speech detected)
          if (data.type === "input_audio_buffer.speech_started") {
            console.log('[SILENCE] Aluno começou a falar! Cancelando timer de silêncio');
            clearSilenceTimeout();
          }

          // Helper to wait for agent to finish speaking before playing video
          const waitForSpeechToEnd = (): Promise<void> => {
            return new Promise((resolve) => {
              const checkSpeech = () => {
                const queueLength = audioQueueRef.current.length;
                const isPlaying = isPlayingRef.current;
                console.log('[OPENAI] Aguardando fala terminar - queue:', queueLength, 'isPlaying:', isPlaying);
                
                if (queueLength === 0 && !isPlaying) {
                  console.log('[OPENAI] Fala terminou, aguardando 5 segundos...');
                  // 5 second buffer after speech ends
                  setTimeout(resolve, 5000);
                } else {
                  setTimeout(checkSpeech, 100);
                }
              };
              checkSpeech();
            });
          };

          const runFunctionCall = async (name: string, callId: string, argsJson?: string) => {
            // Detailed debug logging
            console.log('='.repeat(60));
            console.log('[OPENAI TOOL CALL] Recebido');
            console.log('[OPENAI TOOL CALL] Funcao:', name);
            console.log('[OPENAI TOOL CALL] Call ID:', callId);
            console.log('[OPENAI TOOL CALL] Args JSON:', argsJson);
            console.log('[OPENAI TOOL CALL] Audio Queue:', audioQueueRef.current.length, 'isPlaying:', isPlayingRef.current);
            
            if (!callId) {
              console.error('[OPENAI TOOL CALL] ERRO: callId esta vazio/undefined');
              console.log('='.repeat(60));
              return;
            }
            
            if (processedCallIdsRef.current.has(callId)) {
              console.log('[OPENAI TOOL CALL] IGNORADO - Call ID ja processado:', callId);
              console.log('='.repeat(60));
              return;
            }
            processedCallIdsRef.current.add(callId);
            console.log('[OPENAI TOOL CALL] Call ID adicionado ao set de processados');

            let args: any = {};
            try {
              args = argsJson ? JSON.parse(argsJson) : {};
              console.log('[OPENAI TOOL CALL] Args parseados:', JSON.stringify(args, null, 2));
            } catch (e) {
              console.warn('[OPENAI TOOL CALL] Erro ao parsear args, usando {}:', e);
              args = {};
            }

            console.log('[OPENAI TOOL CALL] Video Controls:', videoControlsRef.current ? 'DISPONIVEL' : 'INDISPONIVEL');
            
            if (videoControlsRef.current) {
              console.log('[OPENAI TOOL CALL] Video Status - isPaused:', videoControlsRef.current.isPaused());
              console.log('[OPENAI TOOL CALL] Video Status - currentTime:', videoControlsRef.current.getCurrentTime());
            }

            let result: any = { ok: true };

            if (videoControlsRef.current) {
              const beforePaused = videoControlsRef.current.isPaused();
              const beforeTime = videoControlsRef.current.getCurrentTime();
              
              switch (name) {
                case "play_video":
                  console.log('[OPENAI TOOL CALL] EXECUTANDO: play_video');
                  console.log('[OPENAI TOOL CALL] Estado antes: isPaused =', beforePaused);
                  console.log('[OPENAI TOOL CALL] Aguardando agente terminar de falar antes de dar play...');
                  toast.info('Aguardando professor terminar de falar...', { duration: 2000 });
                  await waitForSpeechToEnd();
                  console.log('[OPENAI TOOL CALL] Agente terminou de falar, dando play agora!');
                  toast.success('Dando play no video...', { duration: 2000 });
                  videoControlsRef.current.play();
                  setTimeout(() => {
                    console.log('[OPENAI TOOL CALL] Estado depois: isPaused =', videoControlsRef.current?.isPaused());
                  }, 100);
                  result = { ok: true, message: "Video iniciado" };
                  break;
                case "pause_video":
                  console.log('[OPENAI TOOL CALL] EXECUTANDO: pause_video');
                  console.log('[OPENAI TOOL CALL] Estado antes: isPaused =', beforePaused);
                  toast.success('Pausando video...', { duration: 2000 });
                  videoControlsRef.current.pause();
                  setTimeout(() => {
                    console.log('[OPENAI TOOL CALL] Estado depois: isPaused =', videoControlsRef.current?.isPaused());
                  }, 100);
                  result = { ok: true, message: "Video pausado" };
                  break;
                case "restart_video":
                  console.log('[OPENAI TOOL CALL] EXECUTANDO: restart_video');
                  console.log('[OPENAI TOOL CALL] Tempo antes:', beforeTime);
                  console.log('[OPENAI TOOL CALL] Aguardando agente terminar de falar antes de reiniciar...');
                  toast.info('Aguardando professor terminar de falar...', { duration: 2000 });
                  await waitForSpeechToEnd();
                  console.log('[OPENAI TOOL CALL] Agente terminou de falar, reiniciando agora!');
                  toast.success('Reiniciando video...', { duration: 2000 });
                  videoControlsRef.current.restart();
                  setTimeout(() => {
                    console.log('[OPENAI TOOL CALL] Tempo depois:', videoControlsRef.current?.getCurrentTime());
                  }, 100);
                  result = { ok: true, message: "Video reiniciado" };
                  break;
                case "seek_video":
                  const targetSeconds = Number(args.seconds) || 0;
                  console.log('[OPENAI TOOL CALL] EXECUTANDO: seek_video');
                  console.log('[OPENAI TOOL CALL] Tempo antes:', beforeTime, '-> Destino:', targetSeconds);
                  toast.success(`Pulando para ${targetSeconds}s...`, { duration: 2000 });
                  videoControlsRef.current.seekTo(targetSeconds);
                  setTimeout(() => {
                    console.log('[OPENAI TOOL CALL] Tempo depois:', videoControlsRef.current?.getCurrentTime());
                  }, 100);
                  result = { ok: true, message: `Video pulou para ${targetSeconds} segundos` };
                  break;
                case "seek_backward":
                  const backwardSeconds = Number(args.seconds) || 10;
                  const newTimeBack = Math.max(0, beforeTime - backwardSeconds);
                  console.log('[OPENAI TOOL CALL] EXECUTANDO: seek_backward');
                  console.log('[OPENAI TOOL CALL] Tempo antes:', beforeTime, '-> Voltando:', backwardSeconds, 's -> Novo tempo:', newTimeBack);
                  toast.success(`Voltando ${backwardSeconds} segundos...`, { duration: 2000 });
                  videoControlsRef.current.seekTo(newTimeBack);
                  setTimeout(() => {
                    console.log('[OPENAI TOOL CALL] Tempo depois:', videoControlsRef.current?.getCurrentTime());
                  }, 100);
                  result = { ok: true, message: `Video voltou ${backwardSeconds} segundos para ${newTimeBack}s` };
                  break;
                case "seek_forward":
                  const forwardSeconds = Number(args.seconds) || 10;
                  const newTimeForward = beforeTime + forwardSeconds;
                  console.log('[OPENAI TOOL CALL] EXECUTANDO: seek_forward');
                  console.log('[OPENAI TOOL CALL] Tempo antes:', beforeTime, '-> Avancando:', forwardSeconds, 's -> Novo tempo:', newTimeForward);
                  toast.success(`Avançando ${forwardSeconds} segundos...`, { duration: 2000 });
                  videoControlsRef.current.seekTo(newTimeForward);
                  setTimeout(() => {
                    console.log('[OPENAI TOOL CALL] Tempo depois:', videoControlsRef.current?.getCurrentTime());
                  }, 100);
                  result = { ok: true, message: `Video avancou ${forwardSeconds} segundos para ${newTimeForward}s` };
                  break;
                default:
                  console.warn('[OPENAI TOOL CALL] ERRO: Funcao desconhecida:', name);
                  result = { ok: false, message: `Funcao desconhecida: ${name}` };
              }
            } 
            // Handle memory functions (don't require video controls)
            else if (name === "save_student_name") {
              const studentName = args.name as string;
              console.log('[OPENAI TOOL CALL] EXECUTANDO: save_student_name');
              console.log('[OPENAI TOOL CALL] Nome do aluno:', studentName);
              if (studentName && optionsRef.current.onSaveStudentName) {
                optionsRef.current.onSaveStudentName(studentName);
                toast.success(`Nome salvo: ${studentName}`, { duration: 2000 });
                result = { ok: true, message: `Nome "${studentName}" salvo na memoria` };
              } else {
                result = { ok: false, message: "Nao foi possivel salvar o nome" };
              }
            } 
            else if (name === "save_emotional_observation") {
              const emotion = args.emotion as string;
              const context = args.context as string;
              console.log('[OPENAI TOOL CALL] EXECUTANDO: save_emotional_observation');
              console.log('[OPENAI TOOL CALL] Emocao:', emotion, 'Contexto:', context);
              if (emotion && context && optionsRef.current.onSaveEmotionalObservation) {
                optionsRef.current.onSaveEmotionalObservation(emotion, context);
                result = { ok: true, message: `Observacao emocional registrada: ${emotion}` };
              } else {
                result = { ok: false, message: "Nao foi possivel registrar a observacao" };
              }
            }
            else {
              console.error('[OPENAI TOOL CALL] ERRO: videoControlsRef.current e NULL para funcao de video');
              console.error('[OPENAI TOOL CALL] Nao foi possivel executar:', name);
              toast.error('Nenhum video carregado');
              result = { ok: false, message: "Nenhum video carregado" };
            }

            console.log('[OPENAI TOOL CALL] Resultado:', JSON.stringify(result));

            // Provide function call output back to the model
            const outputMessage = {
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: callId,
                output: JSON.stringify(result),
              },
            };
            console.log('[OPENAI TOOL CALL] Enviando output:', JSON.stringify(outputMessage, null, 2));
            ws.send(JSON.stringify(outputMessage));

            // Request a response after function call
            console.log('[OPENAI TOOL CALL] Solicitando response.create');
            ws.send(JSON.stringify({ type: "response.create" }));
            console.log('[OPENAI TOOL CALL] Resposta enviada com sucesso');
            console.log('='.repeat(60));
          };

          const tryHandleFunctionCallItem = async (item: any, source: string) => {
            if (!item) return;
            console.log(`[OPENAI EVENT] tryHandleFunctionCallItem de ${source}:`, item?.type);
            
            // Shapes we may see:
            // - { type:'function_call', name, call_id, arguments }
            // - { type:'function_call', function:{ name, arguments }, call_id }
            if (item.type !== 'function_call') {
              console.log(`[OPENAI EVENT] Item ignorado - tipo ${item.type} != 'function_call'`);
              return;
            }

            const name = item.name ?? item.function?.name;
            const callId = item.call_id ?? item.callId;
            const args = item.arguments ?? item.function?.arguments;

            console.log(`[OPENAI EVENT] Extraido de ${source}: name=${name}, callId=${callId}, args=${args}`);

            if (typeof name === 'string' && typeof callId === 'string') {
              console.log(`[OPENAI EVENT] Chamando runFunctionCall de ${source}`);
              await runFunctionCall(name, callId, args);
            } else {
              console.warn(`[OPENAI EVENT] Dados invalidos de ${source}: name=${typeof name}, callId=${typeof callId}`);
            }
          };

          // Function calls (standalone event)
          if (data.type === "response.function_call_arguments.done") {
            console.log('[OPENAI EVENT] response.function_call_arguments.done detectado!');
            console.log('[OPENAI EVENT] name:', data.name, 'call_id:', data.call_id);
            await runFunctionCall(data.name, data.call_id, data.arguments);
          }

          // Function calls delivered as output_item events (some SDK variants)
          if (data.type === "response.output_item.added" || data.type === "response.output_item.done") {
            console.log('[OPENAI EVENT]', data.type, 'detectado!');
            await tryHandleFunctionCallItem(data.item, `${data.type}.item`);
            await tryHandleFunctionCallItem(data.output_item, `${data.type}.output_item`);
          }

          // Function calls delivered as conversation item events (another common variant)
          if (data.type === "conversation.item.created" || data.type === "conversation.item.updated") {
            console.log('[OPENAI EVENT]', data.type, 'detectado!');
            await tryHandleFunctionCallItem(data.item, data.type);
          }

          // Canonical: embedded in response.done
          if (data.type === "response.done") {
            console.log('[OPENAI EVENT] response.done detectado!');
            const outputs = data.response?.output;
            if (Array.isArray(outputs)) {
              console.log('[OPENAI EVENT] Processando', outputs.length, 'outputs');
              for (const item of outputs) {
                await tryHandleFunctionCallItem(item, 'response.done');
              }
            }

            // Don't clear audio here; let playback finish naturally to avoid cutting the last word
            console.log('[OPENAI EVENT] Response done, audio queue length:', audioQueueRef.current.length);
            
            // Start silence timeout when agent finishes speaking
            // Wait for audio to finish before starting the timer
            const checkAndStartSilenceTimer = () => {
              if (audioQueueRef.current.length === 0 && !isPlayingRef.current) {
                console.log('[SILENCE] Agente terminou de falar, iniciando timer de silêncio');
                startSilenceTimeout();
              } else {
                setTimeout(checkAndStartSilenceTimer, 200);
              }
            };
            setTimeout(checkAndStartSilenceTimer, 500);
          }

          // Handle errors
          if (data.type === "error") {
            console.error('🚨 [OPENAI ERROR] Erro recebido do OpenAI:', data.error);
            console.error('🚨 [OPENAI ERROR] Código:', data.error?.code);
            console.error('🚨 [OPENAI ERROR] Mensagem:', data.error?.message);
            console.error('🚨 [OPENAI ERROR] Detalhes:', JSON.stringify(data.error, null, 2));
            optionsRef.current.onError?.(data.error?.message || 'Unknown error');
          }
          
          // Handle session created/updated
          if (data.type === "session.created" || data.type === "session.updated") {
            console.log('🔌 [OPENAI SESSION]', data.type);
          }
        } catch (e) {
          console.error('🚨 [OPENAI ERROR] Erro ao processar mensagem:', e);
        }
      };

      
      ws.onerror = (error) => {
        console.error('🚨 [WEBSOCKET ERROR] Erro no WebSocket:', error);
        console.error('🚨 [WEBSOCKET ERROR] Detalhes:', JSON.stringify(error, null, 2));
        updateStatus('error');
        optionsRef.current.onError?.('Connection error');
      };
      
      ws.onclose = (event) => {
        console.log('🔌 [WEBSOCKET CLOSE] WebSocket fechado');
        console.log('🔌 [WEBSOCKET CLOSE] Código:', event.code);
        console.log('🔌 [WEBSOCKET CLOSE] Motivo:', event.reason || '(sem motivo)');
        console.log('🔌 [WEBSOCKET CLOSE] wasClean:', event.wasClean);
        
        // Códigos comuns:
        // 1000 = fechamento normal
        // 1001 = going away (navegador fechando)
        // 1006 = abnormal closure (sem close frame)
        // 1011 = unexpected condition
        // 4000+ = application-specific
        if (event.code !== 1000) {
          console.warn('🚨 [WEBSOCKET CLOSE] Fechamento anormal! Código:', event.code);
        }
        
        updateStatus('disconnected');
        stopListening();
      };
      
    } catch (error) {
      console.error('🚨 [OPENAI CONNECT] Erro na conexão:', error);
      updateStatus('error');
      optionsRef.current.onError?.(error instanceof Error ? error.message : 'Connection failed');
    }
  }, [updateStatus, playAudioChunk, stopListening, startSilenceTimeout, clearSilenceTimeout]);

  const disconnect = useCallback(() => {
    console.log('🔌 [OPENAI DISCONNECT] Desconectando manualmente...');
    console.log('🔌 [OPENAI DISCONNECT] Stack trace:', new Error().stack);
    
    // Clear silence timeout
    clearSilenceTimeout();
    
    stopListening();
    
    if (wsRef.current) {
      console.log('🔌 [OPENAI DISCONNECT] Fechando WebSocket (readyState:', wsRef.current.readyState, ')');
      wsRef.current.close(1000, 'User disconnect');
      wsRef.current = null;
    } else {
      console.log('🔌 [OPENAI DISCONNECT] WebSocket já era null');
    }
    
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    setIsSpeaking(false);
    updateStatus('disconnected');
    console.log('🔌 [OPENAI DISCONNECT] Desconexão completa');
  }, [updateStatus, stopListening, clearSilenceTimeout]);

  const startListening = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      optionsRef.current.onError?.('Not connected');
      return;
    }
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        } 
      });
      
      mediaStreamRef.current = stream;
      
      const audioContext = new AudioContext({ sampleRate: 24000 });
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      
      processorRef.current = processor;
      
      processor.onaudioprocess = (e) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          const inputData = e.inputBuffer.getChannelData(0);
          
          // Convert Float32 to Int16
          const int16Array = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            int16Array[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
          }
          
          // Convert to base64
          const uint8Array = new Uint8Array(int16Array.buffer);
          let binary = '';
          for (let i = 0; i < uint8Array.length; i++) {
            binary += String.fromCharCode(uint8Array[i]);
          }
          const base64Audio = btoa(binary);
          
          // Send audio to OpenAI
          wsRef.current.send(JSON.stringify({
            type: "input_audio_buffer.append",
            audio: base64Audio
          }));
        }
      };
      
      source.connect(processor);
      processor.connect(audioContext.destination);
      
      setIsListening(true);
      
    } catch (error) {
      console.error('Microphone error:', error);
      optionsRef.current.onError?.('Could not access microphone');
    }
  }, []);

  const sendText = useCallback((text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      optionsRef.current.onError?.('Not connected');
      return;
    }
    
    // Create a conversation item with user message
    wsRef.current.send(JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{
          type: "input_text",
          text: text
        }]
      }
    }));
    
    // Request a response
    wsRef.current.send(JSON.stringify({
      type: "response.create"
    }));
    
    optionsRef.current.onTranscript?.(text, 'user');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  return {
    status,
    isListening,
    isSpeaking,
    isVoiceDetected: isListening,
    connect,
    disconnect,
    startListening,
    stopListening,
    sendText,
  };
}
