import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface TeachingMoment {
  timestamp_seconds: number;
  topic: string;
  key_insight: string;
  questions_to_ask: string[];
  discussion_points: string[];
}

export interface ContentPlan {
  teaching_moments: TeachingMoment[];
  summary: string;
}

interface UseContentManagerOptions {
  onPlanReady?: (plan: ContentPlan) => void;
  onError?: (error: string) => void;
}

export function useContentManager(options: UseContentManagerOptions = {}) {
  const [isLoading, setIsLoading] = useState(false);
  const [contentPlan, setContentPlan] = useState<ContentPlan | null>(null);
  const [currentMomentIndex, setCurrentMomentIndex] = useState<number>(-1);

  // Load pre-configured teaching moments from database
  const loadPreConfiguredMoments = useCallback((moments: TeachingMoment[]) => {
    if (moments && moments.length > 0) {
      const plan: ContentPlan = {
        teaching_moments: moments,
        summary: 'Momentos de ensino pré-configurados',
      };
      setContentPlan(plan);
      setCurrentMomentIndex(-1);
      options.onPlanReady?.(plan);
      return plan;
    }
    return null;
  }, [options]);

  // Analyze content via AI (fallback if no pre-configured moments)
  const analyzeContent = useCallback(async (
    transcript: string | null,
    title: string,
    analysis?: string,
    preConfiguredMoments?: TeachingMoment[] | null
  ) => {
    console.log('[ContentManager] analyzeContent called:', {
      hasTranscript: !!transcript,
      transcriptLength: transcript?.length || 0,
      title,
      hasAnalysis: !!analysis,
      preConfiguredMomentsCount: preConfiguredMoments?.length || 0
    });

    // If we have pre-configured moments (not empty array), use them
    if (preConfiguredMoments && preConfiguredMoments.length > 0) {
      console.log('[ContentManager] Using pre-configured moments:', preConfiguredMoments.length);
      const plan = loadPreConfiguredMoments(preConfiguredMoments);
      if (plan) {
        toast.success(`📚 ${plan.teaching_moments.length} momentos de ensino carregados`);
        return plan;
      }
    }

    // No pre-configured moments, need transcript or analysis to generate via AI
    if (!transcript && !analysis) {
      console.log('[ContentManager] No content to analyze, skipping');
      return null;
    }

    console.log('[ContentManager] Calling AI to generate teaching moments...');
    setIsLoading(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('content-manager', {
        body: { transcript, title, analysis }
      });

      if (error) {
        console.error('[ContentManager] Edge function error:', error);
        // Check if it's a rate limit error - fail silently
        if (error.message?.includes('429') || error.message?.includes('rate limit')) {
          console.warn('[ContentManager] Rate limited, skipping AI analysis');
          return null;
        }
        throw error;
      }

      console.log('[ContentManager] AI response received:', data);
      const plan: ContentPlan = data;
      setContentPlan(plan);
      setCurrentMomentIndex(-1);
      options.onPlanReady?.(plan);
      
      toast.success(`📚 Plano de aula criado: ${plan.teaching_moments.length} momentos-chave identificados`);
      
      return plan;
    } catch (error) {
      console.error('[ContentManager] AI analysis failed:', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [options, loadPreConfiguredMoments]);

  const getCurrentMoment = useCallback((): TeachingMoment | null => {
    if (!contentPlan || currentMomentIndex < 0 || currentMomentIndex >= contentPlan.teaching_moments.length) {
      return null;
    }
    return contentPlan.teaching_moments[currentMomentIndex];
  }, [contentPlan, currentMomentIndex]);

  const getNextMoment = useCallback((): TeachingMoment | null => {
    if (!contentPlan) return null;
    
    const nextIndex = currentMomentIndex + 1;
    if (nextIndex < contentPlan.teaching_moments.length) {
      return contentPlan.teaching_moments[nextIndex];
    }
    return null;
  }, [contentPlan, currentMomentIndex]);

  const advanceToNextMoment = useCallback(() => {
    if (!contentPlan) return null;
    
    const nextIndex = currentMomentIndex + 1;
    if (nextIndex < contentPlan.teaching_moments.length) {
      setCurrentMomentIndex(nextIndex);
      return contentPlan.teaching_moments[nextIndex];
    }
    return null;
  }, [contentPlan, currentMomentIndex]);

  const resetMoments = useCallback(() => {
    setCurrentMomentIndex(-1);
  }, []);

  const checkForTeachingMoment = useCallback((currentTimeSeconds: number): TeachingMoment | null => {
    if (!contentPlan) return null;
    
    // Find if we've reached any teaching moment (within 3 seconds tolerance)
    for (let i = currentMomentIndex + 1; i < contentPlan.teaching_moments.length; i++) {
      const moment = contentPlan.teaching_moments[i];
      const timeDiff = currentTimeSeconds - moment.timestamp_seconds;
      
      // If we're within 3 seconds after the timestamp
      if (timeDiff >= 0 && timeDiff <= 3) {
        setCurrentMomentIndex(i);
        return moment;
      }
    }
    
    return null;
  }, [contentPlan, currentMomentIndex]);

  const generateTeacherInstructions = useCallback((moment: TeachingMoment): string => {
    return `
🎯 MOMENTO DE APROFUNDAMENTO - ${moment.topic}

INSTRUÇÃO PARA O PROFESSOR IA:
Pause o vídeo AGORA e explore este conceito com o aluno.

INSIGHT PRINCIPAL:
${moment.key_insight}

PERGUNTAS PARA FAZER AO ALUNO:
${moment.questions_to_ask.map((q, i) => `${i + 1}. ${q}`).join('\n')}

${moment.discussion_points?.length > 0 ? `PONTOS DE DISCUSSÃO:
${moment.discussion_points.map((p) => `• ${p}`).join('\n')}` : ''}

Após explorar este momento, pergunte ao aluno se está pronto para continuar o vídeo.
`;
  }, []);

  return {
    isLoading,
    contentPlan,
    currentMomentIndex,
    loadPreConfiguredMoments,
    analyzeContent,
    getCurrentMoment,
    getNextMoment,
    advanceToNextMoment,
    resetMoments,
    checkForTeachingMoment,
    generateTeacherInstructions,
  };
}
