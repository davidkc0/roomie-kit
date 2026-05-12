import { useEffect, useState } from 'react';
import { useStreamingStore } from '../../state/streamingStore';
import { useAuthStore } from '../../state/authStore';
import { useEconomyStore } from '../../state/economyStore';
import { FullScreenViewer } from './FullScreenViewer';
import { Hand, Vote, Gift, X, Check } from 'lucide-react';
import { appConfig } from '../../config/app';
import { brandAssetUrls } from '../../config/customization';

type ViewerUIProps = {
    myId: string;
    myName: string;
    myAvatarUrl?: string;
    onOptIn: () => void;
    onVote: (candidateId: string) => void;
    onAccept: () => void;
    onDecline: () => void;
    onSendGift: (giftId: string, giftName: string) => void;
};

export function ViewerUI({
    myId,
    myName,
    myAvatarUrl: _myAvatarUrl,
    onOptIn,
    onVote,
    onAccept,
    onDecline,
    onSendGift,
}: ViewerUIProps) {
    const {
        status,
        candidates,
        queue,
        hasOptedIn,
        votingEndTime,
        winnerId,
        acceptDeadline,
        gifts,
        currentStreamerName,
        currentStreamerId,
        myVote,
    } = useStreamingStore();

    const [votingTimeLeft, setVotingTimeLeft] = useState('1:00');
    const [acceptTimeLeft, setAcceptTimeLeft] = useState(10);
    const [showGiftDrawer, setShowGiftDrawer] = useState(false);
    const [showFullScreen, setShowFullScreen] = useState(false);

    const coinBalance = useEconomyStore(state => state.coinBalance);
    const openPurchaseDrawer = useEconomyStore(state => state.openPurchaseDrawer);

    const isWinner = winnerId === myId;

    // Voting timer
    useEffect(() => {
        if (status !== 'voting' || !votingEndTime) return;

        const updateTimer = () => {
            const remaining = Math.max(0, votingEndTime - Date.now());
            const seconds = Math.ceil(remaining / 1000);
            setVotingTimeLeft(`0:${seconds.toString().padStart(2, '0')}`);
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [status, votingEndTime]);

    // Accept timer
    useEffect(() => {
        if (status !== 'winner_accepting' || !acceptDeadline) return;

        const updateTimer = () => {
            const remaining = Math.max(0, acceptDeadline - Date.now());
            setAcceptTimeLeft(Math.ceil(remaining / 1000));
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [status, acceptDeadline]);

    // Check if user is the only one who opted in (can go live immediately)
    const canGoLiveNow = hasOptedIn && queue.length === 1 && queue[0]?.id === myId;

    // ============================================
    // EMPTY STATE - Opt-in button OR Go Live button
    // ============================================
    if (status === 'empty') {
        return (
            <div
                className="fixed top-20 left-1/2 -translate-x-1/2 z-30"
                style={{ paddingTop: 'env(safe-area-inset-top)' }}
            >
                {canGoLiveNow ? (
                    // User is only opt-in - show Go Live button
                    <button
                        onClick={() => {
                            // Pass Supabase UUID so gift recipients can send to correct DB profile
                            const sbaId = useAuthStore.getState().user?.id;
                            useStreamingStore.getState().startStream(myId, myName, sbaId);
                        }}
                        className="bg-bg-surface/80 backdrop-blur-xl border border-white/10 text-white px-5 py-2.5 rounded-full font-bold shadow-xl flex items-center gap-2 active:scale-95 transition-transform hover:bg-bg-elevated/80 whitespace-nowrap"
                    >
                        <span className="text-lg">🎬</span>
                        Go Live!
                    </button>
                ) : hasOptedIn ? (
                    // User opted in, waiting for others
                    <div className="bg-slate-800/90 backdrop-blur-md px-5 py-2 rounded-full border border-purple-500/50">
                        <span className="text-white font-medium flex items-center gap-2 text-sm whitespace-nowrap">
                            <Hand className="w-4 h-4 text-purple-400" />
                            You're in the queue!
                        </span>
                    </div>
                ) : (
                    // User hasn't opted in yet
                    <button
                        onClick={onOptIn}
                        className="bg-bg-surface/80 backdrop-blur-xl border border-white/10 text-white px-5 py-2.5 rounded-full font-bold shadow-xl flex items-center gap-2 active:scale-95 transition-transform hover:bg-bg-elevated/80 whitespace-nowrap"
                    >
                        <Hand className="w-5 h-5 text-purple-400" />
                        Want to Stream?
                    </button>
                )}
            </div>
        );
    }

    // ============================================
    // VOTING STATE
    // ============================================
    if (status === 'voting') {
        return (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-bg-surface rounded-3xl w-full max-w-sm overflow-hidden">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Vote className="w-5 h-5 text-white" />
                                <span className="text-white font-bold">Vote for Next Streamer</span>
                            </div>
                            <div className="bg-white/20 px-3 py-1 rounded-full">
                                <span className="text-white text-sm font-bold">{votingTimeLeft}</span>
                            </div>
                        </div>
                    </div>

                    {/* Candidates */}
                    <div className="p-4 space-y-3 max-h-80 overflow-y-auto">
                        {candidates.map((candidate) => (
                            <button
                                key={candidate.id}
                                onClick={() => onVote(candidate.id)}
                                disabled={candidate.id === myId}
                                className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all ${myVote === candidate.id
                                    ? 'bg-purple-500/20 border-2 border-purple-500'
                                    : 'bg-slate-800 border-2 border-transparent'
                                    } ${candidate.id === myId ? 'opacity-50' : 'active:scale-98'}`}
                            >
                                {/* Avatar */}
                                <div className="w-12 h-12 rounded-full bg-slate-700 overflow-hidden">
                                    {candidate.avatarUrl ? (
                                        <img src={candidate.avatarUrl} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-lg font-bold text-slate-400">
                                            {candidate.name.charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                </div>

                                {/* Name */}
                                <div className="flex-1 text-left">
                                    <div className="text-white font-medium">
                                        {candidate.name}
                                        {candidate.id === myId && <span className="text-slate-400 ml-2">(You)</span>}
                                    </div>
                                </div>

                                {/* Vote count */}
                                <div className="bg-slate-700 px-3 py-1 rounded-full">
                                    <span className="text-white font-bold">{candidate.votes}</span>
                                </div>
                            </button>
                        ))}
                    </div>

                    {/* Opt-in button (if not already in) */}
                    {!hasOptedIn && (
                        <div className="p-4 border-t border-slate-800">
                            <button
                                onClick={onOptIn}
                                className="w-full py-3 rounded-xl bg-slate-800 text-white font-medium"
                            >
                                + Add Myself
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ============================================
    // WINNER ACCEPTING STATE
    // ============================================
    if (status === 'winner_accepting' && isWinner) {
        return (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-slate-900 rounded-3xl w-full max-w-sm overflow-hidden text-center p-6">
                    <div className="text-6xl mb-4">🎉</div>
                    <h2 className="text-2xl font-bold text-white mb-2">You Won!</h2>
                    <p className="text-slate-400 mb-6">
                        You have {acceptTimeLeft} seconds to accept
                    </p>

                    <div className="flex gap-4">
                        <button
                            onClick={onDecline}
                            className="flex-1 py-4 rounded-2xl bg-slate-800 text-white font-bold flex items-center justify-center gap-2"
                        >
                            <X className="w-5 h-5" />
                            Decline
                        </button>
                        <button
                            onClick={onAccept}
                            className="flex-1 py-4 rounded-2xl bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold flex items-center justify-center gap-2"
                        >
                            <Check className="w-5 h-5" />
                            Go Live!
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ============================================
    // ACTIVE STREAM STATE - Viewer mode
    // ============================================
    if (status === 'active_stream' || status === 'solo_streaming') {
        return (
            <>
                {/* Watch Live Button + Streamer Name (Consolidated) */}
                {appConfig.features.gifts && !showFullScreen && (
                    <div
                        className="fixed bottom-28 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2"
                        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
                    >
                        <button
                            onClick={() => setShowFullScreen(true)}
                            className="bg-bg-surface/90 backdrop-blur-xl border border-white/10 text-white px-6 py-3 rounded-full font-bold shadow-2xl flex items-center gap-3 active:scale-95 transition-transform hover:bg-bg-elevated/90 animate-pulse-slow group"
                        >
                            <span className="text-xl group-hover:scale-110 transition-transform">📺</span>
                            <div className="flex flex-col items-start leading-tight">
                                <span className="text-xs text-slate-400 uppercase tracking-wider font-bold">Watch Live</span>
                                <span className="text-sm font-bold text-white max-w-[120px] truncate">
                                    {currentStreamerName || 'Streamer'}
                                </span>
                            </div>
                        </button>
                    </div>
                )}

                {/* Gift button (only show if NOT in fullscreen, as fullscreen has its own) */}
                {!showFullScreen && (
                    <button
                        onClick={() => setShowGiftDrawer(true)}
                        className="fixed bottom-28 right-4 z-30 w-14 h-14 rounded-full bg-gradient-to-r from-yellow-400 to-orange-500 flex items-center justify-center shadow-lg active:scale-95 transition-transform"
                        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
                    >
                        <Gift className="w-6 h-6 text-white" />
                    </button>
                )}

                {/* Queue info */}
                {queue.length > 0 && !showFullScreen && (
                    <div
                        className="fixed bottom-28 left-4 z-30"
                        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
                    >
                        <div className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-full">
                            <span className="text-white text-sm">
                                {queue.length} in queue
                            </span>
                        </div>
                    </div>
                )}

                {/* Full Screen Viewer */}
                {showFullScreen && currentStreamerId && (
                    <FullScreenViewer
                        streamerId={currentStreamerId}
                        onClose={() => setShowFullScreen(false)}
                        onSendGift={onSendGift}
                    />
                )}

                {/* Bottom Sheet Gift Drawer (for normal view) */}
                {appConfig.features.gifts && showGiftDrawer && !showFullScreen && (
                    <>
                        {/* Backdrop */}
                        <div
                            className="fixed inset-0 bg-black/50 z-40"
                            onClick={() => setShowGiftDrawer(false)}
                        />

                        {/* Drawer */}
                        <div
                            className="fixed bottom-0 left-0 right-0 z-50 bg-bg-surface border-t border-border rounded-t-2xl animate-in slide-in-from-bottom duration-200"
                            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between p-6 border-b border-border-subtle">
                                {/* Left: Title */}
                                <h2 className="text-white font-bold text-lg">
                                    Send a Gift
                                </h2>

                                {/* Right: Recharge + Close Button */}
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={openPurchaseDrawer}
                                        disabled={!appConfig.features.payments}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-yellow-500/10 border border-yellow-500/30 text-yellow-500 hover:bg-yellow-500/20 active:scale-95 transition-all"
                                    >
                                        <img src={brandAssetUrls.coinIcon} alt="Coin" className="w-4 h-4 object-contain" />
                                        <span className="text-xs font-bold">Recharge</span>
                                        <span className="text-[10px]">+</span>
                                    </button>
                                    <button
                                        onClick={() => setShowGiftDrawer(false)}
                                        className="text-slate-400 hover:text-white"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            {/* Gift Grid - Only Heart, Star, Crown, Diamond */}
                            <div className="p-4 grid grid-cols-4 gap-4">
                                {gifts
                                    .filter(gift => ['Heart', 'Star', 'Crown', 'Diamond'].includes(gift.name))
                                    .map((gift) => (
                                        <button
                                            key={gift.id}
                                            onClick={() => {
                                                if (coinBalance < gift.cost) {
                                                    if (appConfig.features.payments) openPurchaseDrawer();
                                                    return;
                                                }
                                                onSendGift(gift.id, gift.name);
                                                // Don't close drawer - let user send multiple gifts
                                            }}
                                            className="flex flex-col items-center gap-2 p-3 rounded-xl bg-bg-elevated hover:bg-bg-elevated/80 active:scale-95 transition-all border border-border hover:border-yellow-500"
                                        >
                                            <div className="text-3xl">
                                                {gift.name === 'Heart' && '❤️'}
                                                {gift.name === 'Star' && '⭐'}
                                                {gift.name === 'Crown' && '👑'}
                                                {gift.name === 'Diamond' && '💎'}
                                            </div>
                                            <div className="flex flex-col items-center">
                                                <span className="text-xs font-bold text-white">{gift.name}</span>
                                                <span className="text-[10px] text-yellow-400">{gift.cost} coins</span>
                                            </div>
                                        </button>
                                    ))}
                            </div>
                        </div>
                    </>
                )}
            </>
        );
    }

    return null;
}
