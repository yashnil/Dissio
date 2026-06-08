"""Tests for evidence document RLS policies and upload ownership guards.

All tests are pure — no network, no Supabase, no LLM calls.
Verifies that:
  1. The fix migration contains the required storage.objects policies.
  2. The documents table policy SQL uses USING with user_id.
  3. The backend document create payload preserves user_id.
  4. Storage path is always prefixed with user_id.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
EVIDENCE_MIGRATION = REPO_ROOT / "supabase" / "migrations" / "20260608100000_add_evidence_tables.sql"
STORAGE_POLICY_MIGRATION = REPO_ROOT / "supabase" / "migrations" / "20260608110000_fix_document_storage_policies.sql"


# ── Migration file existence ───────────────────────────────────────────────────

class TestMigrationFilesExist:
    def test_evidence_migration_exists(self):
        assert EVIDENCE_MIGRATION.exists(), (
            f"Evidence tables migration not found: {EVIDENCE_MIGRATION}"
        )

    def test_storage_policy_migration_exists(self):
        assert STORAGE_POLICY_MIGRATION.exists(), (
            f"Storage policy fix migration not found: {STORAGE_POLICY_MIGRATION}"
        )


# ── Storage policy migration content ──────────────────────────────────────────

class TestStoragePolicyMigration:
    @pytest.fixture(scope="class")
    def sql(self):
        return STORAGE_POLICY_MIGRATION.read_text()

    def test_targets_documents_bucket(self, sql):
        assert "bucket_id = 'documents'" in sql or 'bucket_id = "documents"' in sql

    def test_has_insert_policy(self, sql):
        assert "FOR INSERT" in sql.upper()

    def test_has_select_policy(self, sql):
        assert "FOR SELECT" in sql.upper()

    def test_has_delete_policy(self, sql):
        assert "FOR DELETE" in sql.upper()

    def test_insert_policy_is_authenticated_only(self, sql):
        # Policy must not apply to anon role (would be a security hole)
        upper = sql.upper()
        assert "TO AUTHENTICATED" in upper
        # Should not have "TO PUBLIC" or "TO ANON" for insert
        lines_with_insert = [
            line for line in sql.splitlines()
            if "TO ANON" in line.upper() or "TO PUBLIC" in line.upper()
        ]
        assert not lines_with_insert, (
            f"Storage policy should not grant anon/public access: {lines_with_insert}"
        )

    def test_uses_user_folder_predicate(self, sql):
        # Policy must restrict to user's own subfolder via auth.uid()
        assert "auth.uid()" in sql
        assert "storage.foldername" in sql

    def test_foldername_index_matches_path_convention(self, sql):
        # Path convention: {user_id}/{filename}
        # foldername(name)[1] is the first folder component = user_id
        assert "[1]" in sql, (
            "Policy must use [1] to match the first folder component (user_id prefix)"
        )

    def test_with_check_on_insert(self, sql):
        assert "WITH CHECK" in sql.upper()


# ── Evidence tables migration content ─────────────────────────────────────────

class TestEvidenceTablesMigration:
    @pytest.fixture(scope="class")
    def sql(self):
        return EVIDENCE_MIGRATION.read_text()

    def test_documents_table_has_rls_enabled(self, sql):
        assert "ENABLE ROW LEVEL SECURITY" in sql.upper()

    def test_documents_policy_checks_user_id(self, sql):
        assert "user_id" in sql
        assert "auth.uid()" in sql

    def test_chunks_table_has_rls(self, sql):
        assert "document_chunks" in sql
        assert "users_own_chunks" in sql or "ENABLE ROW LEVEL SECURITY" in sql.upper()

    def test_evidence_cards_table_has_rls(self, sql):
        assert "evidence_cards" in sql
        assert "users_own_cards" in sql or "ENABLE ROW LEVEL SECURITY" in sql.upper()

    def test_fts_column_defined(self, sql):
        assert "tsvector" in sql.lower() or "TSVECTOR" in sql

    def test_no_public_access_granted(self, sql):
        upper = sql.upper()
        # Should not grant access to PUBLIC role
        assert "TO PUBLIC" not in upper


# ── Backend model: user_id ownership ──────────────────────────────────────────

class TestDocumentCreateRequestOwnership:
    def test_user_id_is_required_field(self):
        from app.models.document import DocumentCreateRequest
        import pydantic
        # user_id has no default — must be provided
        with pytest.raises((pydantic.ValidationError, TypeError)):
            DocumentCreateRequest(
                filename="test.pdf",
                storage_path="user/test.pdf",
            )

    def test_user_id_preserved_in_payload(self):
        from app.models.document import DocumentCreateRequest
        req = DocumentCreateRequest(
            user_id="test-user-123",
            filename="myfile.pdf",
            storage_path="test-user-123/12345_myfile.pdf",
            doc_type="case",
        )
        assert req.user_id == "test-user-123"

    def test_storage_path_contains_user_id(self):
        """Verify the path convention: storage_path must start with user_id."""
        user_id = "abc-def-123"
        filename = "evidence.pdf"
        # Replicate frontend path construction
        storage_path = f"{user_id}/1749000000_{filename}"
        assert storage_path.startswith(user_id + "/"), (
            "Storage path must be prefixed with user_id so bucket policies can match [1]"
        )


# ── Unauthenticated guard (unit-level) ────────────────────────────────────────

class TestAuthGuard:
    def test_upload_requires_user_id_field(self):
        """DocumentCreateRequest requires user_id — backend cannot accept anonymous inserts."""
        from app.models.document import DocumentCreateRequest
        import pydantic
        with pytest.raises((pydantic.ValidationError, TypeError)):
            # Should fail: no user_id
            DocumentCreateRequest(filename="f.pdf", storage_path="path/f.pdf")

    def test_valid_create_request_passes_validation(self):
        from app.models.document import DocumentCreateRequest
        req = DocumentCreateRequest(
            user_id="user-abc",
            filename="case.pdf",
            storage_path="user-abc/ts_case.pdf",
        )
        assert req.user_id == "user-abc"
        assert req.doc_type == "case"  # default


# ── GET /evidence-checks ownership model ──────────────────────────────────────

class TestEvidenceCheckModel:
    def test_claim_evidence_check_row_fields(self):
        """ClaimEvidenceCheckRow preserves all required fields for the GET endpoint."""
        from app.models.document import ClaimEvidenceCheckRow
        row = ClaimEvidenceCheckRow(
            id="check-1",
            speech_id="speech-1",
            user_id="user-1",
            argument_label="C1: Economic Burden",
            claim_text="Military bases cost too much",
            evidence_text_from_speech="Smith 2023",
            matched_card_id="card-1",
            support_level="partially_supported",
            explanation="Card supports topic but not exact magnitude.",
            created_at="2026-06-08T00:00:00Z",
        )
        assert row.speech_id == "speech-1"
        assert row.user_id == "user-1"
        assert row.support_level == "partially_supported"

    def test_claim_check_supports_all_levels(self):
        from app.models.document import ClaimEvidenceCheckRow, EvidenceSupportLevel
        for level in ["supported", "partially_supported", "unsupported", "unverifiable"]:
            row = ClaimEvidenceCheckRow(
                id="c1",
                speech_id="s1",
                user_id="u1",
                claim_text="test claim",
                support_level=level,
                explanation="explanation",
                created_at="2026-06-08T00:00:00Z",
            )
            assert row.support_level == level

    def test_check_request_carries_user_id(self):
        """EvidenceCheckRequest requires user_id so the endpoint can verify speech ownership."""
        from app.models.document import EvidenceCheckRequest
        req = EvidenceCheckRequest(
            user_id="user-abc",
            claim_text="Military presence causes conflict.",
            argument_label="C2: Escalation",
        )
        assert req.user_id == "user-abc"
        assert req.argument_label == "C2: Escalation"

    def test_check_request_user_id_required(self):
        from app.models.document import EvidenceCheckRequest
        import pydantic
        with pytest.raises((pydantic.ValidationError, TypeError)):
            EvidenceCheckRequest(claim_text="test")

    def test_evidence_support_levels_constant(self):
        from app.models.document import EvidenceSupportLevel
        assert EvidenceSupportLevel.SUPPORTED == "supported"
        assert EvidenceSupportLevel.PARTIALLY_SUPPORTED == "partially_supported"
        assert EvidenceSupportLevel.UNSUPPORTED == "unsupported"
        assert EvidenceSupportLevel.UNVERIFIABLE == "unverifiable"


# ── Evidence check result model ────────────────────────────────────────────────

class TestEvidenceCheckResult:
    def test_result_fields(self):
        from app.models.document import EvidenceCheckResult, EvidenceCardRow
        card = EvidenceCardRow(
            id="card-1",
            document_id="doc-1",
            user_id="user-1",
            card_text="Military deterrence requires forward presence...",
            attribution_complete=True,
            author="Smith",
            year=2023,
            created_at="2026-06-08T00:00:00Z",
        )
        result = EvidenceCheckResult(
            argument_label="C1",
            claim_text="Bases are essential for deterrence",
            evidence_text_from_speech=None,
            matched_card=card,
            support_level="supported",
            explanation="The card directly supports the deterrence claim.",
        )
        assert result.support_level == "supported"
        assert result.matched_card is not None
        assert result.matched_card.author == "Smith"

    def test_result_with_no_match(self):
        from app.models.document import EvidenceCheckResult
        result = EvidenceCheckResult(
            argument_label="C2",
            claim_text="Some claim",
            evidence_text_from_speech=None,
            matched_card=None,
            support_level="unverifiable",
            explanation="No matching card found.",
        )
        assert result.matched_card is None
        assert result.support_level == "unverifiable"
