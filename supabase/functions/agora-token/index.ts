import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { RtcRole, RtcTokenBuilder } from "npm:agora-access-token@2.0.4";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type TokenRequest = {
    channelName?: string;
    uid?: string | number;
    role?: "publisher" | "subscriber";
    ttlSeconds?: number;
};

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

function safeTtl(requested?: number): number {
    const fallback = Number(Deno.env.get("AGORA_TOKEN_TTL_SECONDS") || 3600);
    const value = Number.isFinite(requested || NaN) ? Number(requested) : fallback;
    return Math.min(Math.max(value, 60), 24 * 60 * 60);
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

        const appId = Deno.env.get("AGORA_APP_ID")?.trim();
        const appCertificate = Deno.env.get("AGORA_APP_CERTIFICATE")?.trim();

        if (!appId || !appCertificate) {
            return json({ error: "Agora token service is not configured" }, 501);
        }

        const authHeader = req.headers.get("Authorization");
        if (!authHeader) return json({ error: "Missing authorization header" }, 401);

        const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
        const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
        if (!supabaseUrl || !supabaseAnonKey) {
            return json({ error: "Supabase function environment is not configured" }, 501);
        }

        const supabase = createClient(
            supabaseUrl,
            supabaseAnonKey,
            { auth: { autoRefreshToken: false, persistSession: false } }
        );

        const token = authHeader.replace("Bearer ", "");
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return json({ error: "Invalid or expired session" }, 401);

        let body: TokenRequest;
        try {
            body = await req.json();
        } catch {
            return json({ error: "Invalid JSON body" }, 400);
        }

        const channelName = body.channelName?.trim();
        if (!channelName || channelName.length > 64) {
            return json({ error: "channelName is required and must be 64 characters or fewer" }, 400);
        }

        const uid = String(body.uid || user.id).trim();
        if (!uid || uid.length > 255) {
            return json({ error: "uid must be 255 characters or fewer" }, 400);
        }

        const role = body.role === "subscriber" ? RtcRole.SUBSCRIBER : RtcRole.PUBLISHER;
        const expiresAt = Math.floor(Date.now() / 1000) + safeTtl(body.ttlSeconds);
        const agoraToken = RtcTokenBuilder.buildTokenWithAccount(
            appId,
            appCertificate,
            channelName,
            uid,
            role,
            expiresAt
        );

        return json({ token: agoraToken, appId, channelName, uid, expiresAt });
    } catch (error) {
        console.error("[agora-token] Unhandled error", error);
        return json({
            error: "Failed to issue Agora token",
            detail: error instanceof Error ? error.message : String(error),
        }, 500);
    }
});
