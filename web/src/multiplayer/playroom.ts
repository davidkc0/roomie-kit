// Lazy load playroomkit to avoid initialization errors at module load time
let playroomkit: typeof import('playroomkit') | null = null;

const getPlayroomkit = async () => {
  if (!playroomkit) {
    playroomkit = await import('playroomkit');
  }
  return playroomkit;
};

export type PlayerState = {
  pos: { x: number; y: number; z: number };
  rotY: number;
  anim: string;
  head: { q: [number, number, number, number] };
  blend: Record<string, number>;
  avatarUrl?: string;
  avatarImg?: string;
  avatarConfig?: {
    gender: 'male' | 'female';
    skinTone: string;
    outfit: string;
    feet: string;
    hairColor: string;
    hair: string;
    costume?: string;
  };
  withVoiceChat?: boolean;
  tvHeadEnabled?: boolean;
  agoraVideoUid?: number | string;
  inCall?: boolean; // True when user is in a 1v1 video call
  isStreaming?: boolean; // True when user is actively streaming in theater
  isPlayingGame?: boolean; // True when user is playing a mini-game (chess, snake)
  isMuted?: boolean; // True when user has muted their microphone
  isSpeaking?: boolean; // True when user is currently speaking (audio level > threshold)
  personalRoomStreamActive?: boolean; // True when personal room owner has video call active
  hexConfirmed?: boolean; // True when player has tapped "Join" in Hex Arena lobby
  isLoading?: boolean; // True while avatar is still loading — player is invisible to others
  // Profile Data
  profile?: {
    name: string;
    photo: string;
    bio?: string;
    username?: string;
    id?: string;
    friends_count?: number;
  };
  emote?: {
    type: string;
    timestamp: number;
  };
};

export type WorldState = {
  players: Record<string, PlayerState>;
};

const PLAYER_STATE_KEY = 'playState';

let MY_ID: string | null = null;
let ROOM_CODE_IN_USE = 'plaza';
let lastWriteAt = 0;

// Connection guard: prevent disconnect/reconnect cycling
let isConnected = false;
let connectedRoomCode: string | null = null;
let pendingDisconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function roomCodeFromSlug(slug?: string) {
  // Deterministic, simple mapping
  return (slug?.trim()?.toLowerCase() || 'plaza').replace(/[^a-z0-9_-]/g, '-');
}

function assertSameRoom(nextCode: string) {
  const currentCode = getRoomCodeInUse();
  if (currentCode !== nextCode) {
    console.error(
      `[playroom] Room code mismatch: expected ${nextCode}, but getRoomCodeInUse() returned ${currentCode}. This may indicate a connection issue.`
    );
  }
  ROOM_CODE_IN_USE = nextCode;
}

function defaultPlayer(): PlayerState {
  return {
    pos: { x: 0, y: 0, z: 0 },
    rotY: 0,
    anim: 'idle',
    head: { q: [0, 0, 0, 1] },
    blend: {},
  };
}

export async function connectToRoom(
  slugOrCode?: string
): Promise<{ myId: string; roomCode: string }> {
  const nextCode = roomCodeFromSlug(slugOrCode);

  // Cancel any pending disconnect — we're reconnecting to the same room
  if (pendingDisconnectTimer) {
    clearTimeout(pendingDisconnectTimer);
    pendingDisconnectTimer = null;
    console.info('[connectToRoom] Cancelled pending disconnect');
  }

  // If already connected to the same room, return existing connection
  if (isConnected && connectedRoomCode === nextCode && MY_ID) {
    console.info('[connectToRoom] Already connected to', nextCode, 'as', MY_ID, '— reusing');
    ROOM_CODE_IN_USE = nextCode;
    return { myId: MY_ID, roomCode: ROOM_CODE_IN_USE };
  }

  console.info('[connectToRoom] Starting connection...', slugOrCode);

  const pk = await getPlayroomkit();
  console.info('[connectToRoom] Playroomkit loaded');

  console.info('[connectToRoom] Room code:', nextCode);

  // Set room code before connecting so getRoomCodeInUse() returns correct value
  ROOM_CODE_IN_USE = nextCode;

  // Await the Playroom join (skip React-17 lobby)
  console.info('[connectToRoom] Calling insertCoin...');
  try {
    await pk.insertCoin({ skipLobby: true, roomCode: nextCode });
    console.info('[connectToRoom] insertCoin completed');
  } catch (error) {
    console.error('[connectToRoom] insertCoin failed:', error);
    throw error;
  }

  assertSameRoom(nextCode);
  console.info('[connectToRoom] joined', ROOM_CODE_IN_USE);

  const me = pk.myPlayer();
  console.info('[connectToRoom] myPlayer.id', me?.id);

  if (!me?.id) {
    throw new Error(
      'Playroom did not return myPlayer().id — ensure insertCoin awaited and roomCode stable.'
    );
  }
  MY_ID = me.id;
  isConnected = true;
  connectedRoomCode = nextCode;

  const player = pk.myPlayer();
  if (player) {
    const existing = (player.getState(PLAYER_STATE_KEY) as PlayerState) ?? defaultPlayer();
    player.setState(PLAYER_STATE_KEY, existing, true);
    console.info('[connectToRoom] initialized state for', MY_ID);
  }

  return { myId: MY_ID, roomCode: ROOM_CODE_IN_USE };
}

export function getMyId() {
  return MY_ID;
}

export function getRoomCodeInUse() {
  return ROOM_CODE_IN_USE;
}

export function getLastWriteAt() {
  return lastWriteAt;
}

export function subscribeState(cb: (s: WorldState) => void): () => void {
  let disposed = false;

  // Quit grace period: keep disappeared players for 3s before removing them.
  // This absorbs transient Playroom WebSocket disconnects (iOS backgrounding, network blips).
  const QUIT_GRACE_MS = 8000;
  const quitTimers = new Map<string, ReturnType<typeof setTimeout>>();
  // Stash the last known state for players in the grace period
  const gracedPlayers = new Map<string, PlayerState>();

  // Wrapper that detects disappearing players and starts grace timers
  let previousPlayerIds = new Set<string>();
  let previousPlayerStates: Record<string, PlayerState> = {};

  const rebuildWorldWithGrace = async () => {
    if (!navigator.onLine) return;

    const pk = await getPlayroomkit();
    const participantsRecord = pk.getParticipants
      ? pk.getParticipants()
      : {};
    const participants = Object.values(
      participantsRecord as Record<string, any>
    );

    const livePlayers: Record<string, PlayerState> = {};

    participants.forEach((player) => {
      const stored = player.getState(PLAYER_STATE_KEY) as PlayerState | null;
      if (stored) {
        livePlayers[player.id] = stored;
      }
    });

    // Include self even if not in participants yet
    const me = pk.myPlayer();
    if (me && !livePlayers[me.id]) {
      const stored = me.getState(PLAYER_STATE_KEY) as PlayerState | null;
      if (stored) {
        livePlayers[me.id] = stored;
      }
    }

    const currentIds = new Set(Object.keys(livePlayers));

    // Detect players that just disappeared
    for (const id of previousPlayerIds) {
      if (!currentIds.has(id) && !gracedPlayers.has(id)) {
        // Player just disappeared — start grace period
        const lastState = previousPlayerStates[id];
        if (lastState) {
          gracedPlayers.set(id, lastState);
          console.log('[playroom] Player', id, 'disappeared — starting', QUIT_GRACE_MS, 'ms grace');
          const timer = setTimeout(() => {
            // Grace period expired — truly remove the player
            quitTimers.delete(id);
            gracedPlayers.delete(id);
            console.log('[playroom] Player', id, 'grace expired — removing');
            // Trigger a rebuild to propagate the removal
            if (!disposed) {
              rebuildWorldWithGrace();
            }
          }, QUIT_GRACE_MS);
          quitTimers.set(id, timer);
        }
      }
    }

    // Cancel grace timers for players that came back
    for (const [id] of gracedPlayers) {
      if (currentIds.has(id)) {
        const timer = quitTimers.get(id);
        if (timer) {
          clearTimeout(timer);
          quitTimers.delete(id);
          console.log('[playroom] Player', id, 'returned within grace — cancel quit');
        }
        gracedPlayers.delete(id);
      }
    }

    // Build final state: live + graced
    const mergedPlayers: Record<string, PlayerState> = { ...livePlayers };
    for (const [id, state] of gracedPlayers) {
      if (!mergedPlayers[id]) {
        mergedPlayers[id] = state;
      }
    }

    // Update tracking for next diff
    previousPlayerIds = currentIds;
    previousPlayerStates = { ...livePlayers };

    if (!disposed) {
      cb({ players: mergedPlayers });
    }
  };

  let intervalId: ReturnType<typeof setInterval> | null = null;
  let unsubscribeJoin: (() => void) | null = null;

  getPlayroomkit()
    .then((pk) => {
      rebuildWorldWithGrace();
      intervalId = setInterval(rebuildWorldWithGrace, 200);
      unsubscribeJoin =
        pk.onPlayerJoin?.((player) => {
          rebuildWorldWithGrace();
          player.onQuit?.(() => rebuildWorldWithGrace());
        }) ?? null;
    })
    .catch((error) => {
      console.error('[playroom] Failed to subscribe to state', error);
    });

  return () => {
    disposed = true;
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (unsubscribeJoin) {
      unsubscribeJoin();
      unsubscribeJoin = null;
    }
    // Clear all grace timers
    for (const [, timer] of quitTimers) {
      clearTimeout(timer);
    }
    quitTimers.clear();
    gracedPlayers.clear();
  };
}

export async function writeMyState(partial: Partial<PlayerState>, reliable = false) {
  // Don't write to Playroom when offline - prevents SDK errors
  if (!navigator.onLine) return;

  const pk = await getPlayroomkit();
  const player = pk.myPlayer();
  if (!player) return;

  const current =
    (player.getState(PLAYER_STATE_KEY) as PlayerState) ?? defaultPlayer();

  const merged: PlayerState = {
    ...current,
    ...partial,
    blend:
      partial.blend && current.blend
        ? { ...current.blend, ...partial.blend }
        : partial.blend ?? current.blend,
  };

  player.setState(PLAYER_STATE_KEY, merged, reliable);
  lastWriteAt = Date.now();
}

// Helper for updating specific fields (used by VoiceChat)
export async function updateMyNode(updater: (state: PlayerState) => PlayerState, reliable = true) {
  // Don't update Playroom when offline - prevents SDK errors
  if (!navigator.onLine) return;

  const pk = await getPlayroomkit();
  const player = pk.myPlayer();
  if (!player) return;

  const current =
    (player.getState(PLAYER_STATE_KEY) as PlayerState) ?? defaultPlayer();
  const updated = updater(current);

  player.setState(PLAYER_STATE_KEY, updated, reliable);
  lastWriteAt = Date.now();
}

export async function disconnectFromRoom() {
  // Debounced disconnect: delay the actual state clearing by 1s.
  // If connectToRoom is called within that window (e.g. React effect re-mount),
  // the disconnect is cancelled and the player stays connected seamlessly.
  return new Promise<void>((resolve) => {
    if (pendingDisconnectTimer) {
      clearTimeout(pendingDisconnectTimer);
    }

    pendingDisconnectTimer = setTimeout(async () => {
      pendingDisconnectTimer = null;
      console.log('[playroom] Executing debounced disconnect');

      try {
        const pk = await getPlayroomkit();
        const player = pk.myPlayer();

        if (player) {
          player.setState(PLAYER_STATE_KEY, null, true);
          console.log('[playroom] Cleared player state before disconnect');
        }
      } catch (error) {
        console.error('[playroom] Error clearing state on disconnect:', error);
      }

      MY_ID = null;
      ROOM_CODE_IN_USE = 'plaza';
      lastWriteAt = 0;
      isConnected = false;
      connectedRoomCode = null;
      resolve();
    }, 1000); // 1s debounce window
  });
}

/**
 * Immediate disconnect for iOS SPA navigation (no debounce).
 * Nulls the PlayroomKit module reference so it gets re-imported fresh
 * on the next connectToRoom() call — this resets PlayroomKit's internal
 * state, allowing insertCoin() to work again without a full page reload.
 */
export function forceDisconnect() {
  // Cancel any pending debounced disconnect
  if (pendingDisconnectTimer) {
    clearTimeout(pendingDisconnectTimer);
    pendingDisconnectTimer = null;
  }

  // Clear all module-level state
  MY_ID = null;
  ROOM_CODE_IN_USE = 'plaza';
  lastWriteAt = 0;
  isConnected = false;
  connectedRoomCode = null;

  // CRITICAL: Null the module reference so it gets re-imported fresh
  // next time connectToRoom is called. This resets PlayroomKit's internal
  // state, allowing insertCoin() to work again without a page reload.
  playroomkit = null;

  console.log('[playroom] Force disconnected — module will re-import on next connect');
}

// RPC Wrappers for Chat
// @ts-ignore - RPC types might need assertion or newer playroomkit version
export async function registerRpc(name: string, callback: (data: any, sender: { id: string, profile?: any }) => void) {
  const pk = await getPlayroomkit();
  // @ts-ignore
  return pk.RPC.register(name, callback);
}

// @ts-ignore
export async function callRpc(name: string, data: any) {
  // Don't call RPC when offline - prevents SDK errors
  if (!navigator.onLine) return;

  const pk = await getPlayroomkit();
  // @ts-ignore
  pk.RPC.call(name, data, pk.RPC.Mode.ALL);
}

