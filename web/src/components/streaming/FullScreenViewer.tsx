import { useEffect, useRef, useState } from 'react';
import { useStreamingStore } from '../../state/streamingStore';
import { useVideoStore } from '../../state/videoStore';
import { useEconomyStore } from '../../state/economyStore';
import { Gift, X } from 'lucide-react';
import { GiftFeed } from './GiftFeed';
import { GiftOverlay } from './GiftOverlay';
import { ChatOverlay } from '../Chat/ChatOverlay';
import { LoadingSpinner } from '../LoadingSpinner';
import { appConfig } from '../../config/app';
import { brandAssetUrls } from '../../config/customization';

type FullScreenViewerProps = {
    streamerId: string;
    onClose: () => void;
    onSendGift: (giftId: string, giftName: string) => void;
};

export function FullScreenViewer({ streamerId, onClose, onSendGift }: FullScreenViewerProps) {
    const { currentStreamerName, currentStreamerImage, gifts, status } = useStreamingStore();
    const remoteVideos = useVideoStore((state) => state.remoteVideos);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [showGiftDrawer, setShowGiftDrawer] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);

    const coinBalance = useEconomyStore(state => state.coinBalance);
    const openPurchaseDrawer = useEconomyStore(state => state.openPurchaseDrawer);

    // Watch for stream updates
    useEffect(() => {
        const sourceVideo = remoteVideos[streamerId];
        if (sourceVideo && sourceVideo.srcObject) {
            setStream(sourceVideo.srcObject as MediaStream);
        } else {
            console.log('[FullScreenViewer] Waiting for video stream for:', streamerId);
        }
    }, [remoteVideos, streamerId]);

    // Attach stream to our video element
    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    // Auto-close if stream ends
    useEffect(() => {
        if (status !== 'active_stream' && status !== 'solo_streaming') {
            onClose();
        }
    }, [status, onClose]);

    return (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
            {/* Gift Animation Overlay */}
            {appConfig.features.gifts && <GiftOverlay />}

            {/* Main Video Layer */}
            <div className="absolute inset-0 z-0">
                {stream ? (
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-slate-900">
                        <div className="text-center p-6">
                            <LoadingSpinner size="lg" className="mx-auto mb-4" />
                            <p className="text-slate-400">Loading stream...</p>
                        </div>
                    </div>
                )}
                {/* Gradient Overlays */}
                <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
                <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />
            </div>

            {/* ALL UI Overlays - single z-10 container matching StreamerUI exactly */}
            <div
                className="absolute inset-0 z-10 flex flex-col pointer-events-none"
                style={{
                    paddingTop: 'calc(env(safe-area-inset-top) + 16px)',
                    paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)',
                    paddingLeft: '16px',
                    paddingRight: '16px'
                }}
            >
                {/* Top Bar - inside overlay with pointer-events-auto */}
                <div className="flex items-center justify-between pointer-events-auto">
                    {/* Streamer Info */}
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-500 to-pink-500 p-0.5">
                            <div className="w-full h-full rounded-full bg-slate-800 overflow-hidden">
                                {currentStreamerImage ? (
                                    <img src={currentStreamerImage} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-white font-bold text-sm">
                                        {currentStreamerName?.charAt(0).toUpperCase() || '?'}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div>
                            <h3 className="text-white font-bold text-sm shadow-sm">{currentStreamerName}</h3>
                            <div className="flex items-center gap-1.5 text-xs text-white/90">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                LIVE
                            </div>
                        </div>
                    </div>

                    {/* Close Button */}
                    <button
                        onClick={onClose}
                        className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white border border-white/20 active:scale-95 transition-transform"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Middle - Gift Feed (above visible comments) */}
                <div className="flex-1 flex flex-col justify-end pb-48 px-4">
                    <GiftFeed />
                </div>

                {/* Bottom - Chat + Gift Button */}
                <div className="px-4 pointer-events-auto flex items-end gap-4">
                    <div className="flex-1">
                        <ChatOverlay showInputField={true} />
                    </div>

                    {/* Gift Button */}
                    {appConfig.features.gifts && <button
                        onClick={() => setShowGiftDrawer(true)}
                        className="w-12 h-12 rounded-full bg-gradient-to-tr from-yellow-400 to-orange-500 flex items-center justify-center shadow-lg active:scale-95 transition-transform animate-bounce relative shrink-0"
                    >
                        <Gift className="w-6 h-6 text-white" />
                    </button>}
                </div>
            </div>

            {/* Gift Drawer Overlay */}
            {appConfig.features.gifts && showGiftDrawer && (
                <>
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/50 z-40"
                        onClick={() => setShowGiftDrawer(false)}
                    />

                    {/* Drawer */}
                    <div
                        className="absolute bottom-0 left-0 right-0 z-50 bg-bg-surface border-t border-border rounded-t-2xl animate-in slide-in-from-bottom duration-200"
                        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-6 border-b border-border-subtle">
                            <h2 className="text-white font-bold text-lg">Send a Gift</h2>

                            {/* Right: Recharge + Close */}
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
                                    <X className="w-6 h-6" />
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
        </div>
    );
}
