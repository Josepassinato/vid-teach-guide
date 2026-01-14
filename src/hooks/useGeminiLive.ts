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

export function useGeminiLive(options: UseGeminiLiveOptions = {}) {
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

  const handleToolCall = useCallback((functionCall: any) => {
    const name = functionCall.name;
    const callId = functionCall.id || `call_${Date.now()}`;
    const args = functionCall.args || {};

    if (processedCallIdsRef.current.has(callId)) return;
    processedCallIdsRef.current.add(callId);

    console.log('[gemini:tool-call]', name, args, callId);
    console.log('[gemini:tool-call] videoControlsRef.current:', videoControlsRef.current ? 'EXISTS' : 'NULL');

    let result: any = { ok: true };

    if (videoControlsRef.current) {
      switch (name) {
        case "play_video":
          console.log('[gemini:tool-call] Executing play_video');
          toast.success('▶️ Dando play no vídeo...');
          videoControlsRef.current.play();
          result = { ok: true, message: "Vídeo iniciado" };
          break;
        case "pause_video":
          console.log('[gemini:tool-call] Executing pause_video');
          toast.success('⏸️ Pausando vídeo...');
          videoControlsRef.current.pause();
          result = { ok: true, message: "Vídeo pausado" };
          break;
        case "restart_video":
          console.log('[gemini:tool-call] Executing restart_video');
          toast.success('🔄 Reiniciando vídeo...');
          videoControlsRef.current.restart();
          result = { ok: true, message: "Vídeo reiniciado" };
          break;
        case "seek_video":
          console.log('[gemini:tool-call] Executing seek_video to', args.seconds);
          toast.success(`⏩ Pulando para ${Number(args.seconds) || 0}s...`);
          videoControlsRef.current.seekTo(Number(args.seconds) || 0);
          result = { ok: true, message: `Vídeo pulou para ${Number(args.seconds) || 0} segundos` };
          break;
        default:
          console.warn('[gemini:tool-call] Unknown function:', name);
          result = { ok: false, message: `Função desconhecida: ${name}` };
      }
    } else {
      console.warn('[gemini:tool-call] videoControlsRef.current is NULL - cannot execute', name);
      toast.error('❌ Nenhum vídeo carregado');
      result = { ok: false, message: "Nenhum vídeo carregado" };
    }

    // Send tool response back to Gemini
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        toolResponse: {
          functionResponses: [{
            id: callId,
            name: name,
            response: result
          }]
        }
      }));
    }
  }, []);

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
        
        // Define tools for video control
        const tools = [{
          functionDeclarations: [
            {
              name: "play_video",
              description: "Inicia ou retoma a reprodução do vídeo. Use quando o aluno pedir para dar play, iniciar, continuar ou reproduzir o vídeo."
            },
            {
              name: "pause_video",
              description: "Pausa a reprodução do vídeo. Use quando o aluno pedir para pausar, parar ou interromper o vídeo."
            },
            {
              name: "restart_video",
              description: "Reinicia o vídeo do começo. Use quando o aluno pedir para voltar ao início, reiniciar ou começar de novo."
            },
            {
              name: "seek_video",
              description: "Pula para um momento específico do vídeo em segundos. Use quando o aluno pedir para ir para um tempo específico.",
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
        // Using Kore voice - warm female voice, better for Portuguese
        // Other options: Charon (deep male), Fenrir (energetic), Aoede (warm female), Puck (playful)
        ws.send(JSON.stringify({
          setup: {
            model: "models/gemini-2.0-flash-exp",
            generationConfig: {
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
                text: currentOptions.systemInstruction || "Você é um professor amigável e didático. Seu objetivo é ensinar de forma clara e envolvente. Fale em português brasileiro."
              }]
            },
            tools: tools
          }
        }));
        
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
          
          // Log more details for debugging tool calls
          const hasToolCall = data.toolCall || data.functionCall || 
            data.serverContent?.modelTurn?.parts?.some((p: any) => p.functionCall) ||
            data.candidates?.[0]?.content?.parts?.some((p: any) => p.functionCall);
          
          if (hasToolCall) {
            console.log('[gemini:event] Tool call detected! Full data:', JSON.stringify(data));
          } else {
            console.log('[gemini:event]', JSON.stringify(data).substring(0, 500));
          }
          
          // Handle audio response
          if (data.serverContent?.modelTurn?.parts) {
            for (const part of data.serverContent.modelTurn.parts) {
              if (part.inlineData?.data) {
                await playAudioChunk(part.inlineData.data);
              }
              if (part.text) {
                optionsRef.current.onTranscript?.(part.text, 'assistant');
              }
              // Handle function calls in parts
              if (part.functionCall) {
                console.log('[gemini:tool] Found functionCall in part:', part.functionCall);
                handleToolCall(part.functionCall);
              }
            }
          }
          
          // Handle tool calls in toolCall field (alternative format)
          if (data.toolCall?.functionCalls) {
            console.log('[gemini:tool] Found functionCalls in toolCall:', data.toolCall.functionCalls);
            for (const fc of data.toolCall.functionCalls) {
              handleToolCall(fc);
            }
          }
          
          // Handle tool calls directly on data (another alternative format)
          if (data.functionCall) {
            console.log('[gemini:tool] Found functionCall on data:', data.functionCall);
            handleToolCall(data.functionCall);
          }
          
          // Handle tool calls in candidates format
          if (data.candidates?.[0]?.content?.parts) {
            for (const part of data.candidates[0].content.parts) {
              if (part.functionCall) {
                console.log('[gemini:tool] Found functionCall in candidates:', part.functionCall);
                handleToolCall(part.functionCall);
              }
            }
          }
          
          // Handle interruption
          if (data.serverContent?.interrupted) {
            audioQueueRef.current = [];
            isPlayingRef.current = false;
            setIsSpeaking(false);
          }

          // Handle setup complete
          if (data.setupComplete) {
            console.log('[gemini] Setup complete');
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
        updateStatus('error');
        optionsRef.current.onError?.('Connection error');
      };
      
      ws.onclose = (event) => {
        console.log('[GeminiLive] WebSocket closed:', { code: event.code, reason: event.reason });
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
        } 
      });
      
      mediaStreamRef.current = stream;
      
      const audioContext = new AudioContext({ sampleRate: 16000 });
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
    
    wsRef.current.send(JSON.stringify({
      clientContent: {
        turns: [{
          role: "user",
          parts: [{ text }]
        }],
        turnComplete: true
      }
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
