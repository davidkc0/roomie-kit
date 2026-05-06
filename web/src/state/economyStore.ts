import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { appConfig } from '../config/app';

/** Device timezone for daily reward calendar-day logic */
function getDeviceTimezone(): string {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
    } catch {
        return 'America/New_York';
    }
}

type EconomyState = {
    // Coin state
    coinBalance: number;
    coinLifetimePurchased: number;
    streak: number;
    lastClaim: Date | null | undefined;

    // Pending daily reward (from check_daily_reward RPC)
    pendingReward: {
        pendingStreak: number;
        baseReward: number;
        milestoneBonus: number;
        totalReward: number;
    } | null;

    // Session state


    // Gem state
    gemBalance: number;
    gemLifetimeEarned: number;
    gemLifetimeWithdrawn: number;

    // UI state
    loading: boolean;
    error: string | null;
    showPurchaseDrawer: boolean;
    showDailyReward: boolean;
    showStreakDrawer: boolean;
    dailyRewardDismissed: boolean;
    sessionChecked: boolean;

    // Game play cost cache
    gamePlayCostCache: Record<string, { isFree: boolean; cost: number; playsToday: number; checkedAt: number }>;
};

type EconomyActions = {
    // Fetch balances
    fetchBalances: () => Promise<void>;

    // Coin actions
    claimDaily: () => Promise<{ reward: number; streak: number } | null>;
    purchaseCoins: (amount: number, usdAmount: number) => Promise<boolean>;
    spendCoins: (amount: number, type: string, metadata?: any) => Promise<boolean>;

    // Gem actions
    earnGems: (amount: number, type: string, metadata?: any) => Promise<void>;
    withdrawGems: (amount: number) => Promise<boolean>;

    // Game play actions
    checkGamePlayCost: (game: string) => Promise<{ isFree: boolean; cost: number; balance: number; playsToday: number }>;
    startGamePlay: (game: string) => Promise<{ allowed: boolean; free: boolean; cost: number; balance: number; reason?: string }>;

    // UI actions
    checkDailyReward: () => Promise<void>;
    openPurchaseDrawer: () => void;
    closePurchaseDrawer: () => void;
    setShowDailyReward: (show: boolean) => void;
    dismissDailyReward: () => void;
    openStreakDrawer: () => void;
    closeStreakDrawer: () => void;
};

export const useEconomyStore = create<EconomyState & EconomyActions>((set, get) => ({
    // Initial state
    coinBalance: 0,
    coinLifetimePurchased: 0,
    streak: 0,
    lastClaim: undefined,
    pendingReward: null,
    gemBalance: 0,
    gemLifetimeEarned: 0,
    gemLifetimeWithdrawn: 0,
    loading: false,
    error: null,
    showPurchaseDrawer: false,
    showDailyReward: false,
    dailyRewardDismissed: false,
    showStreakDrawer: false,
    sessionChecked: false,
    gamePlayCostCache: {},

    // Fetch both coins and gems
    fetchBalances: async () => {
        if (!appConfig.features.economy) {
            set({ coinBalance: 0, gemBalance: 0, loading: false, error: null });
            return;
        }

        set({ loading: true, error: null });
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            // Fetch coins
            const { data: coinsData, error: coinsError } = await supabase
                .from('user_coins')
                .select('balance, lifetime_purchased, streak_days, last_daily_claim')
                .eq('user_id', user.id)
                .single();

            if (coinsError && coinsError.code !== 'PGRST116') throw coinsError;

            // Fetch gems
            const { data: gemsData, error: gemsError } = await supabase
                .from('user_gems')
                .select('balance, lifetime_earned, lifetime_withdrawn')
                .eq('user_id', user.id)
                .single();

            if (gemsError && gemsError.code !== 'PGRST116') throw gemsError;

            console.log('[Economy] Fetched balances. Streak:', coinsData?.streak_days, 'Coins:', coinsData?.balance);

            set({
                coinBalance: coinsData?.balance || 0,
                coinLifetimePurchased: coinsData?.lifetime_purchased || 0,
                streak: coinsData?.streak_days || 0,
                lastClaim: coinsData?.last_daily_claim ? new Date(coinsData.last_daily_claim) : null,
                gemBalance: gemsData?.balance || 0,
                gemLifetimeEarned: gemsData?.lifetime_earned || 0,
                gemLifetimeWithdrawn: gemsData?.lifetime_withdrawn || 0,
                loading: false
            });
        } catch (err: any) {
            set({ error: err.message, loading: false });
            console.error('[Economy] Failed to fetch balances:', err);
        }
    },

    // Claim daily coins
    claimDaily: async () => {
        if (!appConfig.features.dailyRewards) return null;

        set({ loading: true, error: null });
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            const { data, error } = await supabase.rpc('claim_daily_coins', {
                p_user_id: user.id,
                p_timezone: getDeviceTimezone()
            });

            if (error) throw error;

            // Immediately update streak from the claim result so badge/drawer are correct
            if (data?.streak != null) {
                set({ streak: data.streak });

                // Check for streak-based avatar unlocks
                if (data.streak >= 7) {
                    try {
                        const { data: unlockData } = await supabase.rpc('check_and_grant_streak_unlocks', {
                            p_user_id: user.id,
                            p_streak: data.streak,
                        });
                        if (unlockData?.count > 0) {
                            console.log('[Economy] Streak unlocks granted:', unlockData.unlocked);
                            // TODO: Show toast for newly unlocked items
                        }
                    } catch (unlockErr) {
                        console.warn('[Economy] Streak unlock check failed:', unlockErr);
                    }
                }
            }

            await get().fetchBalances();
            set({ loading: false });

            return data;
        } catch (err: any) {
            // Handle "Already claimed" gracefully - don't show as success
            if (err.message && err.message.includes('Already claimed')) {
                console.log('[Economy] Already claimed today, closing modal');
                set({ loading: false, showDailyReward: false });
                return null; // Return null to prevent success animation
            }

            set({ error: err.message, loading: false });
            console.error('[Economy] Failed to claim daily:', err);
            return null;
        }
    },

    // Purchase coins via RevenueCat on native, mock on web
    purchaseCoins: async (amount: number, usdAmount: number) => {
        if (!appConfig.features.economy || !appConfig.features.payments) {
            set({ error: 'Payments are disabled for this starter build' });
            return false;
        }

        set({ loading: true, error: null });
        try {
            const { purchaseCoinPack, isNativePlatform } = await import('../services/revenueCatService');

            if (isNativePlatform()) {
                // Real IAP via RevenueCat — presents native payment sheet
                // Coins are credited server-side via webhook, not here
                await purchaseCoinPack(amount);

                // Poll for webhook to process and credit coins
                // Webhook can take 5-15s in sandbox, typically faster in production
                const previousBalance = get().coinBalance;
                let credited = false;
                for (let i = 0; i < 6; i++) {
                    await new Promise(r => setTimeout(r, 2500));
                    await get().fetchBalances();
                    if (get().coinBalance > previousBalance) {
                        credited = true;
                        console.log('[Economy] Coins credited after', (i + 1) * 2.5, 'seconds');
                        break;
                    }
                }
                if (!credited) {
                    console.warn('[Economy] Coins not yet credited after 15s — may still arrive');
                }
            } else {
                // Web fallback (dev/testing only)
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) throw new Error('Not authenticated');
                const { error } = await supabase.rpc('modify_coins', {
                    p_user_id: user.id,
                    p_amount: amount,
                    p_type: 'purchase',
                    p_metadata: { usd_amount: usdAmount, source: 'web_mock' }
                });
                if (error) throw error;
            }

            await get().fetchBalances();
            set({ loading: false });
            return true;
        } catch (err: any) {
            // Don't show error for user cancellation
            const errCode = err?.code || err?.userCancelled;
            const errMsg = err?.message || err?.readableErrorMessage || err?.underlyingErrorMessage;
            if (errCode === 'PURCHASE_CANCELLED' || err?.userCancelled === true || errMsg?.includes('cancelled') || errMsg?.includes('canceled')) {
                console.log('[Economy] Purchase cancelled by user');
                set({ loading: false });
                return false;
            }
            set({ error: errMsg || 'Purchase failed', loading: false });
            console.error('[Economy] Failed to purchase coins:', JSON.stringify(err, null, 2), 'code:', errCode, 'msg:', errMsg);
            return false;
        }
    },

    // Spend coins
    spendCoins: async (amount: number, type: string, metadata = {}) => {
        if (!appConfig.features.economy) return true;

        const { coinBalance } = get();
        if (coinBalance < amount) {
            set({ error: 'Insufficient coins' });
            return false;
        }

        set({ loading: true, error: null });
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            const { error } = await supabase.rpc('modify_coins', {
                p_user_id: user.id,
                p_amount: -amount,
                p_type: type,
                p_metadata: metadata
            });

            if (error) throw error;

            await get().fetchBalances();
            set({ loading: false });
            return true;
        } catch (err: any) {
            set({ error: err.message, loading: false });
            console.error('[Economy] Failed to spend coins:', err);
            return false;
        }
    },

    // Earn gems (from receiving gifts)
    earnGems: async (amount: number, type: string, metadata = {}) => {
        if (!appConfig.features.economy || !appConfig.features.gifts) return;

        set({ loading: true, error: null });
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            const { error } = await supabase.rpc('modify_gems', {
                p_user_id: user.id,
                p_amount: amount,
                p_type: type,
                p_metadata: metadata
            });

            if (error) throw error;

            await get().fetchBalances();
            set({ loading: false });
        } catch (err: any) {
            set({ error: err.message, loading: false });
            console.error('[Economy] Failed to earn gems:', err);
        }
    },

    // Withdraw gems (convert to cash)
    withdrawGems: async (amount: number) => {
        if (!appConfig.features.economy) return false;

        const { gemBalance } = get();
        if (gemBalance < amount) {
            set({ error: 'Insufficient gems' });
            return false;
        }

        set({ loading: true, error: null });
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            // Calculate payout (85% to user, 15% to platform)
            const payoutGems = Math.floor(amount * 0.85);
            const platformFee = amount - payoutGems;

            const { error } = await supabase.rpc('modify_gems', {
                p_user_id: user.id,
                p_amount: -amount,
                p_type: 'gem_withdrawal',
                p_metadata: {
                    payout_gems: payoutGems,
                    platform_fee: platformFee,
                    // TODO: Add payment processor reference ID
                }
            });

            if (error) throw error;

            await get().fetchBalances();
            set({ loading: false });
            return true;
        } catch (err: any) {
            set({ error: err.message, loading: false });
            console.error('[Economy] Failed to withdraw gems:', err);
            return false;
        }
    },

    // UI actions
    checkDailyReward: async () => {
        if (!appConfig.features.dailyRewards) return;

        const state = get();
        // 1. If already checking or currently showing, exit
        console.log('[Economy] checkDailyReward called', {
            loading: state.loading,
            showDailyReward: state.showDailyReward
        });
        if (state.loading || state.showDailyReward) {
            console.log('[Economy] checkDailyReward: Exiting early (loading or already showing)');
            return;
        }

        // 2. Mark as loading to prevent duplicate calls
        set({ loading: true });

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                set({ loading: false });
                return;
            }

            // 3. Check LocalStorage dismissal (user-specific, persists across refreshes within same day)
            const dismissalKey = `daily_reward_dismissed_${user.id}`;
            const storedDismissal = localStorage.getItem(dismissalKey);
            if (storedDismissal) {
                const dismissalDate = new Date(storedDismissal);
                const now = new Date();
                if (dismissalDate.toISOString().slice(0, 10) === now.toISOString().slice(0, 10)) {
                    console.log('[Economy] Daily Reward: Already dismissed today for this user');
                    set({ loading: false });
                    return;
                }
            }

            // 4. Call backend to check eligibility and get correct pending reward
            const { data, error } = await supabase.rpc('check_daily_reward', {
                p_user_id: user.id,
                p_timezone: getDeviceTimezone()
            });

            if (error) {
                console.error('[Economy] check_daily_reward error:', error);
                set({ loading: false });
                return;
            }

            console.log('[Economy] check_daily_reward result:', data);

            // 5. If not eligible, don't show modal
            if (!data.eligible) {
                console.log('[Economy] Daily Reward: Not eligible (already claimed today)');
                set({ loading: false });
                return;
            }

            // 6. Store pending reward info and show modal
            set({
                pendingReward: {
                    pendingStreak: data.pending_streak,
                    baseReward: data.base_reward,
                    milestoneBonus: data.milestone_bonus,
                    totalReward: data.reward
                },
                loading: false,
                showDailyReward: true
            });
            console.log('[Economy] Daily Reward: Eligible! Showing modal. Pending streak:', data.pending_streak);
        } catch (err: any) {
            console.error('[Economy] checkDailyReward failed:', err);
            set({ loading: false });
        }
    },

    openPurchaseDrawer: () => {
        if (appConfig.features.payments) set({ showPurchaseDrawer: true });
    },
    closePurchaseDrawer: () => set({ showPurchaseDrawer: false }),
    setShowDailyReward: (show: boolean) => set({ showDailyReward: appConfig.features.dailyRewards ? show : false }),
    dismissDailyReward: () => set({ dailyRewardDismissed: true, showDailyReward: false }),
    openStreakDrawer: () => {
        if (appConfig.features.economy) set({ showStreakDrawer: true });
    },
    closeStreakDrawer: () => set({ showStreakDrawer: false }),

    // Check game play cost (cached for 5 minutes)
    checkGamePlayCost: async (game: string) => {
        if (!appConfig.features.economy) {
            return { isFree: true, cost: 0, balance: 0, playsToday: 0 };
        }

        const now = Date.now();
        const cached = get().gamePlayCostCache[game];

        // Return cached if less than 5 minutes old
        if (cached && now - cached.checkedAt < 5 * 60 * 1000) {
            return { isFree: cached.isFree, cost: cached.cost, balance: get().coinBalance, playsToday: cached.playsToday };
        }

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                return { isFree: false, cost: 5, balance: 0, playsToday: 0 };
            }

            const { data, error } = await supabase.rpc('check_game_play_cost', {
                p_user_id: user.id,
                p_game: game
            });

            if (error) {
                console.error('[Economy] Failed to check game play cost:', error);
                return { isFree: false, cost: 5, balance: get().coinBalance, playsToday: 0 };
            }

            const result = {
                isFree: data.is_free,
                cost: data.cost,
                playsToday: data.plays_today
            };

            // Cache the result
            set(state => ({
                gamePlayCostCache: {
                    ...state.gamePlayCostCache,
                    [game]: { ...result, checkedAt: now }
                }
            }));

            return { ...result, balance: data.balance };
        } catch (err) {
            console.error('[Economy] checkGamePlayCost error:', err);
            return { isFree: false, cost: 5, balance: get().coinBalance, playsToday: 0 };
        }
    },

    // Start game play (deduct coins if needed)
    startGamePlay: async (game: string) => {
        if (!appConfig.features.economy) {
            return { allowed: true, free: true, cost: 0, balance: 0 };
        }

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                return { allowed: false, free: false, cost: 0, balance: 0, reason: 'not_authenticated' };
            }

            const { data, error } = await supabase.rpc('start_game_play', {
                p_user_id: user.id,
                p_game: game
            });

            if (error) {
                console.error('[Economy] Failed to start game play:', error);
                return { allowed: false, free: false, cost: 5, balance: get().coinBalance, reason: 'error' };
            }

            // Invalidate cache for this game
            set(state => {
                const newCache = { ...state.gamePlayCostCache };
                delete newCache[game];
                return { gamePlayCostCache: newCache };
            });

            // Refresh balance if coins were spent
            if (!data.free) {
                await get().fetchBalances();
            }

            return {
                allowed: data.allowed,
                free: data.free,
                cost: data.cost,
                balance: data.balance,
                reason: data.reason
            };
        } catch (err) {
            console.error('[Economy] startGamePlay error:', err);
            return { allowed: false, free: false, cost: 5, balance: get().coinBalance, reason: 'error' };
        }
    },
}));
