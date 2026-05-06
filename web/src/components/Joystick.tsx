import { useCallback, useEffect, useRef, useState } from 'react';
import { useJoystickMovement } from '../state/movement';
import { useControlsPrefsStore } from '../state/controlsPrefsStore';

const JOYSTICK_SIZE = 80;
const JOYSTICK_RADIUS = 40;
const DEADZONE = 0.1;
const SMOOTHING = 0.2;
const FADE_DURATION = 150; // ms for fade in/out

type Vector = { x: number; y: number };
const lerp = (start: Vector, end: Vector, t: number): Vector => ({
  x: start.x + (end.x - start.x) * t,
  y: start.y + (end.y - start.y) * t,
});

// ─────────────────────────────────────────────
// Check if a touch target is an interactive element
// that should NOT be intercepted by the joystick
// ─────────────────────────────────────────────
function isInteractiveElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement) && !(target instanceof SVGElement)) return false;
  const el = target instanceof SVGElement ? target.closest('button, a, [role="button"], [data-no-joystick]') ?? target.parentElement : target;
  if (!el) return false;
  const interactive = (el as HTMLElement).closest(
    'button, a, input, textarea, select, [role="button"], [data-no-joystick], svg'
  );
  if (interactive !== null) return true;

  // Check if touch is inside a fixed overlay (e.g. FullScreenViewer at z-50)
  // These overlays should block all joystick input — document-level listeners
  // bypass z-index so we must check manually
  let current: HTMLElement | null = el instanceof HTMLElement ? el : el.parentElement;
  while (current && current !== document.body) {
    const style = window.getComputedStyle(current);
    if (style.position === 'fixed' && parseInt(style.zIndex || '0', 10) >= 40) {
      return true;
    }
    current = current.parentElement;
  }

  return false;
}

// ═══════════════════════════════════════════════
// DYNAMIC JOYSTICK (Roblox-style)
// ═══════════════════════════════════════════════
function DynamicJoystick() {
  const [, setInput] = useJoystickMovement();
  const [isActive, setIsActive] = useState(false);
  const [origin, setOrigin] = useState<Vector>({ x: 0, y: 0 });
  const [thumbOffset, setThumbOffset] = useState<Vector>({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);
  const activeTouchIdRef = useRef<number | null>(null);
  const targetOffsetRef = useRef<Vector>({ x: 0, y: 0 });
  const animFrameRef = useRef<number | null>(null);

  const updateInput = useCallback((x: number, y: number) => {
    const distance = Math.sqrt(x * x + y * y);
    let clampedX = x;
    let clampedY = y;

    if (distance > JOYSTICK_RADIUS) {
      const angle = Math.atan2(y, x);
      clampedX = Math.cos(angle) * JOYSTICK_RADIUS;
      clampedY = Math.sin(angle) * JOYSTICK_RADIUS;
    }

    targetOffsetRef.current = { x: clampedX, y: clampedY };

    const normalizedX = clampedX / JOYSTICK_RADIUS;
    const normalizedY = clampedY / JOYSTICK_RADIUS;

    if (Math.abs(normalizedX) < DEADZONE && Math.abs(normalizedY) < DEADZONE) {
      setInput({ forward: 0, right: 0 });
    } else {
      setInput({ forward: -normalizedY, right: normalizedX });
    }
  }, [setInput]);

  // Smooth interpolation loop for thumb position
  useEffect(() => {
    const animate = () => {
      setThumbOffset((current) => {
        const next = lerp(current, targetOffsetRef.current, SMOOTHING);
        if (Math.abs(next.x - current.x) < 0.5 && Math.abs(next.y - current.y) < 0.5) {
          return targetOffsetRef.current;
        }
        return next;
      });
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // Touch event handlers on the left-half zone
  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      // Already tracking a touch
      if (activeTouchIdRef.current !== null) return;
      // Don't intercept taps on buttons/inputs/icons
      if (isInteractiveElement(e.target)) return;

      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        // Only activate on left half of screen
        if (touch.clientX > window.innerWidth / 2) continue;
        // Exclude top safe area + header (80px accounts for safe-area + UI bar)
        if (touch.clientY < 80) continue;

        e.preventDefault();
        activeTouchIdRef.current = touch.identifier;
        const originPos = { x: touch.clientX, y: touch.clientY };
        setOrigin(originPos);
        setIsActive(true);
        setOpacity(1);
        targetOffsetRef.current = { x: 0, y: 0 };
        setThumbOffset({ x: 0, y: 0 });
        break;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (activeTouchIdRef.current === null) return;

      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier !== activeTouchIdRef.current) continue;

        e.preventDefault();
        // Use stale-safe origin via reading from DOM state
        const originEl = document.getElementById('dyn-joystick-base');
        if (!originEl) return;
        const rect = originEl.getBoundingClientRect();
        const originX = rect.left + rect.width / 2;
        const originY = rect.top + rect.height / 2;

        updateInput(touch.clientX - originX, touch.clientY - originY);
        break;
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (activeTouchIdRef.current === null) return;

      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier !== activeTouchIdRef.current) continue;

        activeTouchIdRef.current = null;
        setIsActive(false);
        setOpacity(0);
        targetOffsetRef.current = { x: 0, y: 0 };
        setInput({ forward: 0, right: 0 });
        break;
      }
    };

    // Listen on document to catch all touches
    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
    document.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [setInput, updateInput]);

  if (!isActive && opacity === 0) return null;

  return (
    <div
      id="dyn-joystick-base"
      className="fixed pointer-events-none z-40"
      style={{
        left: origin.x - JOYSTICK_SIZE / 2,
        top: origin.y - JOYSTICK_SIZE / 2,
        width: JOYSTICK_SIZE,
        height: JOYSTICK_SIZE,
        opacity,
        transition: `opacity ${FADE_DURATION}ms ease-out`,
      }}
    >
      {/* Base ring */}
      <div
        className="absolute rounded-full bg-white/15 border-2 border-white/25"
        style={{
          width: JOYSTICK_SIZE,
          height: JOYSTICK_SIZE,
          left: 0,
          top: 0,
        }}
      />
      {/* Thumb */}
      <div
        className="absolute rounded-full bg-white/50 border-2 border-white/60"
        style={{
          width: JOYSTICK_RADIUS,
          height: JOYSTICK_RADIUS,
          left: JOYSTICK_SIZE / 2 + thumbOffset.x,
          top: JOYSTICK_SIZE / 2 + thumbOffset.y,
          transform: 'translate(-50%, -50%)',
        }}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════
// FIXED JOYSTICK (classic always-visible)
// ═══════════════════════════════════════════════
function FixedJoystick() {
  const [, setInput] = useJoystickMovement();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isActive, setIsActive] = useState(false);
  const [position, setPosition] = useState<Vector>({ x: 0, y: 0 });
  const targetPositionRef = useRef<Vector>({ x: 0, y: 0 });
  const animationFrameRef = useRef<number | null>(null);

  const handleStart = (e: TouchEvent | MouseEvent) => {
    e.preventDefault();
    setIsActive(true);

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const clientX = 'touches' in e ? (e.touches[0]?.clientX ?? e.changedTouches[0]?.clientX) : (e as MouseEvent).clientX;
    const clientY = 'touches' in e ? (e.touches[0]?.clientY ?? e.changedTouches[0]?.clientY) : (e as MouseEvent).clientY;

    updateFromPos(
      clientX - rect.left - rect.width / 2,
      clientY - rect.top - rect.height / 2
    );
  };

  const handleMove = (e: TouchEvent | MouseEvent) => {
    if (!isActive) return;
    e.preventDefault();

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const clientX = 'touches' in e ? (e.touches[0]?.clientX ?? e.changedTouches[0]?.clientX) : (e as MouseEvent).clientX;
    const clientY = 'touches' in e ? (e.touches[0]?.clientY ?? e.changedTouches[0]?.clientY) : (e as MouseEvent).clientY;

    updateFromPos(
      clientX - rect.left - rect.width / 2,
      clientY - rect.top - rect.height / 2
    );
  };

  const updateFromPos = (x: number, y: number) => {
    const distance = Math.sqrt(x * x + y * y);
    const maxDistance = JOYSTICK_RADIUS;

    let clampedX = x;
    let clampedY = y;

    if (distance > maxDistance) {
      const angle = Math.atan2(y, x);
      clampedX = Math.cos(angle) * maxDistance;
      clampedY = Math.sin(angle) * maxDistance;
    }

    targetPositionRef.current = { x: clampedX, y: clampedY };

    const normalizedX = clampedX / maxDistance;
    const normalizedY = clampedY / maxDistance;

    if (Math.abs(normalizedX) < DEADZONE && Math.abs(normalizedY) < DEADZONE) {
      setInput({ forward: 0, right: 0 });
    } else {
      setInput({
        forward: -normalizedY,
        right: normalizedX,
      });
    }
  };

  const handleEnd = (e: TouchEvent | MouseEvent) => {
    e.preventDefault();
    setIsActive(false);
    targetPositionRef.current = { x: 0, y: 0 };
    setInput({ forward: 0, right: 0 });
  };

  // Smooth interpolation loop
  useEffect(() => {
    const animate = () => {
      setPosition((current) => {
        const next = lerp(current, targetPositionRef.current, SMOOTHING);
        if (
          Math.abs(next.x - current.x) < 0.001 &&
          Math.abs(next.y - current.y) < 0.001
        ) {
          return targetPositionRef.current;
        }
        return next;
      });
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    container.addEventListener('touchstart', handleStart, { passive: false });
    container.addEventListener('touchmove', handleMove, { passive: false });
    container.addEventListener('touchend', handleEnd);
    container.addEventListener('touchcancel', handleEnd);
    container.addEventListener('mousedown', handleStart);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);

    return () => {
      container.removeEventListener('touchstart', handleStart);
      container.removeEventListener('touchmove', handleMove);
      container.removeEventListener('touchend', handleEnd);
      container.removeEventListener('touchcancel', handleEnd);
      container.removeEventListener('mousedown', handleStart);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
    };
  }, [isActive]);

  return (
    <div
      ref={containerRef}
      className="absolute bottom-6 left-6 touch-none select-none z-50"
      style={{
        width: JOYSTICK_SIZE,
        height: JOYSTICK_SIZE,
        zIndex: 50,
      }}
    >
      <div
        className="absolute rounded-full bg-bg-elevated/60 border-2 border-border"
        style={{
          width: JOYSTICK_SIZE,
          height: JOYSTICK_SIZE,
          left: 0,
          top: 0,
        }}
      />
      <div
        className="absolute rounded-full bg-text-disabled/80 border-2 border-text-secondary transition-transform"
        style={{
          width: JOYSTICK_RADIUS,
          height: JOYSTICK_RADIUS,
          left: JOYSTICK_SIZE / 2 + position.x,
          top: JOYSTICK_SIZE / 2 + position.y,
          transform: 'translate(-50%, -50%)',
        }}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════
// JOYSTICK — reads mode from store, renders dynamic or fixed
// ═══════════════════════════════════════════════
export function Joystick() {
  const joystickMode = useControlsPrefsStore((s) => s.joystickMode);

  if (joystickMode === 'fixed') {
    return <FixedJoystick />;
  }

  return <DynamicJoystick />;
}
