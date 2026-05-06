/**
 * RevenueCat IAP Service
 * 
 * Wraps @revenuecat/purchases-capacitor for native IAP.
 * Coins are credited server-side via webhook — the client only
 * triggers the purchase and refreshes the balance afterward.
 */
import { Capacitor } from '@capacitor/core';
import { appConfig } from '../config/app';

// Lazy-loaded to avoid import errors on web
let Purchases: any = null;
let LOG_LEVEL: any = null;

// Maps coin amounts to App Store Connect product IDs
const PRODUCT_ID_MAP: Record<number, string> = {
    100: 'coins_100',
    550: 'coins_550',
    1200: 'coins_1200',
    2750: 'coins_2750',
    7500: 'coins_7500',
    17500: 'coins_17500',
};

let initialized = false;

/**
 * Initialize RevenueCat SDK. Must be called after user authenticates.
 * Safe to call on web — will silently no-op.
 */
export async function initRevenueCat(supabaseUserId: string): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
        console.log('[RC] Skipping init — not on native platform');
        return;
    }
    if (!appConfig.features.payments || !appConfig.revenueCatIosApiKey) {
        console.log('[RC] Skipping init — payments disabled or VITE_REVENUECAT_IOS_API_KEY missing');
        return;
    }

    if (initialized) {
        console.log('[RC] Already initialized');
        return;
    }

    try {
        // Dynamic import to avoid bundling native modules on web
        const rcModule = await import('@revenuecat/purchases-capacitor');
        Purchases = rcModule.Purchases;
        LOG_LEVEL = rcModule.LOG_LEVEL;

        await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
        await Purchases.configure({
            apiKey: appConfig.revenueCatIosApiKey,
            appUserID: supabaseUserId,
        });

        initialized = true;
        console.log('[RC] Initialized for user:', supabaseUserId);
    } catch (err) {
        console.error('[RC] Init failed:', err);
    }
}

/**
 * Purchase a coin pack via native IAP.
 * Returns true if purchase succeeded, throws on error.
 * User cancellation throws with code PURCHASE_CANCELLED.
 */
export async function purchaseCoinPack(coins: number): Promise<boolean> {
    if (!Purchases) throw new Error('RevenueCat not initialized');

    const productId = PRODUCT_ID_MAP[coins];
    if (!productId) throw new Error(`No product mapping for ${coins} coins`);

    // Fetch offerings from RevenueCat
    const result = await Purchases.getOfferings();
    console.log('[RC] getOfferings result keys:', Object.keys(result));

    // The Capacitor plugin can return data in different shapes:
    // { offerings: { current, all } } or { current, all } directly
    const offerings = result.offerings || result;
    console.log('[RC] offerings keys:', Object.keys(offerings));
    console.log('[RC] current?', !!offerings.current, 'all?', !!offerings.all);

    // Try current first, then fall back to all.default
    const offering = offerings.current || offerings.all?.['default'];
    if (!offering) {
        console.error('[RC] No offering found. Full result:', JSON.stringify(result).substring(0, 500));
        throw new Error('No offerings available from RevenueCat');
    }

    console.log('[RC] Using offering:', offering.identifier, 'packages:', offering.availablePackages?.length);

    // Find the matching package by product identifier
    const pkg = offering.availablePackages.find(
        (p: any) => p.product.identifier === productId
    );
    if (!pkg) {
        const available = offering.availablePackages.map((p: any) => p.product.identifier);
        console.error('[RC] Package not found. Available:', available);
        throw new Error(`Package ${productId} not found. Available: ${available.join(', ')}`);
    }

    console.log('[RC] Purchasing package:', pkg.product.identifier, pkg.product.priceString);

    // Present the native payment sheet
    await Purchases.purchasePackage({ aPackage: pkg });

    // If we get here, purchase succeeded.
    // Coins are credited server-side via the RC webhook.
    console.log('[RC] Purchase succeeded for:', productId);
    return true;
}

/**
 * Fetch available coin packs with localized prices from the store.
 * Falls back to null on web or if offerings aren't loaded.
 */
export async function getLocalizedPrices(): Promise<Array<{
    coins: number;
    productId: string;
    localizedPrice: string;
}> | null> {
    if (!Purchases) return null;

    try {
        const { offerings } = await Purchases.getOfferings();
        const current = offerings?.current;
        if (!current) return null;

        const prices: Array<{ coins: number; productId: string; localizedPrice: string }> = [];

        for (const [coinsStr, productId] of Object.entries(PRODUCT_ID_MAP)) {
            const pkg = current.availablePackages.find(
                (p: any) => p.product.identifier === productId
            );
            if (pkg) {
                prices.push({
                    coins: parseInt(coinsStr),
                    productId: productId as string,
                    localizedPrice: pkg.product.priceString || `$${(pkg.product.price || 0).toFixed(2)}`,
                });
            }
        }

        return prices.length > 0 ? prices : null;
    } catch (err) {
        console.error('[RC] Failed to fetch prices:', err);
        return null;
    }
}

/**
 * Check if running on a native platform (iOS/Android).
 */
export function isNativePlatform(): boolean {
    return Capacitor.isNativePlatform();
}
