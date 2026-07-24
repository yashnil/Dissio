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
        """The pre-existing FOR ALL policy (coach_id = auth.uid() OR owner)
        is untouched -- a non-coach joined participant still cannot insert."""
        status = _rest_write(student_b_token, "POST", "round_coach_annotations", {
            "round_id": seeded_round["round_id"], "coach_id": STUDENT_B,
            "annotation_type": "speech_note", "content": "Forged note",
        })
        assert status in (401, 403, 404), f"Non-coach participant inserted a coach annotation — status={status}"


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
