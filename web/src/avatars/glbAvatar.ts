import {
  Scene,
  TransformNode,
  AbstractMesh,
  Vector3,
  Skeleton,
  AnimationGroup,
  Animation,
} from '@babylonjs/core';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import '@babylonjs/loaders';
import { R2_PATHS, resolveAssetUrl } from '../config/r2';

export type GlbAvatar = {
  root: TransformNode;
  head: AbstractMesh | TransformNode;
  screenMesh?: AbstractMesh; // Built-in TV screen for video
  skeleton?: Skeleton;
  animationGroups?: AnimationGroup[];
};

// ─── Global Animation Cache ───────────────────────────────────────────
// Stores raw animation data (bone name → Animation[]) keyed by animation name.
// The first player to load pays the full GLB cost. All subsequent players
// clone from this cache and retarget to their own skeleton — zero extra GLB loads.
type CachedAnimData = {
  boneName: string; // The clean bone name (e.g. "Hips", "Head")
  animations: Animation[]; // Cloneable Animation objects
}[];

type CachedAnimEntry = {
  name: string; // e.g. "Idle", "Walking"
  from: number;
  to: number;
  tracks: CachedAnimData;
};

const animationCache = new Map<string, CachedAnimEntry>();
// Track in-flight loads to avoid duplicate requests when multiple avatars
// load concurrently (e.g. 3 players joining at the same time)
const pendingLoads = new Map<string, Promise<CachedAnimEntry | null>>();

// Which animations to load upfront (critical for movement)
const CORE_ANIMATIONS: [string, string][] = [
  ['Idle', 'idle.glb'],
  ['Walking', 'walk.glb'],
];

// Which animations to defer until first use (emotes)
const DEFERRED_ANIMATIONS: [string, string][] = [
  ['Dance', 'dance.glb'],
  ['Wave', 'wave.glb'],
  ['ThumbsUp', 'thumbs-up.glb'],
  ['ThumbsDown', 'thumbs-down.glb'],
];

/**
 * Load an animation GLB, extract animation data, cache it, then
 * retarget a clone to the provided skeleton.
 */
async function loadAndCacheAnim(
  name: string,
  filename: string,
  scene: Scene,
  skeleton: Skeleton,
): Promise<AnimationGroup | null> {
  // Check cache first
  let cached = animationCache.get(name);

  if (!cached) {
    // Check if another avatar is already loading this animation
    let pending = pendingLoads.get(name);

    if (!pending) {
      // First load — fetch the GLB
      pending = (async (): Promise<CachedAnimEntry | null> => {
        try {
          const animResult = await SceneLoader.ImportMeshAsync(
            '', `${R2_PATHS.animations}/`, filename, scene
          );

          // Extract animation data before disposing the loaded meshes
          const ag = animResult.animationGroups[0];
          console.log(`[AvatarGLB] Loaded file ${filename}. Groups found: ${animResult.animationGroups.length}. First group name: ${ag?.name}`);

          if (!ag) {
            // Dispose dummy meshes
            animResult.meshes.forEach(m => m.dispose());
            return null;
          }

          ag.stop();

          // Extract and cache the raw animation data (bone name → animations)
          const tracks: CachedAnimData = ag.targetedAnimations.map(ta => {
            const targetName: string = ta.target.name;
            const cleanName = targetName.split(':').pop()!;
            return {
              boneName: cleanName,
              animations: [ta.animation.clone()],
            };
          });

          const entry: CachedAnimEntry = {
            name,
            from: ag.from,
            to: ag.to,
            tracks,
          };

          animationCache.set(name, entry);
          console.log(`[AvatarGLB] Cached animation: ${name}. Duration: ${ag.to - ag.from}`);

          // Dispose the loaded dummy meshes and animation groups — we only keep the cloned data
          ag.dispose();
          animResult.animationGroups.forEach(g => { try { g.dispose(); } catch (_) { /* already disposed */ } });
          animResult.meshes.forEach(m => m.dispose());
          animResult.skeletons.forEach(s => s.dispose());

          return entry;
        } catch (e) {
          console.warn(`[AvatarGLB] Failed to load animation: ${filename}`, e);
          return null;
        } finally {
          pendingLoads.delete(name);
        }
      })();
      pendingLoads.set(name, pending);
    } else {
      console.log(`[AvatarGLB] Waiting for in-flight load of ${name}`);
    }

    cached = await pending ?? undefined;
    if (!cached) return null;
  } else {
    console.log(`[AvatarGLB] Using cached animation: ${name}`);
  }

  // Clone from cache and retarget to this player's skeleton
  return cloneAnimForSkeleton(cached, skeleton, scene);
}

/**
 * Clone cached animation data and retarget to a specific skeleton.
 */
function cloneAnimForSkeleton(
  cached: CachedAnimEntry,
  skeleton: Skeleton,
  scene: Scene,
): AnimationGroup {
  const ag = new AnimationGroup(cached.name, scene);

  for (const track of cached.tracks) {
    // Find this bone in the target skeleton
    const targetBone = skeleton.bones.find(b =>
      b.name === track.boneName ||
      b.name === `mixamorig:${track.boneName}` ||
      b.name.endsWith(`:${track.boneName}`)
    );

    if (targetBone) {
      const transformNode = targetBone.getTransformNode();
      if (transformNode) {
        for (const anim of track.animations) {
          ag.addTargetedAnimation(anim.clone(), transformNode);
        }
      }
    }
  }

  return ag;
}

/**
 * Public API: Load a deferred emote animation on demand.
 * Called by Avatar.tsx when an emote is first triggered.
 */
export async function loadDeferredAnimation(
  name: string,
  scene: Scene,
  skeleton: Skeleton,
): Promise<AnimationGroup | null> {
  const entry = DEFERRED_ANIMATIONS.find(([n]) => n === name);
  if (!entry) {
    console.warn(`[AvatarGLB] Unknown deferred animation: ${name}`);
    return null;
  }
  return loadAndCacheAnim(entry[0], entry[1], scene, skeleton);
}

/**
 * Naive avatar loader for Babylon.
 * Loads a GLB from the given URL and returns a root transform plus a head node
 * (mesh whose name contains 'head', case-insensitive) for attaching the camera face.
 *
 * Animations are loaded from a global cache — only the first player pays the
 * full GLB cost. Subsequent players clone cached animation data and retarget
 * to their own skeleton.
 */
export async function createGlbAvatar(
  scene: Scene,
  avatarUrl: string
): Promise<GlbAvatar> {
  const resolvedAvatarUrl = resolveAssetUrl(avatarUrl, 'avatars');
  console.log('[AvatarGLB] Loading avatar from URL:', resolvedAvatarUrl);

  try {
    const result = await SceneLoader.ImportMeshAsync(
      '',
      '',
      resolvedAvatarUrl,
      scene
    );

    console.log('[AvatarGLB] Loaded meshes:', result.meshes.length, 'names:', result.meshes.map(m => m.name));
    console.log('[AvatarGLB] Loaded skeletons:', result.skeletons.length);
    console.log('[AvatarGLB] Loaded animation groups:', result.animationGroups.length);

    // Create a single root transform to control position/rotation
    const root = new TransformNode('glb-avatar-root', scene);

    // Parent the model to our container (preserve hierarchy!)
    // We only re-parent the root mesh/node of the imported model.
    // Usually this is result.meshes[0] (__root__).
    if (result.meshes.length > 0) {
      result.meshes[0].setParent(root);
      // OFFSET FIX: Lift the model up if origin is at center instead of feet
      // Adjust this value based on your model's origin point
      result.meshes[0].position.y = 0.6; // Lift up by ~0.6 meter
    } else {
      // Fallback: parent any root-level nodes
      result.transformNodes.forEach(node => {
        if (!node.parent) {
          node.setParent(root);
        }
      });
    }

    // Find the skeleton (avatar models typically have one)
    const skeleton = result.skeletons[0];

    // DEBUG: Log all bone names to diagnose rig compatibility
    if (skeleton) {
      console.log('[AvatarGLB] Skeleton bone names:', skeleton.bones.map(b => b.name));
    }

    // Load animations using the global cache
    // First player: loads GLBs from network and caches them
    // Subsequent players: clones from cache (near-instant, no network)
    const extraAnims: AnimationGroup[] = [];
    if (skeleton) {
      // Load core animations first (Idle + Walk — needed immediately for movement)
      for (const [name, filename] of CORE_ANIMATIONS) {
        const ag = await loadAndCacheAnim(name, filename, scene, skeleton);
        if (ag) extraAnims.push(ag);
      }

      // Load emote animations (from cache if available, otherwise from network)
      // These are loaded sequentially to avoid memory spikes on iOS WKWebView
      for (const [name, filename] of DEFERRED_ANIMATIONS) {
        const ag = await loadAndCacheAnim(name, filename, scene, skeleton);
        if (ag) extraAnims.push(ag);
      }
    }

    // Try to find a head-like mesh or bone
    let head: AbstractMesh | TransformNode | null = null;

    // DEBUG: Log all transform nodes to help diagnose bone naming
    console.log('[AvatarGLB] Transform nodes:', result.transformNodes.map(n => n.name));

    // 1. Try finding a TransformNode with "Head" in name (case-insensitive for Mixamo compatibility)
    // Mixamo uses names like "mixamorig:Head"
    head = result.transformNodes.find(n => /head/i.test(n.name)) || null;

    // 2. If not found, try Neck as fallback
    if (!head) {
      head = result.transformNodes.find(n => /neck/i.test(n.name)) || null;
    }

    // 3. If not found, try via skeleton bones
    if (!head && skeleton) {
      const headBone = skeleton.bones.find((b) => /head/i.test(b.name));
      if (headBone) {
        head = headBone.getTransformNode();
      }
    }

    // 4. Fallback: Create a dummy head node at standard height
    if (!head) {
      console.warn('[AvatarGLB] Head node not found, creating fallback head at height 1.6m');
      const dummyHead = new TransformNode('dummy-head', scene);
      dummyHead.parent = root;
      dummyHead.position = new Vector3(0, 1.6, 0); // Standard head height
      head = dummyHead;
    }

    console.log('[AvatarGLB] Using head:', head.name, 'type:', head.constructor.name);

    // HEAD TILT FIX: Adjust head rotation if it's looking too far down
    // Positive X rotation tilts the head backward (looking up)
    if (head) {
      head.rotation = new Vector3(0.5, 0, 0); // Tilt head up by ~29 degrees
    }

    // Find the built-in screen mesh for video (if avatar has one)
    let screenMesh: AbstractMesh | undefined;
    screenMesh = result.meshes.find(m => {
      const lower = m.name.toLowerCase();
      return lower.includes('screen') || lower.includes('display');
    });
    if (screenMesh) {
      console.log('[AvatarGLB] Found built-in screen mesh:', screenMesh.name);
    }

    // Start at origin
    root.position = new Vector3(0, 0, 0);

    return {
      root,
      head,
      screenMesh,
      skeleton,
      animationGroups: [...result.animationGroups, ...extraAnims],
    };
  } catch (error) {
    console.error('[AvatarGLB] Failed to load avatar from URL:', avatarUrl, error);
    throw error;
  }
}
