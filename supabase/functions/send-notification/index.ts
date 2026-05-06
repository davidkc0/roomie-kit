/**
 * Send Push Notification Edge Function
 * 
 * This function sends push notifications via OneSignal.
 * It can be called by:
 * 1. Database triggers/webhooks
 * 2. Other Edge Functions
 * 3. Client-side (for specific use cases)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// OneSignal configuration
const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID');
const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY');

interface NotificationPayload {
    // Target user to send notification to
    target_user_id: string;
    // Notification type for preference checking
    notification_type: 'friend_requests' | 'room_visits' | 'whiteboard_messages' | 'tournament_wins' | 'marketing' | 'streak_reminders' | 'account_activation';
    // Notification content
    title: string;
    message: string;
    // Deep link data (optional)
    data?: {
        type: string;
        source_id?: string;
    };
}

serve(async (req) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
            throw new Error('Missing ONESIGNAL_APP_ID or ONESIGNAL_REST_API_KEY secret');
        }

        // Create admin client for database operations
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // Parse the request body
        const payload: NotificationPayload = await req.json();

        if (!payload.target_user_id || !payload.notification_type || !payload.title || !payload.message) {
            throw new Error('Missing required fields: target_user_id, notification_type, title, message');
        }

        console.log('[SendNotification] Request for user:', payload.target_user_id, 'type:', payload.notification_type);

        // 1. Check user's notification preferences (skip for account_activation — always deliver)
        if (payload.notification_type !== 'account_activation') {
            const { data: prefs } = await supabaseAdmin
                .from('notification_preferences')
                .select(payload.notification_type)
                .eq('user_id', payload.target_user_id)
                .single();

            // If preferences exist and the specific type is disabled, skip
            if (prefs && prefs[payload.notification_type] === false) {
                console.log('[SendNotification] User has disabled this notification type');
                return new Response(
                    JSON.stringify({ success: false, reason: 'notification_disabled' }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }
        }

        // 2. Get the user's push token
        const { data: tokenData } = await supabaseAdmin
            .from('push_tokens')
            .select('onesignal_player_id, platform')
            .eq('user_id', payload.target_user_id)
            .single();

        if (!tokenData?.onesignal_player_id) {
            console.log('[SendNotification] No push token for user');
            return new Response(
                JSON.stringify({ success: false, reason: 'no_push_token' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 3. Send notification via OneSignal
        const onesignalPayload = {
            app_id: ONESIGNAL_APP_ID,
            include_external_user_ids: [payload.target_user_id],
            headings: { en: payload.title },
            contents: { en: payload.message },
            data: payload.data || {},
            ios_sound: 'default',
            android_sound: 'default',
        };

        console.log('[SendNotification] Sending to OneSignal...');

        const onesignalResponse = await fetch('https://onesignal.com/api/v1/notifications', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`,
            },
            body: JSON.stringify(onesignalPayload),
        });

        const onesignalResult = await onesignalResponse.json();

        if (!onesignalResponse.ok) {
            console.error('[SendNotification] OneSignal error:', onesignalResult);
            throw new Error(`OneSignal error: ${JSON.stringify(onesignalResult)}`);
        }

        console.log('[SendNotification] ✅ Sent successfully:', onesignalResult.id);

        // 4. Log the notification
        await supabaseAdmin
            .from('notification_log')
            .insert({
                user_id: payload.target_user_id,
                notification_type: payload.notification_type,
                title: payload.title,
                message: payload.message,
                data: payload.data,
                delivered: true,
            });

        return new Response(
            JSON.stringify({ success: true, notification_id: onesignalResult.id }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('[SendNotification] Error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
    }
});
