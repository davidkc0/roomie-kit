/**
 * useBlockedUsers — manages the current user's block list.
 * Fetches from `blocked_users` table on mount, provides block/unblock/isBlocked.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../state/authStore';

export function useBlockedUsers() {
    const { user } = useAuthStore();
    const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const fetchedRef = useRef(false);

    // Fetch block list on mount
    useEffect(() => {
        if (!user || fetchedRef.current) return;
        fetchedRef.current = true;

        supabase
            .from('blocked_users')
            .select('blocked_id')
            .eq('blocker_id', user.id)
            .then(({ data, error }) => {
                if (error) {
                    console.error('[useBlockedUsers] Error fetching block list:', error);
                } else if (data) {
                    setBlockedIds(new Set(data.map(row => row.blocked_id)));
                }
                setLoading(false);
            });
    }, [user]);

    const blockUser = useCallback(async (blockedId: string) => {
        if (!user) return;
        setBlockedIds(prev => new Set([...prev, blockedId]));

        const { error } = await supabase
            .from('blocked_users')
            .upsert({ blocker_id: user.id, blocked_id: blockedId }, { onConflict: 'blocker_id,blocked_id' });

        if (error) {
            console.error('[useBlockedUsers] Error blocking user:', error);
            // Rollback
            setBlockedIds(prev => {
                const next = new Set(prev);
                next.delete(blockedId);
                return next;
            });
        }
    }, [user]);

    const unblockUser = useCallback(async (blockedId: string) => {
        if (!user) return;
        setBlockedIds(prev => {
            const next = new Set(prev);
            next.delete(blockedId);
            return next;
        });

        const { error } = await supabase
            .from('blocked_users')
            .delete()
            .eq('blocker_id', user.id)
            .eq('blocked_id', blockedId);

        if (error) {
            console.error('[useBlockedUsers] Error unblocking user:', error);
            // Rollback
            setBlockedIds(prev => new Set([...prev, blockedId]));
        }
    }, [user]);

    const isBlocked = useCallback((id: string) => blockedIds.has(id), [blockedIds]);

    return { blockedIds, blockUser, unblockUser, isBlocked, loading };
}
