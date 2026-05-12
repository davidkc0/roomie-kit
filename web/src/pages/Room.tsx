import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { Avatar } from '../world/Avatar';
import { supabase } from '../lib/supabase';
import { SceneRoot, useScene } from '../world/scene';
import { Walls } from '../world/Walls';
import { Whiteboard } from '../world/Whiteboard';
import { WhiteboardCanvas } from '../components/WhiteboardCanvas';
import { ArcadeButton } from '../world/ArcadeButton';
import { SnakeGameCanvas } from '../games/snake/SnakeGameCanvas';
import { Furniture } from '../world/Furniture';
import { GLBEnvironment } from '../world/GLBEnvironment';
import { CollisionBox } from '../world/CollisionBox';
import { HexArenaRoom, HexPracticeRoom } from '../games/hexagone';
import { getRoomDefinition } from '../config/rooms';
import { defaultAvatarUrl } from '../config/app';
import { brandAssetUrls } from '../config/customization';
import { resolveAssetUrl } from '../config/r2';
import { Vector3, TransformNode } from '@babylonjs/core';
import { AbstractMesh, DynamicTexture } from '@babylonjs/core';
import { useAuthStore } from '../state/authStore';
import { PlayerController } from '../state/PlayerController';
import {
  connectToRoom,
  disconnectFromRoom,
  subscribeState,
  writeMyState, // Added for profile sync
  type WorldState,
  type PlayerState,
} from '../multiplayer/playroom';
import { startHeartbeat, stopHeartbeat } from '../multiplayer/netloop';
import { useKeyboardMovement, useJoystickMovement, type MovementInput } from '../state/movement';
import { VoiceChat } from '../components/VoiceChat';
import { Joystick } from '../components/Joystick';
import { ControlsTutorialOverlay } from '../components/ControlsTutorialOverlay';
import { getMyId } from '../multiplayer/playroom'; // Removed registerRpc, callRpc from usage here
import { subscribeLeaderboard, submitScore, type LeaderboardState } from '../multiplayer/gameSync';
import { AvatarProfileModal } from '../components/AvatarProfileModal';
import { ChatOverlay } from '../components/Chat/ChatOverlay';
import { EmoteDrawer } from '../components/EmoteDrawer';
import { useVideoCallStore } from '../state/videoCallStore';
import { useVideoStore } from '../state/videoStore';
import { useVoiceChatStore } from '../state/voiceChatStore';
import { CoinBalanceButton } from '../components/CoinBalanceButton';
import { useStreamingStore } from '../state/streamingStore';
import { StreamerUI, ViewerUI, TheaterScreen, PersonalRoomStreamOverlay } from '../components/streaming';
import { useRoomStore } from '../state/roomStore';
import { PersonalRoomScene } from '../world/personal/PersonalRoomScene';
import { EditControls } from '../world/personal/EditControls';
import { trackRoomPresence, getRoomUserCount } from '../hooks/useRoomPresence';
import { PERSONAL_ROOM_MAX_USERS } from '../config/roomLimits';
import { ActionButton } from '../components/ActionButton';
import { ChessGameCanvas } from '../games/chess/ChessGameCanvas';
import { PlayerActivityFeed } from '../components/PlayerActivityFeed';
import { useChessStore } from '../state/chessStore';
import { useSnakeStore } from '../state/snakeStore';
import { useMatch3Store } from '../state/match3Store';
import { Match3GameCanvas } from '../games/match3/Match3GameCanvas';
import { DisconnectModal } from '../components/DisconnectModal';
import { PlayerListDrawer } from '../components/PlayerListDrawer';
import { useOrientationLock } from '../hooks/useOrientationLock';
import { useCameraPrefsStore } from '../state/cameraPrefsStore';
import { notifyRoomVisit } from '../lib/pushNotify';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { DEFAULT_AVATAR_CONFIG } from '../avatars/avatarTextures';


import '../utils/helpers'; // Import to ensure hashCode is available

type LocalUiState = {
  cameraOn: boolean;
  drawingMode: boolean;
  gameMode: boolean;
};

// Get initial camera state from persisted store (defaults to true if not set)
const getInitialCameraState = () => useCameraPrefsStore.getState().cameraOn;

const initialUi: LocalUiState = { cameraOn: true, drawingMode: false, gameMode: false };

// CRITICAL: Module-level flag that persists across component remounts
// This survives React errors that might cause the component to unmount/remount
let DISCONNECTED_FLAG = false;

// DIAGNOSTIC: Log when page is about to unload to help debug forced reload issues
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (event) => {
    console.warn('[Room] ⚠️ PAGE UNLOADING - Stack trace:', new Error().stack);
    console.warn('[Room] Current URL:', window.location.href);
    console.warn('[Room] Event returnValue:', event.returnValue);
  });
}

function Room() {
  const { slug } = useParams<{ slug: string }>();
  return <RoomShell slug={slug} />;
}

type RoomShellProps = {
  slug?: string;
};

function RoomShell({ slug }: RoomShellProps) {
  // Check the persistent flag FIRST - if we've been disconnected, show modal immediately
  // This check happens before ANY other code runs
  const [isDisconnected, setIsDisconnected] = useState(DISCONNECTED_FLAG);

  // Allow landscape orientation in Room (unlock)
  useOrientationLock(false);

  useEffect(() => {
    let listenerHandle: any = null;

    const setupNetworkListener = async () => {
      try {
        const { Network } = await import('@capacitor/network');

        // Check initial state
        const status = await Network.getStatus();
        if (!status.connected) {
          DISCONNECTED_FLAG = true; // Set persistent flag
          setIsDisconnected(true);
        }

        // Listen for changes - this works on iOS unlike browser events
        listenerHandle = await Network.addListener('networkStatusChange', (status) => {
          console.log('[Room] Network status changed:', status);
          if (!status.connected) {
            DISCONNECTED_FLAG = true; // Set persistent flag
            setIsDisconnected(true);
          }
          // Note: Don't reset flag - sticky state, user must reload
        });
      } catch (err) {
        console.error('[Room] Failed to setup network listener:', err);
        // Fallback to browser events for web
        const handleOffline = () => {
          DISCONNECTED_FLAG = true;
          setIsDisconnected(true);
        };
        window.addEventListener('offline', handleOffline);
        if (!navigator.onLine) {
          DISCONNECTED_FLAG = true;
          setIsDisconnected(true);
        }
      }
    };

    setupNetworkListener();

    return () => {
      if (listenerHandle?.remove) {
        listenerHandle.remove();
      }
    };
  }, []);

  // If disconnected (either from state or persistent flag), show modal immediately
  if (isDisconnected || DISCONNECTED_FLAG) {
    return <DisconnectModal isOpen={true} />;
  }

  // Check if this is a special game room before mounting the main room experience.
  if (slug === 'hex') {
    return <HexArenaRoom slug={slug} />;
  }

  if (slug === 'hex-practice') {
    return <HexPracticeRoom />;
  }

  return <RoomMain slug={slug} />;
}

type RoomMainProps = {
  slug?: string;
};

function RoomMain({ slug }: RoomMainProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [world, setWorld] = useState<WorldState>({ players: {} });
  const [myId, setMyId] = useState<string>('none');
  const [roomCode, setRoomCode] = useState<string>('');
  const [customSpawnPoint, setCustomSpawnPoint] = useState<Vector3 | null>(null);

  // Check if this is the lounge room
  const roomConfig = useMemo(() => getRoomDefinition(slug), [slug]);
  const isCustomRoom = roomConfig.type === 'custom-glb';
  const isTheater = slug === 'theater' || slug === 'theater2';
  const isPersonalRoom = slug && !['lounge', 'theater', 'theater2', 'default', 'hex'].includes(slug);




  const { fetchPersonalRoom } = useRoomStore();
  const [personalRoomData, setPersonalRoomData] = useState<any>(null);
  const [roomFull, setRoomFull] = useState(false);
  const [showDescriptionModal, setShowDescriptionModal] = useState(false);
  const [editDescription, setEditDescription] = useState('');
  const [savingDescription, setSavingDescription] = useState(false);

  useEffect(() => {
    if (isPersonalRoom && slug) {
      console.log('[Room] Fetching personal room data for:', slug);
      fetchPersonalRoom(slug).then((data) => {
        if (data) {
          console.log('[Room] Loaded personal room:', data.name);
          setPersonalRoomData(data);
        }
      });
    }
  }, [slug, isPersonalRoom, fetchPersonalRoom]);

  // Keep refs in sync for use in callbacks
  useEffect(() => {
    personalRoomDataRef.current = personalRoomData;
  }, [personalRoomData]);

  useEffect(() => {
    isPersonalRoomRef.current = !!isPersonalRoom;
  }, [isPersonalRoom]);

  // Dedicated effect for room visit notification - fires when data is ready
  useEffect(() => {
    // Only notify once per room visit
    if (roomVisitNotificationSentRef.current) return;

    const userId = useAuthStore.getState().user?.id;
    if (!userId || !personalRoomData?.owner_id || !myId || myId === 'none') return;

    // Don't notify if visiting your own room
    if (personalRoomData.owner_id === userId) return;

    // Mark as sent to prevent duplicates
    roomVisitNotificationSentRef.current = true;

    const visitorName = useAuthStore.getState().profile?.username || 'Someone';
    console.log('[Room] Sending room visit notification to:', personalRoomData.owner_id);
    notifyRoomVisit(personalRoomData.owner_id, visitorName, slug || '')
      .then((sent) => console.log('[Room] Room visit notification sent:', sent))
      .catch((err) => console.error('[Room] Failed to send room visit notification:', err));

    // Reset on unmount so notification can trigger on re-entry
    return () => {
      roomVisitNotificationSentRef.current = false;
    };
  }, [personalRoomData, myId, slug]);

  // Streaming store (for theater rooms and personal room stream mode)
  const {
    currentStreamerId,
    initForRoom,
    optIn,
    castVote,
    acceptStream,
    declineStream,
    sendGift,
    toggleCamera: toggleStreamCamera,
    facingMode,
    // Personal room stream mode
    personalRoomMode,
    setPersonalRoomMode,
    initPersonalRoomOwner,
  } = useStreamingStore();

  const { remoteVideos } = useVideoStore();

  // Initialize streaming store when entering theater
  useEffect(() => {
    if (isTheater && slug) {
      initForRoom(slug);
    }
  }, [isTheater, slug, initForRoom]);

  // Initialize personal room stream mode owner
  useEffect(() => {
    if (isPersonalRoom && personalRoomData?.owner_id && slug) {
      initForRoom(slug);
      initPersonalRoomOwner(personalRoomData.owner_id);
    }
  }, [isPersonalRoom, personalRoomData?.owner_id, slug, initForRoom, initPersonalRoomOwner]);

  const [ui, setUi] = useState<LocalUiState>(() => ({
    ...initialUi,
    cameraOn: getInitialCameraState(), // Initialize from persisted preference
  }));
  const [isConnecting, setIsConnecting] = useState(true);
  const [sceneReady, setSceneReady] = useState(false); // Defers VoiceChat until scene has loaded
  const [avatarLoaded, setAvatarLoaded] = useState(false); // True when local avatar's isLoading → false
  const voiceChatJoined = useVoiceChatStore(s => s.joined);
  // CRITICAL: One-shot latch — once the room is fully loaded, NEVER show the loading overlay again.
  // The old `avatarLoaded && voiceChatJoined` was volatile because VoiceChat cleanup resets
  // joined=false on unmount, which caused the fullscreen loading overlay to reappear mid-session.
  const [roomFullyReady, setRoomFullyReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const worldRef = useRef(world);
  const worldStateRef = useRef<WorldState>({ players: {} });
  const keyboardInput = useKeyboardMovement();
  const [joystickInput] = useJoystickMovement();
  const localPlayerStateRef = useRef<PlayerState | null>(null);
  const mountedRef = useRef(true);
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // Deferred cleanup for effect re-mounts
  const [whiteboardMesh, setWhiteboardMesh] = useState<AbstractMesh | null>(null);
  const [whiteboardAspectRatio, setWhiteboardAspectRatio] = useState(5); // default 5:1 (20x4)
  const drawingModeRef = useRef(false);
  const gameModeRef = useRef(false);
  const whiteboardTextureRef = useRef<DynamicTexture | null>(null);
  const presenceUntrackRef = useRef<(() => Promise<void>) | null>(null);
  const personalRoomDataRef = useRef<any>(null);
  const isPersonalRoomRef = useRef(false);
  const roomVisitNotificationSentRef = useRef(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardState>({ scores: [], version: 0 });

  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Bounce animation: stops permanently after first game tap
  const [hasPlayedGame, setHasPlayedGame] = useState(() => localStorage.getItem('hasPlayedGame') === 'true');
  const [isEmoteDrawerOpen, setIsEmoteDrawerOpen] = useState(false);
  const [isPlayerListOpen, setIsPlayerListOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const { status: callStatus } = useVideoCallStore();
  const isCallActive = callStatus === 'connected';
  const { micOn, speakerOn, micAllowed, toggleMic, toggleSpeaker, setMicOn } = useVoiceChatStore();
  const mySbaId = useAuthStore(state => state.user?.id);
  const authProfile = useAuthStore(state => state.profile);

  // Room capacity check for personal rooms (runs after room data is loaded)
  useEffect(() => {
    if (!isPersonalRoom || !slug || !personalRoomData) return;

    // Owner can always join their own room
    const isOwner = mySbaId === personalRoomData.owner_id;
    if (isOwner) return;

    // Check capacity for non-owners
    getRoomUserCount(slug).then((currentCount) => {
      console.log('[Room] Checking capacity:', currentCount, '/', PERSONAL_ROOM_MAX_USERS);
      if (currentCount >= PERSONAL_ROOM_MAX_USERS) {
        console.log('[Room] Room is full, setting roomFull');
        setRoomFull(true);
      }
    });
  }, [isPersonalRoom, slug, personalRoomData, mySbaId]);


  // New Placement Logic State
  const [pendingPlacement, setPendingPlacement] = useState<{
    position: Vector3;
    rotation: Vector3;
    isLocked: boolean; // True if user clicked to freeze the ghost for adjustment
  } | null>(null);

  // State for editing existing items
  const [editingInstanceId, setEditingInstanceId] = useState<string | null>(null);

  // Chess mini-game state
  const [nearChessBoard, setNearChessBoard] = useState(false);
  const { isModalOpen: isChessOpen, openChessModal, closeChessModal } = useChessStore();

  // Whiteboard proximity state
  const [nearWhiteboard, setNearWhiteboard] = useState(false);

  // Arcade/Snake mini-game state
  const [nearArcade, setNearArcade] = useState(false);
  const { isModalOpen: isSnakeOpen, openSnakeModal, closeSnakeModal } = useSnakeStore();

  // Arcade2/Match3 mini-game state
  const [nearArcade2, setNearArcade2] = useState(false);
  const { isModalOpen: isMatch3Open, openMatch3Modal, closeMatch3Modal } = useMatch3Store();

  // Handle placing a NEW item
  const handlePlaceItem = useCallback(async (itemId: string, position: Vector3, rotation: Vector3) => {
    if (!personalRoomData || !slug) return;
    const isOwner = personalRoomData.is_owner || (mySbaId && personalRoomData.owner_id === mySbaId);
    if (!isOwner) return;

    // Fetch item details from Supabase by UUID
    const { data: itemDefinition, error: itemError } = await supabase
      .from('items')
      .select('id, model_url')
      .eq('id', itemId)
      .single();

    if (itemError || !itemDefinition) {
      console.error('[Room] ❌ Could not find item in DB:', itemError);
      return;
    }

    const modelUrl = itemDefinition.model_url;

    // 1. Optimistic Update — use the SAME instance_id for local state and DB
    const instanceId = crypto.randomUUID();
    const newItem = {
      instance_id: instanceId,
      item_id: itemDefinition.id,
      model_url: modelUrl,
      position: { x: position.x, y: position.y, z: position.z },
      rotation: { x: rotation.x, y: rotation.y, z: rotation.z },
      scale: { x: 1, y: 1, z: 1 }
    };

    console.log('[Room] ✅ Placing Item:', newItem);

    setPersonalRoomData((prev: any) => prev ? { ...prev, items: [...(prev.items || []), newItem] } : null);

    // 2. Persist to Supabase (same instance_id as local state)
    try {
      const { error } = await supabase
        .from('room_items')
        .insert({
          room_id: personalRoomData.room_id,
          item_id: itemDefinition.id,
          instance_id: instanceId,
          position: { x: position.x, y: position.y, z: position.z },
          rotation: { x: rotation.x, y: rotation.y, z: rotation.z },
          scale: { x: 1, y: 1, z: 1 }
        });

      if (error) console.error('[Room] ❌ Supabase Insert Error:', error);
      else console.log('[Room] 💾 Saved to DB successfully');

    } catch (err) {
      console.error('[Room] ❌ Exception saving item:', err);
    }
  }, [personalRoomData, slug, mySbaId]);

  // Handle UPDATING an existing item
  const handleUpdateItem = useCallback(async (instanceId: string, position: Vector3, rotation: Vector3) => {
    if (!personalRoomData) return;

    // 1. Optimistic Update
    setPersonalRoomData((prev: any) => {
      if (!prev || !prev.items) return prev;
      return {
        ...prev,
        items: prev.items.map((item: any) =>
          item.instance_id === instanceId
            ? { ...item, position: { x: position.x, y: position.y, z: position.z }, rotation: { x: rotation.x, y: rotation.y, z: rotation.z } }
            : item
        )
      };
    });

    // 2. Persist to Supabase
    try {
      // We need the real UUID for the update if instance_id matches, 
      // BUT currently our schema uses a 'instance_id' column on room_items.
      const { error } = await supabase
        .from('room_items')
        .update({
          position: { x: position.x, y: position.y, z: position.z },
          rotation: { x: rotation.x, y: rotation.y, z: rotation.z }
        })
        .eq('instance_id', instanceId);

      if (error) console.error('[Room] ❌ Update Error:', error);
      else console.log('[Room] 💾 Updated DB successfully');
    } catch (err) {
      console.error('[Room] ❌ Exception updating item:', err);
    }
  }, [personalRoomData]);


  // Handle DELETING an existing item
  const handleDeleteItem = useCallback(async (instanceId: string) => {
    if (!personalRoomData) return;

    // 1. Optimistic Update
    setPersonalRoomData((prev: any) => {
      if (!prev || !prev.items) return prev;
      return {
        ...prev,
        items: prev.items.filter((item: any) => item.instance_id !== instanceId)
      };
    });

    // Reset edit state
    setEditingInstanceId(null);
    setPendingPlacement(null);
    setSelectedItemId(null);

    // 2. Persist to Supabase
    try {
      const { error } = await supabase
        .from('room_items')
        .delete()
        .eq('instance_id', instanceId);

      if (error) console.error('[Room] ❌ Delete Error:', error);
      else console.log('[Room] 🗑️ Deleted from DB successfully');
    } catch (err) {
      console.error('[Room] ❌ Exception deleting item:', err);
    }
  }, [personalRoomData]);

  // Handle selecting a new FLOOR texture
  const handleSelectFloor = useCallback(async (textureId: string) => {
    if (!personalRoomData?.room_id) {
      console.error('[Room] ❌ No room_id found, cannot save floor texture');
      return;
    }

    console.log('[Room] 🪵 Selecting floor texture:', textureId, 'for room_id:', personalRoomData.room_id);

    // 1. Optimistic Update
    setPersonalRoomData((prev: any) => prev ? { ...prev, floor_texture_url: textureId } : null);

    // 2. Persist to Supabase
    try {
      const { data, error, count } = await supabase
        .from('rooms')
        .update({ floor_texture_url: textureId })
        .eq('id', personalRoomData.room_id)
        .select();

      console.log('[Room] Floor update response:', { data, error, count });

      if (error) console.error('[Room] ❌ Floor update error:', error);
      else if (!data || data.length === 0) console.error('[Room] ❌ Floor update returned no data - RLS may be blocking!');
      else console.log('[Room] 💾 Floor texture saved successfully:', data);
    } catch (err) {
      console.error('[Room] ❌ Exception updating floor:', err);
    }
  }, [personalRoomData]);

  // Handle selecting a new WALL texture
  const handleSelectWall = useCallback(async (textureId: string) => {
    if (!personalRoomData?.room_id) {
      console.error('[Room] ❌ No room_id found, cannot save wall texture');
      return;
    }

    console.log('[Room] 🧱 Selecting wall texture:', textureId, 'for room_id:', personalRoomData.room_id);

    // 1. Optimistic Update
    setPersonalRoomData((prev: any) => prev ? { ...prev, wall_texture_url: textureId } : null);

    // 2. Persist to Supabase
    try {
      const { data, error, count } = await supabase
        .from('rooms')
        .update({ wall_texture_url: textureId })
        .eq('id', personalRoomData.room_id)
        .select();

      console.log('[Room] Wall update response:', { data, error, count });

      if (error) console.error('[Room] ❌ Wall update error:', error);
      else if (!data || data.length === 0) console.error('[Room] ❌ Wall update returned no data - RLS may be blocking!');
      else console.log('[Room] 💾 Wall texture saved successfully:', data);
    } catch (err) {
      console.error('[Room] ❌ Exception updating wall:', err);
    }
  }, [personalRoomData]);

  // Triggered when user taps an existing furniture item in Edit Mode
  const handleSelectExistingItem = useCallback((instanceId: string) => {
    if (!isEditMode || !personalRoomData?.items) return;

    const item = personalRoomData.items.find((i: { instance_id: string }) => i.instance_id === instanceId);
    if (!item) return;

    // item_id is now the Supabase UUID
    setEditingInstanceId(instanceId);
    setSelectedItemId(item.item_id);

    // Set pending placement to current values
    const pos = new Vector3(item.position.x, item.position.y, item.position.z);

    // IMPORTANT: Applying the inverse of the 180 flip we added in PersonalRoomScene
    // The DB has the "correct" rotation (e.g. 90). PersonalRoomScene adds 180 visually.
    // If we edit, we want the ghost to match visual.
    // PlacementGhost uses the rotation value directly.
    const rot = new Vector3(item.rotation.x, item.rotation.y, item.rotation.z);

    setPendingPlacement({
      position: pos,
      rotation: rot,
      isLocked: true // Start locked so it doesn't jump to cursor immediately?
    });

  }, [isEditMode, personalRoomData]);


  // Handler for ghost updates
  const handlePendingPlacementUpdate = useCallback((pos: Vector3, rot: Vector3, isLocked: boolean) => {
    // console.log('[Room] 👻 Ghost Update:', { pos, rot, isLocked });
    if (isLocked) {
      console.log('[Room] 🔒 Ghost LOCKED at', pos);
    }
    setPendingPlacement({ position: pos, rotation: rot, isLocked });
  }, []);

  const handleConfirmPlacement = useCallback(() => {
    if (selectedItemId && pendingPlacement) {
      const pos = pendingPlacement.position;
      const rot = pendingPlacement.rotation;

      console.log('[Room] ✓ Confirming placement/update');

      if (editingInstanceId) {
        // Update existing
        handleUpdateItem(editingInstanceId, pos, rot);
        setEditingInstanceId(null);
      } else {
        // Place new - clear state first
        setSelectedItemId(null);
        handlePlaceItem(selectedItemId, pos, rot);
      }

      // Clear shared state
      setPendingPlacement(null);
      if (!editingInstanceId) setSelectedItemId(null); // Clear ID if new placement (already done above but explicit)
    }
  }, [selectedItemId, pendingPlacement, editingInstanceId, handlePlaceItem, handleUpdateItem]);

  const handleRotatePending = useCallback(() => {
    if (pendingPlacement) {
      const newRot = pendingPlacement.rotation.clone();
      newRot.y += Math.PI / 2;
      setPendingPlacement({ ...pendingPlacement, rotation: newRot });
    }
  }, [pendingPlacement]);

  const handleCancelPlacement = useCallback(() => {
    // If editing, revert could be handled here or just by doing nothing 
    // (since we haven't committed to DB/State yet, visuals revert automatically when ghost disappears)
    setPendingPlacement(null);
    setSelectedItemId(null);
    setEditingInstanceId(null);
  }, []);

  // Dynamic fallback player that uses custom spawn point when available
  const createFallbackPlayer = useCallback((): PlayerState => {
    const spawnPos = customSpawnPoint
      ? { x: customSpawnPoint.x, y: customSpawnPoint.y, z: customSpawnPoint.z }
      : { x: 0, y: 0, z: 0 };
    // Pull avatarUrl from auth store so Avatar.tsx can load the avatar model.
    const authProfile = useAuthStore.getState().profile;
    const storedAvatarUrl = authProfile?.avatar_url || defaultAvatarUrl;
    return {
      pos: spawnPos,
      rotY: 0,
      anim: 'idle',
      head: { q: [0, 0, 0, 1] },
      blend: {},
      isLoading: true, // Hidden until avatar fully loads
      avatarUrl: resolveAssetUrl(storedAvatarUrl, 'avatars'),
      avatarConfig: authProfile?.avatar_config || DEFAULT_AVATAR_CONFIG,
    };
  }, [customSpawnPoint]);

  // Sync inCall state to Playroom when call status changes
  useEffect(() => {
    if (myId !== 'none') {
      writeMyState({ inCall: isCallActive }, true)
        .then(() => console.log('[Room] Synced inCall state:', isCallActive))
        .catch((err) => console.error('[Room] Failed to sync inCall state:', err));
    }
  }, [isCallActive, myId]);

  useEffect(() => {
    drawingModeRef.current = ui.drawingMode;
  }, [ui.drawingMode]);

  useEffect(() => {
    gameModeRef.current = ui.gameMode;
  }, [ui.gameMode]);

  // Stable callbacks for whiteboard
  const handleExitDrawingMode = useCallback(() => {
    setUi(prev => ({ ...prev, drawingMode: false }));
  }, []);

  const handleToggleDrawingMode = useCallback(() => {
    setUi(prev => ({ ...prev, drawingMode: !prev.drawingMode }));
  }, []);

  const handleTextureUpdated = useCallback(() => {
    // Force a re-render or update to ensure texture is visible
    console.log('[Room] Texture updated, forcing material refresh');
  }, []);

  // Game mode handlers
  const handleToggleGameMode = useCallback(() => {
    setUi(prev => ({ ...prev, gameMode: !prev.gameMode }));
  }, []);

  const handleExitGameMode = useCallback(() => {
    setUi(prev => ({ ...prev, gameMode: false }));
  }, []);

  const { user } = useAuthStore();

  const handleGameOver = useCallback(async (score: number) => {
    const myId = getMyId();
    if (!myId) {
      console.warn('[Room] Cannot submit score: no player ID');
      return;
    }

    // Get player name from Auth or fallback
    const playerName = user?.email?.split('@')[0] || 'Anonymous';

    try {
      await submitScore(score, playerName, user?.id);
      console.log('[Room] Score submitted:', score);
    } catch (error) {
      console.error('[Room] Failed to submit score', error);
    }
  }, [user]);

  // Subscribe to leaderboard updates
  useEffect(() => {
    const unsubscribe = subscribeLeaderboard((state) => {
      setLeaderboard(state);
    });
    return unsubscribe;
  }, []);

  // Chess board proximity detection
  useEffect(() => {
    console.log('[Chess Proximity] useEffect triggered, slug:', slug);
    if (!slug || slug !== 'lounge') {
      console.log('[Chess Proximity] Not in lounge, skipping');
      return;
    }

    let loggedMeshes = false;
    let foundChessMeshName: string | null = null;

    const checkProximity = setInterval(() => {
      const playerState = localPlayerStateRef.current;
      if (!playerState) {
        return;
      }

      // Find chess_board mesh in the scene
      const scene = (window as any).__babylonScene;
      if (!scene) {
        console.log('[Chess Proximity] Scene not found on window');
        return;
      }

      // Log all meshes once to find the correct name
      if (!loggedMeshes) {
        console.log('[Chess Proximity] Scene found! Searching', scene.meshes?.length, 'meshes');

        // Try to find chess_board as a TransformNode (parent object) first
        const chessNode = scene.getTransformNodeByName('chess_board');
        if (chessNode) {
          console.log('[Chess Proximity] Found chess_board as TransformNode!');
          foundChessMeshName = 'chess_board';
        } else {
          // Search meshes
          scene.meshes?.forEach((m: any, i: number) => {
            const name = m.name?.toLowerCase() || '';
            if (name.includes('chess')) {
              console.log(`  [${i}] CHESS MESH: "${m.name}"`);
              if (!foundChessMeshName) foundChessMeshName = m.name;
            }
          });
        }

        if (!foundChessMeshName) {
          console.log('[Chess Proximity] No chess node found. Checking all nodes...');
          scene.transformNodes?.slice(0, 10).forEach((n: any, i: number) => {
            console.log(`  Node[${i}] "${n.name}"`);
          });
        }
        loggedMeshes = true;
      }

      // Use found name or default
      const meshName = foundChessMeshName || 'chess_board';

      // Try as TransformNode first, then as Mesh
      let chessBoardNode = scene.getTransformNodeByName(meshName) || scene.getMeshByName(meshName);

      if (!chessBoardNode) {
        return;
      }

      const playerPos = new Vector3(playerState.pos.x, playerState.pos.y, playerState.pos.z);
      const boardPos = chessBoardNode.getAbsolutePosition();
      const distance = Vector3.Distance(playerPos, boardPos);

      // Show action button when within 5 units
      const isNear = distance < 5;
      if (isNear !== nearChessBoard) {
        console.log('[Chess Proximity] Distance:', distance.toFixed(2), 'isNear:', isNear, 'boardPos:', boardPos.toString());
      }
      setNearChessBoard(isNear);
    }, 500); // Check twice per second

    return () => clearInterval(checkProximity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Arcade machine proximity detection (for snake game)
  useEffect(() => {
    if (!slug) return;

    let loggedMeshes = false;
    let foundArcadeMeshName: string | null = null;
    let lastNearArcade: boolean | null = null; // Track previous state to avoid redundant updates

    const checkProximity = setInterval(() => {
      const playerState = localPlayerStateRef.current;
      if (!playerState) return;

      const scene = (window as any).__babylonScene;
      if (!scene) return;

      // Find arcade mesh (only once)
      if (!loggedMeshes) {
        console.log('[Arcade Proximity] Searching for arcade mesh...');
        const arcadeNode = scene.getTransformNodeByName('arcade');
        if (arcadeNode) {
          console.log('[Arcade Proximity] Found arcade as TransformNode!');
          foundArcadeMeshName = 'arcade';
        } else {
          scene.meshes?.forEach((m: any) => {
            const name = m.name?.toLowerCase() || '';
            if (name.includes('arcade')) {
              console.log(`[Arcade Proximity] Found arcade mesh: "${m.name}"`);
              if (!foundArcadeMeshName) foundArcadeMeshName = m.name;
            }
          });
        }
        loggedMeshes = true;
      }

      const meshName = foundArcadeMeshName || 'arcade';
      const arcadeNode = scene.getTransformNodeByName(meshName) || scene.getMeshByName(meshName);

      if (!arcadeNode) return;

      const playerPos = new Vector3(playerState.pos.x, playerState.pos.y, playerState.pos.z);
      const arcadePos = arcadeNode.getAbsolutePosition();
      const distance = Vector3.Distance(playerPos, arcadePos);

      const isNear = distance < 5;
      // Only update if state actually changed
      if (isNear !== lastNearArcade) {
        console.log('[Arcade Proximity] Distance:', distance.toFixed(2), 'isNear:', isNear, 'arcadePos:', { x: arcadePos.x.toFixed(2), y: arcadePos.y.toFixed(2), z: arcadePos.z.toFixed(2) });
        setNearArcade(isNear);
        lastNearArcade = isNear;
      }
    }, 500);

    return () => clearInterval(checkProximity);
  }, [slug]);

  // Arcade2 machine proximity detection (for match3 game)
  useEffect(() => {
    if (!slug) return;

    let loggedMeshes = false;
    let foundArcade2MeshName: string | null = null;
    let lastNearArcade2: boolean | null = null; // Track previous state to avoid redundant updates

    const checkProximity = setInterval(() => {
      const playerState = localPlayerStateRef.current;
      if (!playerState) return;

      const scene = (window as any).__babylonScene;
      if (!scene) return;

      // Find arcade2 mesh (only once)
      if (!loggedMeshes) {
        console.log('[Arcade2 Proximity] Searching for arcade2 mesh...');
        const arcade2Node = scene.getTransformNodeByName('arcade2');
        if (arcade2Node) {
          console.log('[Arcade2 Proximity] Found arcade2 as TransformNode!');
          foundArcade2MeshName = 'arcade2';
        } else {
          scene.meshes?.forEach((m: any) => {
            const name = m.name?.toLowerCase() || '';
            if (name.includes('arcade2')) {
              console.log(`[Arcade2 Proximity] Found arcade2 mesh: "${m.name}"`);
              if (!foundArcade2MeshName) foundArcade2MeshName = m.name;
            }
          });
        }
        loggedMeshes = true;
      }

      const meshName = foundArcade2MeshName || 'arcade2';
      const arcade2Node = scene.getTransformNodeByName(meshName) || scene.getMeshByName(meshName);

      if (!arcade2Node) return;

      const playerPos = new Vector3(playerState.pos.x, playerState.pos.y, playerState.pos.z);
      const arcade2Pos = arcade2Node.getAbsolutePosition();
      const distance = Vector3.Distance(playerPos, arcade2Pos);

      const isNear = distance < 5;
      // Only update if state actually changed
      if (isNear !== lastNearArcade2) {
        console.log('[Arcade2 Proximity] Distance:', distance.toFixed(2), 'isNear:', isNear);
        setNearArcade2(isNear);
        lastNearArcade2 = isNear;
      }
    }, 500);

    return () => clearInterval(checkProximity);
  }, [slug]);

  // Whiteboard proximity detection
  useEffect(() => {
    // Only run if we have a whiteboard mesh
    if (!whiteboardMesh) {
      setNearWhiteboard(false);
      return;
    }

    const checkProximity = setInterval(() => {
      const playerState = localPlayerStateRef.current;
      if (!playerState) return;

      const playerPos = new Vector3(playerState.pos.x, playerState.pos.y, playerState.pos.z);
      const boardPos = whiteboardMesh.getAbsolutePosition();
      const distance = Vector3.Distance(playerPos, boardPos);

      // Show action button when within 4 units
      const isNear = distance < 4;
      setNearWhiteboard(isNear);
    }, 500);

    return () => clearInterval(checkProximity);
  }, [whiteboardMesh]);

  // Handle avatar click
  const handleAvatarClick = useCallback((playerId: string) => {
    console.log('[Room] handleAvatarClick called for player:', playerId, 'myId:', myId, 'drawingMode:', ui.drawingMode, 'gameMode:', ui.gameMode);
    // Don't open modal for local player or when in drawing/game mode
    if (playerId === myId) {
      console.log('[Room] Ignoring click on local player');
      return;
    }
    if (ui.drawingMode || ui.gameMode) {
      console.log('[Room] Ignoring click - in drawing or game mode');
      return;
    }
    console.log('[Room] Opening profile modal for player:', playerId);
    setSelectedPlayerId(playerId);
  }, [myId, ui.drawingMode, ui.gameMode]);

  // Handle modal close
  const handleCloseModal = useCallback(() => {
    setSelectedPlayerId(null);
  }, []);

  // Edit Mode Handlers
  const handleToggleEditMode = useCallback(() => {
    setIsEditMode(prev => {
      if (prev) {
        // Exiting edit mode
        setPendingPlacement(null);
        setSelectedItemId(null);
        setEditingInstanceId(null);
      }
      return !prev;
    });
  }, []);

  const handleSaveRoom = useCallback(() => {
    // In a real app, you might trigger a final save here or just rely on individual item saves
    console.log('[Room] Room saved (placeholder)');
    setIsEditMode(false); // Exit edit mode after saving
  }, []);

  const handleSelectPaletteItem = useCallback((itemId: string) => {
    setSelectedItemId(itemId);
    setPendingPlacement({
      position: new Vector3(0, 0, 0), // Default position, will be updated by ghost
      rotation: new Vector3(0, 0, 0),
      isLocked: false // Not locked initially
    });
  }, []);

  const handleEditControlSelectItem = useCallback((itemId: string) => {
    // Palette selection (new item)
    handleSelectPaletteItem(itemId);
    // Clear editing state if we select a new item from palette
    setEditingInstanceId(null);
  }, [handleSelectPaletteItem]);


  // Combine keyboard and joystick input (joystick takes priority)
  // Disable movement when in drawing mode, game mode, or chat is open
  const movementInput: MovementInput = useMemo(() => {
    if (ui.drawingMode || ui.gameMode || isChatOpen || isEditMode || showDescriptionModal) {
      return { forward: 0, right: 0 }; // No movement in drawing/game/chat/edit mode
    }
    if (joystickInput.forward !== 0 || joystickInput.right !== 0) {
      return joystickInput;
    }
    return keyboardInput;
  }, [keyboardInput, joystickInput, ui.drawingMode, ui.gameMode, isChatOpen, isEditMode, showDescriptionModal]);

  useEffect(() => {
    worldRef.current = world;
    worldStateRef.current = world;
  }, [world]);

  // Network offline detection - show disconnect modal
  // IMPORTANT: Do NOT call any Playroom APIs here - just show the modal
  // The modal's "Reconnect" button will reload the page for clean state
  useEffect(() => {
    // Only run when connected to a room
    if (myId === 'none') return;

    const handleOffline = () => {
      console.log('[Room] Network went offline, showing disconnect modal');
      setIsDisconnected(true);
    };

    const handleOnline = () => {
      console.log('[Room] Network back online');
      // Don't auto-dismiss - let user choose to reconnect
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [myId]);

  useEffect(() => {
    if (!videoRef.current) {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.style.display = 'none';
      videoRef.current = video;
      document.body.appendChild(video);
    }

    return () => {
      const node = videoRef.current;
      if (node && node.parentElement) {
        node.parentElement.removeChild(node);
      }
      videoRef.current = null;
    };
  }, []);

  // Attach camera stream to video element and monitor track state
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (cameraStream) {
      console.log('[Room] Attaching camera stream to video element');
      video.srcObject = cameraStream;
      video.play().catch((e) => {
        console.error('[Room] Failed to play video:', e);
      });

      // Monitor all tracks for ending
      const tracks = cameraStream.getTracks();
      const handleTrackEnded = (event: Event) => {
        const track = event.target as MediaStreamTrack;
        console.error('[Room] ❌ Camera track ended unexpectedly!', {
          trackId: track.id,
          kind: track.kind,
          readyState: track.readyState,
        });

        // Clear the stream to trigger cleanup
        setCameraStream(null);

        // If camera is still supposed to be on, the effect will restart it
        // The camera effect has ui.cameraOn in deps, so toggling off/on will restart
        console.warn('[Room] Camera track ended - user may need to toggle camera off/on to restart');
      };

      tracks.forEach(track => {
        console.log('[Room] Monitoring track:', {
          id: track.id,
          kind: track.kind,
          readyState: track.readyState,
          enabled: track.enabled,
          muted: track.muted,
        });
        track.addEventListener('ended', handleTrackEnded);
      });

      return () => {
        tracks.forEach(track => {
          track.removeEventListener('ended', handleTrackEnded);
        });
      };
    } else {
      console.log('[Room] Clearing video element srcObject');
      video.srcObject = null;
    }
  }, [cameraStream]);

  // Sync profile from AuthStore to PlayerState when it loads/updates
  useEffect(() => {
    if (authProfile && localPlayerStateRef.current && myId !== 'none') {
      const currentProfileId = localPlayerStateRef.current.profile?.id;
      // Only update if we have a new profile or it changed
      if (currentProfileId !== authProfile.id) {
        console.log('[Room] Auth profile updated, syncing to player state:', authProfile.username);

        const updatedProfile = {
          name: authProfile.username || 'Guest',
          photo: authProfile.profile_image_url || authProfile.avatar_headshot_url || '',
          bio: authProfile.bio,
          username: authProfile.username,
          id: authProfile.id,
          friends_count: authProfile.friends_count || 0,
          color: { r: 255, g: 255, b: 255, hex: 0xffffff, hexString: '#ffffff' },
          avatarIndex: 0
        };

        // Update local ref
        localPlayerStateRef.current.profile = updatedProfile;

        // Broadcast to network
        writeMyState({ profile: updatedProfile }, true).catch(err =>
          console.error('[Room] Failed to sync updated profile to network:', err)
        );
      }
    }
  }, [authProfile, myId]);

  // Main connection effect
  useEffect(() => {
    if (!slug) {
      return;
    }

    // Cancel any pending deferred cleanup from a previous unmount
    // This handles React StrictMode double-mounting and iOS WebView lifecycle re-mounts
    if (cleanupTimerRef.current) {
      clearTimeout(cleanupTimerRef.current);
      cleanupTimerRef.current = null;
      console.log('[Room] Cancelled pending cleanup — re-mounting for slug:', slug);
    }

    mountedRef.current = true;
    setIsConnecting(true);
    let unsubscribe: (() => void) | null = null;

    (async () => {
      try {
        console.log('[Room] Attempting to connect to room:', slug);
        const { myId: connectedMyId, roomCode: connectedRoomCode } = await connectToRoom(slug);
        console.log('[Room] connectToRoom resolved:', { connectedMyId, connectedRoomCode });

        if (!mountedRef.current) {
          console.log('[Room] Component unmounted, aborting');
          return;
        }

        setIsConnecting(false);
        setMyId(connectedMyId);
        setRoomCode(connectedRoomCode);
        console.log('[Room] Connected with player ID:', connectedMyId, 'roomCode:', connectedRoomCode);


        // Track presence for lobby user counts
        const userId = useAuthStore.getState().user?.id;
        if (userId && slug) {
          const { untrack } = trackRoomPresence(slug, userId);
          presenceUntrackRef.current = untrack;

          // Update user_presence table for friends list status
          const roomType = personalRoomData ? 'personal' : 'public';
          const roomOwnerId = personalRoomData?.owner_id || null;
          supabase.rpc('update_presence', {
            p_status: 'in_room',
            p_room_slug: slug,
            p_room_type: roomType,
            p_room_owner_id: roomOwnerId
          }).then(({ error }) => {
            if (error) console.error('[Room] Failed to update presence:', error);
          });

          // Room visit notification is handled in a dedicated useEffect
          // This ensures it fires when personalRoomData is definitely available
        }

        // Get avatar data from location state or localStorage
        // Get avatar data from location state, Auth Profile, or localStorage
        const locationState = location.state as any;

        // CRITICAL: Wait for profile to be ready if user is logged in
        // This prevents the race condition where Google accounts broadcast "Guest" identity
        let authProfile = useAuthStore.getState().profile;

        if (userId && !authProfile) {
          console.log('[Room] Profile not ready, waiting...');
          // Poll for profile with timeout
          const maxWait = 3000;
          const pollInterval = 200;
          let waited = 0;

          while (!authProfile && waited < maxWait) {
            await new Promise(r => setTimeout(r, pollInterval));
            waited += pollInterval;
            authProfile = useAuthStore.getState().profile;
          }

          if (authProfile) {
            console.log('[Room] Profile loaded after', waited, 'ms:', authProfile.username);
          } else {
            console.warn('[Room] Profile still not available after', maxWait, 'ms, proceeding with fallback');
          }
        }

        const storedAvatarUrl =
          locationState?.avatarUrl ||
          authProfile?.avatar_url ||
          defaultAvatarUrl;

        const storedAvatarImg = locationState?.avatarImg;

        // Initialize local player state from world state or fallback
        const initialState = worldRef.current.players[connectedMyId] ?? createFallbackPlayer();
        console.log('[Room] Initial player state:', initialState);

        const avatarUrl = resolveAssetUrl(storedAvatarUrl, 'avatars');

        localPlayerStateRef.current = {
          ...initialState,
          ...(avatarUrl && { avatarUrl }),
          ...(storedAvatarImg && { avatarImg: storedAvatarImg }),
          avatarConfig: authProfile?.avatar_config || DEFAULT_AVATAR_CONFIG,
          profile: {
            name: authProfile?.username || locationState?.name || 'Guest',
            photo: authProfile?.profile_image_url || authProfile?.avatar_headshot_url || storedAvatarImg || '',
            bio: authProfile?.bio,
            username: authProfile?.username,
            id: authProfile?.id,
            friends_count: authProfile?.friends_count || 0,
            // Fallback for types that expect color/avatarIndex (Playroom kit defaults)
            color: { r: 255, g: 255, b: 255, hex: 0xffffff, hexString: '#ffffff' },
            avatarIndex: 0
          }
        };

        console.log('[Room] Using avatar URL:', avatarUrl);

        // CRITICAL FIX: Explicitly broadcast our profile (including Supabase ID) to the network.
        // Without this, other players see us but don't know our DB ID, causing gift failures.
        // We do this immediately upon connection.
        writeMyState({
          ...localPlayerStateRef.current,
          isLoading: true, // Signal: avatar not ready yet — invisible to other clients
          profile: localPlayerStateRef.current.profile
        }, true).catch(err => console.error('[Room] Failed to sync profile to network:', err));

        // Immediately add local player to world state for display (use localPlayerStateRef to include avatarUrl)
        setWorld((prev) => {
          const updated = { ...prev };
          if (!updated.players) updated.players = {};
          updated.players[connectedMyId] = {
            ...localPlayerStateRef.current!,
            pos: { ...localPlayerStateRef.current!.pos },
            head: { ...localPlayerStateRef.current!.head },
            blend: { ...localPlayerStateRef.current!.blend },
          };
          return updated;
        });

        unsubscribe = subscribeState((state) => {
          // Merge local player state into world state for display
          const mergedState = { ...state };
          if (!mergedState.players) mergedState.players = {};

          // Always use the latest local player state (but preserve all remote players from state)
          if (localPlayerStateRef.current && connectedMyId) {
            mergedState.players[connectedMyId] = localPlayerStateRef.current;
          }

          // ============================================
          // STREAMING STATE DETECTION (Player-State Based)
          // ============================================
          // Find any REMOTE player who is currently streaming
          // CRITICAL: We MUST exclude ourselves (`connectedMyId`) from detection.
          // Our local `useStreamingStore` is the SINGLE SOURCE OF TRUTH for our own status.
          // If we listen to Playroom for our own status, we get race conditions where
          // "End Stream" (local) is overwritten by "isStreaming: true" (remote echo).
          const streamingPlayer = Object.entries(mergedState.players || {}).find(
            ([id, player]) => player?.isStreaming === true && id !== connectedMyId
          );

          const currentStreamerId = useStreamingStore.getState().currentStreamerId;

          if (streamingPlayer) {
            const [playerId, player] = streamingPlayer;
            // Always sync - store will handle deduplication and metadata updates
            // This allows late-loading profile data (name, SbaId) to propagate
            console.log('[Room] Syncing streaming player:', playerId, player.profile?.name);
            useStreamingStore.getState().syncFromPlayerState(
              playerId,
              player.profile?.name || 'Streamer',
              player.profile?.id, // Supabase UUID for gifts
              player.profile?.photo
            );
          } else {
            // No REMOTE player is streaming.
            // If we thought a REMOTE player was streaming, clear it.
            // If WE are streaming, do NOTHING - our local actions control that.
            if (currentStreamerId && currentStreamerId !== connectedMyId) {
              console.log('[Room] Remote streamer disconnected or stopped');
              useStreamingStore.getState().syncFromPlayerState(null, null);
            }
          }

          // ============================================
          // PERSONAL ROOM VIDEO CALL DETECTION
          // ============================================
          // Check if the room owner has an active video call
          // This allows new users joining to automatically see the call
          // CRITICAL: Only run this for NON-OWNERS. Owners control their own mode directly.
          const ownerSbaId = personalRoomDataRef.current?.owner_id;
          const mySbaIdFromStore = useAuthStore.getState().user?.id;
          const iAmOwner = ownerSbaId && mySbaIdFromStore && ownerSbaId === mySbaIdFromStore;

          if (ownerSbaId && isPersonalRoomRef.current && !iAmOwner) {
            // Find the owner's player by matching their Supabase UUID in profile.id
            const ownerPlayer = Object.values(mergedState.players || {}).find(
              (player) => player?.profile?.id === ownerSbaId
            );

            const currentMode = useStreamingStore.getState().personalRoomMode;

            if (ownerPlayer?.personalRoomStreamActive && currentMode !== 'stream') {
              console.log('[Room] Owner has active video call, syncing to stream mode');
              // Directly set the local state (don't use setPersonalRoomMode which requires owner auth)
              useStreamingStore.setState({ personalRoomMode: 'stream' });
            } else if (!ownerPlayer?.personalRoomStreamActive && ownerPlayer && currentMode === 'stream') {
              // Owner ended the call but we're still in stream mode
              console.log('[Room] Owner ended video call, syncing to 3d mode');
              useStreamingStore.setState({ personalRoomMode: '3d' });
            }
          }

          // Only update if state actually changed (prevent unnecessary re-renders)
          const currentWorld = worldStateRef.current;
          const hasChanges =
            !currentWorld ||
            JSON.stringify(currentWorld.players) !== JSON.stringify(mergedState.players);

          if (hasChanges) {
            worldStateRef.current = mergedState;
            setWorld(mergedState);
          }
        });

        // Also update world state periodically from local player state
        // This ensures local player updates are reflected immediately, but preserves remote players
        // Write initial state immediately to ensure we appear in the room
        writeMyState(localPlayerStateRef.current!, true).catch((error) => {
          console.error('[Room] Failed to write initial state', error);
        });

        startHeartbeat(); // prove writes happen periodically
      } catch (error) {
        setIsConnecting(false);
        console.error('[Room] Failed to connect', error);
        window.alert('Failed to connect to room. Please try again.');
        window.location.href = '/';
        return;
      }
    })();

    return () => {
      mountedRef.current = false;

      // Unsubscribe from Playroom state polling (safe to do synchronously)
      if (unsubscribe) {
        unsubscribe();
      }

      // DEFER all destructive cleanup by 2s.
      // If the effect re-runs within this window (StrictMode, iOS lifecycle),
      // the deferred cleanup is cancelled and the connection/state survive intact.
      cleanupTimerRef.current = setTimeout(() => {
        cleanupTimerRef.current = null;
        console.log('[Room] Deferred cleanup executing — full teardown');

        // Clear local world / player state
        worldStateRef.current = { players: {} };
        worldRef.current = { players: {} };
        localPlayerStateRef.current = null;
        setWorld({ players: {} });
        setMyId('none');

        stopHeartbeat();

        // Disconnect from Playroom
        disconnectFromRoom().catch((error) => {
          console.error('[Room] Error disconnecting from room:', error);
        });

        // Update presence to 'online' (left room but still in app)
        const userId = useAuthStore.getState().user?.id;
        if (userId) {
          supabase.rpc('update_presence', {
            p_status: 'online',
            p_room_slug: null,
            p_room_type: null,
            p_room_owner_id: null
          }).then(({ error }) => {
            if (error) console.error('[Room] Failed to update presence on leave:', error);
          });
        }

        // Untrack presence
        if (presenceUntrackRef.current) {
          presenceUntrackRef.current().catch((err) => {
            console.error('[Room] Error untracking presence:', err);
          });
          presenceUntrackRef.current = null;
        }
      }, 2000); // 2s deferred window
    };
  }, [slug]);

  // Defer VoiceChat/Agora initialization until scene has had time to load.
  // Loading Babylon.js scene (GLB environment + avatars + animations) simultaneously
  // with Agora SDK import + WebRTC causes WKWebView process termination on iOS.
  useEffect(() => {
    if (myId === 'none') {
      setSceneReady(false);
      return;
    }

    console.log('[Room] Scene loading phase started — VoiceChat deferred by 3s');
    const timer = setTimeout(() => {
      console.log('[Room] Scene loading phase complete — enabling VoiceChat');
      setSceneReady(true);
    }, 3000);

    return () => {
      clearTimeout(timer);
      setSceneReady(false);
    };
  }, [myId]);

  // Movement write loop (20 Hz) - replaces startStateUpdateLoop in viewModel
  useEffect(() => {
    if (myId === 'none') return;

    let lastSentState: PlayerState | null = null;
    let lastLogTime = 0;

    const intervalId = setInterval(() => {
      // Pause updates if in a call
      if (useVideoCallStore.getState().status === 'connected') {
        return;
      }

      const state = localPlayerStateRef.current;
      if (!state) {
        return;
      }

      const movementChanged =
        !lastSentState ||
        state.pos.x !== lastSentState.pos.x ||
        state.pos.y !== lastSentState.pos.y ||
        state.pos.z !== lastSentState.pos.z ||
        state.rotY !== lastSentState.rotY ||
        state.anim !== lastSentState.anim;

      if (!movementChanged) {
        return;
      }

      // Include tvHeadEnabled and agoraVideoUid to ensure they persist
      writeMyState({
        pos: state.pos,
        rotY: state.rotY,
        anim: state.anim,
        tvHeadEnabled: state.tvHeadEnabled,
        agoraVideoUid: state.agoraVideoUid,
      })
        .then(() => {
          lastSentState = {
            ...state,
            pos: { ...state.pos },
            head: { ...state.head },
            blend: { ...state.blend },
          };

          const now = performance.now();
          if (now - lastLogTime > 1000) {
            console.log('[Room] ✍️ Wrote movement state', {
              pos: lastSentState.pos,
              rotY: lastSentState.rotY,
              anim: lastSentState.anim,
            });
            lastLogTime = now;
          }
        })
        .catch((error) => {
          console.error('[Room] Failed to write movement state', error);
        });
    }, 50); // 20 Hz

    return () => clearInterval(intervalId);
  }, [myId]);

  // Avatar loaded callback — passed to local Avatar's onLoaded prop
  const handleAvatarLoaded = useCallback(() => {
    console.log('[Room] ✅ Local avatar loaded — dismissing loading step');
    setAvatarLoaded(true);
  }, []);

  // One-shot latch: once avatar + voice chat are both ready, lock roomFullyReady=true forever.
  // This prevents the loading overlay from ever reappearing if voiceChatJoined flickers.
  useEffect(() => {
    if (!roomFullyReady && avatarLoaded && voiceChatJoined) {
      console.log('[Room] ✅ Room fully ready — locking loading overlay off');
      setRoomFullyReady(true);
    }
  }, [avatarLoaded, voiceChatJoined, roomFullyReady]);

  // Safety timeout: force-dismiss loading screen after 30s
  useEffect(() => {
    if (roomFullyReady || myId === 'none') return;

    const timeout = setTimeout(() => {
      if (!roomFullyReady) {
        console.warn('[Room] ⚠️ Loading timeout (30s) — force-dismissing. avatarLoaded:', avatarLoaded, 'voiceChatJoined:', voiceChatJoined);
        setRoomFullyReady(true); // Force latch — never show loading overlay again
      }
    }, 30000);

    return () => clearTimeout(timeout);
  }, [myId, roomFullyReady, avatarLoaded, voiceChatJoined]);

  const players = useMemo(() => Object.entries(world.players), [world.players]);

  const toggleCamera = () => {
    setUi((prev) => {
      const newCameraOn = !prev.cameraOn;
      // Persist to localStorage via store
      useCameraPrefsStore.getState().setCameraOn(newCameraOn);
      return { ...prev, cameraOn: newCameraOn };
    });
  };

  const leave = () => {
    // PlayroomKit's insertCoin can only be called once per page — must do a full reload.
    // On iOS 18 WKWebView, window.location.href = '/' hangs because the capacitor://
    // custom scheme navigation stalls. Workaround: use History API to change the URL
    // instantly (no navigation), then reload() the page at that new URL.
    window.history.replaceState({}, '', '/');
    window.location.reload();
  };

  // Handle ESC key to exit drawing mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && ui.drawingMode) {
        e.preventDefault();
        e.stopPropagation();
        console.log('[Room] ESC pressed, exiting drawing mode');
        setUi(prev => ({ ...prev, drawingMode: false }));
      }
    };

    if (ui.drawingMode || ui.gameMode) {
      window.addEventListener('keydown', handleKeyDown, true); // Use capture phase
      return () => {
        window.removeEventListener('keydown', handleKeyDown, true);
      };
    }
  }, [ui.drawingMode]);

  const cameraStreamRef = useRef<MediaStream | null>(null);

  // Update ref when state changes
  useEffect(() => {
    cameraStreamRef.current = cameraStream;
  }, [cameraStream]);

  // Derived state for camera quality
  // Auto-mute viewers when a stream is active in the theater
  const prevMicRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!isTheater) return;
    const isStreaming = !!currentStreamerId;
    const amStreamer = currentStreamerId === myId;

    if (isStreaming && !amStreamer) {
      // Save current mic state before muting
      if (prevMicRef.current === null) {
        prevMicRef.current = useVoiceChatStore.getState().micOn;
      }
      setMicOn(false);
    } else if (!isStreaming && prevMicRef.current !== null) {
      // Restore previous mic state when stream ends
      setMicOn(prevMicRef.current);
      prevMicRef.current = null;
    }
  }, [currentStreamerId, myId, isTheater, setMicOn]);

  // We only want to switch to HD if *I* am the one streaming.
  // If someone else starts streaming, my camera should NOT reset.
  const amIStreaming = isTheater && currentStreamerId === myId;

  // Camera effect - simple facingMode with proper iOS delay
  useEffect(() => {
    if (ui.cameraOn && myId === 'none') { // Only return if camera is ON but myId is not set yet
      return;
    }
    // If camera is off, and myId is 'none', we don't need to do anything.
    // If camera is off, and myId is set, we proceed to turn off the camera.

    let cancelled = false;

    const getCameraStream = async () => {
      // CRITICAL for iOS: Stop old stream tracks FIRST and wait
      // Use a local variable to capture the current stream from ref before we nullify it
      const oldStream = cameraStreamRef.current;

      if (oldStream) {
        console.log('[Room] Stopping old camera tracks before switch');
        try {
          oldStream.getTracks().forEach(track => track.stop());
        } catch (e) {
          console.warn('[Room] Error stopping tracks:', e);
        }
        setCameraStream(null);
        // Wait for iOS to fully release the camera - increased to 500ms for safety and to let Agora unpublish
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      if (cancelled) return;

      try {
        console.log('[Room] Getting camera with facingMode:', facingMode, 'amIStreaming:', amIStreaming);

        const constraints: MediaStreamConstraints = {
          audio: false,
          video: amIStreaming ? {
            // HD Quality for Theater Streaming
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 }, // Remove max:30 to avoid OverconstrainedError
            facingMode: { ideal: facingMode }
          } : {
            // Ultra Low Quality for Avatar Heads (TV Head) - Optimized for multi-user
            width: { ideal: 240 },
            height: { ideal: 180 },
            frameRate: { ideal: 10 },
            facingMode: { ideal: facingMode }
          }
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);

        if (cancelled) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        console.log('[Room] Got camera stream:', stream.getVideoTracks()[0]?.label);
        setCameraStream(stream);

        // Update player state
        if (!localPlayerStateRef.current) {
          localPlayerStateRef.current = createFallbackPlayer();
        }

        if (localPlayerStateRef.current) {
          localPlayerStateRef.current.tvHeadEnabled = true;
          localPlayerStateRef.current.agoraVideoUid = myId;
        }

        writeMyState({
          tvHeadEnabled: true,
          agoraVideoUid: myId,
        }, true).catch(console.error);

      } catch (error) {
        console.error('[Room] Failed to get camera stream:', error);
        if (localPlayerStateRef.current) {
          localPlayerStateRef.current.tvHeadEnabled = false;
          localPlayerStateRef.current.agoraVideoUid = undefined;
        }
        writeMyState({
          tvHeadEnabled: false,
          agoraVideoUid: undefined,
        }, true).catch(console.error);
      }
    };

    if (ui.cameraOn) {
      getCameraStream();
    } else {
      // Camera off - stop stream
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach(track => track.stop());
      }
      setCameraStream(null);
      if (localPlayerStateRef.current) {
        localPlayerStateRef.current.tvHeadEnabled = false;
        localPlayerStateRef.current.agoraVideoUid = undefined;
      }
      writeMyState({
        tvHeadEnabled: false,
        agoraVideoUid: undefined,
      }, true).catch(console.error);
    }

    return () => {
      cancelled = true;
      if (cameraStreamRef.current) {
        console.log('[Room] Stopping camera tracks via ref (cleanup)');
        cameraStreamRef.current.getTracks().forEach(track => track.stop());
      }
      setCameraStream(null);
    };
  }, [ui.cameraOn, myId, facingMode, amIStreaming]); // CHANGED: Depending on amIStreaming instead of currentStreamerId prevents unrelated resets



  // Movement update loop now handled by PlayerController component inside SceneRoot

  // Camera follow effect - only works inside SceneRoot
  const CameraFollow = () => {
    const { scene, camera } = useScene();

    useEffect(() => {
      if (myId === 'none' || !camera) return;

      if (ui.drawingMode || ui.gameMode) {
        camera.detachControl();
        return;
      }

      if (isEditMode) {
        camera.beta = 0.1;
        camera.radius = 20;
        const canvas = scene.getEngine().getRenderingCanvas();
        if (canvas) camera.attachControl(canvas, true);
        return;
      }

      const canvas = scene.getEngine().getRenderingCanvas();
      if (canvas) camera.attachControl(canvas, true);

      // Create a target node and bind camera to it ONCE.
      // ArcRotateCamera auto-tracks a TransformNode target natively —
      // no per-frame setTarget() calls needed.
      const cameraTarget = new TransformNode('camera-target', scene);
      const initState = localPlayerStateRef.current;
      if (initState) {
        cameraTarget.position.set(initState.pos.x, initState.pos.y + 1, initState.pos.z);
      }
      camera.setTarget(cameraTarget);

      // Allow zoom in/out (pinch + scroll)
      const defaultRadius = isCustomRoom ? Math.min(6, roomConfig.roomHalfSize * 0.25) : 4;
      // Only set radius on first setup — preserve user's zoom level on re-runs
      if (camera.lowerRadiusLimit === camera.upperRadiusLimit || !camera.lowerRadiusLimit) {
        camera.radius = defaultRadius;
      }
      camera.lowerRadiusLimit = 2;   // Close-up
      camera.upperRadiusLimit = 12;  // Zoomed out
      camera.wheelPrecision = 20;    // Scroll sensitivity (higher = slower)
      camera.pinchPrecision = 60;    // Pinch sensitivity (higher = slower)

      // Disable panning and keyboard
      camera.panningSensibility = 0;

      // Roblox-style follow: camera target snaps to player position every frame.
      // No lerp = player is always dead-center on screen.
      // ArcRotateCamera handles orbit/rotation from touch input natively.
      // Zoom (radius) is fully user-controlled — we don't override it.
      const observer = scene.onBeforeRenderObservable.add(() => {
        const s = localPlayerStateRef.current;
        if (!s) return;

        cameraTarget.position.set(s.pos.x, s.pos.y + 1, s.pos.z);
      });

      return () => {
        scene.onBeforeRenderObservable.remove(observer);
        cameraTarget.dispose();
      };
    }, [scene, camera, myId, ui.drawingMode, isCustomRoom, roomConfig?.roomHalfSize]);

    return null;
  };

  return (
    <div className="fixed inset-0 bg-brand-bg">
      {/* Room Full Dialog */}
      {roomFull && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-bg/90 backdrop-blur-sm">
          <div className="text-center p-8 max-w-sm bg-slate-900/80 border border-white/10 rounded-2xl">
            <div className="text-6xl mb-4">🚫</div>
            <h3 className="text-xl font-bold text-white mb-2">Room is Full</h3>
            <p className="text-slate-400 mb-6">
              This room has reached the maximum of {PERSONAL_ROOM_MAX_USERS} users. Please try again later.
            </p>
            <button
              onClick={() => navigate('/lobby')}
              className="py-3 px-6 bg-brand-primary hover:bg-brand-primary-hover text-white font-bold rounded-xl shadow-lg transition-all active:scale-95"
            >
              Back to Lobby
            </button>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {/* Fullscreen Loading Screen — blocks interaction until avatar + audio are ready */}
      {!roomFullyReady && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-bg-base">
          <LoadingSpinner size="lg" className="mb-6" />
          <div className="text-sm text-white/60">
            {isConnecting
              ? 'Connecting to room...'
              : !avatarLoaded
                ? 'Loading avatar...'
                : 'Setting up audio...'}
          </div>
        </div>
      )}

      {/* Mobile Controls Overlay - Hidden when chat is open */}

      {/* Top Header Row - Menu button (left) and Player Count (right) */}
      <div
        className="absolute left-0 right-0 z-20 flex items-start justify-between"
        style={{
          top: 'calc(env(safe-area-inset-top) + 12px)',
          paddingLeft: 'max(env(safe-area-inset-left), 16px)',
          paddingRight: 'max(env(safe-area-inset-right), 16px)',
          visibility: isChatOpen ? 'hidden' : 'visible',
          opacity: isChatOpen ? 0 : 1,
          transition: 'opacity 0.2s ease-out'
        }}
      >
        {/* Left: Menu Button - Only show if standard UI is visible (NOT in Edit Mode) */}
        {!isEditMode ? (
          <div className="relative pointer-events-auto">
            <button
              className="h-12 w-12 rounded-full bg-bg-surface/60 backdrop-blur-md border border-white/10 text-white flex items-center justify-center shadow-xl active:scale-95 transition-all"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              {/* Menu Icon (3 dots vertical) */}
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
              </svg>
            </button>

            {/* Dropdown Menu */}
            {isMenuOpen && (
              <>
                {/* Backdrop to close menu */}
                <div className="fixed inset-0 z-10" data-no-joystick onClick={() => setIsMenuOpen(false)} />

                <div className="absolute left-0 top-14 z-20 bg-bg-surface/95 backdrop-blur-xl border border-border rounded-2xl shadow-2xl overflow-hidden min-w-[180px]">
                  {/* Camera Toggle */}
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 transition-colors"
                    onClick={() => { toggleCamera(); setIsMenuOpen(false); }}
                  >
                    {ui.cameraOn ? (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-slate-400">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75l16.5 16.5" />
                      </svg>
                    )}
                    <span className={ui.cameraOn ? '' : 'text-slate-400'}>{ui.cameraOn ? 'Camera On' : 'Camera Off'}</span>
                  </button>

                  {/* Camera Switch (Front/Back) - only show when camera is on */}
                  {ui.cameraOn && (
                    <button
                      className="w-full flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 transition-colors border-t border-white/5"
                      onClick={() => { toggleStreamCamera(); setIsMenuOpen(false); }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                      </svg>
                      <span>Switch Camera</span>
                    </button>
                  )}

                  {/* Video Chat Mode - Owner Only - Switch everyone to stream mode */}
                  {isPersonalRoom && mySbaId && personalRoomData && mySbaId === personalRoomData.owner_id && personalRoomMode === '3d' && (
                    <button
                      className="w-full flex items-center gap-3 px-4 py-3 text-green-400 hover:bg-green-500/10 transition-colors border-t border-white/5"
                      onClick={() => { setIsMenuOpen(false); setPersonalRoomMode('stream', personalRoomData.owner_id); }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                      </svg>
                      <span>Video Chat</span>
                    </button>
                  )}

                  {/* Mic Toggle */}
                  <button
                    className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/10 transition-colors border-t border-white/5 ${!micAllowed ? 'opacity-50' : ''}`}
                    onClick={() => { toggleMic(); setIsMenuOpen(false); }}
                    disabled={!micAllowed}
                  >
                    {micOn ? (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-white">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-slate-400">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75l16.5 16.5" />
                      </svg>
                    )}
                    <span className={micOn ? 'text-white' : 'text-slate-400'}>{micOn ? 'Mic On' : 'Mic Off'}</span>
                  </button>

                  {/* Mute Room */}
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/10 transition-colors border-t border-white/5"
                    onClick={() => { toggleSpeaker(); setIsMenuOpen(false); }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-5 h-5 ${speakerOn ? 'text-white' : 'text-slate-400'}`}>
                      {speakerOn ? (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                      )}
                    </svg>
                    <span className={speakerOn ? 'text-white' : 'text-slate-400'}>{speakerOn ? 'Room Audio On' : 'Room Muted'}</span>
                  </button>

                  {/* Edit Room Button - Owner Only - Only visible in standard mode */}
                  {isPersonalRoom && mySbaId && personalRoomData && mySbaId === personalRoomData.owner_id && (
                    <button
                      className="w-full flex items-center gap-3 px-4 py-3 text-purple-300 hover:bg-purple-500/10 transition-colors border-t border-white/5"
                      onClick={() => { setIsMenuOpen(false); setIsEditMode(true); }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.604a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                      </svg>
                      <span>Edit Room</span>
                    </button>
                  )}

                  {/* Edit Description - Owner Only */}
                  {isPersonalRoom && mySbaId && personalRoomData && mySbaId === personalRoomData.owner_id && (
                    <button
                      className="w-full flex items-center gap-3 px-4 py-3 text-purple-300 hover:bg-purple-500/10 transition-colors border-t border-white/5"
                      onClick={() => {
                        setIsMenuOpen(false);
                        setEditDescription(personalRoomData.description || '');
                        setShowDescriptionModal(true);
                      }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 0 1 1.037-.443 48.282 48.282 0 0 0 5.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
                      </svg>
                      <span className="whitespace-nowrap">Edit Description</span>
                    </button>
                  )}

                  {/* Leave Room */}
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 transition-colors border-t border-white/5"
                    onClick={() => { setIsMenuOpen(false); leave(); }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
                    </svg>
                    <span>Leave Room</span>
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div></div> // Spacing placeholder if needed, or null
        )}

        {/* Right Side: Standard Room Header UI (Coins, Count) - Hide in Edit Mode */}
        {!isEditMode && (
          <div className="flex items-center gap-2 pointer-events-auto">
            {/* Currency Button - Left of player count */}
            <CoinBalanceButton variant="room" />

            {/* Playroom Player Count - Tappable to open player list */}
            <button
              onClick={() => setIsPlayerListOpen(true)}
              className="flex items-center gap-2 bg-bg-surface/60 backdrop-blur-md border border-white/10 px-3 py-2 rounded-full shadow-xl h-[42px] active:scale-95 transition-transform"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-white">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
              </svg>
              <span className="text-white font-medium text-sm">{Object.keys(world.players).length}</span>
            </button>
          </div>
        )}
      </div>

      {/* Emote Button - positioned on right side below header */}
      < div
        className="fixed bottom-24 right-5 z-20 pointer-events-auto"
        style={{
          visibility: isChatOpen || isEditMode ? 'hidden' : 'visible', // Hide in Edit Mode
          opacity: isChatOpen || isEditMode ? 0 : 1,
          transition: 'opacity 0.2s ease-out'
        }}
      >
        <button
          className="h-12 w-12 rounded-full bg-bg-surface/60 backdrop-blur-md border border-white/10 text-white flex items-center justify-center shadow-xl active:scale-95 transition-all"
          onClick={() => setIsEmoteDrawerOpen(true)}
        >
          {/* Smiley Icon */}
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Z" />
          </svg>
        </button>
      </div >

      <SnakeGameCanvas
        gameMode={ui.gameMode}
        onExitGame={handleExitGameMode}
        onGameOver={handleGameOver}
        writeMyState={writeMyState}
      />

      <div className="absolute inset-0">
        {/* Force SceneRoot to destroy/recreate when slug changes to ensure fresh scene state */}
        <SceneRoot key={slug} paused={ui.gameMode || isCallActive}>
          {isPersonalRoom ? (
            // Personal room - wait for data before rendering anything
            personalRoomData && (
              <PersonalRoomScene
                roomData={personalRoomData}
                onWhiteboardCreated={(mesh) => {
                  console.log('[Room] Personal Room Whiteboard created', mesh);
                  setWhiteboardMesh(mesh);
                  // Compute aspect ratio from mesh bounding box
                  mesh.computeWorldMatrix(true);
                  const bounds = mesh.getBoundingInfo().boundingBox;
                  const meshWidth = bounds.maximumWorld.x - bounds.minimumWorld.x;
                  const meshHeight = bounds.maximumWorld.y - bounds.minimumWorld.y;
                  if (meshHeight > 0) {
                    setWhiteboardAspectRatio(meshWidth / meshHeight);
                    console.log('[Room] Whiteboard aspect ratio:', meshWidth / meshHeight);
                  }
                }}
                isEditMode={isEditMode}
                selectedItemId={selectedItemId}
                // onPlaceItem={handlePlaceItem} // Removed direct placement
                pendingPlacement={pendingPlacement}
                onPendingPlacementUpdate={handlePendingPlacementUpdate}
                editingInstanceId={editingInstanceId}
                onSelectItem={handleSelectExistingItem}
              />
            )
          ) : isCustomRoom ? (
            // Custom GLB Room
            <GLBEnvironment
              modelUrl={roomConfig.glbUrl!}
              spawnPointName={roomConfig.spawnPointName}
              scale={roomConfig.envScale}
              onSpawnPointFound={(pos: Vector3) => {
                console.log('[Room] Spawn point found:', pos.x, pos.y, pos.z);
                setCustomSpawnPoint(pos);

                // Teleport player to spawn point
                const newPos = { x: pos.x, y: pos.y, z: pos.z };

                // 1. Force update local ref (init if null)
                if (!localPlayerStateRef.current) {
                  localPlayerStateRef.current = {
                    pos: newPos,
                    rotY: 0,
                    anim: 'idle',
                    head: { q: [0, 0, 0, 1] },
                    blend: {},
                  };
                } else {
                  localPlayerStateRef.current.pos = newPos;
                }

                // 2. Update multiplayer state
                writeMyState({ pos: newPos }, true).then(() => {
                  console.log('[Room] Player teleported to spawn point');
                });

                // 3. Update React world state so Avatar re-renders at correct position
                if (myId !== 'none') {
                  setWorld(prev => {
                    const updated = { ...prev };
                    if (!updated.players) updated.players = {};
                    if (updated.players[myId]) {
                      updated.players[myId] = { ...updated.players[myId], pos: newPos };
                    }
                    return updated;
                  });
                }
              }}
            />
          ) : (
            // Default room - walls, furniture, arcade
            <>
              <Walls
                onWhiteboardCreated={(mesh) => {
                  console.log('[Room] Whiteboard mesh created', mesh);
                  setWhiteboardMesh(mesh);
                  // Compute aspect ratio from mesh bounding box
                  mesh.computeWorldMatrix(true);
                  const bounds = mesh.getBoundingInfo().boundingBox;
                  const meshWidth = bounds.maximumWorld.x - bounds.minimumWorld.x;
                  const meshHeight = bounds.maximumWorld.y - bounds.minimumWorld.y;
                  if (meshHeight > 0) {
                    setWhiteboardAspectRatio(meshWidth / meshHeight);
                    console.log('[Room] Whiteboard aspect ratio:', meshWidth / meshHeight);
                  }
                }}
              />
              <Furniture
                modelPath={resolveAssetUrl('arcade_machine.glb')}
                modelName="arcade_machine.glb"
                position={new Vector3(0, 0.01, 7.5)}
                rotation={new Vector3(0, Math.PI, 0)}
                scale={new Vector3(-0.015, 0.015, 0.015)}
              />
              {/* Collision boxes around arcade machines to prevent clipping inside */}
              {/* DEBUG: Set debug=true to see red boxes, change to false for production */}
              <CollisionBox
                name="arcade1_blocker"
                position={new Vector3(0, 1.5, 7.5)}
                size={new Vector3(3.0, 3.5, 3.0)}
                debug={true}
              />
              {/* Arcade2 - positioned based on player stuck at z=-8, x=0.7 */}
              <CollisionBox
                name="arcade2_blocker"
                position={new Vector3(0.7, 1.5, -8.0)}
                size={new Vector3(3.0, 3.5, 3.0)}
                debug={true}
              />
              {/* Additional blocker near bedazzled area */}
              <CollisionBox
                name="arcade3_blocker"
                position={new Vector3(-3, 1.5, -5.0)}
                size={new Vector3(3.0, 3.5, 3.0)}
                debug={true}
              />
              <ArcadeButton
                onToggleGame={handleToggleGameMode}
                isGameMode={ui.gameMode}
              />
            </>
          )}

          {whiteboardMesh && (
            <>
              <Whiteboard
                whiteboardMesh={whiteboardMesh}
                drawingMode={ui.drawingMode}
                onExitDrawingMode={handleExitDrawingMode}
                textureRef={whiteboardTextureRef}
                onTextureUpdated={handleTextureUpdated}
                roomKey={slug}
                aspectRatio={whiteboardAspectRatio}
              />
              {ui.drawingMode && (
                <WhiteboardCanvas
                  drawingMode={ui.drawingMode}
                  onExitDrawingMode={handleExitDrawingMode}
                  textureRef={whiteboardTextureRef}
                  onTextureUpdated={handleTextureUpdated}
                  roomKey={slug}
                  aspectRatio={whiteboardAspectRatio}
                  roomOwnerId={personalRoomData?.owner_id}
                />
              )}
            </>
          )}

          {/* Arcade collision boxes - positioned above floor to avoid interference */}
          {isCustomRoom && (
            <>
              {/* Snake arcade */}
              <CollisionBox
                name="snake_arcade_blocker"
                position={new Vector3(-13.67, 1.5, 10.33)}
                size={new Vector3(1.5, 3, 1.5)}
              />
              {/* Arcade2 (Bedazzled) */}
              <CollisionBox
                name="arcade2_blocker"
                position={new Vector3(0.7, 0.5, -8.0)}
                size={new Vector3(1.5, 3, 1.5)}
              />
            </>
          )}
          <CameraFollow />
          {/* Physics and Movement Controller - Wait for spawn point in custom rooms */}
          {(!isCustomRoom || customSpawnPoint) && (
            <PlayerController
              myId={myId}
              movementInput={movementInput}
              localPlayerStateRef={localPlayerStateRef}
              createFallbackPlayer={createFallbackPlayer}
              videoElement={videoRef.current}
              spawnPosition={customSpawnPoint ? { x: customSpawnPoint.x, y: customSpawnPoint.y, z: customSpawnPoint.z } : undefined}
            />
          )}
          {players.length > 0 ? (
            players.map(([id, playerState]) => {
              // For local player in custom room, use spawn position if available
              const effectiveState = id === myId && isCustomRoom && customSpawnPoint
                ? { ...playerState, pos: { x: customSpawnPoint.x, y: customSpawnPoint.y, z: customSpawnPoint.z } }
                : playerState;
              const isHiddenStreamer = id === currentStreamerId;
              if (playerState.isPlayingGame) return null;

              return !isEditMode || id !== myId ? ( // Hide local avatar in Edit Mode
                <Avatar
                  key={id}
                  playerId={id}
                  player={effectiveState}
                  isLocal={id === myId}
                  videoElement={id === myId && ui.cameraOn ? (videoRef.current as HTMLVideoElement) : undefined}
                  getLocalState={id === myId ? () => localPlayerStateRef.current : undefined}
                  onAvatarClick={handleAvatarClick}
                  onLoaded={id === myId ? handleAvatarLoaded : undefined}
                  hidden={isHiddenStreamer}
                />
              ) : null;
            })
          ) : (
            myId !== 'none' && (
              <Avatar
                key={`local-fallback-${customSpawnPoint ? 'spawned' : 'default'}`}
                playerId={myId}
                player={createFallbackPlayer()}
                isLocal={true}
                videoElement={ui.cameraOn ? videoRef.current || undefined : undefined}
                getLocalState={() => localPlayerStateRef.current}
                onAvatarClick={handleAvatarClick}
                onLoaded={handleAvatarLoaded}
              />
            )
          )}

          {/* Theater Screen Logic (Must be inside SceneRoot) */}
          {isTheater && (
            <TheaterScreen
              streamerId={currentStreamerId}
              videoElement={
                currentStreamerId
                  ? (currentStreamerId === myId
                    ? (cameraStream && videoRef.current ? videoRef.current : null)
                    : (remoteVideos[currentStreamerId] || null))
                  : null
              }
              screenMeshName="screen"
            />
          )}
        </SceneRoot>
        {/* Player Join/Leave Notifications - left-aligned above joystick */}
        {!ui.gameMode && !isChatOpen && (
          <div className="fixed bottom-32 left-4 z-20" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <PlayerActivityFeed worldPlayers={world.players} myPlayroomId={myId} />
          </div>
        )}
        {/* Hide Joystick when user is streaming, in game mode, or chat is open */}
        {!ui.gameMode && !isChatOpen && !isEditMode && currentStreamerId !== myId && <Joystick />}
        {!ui.gameMode && !isChatOpen && <ControlsTutorialOverlay />}

        {/* Chess Action Button - shows when near chess_board */}
        <ActionButton
          icon={<img src={brandAssetUrls.chessLogo} alt="Chess" className="w-full h-full object-contain drop-shadow-md" />}
          label="Play Chess"
          visible={nearChessBoard && !ui.gameMode && !isChatOpen && !isChessOpen && !ui.drawingMode}
          onClick={() => { if (!hasPlayedGame) { setHasPlayedGame(true); localStorage.setItem('hasPlayedGame', 'true'); } openChessModal(); }}
          className="fixed bottom-8 right-20"
          bounce={!hasPlayedGame}
        />

        {/* Whiteboard Action Button - shows when near whiteboard */}
        <ActionButton
          icon={<span className="text-2xl">✏️</span>}
          label="Draw"
          visible={nearWhiteboard && !ui.drawingMode && !ui.gameMode && !isChatOpen && !isChessOpen}
          onClick={handleToggleDrawingMode}
          className="fixed bottom-8 right-20"
        />

        {/* Arcade Action Button - shows when near arcade machine */}
        <ActionButton
          icon={<img src={brandAssetUrls.snakeLogo} alt="Snake" className="w-full h-full object-contain drop-shadow-md" />}
          label="Play Snake"
          visible={nearArcade && !ui.gameMode && !isChatOpen && !isChessOpen && !isSnakeOpen && !isMatch3Open && !ui.drawingMode}
          onClick={() => { if (!hasPlayedGame) { setHasPlayedGame(true); localStorage.setItem('hasPlayedGame', 'true'); } openSnakeModal(); }}
          className="fixed bottom-8 right-20"
          bounce={!hasPlayedGame}
        />

        {/* Arcade2 Action Button - shows when near arcade2 machine */}
        <ActionButton
          icon={<span className="text-3xl">💎</span>}
          label="Play Bedazzled"
          visible={nearArcade2 && !ui.gameMode && !isChatOpen && !isChessOpen && !isSnakeOpen && !isMatch3Open && !ui.drawingMode}
          onClick={() => { if (!hasPlayedGame) { setHasPlayedGame(true); localStorage.setItem('hasPlayedGame', 'true'); } openMatch3Modal(); }}
          className="fixed bottom-8 right-20"
          bounce={!hasPlayedGame}
        />
        {/* Chess Game Fullscreen Overlay */}
        {isChessOpen && (
          <ChessGameCanvas
            onClose={closeChessModal}
            onGameEnd={(won) => {
              console.log('[Room] Chess game ended, won:', won);
              // TODO: Submit to leaderboard
            }}
            players={players.map(([id, state]) => ({ id, state }))}
            myPlayroomId={myId || undefined}
            writeMyState={writeMyState}
          />
        )}

        {/* Snake Game Fullscreen Overlay */}
        {isSnakeOpen && (
          <SnakeGameCanvas
            gameMode={true}
            onExitGame={closeSnakeModal}
            onGameOver={async (score) => {
              console.log('[Room] Snake game over, score:', score);
              // Submit score to database
              if (authProfile?.username && mySbaId) {
                try {
                  await supabase.from('scores').insert({
                    user_id: mySbaId,
                    username: authProfile.username,
                    score: score,
                    game: 'snake'
                  });
                  console.log('[Room] Snake score saved:', score);
                } catch (err) {
                  console.error('[Room] Failed to save snake score:', err);
                }
              }
            }}
            writeMyState={writeMyState}
          />
        )}

        {/* Match-3 Game Fullscreen Overlay */}
        {isMatch3Open && (
          <Match3GameCanvas
            gameMode={true}
            onExitGame={closeMatch3Modal}
            onGameOver={async (score) => {
              console.log('[Room] Match3 game over, score:', score);
              // Submit score to database
              if (authProfile?.username && mySbaId) {
                try {
                  await supabase.from('scores').insert({
                    user_id: mySbaId,
                    username: authProfile.username,
                    score: score,
                    game: 'match3'
                  });
                  console.log('[Room] Match3 score saved:', score);
                } catch (err) {
                  console.error('[Room] Failed to save match3 score:', err);
                }
              }
            }}
            writeMyState={writeMyState}
          />
        )}

        {/* Global Leaderboard Overlay */}
        {ui.gameMode && (
          <>
            {/* Leaderboard Overlay */}
            <div className="absolute top-4 left-4 z-10 hidden sm:block pointer-events-none">
              <div className="bg-slate-900/40 p-4 rounded-xl border border-brand-primary/20 backdrop-blur-md w-64">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span className="text-brand-primary">🏆</span> Global Leaders
                </h3>
                <div className="space-y-1">
                  {leaderboard.scores.length === 0 ? (
                    <div className="text-xs text-slate-500 italic">No scores yet</div>
                  ) : (
                    leaderboard.scores.slice(0, 5).map((entry, i) => (
                      <div key={`${entry.playerName}-${entry.score}-${i}`} className="flex justify-between items-center text-sm">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <span className={`
                            text-xs font-mono w-4 h-4 flex items-center justify-center rounded
                            ${i === 0 ? 'bg-brand-secondary text-black font-bold' :
                              i === 1 ? 'bg-slate-400 text-black' :
                                i === 2 ? 'bg-amber-700 text-white' : 'text-slate-500'}
                          `}>
                            {i + 1}
                          </span>
                          <span className="truncate text-slate-200">{entry.playerName}</span>
                        </div>
                        <span className="font-mono text-brand-primary font-bold">{entry.score}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
            {/* My Rank (mockup for now as we don't have easy fetch of my rank efficiently yet) */}
          </>
        )}

        <EmoteDrawer
          isOpen={isEmoteDrawerOpen}
          onClose={() => setIsEmoteDrawerOpen(false)}
          onSelectEmote={useCallback(async (emoteType: string) => {
            console.log('[Room] Emote selected:', emoteType);
            setIsEmoteDrawerOpen(false);

            // Create new emote state object
            const emoteState = {
              type: emoteType,
              timestamp: Date.now()
            };

            // CRITICAL: Update local ref IMMUTABLY to ensure state comparison in subscribeState detects the change
            // If we mutate in place, prevWorld and newWorld both point to same object -> no re-render
            if (localPlayerStateRef.current) {
              localPlayerStateRef.current = {
                ...localPlayerStateRef.current,
                emote: emoteState
              };

              // Force an immediate world update for the local player to see it instantly
              setWorld((prev) => {
                const updated = { ...prev };
                if (updated.players) {
                  // CRITICAL: Must create a shallow copy of players object!
                  // Otherwise updated.players points to prev.players, and useMemo dependency [world.players] doesn't change
                  updated.players = { ...updated.players };

                  if (myId) {
                    updated.players[myId] = localPlayerStateRef.current!;
                  }
                }
                return updated;
              });
            }

            // Write to network
            try {
              await writeMyState({ emote: emoteState });
              console.log('[Room] Wrote emote state to Playroom:', emoteState);
            } catch (e) {
              console.error('[Room] Failed to write emote state', e);
            }
          }, [myId, localPlayerStateRef, setWorld, writeMyState, setIsEmoteDrawerOpen])}
          onSelectBodyEmote={useCallback(async (animName: string) => {
            console.log('[Room] Body Emote selected:', animName);
            setIsEmoteDrawerOpen(false);

            // Update local state immediately
            if (localPlayerStateRef.current) {
              localPlayerStateRef.current = {
                ...localPlayerStateRef.current,
                anim: animName
              };

              // Force an immediate world update for the local player to see provided visual feedback
              setWorld((prev) => {
                const updated = { ...prev };
                if (updated.players) {
                  updated.players = { ...updated.players };
                  if (myId) {
                    updated.players[myId] = localPlayerStateRef.current!;
                  }
                }
                return updated;
              });
            }

            // Write to network
            try {
              await writeMyState({ anim: animName });
              console.log('[Room] Wrote body emote animation:', animName);
            } catch (e) {
              console.error('[Room] Failed to write body emote', e);
            }
          }, [myId, localPlayerStateRef, setWorld, writeMyState, setIsEmoteDrawerOpen])}
        />

        {/* Player List Drawer */}
        <PlayerListDrawer
          isOpen={isPlayerListOpen}
          onClose={() => setIsPlayerListOpen(false)}
          players={players}
          myId={myId}
        />

        {ui.gameMode && (
          <SnakeGameCanvas
            gameMode={ui.gameMode}
            onExitGame={handleExitGameMode}
            onGameOver={handleGameOver}
          />
        )}

        {/* Edit Mode HUD - Rendered when isEditMode is true (triggered from menu) */}
        {isEditMode && (
          <EditControls
            isEditMode={isEditMode}
            onToggleEditMode={handleToggleEditMode}
            onSave={handleSaveRoom}
            selectedItemId={selectedItemId}
            onSelectItem={handleEditControlSelectItem}
            onSelectFloor={handleSelectFloor}
            onSelectWall={handleSelectWall}
            isPlacementLocked={pendingPlacement?.isLocked || false}
            onConfirmPlacement={handleConfirmPlacement}
            onRotatePlacement={handleRotatePending}
            onCancelPlacement={handleCancelPlacement}
            onDelete={editingInstanceId ? () => handleDeleteItem(editingInstanceId) : undefined}
          />
        )}

        {/* Chat Overlay */}
        {!ui.gameMode && <ChatOverlay onOpenChange={setIsChatOpen} />}

        {/* VoiceChat - manages audio/video */}
        {/* DEFERRED: Wait for sceneReady to avoid concurrent memory spike */}
        {/* that crashes iOS WKWebView (GLB + Agora both loading at once) */}
        {myId !== 'none' && roomCode && sceneReady && (
          <VoiceChat
            uid={myId}
            roomCode={roomCode}
            cameraStream={cameraStream}
            cameraEnabled={ui.cameraOn}
          />
        )}

        {/* Theater Streaming UI */}
        {isTheater && myId !== 'none' && (
          <>
            {/* Viewer UI - shows opt-in, voting, gift drawer */}
            {currentStreamerId !== myId && (
              <ViewerUI
                myId={myId}
                myName={localPlayerStateRef.current?.profile?.name || 'Guest'}
                myAvatarUrl={localPlayerStateRef.current?.avatarUrl}
                onOptIn={() => optIn(myId, localPlayerStateRef.current?.profile?.name || 'Guest', localPlayerStateRef.current?.avatarUrl)}
                onVote={castVote}
                onAccept={acceptStream}
                onDecline={declineStream}
                onSendGift={(giftId, giftName) => {
                  console.log('[Room] 🎁 onSendGift CLICKED. Gift:', giftName);

                  // CRITICAL: Supabase UUIDs check
                  const mySbaId = useAuthStore.getState().user?.id;
                  const streamerSbaId = useStreamingStore.getState().currentStreamerSbaId;

                  console.log('[Room] 🔍 ID Check:', {
                    mySbaId: mySbaId || 'MISSING (Not logged in?)',
                    streamerSbaId: streamerSbaId || 'MISSING (Streamer ID not synced?)',
                    giftId
                  });

                  if (!mySbaId) {
                    console.error('[Room] ❌ ABORT: Missing MY Supabase UUID.');
                    return;
                  }
                  if (!streamerSbaId) {
                    console.error('[Room] ❌ ABORT: Missing STREAMER Supabase UUID. (Viewer client likely doesn\'t know it yet)');
                    // TODO: Sync this via Playroom state if missing
                    return;
                  }

                  console.log('[Room] ✅ IDs OK. Calling sendGift...');
                  sendGift(mySbaId, streamerSbaId, giftId, giftName, localPlayerStateRef.current?.profile?.name || 'Guest');
                }}
              />
            )}

            {/* Streamer UI - shown when user is streaming */}
            {currentStreamerId === myId && (
              <StreamerUI
                onEndStream={() => useStreamingStore.getState().endStream()}
                onToggleCamera={toggleStreamCamera}
                onToggleCameraOnOff={toggleCamera}
                cameraOn={ui.cameraOn}
                viewerCount={Object.keys(world.players).length - 1}
                localStream={cameraStream}
              />
            )}
          </>
        )}

        {/* Personal Room Stream Mode Overlay */}
        {isPersonalRoom && personalRoomMode === 'stream' && slug && (
          <PersonalRoomStreamOverlay
            roomSlug={slug}
            isOwner={!!(mySbaId && personalRoomData?.owner_id === mySbaId)}
            onExitStream={() => {
              // When exiting, owner will broadcast mode change in the overlay
              // Non-owners just close their overlay (the RPC will update their state)
            }}
            onLeaveRoom={leave}
            world={world}
          />
        )}

        {selectedPlayerId && !ui.drawingMode && !ui.gameMode && (
          <AvatarProfileModal
            playerId={selectedPlayerId}
            onClose={handleCloseModal}
            profile={world.players[selectedPlayerId]?.profile || null}
          />
        )}

        {/* Edit Description Modal */}
        {showDescriptionModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
            <div className="bg-bg-surface rounded-2xl p-6 max-w-sm w-full border border-border shadow-2xl">
              <h3 className="text-lg font-bold text-white mb-4">Edit Room Description</h3>
              <textarea
                className="w-full bg-bg-elevated border border-border rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-purple-500 resize-none"
                rows={3}
                maxLength={100}
                placeholder="Describe your room..."
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
              <div className="text-right text-xs text-slate-500 mt-1 mb-4">
                {editDescription.length}/100
              </div>
              <div className="flex gap-3">
                <button
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                  onClick={() => setShowDescriptionModal(false)}
                >
                  Cancel
                </button>
                <button
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-white text-black hover:bg-slate-200 transition-colors disabled:opacity-50"
                  disabled={savingDescription}
                  onClick={async () => {
                    if (!personalRoomData?.room_id) return;
                    setSavingDescription(true);
                    try {
                      const { error } = await supabase
                        .from('rooms')
                        .update({ description: editDescription.trim() })
                        .eq('id', personalRoomData.room_id);
                      if (error) throw error;
                      setPersonalRoomData((prev: any) => prev ? { ...prev, description: editDescription.trim() } : null);
                      setShowDescriptionModal(false);
                    } catch (err) {
                      console.error('[Room] Failed to update description:', err);
                    } finally {
                      setSavingDescription(false);
                    }
                  }}
                >
                  {savingDescription ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div >
  );
}

export default Room;
