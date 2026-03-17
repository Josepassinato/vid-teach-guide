-- =============================================
-- MIGRATION: Gamification Enhancements (F4-T2)
-- Adds leaderboard views, XP events, badge definitions
-- =============================================

-- Table: XP events log (audit trail of all points earned)
CREATE TABLE IF NOT EXISTS public.xp_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'quiz_correct', 'quiz_perfect', 'mission_complete',
    'streak_bonus', 'first_login', 'video_complete',
    'badge_earned', 'squad_bonus', 'daily_goal'
  )),
  points INTEGER NOT NULL,
  source_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table: badge definitions (catalog of available badges)
CREATE TABLE IF NOT EXISTS public.badge_definitions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon_url TEXT,
  category TEXT NOT NULL DEFAULT 'general' CHECK (category IN (
    'general', 'quiz', 'mission', 'streak', 'social', 'mastery'
  )),
  criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  points_reward INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table: student badges earned (many-to-many)
CREATE TABLE IF NOT EXISTS public.student_badges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id TEXT NOT NULL,
  badge_id UUID NOT NULL REFERENCES public.badge_definitions(id) ON DELETE CASCADE,
  earned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(student_id, badge_id)
);

-- Enable RLS
ALTER TABLE public.xp_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badge_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_badges ENABLE ROW LEVEL SECURITY;

-- RLS: xp_events
CREATE POLICY "Students view own XP events"
ON public.xp_events FOR SELECT
USING (auth.uid()::text = student_id);

CREATE POLICY "System inserts XP events"
ON public.xp_events FOR INSERT
WITH CHECK (auth.uid()::text = student_id);

CREATE POLICY "Admins manage XP events"
ON public.xp_events FOR ALL
USING (public.is_admin());

-- RLS: badge_definitions (public read)
CREATE POLICY "Badge definitions are public"
ON public.badge_definitions FOR SELECT
USING (true);

CREATE POLICY "Admins manage badge definitions"
ON public.badge_definitions FOR ALL
USING (public.is_admin());

-- RLS: student_badges
CREATE POLICY "Students view own badges"
ON public.student_badges FOR SELECT
USING (auth.uid()::text = student_id);

CREATE POLICY "System awards badges"
ON public.student_badges FOR INSERT
WITH CHECK (auth.uid()::text = student_id);

CREATE POLICY "Admins manage student badges"
ON public.student_badges FOR ALL
USING (public.is_admin());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_xp_events_student ON public.xp_events(student_id);
CREATE INDEX IF NOT EXISTS idx_xp_events_type ON public.xp_events(event_type);
CREATE INDEX IF NOT EXISTS idx_xp_events_created ON public.xp_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_badges_student ON public.student_badges(student_id);
CREATE INDEX IF NOT EXISTS idx_badges_category ON public.badge_definitions(category);

-- View: leaderboard (top students by XP)
CREATE OR REPLACE VIEW public.leaderboard AS
SELECT
  sa.student_id,
  sa.total_points,
  sa.level,
  sa.current_streak,
  sa.missions_completed,
  sa.average_score,
  RANK() OVER (ORDER BY sa.total_points DESC) AS rank_position
FROM public.student_achievements sa
WHERE sa.last_activity_at >= NOW() - INTERVAL '30 days'
ORDER BY sa.total_points DESC;

-- Function: award XP and update achievements atomically
CREATE OR REPLACE FUNCTION public.award_xp(
  p_student_id TEXT,
  p_event_type TEXT,
  p_points INTEGER,
  p_source_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB AS $$
DECLARE
  v_new_total INTEGER;
  v_new_level INTEGER;
  v_result JSONB;
BEGIN
  -- Insert XP event
  INSERT INTO public.xp_events (student_id, event_type, points, source_id, metadata)
  VALUES (p_student_id, p_event_type, p_points, p_source_id, p_metadata);

  -- Upsert achievements
  INSERT INTO public.student_achievements (student_id, total_points, last_activity_at)
  VALUES (p_student_id, p_points, NOW())
  ON CONFLICT (student_id) DO UPDATE
  SET
    total_points = student_achievements.total_points + p_points,
    last_activity_at = NOW(),
    updated_at = NOW();

  -- Get new totals
  SELECT total_points INTO v_new_total
  FROM public.student_achievements
  WHERE student_id = p_student_id;

  -- Calculate level (100 XP per level)
  v_new_level := GREATEST(1, (v_new_total / 100) + 1);

  -- Update level
  UPDATE public.student_achievements
  SET level = v_new_level
  WHERE student_id = p_student_id AND level != v_new_level;

  v_result := jsonb_build_object(
    'total_points', v_new_total,
    'level', v_new_level,
    'points_awarded', p_points
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Seed: default badge definitions
INSERT INTO public.badge_definitions (slug, name, description, category, criteria, points_reward)
VALUES
  ('first_quiz', 'Primeiro Quiz', 'Completou o primeiro quiz', 'quiz',
   '{"type": "quiz_count", "threshold": 1}'::jsonb, 10),
  ('quiz_master', 'Mestre dos Quizzes', 'Acertou 50 quizzes', 'quiz',
   '{"type": "quiz_correct_count", "threshold": 50}'::jsonb, 100),
  ('perfect_score', 'Nota Perfeita', 'Tirou 100% em um quiz', 'quiz',
   '{"type": "quiz_perfect", "threshold": 1}'::jsonb, 25),
  ('first_mission', 'Primeira Missão', 'Completou a primeira missão', 'mission',
   '{"type": "mission_count", "threshold": 1}'::jsonb, 15),
  ('mission_veteran', 'Veterano de Missões', 'Completou 20 missões', 'mission',
   '{"type": "mission_count", "threshold": 20}'::jsonb, 150),
  ('streak_3', 'Em Chamas!', 'Manteve um streak de 3 dias', 'streak',
   '{"type": "streak", "threshold": 3}'::jsonb, 30),
  ('streak_7', 'Dedicação Semanal', 'Manteve um streak de 7 dias', 'streak',
   '{"type": "streak", "threshold": 7}'::jsonb, 75),
  ('streak_30', 'Consistência Inabalável', 'Manteve um streak de 30 dias', 'streak',
   '{"type": "streak", "threshold": 30}'::jsonb, 500)
ON CONFLICT (slug) DO NOTHING;
