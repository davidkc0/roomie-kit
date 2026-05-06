import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Loader2, User, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../state/authStore';
import { UserProfileSheet } from '../components/UserProfileSheet';

type SearchResult = {
    id: string;
    username: string;
    profile_image_url: string | null;
    avatar_headshot_url: string | null;
    bio: string | null;
    friend_status: 'none' | 'pending_sent' | 'pending_received' | 'accepted';
};

export default function SearchPage() {
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [actioningId, setActioningId] = useState<string | null>(null);
    const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Debounced search
    useEffect(() => {
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

        if (!query.trim()) {
            setResults([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        searchTimeoutRef.current = setTimeout(async () => {
            try {
                const { data, error } = await supabase.rpc('search_users', {
                    p_search_text: query.trim(),
                    p_limit: 20
                });

                if (error) throw error;
                setResults(data || []);
            } catch (err) {
                console.error('Search failed:', err);
            } finally {
                setLoading(false);
            }
        }, 300); // 300ms debounce

        return () => {
            if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        };
    }, [query]);

    const handleFriendAction = async (e: React.MouseEvent, targetUser: SearchResult) => {
        e.stopPropagation();
        if (!user || actioningId) return;

        setActioningId(targetUser.id);
        try {
            if (targetUser.friend_status === 'none') {
                // Send request
                const { error } = await supabase.from('friendships').insert({
                    user_id_1: user.id,
                    user_id_2: targetUser.id,
                    status: 'pending'
                });
                if (error) throw error;

                // Create notification
                await supabase.from('notifications').insert({
                    user_id: targetUser.id,
                    type: 'friend_request',
                    sender_id: user.id
                });

                // Optimistic update
                setResults(prev => prev.map(u =>
                    u.id === targetUser.id ? { ...u, friend_status: 'pending_sent' } : u
                ));

            } else if (targetUser.friend_status === 'pending_sent') {
                // Cancel request
                const { error } = await supabase.from('friendships').delete().match({
                    user_id_1: user.id,
                    user_id_2: targetUser.id
                });
                if (error) throw error;

                // Cleanup notification via RPC or direct delete
                const { error: notifError } = await supabase.rpc('delete_notification_by_sender', {
                    p_recipient_id: targetUser.id
                });

                if (notifError) {
                    await supabase.from('notifications').delete().match({
                        user_id: targetUser.id,
                        type: 'friend_request',
                        sender_id: user.id
                    });
                }

                setResults(prev => prev.map(u =>
                    u.id === targetUser.id ? { ...u, friend_status: 'none' } : u
                ));

            } else if (targetUser.friend_status === 'pending_received') {
                // Accept request — match the Notifications.tsx pattern (direct update, no RPC)
                const { error, count } = await supabase
                    .from('friendships')
                    .update({ status: 'accepted' }, { count: 'exact' })
                    .eq('user_id_1', targetUser.id)
                    .eq('user_id_2', user.id);

                if (error) throw error;
                if (count === 0) throw new Error('Friend request not found');

                // Clean up the friend_request notification
                await supabase.from('notifications').delete().match({
                    user_id: user.id,
                    type: 'friend_request',
                    sender_id: targetUser.id
                });

                // Refresh profile to update friends_count
                useAuthStore.getState().refreshProfile();

                setResults(prev => prev.map(u =>
                    u.id === targetUser.id ? { ...u, friend_status: 'accepted' } : u
                ));
            }
        } catch (err) {
            console.error('Friend action failed:', err);
        } finally {
            setActioningId(null);
        }
    };

    const clearSearch = () => {
        setQuery('');
        setResults([]);
        // Focus input?
    };

    return (
        <div className="h-[100dvh] bg-bg-base text-white flex flex-col animate-fade-in">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-bg-base/80 backdrop-blur-md border-b border-border/50 px-4 py-3 flex items-center gap-3">
                <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-text-tertiary hover:text-white transition-colors">
                    <ArrowLeft className="w-6 h-6" />
                </button>
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
                    <input
                        autoFocus
                        type="text"
                        placeholder="Search users..."
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        className="w-full bg-bg-elevated rounded-xl py-3 pl-10 pr-10 text-white focus:outline-none focus:ring-1 focus:ring-brand-primary/50 transition placeholder:text-text-disabled"
                    />
                    {query && (
                        <button
                            onClick={clearSearch}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-tertiary hover:text-white"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Results — scrollable, clears keyboard + tab bar */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-2 space-y-1 pb-28">
                {loading && results.length === 0 && (
                    <div className="py-10 text-center text-text-tertiary flex flex-col items-center">
                        <Loader2 className="w-8 h-8 animate-spin mb-2" />
                        <span>Searching...</span>
                    </div>
                )}

                {!loading && query && results.length === 0 && (
                    <div className="py-20 text-center text-text-disabled flex flex-col items-center">
                        <User className="w-16 h-16 mb-4 opacity-20" />
                        <p>No users found for "{query}"</p>
                    </div>
                )}

                {results.map(user => (
                    <div
                        key={user.id}
                        onClick={() => setSelectedProfileId(user.id)}
                        className="flex items-center justify-between p-3 rounded-xl hover:bg-white/5 active:bg-white/10 transition cursor-pointer"
                    >
                        {/* User Info */}
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-12 h-12 rounded-full bg-bg-surface overflow-hidden border border-white/10 flex-shrink-0">
                                <img
                                    src={user.profile_image_url || user.avatar_headshot_url || `https://api.dicebear.com/7.x/initials/svg?seed=${user.username}`}
                                    alt={user.username}
                                    className="w-full h-full object-cover"
                                />
                            </div>
                            <div className="min-w-0">
                                <h3 className="font-bold text-base truncate">{user.username}</h3>
                                {user.bio && <p className="text-xs text-text-tertiary truncate">{user.bio}</p>}
                                {!user.bio && <p className="text-xs text-text-disabled truncate">@{user.username.toLowerCase()}</p>}
                            </div>
                        </div>

                        {/* Action Button */}
                        <div className="ml-3 flex-shrink-0">
                            {user.friend_status === 'accepted' ? (
                                <button
                                    disabled
                                    className="px-4 py-1.5 rounded-full bg-white/5 text-text-secondary text-sm font-medium border border-white/5"
                                >
                                    Friends
                                </button>
                            ) : user.friend_status === 'pending_received' ? (
                                <button
                                    onClick={(e) => handleFriendAction(e, user)}
                                    disabled={actioningId === user.id}
                                    className="px-4 py-1.5 rounded-full bg-brand-primary text-white text-sm font-bold shadow-lg shadow-brand-primary/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5"
                                >
                                    {actioningId === user.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Accept'}
                                </button>
                            ) : user.friend_status === 'pending_sent' ? (
                                <button
                                    onClick={(e) => handleFriendAction(e, user)}
                                    disabled={actioningId === user.id}
                                    className="px-4 py-1.5 rounded-xl bg-white/10 text-text-tertiary text-sm font-medium hover:bg-white/20 transition-all flex items-center gap-1.5"
                                >
                                    {actioningId === user.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Requested'}
                                </button>
                            ) : (
                                <button
                                    onClick={(e) => handleFriendAction(e, user)}
                                    disabled={actioningId === user.id}
                                    className="relative flex items-center justify-center gap-1.5 px-5 py-1.5 rounded-xl bg-white text-slate-900 font-bold text-sm border-b-[3px] border-slate-200 hover:bg-slate-50 transition-all active:border-b-0 active:translate-y-[3px] active:mt-[3px] shadow-md shadow-black/10 disabled:opacity-50 disabled:active:translate-y-0 disabled:active:border-b-[3px] disabled:active:mt-0"
                                >
                                    {actioningId === user.id ? (
                                        <Loader2 className="w-4 h-4 animate-spin text-slate-900" />
                                    ) : (
                                        'Add'
                                    )}
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <UserProfileSheet
                profileId={selectedProfileId}
                onClose={() => setSelectedProfileId(null)}
            />
        </div>
    );
}
