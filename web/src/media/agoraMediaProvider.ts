import { appConfig } from '../config/app';
import { getAgoraRtcToken } from './agoraToken';
import type { MediaConnectionState, MediaKind, MediaProvider, MediaRemoteUser, MediaSession, MediaVideoEncoding, RoomieMediaConfig } from './types';

type AgoraRemoteUser = {
    uid: string | number;
    hasAudio?: boolean;
    hasVideo?: boolean;
    audioTrack?: { play: () => void; stop?: () => void };
    videoTrack?: { play: (container: HTMLElement | string) => void; stop?: () => void };
};

function toRemoteUser(user: AgoraRemoteUser): MediaRemoteUser {
    return {
        uid: user.uid,
        hasAudio: user.hasAudio,
        hasVideo: user.hasVideo,
        raw: user,
    };
}

function rawRemoteUser(user: MediaRemoteUser): AgoraRemoteUser {
    return user.raw as AgoraRemoteUser;
}

export class AgoraMediaProvider implements MediaProvider {
    async join(config: RoomieMediaConfig): Promise<MediaSession> {
        if (!appConfig.agoraAppId) {
            throw new Error('Missing VITE_AGORA_APP_ID');
        }

        const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
        const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        if (config.lowStreamParameter) {
            client.setLowStreamParameter(config.lowStreamParameter);
        }
        const uid = config.uid || undefined;
        const getToken = () => getAgoraRtcToken(config.channelName, uid, config.role || 'publisher');
        const token = await getToken();
        const joinedUid = await client.join(config.appId || appConfig.agoraAppId, config.channelName, token, uid);
        let audioTrack: any = null;
        let videoTrack: any = null;
        let didLeave = false;

        const remoteJoinedCallbacks = new Set<(user: MediaRemoteUser) => void>();
        const remotePublishedCallbacks = new Set<(user: MediaRemoteUser, kind: MediaKind) => void | Promise<void>>();
        const remoteUnpublishedCallbacks = new Set<(user: MediaRemoteUser, kind: MediaKind) => void>();
        const remoteLeftCallbacks = new Set<(user: MediaRemoteUser) => void>();
        const connectionCallbacks = new Set<(current: MediaConnectionState, previous: MediaConnectionState) => void>();

        const renewToken = async () => {
            const nextToken = await getToken();
            if (!nextToken) return;
            await client.renewToken(nextToken);
        };

        const handleTokenExpiry = () => {
            renewToken().catch((error) => {
                console.warn('[AgoraMediaProvider] Failed to renew Agora token:', error);
            });
        };

        client.on('token-privilege-will-expire', handleTokenExpiry);
        client.on('token-privilege-did-expire', handleTokenExpiry);
        client.on('user-joined', (user: AgoraRemoteUser) => {
            const remoteUser = toRemoteUser(user);
            remoteJoinedCallbacks.forEach(callback => callback(remoteUser));
        });
        client.on('user-published', (user: AgoraRemoteUser, mediaType: MediaKind) => {
            const remoteUser = toRemoteUser(user);
            remotePublishedCallbacks.forEach(callback => {
                void callback(remoteUser, mediaType);
            });
        });
        client.on('user-unpublished', (user: AgoraRemoteUser, mediaType: MediaKind) => {
            const remoteUser = toRemoteUser(user);
            if (mediaType === 'video') user.videoTrack?.stop?.();
            if (mediaType === 'audio') user.audioTrack?.stop?.();
            remoteUnpublishedCallbacks.forEach(callback => callback(remoteUser, mediaType));
        });
        client.on('user-left', (user: AgoraRemoteUser) => {
            user.videoTrack?.stop?.();
            user.audioTrack?.stop?.();
            const remoteUser = toRemoteUser(user);
            remoteLeftCallbacks.forEach(callback => callback(remoteUser));
        });
        client.on('connection-state-change', (current: MediaConnectionState, previous: MediaConnectionState) => {
            connectionCallbacks.forEach(callback => callback(current, previous));
        });

        const removeCallbacks = () => {
            remoteJoinedCallbacks.clear();
            remotePublishedCallbacks.clear();
            remoteUnpublishedCallbacks.clear();
            remoteLeftCallbacks.clear();
            connectionCallbacks.clear();
        };

        const closeVideoTrack = async () => {
            if (!videoTrack) return;
            const trackToClose = videoTrack;
            videoTrack = null;

            try {
                await client.unpublish([trackToClose]);
            } catch (error) {
                console.warn('[AgoraMediaProvider] Failed to unpublish video track:', error);
            }
            trackToClose.stop?.();
            trackToClose.close?.();
        };

        return {
            channelName: config.channelName,
            uid: joinedUid,
            leave: async () => {
                if (didLeave) return;
                didLeave = true;
                removeCallbacks();
                audioTrack?.close();
                videoTrack?.close();
                client.remoteUsers.forEach((user: AgoraRemoteUser) => {
                    user.videoTrack?.stop?.();
                    user.audioTrack?.stop?.();
                });
                await client.leave();
            },
            getRemoteUsers: () => client.remoteUsers.map(toRemoteUser),
            publishAudio: async (enabled = true) => {
                if (!audioTrack) {
                    audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
                    await client.publish(audioTrack);
                }
                await audioTrack.setEnabled(enabled);
            },
            publishCamera: async (enabled = true) => {
                if (!videoTrack) {
                    videoTrack = await AgoraRTC.createCameraVideoTrack();
                    await client.publish(videoTrack);
                }
                await videoTrack.setEnabled(enabled);
            },
            publishVideoStream: async (stream: MediaStream, enabled = true, encoding: MediaVideoEncoding = {}) => {
                const [mediaStreamTrack] = stream.getVideoTracks();
                if (!mediaStreamTrack) {
                    throw new Error('Cannot publish video stream without a video track');
                }

                if (videoTrack) {
                    await closeVideoTrack();
                }

                videoTrack = AgoraRTC.createCustomVideoTrack({
                    mediaStreamTrack,
                    bitrateMin: encoding.bitrateMin ?? 150,
                    bitrateMax: encoding.bitrateMax ?? 400,
                    optimizationMode: encoding.optimizationMode ?? 'motion',
                });
                await client.publish([videoTrack]);
                await videoTrack.setEnabled(enabled);
                return videoTrack;
            },
            unpublishCamera: closeVideoTrack,
            setAudioEnabled: async (enabled: boolean) => {
                await audioTrack?.setEnabled(enabled);
            },
            setVideoEnabled: async (enabled: boolean) => {
                await videoTrack?.setEnabled(enabled);
            },
            switchCamera: async (deviceId?: string) => {
                if (!videoTrack?.setDevice) return;
                await videoTrack.setDevice(deviceId);
            },
            renewToken,
            subscribeRemote: async (user: MediaRemoteUser, kind: MediaKind) => {
                await client.subscribe(rawRemoteUser(user), kind);
            },
            playLocalVideo: (container: HTMLElement | string) => {
                videoTrack?.play(container);
            },
            playRemoteVideo: (user: MediaRemoteUser, container: HTMLElement | string) => {
                rawRemoteUser(user).videoTrack?.play(container);
            },
            playRemoteAudio: (user: MediaRemoteUser) => {
                rawRemoteUser(user).audioTrack?.play();
            },
            onRemoteJoined: (callback) => {
                remoteJoinedCallbacks.add(callback);
                return () => remoteJoinedCallbacks.delete(callback);
            },
            onRemotePublished: (callback) => {
                remotePublishedCallbacks.add(callback);
                return () => remotePublishedCallbacks.delete(callback);
            },
            onRemoteUnpublished: (callback) => {
                remoteUnpublishedCallbacks.add(callback);
                return () => remoteUnpublishedCallbacks.delete(callback);
            },
            onRemoteLeft: (callback) => {
                remoteLeftCallbacks.add(callback);
                return () => remoteLeftCallbacks.delete(callback);
            },
            onConnectionStateChange: (callback) => {
                connectionCallbacks.add(callback);
                return () => connectionCallbacks.delete(callback);
            },
        };
    }
}

export const defaultMediaProvider = new AgoraMediaProvider();
