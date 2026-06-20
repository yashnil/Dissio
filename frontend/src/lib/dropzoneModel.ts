/**
 * Dropzone model — pure helpers for the UploadDropzone component.
 * Extracted so the keyboard-activation contract and file-validation logic
 * can be unit tested without mounting a component.
 */

export const DROPZONE_ALLOWED_EXT = ["mp3", "wav", "m4a", "webm", "ogg", "mp4"] as const;
export const DROPZONE_MAX_MB = 50;

/** Keys that should activate the dropzone button (keyboard parity with click). */
export function isDropzoneActivationKey(key: string): boolean {
  // Native <button> already handles Enter and Space; this models the contract
  // for test documentation and any custom keyDown guards.
  return key === "Enter" || key === " ";
}

/** Human-readable file size string. */
export function formatDropzoneFileSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Validate a file against the allowed extensions and size limit. */
export function validateDropzoneFile(
  fileName: string,
  fileBytes: number,
  maxMb = DROPZONE_MAX_MB,
  allowedExts: readonly string[] = DROPZONE_ALLOWED_EXT,
): string | null {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (!allowedExts.includes(ext as never)) {
    return `Format not supported. Use: ${allowedExts.join(", ")}`;
  }
  if (fileBytes > maxMb * 1024 * 1024) {
    return `File too large (${formatDropzoneFileSize(fileBytes)}). Max: ${maxMb} MB`;
  }
  return null;
}

/** Accessible label for the dropzone when a file is selected vs. empty. */
export function dropzoneAriaLabel(fileName: string | null): string {
  return fileName
    ? `Selected file: ${fileName}. Press Enter or Space to change.`
    : "Select an audio file. Press Enter or Space to open file picker.";
}
