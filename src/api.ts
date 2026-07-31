type ApiOptions = Omit<RequestInit, "body"> & { body?: unknown };

export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent("auth-expired"));
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { error?: string }).error;
    throw new Error(msg || `Request failed (${res.status})`);
  }
  return data as T;
}
