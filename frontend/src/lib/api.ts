const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) {
    let message = `API error ${res.status} on ${path}`;
    try {
      const body = await res.json();
      if (body?.detail) message = String(body.detail);
    } catch {
      // response body wasn't JSON — keep the default message
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}
