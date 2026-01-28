import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface TeachingMoment {
  timestamp_seconds: number;
  topic: string;
  key_insight: string;
  questions_to_ask: string[];
  discussion_points: string[];
  teaching_approach?: string;
  difficulty_level?: 'básico' | 'intermediário' | 'avançado';
  estimated_discussion_minutes?: number;
}

export interface ContentPlan {
  teaching_moments: TeachingMoment[];
  summary: string;
  lesson_objectives?: string[];
  prerequisites?: string[];
  total_estimated_pauses?: number;
  recommended_pace?: 'lento' | 'moderado' | 'rápido';
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
        total_estimated_pauses: moments.length,
      };
      setContentPlan(plan);
      setCurrentMomentIndex(-1);
      options.onPlanReady?.(plan);
      return plan;
    }
    return null;
  }, [options]);

  // Save teaching moments to database
  const saveTeachingMomentsToDatabase = useCallback(async (
    videoId: string,
    moments: TeachingMoment[]
  ): Promise<boolean> => {
    try {
      console.log('[ContentManager] Saving teaching moments to database for video:', videoId);
      
      // Convert TeachingMoment[] to JSON-compatible format
      const momentsAsJson = moments.map(m => ({
        timestamp_seconds: m.timestamp_seconds,
        topic: m.topic,
        key_insight: m.key_insight,
        questions_to_ask: m.questions_to_ask,
        discussion_points: m.discussion_points,
        teaching_approach: m.teaching_approach,
        difficulty_level: m.difficulty_level,
        estimated_discussion_minutes: m.estimated_discussion_minutes,
      }));
      
      // Update the video with teaching_moments
      const { error: updateError } = await supabase
        .from('videos')
        .update({ 
          teaching_moments: momentsAsJson,
          is_configured: true 
        })
        .eq('id', videoId);

      if (updateError) {
        console.error('[ContentManager] Failed to save teaching moments:', updateError);
        return false;
      }

      console.log('[ContentManager] Teaching moments saved successfully');
      return true;
    } catch (error) {
      console.error('[ContentManager] Error saving teaching moments:', error);
      return false;
    }
  }, []);

  // Analyze content via AI (fallback if no pre-configured moments)
  const analyzeContent = useCallback(async (
    transcript: string | null,
    title: string,
    analysis?: string,
    preConfiguredMoments?: TeachingMoment[] | null,
    videoDurationMinutes?: number,
    videoId?: string,
    autoSave: boolean = true
  ) => {
    console.log('[ContentManager] analyzeContent called:', {
      hasTranscript: !!transcript,
      transcriptLength: transcript?.length || 0,
      title,
      hasAnalysis: !!analysis,
      preConfiguredMomentsCount: preConfiguredMoments?.length || 0,
      videoDurationMinutes,
      videoId,
      autoSave
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

    console.log('[ContentManager] Calling AI Content Agent to analyze lesson...');
    setIsLoading(true);
    toast.info('🤖 Agente de conteúdo analisando a aula...', { duration: 3000 });
    
    try {
      const { data, error } = await supabase.functions.invoke('content-manager', {
        body: { 
          transcript, 
          title, 
          analysis,
          videoDurationMinutes: videoDurationMinutes || 10
        }
      });

      if (error) {
        console.error('[ContentManager] Edge function error:', error);
        // Check if it's a rate limit error - fail silently
        if (error.message?.includes('429') || error.message?.includes('rate limit')) {
          console.warn('[ContentManager] Rate limited, skipping AI analysis');
          toast.warning('Taxa de uso excedida. Tente novamente em alguns segundos.');
          return null;
        }
        throw error;
      }

      console.log('[ContentManager] AI Content Agent response:', data);
      const plan: ContentPlan = data;
      setContentPlan(plan);
      setCurrentMomentIndex(-1);
      options.onPlanReady?.(plan);
      
      // Auto-save teaching moments to database if videoId is provided
      if (autoSave && videoId && plan.teaching_moments.length > 0) {
        const saved = await saveTeachingMomentsToDatabase(videoId, plan.teaching_moments);
        if (saved) {
          toast.success(
            `💾 ${plan.teaching_moments.length} momentos salvos automaticamente no banco`,
            { duration: 3000 }
          );
        }
      }
      
      const paceText = plan.recommended_pace === 'lento' ? '🐢 ritmo lento' : 
                       plan.recommended_pace === 'rápido' ? '🚀 ritmo rápido' : '⚡ ritmo moderado';
      
      toast.success(
        `📚 Plano de aula criado: ${plan.teaching_moments.length} pausas estratégicas (${paceText})`,
        { duration: 5000 }
      );
      
      return plan;
    } catch (error) {
      console.error('[ContentManager] AI analysis failed:', error);
      toast.error('Erro ao analisar conteúdo da aula');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [options, loadPreConfiguredMoments, saveTeachingMomentsToDatabase]);

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
    // Get just the FIRST question to ask
    const firstQuestion = moment.questions_to_ask[0] || 'O que você entendeu deste conceito?';
    const remainingQuestions = moment.questions_to_ask.slice(1);
    
    return `
MOMENTO DE APROFUNDAMENTO - ${moment.topic}

REGRA CRÍTICA - UMA PERGUNTA POR VEZ:
Você DEVE fazer APENAS UMA pergunta e ESPERAR a resposta do aluno antes de continuar.
NÃO faça múltiplas perguntas seguidas. Isso é proibido.

INSIGHT PRINCIPAL:
${moment.key_insight}

INSTRUÇÃO:
1. Explique brevemente o insight principal (2-3 frases no máximo)
2. Faça APENAS esta pergunta e PARE de falar: "${firstQuestion}"
3. AGUARDE em silêncio a resposta do aluno
4. Só depois da resposta, responda ao aluno e faça a próxima pergunta SE necessário

${remainingQuestions.length > 0 ? `PERGUNTAS ADICIONAIS (use apenas se necessário, uma por vez):
${remainingQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}` : ''}

${moment.discussion_points?.length > 0 ? `PONTOS PARA APROFUNDAR (apenas se o aluno demonstrar interesse):
${moment.discussion_points.map((p) => `- ${p}`).join('\n')}` : ''}

APÓS a conversa, pergunte: "Pronto para continuar o vídeo?"
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
