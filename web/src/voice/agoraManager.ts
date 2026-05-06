import { appConfig } from '../config/app';
import { defaultMediaProvider } from '../media/agoraMediaProvider';
import type { MediaKind, MediaRemoteUser, MediaSession } from '../media/types';

type ChannelParams = {
  localAudioTrack?: any;
  localVideoTrack?: any;
};

export type AgoraContextType = {
  getAgoraEngine: () => {
    readonly remoteUsers: any[];
    subscribe: (user: any, kind: MediaKind) => Promise<void>;
  };
  config: { appId: string; channelName: string; token: string | null };
  join: (uid: string, channel: string, channelParameters: ChannelParams) => Promise<boolean | string>;
  leave: (channelParameters: ChannelParams) => Promise<void>;
  publishVideoTrack: (stream: MediaStream, enabled: boolean, channelParameters: ChannelParams) => Promise<void>;
  unpublishVideoTrack: (channelParameters: ChannelParams) => Promise<void>;
};

function rawRemoteUser(user: MediaRemoteUser): any {
  return user.raw;
}

function mediaRemoteUser(user: any): MediaRemoteUser {
  return {
    uid: user.uid,
    hasAudio: user.hasAudio,
    hasVideo: user.hasVideo,
    raw: user,
  };
}

function localAudioTrackAdapter(session: MediaSession) {
  let enabled = true;

  return {
    get enabled() {
      return enabled;
    },
    setEnabled: async (nextEnabled: boolean) => {
      enabled = nextEnabled;
      await session.setAudioEnabled(nextEnabled);
    },
    isMuted: () => !enabled,
    close: async () => {
      enabled = false;
      await session.setAudioEnabled(false);
    },
  };
}

const AgoraManager = async (eventsCallback: (event: string, ...args: any[]) => void): Promise<AgoraContextType> => {
  let session: MediaSession | null = null;

  const config = {
    appId: appConfig.agoraAppId,
    channelName: '',
    token: null as string | null,
  };

  const engineFacade = {
    get remoteUsers() {
      return session?.getRemoteUsers().map(rawRemoteUser) ?? [];
    },
    subscribe: async (user: any, kind: MediaKind) => {
      if (!session) return;
      await session.subscribeRemote(mediaRemoteUser(user), kind);
    },
  };

  const join = async (uid: string, channel: string, channelParameters: ChannelParams) => {
    if (!appConfig.agoraAppId) {
      console.error('[AgoraManager] Agora App ID missing');
      return false;
    }

    try {
      const testStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      testStream.getTracks().forEach(track => track.stop());
      console.log('[AgoraManager] Microphone permission granted');
    } catch (permissionError: any) {
      console.error('[AgoraManager] Microphone permission denied:', permissionError);
      if (permissionError.name === 'NotAllowedError') return 'PERMISSION_DENIED';
      if (permissionError.name === 'NotFoundError') return 'NO_DEVICE';
    }

    try {
      config.channelName = channel;
      session = await defaultMediaProvider.join({
        channelName: channel,
        uid,
        role: 'publisher',
      });

      session.onRemoteJoined((user) => {
        eventsCallback('user-joined', rawRemoteUser(user));
      });

      session.onRemotePublished(async (user, mediaType) => {
        await session?.subscribeRemote(user, mediaType);
        eventsCallback('user-published', rawRemoteUser(user), mediaType);
      });

      session.onRemoteUnpublished((user, mediaType) => {
        eventsCallback('user-unpublished', rawRemoteUser(user), mediaType);
      });

      session.onRemoteLeft((user) => {
        eventsCallback('user-left', rawRemoteUser(user));
      });

      await session.publishAudio(true);
      channelParameters.localAudioTrack = localAudioTrackAdapter(session);
      return true;
    } catch (error: any) {
      console.error('[AgoraManager] Failed to join media session:', error);
      if (error.name === 'NotAllowedError') return 'PERMISSION_DENIED';
      if (error.name === 'NotFoundError') return 'NO_DEVICE';
      return error.code || 'ERROR';
    }
  };

  const publishVideoTrack = async (stream: MediaStream, enabled: boolean, channelParameters: ChannelParams) => {
    if (!session) {
      throw new Error('Cannot publish video before joining media session');
    }

    channelParameters.localVideoTrack = await session.publishVideoStream(stream, enabled, {
      bitrateMin: 150,
      bitrateMax: 400,
      optimizationMode: 'motion',
    });
  };

  const unpublishVideoTrack = async (channelParameters: ChannelParams) => {
    await session?.unpublishCamera();
    delete channelParameters.localVideoTrack;
  };

  const leave = async (channelParameters: ChannelParams) => {
    await session?.leave();
    session = null;
    delete channelParameters.localAudioTrack;
    delete channelParameters.localVideoTrack;
  };

  return {
    getAgoraEngine: () => engineFacade,
    config,
    join,
    leave,
    publishVideoTrack,
    unpublishVideoTrack,
  };
};

export default AgoraManager;
