// supabase/functions/create-user/index.ts
//
// RETIRED (P0 security — 2026-07-11 remediation PR 1 / KD-18)
//
// Former behavior: unauthenticated POST, CORS *, service-role RPC
// create_user_with_pin, default role utility_ops_super. Gateway JWT
// shape checks are NOT app auth — do not treat verify_jwt as mitigation.
//
// Inventory (mandatory before / with merge — product lock KD-18):
// 1. Supabase Dashboard → Edge Functions → confirm whether create-user is deployed.
// 2. CLI: `supabase functions list` (project-linked) or inspect functions URL.
// 3. If deployed → undeploy/delete in dashboard immediately (do not leave live
//    during code PR lag). Prefer not re-deploying this path at all.
// 4. Grep monorepo + runbooks/CI/Railway for create-user / functions/create-user.
//
// Canonical user create (session-gated, sudo_admin + admin PIN confirm):
//   POST /api/admin/users  (UsersTab → adminUsersClient)
//
// This stub intentionally uses no service role and performs no user creation.
// Re-deploying it only returns 410 Gone. Prefer full undeploy so the URL 404s.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 410, headers });
  }

  console.warn(
    "[create-user] retired edge function hit — refusing creation; use POST /api/admin/users",
    { method: req.method, url: req.url },
  );

  return new Response(
    JSON.stringify({
      success: false,
      error:
        "create-user Edge Function has been retired. Create operators via ShiftBuilder Settings → Users (POST /api/admin/users) with a sudo_admin session.",
      code: "CREATE_USER_EDGE_RETIRED",
    }),
    { status: 410, headers },
  );
});
