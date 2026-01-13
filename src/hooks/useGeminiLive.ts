import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UseGeminiLiveOptions {
  systemInstruction?: string;
  onTranscript?: (text: string, role: 'user' | 'assistant') => void;
  onError?: (error: string) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
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

  const updateStatus = useCallback((newStatus: ConnectionStatus) => {
    setStatus(newStatus);
    options.onStatusChange?.(newStatus);
  }, [options.onStatusChange]);

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
      
      // Get ephemeral token
      const { data, error } = await supabase.functions.invoke('gemini-token', {
        body: { systemInstruction: options.systemInstruction }
      });
      
      if (error || !data?.token) {
        throw new Error(error?.message || 'Failed to get token');
      }
      
      // Connect to Gemini Live API
      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${data.token}`;
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      
      ws.onopen = () => {
        console.log('WebSocket connected');
        
        // Send setup message
        ws.send(JSON.stringify({
          setup: {
            model: "models/gemini-2.5-flash-native-audio-preview-12-2025",
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: "Puck"
                  }
                }
              }
            },
            systemInstruction: {
              parts: [{
                text: options.systemInstruction || "Você é um professor amigável e didático. Seu objetivo é ensinar de forma clara e envolvente. Fale em português brasileiro."
              }]
            }
          }
        }));
        
        updateStatus('connected');
      };
      
      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Handle audio response
          if (data.serverContent?.modelTurn?.parts) {
            for (const part of data.serverContent.modelTurn.parts) {
              if (part.inlineData?.data) {
                await playAudioChunk(part.inlineData.data);
              }
              if (part.text) {
                options.onTranscript?.(part.text, 'assistant');
              }
            }
          }
          
          // Handle interruption
          if (data.serverContent?.interrupted) {
            audioQueueRef.current = [];
            isPlayingRef.current = false;
            setIsSpeaking(false);
          }
        } catch (e) {
          console.error('Error processing message:', e);
        }
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        updateStatus('error');
        options.onError?.('Connection error');
      };
      
      ws.onclose = () => {
        console.log('WebSocket closed');
        updateStatus('disconnected');
        stopListening();
      };
      
    } catch (error) {
      console.error('Connection error:', error);
      updateStatus('error');
      options.onError?.(error instanceof Error ? error.message : 'Connection failed');
    }
  }, [options.systemInstruction, updateStatus, playAudioChunk, stopListening, options.onTranscript, options.onError]);

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
      options.onError?.('Not connected');
      return;
    }
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
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
      options.onError?.('Could not access microphone');
    }
  }, [options.onError]);

  const sendText = useCallback((text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      options.onError?.('Not connected');
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
    
    options.onTranscript?.(text, 'user');
  }, [options.onError, options.onTranscript]);

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
