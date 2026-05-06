import { useState, useEffect } from 'react';
import { Flag, Ban, VolumeX, Volume2, UserPlus, Check, Loader2 } from 'lucide-react';
import type { PlayerState } from '../multiplayer/playroom';
import { useMutedPlayersStore } from '../state/mutedPlayersStore';
import { useAuthStore } from '../state/authStore';
import { supabase } from '../lib/supabase';
import { ReportModal } from './ReportModal';
import { useBlockedUsers } from '../hooks/useBlockedUsers';

interface PlayerListDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    players: Array<[string, PlayerState]>;
    myId: string;
}

type FriendStatus = 'none' | 'pending' | 'accepted' | 'loading';

export function PlayerListDrawer({ isOpen, onClose, players, myId }: PlayerListDrawerProps) {
    const { user } = useAuthStore();
    const { isPlayerMuted, toggleMute } = useMutedPlayersStore();
    const [friendStatuses, setFriendStatuses] = useState<Record<string, FriendStatus>>({});
    const [reportTarget, setReportTarget] = useState<{ id: string; profileId: string; name: string } | null>(null);
    const { blockUser, isBlocked } = useBlockedUsers();

    // Fetch friendship statuses for all players
    useEffect(() => {
        if (!isOpen || !user) return;

        const fetchFriendStatuses = async () => {
            const statuses: Record<string, FriendStatus> = {};

            for (const [playerId, playerState] of players) {
                if (playerId === myId || !playerState.profile?.id) {
                    statuses[playerId] = 'none';
                    continue;
                }

                const profileId = playerState.profile.id;

                // Find a row where (user_id_1 = me AND user_id_2 = them) OR (user_id_1 = them AND user_id_2 = me)
                const { data } = await supabase
                    .from('friendships')
                    .select('status')
                    .or(`and(user_id_1.eq.${user.id},user_id_2.eq.${profileId}),and(user_id_1.eq.${profileId},user_id_2.eq.${user.id})`)
                    .maybeSingle();

                statuses[playerId] = data?.status as FriendStatus || 'none';
            }

            setFriendStatuses(statuses);
        };

        fetchFriendStatuses();
    }, [isOpen, user, players, myId]);

    const handleAddFriend = async (playerId: string, profileId: string) => {
        if (!user) return;

        setFriendStatuses(prev => ({ ...prev, [playerId]: 'loading' }));

        try {
            const { error } = await supabase.from('friendships').insert({
                user_id_1: user.id,
                user_id_2: profileId,
                status: 'pending'
            });

            if (error) throw error;

            // Create notification
            await supabase.from('notifications').insert({
                user_id: profileId,
                type: 'friend_request',
                sender_id: user.id
            });

            setFriendStatuses(prev => ({ ...prev, [playerId]: 'pending' }));
        } catch (error) {
            console.error('[PlayerListDrawer] Error adding friend:', error);
            setFriendStatuses(prev => ({ ...prev, [playerId]: 'none' }));
        }
    };

    const handleReport = (playerId: string, profileId: string | undefined, playerName: string) => {
        if (!profileId) return;
        setReportTarget({ id: playerId, profileId, name: playerName });
    };

    // Calculate initials color (copied from AvatarProfileModal)
    const getInitialsColor = (name: string) => {
        const colors = [
            'from-brand-primary to-purple-600',
            'from-blue-500 to-teal-400',
            'from-orange-500 to-pink-500',
            'from-green-400 to-emerald-600'
        ];
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50 z-40"
                onClick={onClose}
            />

            {/* Drawer */}
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-bg-surface border-t border-border rounded-t-2xl animate-in slide-in-from-bottom duration-200 max-h-[85vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-border-subtle shrink-0">
                    <h2 className="text-white font-bold text-lg">Players ({players.length})</h2>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-white"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Player List - Scrollable */}
                <div className="p-4 overflow-y-auto flex-1 space-y-2" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
                    {players.map(([playerId, playerState]) => {
                        const isMe = playerId === myId;
                        const playerName = playerState.profile?.name || 'Player';
                        const playerPhoto = playerState.profile?.photo || '';
                        const hasPhoto = playerPhoto && playerPhoto !== 'false';
                        const profileId = playerState.profile?.id;
                        const isMuted = isPlayerMuted(playerId);
                        const friendStatus = friendStatuses[playerId] || 'none';

                        return (
                            <div
                                key={playerId}
                                className="flex items-center justify-between bg-bg-elevated rounded-xl p-3"
                            >
                                {/* Left: Profile pic + Name */}
                                <div className="flex items-center gap-3">
                                    {/* Profile Picture */}
                                    <div className="w-10 h-10 rounded-full overflow-hidden bg-zinc-800 flex-shrink-0">
                                        {hasPhoto ? (
                                            <img
                                                src={playerPhoto}
                                                alt={playerName}
                                                className="w-full h-full object-cover"
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).style.display = 'none';
                                                }}
                                            />
                                        ) : (
                                            <div className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${getInitialsColor(playerName)} text-white text-sm font-bold`}>
                                                {playerName.charAt(0).toUpperCase()}
                                            </div>
                                        )}
                                    </div>

                                    {/* Name */}
                                    <div>
                                        <div className="text-white font-medium text-sm">
                                            {playerName}
                                            {isMe && <span className="text-slate-400 text-xs ml-1">(You)</span>}
                                        </div>
                                    </div>
                                </div>

                                {/* Right: Action Buttons (only for other players) */}
                                {!isMe && (
                                    <div className="flex items-center gap-2">
                                        {/* Report Button */}
                                        <button
                                            onClick={() => handleReport(playerId, profileId, playerName)}
                                            className="p-2 rounded-full bg-bg-surface hover:bg-red-500/20 text-text-tertiary hover:text-red-400 transition-colors"
                                            title="Report"
                                        >
                                            <Flag size={16} />
                                        </button>

                                        {/* Block Button */}
                                        {profileId && !isBlocked(profileId) && (
                                            <button
                                                onClick={() => {
                                                    blockUser(profileId);
                                                }}
                                                className="p-2 rounded-full bg-bg-surface hover:bg-red-500/20 text-text-tertiary hover:text-red-400 transition-colors"
                                                title="Block"
                                            >
                                                <Ban size={16} />
                                            </button>
                                        )}

                                        {/* Mute Button */}
                                        <button
                                            onClick={() => toggleMute(playerId)}
                                            className={`p-2 rounded-full transition-colors ${isMuted
                                                ? 'bg-red-500/20 text-red-400'
                                                : 'bg-bg-surface hover:bg-bg-elevated text-text-tertiary hover:text-white'
                                                }`}
                                            title={isMuted ? 'Unmute' : 'Mute'}
                                        >
                                            {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                                        </button>

                                        {/* Add Friend Button (only if not already friends) */}
                                        {profileId && friendStatus !== 'accepted' && (
                                            <button
                                                onClick={() => handleAddFriend(playerId, profileId)}
                                                disabled={friendStatus === 'loading' || friendStatus === 'pending'}
                                                className={`p-2 rounded-full transition-colors ${friendStatus === 'pending'
                                                    ? 'bg-bg-elevated text-text-secondary'
                                                    : 'bg-bg-surface hover:bg-bg-elevated text-text-tertiary hover:text-white'
                                                    } ${friendStatus === 'loading' ? 'opacity-50' : ''}`}
                                                title={friendStatus === 'pending' ? 'Request Sent' : 'Add Friend'}
                                            >
                                                {friendStatus === 'loading' ? (
                                                    <Loader2 size={16} className="animate-spin" />
                                                ) : friendStatus === 'pending' ? (
                                                    <Check size={16} />
                                                ) : (
                                                    <UserPlus size={16} />
                                                )}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {players.length === 0 && (
                        <div className="text-center text-slate-500 py-8">
                            No players in room
                        </div>
                    )}
                </div>
            </div>

            {/* Report Modal */}
            {reportTarget && (
                <ReportModal
                    isOpen={true}
                    onClose={() => setReportTarget(null)}
                    reportedUserId={reportTarget.profileId}
                    reportedUserName={reportTarget.name}
                    contextType="chat"
                    onBlock={() => {
                        blockUser(reportTarget.profileId);
                        setReportTarget(null);
                    }}
                />
            )}
        </>
    );
}
