import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuthStore } from '../../state/authStore';
import { useStreamingStore } from '../../state/streamingStore';
import { Mic, MicOff, Video, VideoOff, LogOut, PhoneOff } from 'lucide-react';
import { Dialog } from '@capacitor/dialog';
import { ChatOverlay } from '../Chat/ChatOverlay';
import type { WorldState } from '../../multiplayer/playroom';
import { getMyId } from '../../multiplayer/playroom';
import { mediaChannels } from '../../media/channels';
import { defaultMediaProvider } from '../../media/agoraMediaProvider';
import type { MediaRemoteUser, MediaSession } from '../../media/types';

type Props = {
    roomSlug: string;
    isOwner: boolean;
    onExitStream: () => void;
    onLeaveRoom: () => void;  // Navigates user out of the room entirely
    world: WorldState;  // For looking up remote user profiles
};

/**
 * PersonalRoomStreamOverlay - Grid-based video chat for personal rooms.
 * Shows all participants in a video grid (up to 5 participants).
 * Owner can end stream mode, returning everyone to 3D mode.
 */
export function PersonalRoomStreamOverlay({ roomSlug, isOwner, onExitStream, onLeaveRoom, world }: Props) {
    const { user, profile } = useAuthStore();
    const { setPersonalRoomMode, personalRoomOwnerId } = useStreamingStore();

    const [remoteUsers, setRemoteUsers] = useState<MediaRemoteUser[]>([]);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoEnabled, setIsVideoEnabled] = useState(true);
    const [connectionState, setConnectionState] = useState<'idle' | 'joining' | 'joined' | 'error'>('idle');

    const sessionRef = useRef<MediaSession | null>(null);
    const localVideoRef = useRef<HTMLDivElement>(null);
    const initializingRef = useRef(false);

    // Cleanup function
    const cleanup = useCallback(async () => {
        console.log('[PersonalRoomStreamOverlay] Cleanup starting...');

        const session = sessionRef.current;
        if (session) {
            try {
                await session.leave();
                console.log('[PersonalRoomStreamOverlay] Left channel');
            } catch (err) {
                console.warn('[PersonalRoomStreamOverlay] Error leaving channel:', err);
            }
            sessionRef.current = null;
        }

        setRemoteUsers([]);
        setConnectionState('idle');
        initializingRef.current = false;
    }, []);

    // Initialize Agora when component mounts
    useEffect(() => {
        if (!roomSlug || !user?.id) {
            console.log('[PersonalRoomStreamOverlay] Missing required data:', { roomSlug, userId: user?.id });
            return;
        }

        if (initializingRef.current || sessionRef.current) {
            return;
        }

        initializingRef.current = true;
        setConnectionState('joining');

        const initAgora = async () => {
            console.log('[PersonalRoomStreamOverlay] Initializing Agora for room:', roomSlug);

            try {
                const myPlayerId = getMyId() || undefined;
                const channelName = mediaChannels.personalRoom(roomSlug);
                const session = await defaultMediaProvider.join({
                    channelName,
                    uid: myPlayerId,
                    role: 'publisher',
                    lowStreamParameter: {
                        width: 160,
                        height: 120,
                        framerate: 15,
                        bitrate: 200,
                    },
                });
                sessionRef.current = session;

                session.onRemotePublished(async (remoteUser, mediaType) => {
                    console.log('[PersonalRoomStreamOverlay] Remote user published:', remoteUser.uid, mediaType);
                    await session.subscribeRemote(remoteUser, mediaType);

                    if (mediaType === 'video') {
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
                    console.log('[PersonalRoomStreamOverlay] Remote user unpublished:', remoteUser.uid, mediaType);
                    if (mediaType === 'video') {
                        // Update remote user state to show video disabled
                        setRemoteUsers(prev => [...prev]); // Trigger re-render
                    }
                });

                session.onRemoteLeft((remoteUser) => {
                    console.log('[PersonalRoomStreamOverlay] Remote user left:', remoteUser.uid);
                    setRemoteUsers(prev => prev.filter(u => u.uid !== remoteUser.uid));
                });

                session.getRemoteUsers().forEach(async (remoteUser) => {
                    if (remoteUser.hasVideo) {
                        await session.subscribeRemote(remoteUser, 'video');
                        setRemoteUsers(prev => prev.find(u => u.uid === remoteUser.uid) ? prev : [...prev, remoteUser]);
                    }
                    if (remoteUser.hasAudio) {
                        await session.subscribeRemote(remoteUser, 'audio');
                        session.playRemoteAudio(remoteUser);
                    }
                });

                await session.publishAudio(true);
                await session.publishCamera(true);
                console.log('[PersonalRoomStreamOverlay] Published local tracks');

                // Play local video
                if (localVideoRef.current) {
                    session.playLocalVideo(localVideoRef.current);
                }

                setConnectionState('joined');

            } catch (err) {
                console.error('[PersonalRoomStreamOverlay] Failed to initialize:', err);
                setConnectionState('error');
                initializingRef.current = false;
            }
        };

        initAgora();

        return () => {
            cleanup();
        };
    }, [roomSlug, user?.id, cleanup]);

    // Play remote videos when remote users change
    useEffect(() => {
        remoteUsers.forEach(remoteUser => {
            const containerId = `remote-video-${remoteUser.uid}`;
            const container = document.getElementById(containerId);
            if (container) {
                sessionRef.current?.playRemoteVideo(remoteUser, container);
            }
        });
    }, [remoteUsers]);

    // Owner only - ends call for everyone
    const handleEndCallForAll = useCallback(async () => {
        const { value } = await Dialog.confirm({
            title: 'End Call?',
            message: 'This will end the video call for everyone in the room.',
            okButtonTitle: 'End Call',
            cancelButtonTitle: 'Cancel',
        });

        if (!value) return;

        await cleanup();
        if (personalRoomOwnerId) {
            setPersonalRoomMode('3d', personalRoomOwnerId);
        }
        onExitStream();
    }, [cleanup, personalRoomOwnerId, setPersonalRoomMode, onExitStream]);

    // Guest only - leaves the room entirely (uses existing leave function)
    const handleLeaveCall = useCallback(async () => {
        await cleanup();
        onExitStream();
        onLeaveRoom();
    }, [cleanup, onExitStream, onLeaveRoom]);

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

    // Calculate grid layout based on participant count
    const totalParticipants = 1 + remoteUsers.length; // 1 = local user
    const gridCols = totalParticipants <= 2 ? 1 : totalParticipants <= 4 ? 2 : 3;
    const gridRows = Math.ceil(totalParticipants / gridCols);

    return (
        <div className="fixed inset-0 z-[200] bg-black flex flex-col overflow-hidden animate-in fade-in duration-300">
            {/* Video Grid */}
            <div
                className="flex-1 grid gap-2 p-2"
                style={{
                    gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
                    gridTemplateRows: `repeat(${gridRows}, 1fr)`,
                }}
            >
                {/* Local Video */}
                <div className="relative bg-slate-900 rounded-[40px] overflow-hidden">
                    <div
                        ref={localVideoRef}
                        className="w-full h-full object-cover transform scale-x-[-1]"
                    />
                    {!isVideoEnabled && (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-800 text-white/50">
                            <VideoOff size={48} />
                        </div>
                    )}
                    <div className="absolute bottom-6 left-6 bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-sm text-white">
                        {profile?.username || 'You'} {isOwner && '(Host)'}
                    </div>
                </div>

                {/* Remote Videos */}
                {remoteUsers.map(remoteUser => (
                    <div
                        key={remoteUser.uid}
                        className="relative bg-slate-900 rounded-[40px] overflow-hidden"
                    >
                        <div
                            id={`remote-video-${remoteUser.uid}`}
                            className="w-full h-full object-cover"
                        />
                        {!remoteUser.hasVideo && (
                            <div className="absolute inset-0 flex items-center justify-center bg-slate-800 text-white/50">
                                <VideoOff size={48} />
                            </div>
                        )}
                        <div className="absolute bottom-6 left-6 bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-sm text-white">
                            {world.players[String(remoteUser.uid)]?.profile?.name ||
                                world.players[String(remoteUser.uid)]?.profile?.username ||
                                'Guest'}
                        </div>
                    </div>
                ))}

                {/* Empty slots placeholder when connecting */}
                {connectionState === 'joining' && (
                    <div className="flex items-center justify-center bg-slate-800/50 rounded-[40px] text-white/40">
                        <span className="animate-pulse">Connecting...</span>
                    </div>
                )}
            </div>

            {/* Controls Bar */}
            <div className="absolute bottom-24 left-1/2 -translate-x-1/2 flex items-center gap-4 px-6 py-3 bg-black/60 backdrop-blur-xl rounded-full border border-white/10 shadow-2xl">
                {/* Mute Toggle */}
                <button
                    onClick={toggleMute}
                    className={`p-3 rounded-full transition-all duration-200 ${isMuted ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20'}`}
                >
                    {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
                </button>

                {/* Video Toggle */}
                <button
                    onClick={toggleVideo}
                    className={`p-3 rounded-full transition-all duration-200 ${!isVideoEnabled ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20'}`}
                >
                    {!isVideoEnabled ? <VideoOff size={22} /> : <Video size={22} />}
                </button>

                {/* Exit Stream: Owner = End Call for all, Guest = Leave only */}
                {isOwner ? (
                    <button
                        onClick={handleEndCallForAll}
                        className="p-3 bg-red-500 hover:bg-red-600 text-white rounded-full transition-all duration-200 shadow-lg shadow-red-500/30"
                    >
                        <PhoneOff size={22} />
                    </button>
                ) : (
                    <button
                        onClick={handleLeaveCall}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-full transition-all duration-200 font-medium"
                    >
                        <LogOut size={18} />
                        Leave
                    </button>
                )}
            </div>

            {/* Chat Overlay */}
            <ChatOverlay />
        </div>
    );
}
