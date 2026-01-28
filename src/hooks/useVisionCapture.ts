// Hook for capturing video frames from webcam for AI vision analysis
import { useRef, useCallback, useEffect, useState } from 'react';

interface UseVisionCaptureOptions {
  enabled?: boolean;
  captureIntervalMs?: number; // How often to capture frames (default: 3000ms)
  quality?: number; // JPEG quality 0-1 (default: 0.6)
  maxWidth?: number; // Max image width (default: 640)
  onFrame?: (base64Image: string) => void;
  onError?: (error: string) => void;
}

export function useVisionCapture(options: UseVisionCaptureOptions = {}) {
  const {
    enabled = false,
    captureIntervalMs = 3000, // Every 3 seconds
    quality = 0.6,
    maxWidth = 640,
    onFrame,
    onError,
  } = options;

  const [isCapturing, setIsCapturing] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [lastCaptureTime, setLastCaptureTime] = useState<number | null>(null);
  
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const intervalRef = useRef<number | null>(null);
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  // Create hidden video and canvas elements for capture
  useEffect(() => {
    if (!videoRef.current) {
      const video = document.createElement('video');
      video.setAttribute('playsinline', 'true');
      video.setAttribute('autoplay', 'true');
      video.muted = true;
      video.style.display = 'none';
      document.body.appendChild(video);
      videoRef.current = video;
    }

    if (!canvasRef.current) {
      const canvas = document.createElement('canvas');
      canvas.style.display = 'none';
      document.body.appendChild(canvas);
      canvasRef.current = canvas;
    }

    return () => {
      if (videoRef.current) {
        videoRef.current.remove();
        videoRef.current = null;
      }
      if (canvasRef.current) {
        canvasRef.current.remove();
        canvasRef.current = null;
      }
    };
  }, []);

  // Capture a single frame
  const captureFrame = useCallback((): string | null => {
    if (!videoRef.current || !canvasRef.current) return null;
    if (!streamRef.current || !streamRef.current.active) return null;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video.readyState < 2) return null; // Not ready

    // Calculate dimensions maintaining aspect ratio
    const aspectRatio = video.videoHeight / video.videoWidth;
    const width = Math.min(video.videoWidth, maxWidth);
    const height = Math.round(width * aspectRatio);

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0, width, height);

    // Convert to base64 JPEG
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const base64 = dataUrl.split(',')[1]; // Remove data URL prefix

    return base64;
  }, [maxWidth, quality]);

  // Start capturing
  const startCapture = useCallback(async (existingStream?: MediaStream) => {
    if (isCapturing) return true;

    try {
      // Use existing stream or request new one
      if (existingStream && existingStream.active) {
        streamRef.current = existingStream;
      } else {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: maxWidth },
            height: { ideal: Math.round(maxWidth * 0.75) },
            facingMode: 'user',
          },
        });
        streamRef.current = stream;
      }

      setHasPermission(true);

      // Connect stream to video element
      if (videoRef.current && streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
        await videoRef.current.play();
      }

      // Start capture interval
      intervalRef.current = window.setInterval(() => {
        const frame = captureFrame();
        if (frame) {
          setLastCaptureTime(Date.now());
          optionsRef.current.onFrame?.(frame);
        }
      }, captureIntervalMs);

      // Capture first frame immediately
      setTimeout(() => {
        const frame = captureFrame();
        if (frame) {
          setLastCaptureTime(Date.now());
          optionsRef.current.onFrame?.(frame);
        }
      }, 500);

      setIsCapturing(true);
      console.log('[VisionCapture] Started capturing frames every', captureIntervalMs, 'ms');
      return true;

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to access camera';
      console.error('[VisionCapture] Error:', err);
      optionsRef.current.onError?.(message);
      return false;
    }
  }, [isCapturing, maxWidth, captureIntervalMs, captureFrame]);

  // Stop capturing
  const stopCapture = useCallback((stopStream = false) => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (stopStream && streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsCapturing(false);
    console.log('[VisionCapture] Stopped capturing');
  }, []);

  // Auto-start/stop based on enabled prop
  useEffect(() => {
    if (enabled && !isCapturing) {
      startCapture();
    } else if (!enabled && isCapturing) {
      stopCapture();
    }
  }, [enabled, isCapturing, startCapture, stopCapture]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCapture(true);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Manual capture (for on-demand use)
  const captureNow = useCallback((): string | null => {
    const frame = captureFrame();
    if (frame) {
      setLastCaptureTime(Date.now());
    }
    return frame;
  }, [captureFrame]);

  return {
    isCapturing,
    hasPermission,
    lastCaptureTime,
    startCapture,
    stopCapture,
    captureNow,
    stream: streamRef.current,
  };
}
