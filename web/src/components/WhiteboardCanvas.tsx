import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DynamicTexture } from '@babylonjs/core';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { Undo, Trash2, Check, X, Flag } from 'lucide-react';
import { getMyId } from '../multiplayer/playroom';
import {
  broadcastStroke,
  forceSaveNow,
  undoLastStroke,
  clearMyStrokes,
  getWhiteboardStatePublic,
  replayStrokes,
  type DrawingStroke,
} from '../multiplayer/whiteboardSync';
import { ReportModal } from './ReportModal';
import { notifyWhiteboardMessage } from '../lib/pushNotify';
import { useAuthStore } from '../state/authStore';

const DEFAULT_COLOR = '#000000';
const DEFAULT_LINE_WIDTH = 5;

type WhiteboardCanvasProps = {
  drawingMode: boolean;
  onExitDrawingMode: () => void;
  textureRef: React.MutableRefObject<DynamicTexture | null>;
  onTextureUpdated: () => void;
  roomKey?: string;
  aspectRatio?: number;
  roomOwnerId?: string;
};

export function WhiteboardCanvas({
  drawingMode,
  onExitDrawingMode,
  textureRef,
  onTextureUpdated,
  roomKey,
  aspectRatio = 5,
  roomOwnerId,
}: WhiteboardCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const currentStrokeRef = useRef<DrawingStroke | null>(null);
  const drawerIdsRef = useRef<Set<string>>(new Set());
  const hasDrawnRef = useRef(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // Use refs for callbacks so DOM event handlers always call the latest version
  const handleDoneRef = useRef<() => void>(() => { });
  const handleCancelRef = useRef<() => void>(() => { });

  // Update refs
  useEffect(() => {
    handleDoneRef.current = async () => {
      // Save any pending stroke
      if (currentStrokeRef.current && currentStrokeRef.current.points.length >= 2) {
        await broadcastStroke(currentStrokeRef.current, roomKey);
        currentStrokeRef.current = null;
      }

      await forceSaveNow(roomKey);
      saveCanvasToTexture();

      if (hasDrawnRef.current && roomOwnerId) {
        const currentUserId = useAuthStore.getState().user?.id;
        if (currentUserId && currentUserId !== roomOwnerId) {
          const drawerName = useAuthStore.getState().profile?.username || 'Someone';
          notifyWhiteboardMessage(roomOwnerId, drawerName, roomKey || '')
            .catch((err) => console.error('[WhiteboardCanvas] Failed to send notification:', err));
        }
      }

      setTimeout(() => {
        ScreenOrientation.lock({ orientation: 'portrait' }).catch(() => { });
        onExitDrawingMode();
      }, 100);
    };

    handleCancelRef.current = () => {
      ScreenOrientation.lock({ orientation: 'portrait' }).catch(() => { });
      onExitDrawingMode();
    };
  });

  const handleUndo = async () => {
    const myId = getMyId();
    if (!myId) return;
    await undoLastStroke(roomKey, myId);
    await redrawCanvasFromState();
  };

  const handleClear = async () => {
    const myId = getMyId();
    if (!myId) return;
    await clearMyStrokes(roomKey, myId);
    await redrawCanvasFromState();
  };

  const saveCanvasToTexture = () => {
    if (!canvasRef.current || !textureRef.current) return;
    const canvas = canvasRef.current;
    const texture = textureRef.current;

    try {
      const imageData = canvas.toDataURL('image/png');
      const img = new Image();
      img.onload = () => {
        try {
          const textureCtx = texture.getContext();
          const texW = texture.getSize().width;
          const texH = texture.getSize().height;

          textureCtx.clearRect(0, 0, texW, texH);
          textureCtx.fillStyle = '#f5f5f0';
          textureCtx.fillRect(0, 0, texW, texH);
          textureCtx.drawImage(img, 0, 0, texW, texH);
          texture.update();

          const internalTexture = texture.getInternalTexture();
          if (internalTexture) internalTexture.update();
          onTextureUpdated();
        } catch (error) {
          console.error('[WhiteboardCanvas] Error drawing to texture', error);
        }
      };
      img.src = imageData;
    } catch (error) {
      console.error('[WhiteboardCanvas] Error saving canvas', error);
    }
  };

  const redrawCanvasFromState = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#f5f5f0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const state = await getWhiteboardStatePublic(roomKey);
    replayStrokes(ctx as any, state.strokes, canvas.width, canvas.height);
  };

  // Orientation and Ready State management
  useEffect(() => {
    if (!drawingMode) {
      setIsReady(false);
      return;
    }

    hasDrawnRef.current = false;

    ScreenOrientation.lock({ orientation: 'landscape' }).catch((err) => {
      console.log('[WhiteboardCanvas] Landscape lock not supported:', err);
    });

    const timer = setTimeout(() => {
      setIsReady(true);
    }, 300);

    return () => {
      clearTimeout(timer);
      ScreenOrientation.lock({ orientation: 'portrait' }).catch(() => { });
    };
  }, [drawingMode]);

  // Canvas Drawing Logic
  useEffect(() => {
    if (!isReady || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size (aspect ratio aware)
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const canvasW = screenW;
    const canvasH = Math.min(Math.round(screenW / aspectRatio), screenH);

    canvas.width = canvasW;
    canvas.height = canvasH;

    // Load initial content
    ctx.fillStyle = '#f5f5f0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (textureRef.current) {
      try {
        const textureCtx = textureRef.current.getContext();
        if (textureCtx && textureCtx.canvas) {
          ctx.drawImage(textureCtx.canvas as any, 0, 0, canvas.width, canvas.height);
        }
      } catch (error) {
        console.error('[WhiteboardCanvas] Error loading existing texture', error);
      }
    }

    // Event Handlers
    const getCanvasPoint = (e: MouseEvent | TouchEvent): { x: number; y: number } | null => {
      const rect = canvas.getBoundingClientRect();
      const clientX = 'touches' in e ? (e.touches[0]?.clientX ?? e.changedTouches[0]?.clientX) : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? (e.touches[0]?.clientY ?? e.changedTouches[0]?.clientY) : (e as MouseEvent).clientY;
      if (clientX === undefined || clientY === undefined) return null;
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const startDrawing = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const point = getCanvasPoint(e);
      if (!point || !ctx) return;

      isDrawingRef.current = true;
      lastPointRef.current = point;
      hasDrawnRef.current = true;

      const myId = getMyId();
      if (!myId) return;

      drawerIdsRef.current.add(myId);

      currentStrokeRef.current = {
        id: `${myId}-${Date.now()}-${Math.random()}`,
        points: [{ x: point.x / canvas.width, y: point.y / canvas.height }],
        color: DEFAULT_COLOR,
        lineWidth: DEFAULT_LINE_WIDTH,
        timestamp: Date.now(),
        playerId: myId,
      };
    };

    const draw = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isDrawingRef.current || !ctx || !lastPointRef.current) return;

      const point = getCanvasPoint(e);
      if (!point) return;

      ctx.beginPath();
      ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
      ctx.lineTo(point.x, point.y);
      ctx.strokeStyle = DEFAULT_COLOR;
      ctx.lineWidth = DEFAULT_LINE_WIDTH;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      if (currentStrokeRef.current) {
        currentStrokeRef.current.points.push({
          x: point.x / canvas.width,
          y: point.y / canvas.height,
        });
      }
      lastPointRef.current = point;
    };

    const stopDrawing = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isDrawingRef.current) return;

      isDrawingRef.current = false;
      lastPointRef.current = null;

      if (currentStrokeRef.current && currentStrokeRef.current.points.length >= 2) {
        broadcastStroke(currentStrokeRef.current, roomKey);
      }
      currentStrokeRef.current = null;
    };

    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseleave', stopDrawing);
    canvas.addEventListener('touchstart', startDrawing, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', stopDrawing, { passive: false });
    canvas.addEventListener('touchcancel', stopDrawing, { passive: false });

    // Handle ESC
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCancelRef.current();
    };
    document.addEventListener('keydown', handleEsc);

    return () => {
      canvas.removeEventListener('mousedown', startDrawing);
      canvas.removeEventListener('mousemove', draw);
      canvas.removeEventListener('mouseup', stopDrawing);
      canvas.removeEventListener('mouseleave', stopDrawing);
      canvas.removeEventListener('touchstart', startDrawing);
      canvas.removeEventListener('touchmove', draw);
      canvas.removeEventListener('touchend', stopDrawing);
      canvas.removeEventListener('touchcancel', stopDrawing);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isReady, aspectRatio, roomKey]);

  if (!isReady) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-[#1a1a1a] flex items-center justify-center touch-none">
      {/* Canvas Layer */}
      <canvas
        ref={canvasRef}
        className="absolute bg-[#f5f5f0] cursor-crosshair touch-none shadow-2xl"
        style={{
          // Dynamically centered in useEffect, but we'll use flex centering here
          // Dimensions are set in JS, but this helps initially
          maxWidth: '100%',
          maxHeight: '100%'
        }}
      />

      {/* Top Controls */}
      <div
        className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start pointer-events-none"
        style={{ paddingTop: 'max(16px, env(safe-area-inset-top))', paddingRight: 'max(16px, env(safe-area-inset-right))', paddingLeft: 'max(16px, env(safe-area-inset-left))' }}
      >
        {/* Cancel (Left) */}
        <button
          onClick={(e) => { e.preventDefault(); handleCancelRef.current(); }}
          className="pointer-events-auto p-3 rounded-full bg-black/40 hover:bg-black/60 text-white/80 hover:text-white backdrop-blur-md transition-all active:scale-95"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Report (Right) */}
        <button
          onClick={(e) => { e.preventDefault(); setShowReportModal(true); }}
          className="pointer-events-auto p-3 rounded-full bg-red-500/20 hover:bg-red-500/30 text-red-200 hover:text-red-100 backdrop-blur-md transition-all active:scale-95 border border-red-500/20"
        >
          <Flag className="w-6 h-6" />
        </button>
      </div>

      {/* Bottom Toolbar */}
      <div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-auto"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center gap-3 p-2 pl-3 rounded-full bg-black/60 backdrop-blur-xl border border-white/10 shadow-2xl">

          {/* Undo */}
          <button
            onClick={(e) => { e.preventDefault(); handleUndo(); }}
            className="p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all active:scale-95"
            aria-label="Undo"
          >
            <Undo className="w-5 h-5" />
          </button>

          {/* Clear */}
          <button
            onClick={(e) => { e.preventDefault(); handleClear(); }}
            className="p-3 rounded-full bg-white/10 hover:bg-white/20 text-amber-400 hover:text-amber-300 transition-all active:scale-95 mx-1"
            aria-label="Clear All"
          >
            <Trash2 className="w-5 h-5" />
          </button>

          {/* Divider */}
          <div className="w-px h-8 bg-white/10 mx-1" />

          {/* Done - Primary Action */}
          <button
            onClick={(e) => { e.preventDefault(); handleDoneRef.current(); }}
            className="px-6 py-3 rounded-full bg-white text-black font-bold flex items-center gap-2 hover:bg-gray-100 transition-all active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.2)]"
          >
            <Check className="w-5 h-5" />
            <span>Done</span>
          </button>
        </div>
      </div>

      {showReportModal && (
        <ReportModal
          isOpen={showReportModal}
          onClose={() => setShowReportModal(false)}
          reportedUserId={Array.from(drawerIdsRef.current)[0] || ''}
          reportedUserName="Whiteboard Content"
          contextType="whiteboard"
          contextDetail={JSON.stringify({
            roomKey: roomKey || 'unknown',
            drawerIds: Array.from(drawerIdsRef.current),
          })}
        />
      )}
    </div>,
    document.body
  );
}
