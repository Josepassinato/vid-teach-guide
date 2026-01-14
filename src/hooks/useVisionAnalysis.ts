import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface EmotionAnalysis {
  emotion: string;
  confidence: number;
  details: string;
  engagement_level: 'high' | 'medium' | 'low';
  suggestions?: string[];
}

interface UseVisionAnalysisOptions {
  onEmotionDetected?: (analysis: EmotionAnalysis) => void;
  onError?: (error: string) => void;
  analysisInterval?: number; // ms between analyses
}

export function useVisionAnalysis(options: UseVisionAnalysisOptions = {}) {
  const [isActive, setIsActive] = useState(false);
  const [currentEmotion, setCurrentEmotion] = useState<EmotionAnalysis | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<number | null>(null);
  const optionsRef = useRef(options);
  
  useEffect(() => {
    optionsRef.current = options;
  });

  const captureFrame = useCallback((): string | null => {
    if (!videoRef.current || !canvasRef.current) return null;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx || video.videoWidth === 0) return null;
    
    // Set canvas size to match video
    canvas.width = 320; // Lower resolution for faster processing
    canvas.height = 240;
    
    // Draw and mirror the image
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    
    // Convert to base64
    return canvas.toDataURL('image/jpeg', 0.7);
  }, []);

  const analyzeFrame = useCallback(async (imageBase64: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('vision-analysis', {
        body: { image: imageBase64 }
      });
      
      if (error) throw error;
      
      if (data?.analysis) {
        const analysis: EmotionAnalysis = data.analysis;
        setCurrentEmotion(analysis);
        optionsRef.current.onEmotionDetected?.(analysis);
        return analysis;
      }
    } catch (error) {
      console.error('[VisionAnalysis] Error analyzing frame:', error);
      optionsRef.current.onError?.(error instanceof Error ? error.message : 'Analysis failed');
    }
    return null;
  }, []);

  const startAnalysis = useCallback(async () => {
    try {
      // Create hidden video and canvas elements if not exist
      if (!videoRef.current) {
        const video = document.createElement('video');
        video.setAttribute('autoplay', '');
        video.setAttribute('playsinline', '');
        video.setAttribute('muted', '');
        video.style.position = 'absolute';
        video.style.opacity = '0';
        video.style.pointerEvents = 'none';
        video.style.width = '1px';
        video.style.height = '1px';
        document.body.appendChild(video);
        videoRef.current = video;
      }
      
      if (!canvasRef.current) {
        const canvas = document.createElement('canvas');
        canvas.style.display = 'none';
        document.body.appendChild(canvas);
        canvasRef.current = canvas;
      }
      
      // Request camera access
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 320 },
          height: { ideal: 240 },
          facingMode: 'user'
        }
      });
      
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      
      setHasPermission(true);
      setIsActive(true);
      
      // Start periodic analysis
      const interval = optionsRef.current.analysisInterval || 5000; // Default 5 seconds
      
      // Do first analysis after video is ready
      setTimeout(() => {
        const frame = captureFrame();
        if (frame) analyzeFrame(frame);
      }, 1000);
      
      intervalRef.current = window.setInterval(() => {
        const frame = captureFrame();
        if (frame) analyzeFrame(frame);
      }, interval);
      
    } catch (error) {
      console.error('[VisionAnalysis] Error starting:', error);
      setHasPermission(false);
      optionsRef.current.onError?.(error instanceof Error ? error.message : 'Camera access denied');
    }
  }, [captureFrame, analyzeFrame]);

  const stopAnalysis = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setIsActive(false);
  }, []);

  // Capture a single frame for manual analysis
  const captureAndAnalyze = useCallback(async (): Promise<EmotionAnalysis | null> => {
    if (!isActive) return null;
    const frame = captureFrame();
    if (!frame) return null;
    return analyzeFrame(frame);
  }, [isActive, captureFrame, analyzeFrame]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAnalysis();
      
      if (videoRef.current) {
        videoRef.current.remove();
        videoRef.current = null;
      }
      
      if (canvasRef.current) {
        canvasRef.current.remove();
        canvasRef.current = null;
      }
    };
  }, [stopAnalysis]);

  return {
    isActive,
    currentEmotion,
    hasPermission,
    startAnalysis,
    stopAnalysis,
    captureAndAnalyze,
  };
}
