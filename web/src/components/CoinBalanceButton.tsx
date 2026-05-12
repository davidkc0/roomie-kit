import { useEconomyStore } from '../state/economyStore';
import { useEffect } from 'react';
import { appConfig } from '../config/app';
import { brandAssetUrls } from '../config/customization';

type Props = {
    variant?: 'profile' | 'room';  // Different styles for different locations
};

export function CoinBalanceButton({ variant = 'profile' }: Props) {
    const { coinBalance, loading, fetchBalances, openPurchaseDrawer } = useEconomyStore();

    useEffect(() => {
        if (!appConfig.features.economy) return;
        fetchBalances();
    }, []);

    const isProfile = variant === 'profile';

    if (!appConfig.features.economy) return null;

    if (loading && coinBalance === 0) {
        return (
            <div className={`flex items-center gap-2 bg-bg-elevated px-3 rounded-full animate-pulse ${isProfile ? 'py-1.5' : 'py-2'}`}>
                <div className="w-5 h-5 bg-border rounded-full"></div>
                <div className="w-10 h-4 bg-border rounded"></div>
            </div>
        );
    }


    return (
        <button
            onClick={appConfig.features.payments ? openPurchaseDrawer : undefined}
            className={`
        flex items-center gap-2 rounded-full border transition-all z-20
        ${isProfile
                    ? 'bg-yellow-500/10 border-yellow-500/30 px-3 py-1.5 hover:bg-yellow-500/20'
                    : 'bg-bg-surface border-yellow-500/30 px-3 py-2 hover:bg-bg-elevated backdrop-blur-md shadow-xl'
                }
      `}
        >
            {/* Coins */}
            <div className="flex items-center gap-1.5">
                <img src={brandAssetUrls.coinIcon} alt="Coins" className="w-5 h-5 object-contain" />
                <span className={`font-bold ${isProfile ? 'text-yellow-400' : 'text-yellow-300'}`}>
                    {coinBalance.toLocaleString()}
                </span>
            </div>

            {/* Plus icon to indicate clickable */}
            {appConfig.features.payments && <div className={`
        flex items-center justify-center w-5 h-5 rounded-full
        ${isProfile ? 'bg-yellow-500/20 text-yellow-500' : 'bg-white/10 text-white'}
      `}>
                <span className="text-xs">+</span>
            </div>}
        </button>
    );
}
