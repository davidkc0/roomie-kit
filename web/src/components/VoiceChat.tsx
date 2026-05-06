import { useEffect, useRef, useState } from 'react';
import AgoraManager from '../voice/agoraManager';
import micIconOn from '../assets/micIconOn.svg';
import micIconOff from '../assets/micIconOff.svg';
import speakerIconOn from '../assets/speakerIconOn.svg';
import speakerIconOff from '../assets/speakerIconOff.svg';
import { writeMyState } from '../multiplayer/playroom';
import { useVideoStore } from '../state/videoStore';
import { useVoiceChatStore } from '../state/voiceChatStore';
import { useMutedPlayersStore } from '../state/mutedPlayersStore';
import { appConfig } from '../config/app';
import { mediaChannels } from '../media/channels';
import '../utils/helpers'; // Import to ensure hashCode is available

interface VoiceChatProps {
  uid: string;
  roomCode: string;
  cameraStream?: MediaStream | null;
  cameraEnabled: boolean;
}

// Using 'any' for Agora types since SDK is dynamically loaded
type ChannelParams = {
  localAudioTrack?: any;
  localVideoTrack?: any;
};

export const VoiceChat = ({
  uid,
  roomCode,
  cameraStream,
  cameraEnabled,
}: VoiceChatProps) => {
  const channelParameters = useRef<ChannelParams>({}).current;
  const hasJoinedRef = useRef(false);
  const joinPromiseRef = useRef<Promise<boolean | string> | null>(null);
  const joinTimeRef = useRef<number | null>(null);
  const remoteVideoElements = useRef<Map<string, HTMLVideoElement>>(new Map());
  const [remoteTrack, setRemoteTrack] = useState<any>(null);
  const agoraClient = useRef<any>(null);
  const [engineReadyToken, setEngineReadyToken] = useState(0);
  const [videoRetryToken, setVideoRetryToken] = useState(0);
  const setRemoteVideo = useVideoStore((state) => state.setRemoteVideo);
  const processedUsersRef = useRef<Set<string>>(new Set()); // Track users we've processed
  const videoOperationLock = useRef<Promise<any>>(Promise.resolve()); // Serialize video ops
  const remoteAudioTracks = useRef<Map<string, any>>(new Map()); // Track remote audio by player ID

  // Use the shared voice chat store
  const { micOn, speakerOn: spkOn, micAllowed, setMicOn, setSpeakerOn: setSpkOn, setMicAllowed, setJoined } = useVoiceChatStore();

  const attachRemoteVideo = (user: any) => {
    console.log('[VoiceChat] 🎬 attachRemoteVideo called for user:', user.uid);

    const track = user.videoTrack;
    if (!track) {
      console.error('[VoiceChat] ❌ No video track for user:', user.uid);
      return;
    }

    console.log('[VoiceChat] ✅ Video track found:', {
      uid: user.uid,
      trackId: track.getTrackId?.(),
      enabled: track.enabled,
    });

    const mediaTrack = track.getMediaStreamTrack();
    if (!mediaTrack) {
      console.error('[VoiceChat] ❌ No media stream track for user:', user.uid);
      return;
    }

    console.log('[VoiceChat] ✅ Media stream track found:', {
      id: mediaTrack.id,
      kind: mediaTrack.kind,
      readyState: mediaTrack.readyState,
    });

    // CRITICAL FOR iOS: Create video element with proper attributes BEFORE setting srcObject
    const video = document.createElement('video');

    // iOS WebView requires these to be set via setAttribute, not just properties
    video.setAttribute('autoplay', '');
    video.setAttribute('muted', 'true');
    video.setAttribute('playsinline', ''); // lowercase for iOS
    video.setAttribute('webkit-playsinline', ''); // iOS WebKit compatibility

    // Set properties as well
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;

    // Style for hidden playback - CRITICAL: Keep in viewport to prevent browser throttling
    // Moving off-screen (left: -9999px) causes browsers to throttle RAF/video decoding
    // We keep it at 0,0 but make it invisible and non-interactive
    video.style.position = 'fixed';
    video.style.top = '0px';
    video.style.left = '0px';
    video.style.width = '1px';
    video.style.height = '1px';
    video.style.opacity = '0.01';
    video.style.pointerEvents = 'none';
    video.style.zIndex = '-100';

    // Add to DOM FIRST (iOS requirement)
    document.body.appendChild(video);

    // THEN set srcObject (iOS WebView needs element in DOM first)
    const stream = new MediaStream([mediaTrack]);
    video.srcObject = stream;

    // CRITICAL: Monitor the MediaStream track for ended events
    // If the track ends, the video will stop - this is the root cause
    const handleStreamTrackEnded = () => {
      console.error('[VoiceChat] ❌ MediaStream track ended for user:', user.uid, '- this is why video stops');
      console.error('[VoiceChat] Track details:', {
        id: mediaTrack.id,
        kind: mediaTrack.kind,
        enabled: mediaTrack.enabled,
        muted: mediaTrack.muted,
        readyState: mediaTrack.readyState,
      });
      // The track ended - we can't restart it, but we should clean up
      detachRemoteVideo(uidKey);
    };

    // Monitor track state
    if (mediaTrack.readyState === 'ended') {
      console.error('[VoiceChat] ❌ Track already ended when attaching');
      return;
    }

    mediaTrack.addEventListener('ended', handleStreamTrackEnded, { once: true });

    // iOS needs explicit play() call, wait a moment for stream to be ready
    const playVideo = async () => {
      try {
        // Wait for video to have enough data
        if (video.readyState < 2) {
          await new Promise((resolve) => {
            video.addEventListener('loadeddata', resolve, { once: true });
            // Timeout after 2 seconds
            setTimeout(resolve, 2000);
          });
        }

        await video.play();
        console.log('[VoiceChat] ✅ Video playing:', {
          uid: user.uid,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          readyState: video.readyState,
          trackState: mediaTrack.readyState,
          trackEnabled: mediaTrack.enabled,
        });
      } catch (err) {
        console.error('[VoiceChat] ❌ Failed to play video:', err);
        // Retry once after a delay (iOS sometimes needs this)
        setTimeout(async () => {
          try {
            await video.play();
            console.log('[VoiceChat] ✅ Video playing on retry');
          } catch (retryErr) {
            console.error('[VoiceChat] ❌ Failed to play video on retry:', retryErr);
          }
        }, 500);
      }
    };

    playVideo();

    // Store by the string UID directly (as received from Agora)
    const uidKey = String(user.uid);
    console.log('[VoiceChat] 💾 Storing video with key:', uidKey, 'for user:', user.uid);

    remoteVideoElements.current.set(uidKey, video);
    setRemoteVideo(uidKey, video);

    // CRITICAL: Also store by playerId if we can determine it
    // The agoraVideoUid in player state should match the Agora UID
    // Try to find the playerId that matches this UID
    const allVideos = useVideoStore.getState().remoteVideos;
    console.log('[VoiceChat] 📊 All videos in store before:', Object.keys(allVideos));

    // Also log the entire videoStore state after a delay
    setTimeout(() => {
      const allVideosAfter = useVideoStore.getState().remoteVideos;
      console.log('[VoiceChat] 📊 All videos in store after:', Object.keys(allVideosAfter));
      console.log('[VoiceChat] 📊 Video element details:', {
        uid: uidKey,
        hasVideo: !!allVideosAfter[uidKey],
        videoWidth: allVideosAfter[uidKey]?.videoWidth,
        videoHeight: allVideosAfter[uidKey]?.videoHeight,
        readyState: allVideosAfter[uidKey]?.readyState,
      });
    }, 100);
  };

  const detachRemoteVideo = (playerId: string) => {
    const el = remoteVideoElements.current.get(playerId);
    if (el) {
      el.pause();
      el.srcObject = null;
      if (el.parentElement) {
        el.parentElement.removeChild(el);
      }
      remoteVideoElements.current.delete(playerId);
    }
    setRemoteVideo(playerId, null);
  };

  // Helper function to check and subscribe to remote user's video
  // Returns true if successfully subscribed/attached, false if needs retry
  const checkAndSubscribeRemoteUser = async (remoteUser: any, engine: any): Promise<boolean> => {
    const remoteUid = String(remoteUser.uid);

    // Skip our own user
    if (remoteUid === String(uid)) {
      return true; // Consider self as "processed"
    }

    // If we already have the video attached, skip
    if (remoteVideoElements.current.has(remoteUid)) {
      return true;
    }

    console.log('[VoiceChat] 📋 Processing remote user:', remoteUid, {
      hasVideo: !!remoteUser.hasVideo,
      hasAudio: !!remoteUser.hasAudio,
      videoTrack: !!remoteUser.videoTrack,
      audioTrack: !!remoteUser.audioTrack,
    });

    // If video track already exists, attach it immediately
    if (remoteUser.videoTrack) {
      console.log('[VoiceChat] ✅ Video track already available for:', remoteUid);
      attachRemoteVideo(remoteUser);
      processedUsersRef.current.add(remoteUid);
      return true;
    }

    // If user has video but track not ready, try to subscribe
    if (remoteUser.hasVideo) {
      console.log('[VoiceChat] 📹 User has video, attempting to subscribe:', remoteUid);
      try {
        await engine.subscribe(remoteUser, 'video');
        console.log('[VoiceChat] ✅ Subscribed to video for:', remoteUid);

        // Wait for track to be ready - iOS needs more time
        let attempts = 0;
        while (!remoteUser.videoTrack && attempts < 10) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }

        if (remoteUser.videoTrack) {
          console.log('[VoiceChat] ✅ Video track ready after subscribe:', remoteUid);
          attachRemoteVideo(remoteUser);
          processedUsersRef.current.add(remoteUid);
          return true;
        } else {
          console.warn('[VoiceChat] ⚠️ Video track not ready after subscribe:', remoteUid);
          // Don't mark as processed, will retry
          return false;
        }
      } catch (err: any) {
        // If "user is not published", this is expected on iOS - retry later
        if (err.code === 'INVALID_REMOTE_USER' || err.message?.includes('not published')) {
          console.log('[VoiceChat] ⏳ User not published yet, will retry:', remoteUid);
          return false; // Signal to retry
        } else {
          console.error('[VoiceChat] ❌ Failed to subscribe to video:', err);
          return false; // Retry on other errors too
        }
      }
    }

    // Subscribe to audio if available
    if (remoteUser.hasAudio && !remoteUser.audioTrack) {
      try {
        await engine.subscribe(remoteUser, 'audio');
        if (remoteUser.audioTrack) {
          const audioTrack = remoteUser.audioTrack;
          remoteAudioTracks.current.set(remoteUid, audioTrack);
          // Check if this player is muted before playing
          const isMuted = useMutedPlayersStore.getState().isPlayerMuted(remoteUid);
          if (!isMuted) {
            audioTrack.play();
            console.log('[VoiceChat] ✅ Fallback audio playing for:', remoteUid);
          } else {
            console.log('[VoiceChat] 🔇 Not playing audio for muted player:', remoteUid);
          }
          setRemoteTrack(audioTrack);
        }
      } catch (err) {
        console.error('[VoiceChat] ❌ Failed to subscribe to audio:', err);
      }
    } else if (remoteUser.audioTrack) {
      const audioTrack = remoteUser.audioTrack;
      remoteAudioTracks.current.set(remoteUid, audioTrack);
      const isMuted = useMutedPlayersStore.getState().isPlayerMuted(remoteUid);
      if (!isMuted) {
        audioTrack.play();
        console.log('[VoiceChat] ✅ Existing audio track playing for:', remoteUid);
      }
      setRemoteTrack(audioTrack);
    }

    // If user doesn't have video, mark as processed (nothing to do)
    if (!remoteUser.hasVideo) {
      processedUsersRef.current.add(remoteUid);
      return true;
    }

    return false; // Needs retry
  };

  const handleVSDKEvents = (eventName: string, ...args: any[]) => {
    console.log('[VoiceChat] 🔔 Event:', eventName, 'Args:', args);

    switch (eventName) {
      case 'user-joined':
        // When a user joins, check if they have published media
        const joinedUser = args[0];
        const joinedUid = String(joinedUser.uid);

        if (joinedUid === String(uid)) {
          return; // Skip self
        }

        console.log('[VoiceChat] 👤 User joined:', joinedUid, {
          hasVideo: joinedUser.hasVideo,
          hasAudio: joinedUser.hasAudio,
          videoTrack: !!joinedUser.videoTrack,
        });

        // On iOS, user-published might not fire for existing users
        // Check if they have video and subscribe if needed
        const engine = agoraClient.current?.getAgoraEngine();
        if (engine) {
          // Check immediately, then retry after a delay if needed
          checkAndSubscribeRemoteUser(joinedUser, engine).then((success) => {
            if (!success) {
              // Retry after delay if subscription failed
              setTimeout(() => {
                if (hasJoinedRef.current) {
                  checkAndSubscribeRemoteUser(joinedUser, engine);
                }
              }, 1000);
            }
          });
        }
        break;

      case 'user-published':
        const remoteUid = args[0].uid;

        // CRITICAL: Ignore our own user-published events!
        if (String(remoteUid) === String(uid)) {
          console.log('[VoiceChat] 🚫 Ignoring self user-published event for:', remoteUid);
          return;
        }

        console.log('[VoiceChat] 📹 Remote user published:', {
          uid: remoteUid,
          mediaType: args[1],
          hasVideoTrack: !!args[0].videoTrack,
          hasAudioTrack: !!args[0].audioTrack,
        });

        // AgoraManager already subscribed, so track should be available
        if (args[1] === 'audio') {
          const audioTrack = args[0].audioTrack;
          const audioUid = String(args[0].uid);
          if (audioTrack) {
            remoteAudioTracks.current.set(audioUid, audioTrack);
            // Check if this player is muted before playing
            const isMuted = useMutedPlayersStore.getState().isPlayerMuted(audioUid);
            if (!isMuted) {
              audioTrack.play();
            } else {
              console.log('[VoiceChat] 🔇 Not playing audio for muted player:', audioUid);
            }
          }
          setRemoteTrack(audioTrack);
        }
        if (args[1] === 'video') {
          // Check if we already have this video attached
          const uidString = String(remoteUid);
          if (!remoteVideoElements.current.has(uidString) && args[0].videoTrack) {
            console.log('[VoiceChat] 🎥 Video track detected, attaching...');
            attachRemoteVideo(args[0]);
            processedUsersRef.current.add(uidString);
          } else if (remoteVideoElements.current.has(uidString)) {
            console.log('[VoiceChat] ℹ️ Video already attached for:', uidString);
          } else {
            console.warn('[VoiceChat] ⚠️ user-published for video but track not ready yet:', uidString);
          }
        }
        break;

      case 'user-unpublished':
        const unpublishUid = args[0]?.uid;
        const unpublishMediaType = args[1]; // 'audio' or 'video'

        // Also ignore our own unpublish events
        if (String(unpublishUid) === String(uid)) {
          console.log('[VoiceChat] 🚫 Ignoring self user-unpublished event for:', unpublishUid);
          return;
        }

        console.log('[VoiceChat] 📴 Remote user unpublished:', unpublishUid, 'type:', unpublishMediaType);

        // CRITICAL: Only detach video if VIDEO track was unpublished
        // Don't detach video just because audio was toggled off
        if (unpublishMediaType === 'video') {
          const unpublishUidString = String(unpublishUid);
          detachRemoteVideo(unpublishUidString);
          processedUsersRef.current.delete(unpublishUidString); // Allow reprocessing if they republish
        }
        break;

      case 'user-left':
        const leftUid = args[0]?.uid;
        if (String(leftUid) !== String(uid)) {
          console.log('[VoiceChat] 👋 User left:', leftUid);
          const leftUidString = String(leftUid);
          detachRemoteVideo(leftUidString);
          processedUsersRef.current.delete(leftUidString); // Clean up
        }
        break;
    }
  };

  useEffect(() => {
    if (channelParameters.localAudioTrack) {
      try {
        channelParameters.localAudioTrack.setEnabled(micOn);
        console.log('[VoiceChat] 🎤 Mic enabled:', micOn, 'track state:', {
          enabled: channelParameters.localAudioTrack.enabled,
          muted: channelParameters.localAudioTrack.isMuted?.() ?? 'unknown',
        });
      } catch (err) {
        console.error('[VoiceChat] ❌ Failed to set mic enabled:', err);
      }
    } else {
      console.warn('[VoiceChat] ⚠️ No local audio track available for mic toggle');
    }

    // Update Playroom state to show who is talking/has mic on
    writeMyState({ withVoiceChat: micOn }).catch((error) => {
      console.error('[VoiceChat] Failed to update withVoiceChat state', error);
    });

    if (spkOn) {
      remoteTrack?.play();
    } else {
      remoteTrack?.stop();
    }
  }, [micOn, spkOn, remoteTrack, channelParameters]);

  // Subscribe to muted players store to stop/start audio when players are muted/unmuted
  useEffect(() => {
    const unsubscribe = useMutedPlayersStore.subscribe((state) => {
      // When mute state changes, update audio playback for each tracked audio track
      remoteAudioTracks.current.forEach((audioTrack, playerId) => {
        const isMuted = state.mutedPlayerIds.includes(playerId);
        try {
          if (isMuted) {
            audioTrack.stop();
            console.log('[VoiceChat] 🔇 Stopped audio for muted player:', playerId);
          } else {
            audioTrack.play();
            console.log('[VoiceChat] 🔊 Resumed audio for unmuted player:', playerId);
          }
        } catch (err) {
          console.warn('[VoiceChat] Failed to update audio for player:', playerId, err);
        }
      });
    });

    return () => unsubscribe();
  }, []);

  const startVoiceChat = async () => {
    if (!uid || !roomCode) return;

    try {
      // CRITICAL: Use the string player ID directly (Agora accepts strings)
      console.log('[VoiceChat] Joining with string UID:', uid, 'from playerId:', uid);

      // Dynamically load AgoraManager to avoid errors if SDK fails or env missing
      if (!agoraClient.current) {
        agoraClient.current = await AgoraManager(handleVSDKEvents);
      }
      if (!agoraClient.current) return;

      joinPromiseRef.current = agoraClient.current.join(uid, mediaChannels.roomVoice(roomCode), channelParameters);
      const result = await joinPromiseRef.current;

      // Sync audio track to persisted mic state
      // CRITICAL: Previously always muted here, but if micOn was persisted as true
      // from localStorage, the mic sync useEffect wouldn't re-fire (value didn't change),
      // leaving the track muted while UI showed "on"
      if (channelParameters.localAudioTrack) {
        try {
          const currentMicOn = useVoiceChatStore.getState().micOn;
          channelParameters.localAudioTrack.setEnabled(currentMicOn);
          console.log('[VoiceChat] ✅ Audio track synced to persisted mic state:', currentMicOn);
        } catch (err) {
          console.error('[VoiceChat] ❌ Failed to set initial mic state:', err);
        }
      } else {
        console.warn('[VoiceChat] ⚠️ No audio track after join - mic may not work');
      }

      const joined = result === true;
      hasJoinedRef.current = joined;

      // Signal to Room.tsx that Agora is ready
      setJoined(joined);

      // mic state based on result
      setMicAllowed(joined);
      if (joined) {
        joinTimeRef.current = Date.now();
        setEngineReadyToken((v) => v + 1);

        // CRITICAL: Check for existing remote users who may have already published
        // This handles the case where we join after other users have published
        // On iOS, user-published events don't fire reliably, so we must check manually
        // NOTE: This must be NON-BLOCKING to avoid freezing the UI!
        const engine = agoraClient.current?.getAgoraEngine();
        if (engine) {
          const checkRemoteUsersNonBlocking = (attempt: number = 1) => {
            if (!hasJoinedRef.current || attempt > 5) {
              console.log('[VoiceChat] ✅ Finished checking for remote users');
              return;
            }

            const remoteUsers = engine.remoteUsers;
            console.log(`[VoiceChat] 🔍 Checking for existing remote users (attempt ${attempt}/5):`, remoteUsers.length);

            if (remoteUsers.length > 0) {
              // Process users asynchronously without blocking main thread
              (async () => {
                for (const remoteUser of remoteUsers) {
                  const remoteUid = String(remoteUser.uid);
                  if (!processedUsersRef.current.has(remoteUid)) {
                    await checkAndSubscribeRemoteUser(remoteUser, engine);
                  }
                }
              })();
              // Still schedule another check in case new users join
              setTimeout(() => checkRemoteUsersNonBlocking(attempt + 1), 500);
            } else {
              // No users yet, retry with setTimeout (NON-BLOCKING!)
              console.log('[VoiceChat] ⏳ No remote users yet, scheduling retry...');
              setTimeout(() => checkRemoteUsersNonBlocking(attempt + 1), 300);
            }
          };

          // Start checking after a short delay (non-blocking)
          setTimeout(() => checkRemoteUsersNonBlocking(1), 100);
        }
      } else {
        joinTimeRef.current = null;
      }
    } catch (err) {
      console.error("Failed to start voice chat", err);
      joinPromiseRef.current = null;
      hasJoinedRef.current = false;
      setJoined(false);
      joinTimeRef.current = null;
    }
  };

  useEffect(() => {
    startVoiceChat();
    const remoteVideoElementMap = remoteVideoElements.current;
    const processedUsers = processedUsersRef.current;

    return () => {
      remoteVideoElementMap.forEach((_, playerId) =>
        detachRemoteVideo(playerId)
      );

      if (channelParameters.localVideoTrack) {
        try {
          agoraClient.current?.unpublishVideoTrack(channelParameters);
        } catch (err) {
          console.warn('[VoiceChat] Unpublish video on cleanup failed', err);
        }
      }

      joinPromiseRef.current = null;

      if (agoraClient.current) {
        agoraClient.current.leave(channelParameters);
      }
      hasJoinedRef.current = false;
      setJoined(false);
      joinTimeRef.current = null;
      processedUsers.clear();
    };
  }, [uid, roomCode]);

  // Helper to serialize video operations
  const runVideoOperation = (operation: () => Promise<void>, name: string) => {
    const nextOp = videoOperationLock.current
      .then(async () => {
        console.log(`[VoiceChat] 🔒 Starting video op: ${name}`);
        try {
          await operation();
          console.log(`[VoiceChat] 🔓 Finished video op: ${name}`);
        } catch (err) {
          console.error(`[VoiceChat] ❌ Failed video op: ${name}`, err);
        }
      })
      .catch((err) => {
        console.error(`[VoiceChat] ❌ Lock error before op: ${name}`, err);
      });

    videoOperationLock.current = nextOp;
    return nextOp;
  };

  useEffect(() => {
    let cancelled = false;

    const cleanupVideoTrack = async () => {
      if (!channelParameters.localVideoTrack) {
        return;
      }

      try {
        if (agoraClient.current && hasJoinedRef.current) {
          await agoraClient.current.unpublishVideoTrack(channelParameters);
          console.log('[VoiceChat] Unpublished video track');
        }
      } catch (err) {
        console.warn('[VoiceChat] Unpublish video failed', err);
      }
    };

    // CRITICAL: Only cleanup if there's no stream at all
    // Don't cleanup just because cameraEnabled is false - keep the track alive
    if (!cameraStream) {
      runVideoOperation(cleanupVideoTrack, 'cleanup (stream null)');
      return () => {
        cancelled = true;
      };
    }

    // If camera is disabled but stream exists, just disable the track, don't unpublish
    // This keeps the track alive so it doesn't need to be recreated
    if (!cameraEnabled && channelParameters.localVideoTrack) {
      runVideoOperation(async () => {
        try {
          if (channelParameters.localVideoTrack) {
            channelParameters.localVideoTrack.setEnabled(false);
            console.log('[VoiceChat] Video track disabled (camera off, but keeping track alive)');
          }
        } catch (err) {
          console.warn('[VoiceChat] Failed to disable video track:', err);
        }
      }, 'disable track');

      return () => {
        cancelled = true;
      };
    }

    const publishVideo = async () => {
      if (!hasJoinedRef.current) {
        console.log('[VoiceChat] Skipping video publish: not joined yet');
        return;
      }

      // Give Agora a bit of time after join before first video publish
      if (joinTimeRef.current !== null && Date.now() - joinTimeRef.current < 1500) {
        console.log('[VoiceChat] Delaying video publish until join is fully settled');
        if (!cancelled) {
          setTimeout(() => {
            setVideoRetryToken((token) => token + 1);
          }, 500);
        }
        return;
      }

      if (joinPromiseRef.current) {
        try {
          const joinResult = await joinPromiseRef.current;
          if (joinResult !== true || cancelled) {
            return;
          }
        } catch (err) {
          console.error('[VoiceChat] Join promise rejected, cannot publish video', err);
          return;
        }
      }

      if (!agoraClient.current || cancelled) {
        return;
      }

      const [videoTrack] = cameraStream.getVideoTracks();
      if (!videoTrack) {
        console.warn('[VoiceChat] No video track in cameraStream');
        return;
      }

      // CRITICAL: Check if track is already ended
      if (videoTrack.readyState === 'ended') {
        console.error('[VoiceChat] ❌ Video track already ended - this should not happen if stream is active');
        return;
      }

      if (channelParameters.localVideoTrack) {
        // Check if existing track is still valid
        try {
          const existingTrack = channelParameters.localVideoTrack.getMediaStreamTrack();
          if (existingTrack && existingTrack.readyState === 'live') {
            channelParameters.localVideoTrack.setEnabled(cameraEnabled);
            console.log('[VoiceChat] Video track enabled:', cameraEnabled);
            return;
          } else {
            console.warn('[VoiceChat] Existing track is not live, recreating...');
            try {
              channelParameters.localVideoTrack.stop();
              channelParameters.localVideoTrack.close?.();
            } catch (_error) { }
            delete channelParameters.localVideoTrack;
          }
        } catch (err) {
          console.warn('[VoiceChat] Error checking existing track, recreating...', err);
          delete channelParameters.localVideoTrack;
        }
      }

      console.log('[VoiceChat] Creating and publishing video track');

      try {
        await agoraClient.current?.publishVideoTrack(cameraStream, cameraEnabled, channelParameters);
        console.log('[VoiceChat] ✅ Video track published successfully');
      } catch (err) {
        console.error('[VoiceChat] ❌ Failed to publish video track', err);
        delete channelParameters.localVideoTrack;

        if (!cancelled) {
          setTimeout(() => {
            setVideoRetryToken((token) => token + 1);
          }, 500);
        }
      }
    };

    runVideoOperation(publishVideo, 'publishVideo');

    return () => {
      cancelled = true;
    };
  }, [cameraEnabled, cameraStream, engineReadyToken, videoRetryToken]);

  const toggleMic = () => {
    if (!micAllowed) {
      console.warn('[VoiceChat] ⚠️ Cannot toggle mic: not allowed');
      return;
    }

    const newState = !micOn;
    console.log('[VoiceChat] 🎤 Toggling mic:', newState, {
      hasTrack: !!channelParameters.localAudioTrack,
      trackEnabled: channelParameters.localAudioTrack?.enabled,
    });

    setMicOn(newState);

    // Immediately try to enable/disable the track
    if (channelParameters.localAudioTrack) {
      try {
        channelParameters.localAudioTrack.setEnabled(newState);
        console.log('[VoiceChat] ✅ Mic track enabled set to:', newState);
      } catch (err) {
        console.error('[VoiceChat] ❌ Failed to set mic enabled:', err);
      }
    } else {
      console.warn('[VoiceChat] ⚠️ No audio track available when toggling mic');
    }
  };

  const toggleSpk = () => {
    setSpkOn(!spkOn);
  };

  // Don't render anything if no Agora App ID is configured
  if (!appConfig.agoraAppId) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 pointer-events-auto">
      <button
        className={`select-none rounded-full h-12 w-12 flex justify-center items-center bg-black/50 backdrop-blur-md border border-white/10 active:scale-95 transition-transform shadow-lg`}
        onClick={toggleSpk}
        title={spkOn ? "Mute Speakers" : "Unmute Speakers"}
      >
        <img src={spkOn ? speakerIconOn : speakerIconOff} className={`w-6 h-6 ${spkOn ? 'opacity-100' : 'opacity-50'}`} alt="Speaker" />
      </button>
      <button
        className={`select-none rounded-full h-12 w-12 flex justify-center items-center bg-black/50 backdrop-blur-md border border-white/10 active:scale-95 transition-transform shadow-lg ${!micAllowed ? 'opacity-50 cursor-not-allowed' : ''}`}
        onClick={toggleMic}
        disabled={!micAllowed}
        title={micOn ? "Mute Mic" : "Unmute Mic"}
      >
        <img src={micOn ? micIconOn : micIconOff} className={`w-6 h-6 ${micOn ? 'opacity-100' : 'opacity-50'}`} alt="Mic" />
      </button>
    </div>
  );
};
