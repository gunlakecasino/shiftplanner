/**
 * Compose TanStack Query's cancel signal with a fetch timeout.
 * Route changes / drag-start cancelQueries abort the in-flight night
 * request so a stale response cannot land after the operator has moved on.
 */
export function bindNightBoardAbortSignal(
  timeoutMs: number,
  external?: AbortSignal,
): {
  signal: AbortSignal;
  cleanup: () => void;
  wasTimeout: () => boolean;
} {
  const controller = new AbortController();
  let timedOut = false;

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onExternalAbort = () => {
    controller.abort();
  };

  if (external) {
    if (external.aborted) {
      controller.abort();
    } else {
      external.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    wasTimeout: () => timedOut && !external?.aborted,
    cleanup: () => {
      clearTimeout(timeout);
      external?.removeEventListener("abort", onExternalAbort);
    },
  };
}

export function isNightBoardAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof Error && error.name === "AbortError") return true;
  return false;
}
