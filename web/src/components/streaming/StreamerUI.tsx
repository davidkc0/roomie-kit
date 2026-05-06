import { useEffect, useState, useRef } from 'react';
import { useStreamingStore } from '../../state/streamingStore';
import { useVoiceChatStore } from '../../state/voiceChatStore';
import { RefreshCw, Mic, MicOff, Users, MoreHorizontal, Camera, CameraOff } from 'lucide-react';
import { Dialog } from '@capacitor/dialog';
import { Capacitor } from '@capacitor/core';
import { GiftFeed } from './GiftFeed';
import { GiftOverlay } from './GiftOverlay';
import { ChatOverlay } from '../Chat/ChatOverlay';

type StreamerUIProps = {
    onEndStream: () => void;
    onToggleCamera: () => void;
    onToggleCameraOnOff: () => void;
    cameraOn: boolean;
    viewerCount: number;
    localStream: MediaStream | null;
};

export function StreamerUI({ onEndStream, onToggleCamera, onToggleCameraOnOff, cameraOn, viewerCount, localStream }: StreamerUIProps) {
    const { streamEndTime, facingMode } = useStreamingStore();
    const { micOn, toggleMic, setMicOn } = useVoiceChatStore();
    const [timeRemaining, setTimeRemaining] = useState('5:00');
    const [showMenu, setShowMenu] = useState(false);
    const videoRef = useRef<HTMLVideoElement | null>(null);

    // Countdown timer
    useEffect(() => {
        if (!streamEndTime) return;

        const updateTimer = () => {
            const now = Date.now();
            const remaining = Math.max(0, streamEndTime - now);
            const minutes = Math.floor(remaining / 60000);
            const seconds = Math.floor((remaining % 60000) / 1000);
            setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);

            if (remaining <= 0) {
                onEndStream();
            }
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [streamEndTime, onEndStream]);

    // Stable video attachment to prevent flickering
    // We use a useEffect that only depends on localStream changing, NOT on every render
    useEffect(() => {
        const video = videoRef.current;
        if (video && localStream) {
            video.srcObject = localStream;
            console.log('[StreamerUI] Attached local stream to video element');
        }
    }, [localStream]);

    // Auto-enable Mic on mount
    useEffect(() => {
        console.log('[StreamerUI] Auto-enabling microphone for stream');
        setMicOn(true);
    }, [setMicOn]);

    const handleEndStream = async () => {
        // Close menu/reset state if needed
        setShowMenu(false);

        if (Capacitor.isNativePlatform()) {
            const { value } = await Dialog.confirm({
                title: 'End Stream',
                message: 'Are you sure you want to end your stream?',
                okButtonTitle: 'End',
                cancelButtonTitle: 'Cancel',
            });
            if (!value) return;
        } else {
            if (!window.confirm('Are you sure you want to end your stream?')) return;
        }

        onEndStream();
    };

    return (
        <div className="fixed inset-0 z-40 bg-black text-white font-sans">
            {/* Gift Animation Overlay */}
            <GiftOverlay />

            {/* Fullscreen Video Background */}
            <div className="absolute inset-0 z-0">
                {localStream ? (
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                        style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-bg-elevated">
                        <CameraOff className="w-16 h-16 text-slate-700" />
                    </div>
                )}
                {/* Gradient Overlay */}
                <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
                <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />
            </div>

            {/* UI Overlays */}
            <div
                className="absolute inset-0 z-10 flex flex-col pointer-events-none"
                style={{
                    paddingTop: 'calc(env(safe-area-inset-top) + 16px)',
                    paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)',
                    paddingLeft: '16px',
                    paddingRight: '16px'
                }}
            >
                {/* Top Bar - Status Info */}
                <div className="flex items-center justify-between pointer-events-auto">
                    {/* Left: Menu Button */}
                    <button
                        onClick={() => setShowMenu(true)}
                        className="w-10 h-10 rounded-full bg-black/20 backdrop-blur-md border border-white/10 flex items-center justify-center active:bg-black/40 transition-colors"
                    >
                        <MoreHorizontal className="w-6 h-6 text-white" />
                    </button>

                    {/* Center: Live Timer */}
                    <div className="flex items-center gap-2 bg-black/20 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                        <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                        <span className="text-white text-sm font-medium tabular-nums">{timeRemaining}</span>
                    </div>

                    {/* Right: Viewer Count */}
                    <div className="flex items-center gap-2 bg-black/20 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                        <Users className="w-4 h-4 text-white" />
                        <span className="text-white text-sm font-medium">{viewerCount}</span>
                    </div>
                </div>

                {/* Right Side Controls - Below top bar */}
                <div className="absolute right-4 top-24 flex flex-col gap-2 pointer-events-auto" style={{ top: 'calc(env(safe-area-inset-top) + 60px)' }}>
                    {/* Camera On/Off */}
                    <button
                        onClick={onToggleCameraOnOff}
                        className={`w-10 h-10 rounded-full backdrop-blur-md border border-white/10 flex items-center justify-center active:scale-95 transition-transform ${cameraOn ? 'bg-black/20' : 'bg-red-500/80'}`}
                    >
                        {cameraOn ? <Camera className="w-5 h-5 text-white" /> : <CameraOff className="w-5 h-5 text-white" />}
                    </button>
                    {/* Flip Camera (only when camera is on) */}
                    {cameraOn && (
                        <button
                            onClick={onToggleCamera}
                            className="w-10 h-10 rounded-full bg-black/20 backdrop-blur-md border border-white/10 flex items-center justify-center active:scale-95 transition-transform"
                        >
                            <RefreshCw className={`w-5 h-5 text-white transition-transform ${facingMode === 'environment' ? 'rotate-180' : ''}`} />
                        </button>
                    )}
                    <button
                        onClick={toggleMic}
                        className={`w-10 h-10 rounded-full backdrop-blur-md border border-white/10 flex items-center justify-center active:scale-95 transition-transform ${micOn ? 'bg-black/20' : 'bg-red-500/80'}`}
                    >
                        {micOn ? <Mic className="w-5 h-5 text-white" /> : <MicOff className="w-5 h-5 text-white" />}
                    </button>
                </div>

                {/* Middle - Gift Feed (above visible comments) */}
                <div className="flex-1 flex flex-col justify-end pb-48 px-4">
                    <GiftFeed />
                </div>

                {/* Bottom - Comment Input (taps to open ChatOverlay) */}
                <div className="px-4 pointer-events-auto">
                    <ChatOverlay showInputField={true} />
                </div>
            </div>

            {/* Menu Sheet */}
            {showMenu && (
                <div className="absolute inset-0 z-50 pointer-events-auto flex flex-col justify-end">
                    <div
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
                        onClick={() => setShowMenu(false)}
                    />
                    <div className="relative z-10 p-4 space-y-2 animate-slide-up" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
                        <div className="bg-bg-surface/90 backdrop-blur-xl rounded-xl overflow-hidden border border-white/10">
                            <button
                                onClick={handleEndStream}
                                className="w-full py-4 text-red-500 font-medium text-lg active:bg-white/5 transition-colors"
                            >
                                End Stream
                            </button>
                        </div>
                        <button
                            onClick={() => setShowMenu(false)}
                            className="w-full py-4 bg-white text-black font-bold text-lg rounded-xl active:scale-95 transition-transform shadow-lg"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
