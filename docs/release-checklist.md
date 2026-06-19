# Release Checklist — `ui/homepage-transformation`

Release-candidate integration status for the homepage + student + team/coach +
auth + Evidence Studio work. Pairs with `docs/deployment-auth-checklist.md`
(env detail) and `docs/preview-qa-checklist.md` (manual QA).

## Integration status

- Branch is **19 commits ahead of `main`, 0 behind**. `main` is an ancestor of
  `HEAD` → integration is a clean **fast-forward, no conflicts**. Nothing to
  rebase/merge; all five workstreams (homepage, student product, team/coach
  assignments, authenticated API, Evidence Studio) are present and intact.

## Test / build status

| Check | Result |
| --- | --- |
| Backend `pytest` | ✅ 1328 passed, 2 skipped |
| Frontend `jest` | ✅ 867 passed |
| `tsc --noEmit` | ✅ clean |
| `next build` (deploy artifact) | ✅ all 19 routes compile |
| Changed-file ESLint | ✅ clean (every commit) |
| Full-project ESLint | ⚠️ 41 **pre-existing** errors in files this branch never touched (see "Known non-blocking") |

## Database migrations

Timestamp-ordered, applied once in order by Supabase. New in this branch:

- **`20260618000000_add_assignments.sql`** — `assignments` + `assignment_recipients`
  tables with RLS (defense-in-depth) + indexes. References existing `teams`,
  `profiles`, `speeches`. Sorts last; no reordering needed.

Notes:
- Like all existing migrations it uses plain `CREATE TABLE` (run-once; not
  re-runnable). Supabase tracks applied migrations, so this is consistent and
  safe for a forward deploy. Do **not** re-run an already-applied migration.
- No data backfill required. The lifecycle/auth changes are code-only on top of
  these tables.

## Production deployment steps

1. **Apply migrations** (the new `20260618000000_add_assignments.sql`).
2. **Backend env** — in addition to existing `SUPABASE_URL` /
   `SUPABASE_SERVICE_ROLE_KEY` / `CORS_ORIGINS` / `OPENAI_API_KEY`:
   - Modern Supabase (asymmetric tokens): nothing extra — JWKS URL + issuer derive
     from `SUPABASE_URL`.
   - Legacy Supabase (HS256): set `SUPABASE_JWT_SECRET` **and**
     `AUTH_ALLOW_HS256_FALLBACK=true`.
   - ⚠️ **Blocker if missing:** without a verifiable key, the authenticated
     assignment/team endpoints return `503` ("Authentication is not configured").
3. **Frontend / Vercel env** — unchanged: `NEXT_PUBLIC_API_URL`,
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Run the **preview QA checklist** (`docs/preview-qa-checklist.md`).

## Environment variable audit

- ✅ Frontend references only public vars (`NEXT_PUBLIC_API_URL`,
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NODE_ENV`).
- ✅ Secrets (`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`) are backend-only;
  no `NEXT_PUBLIC_*` secret exposure (`grep` clean).
- ✅ `.env.example` documents all backend + frontend vars incl. the new auth keys.

## Routes / navigation

All 19 routes build (`/`, `/login`, `/dashboard`, `/session`, `/speech/[id]`,
`/drills/[id]`, `/progress`, `/evidence`, `/learn`, `/team`, `/team/assign`,
`/team/review`, `/team/student`, `/pilot`, `/demo`, `/evals`, `/auth/callback`,
`/share/[token]`, `/_not-found`). Marketing nav/footer are guarded by
`marketing.test.ts` (no dead links, no roadmap copy); stale "coming soon" copy
removed.

## Known non-blocking items

- **Full-project ESLint debt (41 errors, pre-existing):** in untouched files —
  `require()` imports in `debateHelpers.test.ts` (21), unescaped entities, a few
  `any` in `supabase.ts`/demo/share/login, and set-state-in-effect in
  demo/share/login. The build does not run ESLint, so these do not affect the
  deploy. Recommend a separate lint-cleanup PR; not a deployment blocker.
- **No browser-driven screenshot review** available in this environment (offline);
  responsive/contrast verified at the code level only.

## Gate status

- ✅ Integrated with latest main (fast-forward, no conflicts)
- ✅ Tests + build green; changed-file lint green (full-project lint debt documented)
- ✅ Migrations + env vars documented
- ✅ Preview QA checklist provided
- ✅ No unresolved conflicts; one **configuration** prerequisite (auth env) flagged
