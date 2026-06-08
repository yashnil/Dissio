-- =============================================================================
-- RoundLab — Evidence-Aware Coach Phase 1
-- Migration: 20260608100000_add_evidence_tables.sql
--
-- IMPORTANT: Before running, create the "documents" storage bucket in the
-- Supabase dashboard (Storage → New bucket → "documents", private).
-- =============================================================================


-- =============================================================================
-- 1. DOCUMENTS
-- Tracks uploaded case/evidence files. File content lives in Supabase Storage
-- at storage_path. status progresses: uploaded → parsed | failed.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.documents (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_id         UUID        REFERENCES public.teams(id) ON DELETE SET NULL,
  filename        TEXT        NOT NULL,
  storage_path    TEXT        NOT NULL,
  doc_type        TEXT        NOT NULL DEFAULT 'case'
                              CHECK (doc_type IN ('case', 'evidence', 'brief', 'other')),
  status          TEXT        NOT NULL DEFAULT 'uploaded'
                              CHECK (status IN ('uploaded', 'parsed', 'failed')),
  file_size_bytes BIGINT,
  page_count      INTEGER,
  error_message   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_documents"
  ON public.documents
  FOR ALL
  USING (auth.uid() = user_id);


-- =============================================================================
-- 2. DOCUMENT_CHUNKS
-- Stores parsed text chunks from a document. Each chunk corresponds to a
-- paragraph or section. The fts column enables PostgreSQL full-text search.
-- embedding_text is reserved for future pgvector support.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.document_chunks (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id     UUID        NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  chunk_text      TEXT        NOT NULL,
  chunk_index     INTEGER     NOT NULL,
  heading         TEXT,
  page_number     INTEGER,
  metadata_json   JSONB       DEFAULT '{}',
  -- Full-text search index: auto-updated generated column
  fts             TSVECTOR    GENERATED ALWAYS AS (to_tsvector('english', chunk_text)) STORED,
  -- Reserved for future pgvector embedding (add VECTOR(1536) in a later migration)
  embedding_text  TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS document_chunks_fts_idx
  ON public.document_chunks USING GIN (fts);

CREATE INDEX IF NOT EXISTS document_chunks_document_idx
  ON public.document_chunks (document_id);

ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_chunks"
  ON public.document_chunks
  FOR ALL
  USING (auth.uid() = user_id);


-- =============================================================================
-- 3. EVIDENCE_CARDS
-- Structured evidence extractions from document chunks.
-- Missing metadata fields (author, source, year) are stored as NULL, never
-- invented. attribution_complete is false when any key field is missing.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.evidence_cards (
  id                   UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id          UUID        NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id              UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  chunk_id             UUID        REFERENCES public.document_chunks(id) ON DELETE SET NULL,
  tag                  TEXT,
  author               TEXT,
  source               TEXT,
  year                 INTEGER,
  card_text            TEXT        NOT NULL,
  claim_summary        TEXT,
  attribution_complete BOOLEAN     NOT NULL DEFAULT FALSE,
  metadata_json        JSONB       DEFAULT '{}',
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS evidence_cards_document_idx
  ON public.evidence_cards (document_id);

ALTER TABLE public.evidence_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_cards"
  ON public.evidence_cards
  FOR ALL
  USING (auth.uid() = user_id);


-- =============================================================================
-- 4. CLAIM_EVIDENCE_CHECKS
-- Records whether each argument's cited evidence is supported by uploaded cards.
-- support_level choices: supported | partially_supported | unsupported | unverifiable
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.claim_evidence_checks (
  id                        UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  speech_id                 UUID        NOT NULL REFERENCES public.speeches(id) ON DELETE CASCADE,
  user_id                   UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  argument_label            TEXT,
  claim_text                TEXT        NOT NULL,
  evidence_text_from_speech TEXT,
  matched_card_id           UUID        REFERENCES public.evidence_cards(id) ON DELETE SET NULL,
  support_level             TEXT        CHECK (support_level IN (
                              'supported', 'partially_supported', 'unsupported', 'unverifiable'
                            )),
  explanation               TEXT,
  created_at                TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS claim_checks_speech_idx
  ON public.claim_evidence_checks (speech_id);

ALTER TABLE public.claim_evidence_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_claim_checks"
  ON public.claim_evidence_checks
  FOR ALL
  USING (auth.uid() = user_id);
