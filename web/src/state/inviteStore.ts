import { create } from 'zustand';
import { supabase } from '../lib/supabase';

type InviteCode = {
    id: string;
    code: string;
    owner_id: string;
    created_at: string;
    used_at: string | null;
    used_by: string | null;
    is_active: boolean;
};

type InviteState = {
    inviteCodes: InviteCode[];
    invitesRemaining: number;
    invitesUsed: number;
    waitlistPosition: number | null;
    loading: boolean;
    redeemLoading: boolean;
    redeemError: string | null;

    loadInvites: (userId: string) => Promise<void>;
    generateCode: (userId: string) => Promise<InviteCode[] | null>;
    redeemCode: (userId: string, code: string) => Promise<{ success: boolean; inviterUsername?: string; reward?: number; error?: string }>;
    loadWaitlistPosition: (userId: string) => Promise<number | null>;
};

export const useInviteStore = create<InviteState>((set, get) => ({
    inviteCodes: [],
    invitesRemaining: 0,
    invitesUsed: 0,
    waitlistPosition: null,
    loading: false,
    redeemLoading: false,
    redeemError: null,

    loadInvites: async (userId: string) => {
        set({ loading: true });
        try {
            // Get user's invite stats from profile
            const { data: profile } = await supabase
                .from('profiles')
                .select('invites_remaining, invites_used')
                .eq('id', userId)
                .single();

            if (profile) {
                set({
                    invitesRemaining: profile.invites_remaining ?? 0,
                    invitesUsed: profile.invites_used ?? 0,
                });
            }

            // Get invite codes
            const { data: codes } = await supabase
                .from('invite_codes')
                .select('*')
                .eq('owner_id', userId)
                .order('created_at', { ascending: false });

            set({ inviteCodes: codes || [] });
        } catch (e) {
            console.error('[InviteStore] Error loading invites:', e);
        } finally {
            set({ loading: false });
        }
    },

    generateCode: async (userId: string) => {
        try {
            const { data, error } = await supabase.rpc('generate_invite_codes', {
                p_user_id: userId,
                p_count: 1,
            });

            if (error) {
                console.error('[InviteStore] Error generating code:', error);
                return null;
            }

            // Refresh invite data
            await get().loadInvites(userId);
            return data;
        } catch (e) {
            console.error('[InviteStore] Exception generating code:', e);
            return null;
        }
    },

    redeemCode: async (userId: string, code: string) => {
        set({ redeemLoading: true, redeemError: null });
        try {
            const cleanCode = code.trim().toUpperCase();
            console.log('[InviteStore] Attempting to redeem code:', cleanCode, 'for user:', userId);

            const { data, error } = await supabase.rpc('redeem_invite_code', {
                p_user_id: userId,
                p_code: cleanCode,
            });

            console.log('[InviteStore] Redeem result:', { data, error });

            if (error) {
                const msg = error.message || '';
                const errorMsg = msg.includes('Invalid')
                    ? 'Invalid or already used invite code'
                    : msg.includes('already active')
                        ? 'Your account is already active!'
                        : msg.includes('not found')
                            ? 'Invalid invite code'
                            : `Failed to redeem code: ${msg}`;
                console.error('[InviteStore] Redeem error:', errorMsg);
                set({ redeemError: errorMsg });
                return { success: false, error: errorMsg };
            }

            console.log('[InviteStore] Redeem success:', data);
            set({ redeemLoading: false, redeemError: null });
            return {
                success: true,
                inviterUsername: data?.inviter_username,
                reward: data?.reward,
            };
        } catch (e: any) {
            console.error('[InviteStore] Redeem exception:', e);
            const errorMsg = 'Something went wrong. Please try again.';
            set({ redeemError: errorMsg });
            return { success: false, error: errorMsg };
        } finally {
            set({ redeemLoading: false });
        }
    },

    loadWaitlistPosition: async (userId: string) => {
        try {
            const { data, error } = await supabase
                .from('waitlist')
                .select('display_position')
                .eq('user_id', userId)
                .maybeSingle();

            if (error) {
                console.error('[InviteStore] Error loading waitlist position:', error);
                return null;
            }

            const position = data?.display_position ?? null;
            set({ waitlistPosition: position });
            return position;
        } catch (e) {
            console.error('[InviteStore] Error loading waitlist position:', e);
            return null;
        }
    },
}));
