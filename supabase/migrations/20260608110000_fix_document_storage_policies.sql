-- =============================================================================
-- RoundLab — Fix: Evidence document storage bucket policies
-- Migration: 20260608110000_fix_document_storage_policies.sql
--
-- Root cause: the "documents" Supabase Storage bucket is private.
-- Private buckets require explicit storage.objects RLS policies.
-- Without them the browser client (anon key + user JWT) cannot upload,
-- producing "new row violates row-level security policy".
--
-- The audio bucket avoids this because it was configured as public in
-- the dashboard. The documents bucket is private (intentional), so
-- upload/read/delete policies must be added here.
--
-- Path convention: {user_id}/{timestamp}_{filename}
-- Policy predicate: (storage.foldername(name))[1] = auth.uid()::text
-- This ensures each user can only access their own subfolder.
-- =============================================================================


-- ── INSERT: authenticated users may upload to their own subfolder ──────────────

CREATE POLICY "docs_storage_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );


-- ── SELECT: authenticated users may read/download their own files ─────────────

CREATE POLICY "docs_storage_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );


-- ── DELETE: authenticated users may remove their own files ────────────────────

CREATE POLICY "docs_storage_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );


-- ── UPDATE: allow authenticated users to replace their own files (upsert) ─────
-- Not required by current frontend (upsert: false), included for future use.

CREATE POLICY "docs_storage_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
