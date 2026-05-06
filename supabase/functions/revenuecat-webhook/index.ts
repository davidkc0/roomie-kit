/**
 * RevenueCat Webhook Handler
 * 
 * Receives purchase events from RevenueCat and credits coins
 * via the modify_coins RPC. Uses transaction ID for idempotency.
 * 
 * Deploy: supabase functions deploy revenuecat-webhook --no-verify-jwt
 * Webhook URL: https://<project-ref>.supabase.co/functions/v1/revenuecat-webhook
 * Set Authorization header in RC dashboard: Bearer <REVENUECAT_WEBHOOK_SECRET>
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Product ID → coin amount mapping (must match App Store Connect products)
const COIN_MAP: Record<string, number> = {
    'coins_100': 100,
    'coins_550': 550,
    'coins_1200': 1200,
    'coins_2750': 2750,
    'coins_7500': 7500,
    'coins_17500': 17500,
}

serve(async (req) => {
    // Only accept POST
    if (req.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 })
    }

    // Verify authorization header from RevenueCat
    const webhookSecret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET')
    const authHeader = req.headers.get('Authorization')

    if (!webhookSecret || authHeader !== `Bearer ${webhookSecret}`) {
        console.error('[RC Webhook] Unauthorized request')
        return new Response('Unauthorized', { status: 401 })
    }

    try {
        const body = await req.json()
        const event = body.event

        if (!event) {
            console.log('[RC Webhook] No event in payload')
            return new Response('OK', { status: 200 })
        }

        console.log('[RC Webhook] Received event:', event.type, 'product:', event.product_id)

        // Only process purchase events for consumables
        // INITIAL_PURCHASE covers first-time consumable purchases
        // NON_RENEWING_PURCHASE covers non-renewing consumables
        if (event.type !== 'INITIAL_PURCHASE' && event.type !== 'NON_RENEWING_PURCHASE') {
            console.log('[RC Webhook] Ignoring event type:', event.type)
            return new Response('OK', { status: 200 })
        }

        const userId = event.app_user_id  // = Supabase auth.uid
        const productId = event.product_id
        const coins = COIN_MAP[productId]

        if (!userId) {
            console.error('[RC Webhook] Missing app_user_id')
            return new Response('OK', { status: 200 })  // Don't retry
        }

        if (!coins) {
            console.error('[RC Webhook] Unknown product_id:', productId)
            return new Response('OK', { status: 200 })  // Don't retry
        }

        // Idempotency: use RC transaction_id to prevent double-crediting
        const transactionId = event.transaction_id || event.id || `${event.type}_${Date.now()}`

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // Check if this transaction was already processed
        const { data: existing } = await supabase
            .from('transactions')
            .select('id')
            .eq('metadata->>rc_transaction_id', transactionId)
            .maybeSingle()

        if (existing) {
            console.log('[RC Webhook] Transaction already processed:', transactionId)
            return new Response('OK', { status: 200 })
        }

        // Credit coins via modify_coins RPC
        const { data, error } = await supabase.rpc('modify_coins', {
            p_user_id: userId,
            p_amount: coins,
            p_type: 'purchase',
            p_metadata: {
                rc_transaction_id: transactionId,
                rc_product_id: productId,
                rc_event_type: event.type,
                store: event.store || 'unknown',
                price_in_usd: event.price_in_purchased_currency || null,
            },
        })

        if (error) {
            console.error('[RC Webhook] modify_coins failed:', error)
            // Return 500 so RevenueCat retries
            return new Response('Server Error', { status: 500 })
        }

        console.log('[RC Webhook] Credited', coins, 'coins to user', userId, 'balance:', data?.balance)
        return new Response('OK', { status: 200 })

    } catch (err: any) {
        console.error('[RC Webhook] Error:', err.message || err)
        return new Response('Server Error', { status: 500 })
    }
})
