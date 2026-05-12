import { useEconomyStore } from '../state/economyStore';
import { useState, useEffect } from 'react';
import { brandAssetUrls } from '../config/customization';

const COIN_PACKAGES = [
    { coins: 100, usd: 0.99 },
    { coins: 550, usd: 4.99 },
    { coins: 1200, usd: 9.99 },
    { coins: 2750, usd: 19.99 },
    { coins: 7500, usd: 49.99 },
    { coins: 17500, usd: 99.99 },
];

export function PurchaseDrawer() {
    const {
        showPurchaseDrawer,
        closePurchaseDrawer,
        coinBalance,
        gemBalance,
        purchaseCoins,
        withdrawGems,
        fetchBalances,
        loading
    } = useEconomyStore();

    const [activeTab, setActiveTab] = useState<'buy' | 'withdraw'>('buy');

    // Refresh balances when drawer opens (ensures accurate gem count for streamers)
    useEffect(() => {
        if (showPurchaseDrawer) {
            fetchBalances();
        }
    }, [showPurchaseDrawer, fetchBalances]);

    if (!showPurchaseDrawer) return null;

    const handlePurchase = async (pkg: typeof COIN_PACKAGES[0]) => {
        const success = await purchaseCoins(pkg.coins, pkg.usd);
        if (success) {
            // purchaseCoins already polls until coins are credited,
            // so balance is updated by the time we get here
            closePurchaseDrawer();
        }
    };

    const handleWithdraw = async () => {
        // Minimum withdrawal: 1000 gems
        if (gemBalance < 1000) return;

        const success = await withdrawGems(gemBalance);
        if (success) {
            setTimeout(() => closePurchaseDrawer(), 1500);
        }
    };

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50 z-40"
                onClick={closePurchaseDrawer}
            />

            {/* Drawer */}
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-bg-surface border-t border-border rounded-t-2xl animate-in slide-in-from-bottom duration-200 max-h-[85vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-border-subtle shrink-0">
                    <h2 className="text-white font-bold text-lg">Currency</h2>
                    <button
                        onClick={closePurchaseDrawer}
                        className="text-slate-400 hover:text-white"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Current Balances */}
                <div className="grid grid-cols-2 gap-4 p-4 bg-bg-elevated shrink-0">
                    <div className="text-center">
                        <div className="flex justify-center mb-1">
                            <img src={brandAssetUrls.coinIcon} alt="Coins" className="w-8 h-8 object-contain" />
                        </div>
                        <div className="text-2xl font-bold text-yellow-400">{coinBalance.toLocaleString()}</div>
                        <div className="text-xs text-slate-400 uppercase tracking-wider">Coins</div>
                    </div>
                    <div className="text-center">
                        <div className="flex justify-center mb-1">
                            <img src="/gem.png" alt="Gems" className="w-8 h-8 object-contain" />
                        </div>
                        <div className="text-2xl font-bold text-blue-400">{gemBalance.toLocaleString()}</div>
                        <div className="text-xs text-slate-400 uppercase tracking-wider">Gems</div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-border-subtle shrink-0">
                    <button
                        onClick={() => setActiveTab('buy')}
                        className={`flex-1 py-3 font-medium transition-colors ${activeTab === 'buy'
                            ? 'text-yellow-400 border-b-2 border-yellow-400'
                            : 'text-slate-400 hover:text-white'
                            }`}
                    >
                        Buy Coins
                    </button>
                    <button
                        onClick={() => setActiveTab('withdraw')}
                        className={`flex-1 py-3 font-medium transition-colors ${activeTab === 'withdraw'
                            ? 'text-blue-400 border-b-2 border-blue-400'
                            : 'text-slate-400 hover:text-white'
                            }`}
                    >
                        Withdraw Gems
                    </button>
                </div>

                {/* Content - Scrollable */}
                <div className="p-4 overflow-y-auto flex-1">
                    {activeTab === 'buy' ? (
                        <div className="space-y-3 pb-8">
                            {COIN_PACKAGES.map((pkg) => (
                                <button
                                    key={pkg.usd}
                                    onClick={() => handlePurchase(pkg)}
                                    disabled={loading}
                                    className="w-full bg-bg-elevated hover:bg-bg-elevated/80 disabled:opacity-50 rounded-xl p-4 flex items-center justify-between transition-colors border border-border hover:border-yellow-500 group"
                                >
                                    <div className="flex items-center gap-3">
                                        <img src={brandAssetUrls.coinIcon} alt="Coin" className="w-8 h-8 object-contain group-hover:scale-110 transition-transform" />
                                        <div className="text-left">
                                            <div className="font-bold text-lg text-white">
                                                {pkg.coins.toLocaleString()}
                                            </div>
                                            {/* Optional: Show bonus if calculated */}
                                        </div>
                                    </div>
                                    <div className="px-4 py-1.5 bg-yellow-500 rounded-full text-black font-bold text-sm">
                                        ${pkg.usd.toFixed(2)}
                                    </div>
                                </button>
                            ))}

                            <p className="text-xs text-slate-500 mt-4 text-center">
                                Coins are used to send gifts. Purchase is non-refundable.
                            </p>
                        </div>
                    ) : (
                        <div className="pb-8">
                            <div className="bg-bg-elevated rounded-xl p-6 text-center mb-4">
                                <p className="text-slate-400 text-sm mb-4">
                                    Convert gems to cash. You keep 85%.<br />
                                    Minimum withdrawal: 1,000 gems.
                                </p>

                                {gemBalance < 1000 ? (
                                    <div className="bg-bg-surface rounded-lg p-4">
                                        <div className="text-blue-400 font-bold mb-1">
                                            {gemBalance.toLocaleString()} / 1,000
                                        </div>
                                        <div className="w-full bg-border h-2 rounded-full overflow-hidden">
                                            <div
                                                className="bg-blue-500 h-full"
                                                style={{ width: `${Math.min((gemBalance / 1000) * 100, 100)}%` }}
                                            ></div>
                                        </div>
                                        <p className="text-xs text-slate-500 mt-2">Earn more gems by receiving gifts!</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-slate-400">Withdraw Amount</span>
                                            <span className="text-white font-bold">{gemBalance.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-slate-400">You Receive (85%)</span>
                                            <span className="text-green-400 font-bold">${((gemBalance * 0.85) / 100).toFixed(2)}</span>
                                        </div>

                                        <button
                                            onClick={handleWithdraw}
                                            disabled={loading}
                                            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors mt-4"
                                        >
                                            {loading ? 'Processing...' : 'Withdraw to PayPal'}
                                        </button>

                                        <p className="text-xs text-slate-500">
                                            Withdrawals take 3-5 business days.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
