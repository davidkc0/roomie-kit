import { useEconomyStore } from '../state/economyStore';
import { useEffect } from 'react';

export function StreakBadge() {
    const { streak, openStreakDrawer, fetchBalances } = useEconomyStore();

    useEffect(() => {
        fetchBalances();
    }, []);

    // Always show — tapping opens the drawer with streak explanation

    return (
        <button
            onClick={openStreakDrawer}
            className="flex items-center gap-1.5 bg-orange-500/10 border border-orange-500/30 px-3 py-1.5 rounded-full hover:bg-orange-500/20 transition-all z-20 group"
        >
            <div className="relative">
                <img
                    src="/streak1.png"
                    alt="Streak"
                    className="w-5 h-5 object-contain group-hover:scale-110 transition-transform"
                />
            </div>
            <span className="font-bold text-orange-400 text-sm">
                {streak}d
            </span>
        </button>
    );
}
