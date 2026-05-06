import { useEffect, useState } from 'react';
import { X, Trophy, Crown, Medal } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getChessLeaderboard, type ChessRankEntry } from '../multiplayer/gameSync';
import { useAuthStore } from '../state/authStore';
import { LoadingSpinner } from './LoadingSpinner';

type ChessLeaderboardProps = {
    isOpen: boolean;
    onClose: () => void;
};

export function ChessLeaderboard({ isOpen, onClose }: ChessLeaderboardProps) {
    const [activeTab, setActiveTab] = useState<'all' | 'friends'>('all');
    const [leaderboard, setLeaderboard] = useState<ChessRankEntry[]>([]);
    const [friendsLeaderboard, setFriendsLeaderboard] = useState<ChessRankEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const { user } = useAuthStore();

    useEffect(() => {
        if (!isOpen) return;

        setLoading(true);

        if (activeTab === 'all') {
            getChessLeaderboard(50).then(entries => {
                setLeaderboard(entries);
                setLoading(false);
            });
        } else {
            // Fetch friends chess leaderboard
            if (!user) {
                setFriendsLeaderboard([]);
                setLoading(false);
                return;
            }
            supabase.rpc('get_friends_chess_leaderboard')
                .then(({ data, error }) => {
                    if (error) {
                        console.error('[ChessLeaderboard] Error fetching friends:', error);
                        setFriendsLeaderboard([]);
                    } else {
                        const entries: ChessRankEntry[] = (data || []).map((row: any) => ({
                            rank: row.rank,
                            userId: row.user_id,
                            username: row.username || 'Anonymous',
                            profilePic: row.profile_image_url,
                            rating: row.rating,
                            wins: row.wins,
                            losses: row.losses,
                            draws: row.draws,
                        }));
                        setFriendsLeaderboard(entries);
                    }
                    setLoading(false);
                });
        }
    }, [isOpen, activeTab, user]);

    if (!isOpen) return null;

    const getRankIcon = (rank: number) => {
        if (rank === 1) return <Crown className="w-5 h-5 text-yellow-400" />;
        if (rank === 2) return <Medal className="w-5 h-5 text-text-secondary" />;
        if (rank === 3) return <Medal className="w-5 h-5 text-amber-600" />;
        return <span className="w-5 h-5 flex items-center justify-center text-sm font-bold text-text-tertiary">{rank}</span>;
    };

    const getRankBg = (rank: number) => {
        if (rank === 1) return 'bg-gradient-to-r from-yellow-500/20 to-amber-500/10 border-yellow-500/30';
        if (rank === 2) return 'bg-gradient-to-r from-text-secondary/20 to-text-secondary/10 border-text-secondary/30';
        if (rank === 3) return 'bg-gradient-to-r from-amber-600/20 to-orange-600/10 border-amber-600/30';
        return 'bg-bg-elevated/50 border-border/50';
    };

    return (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-bg-surface border border-border rounded-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in duration-300">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <div className="flex items-center gap-2">
                        <Trophy className="w-6 h-6 text-yellow-400" />
                        <h2 className="text-xl font-bold text-white">Chess Rankings</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-text-tertiary hover:text-white transition-colors rounded-lg hover:bg-white/10"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-border">
                    <button
                        onClick={() => setActiveTab('all')}
                        className={`flex-1 py-3 font-medium transition-colors ${activeTab === 'all'
                            ? 'text-brand-primary border-b-2 border-brand-primary'
                            : 'text-text-tertiary hover:text-white'
                            }`}
                    >
                        All Players
                    </button>
                    <button
                        onClick={() => user && setActiveTab('friends')}
                        className={`flex-1 py-3 font-medium transition-colors ${activeTab === 'friends'
                            ? 'text-brand-primary border-b-2 border-brand-primary'
                            : user
                                ? 'text-text-tertiary hover:text-white'
                                : 'text-text-disabled cursor-not-allowed'
                            }`}
                        title={!user ? 'Log in to see friends' : undefined}
                    >
                        Friends
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <LoadingSpinner size="md" />
                        </div>
                    ) : (activeTab === 'all' ? leaderboard : friendsLeaderboard).length === 0 ? (
                        <div className="text-center py-12">
                            <Trophy className="w-16 h-16 mx-auto text-text-disabled mb-4" />
                            <p className="text-text-secondary">
                                {activeTab === 'friends' ? 'No friends ranked yet' : 'No rankings yet'}
                            </p>
                            <p className="text-text-tertiary text-sm">
                                {activeTab === 'friends'
                                    ? 'Invite friends to play chess!'
                                    : 'Play a game to join the leaderboard!'}
                            </p>
                        </div>
                    ) : (
                        (activeTab === 'all' ? leaderboard : friendsLeaderboard).map(entry => {
                            const isCurrentUser = entry.userId === user?.id;
                            return (
                                <div
                                    key={entry.userId}
                                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${getRankBg(entry.rank)} ${isCurrentUser ? 'ring-2 ring-brand-primary/50' : ''}`}
                                >
                                    {/* Rank */}
                                    <div className="w-8 flex justify-center">
                                        {getRankIcon(entry.rank)}
                                    </div>

                                    {/* Profile Pic */}
                                    <div className="w-10 h-10 rounded-full bg-bg-elevated overflow-hidden ring-2 ring-border">
                                        {entry.profilePic ? (
                                            <img src={entry.profilePic} alt={entry.username} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-white font-bold">
                                                {entry.username.charAt(0).toUpperCase()}
                                            </div>
                                        )}
                                    </div>

                                    {/* Name & Stats */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className={`font-bold truncate ${isCurrentUser ? 'text-brand-primary' : 'text-white'}`}>
                                                {entry.username}
                                            </span>
                                            {isCurrentUser && (
                                                <span className="text-[10px] bg-brand-primary/20 text-brand-primary px-1.5 py-0.5 rounded-full font-medium">
                                                    YOU
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-xs text-text-tertiary">
                                            {entry.wins}W / {entry.losses}L / {entry.draws}D
                                        </div>
                                    </div>

                                    {/* Rating */}
                                    <div className="text-right">
                                        <div className="text-lg font-bold text-white">{entry.rating}</div>
                                        <div className="text-[10px] text-text-tertiary uppercase tracking-wide">ELO</div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
