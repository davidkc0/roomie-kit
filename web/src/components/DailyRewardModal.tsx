import { useState, useEffect } from 'react';
import { useEconomyStore } from '../state/economyStore';
import { useAuthStore } from '../state/authStore';
import { getNextMilestone } from '../utils/economyHelpers';
import { GamePrimaryButton } from './GamePrimaryButton';
import { brandAssetUrls } from '../config/customization';

export function DailyRewardModal() {
    const {
        claimDaily,
        pendingReward,
        loading,
        showDailyReward,
        setShowDailyReward,
        dismissDailyReward
    } = useEconomyStore();
    const { user } = useAuthStore();

    const [claimed, setClaimed] = useState<{ reward: number; streak: number } | null>(null);
    const checkDailyReward = useEconomyStore(state => state.checkDailyReward);

    // Check if can claim on mount
    useEffect(() => {
        checkDailyReward();
    }, [checkDailyReward]);

    const handleClaim = async () => {
        const result = await claimDaily();
        if (result && result.reward > 0) {
            // Persist the dismissal for today immediately on success (user-specific)
            if (user) {
                localStorage.setItem(`daily_reward_dismissed_${user.id}`, new Date().toISOString());
            }

            setClaimed(result);
            setTimeout(() => {
                setShowDailyReward(false);
                setClaimed(null);
            }, 3000);
        } else {
            // Claim failed or returned 0 - just close
            setShowDailyReward(false);
        }
    };

    const handleSkip = () => {
        // Persist dismissal so it doesn't show again today (user-specific)
        if (user) {
            localStorage.setItem(`daily_reward_dismissed_${user.id}`, new Date().toISOString());
        }
        dismissDailyReward();
    };

    if (!showDailyReward) return null;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-bg-surface rounded-2xl p-8 max-w-sm w-full border border-border shadow-2xl relative overflow-hidden">
                {/* Shine effect background */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

                {claimed ? (
                    <div className="text-center animate-in zoom-in duration-300">
                        {claimed.reward >= 30 ? (
                            // Jackpot Claimed UI
                            <>
                                <div className="text-6xl mb-4 animate-bounce">👑</div>
                                <h2 className="text-3xl font-bold mb-2 text-yellow-400">
                                    JACKPOT!
                                    <br />
                                    +{claimed.reward} Coins
                                </h2>
                                <p className="text-slate-400">
                                    {claimed.streak} day streak maintained!
                                </p>
                            </>
                        ) : (
                            // Standard Claimed UI
                            <>
                                <div className="text-6xl mb-4 animate-bounce">🎉</div>
                                <h2 className="text-3xl font-bold mb-2 text-yellow-400">
                                    +{claimed.reward} Coins!
                                </h2>
                                <p className="text-slate-400">
                                    {claimed.streak} day streak 🔥
                                </p>
                            </>
                        )}
                    </div>
                ) : (
                    <RewardContent pendingReward={pendingReward} loading={loading} onClaim={handleClaim} onSkip={handleSkip} />
                )}
            </div>
        </div>
    );
}

type PendingRewardData = {
    pendingStreak: number;
    baseReward: number;
    milestoneBonus: number;
    totalReward: number;
} | null;

function RewardContent({ pendingReward, loading, onClaim, onSkip }: { pendingReward: PendingRewardData, loading: boolean, onClaim: () => void, onSkip: () => void }) {
    // If pendingReward is null, something went wrong - show loading or error
    if (!pendingReward) {
        return <div className="text-center text-slate-400">Loading...</div>;
    }

    const { pendingStreak, baseReward, milestoneBonus, totalReward } = pendingReward;
    const isMilestone = milestoneBonus > 0;
    const nextMilestone = getNextMilestone(pendingStreak);

    // Progress bar logic

    if (isMilestone) {
        return (
            <div className="relative text-center">
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-48 h-48 bg-yellow-500/20 blur-3xl rounded-full pointer-events-none"></div>

                <h2 className="text-lg font-bold text-yellow-500 uppercase tracking-widest mb-1">Milestone Reached!</h2>

                <div className="my-6 relative">
                    <div className="text-6xl mb-2 animate-bounce">🎁</div>
                    <div className="text-5xl font-black text-white drop-shadow-[0_0_15px_rgba(234,179,8,0.5)]">
                        +{totalReward}
                    </div>
                    <div className="text-sm text-yellow-200 font-medium">COINS</div>
                </div>

                <div className="bg-bg-elevated/80 rounded-xl p-4 mb-6 border border-yellow-500/30">
                    <div className="flex justify-between text-sm mb-2">
                        <span className="text-slate-400">Daily Base</span>
                        <span className="text-white">+{baseReward}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold text-yellow-400">
                        <span>{pendingStreak} Day Bonus</span>
                        <span>+{milestoneBonus}</span>
                    </div>
                    <div className="mt-3 text-xs text-slate-400 border-t border-slate-700 pt-3">
                        You are legendary! {nextMilestone ? `Next bonus at Day ${nextMilestone.day} (+${nextMilestone.bonus})` : ''}
                    </div>
                </div>

                <GamePrimaryButton
                    onClick={onClaim}
                    disabled={loading}
                    className="w-full text-lg animate-pulse"
                >
                    {loading ? 'Claiming...' : 'CLAIM JACKPOT'}
                </GamePrimaryButton>
            </div>
        );
    }

    return (
        <div className="relative">
            <div className="text-center mb-6">
                <div className="flex justify-center mb-4">
                    <div className="relative">
                        <img src={brandAssetUrls.coinIcon} alt="Coins" className="w-20 h-20 object-contain drop-shadow-xl" />
                        <div className="absolute -bottom-2 -right-2 bg-bg-elevated text-white text-xs font-bold px-2 py-0.5 rounded-full border border-border">
                            Day {pendingStreak}
                        </div>
                    </div>
                </div>

                <h2 className="text-3xl font-bold mb-1 text-white">+{totalReward} Coins</h2>
                <div className="text-slate-400 text-sm flex items-center justify-center gap-1.5">
                    <span className="text-orange-500">🔥</span>
                    <span>{pendingStreak} day streak</span>
                </div>
            </div>

            {/* Progress to next milestone */}
            {nextMilestone && (
                <div className="bg-bg-elevated rounded-xl p-4 mb-6 border border-border">
                    <div className="flex justify-between items-end mb-2">
                        <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">
                            Progress to Day {nextMilestone.day} Bonus
                        </span>
                        <span className="text-yellow-400 text-xs font-bold">
                            Day {pendingStreak}/{nextMilestone.day}
                        </span>
                    </div>

                    <div className="w-full h-3 bg-bg-surface rounded-full overflow-hidden mb-2">
                        <div
                            className="h-full bg-gradient-to-r from-yellow-600 to-yellow-400 transition-all duration-500"
                            style={{ width: `${(pendingStreak / nextMilestone.day) * 100}%` }}
                        ></div>
                    </div>

                    <div className="text-right text-xs text-slate-300">
                        <span className="text-yellow-400 font-bold">+{nextMilestone.bonus} coins</span> waiting at Day {nextMilestone.day}!
                    </div>
                </div>
            )}

            <GamePrimaryButton
                onClick={onClaim}
                disabled={loading}
                className="w-full mb-3"
            >
                {loading ? 'Claiming...' : 'Claim Reward'}
            </GamePrimaryButton>

            <button
                onClick={onSkip}
                className="w-full text-slate-500 hover:text-slate-300 py-2 transition-colors text-sm"
            >
                Maybe later
            </button>
        </div>
    );
}
