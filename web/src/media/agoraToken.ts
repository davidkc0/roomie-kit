import { supabase } from '../lib/supabase';

type AgoraRole = 'publisher' | 'subscriber';

export async function getAgoraRtcToken(
    channelName: string,
    uid?: string | number,
    role: AgoraRole = 'publisher'
): Promise<string | null> {
    const { data: { session } } = await supabase.auth.getSession();
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        console.warn('[AgoraToken] Missing Supabase env; joining without token.');
        return null;
    }

    try {
        const response = await fetch(`${supabaseUrl}/functions/v1/agora-token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                apikey: supabaseAnonKey,
                ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
            },
            body: JSON.stringify({ channelName, uid, role }),
        });

        if (!response.ok) {
            const detail = await response.text();
            console.warn('[AgoraToken] Token endpoint unavailable; joining without token.', detail);
            return null;
        }

        const payload = await response.json();
        return payload.token || null;
    } catch (error) {
        console.warn('[AgoraToken] Token request failed; joining without token.', error);
        return null;
    }
}
