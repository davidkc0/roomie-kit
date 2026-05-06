import { useEffect, useState } from 'react';
import { MessageSquare, UserPlus, Check, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../state/authStore';
import { LoadingSpinner } from './LoadingSpinner';

type UserProfileSheetProps = {
    profileId: string | null;
    onClose: () => void;
};

export function UserProfileSheet({ profileId, onClose }: UserProfileSheetProps) {
    const { user } = useAuthStore();
    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [friendStatus, setFriendStatus] = useState<'none' | 'pending' | 'accepted' | 'loading'>('loading');
    const [closing, setClosing] = useState(false);
    const [inviterName, setInviterName] = useState<string | null>(null);

    useEffect(() => {
        if (!profileId || !user) return;

        const fetchProfile = async () => {
            setLoading(true);
            try {
                const { data } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', profileId)
                    .single();

                setProfile(data);

                // Fetch inviter name if available
                if (data?.invited_by) {
                    const { data: inviterData } = await supabase
                        .from('profiles')
                        .select('username')
                        .eq('id', data.invited_by)
                        .single();
                    if (inviterData) setInviterName(inviterData.username);
                }

                // Check friendship
                // Find a row where (user_id_1 = me AND user_id_2 = them) OR (user_id_1 = them AND user_id_2 = me)
                const { data: friendData } = await supabase
                    .from('friendships')
                    .select('status')
                    .or(`and(user_id_1.eq.${user.id},user_id_2.eq.${profileId}),and(user_id_1.eq.${profileId},user_id_2.eq.${user.id})`)
                    .maybeSingle();

                console.log('[UserProfileSheet] Friendship check result:', friendData);

                if (friendData) {
                    setFriendStatus(friendData.status);
                } else {
                    setFriendStatus('none');
                }
            } catch (e) {
                console.error('Error fetching profile sheet', e);
            } finally {
                setLoading(false);
            }
        };
        fetchProfile();
    }, [profileId, user]);

    const handleFriendAction = async () => {
        if (!user || !profileId) return;

        // Logic similar to AvatarProfileModal
        if (friendStatus === 'pending') {
            // Cancel
            try {
                setFriendStatus('loading');
                await supabase.from('friendships').delete().match({ user_id_1: user.id, user_id_2: profileId });

                // Cleanup notification
                // Cleanup notification using RPC for consistency
                const { error: notifError } = await supabase.rpc('delete_notification_by_sender', {
                    p_recipient_id: profileId
                });

                // Fallback to direct delete if RPC fails (or doesn't exist yet)
                if (notifError) {
                    await supabase.from('notifications').delete().match({
                        user_id: profileId,
                        type: 'friend_request',
                        sender_id: user.id
                    });
                }

                setFriendStatus('none');
            } catch (e) { console.error(e); setFriendStatus('pending'); }
            return;
        }

        try {
            setFriendStatus('loading');
            await supabase.from('friendships').insert({ user_id_1: user.id, user_id_2: profileId, status: 'pending' });
            await supabase.from('notifications').insert({ user_id: profileId, type: 'friend_request', sender_id: user.id });
            setFriendStatus('pending');
        } catch (e) { console.error(e); setFriendStatus('none'); }
    };

    const handleClose = () => {
        setClosing(true);
        setTimeout(onClose, 300);
    };

    if (!profileId) return null;

    // Calculate initials color
    const getInitialsColor = (name: string) => {
        const colors = ['from-brand-primary to-purple-600', 'from-blue-500 to-teal-400', 'from-orange-500 to-pink-500', 'from-green-400 to-emerald-600'];
        let hash = 0;
        for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
        return colors[Math.abs(hash) % colors.length];
    };

    const playerName = profile?.username || 'User';
    const playerPhoto = profile?.profile_image_url || profile?.avatar_headshot_url || '';
    const hasPhoto = !!playerPhoto;

    return (
        <div className={`fixed inset-0 z-[100] flex flex-col justify-end transition-opacity duration-300 ${closing ? 'opacity-0' : 'opacity-100'}`}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

            <div
                className={`relative w-full bg-bg-surface border-t border-border rounded-t-3xl shadow-2xl p-6 pb-12 transform transition-transform duration-300 ${closing ? 'translate-y-full' : 'translate-y-0'} ${loading ? 'min-h-[300px]' : ''}`}
                onClick={e => e.stopPropagation()}
            >
                <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-white/20 rounded-full" />

                {loading ? (
                    <div className="flex h-40 items-center justify-center">
                        <LoadingSpinner size="md" />
                    </div>
                ) : (
                    <>
                        <div className="flex flex-col items-center">
                            <div className="relative mb-4">
                                <div className="w-24 h-24 rounded-full p-[3px] bg-gradient-to-br from-brand-primary to-purple-600 shadow-xl">
                                    <div className="w-full h-full rounded-full overflow-hidden bg-zinc-900 border-2 border-black relative">
                                        {hasPhoto ? (
                                            <img src={playerPhoto} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${getInitialsColor(playerName)} text-white text-2xl font-bold`}>
                                                {playerName.charAt(0).toUpperCase()}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <h2 className="text-2xl font-bold text-white mb-1">{playerName}</h2>
                            <div className="flex items-center gap-3 text-white/40 text-sm font-medium mb-2">
                                <span>@{playerName.toLowerCase()}</span>
                                <span className="w-1 h-1 rounded-full bg-white/30"></span>
                                <span>{profile.friends_count || 0} Friends</span>
                            </div>
                            {inviterName && (
                                <p className="text-sm text-white/40 mb-4">Invited by <span className="text-white/70 font-medium">@{inviterName}</span></p>
                            )}
                            {!inviterName && <div className="mb-4" />}

                            <div className="w-full bg-white/5 rounded-2xl p-4 mb-8 text-center">
                                <p className="text-white/70 text-sm">{profile.bio || "No bio available"}</p>
                            </div>

                            <div className="w-full grid grid-cols-2 gap-3">
                                {(friendStatus !== 'accepted' && !(friendStatus === 'loading' && user?.id === profileId)) && (
                                    <button
                                        onClick={handleFriendAction}
                                        className={`py-3.5 px-4 rounded-xl font-bold transition-all shadow-lg flex items-center justify-center gap-2 ${friendStatus === 'pending' ? 'bg-gray-600 text-white/70' : 'bg-white text-black'}`}
                                    >
                                        {friendStatus === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> :
                                            friendStatus === 'pending' ? <><Check className="w-4 h-4" /> Requested</> :
                                                <><UserPlus className="w-4 h-4" /> Add Friend</>}
                                    </button>
                                )}

                                <button className={`py-3.5 px-4 bg-white/10 text-white border border-white/10 rounded-xl font-bold flex items-center justify-center gap-2 ${friendStatus === 'accepted' ? 'col-span-2' : ''}`}>
                                    <MessageSquare className="w-4 h-4" /> Message
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
