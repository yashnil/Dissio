-- Pass 23 — Full Round audit fix: disclose deterministic AI-opponent fallback.
--
-- opponent_speech_generator.py already distinguishes a real LLM-generated
-- speech from a deterministic template fallback (OpponentSpeechResult.is_fallback),
-- but the flag was never persisted, so the UI could not tell a student when a
-- speech was template text rather than a generated response. This column closes
-- that gap without changing any generation behavior.

alter table round_speeches
  add column if not exists is_fallback boolean not null default false;
