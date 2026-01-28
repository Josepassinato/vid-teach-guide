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

interface UseOpenAIRealtimeOptions {
  systemInstruction?: string;
  onTranscript?: (text: string, role: 'user' | 'assistant') => void;
  onError?: (error: string) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
  videoControls?: VideoControls | null;
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

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

  const playQueue = useCallback(async (ctx: AudioContext) => {
    // Ensure we have an output chain: source -> gain -> compressor/limiter -> destination
    // This boosts volume while reducing clipping/distortion.
    if (!compressorNodeRef.current) {
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -24;
      compressor.knee.value = 30;
      compressor.ratio.value = 12;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;
      compressor.connect(ctx.destination);
      compressorNodeRef.current = compressor;
    }

    if (!gainNodeRef.current) {
      const gain = ctx.createGain();
      gain.gain.value = 8.0; // Increase loudness; compressor limits peaks
      gain.connect(compressorNodeRef.current);
      gainNodeRef.current = gain;
    }
    
    while (audioQueueRef.current.length > 0) {
      const samples = audioQueueRef.current.shift()!;
      const buffer = ctx.createBuffer(1, samples.length, 24000);
      const channelData = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) {
        channelData[i] = samples[i];
      }
      
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(gainNodeRef.current!); // Connect to gain node instead of destination
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

  const connect = useCallback(async () => {
    try {
      updateStatus('connecting');
      
      const currentOptions = optionsRef.current;
      
      // Get API key from edge function
      const { data, error } = await supabase.functions.invoke('openai-realtime-token', {
        body: { systemInstruction: currentOptions.systemInstruction }
      });
      
      if (error || !data?.apiKey) {
        throw new Error(error?.message || 'Failed to get API key');
      }
      
      // Connect to OpenAI Realtime API
      const wsUrl = `wss://api.openai.com/v1/realtime?model=${data.model}`;
      
      const ws = new WebSocket(wsUrl, [
        "realtime",
        `openai-insecure-api-key.${data.apiKey}`,
        "openai-beta.realtime-v1"
      ]);
      wsRef.current = ws;
      
      ws.onopen = () => {
        console.log('WebSocket connected to OpenAI');
        processedCallIdsRef.current.clear();
        
        // Define tools for video control - use detailed descriptions for better understanding
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
            description: "Pula para um momento especifico do video em segundos. Use quando o aluno mencionar um tempo especifico.",
            parameters: {
              type: "object",
              properties: {
                seconds: { type: "number", description: "O tempo em segundos para pular" }
              },
              required: ["seconds"]
            }
          }
        ];
        
        // Send session update with configuration and tools
        // Using "coral" voice - warm, natural and expressive, ideal for empathetic teaching
        // Other options: "nova" (warm female), "sage" (wise male), "alloy" (neutral)
        ws.send(JSON.stringify({
          type: "session.update",
          session: {
            modalities: ["text", "audio"],
            instructions: currentOptions.systemInstruction || "Você é um professor amigável e didático. Seu objetivo é ensinar de forma clara e envolvente. Fale em português brasileiro.",
            voice: "coral",
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
            optionsRef.current.onTranscript?.(data.transcript, 'user');
          }

          // Helper to wait for agent to finish speaking before playing video
          const waitForSpeechToEnd = (): Promise<void> => {
            return new Promise((resolve) => {
              const checkSpeech = () => {
                const queueLength = audioQueueRef.current.length;
                const isPlaying = isPlayingRef.current;
                console.log('[OPENAI] Aguardando fala terminar - queue:', queueLength, 'isPlaying:', isPlaying);
                
                if (queueLength === 0 && !isPlaying) {
                  console.log('[OPENAI] Fala terminou, prosseguindo...');
                  // Add small buffer to ensure audio fully finished
                  setTimeout(resolve, 300);
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
                default:
                  console.warn('[OPENAI TOOL CALL] ERRO: Funcao desconhecida:', name);
                  result = { ok: false, message: `Funcao desconhecida: ${name}` };
              }
            } else {
              console.error('[OPENAI TOOL CALL] ERRO: videoControlsRef.current e NULL');
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
          }

          // Handle errors
          if (data.type === "error") {
            console.error('OpenAI Realtime error:', data.error);
            optionsRef.current.onError?.(data.error?.message || 'Unknown error');
          }
        } catch (e) {
          console.error('Error processing message:', e);
        }
      };

      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        updateStatus('error');
        optionsRef.current.onError?.('Connection error');
      };
      
      ws.onclose = () => {
        console.log('WebSocket closed');
        updateStatus('disconnected');
        stopListening();
      };
      
    } catch (error) {
      console.error('Connection error:', error);
      updateStatus('error');
      optionsRef.current.onError?.(error instanceof Error ? error.message : 'Connection failed');
    }
  }, [updateStatus, playAudioChunk, stopListening]);

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
