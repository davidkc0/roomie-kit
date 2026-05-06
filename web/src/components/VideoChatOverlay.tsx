import { useEffect, useRef, useState, useCallback } from 'react';
import { useVideoCallStore } from '../state/videoCallStore';
import { useAuthStore } from '../state/authStore';
import { Mic, MicOff, PhoneOff, Video, VideoOff } from 'lucide-react';
import { sendSignal } from '../lib/signaling';
import { mediaChannels } from '../media/channels';
import { defaultMediaProvider } from '../media/agoraMediaProvider';
import type { MediaRemoteUser, MediaSession } from '../media/types';

export function VideoChatOverlay() {
    const { status, roomId, remoteUser, endCall, isCaller } = useVideoCallStore();
    const { user } = useAuthStore();

    const [remoteUsers, setRemoteUsers] = useState<MediaRemoteUser[]>([]);
    const [remoteVideoEnabled, setRemoteVideoEnabled] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoEnabled, setIsVideoEnabled] = useState(true);
    const [connectionState, setConnectionState] = useState<'idle' | 'joining' | 'joined' | 'error'>('idle');

    const sessionRef = useRef<MediaSession | null>(null);
    const localVideoRef = useRef<HTMLDivElement>(null);
    const initializingRef = useRef(false);

    // Determine if we should show the overlay
    const shouldShow = status === 'connected' || (status === 'calling' && isCaller);

    // Cleanup function - stable reference
    const cleanup = useCallback(async () => {
        console.log('[VideoChatOverlay] Cleanup starting...');

        const session = sessionRef.current;
        if (session) {
            try {
                await session.leave();
                console.log('[VideoChatOverlay] Left channel');
            } catch (err) {
                console.warn('[VideoChatOverlay] Error leaving channel:', err);
            }
            sessionRef.current = null;
        }

        setRemoteUsers([]);
        setConnectionState('idle');
        initializingRef.current = false;
    }, []);

    // Initialize Agora
    useEffect(() => {
        // Guard: Only init when we should show and have required data
        if (!shouldShow || !roomId || !user?.id) {
            console.log('[VideoChatOverlay] Not initializing. shouldShow:', shouldShow, 'roomId:', roomId);
            return;
        }

        // Prevent double initialization
        if (initializingRef.current || sessionRef.current) {
            console.log('[VideoChatOverlay] Already initializing or initialized');
            return;
        }

        initializingRef.current = true;
        setConnectionState('joining');

        const initAgora = async () => {
            console.log('[VideoChatOverlay] Initializing Agora. Room:', roomId, 'User:', user.id);

            try {
                const channelName = mediaChannels.directCall(roomId);
                const session = await defaultMediaProvider.join({
                    channelName,
                    uid: user.id,
                    role: 'publisher',
                });
                sessionRef.current = session;

                session.onRemotePublished(async (remoteUser, mediaType) => {
                    console.log('[VideoChatOverlay] Remote user published:', remoteUser.uid, mediaType);
                    await session.subscribeRemote(remoteUser, mediaType);

                    if (mediaType === 'video') {
                        setRemoteVideoEnabled(true);
                        setRemoteUsers(prev => {
                            if (prev.find(u => u.uid === remoteUser.uid)) return prev;
                            return [...prev, remoteUser];
                        });
                    }
                    if (mediaType === 'audio') {
                        session.playRemoteAudio(remoteUser);
                    }
                });

                session.onRemoteUnpublished((remoteUser, mediaType) => {
                    console.log('[VideoChatOverlay] Remote user unpublished:', remoteUser.uid, mediaType);
                    if (mediaType === 'video') {
                        setRemoteVideoEnabled(false);
                        // Don't remove user - just mark video as disabled
                    }
                });

                session.onRemoteLeft((remoteUser) => {
                    console.log('[VideoChatOverlay] Remote user left:', remoteUser.uid);
                    setRemoteUsers(prev => prev.filter(u => u.uid !== remoteUser.uid));
                    // Don't auto-end call here - let the signaling handle it
                });

                session.onConnectionStateChange((curState, prevState) => {
                    console.log('[VideoChatOverlay] Connection state:', prevState, '->', curState);
                });

                session.getRemoteUsers().forEach(async (remoteUser) => {
                    if (remoteUser.hasVideo) {
                        await session.subscribeRemote(remoteUser, 'video');
                        setRemoteVideoEnabled(true);
                        setRemoteUsers(prev => prev.find(u => u.uid === remoteUser.uid) ? prev : [...prev, remoteUser]);
                    }
                    if (remoteUser.hasAudio) {
                        await session.subscribeRemote(remoteUser, 'audio');
                        session.playRemoteAudio(remoteUser);
                    }
                });

                await session.publishAudio(true);
                await session.publishCamera(true);
                console.log('[VideoChatOverlay] Published local tracks');

                // Play local video
                if (localVideoRef.current) {
                    session.playLocalVideo(localVideoRef.current);
                }

                setConnectionState('joined');

            } catch (err) {
                console.error('[VideoChatOverlay] Failed to initialize:', err);
                setConnectionState('error');
                initializingRef.current = false;
                // Don't call endCall here - let user see error state
            }
        };

        initAgora();

        // Cleanup on unmount or dependency change
        return () => {
            cleanup();
        };
    }, [shouldShow, roomId, user?.id, cleanup]);

    // Play remote video when remote users change
    useEffect(() => {
        remoteUsers.forEach(remoteUser => {
            const containerId = `remote-video-${remoteUser.uid}`;
            const container = document.getElementById(containerId);
            if (container) {
                sessionRef.current?.playRemoteVideo(remoteUser, container);
            }
        });
    }, [remoteUsers]);

    // Handle end call with signaling
    const handleEndCall = useCallback(async () => {
        console.log('[VideoChatOverlay] Ending call');

        // Send end signal to remote user
        if (user?.id && remoteUser?.id && roomId) {
            try {
                await sendSignal({
                    type: 'end',
                    roomId,
                    toId: remoteUser.id,
                    fromId: user.id
                });
            } catch (err) {
                console.warn('[VideoChatOverlay] Failed to send end signal:', err);
            }
        }

        await cleanup();
        endCall();
    }, [user?.id, remoteUser?.id, roomId, cleanup, endCall]);

    // Toggle mute
    const toggleMute = async () => {
        const nextMuted = !isMuted;
        await sessionRef.current?.setAudioEnabled(!nextMuted);
        setIsMuted(nextMuted);
    };

    // Toggle video
    const toggleVideo = async () => {
        const nextVideoEnabled = !isVideoEnabled;
        await sessionRef.current?.setVideoEnabled(nextVideoEnabled);
        setIsVideoEnabled(nextVideoEnabled);
    };

    // Don't render if we shouldn't show
    if (!shouldShow) {
        return null;
    }

    const remoteUserTrack = remoteUsers[0];

    return (
        <div className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center overflow-hidden animate-in fade-in duration-300">

            {/* Remote Video (Main) */}
            <div className="absolute inset-0 w-full h-full">
                {remoteUserTrack && remoteVideoEnabled ? (
                    <div id={`remote-video-${remoteUserTrack.uid}`} className="w-full h-full object-cover" />
                ) : remoteUserTrack && !remoteVideoEnabled ? (
                    // Remote user in call but camera off
                    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-400">
                        <div className="w-32 h-32 rounded-full overflow-hidden mb-4 border-4 border-slate-700 bg-slate-800">
                            {remoteUser?.avatarUrl ? (
                                <img src={remoteUser.avatarUrl} className="w-full h-full object-cover" alt="" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-4xl">👤</div>
                            )}
                        </div>
                        <div className="flex items-center gap-2 text-white/60">
                            <VideoOff size={20} />
                            <span className="text-lg">Camera Off</span>
                        </div>
                        <h2 className="text-2xl font-bold text-white mt-2">{remoteUser?.username || 'User'}</h2>
                    </div>
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-400">
                        <div className="w-32 h-32 rounded-full overflow-hidden mb-4 border-4 border-slate-700 bg-slate-800">
                            {remoteUser?.avatarUrl ? (
                                <img src={remoteUser.avatarUrl} className="w-full h-full object-cover" alt="" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-4xl">👤</div>
                            )}
                        </div>
                        <span className="text-xl font-medium animate-pulse">
                            {connectionState === 'joining' ? 'Connecting...' :
                                connectionState === 'error' ? 'Connection Failed' :
                                    status === 'calling' ? 'Calling...' : 'Waiting for participant...'}
                        </span>
                        <h2 className="text-2xl font-bold text-white mt-2">{remoteUser?.username || 'User'}</h2>
                    </div>
                )}
            </div>

            {/* Local Video (PiP) */}
            <div className="absolute top-12 right-4 w-32 h-48 bg-slate-800 rounded-2xl overflow-hidden shadow-2xl border border-white/10 transition-all hover:scale-105">
                <div ref={localVideoRef} className="w-full h-full object-cover transform scale-x-[-1]" />
                {!isVideoEnabled && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-800 text-white/50">
                        <VideoOff size={24} />
                    </div>
                )}
            </div>

            {/* Controls Bar */}
            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-6 px-8 py-4 bg-black/40 backdrop-blur-xl rounded-full border border-white/10 shadow-2xl">
                {/* Mute Toggle */}
                <button
                    onClick={toggleMute}
                    className={`p-4 rounded-full transition-all duration-200 ${isMuted ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20'}`}
                >
                    {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
                </button>

                {/* Video Toggle */}
                <button
                    onClick={toggleVideo}
                    className={`p-4 rounded-full transition-all duration-200 ${!isVideoEnabled ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20'}`}
                >
                    {!isVideoEnabled ? <VideoOff size={24} /> : <Video size={24} />}
                </button>

                {/* End Call */}
                <button
                    onClick={handleEndCall}
                    className="p-4 bg-red-500 hover:bg-red-600 text-white rounded-full transition-all duration-200 scale-110 shadow-lg shadow-red-500/30"
                >
                    <PhoneOff size={28} fill="currentColor" />
                </button>
            </div>
        </div>
    );
}
