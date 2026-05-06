import { useState } from 'react';
import { useControlsPrefsStore } from '../state/controlsPrefsStore';

/**
 * One-time overlay shown on the user's first room visit explaining the dynamic joystick.
 * Dismissed via "Got it" button → persists `hasSeenControlsTutorial = true`.
 */
export function ControlsTutorialOverlay() {
    const hasSeenTutorial = useControlsPrefsStore((s) => s.hasSeenControlsTutorial);
    const markTutorialSeen = useControlsPrefsStore((s) => s.markTutorialSeen);
    const [dismissed, setDismissed] = useState(false);

    if (hasSeenTutorial || dismissed) return null;

    const handleDismiss = () => {
        setDismissed(true);
        markTutorialSeen();
    };

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.75)' }}
            onClick={handleDismiss}
        >
            <div
                className="mx-6 max-w-sm w-full rounded-2xl overflow-hidden"
                style={{ backgroundColor: 'rgba(20, 20, 30, 0.95)', backdropFilter: 'blur(16px)' }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Tutorial content */}
                <div className="px-6 pt-8 pb-4 text-center">
                    <h2 className="text-xl font-bold text-white mb-2">How to Move</h2>
                    <p className="text-sm text-white/60 mb-6">
                        Touch and drag anywhere on the left side of your screen to move
                    </p>

                    {/* Visual illustration */}
                    <div className="relative mx-auto mb-6" style={{ width: 200, height: 140 }}>
                        {/* Phone outline */}
                        <div
                            className="absolute inset-0 rounded-xl border-2 border-white/20"
                        >
                            {/* Left half highlight */}
                            <div
                                className="absolute left-0 top-0 bottom-0 rounded-l-xl"
                                style={{
                                    width: '50%',
                                    background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.3), rgba(99, 102, 241, 0.1))',
                                }}
                            />
                            {/* Divider */}
                            <div className="absolute left-1/2 top-2 bottom-2 w-px bg-white/15" />
                        </div>

                        {/* Animated finger + joystick on left side */}
                        <div className="absolute" style={{ left: '22%', top: '45%' }}>
                            {/* Joystick base */}
                            <div
                                className="w-10 h-10 rounded-full border-2 border-white/30 bg-white/10"
                                style={{ transform: 'translate(-50%, -50%)' }}
                            />
                            {/* Joystick thumb with pulsing animation */}
                            <div
                                className="absolute w-5 h-5 rounded-full bg-white/50 border border-white/60 animate-pulse"
                                style={{
                                    top: '-5px',
                                    left: '2px',
                                    transform: 'translate(-50%, -50%)',
                                }}
                            />
                        </div>

                        {/* "Move" label */}
                        <span className="absolute text-[10px] font-medium text-white/50 uppercase tracking-wider" style={{ left: '22%', bottom: 8, transform: 'translateX(-50%)' }}>
                            Move
                        </span>

                        {/* "Interact" label on right side */}
                        <span className="absolute text-[10px] font-medium text-white/50 uppercase tracking-wider" style={{ left: '75%', bottom: 8, transform: 'translateX(-50%)' }}>
                            Look
                        </span>
                    </div>

                    <p className="text-xs text-white/40 mb-4">
                        You can switch to a classic joystick in Settings
                    </p>
                </div>

                {/* Dismiss button */}
                <button
                    onClick={handleDismiss}
                    className="w-full py-4 text-sm font-semibold text-white border-t border-white/10 transition-colors hover:bg-white/5 active:bg-white/10"
                >
                    Got it
                </button>
            </div>
        </div>
    );
}
