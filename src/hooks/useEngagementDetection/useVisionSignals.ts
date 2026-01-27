import { useState, useCallback, useRef, useEffect } from 'react';
import { VisionSignals } from './types';

interface UseVisionSignalsOptions {
  onSignalsUpdate?: (signals: VisionSignals) => void;
  onConsentRequest?: () => void;
}

// Default disabled state
const DEFAULT_VISION_SIGNALS: VisionSignals = {
  enabled: false,
  faceDetected: false,
  gazeDirection: 'unknown',
  gazeOnVideoRatio: 0,
  expression: 'unknown',
  isLookingAtScreen: false,
  blinkRate: 0,
  distanceFromScreen: 1,
};

export function useVisionSignals(options: UseVisionSignalsOptions = {}) {
  const [signals, setSignals] = useState<VisionSignals>(DEFAULT_VISION_SIGNALS);
  const [isEnabled, setIsEnabled] = useState(false);
  const [hasConsent, setHasConsent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionIntervalRef = useRef<number | null>(null);
  const optionsRef = useRef(options);

  // Track time looking at screen vs away for ratio calculation
  const gazeTrackingRef = useRef({
    onScreenTime: 0,
    totalTime: 0,
    lastUpdate: Date.now(),
  });

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
    };
  }, []);

  // Request camera access and enable vision
  const enableVision = useCallback(async () => {
    if (!hasConsent) {
      optionsRef.current.onConsentRequest?.();
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Request camera access
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
      });

      streamRef.current = stream;

      // Create video element for processing
      const video = document.createElement('video');
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      await video.play();
      videoRef.current = video;

      // Create canvas for analysis
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      canvasRef.current = canvas;

      setIsEnabled(true);
      setSignals(prev => ({ ...prev, enabled: true }));

      // Start detection loop
      // Note: In a full implementation, this would use TensorFlow.js or MediaPipe
      // For now, we'll use a simplified detection based on available browser APIs
      startDetectionLoop();

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to access camera';
      setError(message);
      console.error('[VisionSignals] Camera error:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [hasConsent]);

  // Disable vision and cleanup
  const disableVision = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }

    videoRef.current = null;
    canvasRef.current = null;
    
    setIsEnabled(false);
    setSignals(DEFAULT_VISION_SIGNALS);
  }, []);

  // Grant consent for vision
  const grantConsent = useCallback(() => {
    setHasConsent(true);
    localStorage.setItem('vision_consent', 'true');
  }, []);

  // Revoke consent
  const revokeConsent = useCallback(() => {
    setHasConsent(false);
    localStorage.removeItem('vision_consent');
    disableVision();
  }, [disableVision]);

  // Load consent from localStorage
  useEffect(() => {
    const storedConsent = localStorage.getItem('vision_consent');
    if (storedConsent === 'true') {
      setHasConsent(true);
    }
  }, []);

  // Simplified detection loop
  // In production, integrate TensorFlow.js face-landmarks-detection or MediaPipe
  const startDetectionLoop = useCallback(() => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
    }

    // For MVP: simulate basic detection
    // Real implementation would use:
    // - @tensorflow-models/face-landmarks-detection for face/gaze
    // - @mediapipe/face_mesh for expressions
    detectionIntervalRef.current = window.setInterval(() => {
      if (!videoRef.current || !canvasRef.current) return;

      const now = Date.now();
      const deltaTime = now - gazeTrackingRef.current.lastUpdate;
      gazeTrackingRef.current.lastUpdate = now;
      gazeTrackingRef.current.totalTime += deltaTime;

      // Simulated detection (placeholder for real ML inference)
      // In real implementation:
      // 1. Draw video frame to canvas
      // 2. Run face detection model
      // 3. Analyze landmarks for gaze direction
      // 4. Classify expression from facial landmarks
      
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, 640, 480);
        
        // Placeholder: In real implementation, analyze the frame
        // For now, we'll set reasonable defaults that indicate face is detected
        const simulatedFaceDetected = true;
        const simulatedOnScreen = Math.random() > 0.1; // 90% on screen

        if (simulatedOnScreen) {
          gazeTrackingRef.current.onScreenTime += deltaTime;
        }

        const gazeRatio = gazeTrackingRef.current.totalTime > 0
          ? gazeTrackingRef.current.onScreenTime / gazeTrackingRef.current.totalTime
          : 1;

        setSignals(prev => {
          const updated: VisionSignals = {
            ...prev,
            enabled: true,
            faceDetected: simulatedFaceDetected,
            gazeDirection: simulatedOnScreen ? 'on-screen' : 'off-screen',
            gazeOnVideoRatio: gazeRatio,
            isLookingAtScreen: simulatedOnScreen,
            // These would come from real ML inference:
            expression: 'neutral',
            blinkRate: 15, // Normal is 15-20 per minute
            distanceFromScreen: 1,
          };
          optionsRef.current.onSignalsUpdate?.(updated);
          return updated;
        });
      }
    }, 500); // 2 FPS for detection (balance between accuracy and performance)
  }, []);

  // Reset signals for new session
  const resetSignals = useCallback(() => {
    gazeTrackingRef.current = {
      onScreenTime: 0,
      totalTime: 0,
      lastUpdate: Date.now(),
    };
    
    if (isEnabled) {
      setSignals(prev => ({
        ...prev,
        gazeOnVideoRatio: 0,
      }));
    } else {
      setSignals(DEFAULT_VISION_SIGNALS);
    }
  }, [isEnabled]);

  return {
    signals,
    isEnabled,
    hasConsent,
    isLoading,
    error,
    enableVision,
    disableVision,
    grantConsent,
    revokeConsent,
    resetSignals,
  };
}
