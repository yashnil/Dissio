import { createClient } from "@/lib/supabase";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * Typed API error. `isNetworkError` is true when the backend is unreachable
 * (fetch threw before any HTTP response was received). `status` is 0 in that
 * case; for HTTP errors it carries the actual status code.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly isNetworkError: boolean;

  constructor(message: string, status: number, isNetworkError = false) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.isNetworkError = isNetworkError;
  }
}

export function isBackendUnreachable(err: unknown): err is ApiError {
  return err instanceof ApiError && err.isNetworkError;
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const supabase = createClient();
  const callerSetAuth = new Headers(options?.headers).has("Authorization");

  async function send(token: string | null): Promise<Response> {
    const headers = new Headers(options?.headers);
    if (token && !callerSetAuth) headers.set("Authorization", `Bearer ${token}`);
    return fetch(`${API_BASE}${path}`, { ...options, headers });
  }

  // Attach the current Supabase access token so endpoints that authenticate the
  // caller can derive identity from the verified JWT (others ignore it).
  let token: string | null = null;
  try {
    token = (await supabase.auth.getSession()).data.session?.access_token ?? null;
  } catch {
    // No session — request proceeds unauthenticated.
  }

  let res: Response;
  try {
    res = await send(token);
  } catch (cause) {
    // fetch() itself threw — the backend is unreachable (server not running,
    // DNS failure, CORS preflight rejected, etc.).
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[api] network error — is the backend running at ${API_BASE}?\n` +
          `  Path:  ${path}\n` +
          `  Cause: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
    throw new ApiError(
      `Cannot reach the backend at ${API_BASE}. ` +
        `Start the FastAPI server and refresh.`,
      0,
      true,
    );
  }

  // On a 401 with a token, the access token is likely stale: refresh the
  // session once and retry before surfacing the error.
  if (res.status === 401 && token && !callerSetAuth) {
    try {
      const refreshed =
        (await supabase.auth.refreshSession()).data.session?.access_token ??
        null;
      if (refreshed && refreshed !== token) {
        try {
          res = await send(refreshed);
        } catch {
          // Retry send failed — fall through to the original 401.
        }
      }
    } catch {
      // Refresh failed — fall through to the original 401.
    }
  }

  if (!res.ok) {
    let message = `API error ${res.status} on ${path}`;
    try {
      const body = await res.json();
      if (body?.detail) message = String(body.detail);
    } catch {
      // response body wasn't JSON — keep the default message
    }
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[api] ${message}`);
    }
    throw new ApiError(message, res.status, false);
  }

  return res.json() as Promise<T>;
}
