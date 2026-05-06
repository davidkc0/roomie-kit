// Lazy load playroomkit to avoid initialization errors at module load time
let playroomkit: typeof import('playroomkit') | null = null;

import { supabase } from '../lib/supabase';

const getPlayroomkit = async () => {
  if (!playroomkit) {
    playroomkit = await import('playroomkit');
  }
  return playroomkit;
};

export type DrawingStroke = {
  id: string;
  points: Array<{ x: number; y: number }>; // Normalized 0-1 coordinates
  color: string;
  lineWidth: number;
  timestamp: number;
  playerId: string;
};

export type WhiteboardState = {
  strokes: DrawingStroke[];
  version: number;
};

const getWhiteboardStateKey = (roomKey: string = '') => {
  return roomKey ? `whiteboard_${roomKey}` : 'whiteboard';
};
const getPersistenceKey = (roomKey: string = '') => {
  return roomKey ? `whiteboard_${roomKey}` : 'whiteboard';
};
const SAVE_INTERVAL_MS = 30000; // Save every 30 seconds
const SAVE_STROKE_COUNT = 10; // Or every 10 strokes

let strokeCountSinceSave = 0;
let lastSaveTime = Date.now();
let saveTimeoutId: ReturnType<typeof setTimeout> | null = null;

// Mutex: serialize broadcastStroke calls to prevent race conditions
let broadcastQueue: Promise<void> = Promise.resolve();

// Get current whiteboard state from Playroomkit
async function getWhiteboardState(roomKey?: string): Promise<WhiteboardState> {
  try {
    const pk = await getPlayroomkit();
    // getState is a standalone function, not a method
    const getState = (pk as any).getState;
    if (typeof getState === 'function') {
      const key = getWhiteboardStateKey(roomKey);
      const state = getState(key) as WhiteboardState | null;
      if (state) {
        return state;
      }
    }
  } catch (error) {
    console.error('[whiteboardSync] Error getting state', error);
  }
  return {
    strokes: [],
    version: 0,
  };
}

// Public export for components that need to read the current state (e.g. undo/clear redraw)
export const getWhiteboardStatePublic = getWhiteboardState;

// Set whiteboard state in Playroomkit
async function setWhiteboardState(state: WhiteboardState, roomKey?: string): Promise<void> {
  try {
    // Guard: Don't set state when offline
    if (!navigator.onLine) return;

    const pk = await getPlayroomkit();
    // setState is a standalone function, not a method
    const setState = (pk as any).setState;
    if (typeof setState === 'function') {
      console.log('[whiteboardSync] Calling setState with', state.strokes.length, 'strokes, version', state.version);

      const key = getWhiteboardStateKey(roomKey);

      // Check if we're the host (only host can set global state by default)
      const isHost = (pk as any).isHost || (pk as any).isRenderServer?.() || false;
      const letEveryoneWrite = (pk as any).letEveryoneWriteState || false;
      console.log('[whiteboardSync] Host status:', { isHost, letEveryoneWrite });

      setState(key, state, true); // reliable = true
      console.log('[whiteboardSync] setState called successfully for key:', key);

      // Verify state was set (with a small delay to allow async processing)
      setTimeout(async () => {
        const getState = (pk as any).getState;
        if (typeof getState === 'function') {
          const verifyState = getState(key) as WhiteboardState | null;
          if (verifyState) {
            const matches = verifyState.version === state.version && verifyState.strokes.length === state.strokes.length;
            console.log('[whiteboardSync] Verified state set:', {
              matches,
              expected: { strokes: state.strokes.length, version: state.version },
              actual: { strokes: verifyState.strokes.length, version: verifyState.version }
            });
          } else {
            console.warn('[whiteboardSync] State verification failed - state not found after setState');
          }
        }
      }, 100);
    } else {
      console.warn('[whiteboardSync] setState not available on playroomkit');
    }
  } catch (error) {
    console.error('[whiteboardSync] Error setting state', error);
  }
}

// Save to persistent storage (Supabase)
async function saveToPersistence(state: WhiteboardState, roomKey?: string): Promise<void> {
  try {
    // Guard: Don't save when offline
    if (!navigator.onLine) return;

    const key = getPersistenceKey(roomKey);

    const { error } = await supabase
      .from('whiteboard_data')
      .upsert({
        room_id: key,
        strokes: state.strokes,
        version: state.version,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'room_id' });

    if (error) {
      console.error('[whiteboardSync] Supabase save error:', error);
    } else {
      console.log('[whiteboardSync] Saved to Supabase', {
        key,
        strokeCount: state.strokes.length,
      });
    }
  } catch (error) {
    console.error('[whiteboardSync] Failed to save to persistence', error);
  }
}

// Schedule a save (debounced)
function scheduleSave(state: WhiteboardState, roomKey?: string): void {
  strokeCountSinceSave++;
  const shouldSave =
    strokeCountSinceSave >= SAVE_STROKE_COUNT ||
    Date.now() - lastSaveTime >= SAVE_INTERVAL_MS;

  if (shouldSave) {
    if (saveTimeoutId) {
      clearTimeout(saveTimeoutId);
    }

    saveTimeoutId = setTimeout(() => {
      saveToPersistence(state, roomKey).then(() => {
        strokeCountSinceSave = 0;
        lastSaveTime = Date.now();
        saveTimeoutId = null;
      });
    }, 1000); // Debounce by 1 second
  }
}

// Subscribe to whiteboard state changes
export function subscribeWhiteboardState(
  callback: (state: WhiteboardState) => void,
  roomKey?: string
): () => void {
  let disposed = false;
  const stateKey = getWhiteboardStateKey(roomKey);

  const setupSubscription = async () => {
    const pk = await getPlayroomkit();

    // Load persisted data from Supabase (with 24h TTL check)
    try {
      const persistKey = getPersistenceKey(roomKey);
      const { data: persisted, error } = await supabase
        .from('whiteboard_data')
        .select('strokes, version, updated_at')
        .eq('room_id', persistKey)
        .single();

      if (!error && persisted && !disposed) {
        // Check if data is within 24-hour TTL
        const updatedAt = new Date(persisted.updated_at).getTime();
        const ageMs = Date.now() - updatedAt;
        const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

        if (ageMs < TTL_MS && Array.isArray(persisted.strokes) && persisted.strokes.length > 0) {
          console.log('[whiteboardSync] Loaded persisted data from Supabase', {
            strokeCount: persisted.strokes.length,
            ageMinutes: Math.round(ageMs / 60000),
          });

          const persistedState: WhiteboardState = {
            strokes: persisted.strokes as DrawingStroke[],
            version: persisted.version || 0,
          };

          // Set Playroom state from persisted data
          await setWhiteboardState(persistedState, roomKey);
        } else {
          console.log('[whiteboardSync] Persisted data expired or empty, starting fresh');
        }
      }
    } catch (error) {
      console.error('[whiteboardSync] Failed to load persisted data from Supabase', error);
    }

    // Initial load (may now include persisted data)
    const initialState = await getWhiteboardState(roomKey);
    let lastKnownVersion = initialState.version;
    let lastKnownStrokeCount = initialState.strokes.length;

    if (!disposed) {
      console.log('[whiteboardSync] Initial state loaded:', initialState.strokes.length, 'strokes, version', initialState.version);
      callback(initialState);
    }

    // Subscribe to state changes
    let unsubscribe: (() => void) | null = null;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    // Helper to check and update state
    const checkState = async () => {
      if (disposed) return;
      if (!navigator.onLine) return; // Guard polling loop
      try {
        const currentState = await getWhiteboardState(roomKey);
        // Check if state actually changed (version or stroke count)
        const stateChanged =
          currentState.version !== lastKnownVersion ||
          currentState.strokes.length !== lastKnownStrokeCount;

        if (stateChanged) {
          console.log('[whiteboardSync] State changed detected:', {
            oldVersion: lastKnownVersion,
            newVersion: currentState.version,
            oldStrokes: lastKnownStrokeCount,
            newStrokes: currentState.strokes.length
          });
          lastKnownVersion = currentState.version;
          lastKnownStrokeCount = currentState.strokes.length;
          callback(currentState);
        }
      } catch (error) {
        console.error('[whiteboardSync] Error checking state', error);
      }
    };

    if (typeof pk.on === 'function') {
      console.log('[whiteboardSync] Setting up state event listener');
      const eventUnsubscribe = pk.on('state', (state: any, key: string) => {
        // console.log('[whiteboardSync] State event received', { key, hasState: !!state });
        if (key === stateKey && !disposed) {
          // Check state immediately when event fires
          checkState();
        }
      });
      // console.log('[whiteboardSync] State event listener registered');

      // Also set up polling as a fallback (check every 500ms)
      // This ensures we catch state changes even if events don't fire
      pollInterval = setInterval(() => {
        if (disposed) {
          if (pollInterval) clearInterval(pollInterval);
          return;
        }
        checkState();
      }, 500);

      unsubscribe = () => {
        if (eventUnsubscribe) eventUnsubscribe();
        if (pollInterval) clearInterval(pollInterval);
      };
    } else {
      // Fallback: just poll
      pollInterval = setInterval(() => {
        if (disposed) {
          if (pollInterval) clearInterval(pollInterval);
          return;
        }
        checkState();
      }, 500);

      unsubscribe = () => {
        if (pollInterval) clearInterval(pollInterval);
      };
    }

    return () => {
      disposed = true;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  };

  let unsubscribeFn: (() => void) | null = null;

  setupSubscription().then((unsubscribe) => {
    if (!disposed) {
      unsubscribeFn = unsubscribe;
    }
  });

  return () => {
    disposed = true;
    if (unsubscribeFn) {
      unsubscribeFn();
    }
    if (saveTimeoutId) {
      clearTimeout(saveTimeoutId);
      saveTimeoutId = null;
    }
  };
}

// Broadcast a new stroke to all users (serialized via queue to prevent race conditions)
export function broadcastStroke(stroke: DrawingStroke, roomKey?: string): Promise<void> {
  broadcastQueue = broadcastQueue.then(async () => {
    try {
      console.log('[whiteboardSync] Broadcasting stroke', { id: stroke.id, pointCount: stroke.points.length, roomKey });

      const currentState = await getWhiteboardState(roomKey);

      // Check if stroke already exists (prevent duplicates)
      const strokeExists = currentState.strokes.some((s) => s.id === stroke.id);
      if (strokeExists) {
        console.log('[whiteboardSync] Stroke already exists, skipping', stroke.id);
        return;
      }

      // Add new stroke
      const updatedState: WhiteboardState = {
        strokes: [...currentState.strokes, stroke],
        version: currentState.version + 1,
      };

      // Update state
      await setWhiteboardState(updatedState, roomKey);

      // Schedule persistence save
      scheduleSave(updatedState, roomKey);

      console.log('[whiteboardSync] ✅ Broadcasted stroke', {
        id: stroke.id,
        totalStrokes: updatedState.strokes.length,
        version: updatedState.version,
      });
    } catch (error) {
      console.error('[whiteboardSync] Failed to broadcast stroke', error);
    }
  }).catch((err) => {
    console.error('[whiteboardSync] Queue error in broadcastStroke', err);
  });
  return broadcastQueue;
}

// Force an immediate save to Supabase (call on Done)
export async function forceSaveNow(roomKey?: string): Promise<void> {
  // Wait for any pending broadcasts to complete
  await broadcastQueue;

  // Cancel any pending debounced save
  if (saveTimeoutId) {
    clearTimeout(saveTimeoutId);
    saveTimeoutId = null;
  }

  const currentState = await getWhiteboardState(roomKey);
  if (currentState.strokes.length > 0) {
    await saveToPersistence(currentState, roomKey);
    strokeCountSinceSave = 0;
    lastSaveTime = Date.now();
    console.log('[whiteboardSync] ✅ Forced save complete');
  }
}

// Undo the last stroke (by any player — caller should filter by playerId if needed)
export async function undoLastStroke(roomKey?: string, playerId?: string): Promise<void> {
  await broadcastQueue;

  const currentState = await getWhiteboardState(roomKey);
  if (currentState.strokes.length === 0) return;

  let strokesToKeep: DrawingStroke[];
  if (playerId) {
    // Remove only the last stroke by this player
    const lastIdx = currentState.strokes.map(s => s.playerId).lastIndexOf(playerId);
    if (lastIdx === -1) return;
    strokesToKeep = currentState.strokes.filter((_, i) => i !== lastIdx);
  } else {
    // Remove the absolute last stroke
    strokesToKeep = currentState.strokes.slice(0, -1);
  }

  const updatedState: WhiteboardState = {
    strokes: strokesToKeep,
    version: currentState.version + 1,
  };

  await setWhiteboardState(updatedState, roomKey);
  scheduleSave(updatedState, roomKey);
  console.log('[whiteboardSync] Undo: removed last stroke, now', updatedState.strokes.length, 'strokes');
}

// Clear all strokes by a specific player (current session clear)
export async function clearMyStrokes(roomKey?: string, playerId?: string): Promise<void> {
  await broadcastQueue;

  const currentState = await getWhiteboardState(roomKey);
  if (currentState.strokes.length === 0) return;

  let strokesToKeep: DrawingStroke[];
  if (playerId) {
    // Keep only strokes from other players
    strokesToKeep = currentState.strokes.filter(s => s.playerId !== playerId);
  } else {
    // Clear everything
    strokesToKeep = [];
  }

  const updatedState: WhiteboardState = {
    strokes: strokesToKeep,
    version: currentState.version + 1,
  };

  await setWhiteboardState(updatedState, roomKey);
  scheduleSave(updatedState, roomKey);
  console.log('[whiteboardSync] Clear: removed strokes, now', updatedState.strokes.length, 'strokes');
}

// Replay all strokes on a canvas context
export function replayStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: DrawingStroke[],
  textureWidth: number,
  textureHeight: number
): void {
  strokes.forEach((stroke) => {
    if (stroke.points.length === 0) return;

    ctx.beginPath();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const firstPoint = stroke.points[0];
    ctx.moveTo(
      firstPoint.x * textureWidth,
      firstPoint.y * textureHeight
    );

    for (let i = 1; i < stroke.points.length; i++) {
      const point = stroke.points[i];
      ctx.lineTo(point.x * textureWidth, point.y * textureHeight);
    }

    ctx.stroke();
  });
}



