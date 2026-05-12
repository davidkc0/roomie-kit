import {
  Quaternion,
  Vector3,
  TransformNode,
  PBRMaterial,
  VideoTexture,
  Color3,
  AbstractMesh,
  ActionManager,
  ExecuteCodeAction,
  MeshBuilder,
  StandardMaterial,
} from '@babylonjs/core';
import { SceneLoader } from '@babylonjs/core/Loading';
import '@babylonjs/loaders'; // Import loaders for GLB support
import { useCallback, useEffect, useRef, memo, useState } from 'react';
import { createGlbAvatar, type GlbAvatar } from '../avatars/glbAvatar';
import type { PlayerState } from '../multiplayer/playroom';
import { useScene } from './scene';
import { useVideoStore } from '../state/videoStore';
import '../utils/helpers'; // Import to ensure hashCode is available
import { defaultAvatarUrl } from '../config/app';
import { resolveAssetUrl } from '../config/r2';
import { AvatarNameplate } from './AvatarNameplate';
import { DEFAULT_AVATAR_CONFIG, applyAvatarTextures } from '../avatars/avatarTextures';
import { writeMyState } from '../multiplayer/playroom';

type AvatarProps = {
  playerId: string;
  player: PlayerState;
  isLocal?: boolean;
  videoElement?: HTMLVideoElement;
  getLocalState?: () => PlayerState | null;
  onAvatarClick?: (playerId: string) => void;
  onLoaded?: () => void; // Called when local avatar finishes loading
  nameplateScale?: number; // Optional scale for nameplate (default 1.0)
  hidden?: boolean; // If true, avatar meshes are hidden but not disposed (used for streamers)
};

const INTERPOLATION_TIME = 0.12; // 120ms

type InterpolatedState = {
  pos: Vector3;
  rotY: number;
  headQ: Quaternion;
};

type AvatarInstance = GlbAvatar & { kind?: 'glb' | 'loading' };

function AvatarComponent({ playerId, player, isLocal = false, videoElement, getLocalState, onAvatarClick, onLoaded, nameplateScale = 1, hidden = false }: AvatarProps) {
  const { scene } = useScene();
  const avatarRef = useRef<AvatarInstance | null>(null);
  const playerStateRef = useRef(player);
  const interpolatedRef = useRef<InterpolatedState | null>(null);
  const targetStateRef = useRef<PlayerState>(player);
  const disposedRef = useRef(false);
  const [avatarReady, setAvatarReady] = useState(false);
  const [headNode, setHeadNode] = useState<TransformNode | AbstractMesh | null>(null);
  const screenMeshRef = useRef<AbstractMesh | null>(null); // Built-in screen mesh for video
  // Subscribe to video store changes - only for this specific player to prevent global re-renders
  const remoteVideoElement = useVideoStore(
    useCallback((state) => {
      if (isLocal) return undefined;

      const videos = state.remoteVideos;

      // 1. Try direct playerId match
      if (videos[playerId]) return videos[playerId];

      // 2. Try agoraVideoUid (as string)
      if (player.agoraVideoUid !== undefined) {
        const uidStr = String(player.agoraVideoUid);
        if (videos[uidStr]) return videos[uidStr];
      }

      // 3. Last resort: scan keys (robustness for num/string mismatch)
      if (player.agoraVideoUid !== undefined) {
        const target = String(player.agoraVideoUid);
        const foundKey = Object.keys(videos).find(k => k === target || k === playerId);
        if (foundKey) return videos[foundKey];
      }

      return undefined;
    }, [isLocal, playerId, player.agoraVideoUid])
  );

  const effectiveVideoElement = isLocal ? videoElement : remoteVideoElement;
  const clickCallbackRef = useRef(onAvatarClick);

  // Update callback ref when it changes
  useEffect(() => {
    clickCallbackRef.current = onAvatarClick;
  }, [onAvatarClick]);

  // Debug logging for remote video lookup
  useEffect(() => {
    if (!isLocal && playerId) {
      const hasVideo = !!remoteVideoElement;
      console.log(`[Avatar] Player ${playerId} remote video:`, hasVideo ? 'found' : 'not found');
    }
  }, [isLocal, playerId, remoteVideoElement]);

  // Update refs when player prop changes (for remote players to see updates)
  playerStateRef.current = player;
  targetStateRef.current = player;

  // Create face plane helper
  const createCameraFacePlane = useCallback(
    async (headNode: TransformNode | AbstractMesh, video: HTMLVideoElement, builtInScreen?: AbstractMesh) => {
      if (disposedRef.current || !video) {
        return;
      }

      // Ensure video is playing initially
      if (video.paused && video.readyState >= 2) {
        try {
          await video.play();
        } catch (err) {
          console.warn('[Avatar] Video play failed:', err);
        }
      }

      // Wait for video to be ready if needed
      if (video.readyState < 2) {
        video.addEventListener('loadeddata', () => {
          if (!disposedRef.current) {
            createCameraFacePlane(headNode, video, builtInScreen);
          }
        }, { once: true });
        return;
      }

      // CRITICAL: Monitor the MediaStream track - if it ends, video will stop
      // This is the root cause - we need to detect when the source track ends
      const stream = video.srcObject as MediaStream;
      if (stream) {
        const tracks = stream.getVideoTracks();
        if (tracks.length > 0) {
          const sourceTrack = tracks[0];

          // If track is already ended, we can't use this video
          if (sourceTrack.readyState === 'ended') {
            console.warn('[Avatar] ⚠️ Source video track already ended for player:', playerId);
            return;
          }

          // Monitor for track ending (this is the root cause of video stopping)
          const handleTrackEnded = () => {
            console.warn('[Avatar] ⚠️ Source video track ended for player:', playerId);
            // Track ended - video will stop. This is expected if remote user stops their camera.
            // We should clean up the face plane
            disposeCameraFacePlane();
          };

          sourceTrack.addEventListener('ended', handleTrackEnded, { once: true });

          // Store cleanup
          (video as any)._trackEndedHandler = handleTrackEnded;
        }
      }

      // If we have a built-in screen mesh, apply video directly to it
      if (builtInScreen) {
        console.log(`[Avatar] Using built-in screen mesh for ${playerId}: ${builtInScreen.name}`);

        // Store original material for restoration when video is removed
        if (!(builtInScreen as any)._originalMaterial) {
          (builtInScreen as any)._originalMaterial = builtInScreen.material;
        }

        // Create video material
        const screenMat = new PBRMaterial(`builtin-screen-mat-${playerId}`, scene);
        const tex = new VideoTexture(`face-video-${playerId}`, video, scene, true);

        // UV mapping is now correct - use standard 1:1 scale
        tex.vScale = 1.0;
        tex.uScale = 1.0;
        tex.vOffset = 0.0;
        tex.uOffset = 0.0;
        // No rotation needed - video is already correctly oriented

        screenMat.unlit = true;
        screenMat.albedoColor = new Color3(1, 1, 1);
        screenMat.emissiveColor = new Color3(1, 1, 1);
        screenMat.albedoTexture = tex;
        screenMat.emissiveTexture = tex;

        builtInScreen.material = screenMat;
        (builtInScreen as any)._videoMaterial = screenMat;
        (builtInScreen as any)._sourceVideo = video;

        console.log('[Avatar] Applied video to built-in screen for:', playerId);
        return;
      }

      // FALLBACK: No built-in screen, load external TV model
      // CRITICAL: Check if face plane already exists - if so, skip recreation to prevent flicker
      // Only recreate if the video source has actually changed
      const existingMesh = scene.getMeshByName(`face-model-root-${playerId}`);
      if (existingMesh) {
        // Face mesh already exists - check if video source is the same
        const existingVideo = (existingMesh as any)._sourceVideo;
        if (existingVideo === video) {
          // Same video, no need to recreate - just return
          console.log(`[Avatar] Face plane already exists for ${playerId}, skipping recreation`);
          return;
        }
        // Different video source - need to recreate
        console.log(`[Avatar] Face plane exists but video changed for ${playerId}, recreating`);
      }

      // Remove existing plane/box if it exists (only if we're recreating with new video)
      const meshNames = [
        `face-model-root-${playerId}`,  // current name
        `face-box-${playerId}`,
        `face-plane-${playerId}`, // legacy name
        `face-screen-${playerId}`,
      ];
      meshNames.forEach((name) => {
        const mesh = scene.getMeshByName(name);
        if (mesh) {
          mesh.dispose();
        }
      });

      // 1. Create the main head using the provided 3D asset
      // Load the GLB file
      SceneLoader.ImportMeshAsync('', '', resolveAssetUrl('cartoon_tv.glb'), scene)
        .then((result) => {
          if (disposedRef.current) {
            result.meshes.forEach(m => m.dispose());
            return;
          }

          const root = result.meshes[0];
          // Parent the entire model to the head node
          root.parent = headNode;

          // Debug: Log all mesh names to find the screen
          console.log(`[Avatar] TV Head loaded for ${playerId}. Hierarchy:`);
          result.meshes.forEach((m, i) => {
            console.log(`  ${i}: "${m.name}" (Class: ${m.getClassName()})`);
          });


          // tv head z position. 
          root.position = new Vector3(0, -0.2, 0.18);


          root.scaling = new Vector3(1.3, 1.3, 1.3);

          // Rotation:
          // 1. "Facing wrong way" -> Previous was Math.PI. Try 0 (Standard).
          // 2. "Angled downwards" -> Needs to tilt UP. Rotation.X negative is usually up (pitch back).
          //    Try -Math.PI / 10 (approx 18 degrees) to counter the head bone's natural tilt.
          root.rotation = new Vector3(-Math.PI / 10, 0, 0);

          // 2. Identify and setup the screen
          let screenMesh: AbstractMesh | undefined;

          // Debug: print mesh names
          const loadedMeshNames = result.meshes.map(m => m.name);
          console.log('[Avatar] Loaded meshes:', loadedMeshNames);

          // Strategy 1: Look for explicit names
          screenMesh = result.meshes.find(m => {
            const lower = m.name.toLowerCase();
            return lower.includes('screen') || lower.includes('display') || lower.includes('glass') || lower.includes('monitor');
          });

          // Strategy 2: If no named screen, look for the mesh with the specific material index or name?
          // Too complex without inspecting file.

          // Strategy 3: Heuristic - The screen is likely a simple plane or quad, but usually distinct.
          // Fallback to the Last mesh? Or specific index?
          if (!screenMesh) {
            console.warn('[Avatar] Could not identify screen mesh by name. Falling back to mesh with "mat" in name or index 1.');
            screenMesh = result.meshes.find(m => m.name.toLowerCase().includes('primitive')) || result.meshes[1];
          }

          if (screenMesh) {
            console.log(`[Avatar] Applying video to mesh: "${screenMesh.name}"`);

            // Use PBRMaterial with UNLIT enabled. This prevents "purple" shader errors while compatible with GLB.
            const screenMat = new PBRMaterial(`tv-screen-mat-${playerId}`, scene);
            const tex = new VideoTexture(`face-video-${playerId}`, video, scene, true);

            // Standard video settings
            tex.vScale = 1.0;
            tex.vOffset = 0.0;

            // PBR Unlit Configuration
            screenMat.unlit = true; // Crucial: makes it a simple texture shader
            screenMat.albedoColor = new Color3(1, 1, 1);
            screenMat.emissiveColor = new Color3(1, 1, 1);

            // Assign texture to everything to be safe
            screenMat.albedoTexture = tex;
            screenMat.emissiveTexture = tex;

            // Apply to mesh
            screenMesh.material = screenMat;
          } else {
            console.error('[Avatar] FATAL: Could not find ANY screen mesh to apply video to.');
          }

          // Name the root for cleanup and store video reference to prevent flicker
          root.name = `face-model-root-${playerId}`;
          (root as any)._sourceVideo = video;  // Track which video is in use

          console.log('[Avatar] 3D TV Head setup complete for:', playerId);
        })
        .catch((err) => {
          console.error('[Avatar] Failed to load TV head model:', err);
        });

    },
    [playerId, scene]
  );

  // Cleanup helper for camera face meshes
  const disposeCameraFacePlane = useCallback(() => {
    // Clean up track ended handler if it exists
    const storeVideos = useVideoStore.getState().remoteVideos;
    const videoEl = storeVideos[playerId] || (player.agoraVideoUid !== undefined ? storeVideos[String(player.agoraVideoUid)] : undefined);
    if (videoEl && (videoEl as any)._trackEndedHandler) {
      const stream = videoEl.srcObject as MediaStream;
      if (stream) {
        const tracks = stream.getVideoTracks();
        if (tracks.length > 0) {
          tracks[0].removeEventListener('ended', (videoEl as any)._trackEndedHandler);
        }
      }
      delete (videoEl as any)._trackEndedHandler;
    }

    // Restore built-in screen original material if it exists
    const builtInScreen = screenMeshRef.current;
    if (builtInScreen) {
      const originalMat = (builtInScreen as any)._originalMaterial;
      if (originalMat) {
        builtInScreen.material = originalMat;
        console.log('[Avatar] Restored original material for built-in screen');
      }
      // Dispose video material
      const videoMat = (builtInScreen as any)._videoMaterial;
      if (videoMat) {
        videoMat.dispose();
        delete (builtInScreen as any)._videoMaterial;
      }
      delete (builtInScreen as any)._sourceVideo;
    }

    // Dispose the loaded model root (external TV fallback)
    const rootMesh = scene.getMeshByName(`face-model-root-${playerId}`);
    if (rootMesh) {
      rootMesh.dispose();
    }

    // Also try legacy names just in case
    const meshNames = [
      `face-box-${playerId}`,
      `face-plane-${playerId}`,
      `face-screen-${playerId}`,
    ];
    meshNames.forEach((name) => {
      const mesh = scene.getMeshByName(name);
      if (mesh) {
        mesh.dispose();
      }
    });
  }, [playerId, scene]);

  // Create avatar on mount
  useEffect(() => {
    console.log('[Avatar] Creating avatar for player:', playerId, 'isLocal:', isLocal);

    let disposed = false;
    disposedRef.current = false;

    (async () => {
      try {
        const video = isLocal && effectiveVideoElement ? effectiveVideoElement : undefined;

        // CRITICAL: Use playerStateRef to get the latest avatarUrl without causing re-renders
        const playerForAvatar = playerStateRef.current;
        const avatarUrl = playerForAvatar?.avatarUrl;

        let avatar!: AvatarInstance;
        const MAX_RETRIES = 3;
        const RETRY_DELAY_MS = 2000;

        // Wait for avatarUrl if not yet available (profile may still be syncing)
        let resolvedUrl = avatarUrl || defaultAvatarUrl;
        if (!resolvedUrl) {
          console.log('[Avatar] No avatarUrl yet for player:', playerId, '— polling...');
          const POLL_INTERVAL = 500;
          const MAX_POLL_TIME = 10000;
          let polled = 0;
          while (!resolvedUrl && polled < MAX_POLL_TIME) {
            await new Promise(r => setTimeout(r, POLL_INTERVAL));
            polled += POLL_INTERVAL;
            if (disposed) return;
            resolvedUrl = playerStateRef.current?.avatarUrl;
          }
          if (!resolvedUrl) {
            console.warn('[Avatar] avatarUrl never arrived for player:', playerId, '— showing loader');
            throw new Error('avatarUrl not available after polling');
          }
          console.log('[Avatar] avatarUrl arrived after', polled, 'ms for player:', playerId);
        }

        // Retry loop for avatar model loading
        let lastError: Error | null = null;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          if (disposed) return;
          try {
            console.log(`[Avatar] Loading avatar model (attempt ${attempt}/${MAX_RETRIES}) for:`, playerId, 'URL:', resolvedUrl);
            const glb = await createGlbAvatar(scene, resolvedUrl);
            avatar = { ...glb, kind: 'glb' };

            // Apply custom textures if config exists
            applyAvatarTextures(glb.root.getChildMeshes(false), playerStateRef.current?.avatarConfig || DEFAULT_AVATAR_CONFIG, scene);
            console.log('[Avatar] Applied avatar textures for player:', playerId);

            console.log('[Avatar] avatar model loaded successfully for player:', playerId);
            lastError = null;
            break; // Success — exit retry loop
          } catch (avatarError) {
            lastError = avatarError as Error;
            console.error(`[Avatar] avatar model attempt ${attempt}/${MAX_RETRIES} failed:`, avatarError);
            if (attempt < MAX_RETRIES) {
              await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
            }
          }
        }

        if (lastError) {
          throw lastError; // All retries exhausted — fall through to loading spinner
        }

        if (disposed) {
          avatar.root.dispose();
          return;
        }

        // Use playerStateRef to get latest position
        const playerForPosition = playerStateRef.current;
        avatar.root.position = new Vector3(playerForPosition.pos.x, playerForPosition.pos.y, playerForPosition.pos.z);
        avatar.root.rotation.y = playerForPosition.rotY;

        interpolatedRef.current = {
          pos: new Vector3(playerForPosition.pos.x, playerForPosition.pos.y, playerForPosition.pos.z),
          rotY: playerForPosition.rotY,
          headQ: Quaternion.FromArray(playerForPosition.head.q),
        };

        avatarRef.current = avatar!;
        setAvatarReady(true);

        // Signal to other clients that avatar is loaded and player is ready
        if (isLocal) {
          writeMyState({ isLoading: false }, true).catch(err =>
            console.error('[Avatar] Failed to broadcast isLoading:false:', err)
          );
          onLoaded?.();
        }

        const playerForLog = playerStateRef.current;
        console.log('[Avatar] Avatar created for player:', playerId, 'hasModel:', !!(playerForLog?.avatarUrl && (avatar! as any).kind === 'glb'));

        // Add click detection for non-local avatars
        if (!isLocal && onAvatarClick) {
          // Make all meshes in the avatar pickable for better click detection
          const allMeshes: AbstractMesh[] = [];

          if (avatar.root instanceof AbstractMesh) {
            allMeshes.push(avatar.root);
          }

          // Get all child meshes recursively
          const getChildMeshes = (node: any): void => {
            const children = node.getChildMeshes ? node.getChildMeshes(false) : [];
            children.forEach((child: any) => {
              if (child instanceof AbstractMesh) {
                allMeshes.push(child);
              }
              getChildMeshes(child);
            });
          };

          getChildMeshes(avatar.root);

          // Make all meshes pickable and add click handlers
          allMeshes.forEach((mesh) => {
            mesh.isPickable = true;
            const actionManager = new ActionManager(scene);
            mesh.actionManager = actionManager;

            actionManager.registerAction(
              new ExecuteCodeAction(ActionManager.OnPickDownTrigger, (evt) => {
                evt.sourceEvent?.stopPropagation?.();
                evt.sourceEvent?.preventDefault?.();
                console.log('[Avatar] Avatar clicked:', playerId, 'mesh:', mesh.name);
                if (clickCallbackRef.current) {
                  clickCallbackRef.current(playerId);
                } else {
                  console.warn('[Avatar] No click callback registered for player:', playerId);
                }
              })
            );
          });

          console.log(`[Avatar] Made ${allMeshes.length} meshes pickable for player:`, playerId);
        }

        // Store screen mesh for video if avatar has one
        if ((avatar as any).screenMesh) {
          screenMeshRef.current = (avatar as any).screenMesh;
          console.log('[Avatar] Stored built-in screen mesh:', (avatar as any).screenMesh.name);
        }

        if (video && (avatar as any).head) {
          // Pass built-in screen if available
          const builtInScreen = screenMeshRef.current || undefined;
          createCameraFacePlane((avatar as any).head, video, builtInScreen);
        }

        // Store head node for nameplate
        if ((avatar as any).head) {
          setHeadNode((avatar as any).head);
        }
      } catch (e) {
        console.error('[Avatar] Failed to create avatar for player', playerId, e);
        // Show loading indicator instead of fallback avatar
        // This creates a spinning ring to indicate loading
        try {
          const root = new TransformNode(`loading-avatar-${playerId}`, scene);

          // Create a torus (ring) as loading indicator
          const loader = MeshBuilder.CreateTorus(`loader-ring-${playerId}`, {
            diameter: 0.8,
            thickness: 0.1,
            tessellation: 32
          }, scene);
          loader.parent = root;

          // Position at typical avatar height
          const playerForLoading = playerStateRef.current;
          root.position = new Vector3(playerForLoading.pos.x, playerForLoading.pos.y, playerForLoading.pos.z);
          loader.position.y = 1.5; // Head height

          // Create glowing material
          const loaderMat = new StandardMaterial(`loader-mat-${playerId}`, scene);
          loaderMat.emissiveColor = new Color3(0.5, 0.8, 1.0); // Light blue glow
          loaderMat.alpha = 0.8;
          loader.material = loaderMat;

          // Animate the ring spinning
          let rotationAngle = 0;
          const animateLoader = () => {
            if (loader.isDisposed() || disposedRef.current) return;
            rotationAngle += 0.05;
            loader.rotation.x = rotationAngle;
            loader.rotation.z = rotationAngle * 0.5;
            requestAnimationFrame(animateLoader);
          };
          animateLoader();

          // Store for cleanup
          avatarRef.current = { root, head: loader, kind: 'loading' } as any;

          // Note: avatarReady stays false so nameplate won't show until avatar loads
          console.log('[Avatar] Showing loading indicator for player:', playerId);
        } catch (loadingError) {
          console.error('[Avatar] Could not create loading indicator:', loadingError);
          setAvatarReady(false);
        }
      }
    })();

    return () => {
      disposed = true;
      disposedRef.current = true;
      setAvatarReady(false); // Reset on unmount
      console.log('[Avatar] Disposing avatar for player:', playerId);
      if (avatarRef.current) {
        avatarRef.current.root.dispose();
        avatarRef.current = null;
      }
    };
  }, [scene, playerId, isLocal]); // CRITICAL: Don't depend on player.avatarUrl - it causes unnecessary recreations

  // RECOVERY: If avatar is stuck in 'loading' (spinner) state, poll for avatarUrl
  // and retry loading when it becomes available. This fixes the race condition where
  // two players join simultaneously and one's avatarUrl arrives after the initial
  // 10s polling window.
  useEffect(() => {
    // Only activate when stuck in loading state
    if (!avatarRef.current || (avatarRef.current as any).kind !== 'loading') return;

    console.log('[Avatar] Recovery: monitoring for avatarUrl for player:', playerId);

    let cancelled = false;
    const POLL_INTERVAL = 3000;

    const retryInterval = setInterval(async () => {
      if (cancelled) return;

      const currentUrl = playerStateRef.current?.avatarUrl || defaultAvatarUrl;
      if (!currentUrl) return; // Still no URL, keep waiting

      console.log('[Avatar] Recovery: avatarUrl found for player:', playerId, '— retrying load');
      clearInterval(retryInterval);

      // Dispose the loading spinner
      if (avatarRef.current?.root) {
        avatarRef.current.root.dispose();
        avatarRef.current = null;
      }

      // Retry avatar loading
      const MAX_RETRIES = 3;
      const RETRY_DELAY_MS = 2000;
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        if (cancelled) return;
        try {
          console.log(`[Avatar] Recovery: loading avatar model (attempt ${attempt}/${MAX_RETRIES}) for:`, playerId);
          const glb = await createGlbAvatar(scene, currentUrl);
          const avatar: AvatarInstance = { ...glb, kind: 'glb' };

          applyAvatarTextures(glb.root.getChildMeshes(false), playerStateRef.current?.avatarConfig || DEFAULT_AVATAR_CONFIG, scene);

          if (cancelled) {
            avatar.root.dispose();
            return;
          }

          const playerForPosition = playerStateRef.current;
          avatar.root.position = new Vector3(playerForPosition.pos.x, playerForPosition.pos.y, playerForPosition.pos.z);
          avatar.root.rotation.y = playerForPosition.rotY;

          interpolatedRef.current = {
            pos: new Vector3(playerForPosition.pos.x, playerForPosition.pos.y, playerForPosition.pos.z),
            rotY: playerForPosition.rotY,
            headQ: Quaternion.FromArray(playerForPosition.head.q),
          };

          avatarRef.current = avatar;
          setAvatarReady(true);

          if ((avatar as any).head) {
            setHeadNode((avatar as any).head);
          }

          console.log('[Avatar] Recovery: avatar loaded successfully for player:', playerId);
          lastError = null;
          break;
        } catch (err) {
          lastError = err as Error;
          console.error(`[Avatar] Recovery: attempt ${attempt}/${MAX_RETRIES} failed:`, err);
          if (attempt < MAX_RETRIES) {
            await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
          }
        }
      }

      if (lastError) {
        console.error('[Avatar] Recovery: all retries exhausted for player:', playerId);
      }
    }, POLL_INTERVAL);

    return () => {
      cancelled = true;
      clearInterval(retryInterval);
    };
  }, [scene, playerId, avatarReady]); // avatarReady=false when stuck in loading

  // Hide/show avatar when hidden prop changes (e.g. streamer mode)
  useEffect(() => {
    if (!avatarRef.current?.root) return;
    avatarRef.current.root.setEnabled(!hidden);
  }, [hidden]);

  // Separate effect to handle video updates
  // CRITICAL: Use refs to track video state to avoid re-render loops
  const tvHeadEnabledRef = useRef(player.tvHeadEnabled);
  const agoraVideoUidRef = useRef(player.agoraVideoUid);

  // Update refs when player changes (but don't trigger effect)
  tvHeadEnabledRef.current = player.tvHeadEnabled;
  agoraVideoUidRef.current = player.agoraVideoUid;

  useEffect(() => {
    const tvHeadEnabled = tvHeadEnabledRef.current;

    console.log(`[Avatar] Video effect triggered for ${playerId}`, {
      hasAvatar: !!avatarRef.current,
      avatarReady,
      isLocal,
      tvHeadEnabled,
      hasVideo: !!effectiveVideoElement,
    });

    const avatar = avatarRef.current;
    if (!avatar || !avatarReady) {
      disposeCameraFacePlane();
      return;
    }

    const headNode = (avatar as any).head;
    if (!headNode) {
      disposeCameraFacePlane();
      return;
    }

    // Logic for both local and remote:
    // If we have a video element and (local OR tv head enabled), show it
    const shouldShow = isLocal || tvHeadEnabled;

    if (shouldShow && effectiveVideoElement) {
      // For remote players, effectiveVideoElement comes from the granular selector
      // so we don't need to look it up again
      console.log(`[Avatar] showing video on ${playerId}`);
      // Pass built-in screen mesh if available
      const builtInScreen = screenMeshRef.current || undefined;
      createCameraFacePlane(headNode, effectiveVideoElement, builtInScreen);
      return () => {
        disposeCameraFacePlane();
      };
    } else {
      console.log(`[Avatar] Removing video for ${playerId} (Show: ${shouldShow}, HasVid: ${!!effectiveVideoElement})`);
      disposeCameraFacePlane();
    }
  }, [isLocal, effectiveVideoElement, playerId, createCameraFacePlane, disposeCameraFacePlane, avatarReady, player.tvHeadEnabled]);

  // Handle Emote Rendering (3D GLB)
  // CRITICAL: Depend on primitive values (timestamp, type) NOT the emote object reference!
  // The object reference changes every world update due to JSON.stringify/parse, 
  // which would cause effect cleanup and dispose the mesh prematurely.
  const emoteType = player.emote?.type;
  const emoteTimestamp = player.emote?.timestamp;

  useEffect(() => {
    // Wait for avatar to be ready before showing emotes
    if (!avatarReady || !emoteType || !emoteTimestamp) return;

    // Check if emote is still valid (within 5 seconds for 3D animation)
    const now = Date.now();
    const age = now - emoteTimestamp;

    // 5 second duration for 3D emote
    if (age > 5000) {
      return;
    }

    const remainingTime = 5000 - age;
    console.log(`[Avatar] Displaying 3D emote "${emoteType}" for ${playerId} (${remainingTime}ms remaining)`);

    let cleanupCurrentEmote: (() => void) | undefined;
    let emoteMesh: AbstractMesh | undefined;

    const loadEmote = async () => {
      // Find the head node to attach to
      const avatar = avatarRef.current;
      if (!avatar) {
        console.warn('[Avatar] Cannot load emote - avatar not ready');
        return;
      }

      const headNode = (avatar as any).head as TransformNode;
      if (!headNode) {
        console.warn('[Avatar] Cannot load emote - headNode not found on avatar');
        return;
      }

      try {
        // Load the GLB dynamically based on emote type
        // The user provided matching GLBs for all supported types:
        // angry, cool, crying, evil, gross, laugh, sad
        const glbName = `${emoteType}.glb`;

        console.log(`[Avatar] Loading 3D emote: ${glbName}`);

        const result = await SceneLoader.ImportMeshAsync('', '', resolveAssetUrl(glbName, 'emotes'), scene);
        emoteMesh = result.meshes[0];

        console.log(`[Avatar] ✅ 3D emote loaded: ${glbName}, meshes: ${result.meshes.length}`);

        // CRITICAL: Parent to avatar ROOT, not the head bone!
        // The head bone (mixamorig:HeadTop_End) is already at head height,
        // so parenting there with Y offset would put the emote way above the camera.
        emoteMesh.parent = avatar.root;

        // CRITICAL: specific GLB models come with a rotationQuaternion set, which locks rotation.
        // We must clear it to use simple Euler angles (rotation.x/y/z).
        emoteMesh.rotationQuaternion = null;

        // Position above avatar (Y=2.0 is about head height + some space)
        // Start with initial scale for spring animation
        emoteMesh.position = new Vector3(0, 2.2, 0);
        emoteMesh.scaling = new Vector3(0.01, 0.01, 0.01); // Start small but visible

        console.log(`[Avatar] Emote positioned at Y=2.2 above avatar root`);

        // Animation Loop
        let startTime = performance.now();
        const animate = () => {
          if (!emoteMesh || emoteMesh.isDisposed()) return;

          const t = (performance.now() - startTime) / 1000;

          // Spring/Bounce effect
          // Scale up quickly
          let scale = 0;
          if (t < 0.5) {
            // Elastic ease out
            const p = t / 0.5;
            scale = Math.sin(-13 * (p + 1) * Math.PI / 2) * Math.pow(2, -10 * p) + 1;
          } else if (t > 4.5) {
            // Scale down at end (last 0.5s)
            scale = Math.max(0, 1 - (t - 4.5) / 0.5);
          } else {
            scale = 1;
          }

          // Apply scale
          // User requested smaller size ("slightly smaller than TV head")
          const baseScale = 0.25;
          emoteMesh.scaling.setAll(baseScale * scale);

          // Floating/Bobbing
          emoteMesh.position.y = 2.2 + Math.sin(t * 5) * 0.1;

          // Rotate slightly
          // Trying -PI/2 (90 deg right) to face front if default was Left
          emoteMesh.rotation.y = -Math.PI / 2 + (t * 0.5);

          if (t < 5.0) {
            requestAnimationFrame(animate);
          }
        };
        animate();

        cleanupCurrentEmote = () => {
          if (emoteMesh) {
            emoteMesh.dispose();
            emoteMesh = undefined;
          }
        };

      } catch (err) {
        console.error('[Avatar] Failed to load 3D emote:', err);
      }
    };

    loadEmote();

    // Cleanup after timeout
    const timer = setTimeout(() => {
      if (cleanupCurrentEmote) cleanupCurrentEmote();
    }, remainingTime);

    return () => {
      clearTimeout(timer);
      if (cleanupCurrentEmote) cleanupCurrentEmote();
    };
  }, [emoteType, emoteTimestamp, scene, playerId, avatarReady]);

  // Handle In-Call Indicator (3D GLB) - shows call.glb above head when player is in a call
  useEffect(() => {
    const inCall = player.inCall;
    if (!inCall) return;

    let cleanupCallIndicator: (() => void) | undefined;
    let callMesh: AbstractMesh | undefined;

    const loadCallIndicator = async () => {
      const avatar = avatarRef.current;
      if (!avatar) return;

      const headNode = (avatar as any).head as TransformNode;
      if (!headNode) return;

      try {
        console.log(`[Avatar] Loading call indicator for ${playerId}`);

        const result = await SceneLoader.ImportMeshAsync('', '', resolveAssetUrl('call.glb'), scene);
        callMesh = result.meshes[0];

        // Parent to head
        callMesh.parent = headNode;
        callMesh.rotationQuaternion = null;

        // Position above head
        callMesh.position = new Vector3(0, 0.85, 0);
        const baseScale = 0.25;
        callMesh.scaling = new Vector3(baseScale, baseScale, baseScale);

        // Animation Loop - continuous bobbing and rotating while in call
        let startTime = performance.now();
        const animate = () => {
          if (!callMesh || callMesh.isDisposed()) return;

          const t = (performance.now() - startTime) / 1000;

          // Floating/Bobbing
          callMesh.position.y = 0.85 + Math.sin(t * 3) * 0.08;

          // Slow rotation
          callMesh.rotation.y = t * 0.8;

          requestAnimationFrame(animate);
        };
        animate();

        cleanupCallIndicator = () => {
          if (callMesh) {
            callMesh.dispose();
            callMesh = undefined;
          }
        };

      } catch (err) {
        console.error('[Avatar] Failed to load call indicator:', err);
      }
    };

    loadCallIndicator();

    return () => {
      if (cleanupCallIndicator) cleanupCallIndicator();
    };
  }, [player.inCall, scene, playerId]);

  // Update avatar position, rotation, and head rotation each frame
  useEffect(() => {
    const observer = scene.onBeforeRenderObservable.add(() => {
      const avatar = avatarRef.current;
      if (!avatar || !interpolatedRef.current) {
        return;
      }

      // For local player, read directly from getLocalState if available (real-time)
      // Otherwise fall back to prop (for remote players or if getter not provided)
      const state = isLocal && getLocalState ? (getLocalState() ?? playerStateRef.current) : playerStateRef.current;
      const target = targetStateRef.current;
      const interpolated = interpolatedRef.current;
      const deltaTime = scene.getEngine().getDeltaTime() / 1000;

      // Always update target to latest state
      targetStateRef.current = state;

      if (isLocal) {
        // For local player, use the latest state directly from movement loop
        avatar.root.position.set(state.pos.x, state.pos.y, state.pos.z);
        avatar.root.rotation.y = state.rotY;
        interpolated.pos.set(state.pos.x, state.pos.y, state.pos.z);
        interpolated.rotY = state.rotY;
      } else {
        // Interpolate remote players
        const lerpFactor = Math.min(1, deltaTime / INTERPOLATION_TIME);
        const targetPos = new Vector3(target.pos.x, target.pos.y, target.pos.z);
        interpolated.pos = Vector3.Lerp(interpolated.pos, targetPos, lerpFactor);
        interpolated.rotY +=
          ((target.rotY - interpolated.rotY + Math.PI) %
            (2 * Math.PI) -
            Math.PI) *
          lerpFactor;

        avatar.root.position.copyFrom(interpolated.pos);
        avatar.root.rotation.y = interpolated.rotY;
      }

      // Head rotation (apply quaternion to head mesh)
      if (state.head?.q && (avatar as any).head) {
        // Validate quaternion - check if all values are valid numbers
        const q = state.head.q;
        if (q && q.length === 4 && q.every((v: any) => typeof v === 'number' && !isNaN(v))) {
          const targetQ = Quaternion.FromArray(q);
          const lerpFactor = Math.min(1, deltaTime / INTERPOLATION_TIME);
          Quaternion.SlerpToRef(
            interpolated.headQ,
            targetQ,
            lerpFactor,
            interpolated.headQ
          );

          // Apply rotation to head mesh with tilt offset
          const headNode: any = (avatar as any).head;
          if (headNode) {
            if (!headNode.rotationQuaternion) {
              headNode.rotationQuaternion = Quaternion.Identity();
            }
            // HEAD TILT FIX: Add upward offset (~30 degrees on X axis)
            // Cache the tilt offset on the headNode to avoid recreating it every frame
            if (!(headNode as any)._tiltOffset) {
              (headNode as any)._tiltOffset = Quaternion.RotationAxis(new Vector3(1, 0, 0), -0.5);
            }
            const finalRotation = interpolated.headQ.multiply((headNode as any)._tiltOffset);
            headNode.rotationQuaternion.copyFrom(finalRotation);
          }
        }
      }

      // Handle avatar model animations
      const isGlbAvatar = (avatar as any).kind === 'glb' && (avatar as any).animationGroups;
      if (isGlbAvatar) {
        const animationGroups = (avatar as any).animationGroups as any[];
        const currentAnim = state.anim || 'idle';

        // Find and play appropriate animation
        const targetAnim = animationGroups.find((ag: any) => {
          const name = ag.name?.toLowerCase() || '';

          if (currentAnim === 'walk') {
            return name.includes('walk') || name.includes('run');
          } else if (currentAnim === 'idle') {
            return name.includes('idle') || name.includes('tpose');
          } else {
            // Custom emote state (Dance, Wave, etc.)
            // Try to find exact match first
            return name.includes(currentAnim.toLowerCase());
          }
        }) || animationGroups.find((ag: any) => {
          // Fallback to Idle if specific emote not found
          const name = ag.name?.toLowerCase() || '';
          return name.includes('idle') || name.includes('tpose');
        });

        // Stop all other animations
        animationGroups.forEach((ag: any) => {
          if (ag !== targetAnim && ag.isPlaying) {
            ag.stop();
          }
        });



        // Play target animation
        if (targetAnim && !targetAnim.isPlaying) {
          targetAnim.play(true); // loop
          console.log('[Avatar] Playing avatar model animation:', targetAnim.name, 'for player:', playerId);
        }
      }


    });

    return () => {
      scene.onBeforeRenderObservable.remove(observer);
    };
  }, [scene, isLocal, getLocalState]);


  if (hidden) return null;

  return (
    <AvatarNameplate
      headNode={headNode}
      username={player.profile?.username || player.profile?.name || 'Player'}
      playerId={playerId}
      isMuted={player.isMuted}
      isSpeaking={player.isSpeaking}
      isLocal={isLocal}
      scale={nameplateScale}
    />
  );
}

// Memoize Avatar to prevent unnecessary re-renders when props haven't changed
export const Avatar = memo(AvatarComponent, (prevProps, nextProps) => {
  // Custom comparison: only re-render if meaningful props changed
  return (
    prevProps.playerId === nextProps.playerId &&
    prevProps.isLocal === nextProps.isLocal &&
    prevProps.videoElement === nextProps.videoElement &&
    prevProps.getLocalState === nextProps.getLocalState &&
    // Deep comparison of player state (only check key properties)
    prevProps.player.pos.x === nextProps.player.pos.x &&
    prevProps.player.pos.y === nextProps.player.pos.y &&
    prevProps.player.pos.z === nextProps.player.pos.z &&
    prevProps.player.rotY === nextProps.player.rotY &&
    prevProps.player.anim === nextProps.player.anim &&
    prevProps.player.avatarUrl === nextProps.player.avatarUrl &&
    prevProps.player.tvHeadEnabled === nextProps.player.tvHeadEnabled &&
    prevProps.player.agoraVideoUid === nextProps.player.agoraVideoUid &&
    // Compare emote by timestamp (primitive) to avoid object reference issues
    prevProps.player.emote?.timestamp === nextProps.player.emote?.timestamp &&
    prevProps.player.emote?.type === nextProps.player.emote?.type &&
    prevProps.hidden === nextProps.hidden
    // Note: head rotation and blend shapes are updated via refs, so we don't need to compare them
  );
});
