-- =============================================
-- MIGRATION: pgvector Embeddings for RAG (F3-T1)
-- Enables semantic search over video transcripts
-- =============================================

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Table: transcript chunks with embeddings
CREATE TABLE IF NOT EXISTS public.transcript_embeddings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  start_time_seconds NUMERIC(10,2),
  end_time_seconds NUMERIC(10,2),
  embedding vector(1536),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.transcript_embeddings ENABLE ROW LEVEL SECURITY;

-- RLS: authenticated users can read embeddings (needed for search)
CREATE POLICY "Authenticated users can read embeddings"
ON public.transcript_embeddings FOR SELECT
USING (auth.role() = 'authenticated');

-- Service role can manage
CREATE POLICY "Service role can manage embeddings"
ON public.transcript_embeddings FOR ALL
USING (public.is_admin());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_embeddings_video ON public.transcript_embeddings(video_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_chunk ON public.transcript_embeddings(video_id, chunk_index);

-- HNSW index for fast similarity search
CREATE INDEX IF NOT EXISTS idx_embeddings_vector
ON public.transcript_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Function: search similar transcript chunks
CREATE OR REPLACE FUNCTION public.search_transcripts(
  query_embedding vector(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5,
  filter_video_id UUID DEFAULT NULL
) RETURNS TABLE (
  id UUID,
  video_id UUID,
  content TEXT,
  start_time_seconds NUMERIC,
  end_time_seconds NUMERIC,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    te.id,
    te.video_id,
    te.content,
    te.start_time_seconds,
    te.end_time_seconds,
    1 - (te.embedding <=> query_embedding) AS similarity
  FROM public.transcript_embeddings te
  WHERE
    (filter_video_id IS NULL OR te.video_id = filter_video_id)
    AND 1 - (te.embedding <=> query_embedding) > match_threshold
  ORDER BY te.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: get context around a timestamp
CREATE OR REPLACE FUNCTION public.get_transcript_context(
  p_video_id UUID,
  p_timestamp_seconds NUMERIC,
  p_window_seconds NUMERIC DEFAULT 30
) RETURNS TABLE (
  content TEXT,
  start_time_seconds NUMERIC,
  end_time_seconds NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    te.content,
    te.start_time_seconds,
    te.end_time_seconds
  FROM public.transcript_embeddings te
  WHERE
    te.video_id = p_video_id
    AND te.start_time_seconds >= (p_timestamp_seconds - p_window_seconds)
    AND te.end_time_seconds <= (p_timestamp_seconds + p_window_seconds)
  ORDER BY te.start_time_seconds;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
