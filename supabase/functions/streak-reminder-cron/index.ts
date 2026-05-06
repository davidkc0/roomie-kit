/**
 * Streak Reminder Cron Edge Function
 *
 * Runs hourly (scheduled via cron-job.org or equivalent).
 * Calls the get_streak_reminder_candidates RPC to get users
 * with active streaks who have push tokens enabled.
 * For each: checks if it's 8 PM in their timezone, if they
 * haven't claimed today, and if their streak is still alive.
 * Sends a OneSignal push notification if all conditions met.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID');
const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY');

serve(async (_req) => {
    try {
        if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
            throw new Error('Missing ONESIGNAL_APP_ID or ONESIGNAL_REST_API_KEY secret');
        }

        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        console.log('[StreakReminder] Starting hourly streak reminder check...');

        // Get candidates via RPC (handles the multi-table join in SQL)
        const { data: candidates, error: queryError } = await supabaseAdmin
            .rpc('get_streak_reminder_candidates');

        if (queryError) {
            throw new Error(`RPC failed: ${queryError.message}`);
        }

        if (!candidates || candidates.length === 0) {
            console.log('[StreakReminder] No candidates found');
            return new Response(JSON.stringify({ sent: 0 }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        console.log(`[StreakReminder] Found ${candidates.length} candidates`);
        let sentCount = 0;

        for (const user of candidates) {
            const userTz = user.user_tz || 'America/New_York';

            // Calculate current hour in user's timezone
            const nowInUserTz = new Date().toLocaleString('en-US', { timeZone: userTz, hour12: false });
            const userHour = parseInt(nowInUserTz.split(', ')[1]?.split(':')[0] || '0');

            // Only send at 8 PM local time
            if (userHour !== 20) continue;

            // Check if they already claimed today in their timezone
            const todayInUserTz = new Date().toLocaleDateString('en-CA', { timeZone: userTz });
            const lastClaimInUserTz = new Date(user.last_daily_claim).toLocaleDateString('en-CA', { timeZone: userTz });

            // Already claimed today — skip
            if (lastClaimInUserTz === todayInUserTz) continue;

            // Check if streak is still alive (claimed yesterday)
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayInUserTz = yesterday.toLocaleDateString('en-CA', { timeZone: userTz });

            if (lastClaimInUserTz !== yesterdayInUserTz) {
                // Streak already dead, no point warning
                continue;
            }

            // Send the notification via OneSignal
            const title = "Don't lose your streak! 🔥";
            const message = `🔥 Your ${user.streak_days}-day streak expires at midnight! Open the app to claim your reward.`;

            try {
                const onesignalResponse = await fetch('https://onesignal.com/api/v1/notifications', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`,
                    },
                    body: JSON.stringify({
                        app_id: ONESIGNAL_APP_ID,
                        include_external_user_ids: [user.user_id],
                        headings: { en: title },
                        contents: { en: message },
                        data: { type: 'streak_reminder', streak: user.streak_days },
                        ios_sound: 'default',
                        android_sound: 'default',
                    }),
                });

                const result = await onesignalResponse.json();

                if (onesignalResponse.ok) {
                    console.log(`[StreakReminder] ✅ Sent to ${user.user_id} (${user.streak_days}-day streak)`);
                    sentCount++;

                    // Log to notification_log
                    await supabaseAdmin.from('notification_log').insert({
                        user_id: user.user_id,
                        notification_type: 'streak_reminders',
                        title,
                        message,
                        data: { type: 'streak_reminder', streak: user.streak_days },
                        delivered: true,
                    });
                } else {
                    console.error(`[StreakReminder] ❌ Failed for ${user.user_id}:`, result);
                }
            } catch (sendErr) {
                console.error(`[StreakReminder] ❌ Send error for ${user.user_id}:`, sendErr);
            }
        }

        console.log(`[StreakReminder] Done. Sent ${sentCount} reminders.`);
        return new Response(JSON.stringify({ sent: sentCount }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error: any) {
        console.error('[StreakReminder] Error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { 'Content-Type': 'application/json' }, status: 500 }
        );
    }
});
