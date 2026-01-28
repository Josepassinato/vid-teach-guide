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

interface UseGeminiLiveOptions {
  systemInstruction?: string;
  onTranscript?: (text: string, role: 'user' | 'assistant') => void;
  onError?: (error: string) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
  videoControls?: VideoControls | null;
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

const stripEmojis = (input: string) => {
  try {
    // Removes most emoji/pictographic symbols
    return input.replace(/\p{Extended_Pictographic}/gu, '').replace(/\uFE0F/g, '');
  } catch {
    // Fallback for environments without unicode property escapes
    return input;
  }
};

export function useGeminiLive(options: UseGeminiLiveOptions = {}) {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isVoiceDetected, setIsVoiceDetected] = useState(false);
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);
  const videoControlsRef = useRef<VideoControls | null>(null);
  const processedCallIdsRef = useRef<Set<string>>(new Set());

  // Store callbacks in refs to avoid dependency issues
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  // Keep videoControls ref updated
  useEffect(() => {
    console.log('[GeminiLive] videoControls updated:', options.videoControls ? 'EXISTS' : 'NULL');
    videoControlsRef.current = options.videoControls || null;
  }, [options.videoControls]);

  const updateStatus = useCallback((newStatus: ConnectionStatus) => {
    setStatus(newStatus);
    optionsRef.current.onStatusChange?.(newStatus);
  }, []);

  const playQueue = useCallback(async (ctx: AudioContext) => {
    while (audioQueueRef.current.length > 0) {
      const samples = audioQueueRef.current.shift()!;
      const buffer = ctx.createBuffer(1, samples.length, 24000);
      const channelData = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) {
        channelData[i] = samples[i];
      }
      
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start();
      
      await new Promise(resolve => {
        source.onended = resolve;
      });
    }
    isPlayingRef.current = false;
    setIsSpeaking(false);
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

  // Helper to wait for agent to finish speaking before playing video
  // Waits until audio queue is empty + 2 second buffer for natural pause
  const waitForSpeechToEnd = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      const checkSpeech = () => {
        const queueLength = audioQueueRef.current.length;
        const isPlaying = isPlayingRef.current;
        console.log('[GEMINI] Aguardando fala terminar - queue:', queueLength, 'isPlaying:', isPlaying);
        
        if (queueLength === 0 && !isPlaying) {
          console.log('[GEMINI] Fala terminou, aguardando 5 segundos...');
          // 5 second buffer after speech ends for natural pause
          setTimeout(() => {
            console.log('[GEMINI] Buffer de 5s concluído, prosseguindo...');
            resolve();
          }, 5000);
        } else {
          setTimeout(checkSpeech, 100);
        }
      };
      checkSpeech();
    });
  }, []);

  const handleToolCall = useCallback((functionCall: any) => {
    const name = functionCall.name;
    const callId = functionCall.id || `call_${Date.now()}`;
    const args = functionCall.args || {};

    // Detailed debug logging
    console.log('='.repeat(60));
    console.log('[GEMINI TOOL CALL] Recebido');
    console.log('[GEMINI TOOL CALL] Funcao:', name);
    console.log('[GEMINI TOOL CALL] Call ID:', callId);
    console.log('[GEMINI TOOL CALL] Argumentos:', JSON.stringify(args, null, 2));
    console.log('[GEMINI TOOL CALL] Raw functionCall:', JSON.stringify(functionCall, null, 2));
    console.log('[GEMINI TOOL CALL] Video Controls:', videoControlsRef.current ? 'DISPONIVEL' : 'INDISPONIVEL');
    console.log('[GEMINI TOOL CALL] Audio Queue:', audioQueueRef.current.length, 'isPlaying:', isPlayingRef.current);
    
    if (videoControlsRef.current) {
      console.log('[GEMINI TOOL CALL] Video Status - isPaused:', videoControlsRef.current.isPaused());
      console.log('[GEMINI TOOL CALL] Video Status - currentTime:', videoControlsRef.current.getCurrentTime());
    }

    if (processedCallIdsRef.current.has(callId)) {
      console.log('[GEMINI TOOL CALL] IGNORADO - Call ID ja processado:', callId);
      console.log('='.repeat(60));
      return;
    }
    processedCallIdsRef.current.add(callId);
    console.log('[GEMINI TOOL CALL] Call ID adicionado ao set de processados');

    // For play and restart, we need to wait for speech to end
    const executeWithDelay = async () => {
      let result: any = { ok: true };

      if (videoControlsRef.current) {
        const beforePaused = videoControlsRef.current.isPaused();
        const beforeTime = videoControlsRef.current.getCurrentTime();
        
        switch (name) {
          case "play_video":
            console.log('[GEMINI TOOL CALL] EXECUTANDO: play_video');
            console.log('[GEMINI TOOL CALL] Estado antes: isPaused =', beforePaused);
            console.log('[GEMINI TOOL CALL] Aguardando agente terminar de falar antes de dar play...');
            toast.info('Aguardando professor terminar de falar...');
            await waitForSpeechToEnd();
            console.log('[GEMINI TOOL CALL] Agente terminou de falar, dando play agora!');
            toast.success('Dando play no video...');
            videoControlsRef.current.play();
            setTimeout(() => {
              console.log('[GEMINI TOOL CALL] Estado depois: isPaused =', videoControlsRef.current?.isPaused());
            }, 100);
            result = { ok: true, message: "Video iniciado" };
            break;
          case "pause_video":
            console.log('[GEMINI TOOL CALL] EXECUTANDO: pause_video');
            console.log('[GEMINI TOOL CALL] Estado antes: isPaused =', beforePaused);
            toast.success('Pausando video...');
            videoControlsRef.current.pause();
            setTimeout(() => {
              console.log('[GEMINI TOOL CALL] Estado depois: isPaused =', videoControlsRef.current?.isPaused());
            }, 100);
            result = { ok: true, message: "Video pausado" };
            break;
          case "restart_video":
            console.log('[GEMINI TOOL CALL] EXECUTANDO: restart_video');
            console.log('[GEMINI TOOL CALL] Tempo antes:', beforeTime);
            console.log('[GEMINI TOOL CALL] Aguardando agente terminar de falar antes de reiniciar...');
            toast.info('Aguardando professor terminar de falar...');
            await waitForSpeechToEnd();
            console.log('[GEMINI TOOL CALL] Agente terminou de falar, reiniciando agora!');
            toast.success('Reiniciando video...');
            videoControlsRef.current.restart();
            setTimeout(() => {
              console.log('[GEMINI TOOL CALL] Tempo depois:', videoControlsRef.current?.getCurrentTime());
            }, 100);
            result = { ok: true, message: "Video reiniciado" };
            break;
          case "seek_video":
            const targetSeconds = Number(args.seconds) || 0;
            console.log('[GEMINI TOOL CALL] EXECUTANDO: seek_video');
            console.log('[GEMINI TOOL CALL] Tempo antes:', beforeTime, '-> Destino:', targetSeconds);
            toast.success(`Pulando para ${targetSeconds}s...`);
            videoControlsRef.current.seekTo(targetSeconds);
            setTimeout(() => {
              console.log('[GEMINI TOOL CALL] Tempo depois:', videoControlsRef.current?.getCurrentTime());
            }, 100);
            result = { ok: true, message: `Video pulou para ${targetSeconds} segundos` };
            break;
          default:
            console.warn('[GEMINI TOOL CALL] ERRO: Funcao desconhecida:', name);
            result = { ok: false, message: `Funcao desconhecida: ${name}` };
        }
      } else {
        console.error('[GEMINI TOOL CALL] ERRO: videoControlsRef.current e NULL');
        console.error('[GEMINI TOOL CALL] Nao foi possivel executar:', name);
        toast.error('Nenhum video carregado');
        result = { ok: false, message: "Nenhum video carregado" };
      }

      console.log('[GEMINI TOOL CALL] Resultado:', JSON.stringify(result));

      // Send tool response back to Gemini using the correct format
      // The Gemini Live API expects the response in a specific structure
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        // Try the standard toolResponse format first
        const response = {
          toolResponse: {
            functionResponses: [{
              id: callId,
              name: name,
              response: result
            }]
          }
        };
        console.log('[GEMINI TOOL CALL] Enviando resposta:', JSON.stringify(response, null, 2));
        wsRef.current.send(JSON.stringify(response));
        console.log('[GEMINI TOOL CALL] Resposta enviada com sucesso');
      } else {
        console.error('[GEMINI TOOL CALL] ERRO: WebSocket nao esta aberto, estado:', wsRef.current?.readyState);
      }
      
      console.log('='.repeat(60));
    };

    // Execute async
    executeWithDelay();
  }, [waitForSpeechToEnd]);

  const connect = useCallback(async () => {
    try {
      console.log('[GeminiLive] Starting connection...');
      updateStatus('connecting');
      
      const currentOptions = optionsRef.current;
      
      // Get API key from edge function
      console.log('[GeminiLive] Requesting token from edge function...');
      const { data, error } = await supabase.functions.invoke('gemini-token', {
        body: { systemInstruction: currentOptions.systemInstruction }
      });
      
      if (error || !data?.token) {
        console.error('[GeminiLive] Token error:', error);
        throw new Error(error?.message || 'Failed to get token');
      }
      
      console.log('[GeminiLive] Token received, connecting to WebSocket...');
      
      // Connect to Gemini Live API
      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${data.token}`;
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      
      ws.onopen = () => {
        console.log('WebSocket connected to Gemini');
        processedCallIdsRef.current.clear();
        
        // Define tools for video control - use detailed descriptions for better understanding
        const tools = [{
          functionDeclarations: [
            {
              name: "play_video",
              description: "OBRIGATORIO: Chame esta funcao para iniciar ou retomar o video. Gatilhos: 'play', 'da play', 'inicia', 'comeca', 'continua', 'roda', 'reproduz', 'volta a tocar', 'pode continuar'. Sempre que o aluno quiser que o video volte a rodar, use esta funcao."
            },
            {
              name: "pause_video",
              description: "OBRIGATORIO: Chame esta funcao para pausar o video. Gatilhos: 'pausa', 'para', 'pause', 'espera', 'segura', 'para ai', 'um momento', 'calma', 'interrompe'. Sempre que o aluno quiser parar o video temporariamente, use esta funcao."
            },
            {
              name: "restart_video",
              description: "OBRIGATORIO: Chame esta funcao para reiniciar o video do inicio. Gatilhos: 'reinicia', 'recomeca', 'volta pro inicio', 'do zero', 'desde o comeco', 'de novo', 'novamente'. Sempre que o aluno quiser ver o video desde o principio, use esta funcao."
            },
            {
              name: "seek_video",
              description: "Pula para um momento especifico do video em segundos. Use quando o aluno mencionar um tempo especifico.",
              parameters: {
                type: "object",
                properties: {
                  seconds: { 
                    type: "number", 
                    description: "O tempo em segundos para pular" 
                  }
                },
                required: ["seconds"]
              }
            }
          ]
        }];
        
        // Send setup message with Gemini 2.0 Flash
        // Using Kore voice - warm female voice
        // Note: For Gemini Live API with audio, only AUDIO modality is supported
        // Tool calling works through the modelTurn.parts[].functionCall structure
        const setupMessage = {
          setup: {
            model: "models/gemini-2.0-flash-live-001",
            generationConfig: {
              temperature: 0.7,
              responseModalities: ["AUDIO"],
              speechConfig: {
                languageCode: "pt-BR",
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: "Kore"
                  }
                }
              }
            },
            systemInstruction: {
              parts: [{
                text: stripEmojis(currentOptions.systemInstruction || "Você é um professor amigável e didático. Seu objetivo é ensinar de forma clara e envolvente. Fale em português brasileiro.")
              }]
            },
            tools: tools
          }
        };
        
        console.log('[GeminiLive] Enviando setup:', JSON.stringify(setupMessage, null, 2).substring(0, 500));
        ws.send(JSON.stringify(setupMessage));
        
        updateStatus('connected');
      };
      
      ws.onmessage = async (event) => {
        try {
          // Handle binary data (Blob)
          let messageData = event.data;
          
          if (messageData instanceof Blob) {
            messageData = await messageData.text();
          }
          
          // Skip if not a string
          if (typeof messageData !== 'string') {
            console.log('[gemini:event] Received non-string data, skipping');
            return;
          }
          
          const data = JSON.parse(messageData);
          
          // Log ALL messages for complete debugging
          console.log('[GEMINI RAW]', JSON.stringify(data).substring(0, 500));
          
          // Check for tool calls in ALL possible locations
          const hasToolCallInParts = data.serverContent?.modelTurn?.parts?.some((p: any) => p.functionCall);
          const hasToolCallInCandidates = data.candidates?.[0]?.content?.parts?.some((p: any) => p.functionCall);
          const hasToolCallInToolCallField = !!data.toolCall;
          const hasDirectFunctionCall = !!data.functionCall;
          // New: check for tool_call (snake_case variant)
          const hasSnakeCaseToolCall = !!data.tool_call;
          // New: check serverContent.toolCall
          const hasServerContentToolCall = !!data.serverContent?.toolCall;
          
          const hasToolCall = hasToolCallInParts || hasToolCallInCandidates || 
                            hasToolCallInToolCallField || hasDirectFunctionCall || 
                            hasSnakeCaseToolCall || hasServerContentToolCall;
          
          if (hasToolCall) {
            console.log('*'.repeat(60));
            console.log('[GEMINI EVENT] TOOL CALL DETECTADO!');
            console.log('[GEMINI EVENT] hasToolCallInParts:', hasToolCallInParts);
            console.log('[GEMINI EVENT] hasToolCallInCandidates:', hasToolCallInCandidates);
            console.log('[GEMINI EVENT] hasToolCallInToolCallField:', hasToolCallInToolCallField);
            console.log('[GEMINI EVENT] hasDirectFunctionCall:', hasDirectFunctionCall);
            console.log('[GEMINI EVENT] hasSnakeCaseToolCall:', hasSnakeCaseToolCall);
            console.log('[GEMINI EVENT] hasServerContentToolCall:', hasServerContentToolCall);
            console.log('[GEMINI EVENT] Dados completos:', JSON.stringify(data, null, 2));
            console.log('*'.repeat(60));
          } else {
            // Log resumido para outros eventos
            const eventType = data.setupComplete ? 'SETUP' : 
                            data.serverContent?.modelTurn ? 'MODEL_TURN' : 
                            data.serverContent?.interrupted ? 'INTERRUPTED' : 
                            data.serverContent?.turnComplete ? 'TURN_COMPLETE' : 'OTHER';
            console.log('[GEMINI EVENT]', eventType);
          }
          
          // Handle audio response
          if (data.serverContent?.modelTurn?.parts) {
            console.log('[GEMINI EVENT] Processando modelTurn com', data.serverContent.modelTurn.parts.length, 'parts');
            for (const part of data.serverContent.modelTurn.parts) {
              if (part.inlineData?.data) {
                await playAudioChunk(part.inlineData.data);
              }
              if (part.text) {
                console.log('[GEMINI EVENT] Texto recebido:', part.text.substring(0, 100));
                optionsRef.current.onTranscript?.(part.text, 'assistant');
              }
              // Handle function calls in parts
              if (part.functionCall) {
                console.log('[GEMINI EVENT] functionCall encontrado em part!');
                console.log('[GEMINI EVENT] functionCall:', JSON.stringify(part.functionCall, null, 2));
                handleToolCall(part.functionCall);
              }
            }
          }
          
          // Handle tool calls in toolCall field (camelCase)
          if (data.toolCall?.functionCalls) {
            console.log('[GEMINI EVENT] functionCalls encontrado em toolCall!');
            for (const fc of data.toolCall.functionCalls) {
              handleToolCall(fc);
            }
          }
          
          // Handle tool calls in tool_call field (snake_case variant)
          if (data.tool_call?.function_calls) {
            console.log('[GEMINI EVENT] function_calls encontrado em tool_call!');
            for (const fc of data.tool_call.function_calls) {
              handleToolCall(fc);
            }
          }
          
          // Handle serverContent.toolCall
          if (data.serverContent?.toolCall?.functionCalls) {
            console.log('[GEMINI EVENT] functionCalls encontrado em serverContent.toolCall!');
            for (const fc of data.serverContent.toolCall.functionCalls) {
              handleToolCall(fc);
            }
          }
          
          // Handle tool calls directly on data
          if (data.functionCall) {
            console.log('[GEMINI EVENT] functionCall encontrado diretamente em data!');
            handleToolCall(data.functionCall);
          }
          
          // Handle function_call (snake_case variant)
          if (data.function_call) {
            console.log('[GEMINI EVENT] function_call (snake_case) encontrado!');
            handleToolCall(data.function_call);
          }
          
          // Handle tool calls in candidates format
          if (data.candidates?.[0]?.content?.parts) {
            for (const part of data.candidates[0].content.parts) {
              if (part.functionCall) {
                console.log('[GEMINI EVENT] functionCall encontrado em candidates!');
                handleToolCall(part.functionCall);
              }
            }
          }
          
          // Handle interruption
          if (data.serverContent?.interrupted) {
            console.log('[GEMINI EVENT] Interrupcao detectada');
            audioQueueRef.current = [];
            isPlayingRef.current = false;
            setIsSpeaking(false);
          }

          // Handle setup complete
          if (data.setupComplete) {
            console.log('[GEMINI EVENT] Setup completo - tools configuradas');
          }
        } catch (e) {
          // Only log if it's not a parse error from binary data
          if (e instanceof SyntaxError) {
            console.log('[gemini:event] Non-JSON message received, likely binary audio');
          } else {
            console.error('Error processing message:', e);
          }
        }
      };
      
      ws.onerror = (error) => {
        console.error('[GeminiLive] WebSocket error:', error);
        console.error('[GeminiLive] WebSocket error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
        updateStatus('error');
        optionsRef.current.onError?.('Erro de conexao com Gemini');
      };
      
      ws.onclose = (event) => {
        console.log('[GeminiLive] WebSocket closed');
        console.log('[GeminiLive] Close code:', event.code);
        console.log('[GeminiLive] Close reason:', event.reason || 'Nenhuma razao fornecida');
        console.log('[GeminiLive] Was clean:', event.wasClean);
        
        // Common close codes:
        // 1000 = Normal closure
        // 1006 = Abnormal closure (connection lost)
        // 1011 = Server error
        // 1015 = TLS handshake failure
        if (event.code !== 1000) {
          console.error('[GeminiLive] Conexao fechada com erro. Codigo:', event.code);
          optionsRef.current.onError?.(`Conexao fechada: codigo ${event.code}`);
        }
        
        updateStatus('disconnected');
        stopListening();
      };
      
    } catch (error) {
      console.error('[GeminiLive] Connection error:', error);
      updateStatus('error');
      optionsRef.current.onError?.(error instanceof Error ? error.message : 'Connection failed');
    }
  }, [updateStatus, playAudioChunk, stopListening, handleToolCall]);

  const disconnect = useCallback(() => {
    stopListening();
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    setIsSpeaking(false);
    updateStatus('disconnected');
  }, [updateStatus, stopListening]);

  const startListening = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      optionsRef.current.onError?.('Not connected');
      return;
    }
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          // @ts-ignore - experimental features for better noise resistance
          suppressLocalAudioPlayback: true,
          voiceIsolation: true,
        } 
      });
      
      mediaStreamRef.current = stream;
      
      const audioContext = new AudioContext({ sampleRate: 16000 });
      const source = audioContext.createMediaStreamSource(stream);
      
      // Create high-pass filter to remove low-frequency noise (AC hum, background rumble)
      const highpassFilter = audioContext.createBiquadFilter();
      highpassFilter.type = 'highpass';
      highpassFilter.frequency.value = 85; // Cut frequencies below 85Hz (human voice starts ~85Hz)
      highpassFilter.Q.value = 0.7;
      
      // Create low-pass filter to remove high-frequency noise (hiss, static)
      const lowpassFilter = audioContext.createBiquadFilter();
      lowpassFilter.type = 'lowpass';
      lowpassFilter.frequency.value = 8000; // Cut frequencies above 8kHz (speech range is 300Hz-3400Hz, keep some headroom)
      lowpassFilter.Q.value = 0.7;
      
      // Create compressor to normalize volume and reduce sudden loud noises
      const compressor = audioContext.createDynamicsCompressor();
      compressor.threshold.value = -24; // Start compressing at -24dB
      compressor.knee.value = 12; // Soft knee for natural compression
      compressor.ratio.value = 4; // 4:1 compression ratio
      compressor.attack.value = 0.005; // Fast attack to catch loud sounds
      compressor.release.value = 0.1; // Quick release for natural speech
      
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      
      processorRef.current = processor;
      
      // VAD (Voice Activity Detection) parameters for speakerphone resistance
      const VAD_ENERGY_THRESHOLD = 0.008; // Minimum RMS energy to consider as speech
      const VAD_ZERO_CROSSING_MIN = 10; // Minimum zero crossings (voice has more variation than noise)
      const VAD_ZERO_CROSSING_MAX = 800; // Maximum (too high = likely noise/static)
      let silentFrameCount = 0;
      const SILENT_FRAMES_BEFORE_MUTE = 3; // Number of silent frames before stopping transmission
      let noiseFloor = 0.002; // Adaptive noise floor estimation
      const NOISE_ADAPTATION_RATE = 0.05; // How fast to adapt to ambient noise
      
      processor.onaudioprocess = (e) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          const inputData = e.inputBuffer.getChannelData(0);
          
          // Calculate RMS energy (volume level)
          let sumSquares = 0;
          let zeroCrossings = 0;
          let prevSample = 0;
          
          for (let i = 0; i < inputData.length; i++) {
            sumSquares += inputData[i] * inputData[i];
            // Count zero crossings (sign changes)
            if ((prevSample >= 0 && inputData[i] < 0) || (prevSample < 0 && inputData[i] >= 0)) {
              zeroCrossings++;
            }
            prevSample = inputData[i];
          }
          
          const rmsEnergy = Math.sqrt(sumSquares / inputData.length);
          
          // Adaptive noise floor - slowly adjust to ambient noise level
          if (rmsEnergy < noiseFloor * 2) {
            noiseFloor = noiseFloor * (1 - NOISE_ADAPTATION_RATE) + rmsEnergy * NOISE_ADAPTATION_RATE;
          }
          
          // Dynamic threshold based on noise floor
          const dynamicThreshold = Math.max(VAD_ENERGY_THRESHOLD, noiseFloor * 3);
          
          // Voice Activity Detection check
          const hasEnoughEnergy = rmsEnergy > dynamicThreshold;
          const hasNormalZeroCrossings = zeroCrossings >= VAD_ZERO_CROSSING_MIN && zeroCrossings <= VAD_ZERO_CROSSING_MAX;
          const isVoiceDetected = hasEnoughEnergy && hasNormalZeroCrossings;
          
          // Update voice detection state for UI feedback
          setIsVoiceDetected(isVoiceDetected);
          
          if (!isVoiceDetected) {
            silentFrameCount++;
            // Skip sending if too many silent frames (reduces bandwidth and noise)
            if (silentFrameCount > SILENT_FRAMES_BEFORE_MUTE) {
              return;
            }
          } else {
            silentFrameCount = 0;
          }
          
          // Apply soft gate - reduce volume of quiet sounds (likely noise)
          const gateMultiplier = rmsEnergy > dynamicThreshold ? 1.0 : Math.pow(rmsEnergy / dynamicThreshold, 2);
          
          // Convert Float32 to Int16 with gating applied
          const int16Array = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            const gatedSample = inputData[i] * gateMultiplier;
            int16Array[i] = Math.max(-32768, Math.min(32767, gatedSample * 32768));
          }
          
          // Convert to base64
          const uint8Array = new Uint8Array(int16Array.buffer);
          let binary = '';
          for (let i = 0; i < uint8Array.length; i++) {
            binary += String.fromCharCode(uint8Array[i]);
          }
          const base64Audio = btoa(binary);
          
          // Send audio to Gemini
          wsRef.current.send(JSON.stringify({
            realtimeInput: {
              mediaChunks: [{
                mimeType: "audio/pcm;rate=16000",
                data: base64Audio
              }]
            }
          }));
        }
      };
      
      // Connect audio processing chain: source -> highpass -> lowpass -> compressor -> processor
      source.connect(highpassFilter);
      highpassFilter.connect(lowpassFilter);
      lowpassFilter.connect(compressor);
      compressor.connect(processor);
      processor.connect(audioContext.destination);
      
      setIsListening(true);
      console.log('[GeminiLive] Audio pipeline com VAD e filtros de ruido ativado');
      
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

    const safeText = stripEmojis(text);

    wsRef.current.send(JSON.stringify({
      clientContent: {
        turns: [{
          role: "user",
          parts: [{ text: safeText }]
        }],
        turnComplete: true
      }
    }));

    optionsRef.current.onTranscript?.(safeText, 'user');
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
    isVoiceDetected,
    connect,
    disconnect,
    startListening,
    stopListening,
    sendText
  };
}
