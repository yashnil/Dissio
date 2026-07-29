"""Shared pytest fixtures.

The optional LLM card refiner runs automatically whenever an OpenAI key is
present. To keep the suite deterministic and offline by default, it is disabled
for all tests here; the refiner's own tests re-enable it and mock the LLM call.
"""

import asyncio

import pytest

from app.config import settings
from tests import REPO_ROOT  # noqa: F401  (re-exported for backwards compat)


@pytest.fixture(autouse=True)
def _disable_llm_refiner_by_default(monkeypatch):
    monkeypatch.setattr(settings, "research_enable_llm_refiner", False, raising=False)
    # Disable Pass 9 academic providers to keep all tests offline by default.
    # Pass 9 adapter tests mock HTTP directly and do not need this flag.
    monkeypatch.setattr(settings, "research_enable_academic_search", False, raising=False)
    yield


@pytest.fixture(autouse=True)
def _ensure_event_loop_for_legacy_sync_tests():
    """Compatibility shim for legacy sync tests that call
    asyncio.get_event_loop().run_until_complete(...) directly instead of
    using an async test runner (see test_p18_pilot_analytics.py,
    test_p18_recovery.py, test_pass21p3_release_gate.py).

    Python 3.10+ no longer auto-creates an event loop on the main thread when
    none is current -- it raises RuntimeError instead. asyncio.run() (used by
    some newer tests, e.g. test_evidence_extraction_health.py) explicitly
    clears the current loop when it finishes. When the full suite runs in one
    process, a asyncio.run()-based test can run before one of these legacy
    tests and leave no current loop, so get_event_loop() breaks -- even
    though each file passes fine in isolation. This fixture just restores a
    current loop before every test if one isn't already set, matching the
    pre-3.10 auto-create behavior these legacy tests were written against.
    It never touches a loop that's already current/running, so tests that
    manage their own loop (asyncio.run(), etc.) are unaffected.
    """
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            raise RuntimeError("closed loop")
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    yield
