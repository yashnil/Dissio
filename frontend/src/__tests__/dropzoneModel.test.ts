/**
 * Dropzone model tests — pure utility, no DOM, no React.
 *
 * Covers:
 *  - isDropzoneActivationKey: Enter and Space activate, other keys do not
 *  - formatDropzoneFileSize: byte formatting
 *  - validateDropzoneFile: extension validation, size limits, clean files
 *  - dropzoneAriaLabel: label changes based on file selection state
 *  - Upload dropzone keyboard activation semantics
 */

import {
  isDropzoneActivationKey,
  formatDropzoneFileSize,
  validateDropzoneFile,
  dropzoneAriaLabel,
  DROPZONE_ALLOWED_EXT,
  DROPZONE_MAX_MB,
} from "@/lib/dropzoneModel";

// ── isDropzoneActivationKey ───────────────────────────────────────────────────

describe("isDropzoneActivationKey — keyboard activation semantics", () => {
  test("Enter activates the dropzone", () => {
    expect(isDropzoneActivationKey("Enter")).toBe(true);
  });

  test("Space activates the dropzone", () => {
    expect(isDropzoneActivationKey(" ")).toBe(true);
  });

  test("Tab does not activate", () => {
    expect(isDropzoneActivationKey("Tab")).toBe(false);
  });

  test("Escape does not activate", () => {
    expect(isDropzoneActivationKey("Escape")).toBe(false);
  });

  test("ArrowDown does not activate", () => {
    expect(isDropzoneActivationKey("ArrowDown")).toBe(false);
  });

  test("letter keys do not activate", () => {
    expect(isDropzoneActivationKey("a")).toBe(false);
    expect(isDropzoneActivationKey("Return")).toBe(false);
  });

  test("empty string does not activate", () => {
    expect(isDropzoneActivationKey("")).toBe(false);
  });
});

// ── formatDropzoneFileSize ────────────────────────────────────────────────────

describe("formatDropzoneFileSize", () => {
  test("formats bytes to MB with 1 decimal", () => {
    expect(formatDropzoneFileSize(1024 * 1024)).toBe("1.0 MB");
  });

  test("formats 10 MB correctly", () => {
    expect(formatDropzoneFileSize(10 * 1024 * 1024)).toBe("10.0 MB");
  });

  test("formats sub-1-MB files", () => {
    expect(formatDropzoneFileSize(512 * 1024)).toBe("0.5 MB");
  });

  test("formats 50 MB (max allowed)", () => {
    expect(formatDropzoneFileSize(50 * 1024 * 1024)).toBe("50.0 MB");
  });
});

// ── validateDropzoneFile ──────────────────────────────────────────────────────

describe("validateDropzoneFile — file validation", () => {
  test("accepts valid MP3 file within size limit", () => {
    expect(validateDropzoneFile("speech.mp3", 10 * 1024 * 1024)).toBeNull();
  });

  test("accepts all allowed extensions", () => {
    for (const ext of DROPZONE_ALLOWED_EXT) {
      expect(validateDropzoneFile(`file.${ext}`, 1024)).toBeNull();
    }
  });

  test("rejects disallowed extension", () => {
    const err = validateDropzoneFile("speech.txt", 1024);
    expect(err).not.toBeNull();
    expect(err).toContain("Format not supported");
  });

  test("rejects file exceeding max size", () => {
    const err = validateDropzoneFile("speech.mp3", 51 * 1024 * 1024);
    expect(err).not.toBeNull();
    expect(err).toContain("too large");
  });

  test("accepts file exactly at max size", () => {
    expect(validateDropzoneFile("speech.mp3", DROPZONE_MAX_MB * 1024 * 1024)).toBeNull();
  });

  test("extension comparison is case-insensitive", () => {
    expect(validateDropzoneFile("speech.MP3", 1024)).toBeNull();
    expect(validateDropzoneFile("speech.WAV", 1024)).toBeNull();
  });

  test("file with no extension is rejected", () => {
    const err = validateDropzoneFile("speechfile", 1024);
    expect(err).not.toBeNull();
  });

  test("error includes allowed extensions list when format rejected", () => {
    const err = validateDropzoneFile("speech.pdf", 1024)!;
    expect(err).toContain("mp3");
  });

  test("custom maxMb override is respected", () => {
    const err = validateDropzoneFile("speech.mp3", 2 * 1024 * 1024, 1);
    expect(err).not.toBeNull();
    expect(err).toContain("too large");
  });

  test("custom allowedExts override is respected", () => {
    const err = validateDropzoneFile("speech.mp3", 1024, 50, ["wav", "flac"]);
    expect(err).not.toBeNull();
  });
});

// ── dropzoneAriaLabel ─────────────────────────────────────────────────────────

describe("dropzoneAriaLabel", () => {
  test("provides actionable label when no file selected", () => {
    const label = dropzoneAriaLabel(null);
    expect(label).toContain("Select");
    expect(label.toLowerCase()).toContain("enter");
  });

  test("includes file name when file is selected", () => {
    const label = dropzoneAriaLabel("speech.mp3");
    expect(label).toContain("speech.mp3");
  });

  test("prompts to change file when one is selected", () => {
    const label = dropzoneAriaLabel("recording.wav");
    expect(label.toLowerCase()).toMatch(/change|press/);
  });
});

// ── Constants ─────────────────────────────────────────────────────────────────

describe("DROPZONE_ALLOWED_EXT", () => {
  test("includes all standard audio formats", () => {
    const expected = ["mp3", "wav", "m4a", "webm", "ogg", "mp4"];
    expected.forEach((ext) => {
      expect(DROPZONE_ALLOWED_EXT).toContain(ext);
    });
  });

  test("DROPZONE_MAX_MB is 50", () => {
    expect(DROPZONE_MAX_MB).toBe(50);
  });
});
