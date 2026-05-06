import { useEconomyStore } from '../state/economyStore';
import { GamePrimaryButton } from './GamePrimaryButton';
import { calculateDailyReward, MILESTONES as MILESTONE_MAP } from '../utils/economyHelpers';

// Build milestone display data from the shared reward config
const MILESTONES = Object.entries(MILESTONE_MAP)
    .map(([day, bonus]) => {
        const dayNum = Number(day);
        const { baseDaily } = calculateDailyReward(dayNum);
        return {
            days: dayNum,
            label: `+${bonus} Milestone Bonus`,
            reward: baseDaily + bonus,
            icon: `/streak${dayNum <= 1 ? 1 : dayNum <= 3 ? 3 : dayNum <= 7 ? 7 : dayNum <= 14 ? 14 : 30}.png`,
        };
    })
    .sort((a, b) => a.days - b.days);

export function StreakInfoDrawer() {
    const {
        showStreakDrawer,
        closeStreakDrawer,
        streak
    } = useEconomyStore();

    if (!showStreakDrawer) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50 z-40"
                onClick={closeStreakDrawer}
            />

            {/* Drawer */}
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-bg-surface border-t border-border rounded-t-2xl animate-in slide-in-from-bottom duration-200 max-h-[85vh] flex flex-col p-6 safe-area-bottom">

                {/* Header */}
                <div className="flex items-center justify-between mb-6 shrink-0">
                    <h2 className="text-white font-bold text-lg flex items-center gap-2">
                        <img src="/streak1.png" alt="Fire" className="w-6 h-6 object-contain" />
                        Daily Streak
                    </h2>
                    <button
                        onClick={closeStreakDrawer}
                        className="text-slate-400 hover:text-white"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Current Status */}
                <div className="bg-bg-elevated rounded-xl p-5 mb-6 text-center shrink-0">
                    <div className="flex justify-center mb-2">
                        <img src="/streak1.png" alt="Streak" className={`w-16 h-16 object-contain drop-shadow-lg ${streak > 0 ? 'animate-pulse' : 'grayscale opacity-60'}`} />
                    </div>
                    {streak > 0 ? (
                        <>
                            <div className="text-4xl font-black text-orange-500 mb-1">{streak} {streak === 1 ? 'DAY' : 'DAYS'}</div>
                            <p className="text-slate-400 text-sm">
                                You're on fire! Keep coming back daily to build your streak and earn massive rewards.
                            </p>
                        </>
                    ) : (
                        <>
                            <div className="text-2xl font-bold text-white mb-2">Start Your Streak!</div>
                            <p className="text-slate-400 text-sm">
                                Claim your daily reward to begin a streak. Come back every day to keep it going — the longer your streak, the bigger your rewards!
                            </p>
                        </>
                    )}
                </div>

                {/* Milestones */}
                <div className="mb-6 overflow-y-auto">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Streak Milestones</h3>
                    <div className="space-y-3">
                        {MILESTONES.map((milestone) => {
                            const reached = streak >= milestone.days;
                            return (
                                <div
                                    key={milestone.days}
                                    className={`
                                        flex items-center justify-between p-3 rounded-lg border
                                        ${reached
                                            ? 'bg-orange-500/10 border-orange-500/30'
                                            : 'bg-bg-elevated border-border'
                                        }
                                    `}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 flex items-center justify-center">
                                            <img
                                                src={milestone.icon}
                                                alt={`${milestone.days} day streak`}
                                                className={`w-full h-full object-contain ${reached ? '' : 'grayscale opacity-50'}`}
                                            />
                                        </div>
                                        <div>
                                            <div className={`font-bold ${reached ? 'text-white' : 'text-slate-300'}`}>
                                                {milestone.days} {milestone.days === 1 ? 'Day' : 'Days'} Streak
                                            </div>
                                            <div className="text-xs text-slate-400">
                                                {milestone.label}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <span className={`font-bold ${reached ? 'text-yellow-400' : 'text-slate-500'}`}>
                                            +{milestone.reward}
                                        </span>
                                        <img src="/coin.png" className={`w-4 h-4 ${reached ? '' : 'grayscale opacity-50'}`} alt="Coins" />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Footer Action */}
                <GamePrimaryButton
                    onClick={closeStreakDrawer}
                    className="shrink-0"
                >
                    Got it
                </GamePrimaryButton>
            </div>
        </>
    );
}
