/**
 * Delete Account Edge Function
 * 
 * Securely deletes a user's account using the service_role key.
 * Cleans up all user data from tables that lack ON DELETE CASCADE
 * before removing the auth user.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // 1. Verify the caller's JWT
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return new Response(
                JSON.stringify({ error: 'Missing authorization header' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Create a client to verify the user's identity
        const supabaseUser = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            {
                auth: { autoRefreshToken: false, persistSession: false },
            }
        )

        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: userError } = await supabaseUser.auth.getUser(token)
        if (userError) {
            console.error('[delete-account] Auth verification failed:', userError.message)
        }
        if (userError || !user) {
            return new Response(
                JSON.stringify({ error: 'Invalid or expired session' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const userId = user.id
        console.log(`[delete-account] Starting deletion for user: ${userId} (${user.email})`)

        // 2. Create admin client with service_role key
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            {
                auth: { autoRefreshToken: false, persistSession: false },
            }
        )

        // 3. Clean up user data in dependency order
        //
        // Dependency chain:
        //   auth.users ← profiles (need to delete profiles before auth user)
        //   profiles   ← waitlist, invite_codes, gift_transactions, profiles.invited_by
        //   auth.users ← user_coins, user_gems, transactions, user_inventory
        //   rooms      ← room_items (rooms.owner_id is the column)
        //
        // Tables with ON DELETE CASCADE from profiles: push_tokens, notification_preferences, notification_log
        // Tables with ON DELETE CASCADE from auth.users: user_presence, reports, blocked_users, chess_ratings

        const cleanup = async (table: string, query: any) => {
            try {
                const { error } = await query
                if (error) {
                    console.warn(`[delete-account] ${table}: ${error.message}`)
                } else {
                    console.log(`[delete-account] ${table}: cleaned`)
                }
            } catch (e) {
                console.warn(`[delete-account] ${table}: ${e}`)
            }
        }

        // Step A: Get user's room IDs (rooms.owner_id = userId)
        const { data: rooms } = await supabaseAdmin
            .from('rooms')
            .select('id')
            .eq('owner_id', userId)
        const roomIds = rooms?.map((r: any) => r.id) || []

        // Step B: Delete room children first
        if (roomIds.length > 0) {
            await cleanup('room_items', supabaseAdmin.from('room_items').delete().in('room_id', roomIds))
        }

        // Step C: Delete rooms
        await cleanup('rooms', supabaseAdmin.from('rooms').delete().eq('owner_id', userId))

        // Step D: Tables referencing auth.users WITHOUT CASCADE
        await cleanup('user_inventory', supabaseAdmin.from('user_inventory').delete().eq('user_id', userId))
        await cleanup('transactions', supabaseAdmin.from('transactions').delete().eq('user_id', userId))
        await cleanup('user_coins', supabaseAdmin.from('user_coins').delete().eq('user_id', userId))
        await cleanup('user_gems', supabaseAdmin.from('user_gems').delete().eq('user_id', userId))

        // Step E: Tables referencing profiles(id) WITHOUT CASCADE
        await cleanup('waitlist', supabaseAdmin.from('waitlist').delete().eq('user_id', userId))
        await cleanup('invite_codes (owner)', supabaseAdmin.from('invite_codes').delete().eq('owner_id', userId))
        await cleanup('invite_codes (used_by)', supabaseAdmin.from('invite_codes').update({ used_by: null }).eq('used_by', userId))
        await cleanup('gift_transactions (sender)', supabaseAdmin.from('gift_transactions').delete().eq('sender_id', userId))
        await cleanup('gift_transactions (recipient)', supabaseAdmin.from('gift_transactions').delete().eq('recipient_id', userId))
        await cleanup('friendships (1)', supabaseAdmin.from('friendships').delete().eq('user_id_1', userId))
        await cleanup('friendships (2)', supabaseAdmin.from('friendships').delete().eq('user_id_2', userId))

        // Step F: Clear self-reference on profiles before deleting
        await cleanup('profiles.invited_by', supabaseAdmin.from('profiles').update({ invited_by: null }).eq('id', userId))
        // Also clear invited_by on OTHER profiles that reference this user
        await cleanup('profiles.invited_by (others)', supabaseAdmin.from('profiles').update({ invited_by: null }).eq('invited_by', userId))

        // Step G: Delete the profile itself
        await cleanup('profiles', supabaseAdmin.from('profiles').delete().eq('id', userId))

        console.log(`[delete-account] Data cleanup complete, deleting auth user...`)

        // 4. Delete the auth user
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)

        if (deleteError) {
            console.error(`[delete-account] Failed to delete user ${userId}:`, deleteError)
            return new Response(
                JSON.stringify({ error: 'Failed to delete account', detail: deleteError.message }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        console.log(`[delete-account] Successfully deleted user: ${userId}`)

        return new Response(
            JSON.stringify({ success: true }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (err) {
        console.error('[delete-account] Unexpected error:', err)
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
