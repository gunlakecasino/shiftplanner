/**
 * opsKnowledge/data.ts — load/save the Supervisor Brain (session-gated).
 *
 * Single global row ('default') for the solo ops tool. After service_role-only
 * RLS, browser must not touch ops_supervisor_knowledge with the anon key —
 * all I/O goes through postOpsMutation → mutations API (admin client).
 * Fails soft on load so the engine behaves as before when session/API is down.
 */

import { postOpsMutation } from "../opsMutationClient";
import { emptyOpsKnowledge, type OpsKnowledge } from "./types";

export async function loadOpsKnowledge(): Promise<OpsKnowledge> {
  if (typeof window === "undefined") {
    return emptyOpsKnowledge();
  }
  try {
    const res = await postOpsMutation<{ knowledge?: OpsKnowledge }>("load_ops_knowledge");
    if (!res.knowledge) return emptyOpsKnowledge();
    return { ...emptyOpsKnowledge(), ...res.knowledge };
  } catch {
    return emptyOpsKnowledge();
  }
}

export async function saveOpsKnowledge(
  knowledge: OpsKnowledge,
): Promise<{ ok: boolean; error?: string }> {
  if (typeof window === "undefined") {
    return {
      ok: false,
      error:
        "saveOpsKnowledge is browser-only; use saveOpsKnowledgeServer after requireOpsPermission",
    };
  }
  try {
    await postOpsMutation("save_ops_knowledge", { knowledge });
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "save failed";
    return { ok: false, error: msg };
  }
}
