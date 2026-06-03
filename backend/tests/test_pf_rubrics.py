"""Tests for PF rubric profiles and speech-type-specific scoring."""

from app.services.pf_rubrics import (
    CONSTRUCTIVE_RUBRIC,
    REBUTTAL_RUBRIC,
    SUMMARY_RUBRIC,
    FINAL_FOCUS_RUBRIC,
    get_rubric,
    get_score_band,
)


def test_constructive_rubric_dimensions():
    """Constructive rubric should have 5 dimensions focused on case building."""
    rubric = CONSTRUCTIVE_RUBRIC
    assert rubric["speech_type"] == "constructive"
    assert len(rubric["dimensions"]) == 5

    # Check that constructive focuses on structure, warranting, evidence, impacts, clarity
    dim_names = [d["name"] for d in rubric["dimensions"]]
    assert "case_structure" in dim_names
    assert "warranting" in dim_names
    assert "evidence_use" in dim_names
    assert "impact_development" in dim_names
    assert "judge_clarity" in dim_names

    # Verify total max score is 100
    total_max = sum(d["max_score"] for d in rubric["dimensions"])
    assert total_max == 100


def test_constructive_do_not_penalize():
    """Constructive should not penalize clash, extensions, or final voters."""
    rubric = CONSTRUCTIVE_RUBRIC
    do_not_penalize = rubric["do_not_penalize_heavily"]

    # Check that constructive doesn't penalize things it's not supposed to do
    assert any("clash" in item.lower() for item in do_not_penalize)
    assert any("extension" in item.lower() for item in do_not_penalize)
    assert any("voter" in item.lower() for item in do_not_penalize)


def test_rebuttal_rubric_dimensions():
    """Rebuttal rubric should have 5 dimensions focused on clash and refutation."""
    rubric = REBUTTAL_RUBRIC
    assert rubric["speech_type"] == "rebuttal"
    assert len(rubric["dimensions"]) == 5

    # Check that rebuttal focuses on clash, coverage, response quality
    dim_names = [d["name"] for d in rubric["dimensions"]]
    assert "clash_refutation" in dim_names
    assert "coverage_prioritization" in dim_names
    assert "response_quality" in dim_names
    assert "evidence_comparison" in dim_names
    assert "weighing_setup" in dim_names

    # Verify total max score is 100
    total_max = sum(d["max_score"] for d in rubric["dimensions"])
    assert total_max == 100


def test_summary_rubric_dimensions():
    """Summary rubric should have 5 dimensions focused on extensions and weighing."""
    rubric = SUMMARY_RUBRIC
    assert rubric["speech_type"] == "summary"
    assert len(rubric["dimensions"]) == 5

    # Check that summary focuses on extensions, collapse, frontlining, weighing
    dim_names = [d["name"] for d in rubric["dimensions"]]
    assert "extension_quality" in dim_names
    assert "collapse_strategy" in dim_names
    assert "frontlining" in dim_names
    assert "weighing" in dim_names
    assert "judge_clarity" in dim_names

    # Verify total max score is 100
    total_max = sum(d["max_score"] for d in rubric["dimensions"])
    assert total_max == 100


def test_final_focus_rubric_dimensions():
    """Final Focus rubric should have 5 dimensions focused on voters and crystallization."""
    rubric = FINAL_FOCUS_RUBRIC
    assert rubric["speech_type"] == "final_focus"
    assert len(rubric["dimensions"]) == 5

    # Check that final focus focuses on ballot story, weighing, crystallization
    dim_names = [d["name"] for d in rubric["dimensions"]]
    assert "ballot_story" in dim_names
    assert "comparative_weighing" in dim_names
    assert "crystallization" in dim_names
    assert "consistency" in dim_names
    assert "judge_adaptation" in dim_names

    # Verify total max score is 100
    total_max = sum(d["max_score"] for d in rubric["dimensions"])
    assert total_max == 100


def test_get_rubric_returns_correct_profile():
    """get_rubric should return the correct rubric for each speech type."""
    assert get_rubric("constructive")["speech_type"] == "constructive"
    assert get_rubric("rebuttal")["speech_type"] == "rebuttal"
    assert get_rubric("summary")["speech_type"] == "summary"
    assert get_rubric("final_focus")["speech_type"] == "final_focus"
    assert get_rubric("crossfire")["speech_type"] == "crossfire"


def test_get_rubric_defaults_to_constructive():
    """get_rubric should default to constructive for unknown speech types."""
    rubric = get_rubric("unknown_type")
    assert rubric["speech_type"] == "constructive"


def test_score_bands():
    """Test score band labels."""
    assert get_score_band(95) == "Tournament-Ready"
    assert get_score_band(85) == "Strong"
    assert get_score_band(75) == "Solid"
    assert get_score_band(65) == "Developing with Clear Strengths"
    assert get_score_band(55) == "Flawed but Complete"
    assert get_score_band(45) == "Major Issues but Partially Functional"
    assert get_score_band(35) == "Severely Underdeveloped"
    assert get_score_band(25) == "Incomplete or Incoherent"


def test_constructive_calibration_notes():
    """Constructive calibration should prevent over-penalization of complete speeches."""
    rubric = CONSTRUCTIVE_RUBRIC
    calibration = rubric["calibration_notes"]

    # Check that calibration mentions 50-60 range for complete but flawed speeches
    assert "50-60" in calibration or "50–60" in calibration
    assert "30-39" in calibration or "30–39" in calibration


def test_all_dimensions_have_required_fields():
    """All dimensions across all rubrics should have required fields."""
    rubrics = [CONSTRUCTIVE_RUBRIC, REBUTTAL_RUBRIC, SUMMARY_RUBRIC, FINAL_FOCUS_RUBRIC]

    for rubric in rubrics:
        for dim in rubric["dimensions"]:
            assert "name" in dim
            assert "max_score" in dim
            assert "description" in dim
            assert "what_to_reward" in dim
            assert "what_to_penalize" in dim
            assert "student_friendly_label" in dim
            assert isinstance(dim["max_score"], int)
            assert dim["max_score"] > 0
