import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Weekly Leaderboard Reset Cron Job
 * 
 * This function should be triggered every Monday at 00:00 UTC.
 * It closes the previous week's leaderboards and awards gems to winners.
 * 
 * Setup with Supabase Dashboard:
 * 1. Go to Database > Extensions > Enable pg_cron
 * 2. Or use external scheduler (Vercel Cron, GitHub Actions, etc.)
 */
serve(async (req) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // Create admin client (service role for RPC calls...)
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // Games to process
        const games = ['snake', 'match3']
        const results: Record<string, any> = {}

        // [APPLE_COMPLIANCE] Weekly gem payouts disabled.
        // The close_weekly_leaderboard RPC awards gems to rank #1 players,
        // which Apple may flag as real-money gambling. This cron job is
        // effectively a no-op until gem payouts are re-approved.
        //
        // To re-enable: uncomment the RPC call below and remove the skip block.
        for (const game of games) {
            console.log(`[WeeklyReset] [APPLE_COMPLIANCE] Skipping ${game} — gem payouts disabled`)
            results[game] = { skipped: true, reason: 'APPLE_COMPLIANCE: gem payouts disabled' }

            // Original gem payout logic:
            // console.log(`[WeeklyReset] Processing ${game}...`)
            // const { data, error } = await supabaseAdmin.rpc('close_weekly_leaderboard', {
            //     p_game: game
            // })
            // if (error) {
            //     console.error(`[WeeklyReset] Error closing ${game}:`, error)
            //     results[game] = { error: error.message }
            // } else {
            //     console.log(`[WeeklyReset] ${game} result:`, data)
            //     results[game] = data
            // }
        }

        return new Response(
            JSON.stringify({
                success: true,
                results,
                timestamp: new Date().toISOString()
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error: any) {
        console.error('[WeeklyReset] Error:', error)
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
        )
    }
})
