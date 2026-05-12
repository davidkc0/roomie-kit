import { supabase } from '../lib/supabase';

type AgoraRole = 'publisher' | 'subscriber';

export async function getAgoraRtcToken(
    channelName: string,
    uid?: string | number,
    role: AgoraRole = 'publisher'
): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession();
    const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
    const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Missing Supabase env for Agora token service.');
    }

    if (!session?.access_token) {
        throw new Error('Missing Supabase session for Agora token service.');
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
            throw new Error(`Agora token endpoint failed (${response.status}): ${detail}`);
        }

        const payload = await response.json();
        if (!payload.token) {
            throw new Error('Agora token endpoint returned no token.');
        }

        return payload.token;
    } catch (error) {
        console.error('[AgoraToken] Token request failed.', error);
        throw error;
    }
}
