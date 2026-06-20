/** Browser → session-gated /api/shiftbuilder/mutations proxy. */

export async function postOpsMutation<T = unknown>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch("/api/shiftbuilder/mutations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ action, ...payload }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || (json as { error?: string }).error) {
    throw new Error(
      (json as { error?: string }).error || `Mutation ${action} failed (HTTP ${res.status})`,
    );
  }

  return json as T;
}