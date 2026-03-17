-- =============================================
-- MIGRATION: Open Questions with AI Evaluation (F4-T3)
-- Adds open-ended questions and AI evaluation tracking
-- =============================================

-- Add question_type to video_quizzes to support open-ended inline questions too
ALTER TABLE public.video_quizzes
  ADD COLUMN IF NOT EXISTS question_type TEXT NOT NULL DEFAULT 'multiple_choice'
  CHECK (question_type IN ('multiple_choice', 'open'));

ALTER TABLE public.video_quizzes
  ADD COLUMN IF NOT EXISTS rubric TEXT;

-- Table: open questions (standalone essay-type questions linked to videos)
CREATE TABLE IF NOT EXISTS public.open_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  expected_topics JSONB NOT NULL DEFAULT '[]'::jsonb,
  rubric JSONB DEFAULT '{}'::jsonb,
  min_words INTEGER DEFAULT 20,
  max_words INTEGER DEFAULT 500,
  difficulty TEXT NOT NULL DEFAULT 'medium'
    CHECK (difficulty IN ('easy', 'medium', 'hard')),
  points INTEGER NOT NULL DEFAULT 20,
  question_order INTEGER DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table: student open question responses
CREATE TABLE IF NOT EXISTS public.student_open_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id UUID NOT NULL REFERENCES public.open_questions(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  response_text TEXT NOT NULL,
  word_count INTEGER NOT NULL DEFAULT 0,
  -- AI evaluation fields
  ai_score NUMERIC(5,2),
  ai_feedback TEXT,
  ai_topics_covered JSONB DEFAULT '[]'::jsonb,
  ai_strengths JSONB DEFAULT '[]'::jsonb,
  ai_improvements JSONB DEFAULT '[]'::jsonb,
  ai_model_used TEXT,
  evaluation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (evaluation_status IN ('pending', 'evaluating', 'evaluated', 'error')),
  evaluated_at TIMESTAMP WITH TIME ZONE,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.open_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_open_responses ENABLE ROW LEVEL SECURITY;

-- RLS: open_questions (public read)
CREATE POLICY "Open questions are viewable by authenticated users"
ON public.open_questions FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Admins manage open questions"
ON public.open_questions FOR ALL
USING (public.is_admin());

-- RLS: student_open_responses
CREATE POLICY "Students view own responses"
ON public.student_open_responses FOR SELECT
USING (auth.uid()::text = student_id);

CREATE POLICY "Students submit responses"
ON public.student_open_responses FOR INSERT
WITH CHECK (auth.uid()::text = student_id);

CREATE POLICY "Students update own responses"
ON public.student_open_responses FOR UPDATE
USING (auth.uid()::text = student_id);

CREATE POLICY "Admins manage responses"
ON public.student_open_responses FOR ALL
USING (public.is_admin());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_open_questions_video ON public.open_questions(video_id);
CREATE INDEX IF NOT EXISTS idx_open_questions_active ON public.open_questions(is_active);
CREATE INDEX IF NOT EXISTS idx_open_responses_student ON public.student_open_responses(student_id);
CREATE INDEX IF NOT EXISTS idx_open_responses_question ON public.student_open_responses(question_id);
CREATE INDEX IF NOT EXISTS idx_open_responses_status ON public.student_open_responses(evaluation_status);

-- Triggers
CREATE TRIGGER update_open_questions_updated_at
BEFORE UPDATE ON public.open_questions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_open_responses_updated_at
BEFORE UPDATE ON public.student_open_responses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function: submit and auto-count words
CREATE OR REPLACE FUNCTION public.submit_open_response(
  p_question_id UUID,
  p_student_id TEXT,
  p_response_text TEXT
) RETURNS UUID AS $$
DECLARE
  v_word_count INTEGER;
  v_attempt INTEGER;
  v_response_id UUID;
BEGIN
  -- Count words
  v_word_count := array_length(regexp_split_to_array(trim(p_response_text), '\s+'), 1);

  -- Get attempt number
  SELECT COALESCE(MAX(attempt_number), 0) + 1 INTO v_attempt
  FROM public.student_open_responses
  WHERE question_id = p_question_id AND student_id = p_student_id;

  -- Insert response
  INSERT INTO public.student_open_responses (
    question_id, student_id, response_text, word_count, attempt_number
  ) VALUES (
    p_question_id, p_student_id, p_response_text, v_word_count, v_attempt
  ) RETURNING id INTO v_response_id;

  RETURN v_response_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
