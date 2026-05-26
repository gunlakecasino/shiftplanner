import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  // Phase 1 stub - to be expanded with proper auth, validation, and activity_type enum
  const { grave_shift_id, activity_type, payload, actor } = await req.json()

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  )

  const { error } = await supabase.from("shift_activities").insert({
    grave_shift_id,
    activity_type,
    payload: payload ?? {},
    actor_type: actor?.type ?? "edge_function",
    actor_id: actor?.id ?? "system",
  })

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400 })
  }

  return new Response(JSON.stringify({ success: true }), { status: 200 })
})

