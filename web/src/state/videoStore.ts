import { create } from 'zustand';

type VideoStore = {
  remoteVideos: Record<string, HTMLVideoElement>;
  setRemoteVideo: (playerId: string, video: HTMLVideoElement | null) => void;
  getRemoteVideo: (playerId: string) => HTMLVideoElement | undefined;
};

export const useVideoStore = create<VideoStore>((set, get) => ({
  remoteVideos: {},
  setRemoteVideo: (playerId, video) =>
    set((state) => {
      // Create a new object reference to force updates
      const next = { ...state.remoteVideos };
      if (video) {
        next[playerId] = video;
        console.log(`[VideoStore] Added video for ${playerId}`, video.srcObject);
      } else {
        delete next[playerId];
        console.log(`[VideoStore] Removed video for ${playerId}`);
      }
      return { remoteVideos: next };
    }),
  getRemoteVideo: (playerId) => get().remoteVideos[playerId],
}));
