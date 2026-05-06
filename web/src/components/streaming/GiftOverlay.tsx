import { useEffect, useState, useCallback } from 'react';
import { useRive, Layout, Fit, Alignment } from '@rive-app/react-canvas';
import { useStreamingStore } from '../../state/streamingStore';

/**
 * GiftOverlay
 * 
 * Renders gift animations using separate Rive artboards.
 * Each gift (Crown, Heart, Star, Diamond) has its own artboard with a pre-made animation.
 * 
 * RIVE FILE STRUCTURE:
 * - File: /assets/gifts.riv  
 * - Artboards: "Crown", "Heart", "Star", "Diamond"
 * - Each artboard has: State Machine "State Machine 1", Timeline "Timeline 1"
 */
export function GiftOverlay() {
    const { lastGiftEvent } = useStreamingStore();
    const [currentArtboard, setCurrentArtboard] = useState<string | null>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [key, setKey] = useState(0); // Force re-mount of Rive component

    // Map gift names to artboard names
    const getArtboardName = useCallback((giftName: string): string | null => {
        const map: Record<string, string> = {
            'Crown': 'Crown',
            'Heart': 'Heart',
            'Star': 'Star',
            'Diamond': 'Diamond',
        };
        return map[giftName] || null;
    }, []);

    // Effect: When a gift event arrives, switch artboard and play
    useEffect(() => {
        if (!lastGiftEvent) return;

        const { giftName, senderName } = lastGiftEvent;
        console.log('[GiftOverlay] 🎁 RECEIVED EVENT:', { giftName, senderName });

        const artboard = getArtboardName(giftName);
        if (!artboard) {
            console.warn('[GiftOverlay] Unknown gift type:', giftName);
            return;
        }

        // Set the artboard and force re-mount
        setCurrentArtboard(artboard);
        setKey(prev => prev + 1); // Increment key to force new Rive instance
        setIsVisible(true);

        console.log('[GiftOverlay] Playing artboard:', artboard);

        // Auto-hide after animation (3 seconds)
        const hideTimer = setTimeout(() => {
            setIsVisible(false);
            console.log('[GiftOverlay] Hiding animation');
        }, 3000);

        return () => clearTimeout(hideTimer);
    }, [lastGiftEvent, getArtboardName]);

    // Don't render anything if no artboard selected
    if (!currentArtboard) {
        return null;
    }

    return (
        <div className={`fixed inset-0 pointer-events-none z-[100] overflow-hidden transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
            <RiveGift key={key} artboard={currentArtboard} />
        </div>
    );
}

/**
 * RiveGift - Individual Rive animation component
 * This is a separate component so we can cleanly remount it with a new artboard
 */
function RiveGift({ artboard }: { artboard: string }) {
    const { RiveComponent } = useRive({
        src: '/assets/gifts.riv',
        artboard: artboard,
        stateMachines: 'State Machine 1',
        layout: new Layout({
            fit: Fit.Contain,
            alignment: Alignment.Center,
        }),
        autoplay: true, // Auto-play when loaded
        onLoadError: () => console.warn(`[GiftOverlay] Failed to load artboard: ${artboard}`),
        onLoad: () => console.log(`[GiftOverlay] ✅ Loaded artboard: ${artboard}`),
    });

    return (
        <div className="w-full h-full flex items-center justify-center">
            <div className="w-64 h-64">
                <RiveComponent />
            </div>
        </div>
    );
}
