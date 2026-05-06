export type MediaRole = 'publisher' | 'subscriber';
export type MediaKind = 'audio' | 'video';
export type MediaConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTING';

export type MediaTrackState = {
    userId: string | number;
    kind: MediaKind;
    enabled: boolean;
};

export type MediaRemoteUser = {
    uid: string | number;
    hasAudio?: boolean;
    hasVideo?: boolean;
    raw: unknown;
};

export type MediaVideoEncoding = {
    bitrateMin?: number;
    bitrateMax?: number;
    optimizationMode?: 'detail' | 'motion' | 'balanced';
};

export type RoomieMediaConfig = {
    appId?: string;
    channelName: string;
    uid?: string | number;
    role?: MediaRole;
    lowStreamParameter?: {
        width: number;
        height: number;
        framerate: number;
        bitrate: number;
    };
};

export type MediaSession = {
    channelName: string;
    uid: string | number;
    leave: () => Promise<void>;
    getRemoteUsers: () => MediaRemoteUser[];
    publishAudio: (enabled?: boolean) => Promise<void>;
    publishCamera: (enabled?: boolean) => Promise<void>;
    publishVideoStream: (stream: MediaStream, enabled?: boolean, encoding?: MediaVideoEncoding) => Promise<unknown>;
    unpublishCamera: () => Promise<void>;
    setAudioEnabled: (enabled: boolean) => Promise<void>;
    setVideoEnabled: (enabled: boolean) => Promise<void>;
    switchCamera?: (deviceId?: string) => Promise<void>;
    renewToken: () => Promise<void>;
    subscribeRemote: (user: MediaRemoteUser, kind: MediaKind) => Promise<void>;
    playLocalVideo: (container: HTMLElement | string) => void;
    playRemoteVideo: (user: MediaRemoteUser, container: HTMLElement | string) => void;
    playRemoteAudio: (user: MediaRemoteUser) => void;
    onRemoteJoined: (callback: (user: MediaRemoteUser) => void) => () => void;
    onRemotePublished: (callback: (user: MediaRemoteUser, kind: MediaKind) => void | Promise<void>) => () => void;
    onRemoteUnpublished: (callback: (user: MediaRemoteUser, kind: MediaKind) => void) => () => void;
    onRemoteLeft: (callback: (user: MediaRemoteUser) => void) => () => void;
    onConnectionStateChange: (callback: (current: MediaConnectionState, previous: MediaConnectionState) => void) => () => void;
};

export type MediaProvider = {
    join: (config: RoomieMediaConfig) => Promise<MediaSession>;
};
