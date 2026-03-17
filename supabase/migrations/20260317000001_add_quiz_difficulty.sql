-- =============================================
-- MIGRATION: Adaptive Quiz Difficulty (F2-T1)
-- Adds difficulty levels and adaptive fields to quiz system
-- =============================================

-- Add difficulty and category fields to video_quizzes
ALTER TABLE public.video_quizzes
  ADD COLUMN IF NOT EXISTS difficulty TEXT NOT NULL DEFAULT 'medium'
    CHECK (difficulty IN ('easy', 'medium', 'hard')),
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS hint TEXT,
  ADD COLUMN IF NOT EXISTS time_limit_seconds INTEGER DEFAULT 30,
  ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 10;

-- Documentation
COMMENT ON COLUMN public.video_quizzes.difficulty IS 'Quiz difficulty: easy, medium, hard. Used for adaptive quiz selection based on student performance.';

-- Track per-student difficulty adaptation
CREATE TABLE IF NOT EXISTS public.student_quiz_performance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id TEXT NOT NULL,
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  current_difficulty TEXT NOT NULL DEFAULT 'medium'
    CHECK (current_difficulty IN ('easy', 'medium', 'hard')),
  consecutive_correct INTEGER NOT NULL DEFAULT 0,
  consecutive_wrong INTEGER NOT NULL DEFAULT 0,
  total_attempts INTEGER NOT NULL DEFAULT 0,
  total_correct INTEGER NOT NULL DEFAULT 0,
  avg_response_time_ms INTEGER,
  last_attempt_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(student_id, video_id)
);

-- Enable RLS
ALTER TABLE public.student_quiz_performance ENABLE ROW LEVEL SECURITY;

-- RLS: students see their own performance
CREATE POLICY "Students view own quiz performance"
ON public.student_quiz_performance FOR SELECT
USING (auth.uid()::text = student_id);

CREATE POLICY "Students insert own quiz performance"
ON public.student_quiz_performance FOR INSERT
WITH CHECK (auth.uid()::text = student_id);

CREATE POLICY "Students update own quiz performance"
ON public.student_quiz_performance FOR UPDATE
USING (auth.uid()::text = student_id);

-- Admins full access
CREATE POLICY "Admins manage quiz performance"
ON public.student_quiz_performance FOR ALL
USING (public.is_admin());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_quizzes_difficulty ON public.video_quizzes(difficulty);
CREATE INDEX IF NOT EXISTS idx_quiz_perf_student ON public.student_quiz_performance(student_id);
CREATE INDEX IF NOT EXISTS idx_quiz_perf_video ON public.student_quiz_performance(video_id);

-- Trigger
CREATE TRIGGER update_quiz_performance_updated_at
BEFORE UPDATE ON public.student_quiz_performance
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function: get next quiz difficulty based on student performance
CREATE OR REPLACE FUNCTION public.get_adaptive_difficulty(
  p_student_id TEXT,
  p_video_id UUID
) RETURNS TEXT AS $$
DECLARE
  v_perf RECORD;
BEGIN
  SELECT * INTO v_perf
  FROM public.student_quiz_performance
  WHERE student_id = p_student_id AND video_id = p_video_id;

  IF NOT FOUND THEN
    RETURN 'medium';
  END IF;

  -- Promote after 3 consecutive correct
  IF v_perf.consecutive_correct >= 3 THEN
    CASE v_perf.current_difficulty
      WHEN 'easy' THEN RETURN 'medium';
      WHEN 'medium' THEN RETURN 'hard';
      ELSE RETURN 'hard';
    END CASE;
  END IF;

  -- Demote after 2 consecutive wrong
  IF v_perf.consecutive_wrong >= 2 THEN
    CASE v_perf.current_difficulty
      WHEN 'hard' THEN RETURN 'medium';
      WHEN 'medium' THEN RETURN 'easy';
      ELSE RETURN 'easy';
    END CASE;
  END IF;

  RETURN v_perf.current_difficulty;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
