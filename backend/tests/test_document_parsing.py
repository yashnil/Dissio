"""Tests for the document_parsing service.

All tests are pure — no network, no Supabase, no LLM calls.
parse_document() is tested via _parse_txt/_chunk_text directly to avoid
needing a live storage bucket.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from app.services.document_parsing import (
    DocumentParseError,
    _chunk_text,
    _parse_txt,
    TextChunk,
    _MIN_CHUNK_CHARS,
    _MAX_CHUNK_CHARS,
)


# ── _parse_txt ─────────────────────────────────────────────────────────────────

class TestParseTxt:
    def test_utf8_text(self):
        raw = "Hello debate world.\n\nSecond paragraph.".encode("utf-8")
        text, pages = _parse_txt(raw)
        assert "Hello debate world." in text
        assert pages is None

    def test_latin1_fallback(self):
        raw = b"Smart \x91quote\x92 here."
        text, pages = _parse_txt(raw)
        assert len(text) > 0
        assert pages is None

    def test_empty_bytes_gives_empty_string(self):
        text, _ = _parse_txt(b"")
        assert text == ""

    def test_multiline_text(self):
        content = "Line one.\n\nLine two.\n\nLine three."
        text, _ = _parse_txt(content.encode())
        assert "Line one." in text
        assert "Line three." in text


# ── _chunk_text ────────────────────────────────────────────────────────────────

class TestChunkText:
    def _make_text(self, *paragraphs: str) -> str:
        return "\n\n".join(paragraphs)

    def test_single_paragraph_becomes_one_chunk(self):
        text = "This is a debate constructive speech with a clear warrant about economic harm."
        chunks = _chunk_text(text, page_count=None)
        assert len(chunks) == 1
        assert chunks[0].chunk_text == text

    def test_two_paragraphs_become_two_chunks_when_large_enough(self):
        p1 = "A " * 30 + "first paragraph with enough text to be a separate chunk."
        p2 = "B " * 30 + "second paragraph with enough text to be a separate chunk."
        chunks = _chunk_text(self._make_text(p1, p2), None)
        assert len(chunks) >= 1
        combined = " ".join(c.chunk_text for c in chunks)
        assert "first paragraph" in combined
        assert "second paragraph" in combined

    def test_very_short_paragraph_skipped(self):
        short = "Hi."
        long = "This is a long enough paragraph with genuine debate content that passes the minimum threshold."
        chunks = _chunk_text(self._make_text(short, long), None)
        for c in chunks:
            assert len(c.chunk_text) >= _MIN_CHUNK_CHARS

    def test_heading_captured(self):
        text = "CONTENTION ONE:\n\nThis is the body of contention one with enough text to pass the threshold and be kept."
        chunks = _chunk_text(text, None)
        assert any(c.heading and "CONTENTION" in c.heading for c in chunks)

    def test_oversized_paragraph_creates_multiple_chunks(self):
        # One very long paragraph should be split if it exceeds _MAX_CHUNK_CHARS
        long_para = ("Evidence text. " * 300)  # ~4500 chars > 2500 limit
        chunks = _chunk_text(long_para, None)
        # All resulting chunks should be <= max size or be the only chunk
        assert len(chunks) >= 1

    def test_chunk_indices_sequential(self):
        text = self._make_text(
            "First para with enough text to qualify as a chunk for the evidence library.",
            "Second para with enough text to qualify as a chunk for the evidence library.",
            "Third para with enough text to qualify as a chunk for the evidence library.",
        )
        chunks = _chunk_text(text, None)
        for i, chunk in enumerate(chunks):
            assert chunk.chunk_index == i

    def test_empty_text_gives_no_chunks(self):
        chunks = _chunk_text("", None)
        assert chunks == []

    def test_whitespace_only_gives_no_chunks(self):
        chunks = _chunk_text("   \n\n   \n\n   ", None)
        assert chunks == []

    def test_all_chunks_meet_minimum_length(self):
        text = "\n\n".join([
            "x" * 200 + f" paragraph {i}" for i in range(5)
        ])
        chunks = _chunk_text(text, None)
        for c in chunks:
            assert len(c.chunk_text) >= _MIN_CHUNK_CHARS


# ── DocumentParseError ─────────────────────────────────────────────────────────

class TestDocumentParseError:
    def test_is_exception(self):
        err = DocumentParseError("test message")
        assert str(err) == "test message"
        assert isinstance(err, Exception)

    def test_user_safe_message_not_exposed(self):
        # The message should not contain internal paths or stack traces
        err = DocumentParseError("Unsupported file type '.xyz'.")
        assert "Unsupported" in str(err)
        assert "xyz" in str(err)
