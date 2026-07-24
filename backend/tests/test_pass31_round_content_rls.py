"""
Pass 31 — Phase 10D: Participant-aware round-content RLS.

Closes the gap documented in docs/REALTIME_AUTHORIZATION_PHASE10C.md: round
content tables (speeches, crossfire exchanges, coach notes, etc.) had SELECT
policies keyed only on round_simulations.user_id, even though the Python API
(_load_round_access) has let any *joined* room participant read them since
Phase 9A. This migration adds new, additive SELECT policies alongside the
existing ones -- nothing removed, no write policy touched.

Like test_pass21p4_rls_enforcement.py, this file has two independent halves:

1. Static migration-text analysis (no DB required, always runs) -- verifies
   the migration SQL itself satisfies the security invariants (SECURITY
   DEFINER, empty search_path, REVOKE/GRANT, additive-only, no invite_code
   involvement, no existing policy dropped).

2. Live RLS tests against a real local Supabase stack (requires
   `bash scripts/setup_local_test_env.sh`; gracefully SKIP -- not fail --
   when no local stack is configured, exactly like the Pass 21.4 precedent).
   These are the repo's first RLS tests scoped to Full Round specifically,
   and they do not merely re-exercise the Python service-role permission
   helpers already covered by test_round_rooms.py -- they hit PostgREST
   directly with real user JWTs and no service-role key, so RLS is the only
   thing standing between the request and the data.
"""

from __future__ import annotations

import os
import re
import sys
import uuid
import pytest
import requests
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

MIGRATIONS_DIR = ROOT.parent / "supabase" / "migrations"
MIGRATION_FILE = "20260724000000_pass31_round_content_participant_rls.sql"

# Pass 32: found live by this file's own test_joined_non_coach_participant_
# cannot_write (see class TestRoundCoachAnnotationsRLS below) -- the Pass 17
# round_coach_annotations policy had no WITH CHECK, so its USING clause
# (coach_id = auth.uid() OR round owner) doubled as the write check, which
# any authenticated user could satisfy by just self-declaring coach_id.
FIX_MIGRATION_FILE = "20260724010000_pass32_coach_annotations_write_check.sql"

# Pass 33: the same bug class swept across every other Pass 16/17 Full Round
# table -- round_finding_ratings had the identical shape (FOR ALL USING
# (rater_id = auth.uid()), no WITH CHECK) but *worse*: no owner-fallback
# clause at all, so round_id was never verified against any real
# relationship whatsoever.
FIX_MIGRATION_2_FILE = "20260724020000_pass33_finding_ratings_write_check.sql"

# Every Full Round migration touching an authenticated-facing policy --
# scanned by TestWriteCheckSweep below for the same bug class.
ALL_ROUND_MIGRATION_FILES = [
    "20260623020000_pass16_round_simulation.sql",
    "20260623025000_pass16_round_legality.sql",
    "20260623040000_pass17_round_quality.sql",
    "20260721040000_pass26_round_drill_attempts.sql",
    "20260721050000_pass27_round_rooms.sql",
    MIGRATION_FILE,
    FIX_MIGRATION_FILE,
    FIX_MIGRATION_2_FILE,
]

# ── Local Supabase defaults (same values as test_pass21p4_rls_enforcement.py) ─

_LOCAL_URL = "http://127.0.0.1:54321"
_LOCAL_ANON = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    ".eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9"
    ".CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
)
_LOCAL_SERVICE = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    ".eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0"
    ".EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
)

SUPABASE_URL = os.environ.get("SUPABASE_URL", _LOCAL_URL)
ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", _LOCAL_ANON)
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", _LOCAL_SERVICE)

# Stable seeded UUIDs (from scripts/setup_local_test_env.sh) -- reused as-is;
# this file provisions its own round/room/participant rows and never touches
# other tests' seed data or user accounts.
STUDENT_A = "00000000-0000-0000-0001-000000000001"  # round owner in these tests
STUDENT_B = "00000000-0000-0000-0001-000000000002"  # joined participant
COACH_A = "00000000-0000-0000-0002-000000000001"    # joined role='coach' participant (Pass 32 tests)
COACH_B = "00000000-0000-0000-0002-000000000002"    # unrelated / non-member

PASSWORD = "Dissio_Test1!"


def _is_local_url(url: str) -> bool:
    """Only http(s)://localhost:54321 / 127.0.0.1:54321 are ever contacted --
    remote/placeholder Supabase URLs never receive a network request."""
    try:
        parsed = urlparse(url)
        hostname = (parsed.hostname or "").lower()
        port = parsed.port
    except Exception:
        return False
    return hostname in {"localhost", "127.0.0.1", "::1"} and port == 54321


def _is_local_supabase_running() -> bool:
    if not _is_local_url(SUPABASE_URL):
        return False
    try:
        resp = requests.get(f"{SUPABASE_URL}/auth/v1/health", timeout=3)
        return resp.status_code == 200
    except Exception:
        return False


def _is_dissio_schema_present() -> bool:
    """Dev machines commonly run more than one local Supabase stack (Docker
    containers are named per-project, but every project defaults to the
    same well-known ports: 54321 etc.) -- a health check alone can't tell
    Dissio's stack apart from a different project's. This checks that the
    schema actually being served is Dissio's by looking for round_simulations
    specifically, so live tests skip cleanly instead of erroring against the
    wrong project's database."""
    if not _is_local_url(SUPABASE_URL):
        return False
    try:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/round_simulations",
            headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"},
            params={"limit": "0"},
            timeout=3,
        )
        return resp.status_code in (200, 206)
    except Exception:
        return False


def _sign_in(email: str) -> str:
    resp = requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": ANON_KEY, "Content-Type": "application/json"},
        json={"email": email, "password": PASSWORD},
        timeout=5,
    )
    data = resp.json()
    token = data.get("access_token")
    if not token:
        raise RuntimeError(f"Sign-in failed for {email}: {data.get('msg', data)}")
    return token


def _rest_get(token: str | None, table: str, params: dict) -> list[dict]:
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = {"apikey": ANON_KEY}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    resp = requests.get(url, headers=headers, params=params, timeout=5)
    if resp.status_code not in (200, 206):
        return []
    body = resp.json()
    return body if isinstance(body, list) else []


def _rest_write(token: str, method: str, table: str, data: dict, params: dict | None = None) -> int:
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = {
        "apikey": ANON_KEY,
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    resp = requests.request(method, url, headers=headers, json=data, params=params or {}, timeout=5)
    return resp.status_code


def _service_get(table: str, params: dict) -> list[dict]:
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}
    resp = requests.get(url, headers=headers, params=params, timeout=5)
    if resp.status_code not in (200, 206):
        return []
    body = resp.json()
    return body if isinstance(body, list) else []


def _service_insert(table: str, row: dict) -> None:
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    resp = requests.post(url, headers=headers, json=row, timeout=5)
    assert resp.status_code in (200, 201, 204), f"Fixture insert into {table} failed: {resp.status_code} {resp.text}"


# Unlike test_pass21p4_rls_enforcement.py (which fails rather than skips
# when a local URL is configured but unreachable), this gate also skips
# when *something* answers on the well-known local port but it isn't
# Dissio's schema -- a real, benign state on a shared dev machine where
# another project's Supabase stack happens to be running on the same
# default ports (see the Phase 10D report for how this was discovered).
_requires_local = pytest.mark.skipif(
    not _is_dissio_schema_present(),
    reason=(
        f"Live RLS integration tests require Dissio's own local Supabase stack "
        f"(SUPABASE_URL must be http://127.0.0.1:54321 or http://localhost:54321, "
        f"serving Dissio's schema specifically -- a different project's local stack "
        f"on the same default port does not count). "
        f"Current SUPABASE_URL={SUPABASE_URL!r}. Run: bash scripts/setup_local_test_env.sh"
    ),
)


# ═══════════════════════════════════════════════════════════════════════════
# 1. Static migration-text analysis -- no DB required, always runs.
# ═══════════════════════════════════════════════════════════════════════════

class TestMigrationStaticAnalysis:
    def _text(self) -> str:
        path = MIGRATIONS_DIR / MIGRATION_FILE
        assert path.exists(), f"{MIGRATION_FILE} not found in {MIGRATIONS_DIR}"
        return path.read_text()

    def test_migration_file_exists(self):
        assert (MIGRATIONS_DIR / MIGRATION_FILE).exists()

    def test_helper_function_declared(self):
        text = self._text()
        assert "current_user_can_read_round" in text

    def test_helper_is_security_definer_with_empty_search_path(self):
        text = self._text()
        assert "security definer" in text.lower()
        assert "search_path = ''" in text

    def test_helper_revoked_from_public_and_granted_to_authenticated_only(self):
        text = self._text()
        assert "revoke all on function public.current_user_can_read_round(uuid) from public" in text.lower()
        assert re.search(r"grant execute on function public\.current_user_can_read_round\(uuid\) to authenticated",
                          text, re.IGNORECASE)
        assert "to anon" not in text.lower()

    def test_helper_excludes_left_and_invited_participants(self):
        """Only status = 'joined' counts -- matches _load_round_access exactly."""
        text = self._text()
        assert "rrp.status = 'joined'" in text

    def test_helper_does_not_use_invite_code(self):
        text = self._text()
        assert "invite_code" not in text.lower()

    def test_no_existing_policy_dropped(self):
        """This migration must be purely additive -- it must never DROP or
        REPLACE a pre-existing policy on any table."""
        text = self._text()
        assert "drop policy" not in text.lower()
        assert "create or replace policy" not in text.lower()  # not a real PG construct, but guard against it anyway
        assert "alter policy" not in text.lower()

    def test_round_rooms_and_participants_untouched(self):
        """Phase 10C confirmed these two tables already have correct
        participant-aware RLS -- this migration must not touch them."""
        text = self._text()
        assert "on round_rooms" not in text.lower()
        assert "on round_room_participants" not in text.lower()

    def test_no_insert_update_delete_policy_added(self):
        """Every new policy in this migration must be SELECT-only."""
        text = self._text()
        policy_blocks = re.findall(r'create policy "[^"]+"\s+on\s+\w+\s+for\s+(\w+)', text, re.IGNORECASE)
        assert policy_blocks, "No CREATE POLICY statements found"
        assert all(kind.lower() == "select" for kind in policy_blocks), (
            f"Found a non-SELECT policy in an additive-only migration: {policy_blocks}"
        )

    def test_all_eight_intended_tables_have_a_new_select_policy(self):
        text = self._text()
        for table in [
            "round_simulations",
            "round_speeches",
            "round_crossfire_exchanges",
            "round_arguments",
            "round_decisions",
            "round_drills",
            "round_drill_attempts",
            "round_coach_annotations",
        ]:
            assert f"on {table} for select" in text.lower(), f"No new SELECT policy found for {table}"

    def test_deferred_tables_not_touched(self):
        """Tables explicitly out of scope for this pass must not gain a policy
        here -- documents the conscious boundary, not an oversight."""
        text = self._text().lower()
        for table in [
            "round_evidence_uses",
            "round_legality_checks",
            "round_flow_events",
            "opponent_round_plans",
            "round_adaptation_reviews",
        ]:
            assert f"on {table} for select" not in text, f"{table} unexpectedly touched in this pass"


class TestFixMigrationStaticAnalysis:
    """Pass 32: static checks for the coach_annotations write-check fix
    found by this file's own live tests (see class TestRoundCoachAnnotationsRLS)."""

    def _text(self) -> str:
        path = MIGRATIONS_DIR / FIX_MIGRATION_FILE
        assert path.exists(), f"{FIX_MIGRATION_FILE} not found in {MIGRATIONS_DIR}"
        return path.read_text()

    def _code_only(self) -> str:
        """Strip `--` line comments before any keyword-position analysis --
        the migration's own prose (explaining the bug) legitimately contains
        the words "using"/"with check" ahead of the real SQL clauses, which
        would otherwise throw off a naive split()."""
        lines = [ln for ln in self._text().splitlines() if not ln.strip().startswith("--")]
        return "\n".join(lines).lower()

    def test_fix_migration_file_exists(self):
        assert (MIGRATIONS_DIR / FIX_MIGRATION_FILE).exists()

    def test_old_policy_dropped_before_recreation(self):
        text = self._code_only()
        assert 'drop policy if exists "coach_annotations_owner"' in text
        assert 'create policy "coach_annotations_owner"' in text

    def test_with_check_clause_present(self):
        """The whole point of the fix -- a FOR ALL policy with no WITH CHECK
        silently reuses USING for writes, which was the bug."""
        text = self._code_only()
        assert "with check" in text

    def test_with_check_requires_coach_id_equals_caller(self):
        text = self._code_only()
        with_check_section = text.split("with check")[1]
        assert "coach_id = auth.uid()" in with_check_section

    def test_with_check_requires_coach_role_not_just_any_participant(self):
        """Must not be satisfiable by a debater/observer -- only a genuinely
        joined role='coach' participant or the round owner."""
        text = self._code_only()
        with_check_section = text.split("with check")[1]
        assert "rrp.role = 'coach'" in with_check_section
        assert "rrp.status = 'joined'" in with_check_section

    def test_read_using_clause_unchanged_from_pass_17(self):
        """The fix must only tighten writes -- read access (coach_id = self
        OR round owner) stays exactly as it was, since Pass 31 already
        separately broadened reads correctly."""
        text = self._code_only()
        using_section = text.split("using")[1].split("with check")[0]
        assert "coach_id = auth.uid()" in using_section
        assert "round_simulations rs" in using_section


class TestFixMigration2StaticAnalysis:
    """Pass 33: static checks for the round_finding_ratings write-check fix
    -- same shape of assertions as TestFixMigrationStaticAnalysis, applied to
    the second table found by the bug-class sweep."""

    def _text(self) -> str:
        path = MIGRATIONS_DIR / FIX_MIGRATION_2_FILE
        assert path.exists(), f"{FIX_MIGRATION_2_FILE} not found in {MIGRATIONS_DIR}"
        return path.read_text()

    def _code_only(self) -> str:
        lines = [ln for ln in self._text().splitlines() if not ln.strip().startswith("--")]
        return "\n".join(lines).lower()

    def test_fix_migration_file_exists(self):
        assert (MIGRATIONS_DIR / FIX_MIGRATION_2_FILE).exists()

    def test_old_policy_dropped_before_recreation(self):
        text = self._code_only()
        assert 'drop policy if exists "finding_ratings_owner"' in text
        assert 'create policy "finding_ratings_owner"' in text

    def test_with_check_clause_present(self):
        text = self._code_only()
        assert "with check" in text

    def test_with_check_requires_rater_id_equals_caller(self):
        text = self._code_only()
        with_check_section = text.split("with check")[1]
        assert "rater_id = auth.uid()" in with_check_section

    def test_with_check_requires_coach_role_not_just_any_participant(self):
        text = self._code_only()
        with_check_section = text.split("with check")[1]
        assert "rrp.role = 'coach'" in with_check_section
        assert "rrp.status = 'joined'" in with_check_section

    def test_read_using_clause_unchanged_from_pass_17(self):
        """Pass 17's read semantics (rater_id = self, no owner fallback) are
        deliberately left exactly as they were -- this fix only tightens
        writes."""
        text = self._code_only()
        using_section = text.split("using")[1].split("with check")[0]
        assert using_section.strip() == "(rater_id = auth.uid())"


class TestWriteCheckSweep:
    """Phase 10D bug-class sweep: scans every Full Round migration for a
    FOR ALL/INSERT/UPDATE/DELETE policy granted to authenticated users (i.e.
    not `to service_role`) that lacks an explicit WITH CHECK. Appearing in
    this scan is not automatically a bug -- USING clauses built from a
    genuine, non-forgeable relationship (e.g. an EXISTS subquery against
    round_simulations.user_id, which a caller cannot fake) are safe even
    without an explicit WITH CHECK, because Postgres reusing USING as the
    check re-verifies that same real relationship. The bug class Pass 32/33
    fixed was specifically a USING clause built from a *self-declarable*
    column (coach_id, rater_id) with no check on the actual round_id/room
    relationship at all.

    This test's job is to keep the set of such "authenticated write, no
    explicit CHECK" policies from silently growing: every entry must be
    consciously reviewed and either fixed (added to the exception list only
    after adding a WITH CHECK) or justified (added to KNOWN_SAFE with a
    reason). A brand-new table that reintroduces the same bug class fails
    this test immediately instead of waiting for a live test to catch it."""

    _POLICY_RE = re.compile(
        r'CREATE POLICY\s+"([^"]+)"\s+ON\s+(\w+)\s+(.*?);',
        re.IGNORECASE | re.DOTALL,
    )

    # (table, policy_name) -> reason it's safe despite no explicit WITH CHECK.
    # Every entry here was individually audited during the Phase 10D sweep.
    KNOWN_SAFE_NO_WITH_CHECK = {
        ("round_simulations", "Users own their round simulations"):
            "user_id IS the ownership gate itself -- self-declaring your own "
            "user_id on INSERT is correct (you may only create rounds you own), "
            "and USING already filters UPDATE/DELETE to rows you already own "
            "before any write is attempted, so there is no cross-user row to "
            "target in the first place.",
        ("round_strategic_memory", "strategic_memory_round_owner"):
            "round ownership is verified via a genuine EXISTS subquery against "
            "round_simulations.user_id, not a self-declarable column -- cannot "
            "be forged to target a round the caller doesn't own.",
        ("round_replay_markers", "replay_markers_round_owner"):
            "same reasoning as round_strategic_memory.",
        ("round_quality_reports", "quality_reports_round_owner"):
            "same reasoning as round_strategic_memory.",
    }

    def _all_migration_text(self) -> str:
        parts = []
        for filename in ALL_ROUND_MIGRATION_FILES:
            path = MIGRATIONS_DIR / filename
            assert path.exists(), f"{filename} not found in {MIGRATIONS_DIR}"
            # Strip comments per-file so a leading `--` prose block (e.g. Pass
            # 32/33's own bug-description comments) never gets glued onto the
            # next file's SQL when concatenated.
            lines = [ln for ln in path.read_text().splitlines() if not ln.strip().startswith("--")]
            parts.append("\n".join(lines))
        return "\n".join(parts)

    def _find_unchecked_authenticated_write_policies(self):
        """Migration files are append-only history: a later migration's
        `DROP POLICY ... ; CREATE POLICY <same name> ...` supersedes an
        earlier one, exactly like Pass 32/33 did. ALL_ROUND_MIGRATION_FILES
        is listed chronologically and re.finditer walks the concatenated
        text in that same order, so resolving each (table, policy_name) key
        to its *last* seen definition -- last write wins -- reproduces what
        the live database actually ends up with after every migration has
        applied, not a false positive from a policy's now-superseded
        original text."""
        text = self._all_migration_text()
        latest_has_with_check: dict[tuple[str, str], bool] = {}
        for match in self._POLICY_RE.finditer(text):
            policy_name, table, rest = match.group(1), match.group(2), match.group(3)
            for_match = re.search(r"FOR\s+(ALL|INSERT|UPDATE|DELETE)\b", rest, re.IGNORECASE)
            if not for_match:
                continue  # FOR SELECT, or no FOR clause at all -- not a write policy
            is_service_role = bool(re.search(r"TO\s+service_role", rest, re.IGNORECASE))
            if is_service_role:
                continue  # service_role bypass is intentional and out of scope
            has_with_check = bool(re.search(r"WITH\s+CHECK", rest, re.IGNORECASE))
            latest_has_with_check[(table, policy_name)] = has_with_check
        return [key for key, has_check in latest_has_with_check.items() if not has_check]

    def test_sweep_finds_at_least_the_known_safe_policies(self):
        """Sanity check that the sweep regex actually matches real policies
        (a silently-broken regex that matches nothing would make every other
        assertion in this class vacuously true)."""
        flagged = self._find_unchecked_authenticated_write_policies()
        assert len(flagged) >= len(self.KNOWN_SAFE_NO_WITH_CHECK), (
            f"Sweep found fewer policies than expected -- regex may be broken. Found: {flagged}"
        )

    def test_only_known_safe_policies_lack_an_explicit_write_check(self):
        """The real regression guard: any FOR ALL/INSERT/UPDATE/DELETE policy
        granted to authenticated users, without an explicit WITH CHECK, that
        ISN'T already in the reviewed KNOWN_SAFE_NO_WITH_CHECK list is a new,
        unreviewed instance of the exact bug class Pass 32/33 fixed."""
        flagged = set(self._find_unchecked_authenticated_write_policies())
        known_safe = set(self.KNOWN_SAFE_NO_WITH_CHECK.keys())
        unreviewed = flagged - known_safe
        assert not unreviewed, (
            f"New FOR ALL/INSERT/UPDATE/DELETE policy without an explicit WITH CHECK "
            f"found and not yet reviewed: {unreviewed}. Either add a WITH CHECK "
            f"(if it's forgeable, matching Pass 32/33's pattern) or add it to "
            f"KNOWN_SAFE_NO_WITH_CHECK with a documented reason (if it's genuinely "
            f"safe, matching round_simulations/round_strategic_memory's pattern)."
        )

    def test_coach_annotations_and_finding_ratings_no_longer_flagged(self):
        """Explicit regression proof that Pass 32/33 actually fixed the two
        real bugs -- these must NOT appear in the flagged set anymore."""
        flagged = set(self._find_unchecked_authenticated_write_policies())
        assert ("round_coach_annotations", "coach_annotations_owner") not in flagged
        assert ("round_finding_ratings", "finding_ratings_owner") not in flagged

    def test_no_broad_authenticated_write_policy_introduced(self):
        """None of the fix migrations may introduce a policy that grants
        unconditional (USING/CHECK true, or no real predicate) write access
        to the authenticated role -- only service_role policies may do that."""
        for filename in (FIX_MIGRATION_FILE, FIX_MIGRATION_2_FILE):
            path = MIGRATIONS_DIR / filename
            lines = [ln for ln in path.read_text().splitlines() if not ln.strip().startswith("--")]
            text = "\n".join(lines).lower()
            assert "to authenticated" not in text, (
                f"{filename} explicitly grants a policy to the authenticated role "
                f"-- Pass 32/33's policies should apply to all non-service-role "
                f"callers via their USING/CHECK predicate, not a blanket role grant"
            )
            assert "using (true)" not in text and "with check (true)" not in text, (
                f"{filename} contains an unconditional true predicate outside a "
                f"service_role policy"
            )


# ═══════════════════════════════════════════════════════════════════════════
# 2. Live RLS tests -- require a local Supabase stack; skip gracefully if not.
# ═══════════════════════════════════════════════════════════════════════════

@pytest.fixture(scope="module")
def student_a_token():
    if not _is_dissio_schema_present():
        pytest.skip("Dissio's local Supabase schema not present")
    return _sign_in("test_student_a@dissio.local")


@pytest.fixture(scope="module")
def student_b_token():
    if not _is_dissio_schema_present():
        pytest.skip("Dissio's local Supabase schema not present")
    return _sign_in("test_student_b@dissio.local")


@pytest.fixture(scope="module")
def coach_b_token():
    if not _is_dissio_schema_present():
        pytest.skip("Dissio's local Supabase schema not present")
    return _sign_in("test_coach_b@dissio.local")


@pytest.fixture(scope="module")
def coach_a_token():
    if not _is_dissio_schema_present():
        pytest.skip("Dissio's local Supabase schema not present")
    return _sign_in("test_coach_a@dissio.local")


@pytest.fixture(scope="module")
def seeded_round():
    """Provisions one isolated round + room + participants + one row of
    content in each of the three tables under full-matrix test, entirely via
    the service-role client (bypasses RLS for setup only, matching the
    backend's own service-role usage pattern). Fresh UUIDs every run --
    never touches shared seed data."""
    if not _is_dissio_schema_present():
        pytest.skip("Dissio's local Supabase schema not present")

    round_id = str(uuid.uuid4())
    room_id = str(uuid.uuid4())
    invite_code = uuid.uuid4().hex[:8].upper()

    _service_insert("round_simulations", {
        "id": round_id, "user_id": STUDENT_A, "config_json": {"student_side": "pro"},
    })
    _service_insert("round_rooms", {
        "id": room_id, "round_id": round_id, "owner_user_id": STUDENT_A,
        "invite_code": invite_code, "status": "waiting",
    })
    _service_insert("round_room_participants", {
        "room_id": room_id, "user_id": STUDENT_A, "role": "owner", "side": "pro", "status": "joined",
    })
    _service_insert("round_room_participants", {
        "room_id": room_id, "user_id": STUDENT_B, "role": "debater_b", "side": "pro", "status": "joined",
    })

    exchange_id = str(uuid.uuid4())
    _service_insert("round_crossfire_exchanges", {
        "id": exchange_id, "round_id": round_id, "phase": "first_crossfire",
        "sequence": 0, "questioner_side": "con", "question": "Why does that hold?",
    })
    _service_insert("round_speeches", {
        "round_id": round_id, "phase": "first_constructive", "speaker_side": "pro", "transcript": "Test speech.",
    })
    _service_insert("round_coach_annotations", {
        "round_id": round_id, "coach_id": STUDENT_A, "annotation_type": "speech_note", "content": "Nice weighing.",
    })

    return {"round_id": round_id, "room_id": room_id, "exchange_id": exchange_id}


@pytest.fixture(scope="module")
def seeded_coach_round():
    """A second, isolated round -- owned by Student A, with Coach A joined
    as a genuine role='coach' participant -- kept separate from
    seeded_round so Coach A's positive write access here never interacts
    with COACH_B's "non-member" role used throughout the rest of this file."""
    if not _is_dissio_schema_present():
        pytest.skip("Dissio's local Supabase schema not present")

    round_id = str(uuid.uuid4())
    room_id = str(uuid.uuid4())
    invite_code = uuid.uuid4().hex[:8].upper()

    _service_insert("round_simulations", {
        "id": round_id, "user_id": STUDENT_A, "config_json": {"student_side": "pro"},
    })
    _service_insert("round_rooms", {
        "id": room_id, "round_id": round_id, "owner_user_id": STUDENT_A,
        "invite_code": invite_code, "status": "waiting",
    })
    _service_insert("round_room_participants", {
        "room_id": room_id, "user_id": STUDENT_A, "role": "owner", "side": "pro", "status": "joined",
    })
    _service_insert("round_room_participants", {
        "room_id": room_id, "user_id": COACH_A, "role": "coach", "side": None, "status": "joined",
    })

    return {"round_id": round_id, "room_id": room_id}


@_requires_local
class TestLocalSupabaseAvailability:
    def test_supabase_health_endpoint(self):
        resp = requests.get(f"{SUPABASE_URL}/auth/v1/health", timeout=5)
        assert resp.status_code == 200, (
            f"Local Supabase is not running at {SUPABASE_URL}. Run: bash scripts/setup_local_test_env.sh"
        )


@_requires_local
class TestRoundCrossfireExchangesRLS:
    """Full matrix on the table that matters most for crossfire/realtime."""

    def test_owner_can_read(self, seeded_round, student_a_token):
        rows = _rest_get(student_a_token, "round_crossfire_exchanges",
                          {"round_id": f"eq.{seeded_round['round_id']}", "select": "id,question"})
        assert len(rows) >= 1, "Owner cannot read their own round's crossfire exchanges"

    def test_joined_participant_can_read(self, seeded_round, student_b_token):
        rows = _rest_get(student_b_token, "round_crossfire_exchanges",
                          {"round_id": f"eq.{seeded_round['round_id']}", "select": "id"})
        assert len(rows) >= 1, "Joined participant cannot read crossfire exchanges for a room they joined"

    def test_non_member_cannot_read(self, seeded_round, coach_b_token):
        rows = _rest_get(coach_b_token, "round_crossfire_exchanges",
                          {"round_id": f"eq.{seeded_round['round_id']}", "select": "id"})
        assert len(rows) == 0, "Non-member read crossfire exchanges — RLS violation"

    def test_anon_cannot_read(self, seeded_round):
        rows = _rest_get(None, "round_crossfire_exchanges",
                          {"round_id": f"eq.{seeded_round['round_id']}", "select": "id"})
        assert len(rows) == 0, "Anon read crossfire exchanges — RLS violation"

    def test_left_participant_cannot_read(self, seeded_round, student_b_token):
        # Flip Student B to 'left' via service role, then re-check.
        url = f"{SUPABASE_URL}/rest/v1/round_room_participants"
        requests.patch(
            url,
            headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}", "Content-Type": "application/json"},
            params={"room_id": f"eq.{seeded_round['room_id']}", "user_id": f"eq.{STUDENT_B}"},
            json={"status": "left"},
            timeout=5,
        )
        try:
            rows = _rest_get(student_b_token, "round_crossfire_exchanges",
                              {"round_id": f"eq.{seeded_round['round_id']}", "select": "id"})
            assert len(rows) == 0, "Left participant can still read crossfire exchanges — RLS violation"
        finally:
            requests.patch(
                url,
                headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}", "Content-Type": "application/json"},
                params={"room_id": f"eq.{seeded_round['room_id']}", "user_id": f"eq.{STUDENT_B}"},
                json={"status": "joined"},
                timeout=5,
            )

    def test_closed_room_participant_can_still_read(self, seeded_round, student_b_token):
        url = f"{SUPABASE_URL}/rest/v1/round_rooms"
        requests.patch(
            url,
            headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}", "Content-Type": "application/json"},
            params={"id": f"eq.{seeded_round['room_id']}"},
            json={"status": "closed"},
            timeout=5,
        )
        try:
            rows = _rest_get(student_b_token, "round_crossfire_exchanges",
                              {"round_id": f"eq.{seeded_round['round_id']}", "select": "id"})
            assert len(rows) >= 1, "Existing participant lost read access after the room closed (should stay readable)"
        finally:
            requests.patch(
                url,
                headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}", "Content-Type": "application/json"},
                params={"id": f"eq.{seeded_round['room_id']}"},
                json={"status": "waiting"},
                timeout=5,
            )

    def test_service_role_reads_regardless(self, seeded_round):
        rows = _service_get("round_crossfire_exchanges", {"round_id": f"eq.{seeded_round['round_id']}", "select": "id"})
        assert len(rows) >= 1, "Service role cannot read crossfire exchanges — unexpected"

    def test_joined_participant_cannot_insert_directly(self, seeded_round, student_b_token):
        """No authenticated INSERT policy exists on this table -- writes must
        go through the backend's service-role-authorized endpoints."""
        status = _rest_write(student_b_token, "POST", "round_crossfire_exchanges", {
            "round_id": seeded_round["round_id"], "phase": "first_crossfire",
            "sequence": 99, "questioner_side": "pro", "question": "Forged by a participant",
        })
        assert status in (401, 403, 404), f"Joined participant inserted a crossfire exchange directly — status={status}"


@_requires_local
class TestRoundSpeechesRLS:
    def test_owner_can_read(self, seeded_round, student_a_token):
        rows = _rest_get(student_a_token, "round_speeches",
                          {"round_id": f"eq.{seeded_round['round_id']}", "select": "id"})
        assert len(rows) >= 1

    def test_joined_participant_can_read(self, seeded_round, student_b_token):
        rows = _rest_get(student_b_token, "round_speeches",
                          {"round_id": f"eq.{seeded_round['round_id']}", "select": "id"})
        assert len(rows) >= 1, "Joined participant cannot read round speeches"

    def test_non_member_cannot_read(self, seeded_round, coach_b_token):
        rows = _rest_get(coach_b_token, "round_speeches",
                          {"round_id": f"eq.{seeded_round['round_id']}", "select": "id"})
        assert len(rows) == 0, "Non-member read round speeches — RLS violation"

    def test_anon_cannot_read(self, seeded_round):
        rows = _rest_get(None, "round_speeches", {"round_id": f"eq.{seeded_round['round_id']}", "select": "id"})
        assert len(rows) == 0


@_requires_local
class TestRoundCoachAnnotationsRLS:
    """The table whose existing policy was FOR ALL (coach_id OR owner) --
    verifies the new additive policy correctly broadens SELECT only."""

    def test_owner_can_read(self, seeded_round, student_a_token):
        rows = _rest_get(student_a_token, "round_coach_annotations",
                          {"round_id": f"eq.{seeded_round['round_id']}", "select": "id,content"})
        assert len(rows) >= 1

    def test_joined_non_coach_participant_can_read(self, seeded_round, student_b_token):
        """Student B is neither the round owner nor the coach_id on this
        annotation -- only the new participant-aware policy lets them read
        it, matching Phase 9F's actual product decision."""
        rows = _rest_get(student_b_token, "round_coach_annotations",
                          {"round_id": f"eq.{seeded_round['round_id']}", "select": "id"})
        assert len(rows) >= 1, "Joined non-coach participant cannot read coach notes"

    def test_non_member_cannot_read(self, seeded_round, coach_b_token):
        rows = _rest_get(coach_b_token, "round_coach_annotations",
                          {"round_id": f"eq.{seeded_round['round_id']}", "select": "id"})
        assert len(rows) == 0, "Non-member read coach notes — RLS violation"

    def test_joined_non_coach_participant_cannot_write(self, seeded_round, student_b_token):
        """Pass 32 regression: a joined but non-coach participant (role=
        debater_b) must not be able to insert a coach annotation just by
        self-declaring coach_id = their own auth.uid(). This test is what
        caught the Pass 17 policy's missing WITH CHECK live, on a real
        Postgres/PostgREST stack -- before the Pass 32 fix it returned 201."""
        status = _rest_write(student_b_token, "POST", "round_coach_annotations", {
            "round_id": seeded_round["round_id"], "coach_id": STUDENT_B,
            "annotation_type": "speech_note", "content": "Forged note",
        })
        assert status in (401, 403, 404), f"Non-coach participant inserted a coach annotation — status={status}"

    def test_forged_coach_id_rejected_even_for_a_legitimate_coach(self, seeded_coach_round, coach_a_token):
        """A genuine coach participant still cannot attribute a note to a
        DIFFERENT coach_id than their own auth.uid() -- the WITH CHECK's
        `coach_id = auth.uid()` clause is a separate, additional guard, not
        just a byproduct of the role check."""
        status = _rest_write(coach_a_token, "POST", "round_coach_annotations", {
            "round_id": seeded_coach_round["round_id"], "coach_id": STUDENT_A,
            "annotation_type": "speech_note", "content": "Attributed to someone else",
        })
        assert status in (401, 403, 404), f"Coach forged a different coach_id — status={status}"

    def test_legitimate_joined_coach_can_write(self, seeded_coach_round, coach_a_token):
        """Positive case: proves Pass 32 didn't over-restrict -- a genuinely
        joined role='coach' participant, correctly self-attributing
        coach_id, can still write a note."""
        status = _rest_write(coach_a_token, "POST", "round_coach_annotations", {
            "round_id": seeded_coach_round["round_id"], "coach_id": COACH_A,
            "annotation_type": "speech_note", "content": "Legitimate coach note",
        })
        assert status == 201, f"Legitimate joined coach could not write a note — status={status}"


@_requires_local
class TestRoundFindingRatingsRLS:
    """Pass 33: round_finding_ratings had the same bug class as
    round_coach_annotations, but worse -- no owner-fallback clause at all,
    so round_id was never checked against any real relationship. Reuses the
    same seeded_round / seeded_coach_round fixtures as the coach-annotations
    tests above."""

    def test_non_member_cannot_write(self, seeded_round, coach_b_token):
        """Before the Pass 33 fix, this returned 201 -- COACH_B has zero
        relationship to seeded_round and yet the old policy only checked
        rater_id = auth.uid(), which is trivially self-satisfiable."""
        status = _rest_write(coach_b_token, "POST", "round_finding_ratings", {
            "round_id": seeded_round["round_id"], "finding_id": "finding-1",
            "rater_id": COACH_B, "rating": "useful",
        })
        assert status in (401, 403, 404), f"Non-member forged a finding rating — status={status}"

    def test_joined_non_coach_participant_cannot_write(self, seeded_round, student_b_token):
        """A joined debater is not a coach or the owner -- still rejected
        even though they ARE a real participant of the room."""
        status = _rest_write(student_b_token, "POST", "round_finding_ratings", {
            "round_id": seeded_round["round_id"], "finding_id": "finding-1",
            "rater_id": STUDENT_B, "rating": "useful",
        })
        assert status in (401, 403, 404), f"Non-coach participant forged a finding rating — status={status}"

    def test_forged_rater_id_rejected_even_for_a_legitimate_coach(self, seeded_coach_round, coach_a_token):
        status = _rest_write(coach_a_token, "POST", "round_finding_ratings", {
            "round_id": seeded_coach_round["round_id"], "finding_id": "finding-1",
            "rater_id": STUDENT_A, "rating": "useful",
        })
        assert status in (401, 403, 404), f"Coach forged a different rater_id — status={status}"

    def test_legitimate_joined_coach_can_write(self, seeded_coach_round, coach_a_token):
        status = _rest_write(coach_a_token, "POST", "round_finding_ratings", {
            "round_id": seeded_coach_round["round_id"], "finding_id": "finding-1",
            "rater_id": COACH_A, "rating": "useful",
        })
        assert status == 201, f"Legitimate joined coach could not write a rating — status={status}"

    def test_round_owner_can_write(self, seeded_round, student_a_token):
        status = _rest_write(student_a_token, "POST", "round_finding_ratings", {
            "round_id": seeded_round["round_id"], "finding_id": "finding-owner-1",
            "rater_id": STUDENT_A, "rating": "correct",
        })
        assert status == 201, f"Round owner could not write a finding rating — status={status}"


@_requires_local
class TestRemainingTablesSmoke:
    """Lighter coverage for the other tables in this migration -- confirms
    the new policy is correctly wired without repeating the full matrix."""

    @pytest.fixture(scope="class")
    def extra_rows(self, seeded_round):
        _service_insert("round_arguments", {
            "round_id": seeded_round["round_id"], "label": "P1", "side": "pro", "initial_phase": "first_constructive",
        })
        _service_insert("round_decisions", {
            "round_id": seeded_round["round_id"], "judge_type": "flow", "winner": "pro",
        })
        drill_row_id = str(uuid.uuid4())
        _service_insert("round_drills", {
            "id": drill_row_id, "round_id": seeded_round["round_id"],
            "skill_target": "drops", "title": "Drop Recovery", "prompt": "Practice covering drops.",
        })
        _service_insert("round_drill_attempts", {
            "round_drill_id": drill_row_id, "round_id": seeded_round["round_id"], "response_text": "My attempt.",
        })
        return seeded_round

    @pytest.mark.parametrize("table", ["round_arguments", "round_decisions", "round_drills", "round_drill_attempts"])
    def test_owner_and_participant_can_read_non_member_cannot(
        self, extra_rows, student_a_token, student_b_token, coach_b_token, table,
    ):
        owner_rows = _rest_get(student_a_token, table, {"round_id": f"eq.{extra_rows['round_id']}", "select": "id"})
        assert len(owner_rows) >= 1, f"Owner cannot read {table}"

        participant_rows = _rest_get(student_b_token, table, {"round_id": f"eq.{extra_rows['round_id']}", "select": "id"})
        assert len(participant_rows) >= 1, f"Joined participant cannot read {table}"

        non_member_rows = _rest_get(coach_b_token, table, {"round_id": f"eq.{extra_rows['round_id']}", "select": "id"})
        assert len(non_member_rows) == 0, f"Non-member read {table} — RLS violation"

    def test_round_simulations_row_readable_by_participant(self, seeded_round, student_b_token, coach_b_token):
        participant_rows = _rest_get(student_b_token, "round_simulations", {"id": f"eq.{seeded_round['round_id']}", "select": "id"})
        assert len(participant_rows) >= 1, "Joined participant cannot read the round_simulations row itself"

        non_member_rows = _rest_get(coach_b_token, "round_simulations", {"id": f"eq.{seeded_round['round_id']}", "select": "id"})
        assert len(non_member_rows) == 0, "Non-member read round_simulations — RLS violation"

    def test_participant_cannot_write_round_simulations(self, seeded_round, student_b_token):
        """The pre-existing owner-only FOR ALL policy is untouched -- a
        joined non-owner participant still cannot mutate the round row."""
        status = _rest_write(
            student_b_token, "PATCH", "round_simulations",
            {"status": "abandoned"}, params={"id": f"eq.{seeded_round['round_id']}"},
        )
        assert status in (401, 403, 404) or status == 200, (
            # A 200 with zero rows changed is also an acceptable RLS-blocked
            # outcome under PostgREST's UPDATE semantics (matches 0 rows).
            f"Unexpected status for a blocked round_simulations write: {status}"
        )
        rows = _service_get("round_simulations", {"id": f"eq.{seeded_round['round_id']}", "select": "status"})
        if rows:
            assert rows[0]["status"] != "abandoned", "Joined non-owner participant mutated round_simulations — RLS violation"
