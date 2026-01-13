import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

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
        
        // Define tools for video control
        const tools = [
          {
            type: "function",
            name: "play_video",
            description: "Inicia ou retoma a reprodução do vídeo. Use quando o aluno pedir para dar play, iniciar, continuar ou reproduzir o vídeo.",
            parameters: { type: "object", properties: {}, required: [] }
          },
          {
            type: "function",
            name: "pause_video",
            description: "Pausa a reprodução do vídeo. Use quando o aluno pedir para pausar, parar ou interromper o vídeo.",
            parameters: { type: "object", properties: {}, required: [] }
          },
          {
            type: "function",
            name: "restart_video",
            description: "Reinicia o vídeo do começo. Use quando o aluno pedir para voltar ao início, reiniciar ou começar de novo.",
            parameters: { type: "object", properties: {}, required: [] }
          },
          {
            type: "function",
            name: "seek_video",
            description: "Pula para um momento específico do vídeo em segundos. Use quando o aluno pedir para ir para um tempo específico.",
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
        ws.send(JSON.stringify({
          type: "session.update",
          session: {
            modalities: ["text", "audio"],
            instructions: currentOptions.systemInstruction || "Você é um professor amigável e didático. Seu objetivo é ensinar de forma clara e envolvente. Fale em português brasileiro.",
            voice: "alloy",
            input_audio_format: "pcm16",
            output_audio_format: "pcm16",
            input_audio_transcription: {
              model: "whisper-1"
            },
            turn_detection: {
              type: "server_vad",
              threshold: 0.8,
              prefix_padding_ms: 500,
              silence_duration_ms: 1000
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

          const runFunctionCall = async (name: string, callId: string, argsJson?: string) => {
            if (!callId) return;
            if (processedCallIdsRef.current.has(callId)) return;
            processedCallIdsRef.current.add(callId);

            let args: any = {};
            try {
              args = argsJson ? JSON.parse(argsJson) : {};
            } catch {
              args = {};
            }

            console.log('Tool call:', name, args, callId);

            let result: any = { ok: true };

            if (videoControlsRef.current) {
              switch (name) {
                case "play_video":
                  videoControlsRef.current.play();
                  result = { ok: true, message: "Vídeo iniciado" };
                  break;
                case "pause_video":
                  videoControlsRef.current.pause();
                  result = { ok: true, message: "Vídeo pausado" };
                  break;
                case "restart_video":
                  videoControlsRef.current.restart();
                  result = { ok: true, message: "Vídeo reiniciado" };
                  break;
                case "seek_video":
                  videoControlsRef.current.seekTo(Number(args.seconds) || 0);
                  result = { ok: true, message: `Vídeo pulou para ${Number(args.seconds) || 0} segundos` };
                  break;
                default:
                  result = { ok: false, message: `Função desconhecida: ${name}` };
              }
            } else {
              result = { ok: false, message: "Nenhum vídeo carregado" };
            }

            // Provide function call output back to the model
            ws.send(JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: callId,
                output: JSON.stringify(result)
              }
            }));

            // Request a response after function call
            ws.send(JSON.stringify({ type: "response.create" }));
          };

          // Handle function calls (can arrive as standalone events)
          if (data.type === "response.function_call_arguments.done") {
            await runFunctionCall(data.name, data.call_id, data.arguments);
          }

          // Handle function calls (some SDKs deliver them as output_item events)
          if (data.type === "response.output_item.added" || data.type === "response.output_item.done") {
            const item = data.item;
            if (item?.type === 'function_call') {
              await runFunctionCall(item.name, item.call_id, item.arguments);
            }
          }

          // Handle function calls (canonical: embedded in response.done)
          if (data.type === "response.done") {
            const outputs = data.response?.output;
            if (Array.isArray(outputs)) {
              for (const item of outputs) {
                if (item?.type === 'function_call') {
                  await runFunctionCall(item.name, item.call_id, item.arguments);
                }
              }
            }

            // Don't clear audio here; let playback finish naturally to avoid cutting the last word
            console.log('Response done, audio queue length:', audioQueueRef.current.length);
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
    connect,
    disconnect,
    startListening,
    stopListening,
    sendText
  };
}
