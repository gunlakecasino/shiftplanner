// supabase/functions/verify-pin/index.ts
// Minimal, secure 6-digit PIN-only verifier for GRAVE Ops ShiftBuilder.
// The PIN itself identifies the operator (no username/email selection in the UI).
//
// Uses the existing public.users table + bcrypt pin_hash.
// Called from the browser PinGate. Never trusts client for auth decisions.
// Returns only the safe operator profile on success (no hash ever leaves the function).
//
// NOTE: This function deliberately runs without JWT verification (`verify_jwt = false`).
// We use a custom PIN-based auth system instead of Supabase Auth sessions.
// The request is authenticated purely by checking the submitted 6-digit PIN against
// the hashed value stored in public.users.pin_hash.
//
// We use bcryptjs instead of deno.land/x/bcrypt because the latter requires Web Workers
// which are not available in Supabase Edge Functions.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Use bcryptjs (via esm.sh) because the old deno.land/x/bcrypt library
// requires Web Workers, which are not available in Supabase Edge Functions.
// esm.sh provides a bundled version that works reliably in the Edge runtime.
//
// Note: esm.sh can export bcryptjs in different shapes depending on the bundler.
// We normalize it below so .compare and .hash are always available.
import _bcrypt from "https://esm.sh/bcryptjs@2.4.3";
const bcrypt = _bcrypt.default || _bcrypt;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { pin } = await req.json();

    if (!pin || typeof pin !== "string" || pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      return new Response(JSON.stringify({ error: "Invalid PIN format" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Fetch all active operators who have a PIN set.
    // (The set is tiny — internal ops tool. This is safe and simple.)
    const { data: candidates, error: lookupErr } = await supabase
      .from("users")
      .select("id, email, full_name, username, role, is_active, pin_hash, permissions")
      .eq("is_active", true)
      .not("pin_hash", "is", null);

    if (lookupErr || !candidates || candidates.length === 0) {
      // Perform a dummy compare for consistent timing
      await bcrypt.compare("000000", "$2a$12$dummyhashforsecuritytimingonlynotreal");
      return new Response(JSON.stringify({ error: "Invalid credentials" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let matchedUser: any = null;

    // Normalize bcrypt prefix for better compatibility with deno bcrypt library
    // (pgcrypto often emits $2a$, while the library prefers $2b$ behavior)
    const normalizeBcrypt = (h: string) => h.replace(/^\$2a\$/, '$2b$');

    console.log(`[verify-pin] Found ${candidates.length} active user(s) with PIN hash`);

    for (const u of candidates) {
      try {
        const hashToTest = normalizeBcrypt(u.pin_hash);
        const prefix = hashToTest.substring(0, 7);
        console.log(`[verify-pin] Testing user ${u.username} (${u.full_name}) — hash prefix: ${prefix}`);

        const ok = await bcrypt.compare(pin, hashToTest);

        console.log(`[verify-pin] compare result for ${u.username}: ${ok}`);

        if (ok) {
          matchedUser = u;
          break;
        }
      } catch (compareErr) {
        console.error(`[verify-pin] compare error for user ${u.username}:`, compareErr);
      }
    }

    if (!matchedUser) {
      console.log(`[verify-pin] No user matched the provided PIN`);
      return new Response(JSON.stringify({ error: "Invalid credentials" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[verify-pin] SUCCESS — authenticated as ${matchedUser.username} (${matchedUser.role})`);

    // Success — return only the safe profile. Never return pin_hash or any secrets.
    const safeUser = {
      id: matchedUser.id,
      email: matchedUser.email,
      full_name: matchedUser.full_name,
      username: matchedUser.username,
      role: matchedUser.role,
      permissions: matchedUser.permissions ?? null,
    };

    return new Response(JSON.stringify({ success: true, user: safeUser }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[verify-pin] UNCAUGHT error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
