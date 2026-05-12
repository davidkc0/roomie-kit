import { useEffect, useState } from 'react';
import { useChessStore } from '../state/chessStore';
import { sendSignal } from '../lib/signaling';
import { useAuthStore } from '../state/authStore';
import { useEconomyStore } from '../state/economyStore';
import { Check, X, Coins } from 'lucide-react';
import { appConfig } from '../config/app';
import { brandAssetUrls } from '../config/customization';

export function ChessInviteModal() {
    const { multiplayerStatus, pendingInvite, acceptInvite, declineInvite } = useChessStore();
    const { user, profile } = useAuthStore();
    const { checkGamePlayCost, startGamePlay, openPurchaseDrawer, coinBalance } = useEconomyStore();

    const [gamePlayCost, setGamePlayCost] = useState<{ isFree: boolean; cost: number; balance: number } | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Check game play cost when modal opens
    useEffect(() => {
        if (appConfig.features.economy && multiplayerStatus === 'incoming' && pendingInvite) {
            checkGamePlayCost('chess').then(setGamePlayCost);
        }
    }, [multiplayerStatus, pendingInvite, checkGamePlayCost]);

    if (multiplayerStatus !== 'incoming' || !pendingInvite) return null;

    const handleAccept = async () => {
        if (!user?.id || isProcessing) return;
        setIsProcessing(true);
        setError(null);

        const result = appConfig.features.economy
            ? await startGamePlay('chess')
            : { allowed: true };

        if (!result.allowed) {
            setIsProcessing(false);
            if (result.reason === 'insufficient_coins') {
                setError('Not enough coins');
            } else {
                setError('Failed to start game');
            }
            return;
        }

        // Accept locally
        acceptInvite();

        // Send accept signal to inviter with proper profile data
        const avatarUrl = profile?.profile_image_url || profile?.avatar_headshot_url;
        await sendSignal({
            type: 'chess_accept',
            fromId: user.id,
            fromName: profile?.username || 'Player',
            fromAvatar: avatarUrl,
            toId: pendingInvite.fromId,
            roomId: pendingInvite.sessionId
        });

        setIsProcessing(false);
    };

    const handleDecline = async () => {
        if (!user?.id) return;

        // Decline locally
        declineInvite();

        // Send decline signal to inviter
        await sendSignal({
            type: 'chess_decline',
            fromId: user.id,
            toId: pendingInvite.fromId,
            roomId: pendingInvite.sessionId
        });
    };

    const needsCoins = appConfig.features.economy && appConfig.features.payments && gamePlayCost && !gamePlayCost.isFree && coinBalance < gamePlayCost.cost;

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                {/* Chess icon */}
                <div className="w-20 h-20 mx-auto mb-4">
                    <img src={brandAssetUrls.chessLogo} alt="Chess" className="w-full h-full object-contain" />
                </div>

                {/* Title */}
                <h2 className="text-xl font-bold text-white text-center mb-2">
                    Chess Challenge!
                </h2>

                {/* Inviter info */}
                <div className="flex items-center justify-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-full bg-slate-700 overflow-hidden">
                        {pendingInvite.fromAvatar ? (
                            <img src={pendingInvite.fromAvatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-white text-xl font-bold">
                                {pendingInvite.fromName.charAt(0).toUpperCase()}
                            </div>
                        )}
                    </div>
                    <div className="text-white">
                        <div className="font-medium">{pendingInvite.fromName}</div>
                        <div className="text-sm text-slate-400">wants to play chess</div>
                    </div>
                </div>

                {/* Color assignment */}
                <div className="text-center text-sm text-slate-400 mb-4">
                    You'll play as {pendingInvite.assignedColor === 'w' ? 'White ⚪' : 'Black ⚫'}
                </div>

                {/* Cost display */}
                {appConfig.features.economy && gamePlayCost && (
                    <div className={`text-center text-sm mb-4 py-2 px-3 rounded-lg ${gamePlayCost.isFree
                        ? 'bg-green-500/20 text-green-400'
                        : needsCoins
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-yellow-500/20 text-yellow-400'
                        }`}>
                        {gamePlayCost.isFree ? (
                            '✨ Free play (1st game today)'
                        ) : needsCoins ? (
                            <div className="flex items-center justify-center gap-2">
                                <Coins className="w-4 h-4" />
                                <span>Need {gamePlayCost.cost} coins (you have {coinBalance})</span>
                            </div>
                        ) : (
                            <div className="flex items-center justify-center gap-2">
                                <img src={brandAssetUrls.coinIcon} alt="" className="w-4 h-4" />
                                <span>{gamePlayCost.cost} coins to play</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Error display */}
                {error && (
                    <div className="text-center text-sm text-red-400 mb-4">
                        {error}
                    </div>
                )}

                {/* Buttons */}
                <div className="flex gap-3">
                    <button
                        onClick={handleDecline}
                        disabled={isProcessing}
                        className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-slate-800 hover:bg-slate-700 border border-white/10 text-white rounded-xl transition-all active:scale-95 disabled:opacity-50"
                    >
                        <X className="w-5 h-5" />
                        Decline
                    </button>

                    {needsCoins ? (
                        <button
                            onClick={() => {
                                declineInvite();
                                openPurchaseDrawer();
                            }}
                            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-yellow-600 hover:bg-yellow-500 text-white rounded-xl transition-all active:scale-95 font-medium"
                        >
                            <Coins className="w-5 h-5" />
                            Buy Coins
                        </button>
                    ) : (
                        <button
                            onClick={handleAccept}
                            disabled={isProcessing}
                            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-green-600 hover:bg-green-500 text-white rounded-xl transition-all active:scale-95 font-medium disabled:opacity-50"
                        >
                            <Check className="w-5 h-5" />
                            {isProcessing ? 'Starting...' : 'Accept'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
