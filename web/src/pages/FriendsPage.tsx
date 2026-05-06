import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Trash2, UserX } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../state/authStore';

type FriendPresence = {
    friend_id: string;
    username: string;
    profile_image_url: string | null;
    status: 'offline' | 'online' | 'in_room';
    room_slug: string | null;
    room_type: 'public' | 'personal' | null;
    room_owner_username: string | null;
    last_seen: string | null;
};

type FriendWithPresence = {
    id: string;
    username: string;
    profile_image_url: string | null;
    avatar_headshot_url: string | null;
    bio: string | null;
    status: 'offline' | 'online' | 'in_room';
    room_slug: string | null;
    room_type: 'public' | 'personal' | null;
    room_owner_username: string | null;
};

// Format status text based on presence data
function getStatusText(friend: FriendWithPresence): string {
    if (friend.status === 'offline') return 'Offline';
    if (friend.status === 'online') return 'Online';

    // In a room
    if (friend.room_slug === 'lounge') return 'In the Lounge';
    if (friend.room_type === 'personal') {
        if (friend.room_owner_username === friend.username) {
            return 'In personal room';
        }
        return `Visiting @${friend.room_owner_username}'s room`;
    }
    return `In ${friend.room_slug}'s room`;
}

export default function FriendsPage() {
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const [friends, setFriends] = useState<FriendWithPresence[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [removingId, setRemovingId] = useState<string | null>(null);
    const [isExiting, setIsExiting] = useState(false);

    useEffect(() => {
        if (user) {
            fetchFriendsWithPresence();
        }
    }, [user]);

    const fetchFriendsWithPresence = async () => {
        setLoading(true);
        try {
            // 1. Fetch friends from friendships table
            const { data: friendships, error: friendError } = await supabase
                .from('friendships')
                .select('*')
                .or(`user_id_1.eq.${user!.id},user_id_2.eq.${user!.id}`)
                .eq('status', 'accepted');

            if (friendError) throw friendError;

            const friendIds = friendships.map(f => f.user_id_1 === user!.id ? f.user_id_2 : f.user_id_1);

            if (friendIds.length === 0) {
                setFriends([]);
                setLoading(false);
                return;
            }

            // 2. Fetch profiles for all friends
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, username, profile_image_url, avatar_headshot_url, bio')
                .in('id', friendIds);

            // 3. Clean up stale presence (mark as offline if no activity for 2 min)
            await supabase.rpc('cleanup_stale_presence', { minutes_threshold: 2 });

            // 4. Fetch presence data using the RPC
            const { data: presenceData, error: presenceError } = await supabase
                .rpc('get_friends_presence');

            if (presenceError) {
                console.error('Error fetching presence:', presenceError);
            }

            // 5. Merge profiles with presence
            const presenceMap = new Map<string, FriendPresence>();
            if (presenceData) {
                for (const p of presenceData) {
                    presenceMap.set(p.friend_id, p);
                }
            }

            const friendsWithPresence: FriendWithPresence[] = (profiles || []).map(profile => {
                const presence = presenceMap.get(profile.id);
                return {
                    id: profile.id,
                    username: profile.username,
                    profile_image_url: profile.profile_image_url,
                    avatar_headshot_url: profile.avatar_headshot_url,
                    bio: profile.bio,
                    status: presence?.status || 'offline',
                    room_slug: presence?.room_slug || null,
                    room_type: presence?.room_type || null,
                    room_owner_username: presence?.room_owner_username || null,
                };
            });

            // Sort: online/in_room first, then offline
            friendsWithPresence.sort((a, b) => {
                const order = { in_room: 0, online: 1, offline: 2 };
                return order[a.status] - order[b.status];
            });

            setFriends(friendsWithPresence);
        } catch (e) {
            console.error('Error fetching friends', e);
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveFriend = async (friendId: string) => {
        if (!confirm('Are you sure you want to remove this friend?')) return;

        setRemovingId(friendId);
        try {
            const { error } = await supabase
                .from('friendships')
                .delete()
                .match({ status: 'accepted' })
                .or(`and(user_id_1.eq.${user!.id},user_id_2.eq.${friendId}),and(user_id_1.eq.${friendId},user_id_2.eq.${user!.id})`);

            if (error) throw error;

            setFriends(prev => prev.filter(f => f.id !== friendId));
        } catch (e) {
            console.error('Error removing friend', e);
            alert('Failed to remove friend');
        } finally {
            setRemovingId(null);
        }
    };

    const handleBack = () => {
        setIsExiting(true);
        setTimeout(() => navigate(-1), 280);
    };

    const filteredFriends = friends.filter(f => f.username?.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className={`min-h-screen bg-bg-base text-white pb-20 ${isExiting ? 'animate-slide-out-right' : 'animate-slide-in-right'}`}>
            {/* Header */}
            <div className="sticky top-0 z-10 bg-bg-base/80 backdrop-blur-md border-b border-border/50 px-4 py-4 flex items-center justify-center relative">
                <button onClick={handleBack} className="absolute left-4 p-2 -ml-2 text-text-tertiary hover:text-white transition-colors">
                    <ArrowLeft className="w-6 h-6" />
                </button>
                <h1 className="text-xl font-bold">My Friends ({friends.length})</h1>
            </div>

            <div className="p-4 space-y-4 animate-fade-in">
                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
                    <input
                        type="text"
                        placeholder="Search friends..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full bg-bg-elevated rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:ring-1 focus:ring-brand-primary/50 transition"
                    />
                </div>

                {/* List */}
                <div className="space-y-3">
                    {loading ? (
                        <div className="text-center py-10 text-slate-500">Loading...</div>
                    ) : filteredFriends.length === 0 ? (
                        <div className="text-center py-20 flex flex-col items-center opacity-50">
                            <UserX className="w-16 h-16 mb-4 text-text-disabled" />
                            <p className="text-text-secondary font-medium">{search ? 'No matches found' : 'No friends yet'}</p>
                        </div>
                    ) : (
                        filteredFriends.map(friend => (
                            <div key={friend.id} className="flex items-center gap-4 p-4 rounded-2xl bg-bg-elevated/50 border border-border/50 shadow-sm">
                                {/* Avatar with status indicator */}
                                <div className="relative flex-shrink-0">
                                    <div className="w-12 h-12 rounded-full bg-bg-surface overflow-hidden border border-border">
                                        <img
                                            src={friend.profile_image_url || friend.avatar_headshot_url || `https://api.dicebear.com/7.x/initials/svg?seed=${friend.username}`}
                                            alt={friend.username}
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                    {/* Status dot */}
                                    <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-bg-elevated ${friend.status === 'offline' ? 'bg-text-disabled' : 'bg-green-500'
                                        }`} />
                                </div>

                                <div className="min-w-0 flex-1">
                                    <h3 className="font-bold text-base truncate">{friend.username}</h3>
                                    <p className={`text-sm truncate ${friend.status === 'offline' ? 'text-text-tertiary' : 'text-green-400'
                                        }`}>
                                        {getStatusText(friend)}
                                    </p>
                                </div>

                                <button
                                    onClick={() => handleRemoveFriend(friend.id)}
                                    disabled={removingId === friend.id}
                                    className="p-2 text-text-tertiary hover:text-red-400 transition-colors bg-bg-surface hover:bg-red-500/10 rounded-xl"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
