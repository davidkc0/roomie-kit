import { useEffect, useState } from 'react';
import { X, Trophy, Crown, Medal } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../state/authStore';
import { LoadingSpinner } from './LoadingSpinner';
// [APPLE_COMPLIANCE] useMemo and Clock removed — prize pool / gem payout UI disabled.
// To re-enable: restore 'useMemo' to react import, 'Clock' to lucide import.

type ScoreEntry = {
    id: string;
    userId: string;
    username: string;
    score: number;
    rank: number;
    createdAt: string;
};

// [APPLE_COMPLIANCE] Prize pool type disabled — gem payouts hidden from UI.
// To re-enable: uncomment this type and all code blocks marked [APPLE_COMPLIANCE].
// type PrizePool = {
//     total_coins: number;
//     gems_payout: number;
//     player_count: number;
//     week_start: string;
//     week_end: string;
//     active: boolean;
// };

type Match3LeaderboardProps = {
    isOpen: boolean;
    onClose: () => void;
};

export function Match3Leaderboard({ isOpen, onClose }: Match3LeaderboardProps) {
    const [activeTab, setActiveTab] = useState<'weekly' | 'alltime' | 'friends'>('weekly');
    const [weeklyLeaderboard, setWeeklyLeaderboard] = useState<ScoreEntry[]>([]);
    const [allTimeLeaderboard, setAllTimeLeaderboard] = useState<ScoreEntry[]>([]);
    const [friendsLeaderboard, setFriendsLeaderboard] = useState<ScoreEntry[]>([]);
    // [APPLE_COMPLIANCE] Prize pool state disabled.
    // const [prizePool, setPrizePool] = useState<PrizePool | null>(null);
    const [loading, setLoading] = useState(true);
    const { user } = useAuthStore();

    // [APPLE_COMPLIANCE] Time remaining countdown disabled (tied to prize pool).
    // const timeRemaining = useMemo(() => {
    //     if (!prizePool?.week_end) return null;
    //     const end = new Date(prizePool.week_end + 'T23:59:59Z');
    //     const now = new Date();
    //     const diff = end.getTime() - now.getTime();
    //     if (diff <= 0) return 'Ending soon';
    //     const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    //     const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    //     const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    //     if (days > 0) return `${days}d ${hours}h remaining`;
    //     if (hours > 0) return `${hours}h ${mins}m remaining`;
    //     return `${mins}m remaining`;
    // }, [prizePool]);

    useEffect(() => {
        if (!isOpen) return;

        setLoading(true);

        // Fetch data based on active tab
        if (activeTab === 'weekly') {
            // [APPLE_COMPLIANCE] Prize pool fetch removed. Only fetching weekly scores now.
            // To re-enable: restore Promise.all with get_weekly_prize_pool RPC.
            supabase.rpc('get_weekly_leaderboard', { p_game: 'match3' }).then((scoresResult) => {
                if (scoresResult.error) {
                    console.error('[Match3Leaderboard] Error fetching weekly scores:', scoresResult.error);
                    setWeeklyLeaderboard([]);
                } else {
                    const entries: ScoreEntry[] = (scoresResult.data || []).map((row: any) => ({
                        id: row.user_id,
                        userId: row.user_id,
                        username: row.username || 'Anonymous',
                        score: row.best_score,
                        rank: row.rank,
                        createdAt: '',
                    }));
                    setWeeklyLeaderboard(entries);
                }
                setLoading(false);
            });
        } else if (activeTab === 'alltime') {
            // Fetch all-time scores
            supabase
                .from('scores')
                .select('id, user_id, username, score, created_at')
                .eq('game', 'match3')
                .order('score', { ascending: false })
                .limit(50)
                .then(({ data, error }) => {
                    if (error) {
                        console.error('[Match3Leaderboard] Error fetching all-time scores:', error);
                        setAllTimeLeaderboard([]);
                    } else {
                        const entries: ScoreEntry[] = (data || []).map((row, index) => ({
                            id: row.id,
                            userId: row.user_id,
                            username: row.username || 'Anonymous',
                            score: row.score,
                            rank: index + 1,
                            createdAt: row.created_at,
                        }));
                        setAllTimeLeaderboard(entries);
                    }
                    setLoading(false);
                });
        } else if (activeTab === 'friends') {
            // Fetch friends leaderboard
            if (!user) {
                setFriendsLeaderboard([]);
                setLoading(false);
                return;
            }
            supabase.rpc('get_friends_leaderboard', { p_game: 'match3', p_period: 'weekly' })
                .then(({ data, error }) => {
                    if (error) {
                        console.error('[Match3Leaderboard] Error fetching friends scores:', error);
                        setFriendsLeaderboard([]);
                    } else {
                        const entries: ScoreEntry[] = (data || []).map((row: any) => ({
                            id: row.user_id,
                            userId: row.user_id,
                            username: row.username || 'Anonymous',
                            score: row.best_score,
                            rank: row.rank,
                            createdAt: '',
                        }));
                        setFriendsLeaderboard(entries);
                    }
                    setLoading(false);
                });
        }
    }, [isOpen, activeTab, user]);

    if (!isOpen) return null;

    const leaderboard = activeTab === 'weekly'
        ? weeklyLeaderboard
        : activeTab === 'alltime'
            ? allTimeLeaderboard
            : friendsLeaderboard;

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
                        <Trophy className="w-6 h-6 text-purple-400" />
                        <h2 className="text-xl font-bold text-white">Bedazzled Leaderboard</h2>
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
                        onClick={() => setActiveTab('weekly')}
                        className={`flex-1 py-3 font-medium transition-colors ${activeTab === 'weekly'
                            ? 'text-purple-400 border-b-2 border-purple-400'
                            : 'text-text-tertiary hover:text-white'
                            }`}
                    >
                        Weekly
                    </button>
                    <button
                        onClick={() => setActiveTab('alltime')}
                        className={`flex-1 py-3 font-medium transition-colors ${activeTab === 'alltime'
                            ? 'text-purple-400 border-b-2 border-purple-400'
                            : 'text-text-tertiary hover:text-white'
                            }`}
                    >
                        All-Time
                    </button>
                    <button
                        onClick={() => user && setActiveTab('friends')}
                        className={`flex-1 py-3 font-medium transition-colors ${activeTab === 'friends'
                            ? 'text-purple-400 border-b-2 border-purple-400'
                            : user
                                ? 'text-text-tertiary hover:text-white'
                                : 'text-text-disabled cursor-not-allowed'
                            }`}
                        title={!user ? 'Log in to see friends' : undefined}
                    >
                        Friends
                    </button>
                </div>

                {/* [APPLE_COMPLIANCE] Prize Pool Banner disabled — gem payout UI hidden.
                   To re-enable: uncomment the block below and restore prizePool state + fetch.
                {activeTab === 'weekly' && prizePool && (
                    <div className="mx-4 mt-4 p-4 bg-gradient-to-r from-purple-500/20 to-blue-500/20 border border-purple-500/30 rounded-xl">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-purple-300 font-medium">💎 PRIZE POOL</span>
                            <div className="flex items-center gap-1 text-xs text-text-tertiary">
                                <Clock className="w-3 h-3" />
                                <span>{timeRemaining}</span>
                            </div>
                        </div>
                        <div className="text-2xl font-bold text-white mb-1">
                            {prizePool.total_coins > 0 ? (
                                <>
                                    {prizePool.gems_payout} <span className="text-sm font-normal text-purple-300">gems</span>
                                </>
                            ) : (
                                <span className="text-base text-text-tertiary">No plays yet this week</span>
                            )}
                        </div>
                        <div className="text-xs text-text-tertiary">
                            Winner takes 85% • Min 3 players required
                            {prizePool.player_count > 0 && (
                                <span className="ml-2 text-purple-300">({prizePool.player_count} player{prizePool.player_count !== 1 ? 's' : ''})</span>
                            )}
                        </div>
                    </div>
                )}
                */}

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <LoadingSpinner size="md" />
                        </div>
                    ) : leaderboard.length === 0 ? (
                        <div className="text-center py-12">
                            <Trophy className="w-16 h-16 mx-auto text-text-disabled mb-4" />
                            <p className="text-text-secondary">
                                {activeTab === 'weekly'
                                    ? 'No scores this week yet'
                                    : activeTab === 'friends'
                                        ? 'No friends on the board yet'
                                        : 'No high scores yet'}
                            </p>
                            <p className="text-text-tertiary text-sm">
                                {activeTab === 'friends'
                                    ? 'Invite friends to compete!'
                                    : 'Play a game to join the leaderboard!'}
                            </p>
                        </div>
                    ) : (
                        leaderboard.map(entry => {
                            const isCurrentUser = entry.userId === user?.id;
                            return (
                                <div
                                    key={entry.id}
                                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${getRankBg(entry.rank)} ${isCurrentUser ? 'ring-2 ring-purple-500/50' : ''}`}
                                >
                                    {/* Rank */}
                                    <div className="w-8 flex justify-center">
                                        {getRankIcon(entry.rank)}
                                    </div>

                                    {/* Name */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className={`font-bold truncate ${isCurrentUser ? 'text-purple-400' : 'text-white'}`}>
                                                {entry.username}
                                            </span>
                                            {isCurrentUser && (
                                                <span className="text-[10px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded-full font-medium">
                                                    YOU
                                                </span>
                                            )}
                                            {/* [APPLE_COMPLIANCE] WINNING badge disabled — implies gem prize.
                                            {activeTab === 'weekly' && entry.rank === 1 && (
                                                <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full font-medium">
                                                    WINNING
                                                </span>
                                            )}
                                            */}
                                        </div>
                                    </div>

                                    {/* Score */}
                                    <div className="text-right">
                                        <div className="text-lg font-bold text-white">{entry.score}</div>
                                        <div className="text-[10px] text-text-tertiary uppercase tracking-wide">PTS</div>
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
