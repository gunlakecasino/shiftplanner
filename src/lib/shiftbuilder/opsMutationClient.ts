/** Browser → session-gated /api/shiftbuilder/mutations proxy. */

export class OpsMutationError extends Error {
  readonly status: number;
  readonly invalid?: Array<{ slotKey: string; tmId: string | null; reason: string }>;

  constructor(
    message: string,
    opts?: {
      status?: number;
      invalid?: Array<{ slotKey: string; tmId: string | null; reason: string }>;
    },
  ) {
    super(message);
    this.name = "OpsMutationError";
    this.status = opts?.status ?? 400;
    this.invalid = opts?.invalid;
  }
}

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

  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    invalid?: Array<{ slotKey: string; tmId: string | null; reason: string }>;
  };
  if (!res.ok || json.error) {
    const invalid = Array.isArray(json.invalid) ? json.invalid : undefined;
    let message =
      json.error || `Mutation ${action} failed (HTTP ${res.status})`;
    if (invalid?.length) {
      const detail = invalid
        .slice(0, 5)
        .map((e) => `${e.slotKey}: ${e.reason}`)
        .join(" | ");
      message = `${message}${message.includes(detail) ? "" : ` — ${detail}`}`;
    }
    throw new OpsMutationError(message, { status: res.status, invalid });
  }

  return json as T;
}