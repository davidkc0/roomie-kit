import { useEffect } from 'react';
import { useStreamingStore, type GiftEvent } from '../../state/streamingStore';
import { Gift } from 'lucide-react';

/**
 * GiftFeed
 * 
 * TikTok-style gift notification feed.
 * - Shows multiple gifts in a vertical stack (bottom-left, above chat)
 * - Displays combo counter (x2, x3...) for rapid succession
 * - Auto-dismisses items after 10 seconds
 */
export function GiftFeed() {
    const recentGifts = useStreamingStore((state) => state.recentGifts);
    const cleanupExpiredGifts = useStreamingStore((state) => state.cleanupExpiredGifts);

    // Auto-cleanup timer
    useEffect(() => {
        const interval = setInterval(() => {
            cleanupExpiredGifts();
        }, 1000); // Check every second

        return () => clearInterval(interval);
    }, [cleanupExpiredGifts]);

    if (recentGifts.length === 0) return null;

    return (
        <div className="flex flex-col gap-2 pointer-events-none">
            {recentGifts.slice(0, 5).map((gift) => (
                <GiftItem key={gift.id} gift={gift} />
            ))}
        </div>
    );
}

function GiftItem({ gift }: { gift: GiftEvent }) {
    return (
        <div
            className="bg-black/50 backdrop-blur-md px-4 py-2 rounded-full flex items-center gap-2 animate-slide-in w-fit border border-white/10 shadow-lg"
            style={{
                animation: 'slideInLeft 0.3s ease-out',
            }}
        >
            <Gift className="w-4 h-4 text-yellow-400 shrink-0" />
            <span className="text-white text-sm">
                <span className="font-bold text-yellow-300">{gift.senderName}</span>
                <span className="text-white/80"> sent </span>
                <span className="font-semibold text-pink-300">{gift.giftName}</span>
            </span>

            {/* Combo Badge */}
            {gift.combo > 1 && (
                <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white font-black text-xs px-2 py-0.5 rounded-full animate-pulse shadow-lg">
                    x{gift.combo}
                </div>
            )}
        </div>
    );
}
