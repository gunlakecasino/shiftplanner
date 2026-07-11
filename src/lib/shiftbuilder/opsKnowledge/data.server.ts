/**
 * opsKnowledge/data.server.ts — admin/service-role load of Supervisor Brain.
 *
 * KD-5 / PR 6: ops_supervisor_knowledge is service_role-only under hardened RLS.
 * Browser `loadOpsKnowledge()` fail-softs to empty knowledge — unsafe for Apply
 * (hard accommodations would never block). This loader fails closed on error.
 */

import { createAdminClientSafe } from "@/app/api/admin/_lib/createAdminClient";
import { emptyOpsKnowledge, type OpsKnowledge } from "./types";

const TABLE = "ops_supervisor_knowledge";
const ROW_ID = "default";

export class OpsKnowledgeLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpsKnowledgeLoadError";
  }
}

/**
 * Load Supervisor Brain via admin client.
 * - Admin missing / query error → throws OpsKnowledgeLoadError (fail closed for Apply).
 * - Missing row → empty knowledge (successful read, nothing configured).
 */
export async function loadOpsKnowledgeServer(): Promise<OpsKnowledge> {
  const client = createAdminClientSafe();
  if (!client) {
    throw new OpsKnowledgeLoadError("Supervisor knowledge unavailable");
  }

  const { data, error } = await client
    .from(TABLE)
    .select("data")
    .eq("id", ROW_ID)
    .maybeSingle();

  if (error) {
    throw new OpsKnowledgeLoadError(
      `Supervisor knowledge unavailable: ${error.message}`,
    );
  }

  if (!data?.data) {
    return emptyOpsKnowledge();
  }

  return { ...emptyOpsKnowledge(), ...(data.data as OpsKnowledge) };
}
