import type { ReactNode } from 'react';

type ActionButtonProps = {
    icon: ReactNode;
    label: string;
    onClick: () => void;
    visible: boolean;
    className?: string;
    bounce?: boolean;
};

/**
 * Floating action button that appears when player is near interactive objects.
 * Positioned opposite to the joystick (bottom-right on mobile).
 * Uses onPointerDown for immediate response (critical for jump + move combo).
 */
export function ActionButton({ icon, label, onClick, visible, className = "fixed bottom-24 right-6", bounce = false }: ActionButtonProps) {
    if (!visible) return null;

    const handlePointerDown = (e: React.PointerEvent | React.TouchEvent) => {
        e.preventDefault(); // Prevent default to avoid interfering with joystick
        e.stopPropagation();
        onClick();
    };

    return (
        <button
            onPointerDown={handlePointerDown}
            onTouchStart={handlePointerDown}
            className={`${className} z-40 flex flex-col items-center gap-2 animate-in fade-in zoom-in duration-200 group touch-none select-none ${bounce ? 'animate-slow-bounce' : ''}`}
        >
            {/* Button circle - matches chat/emote button styling */}
            <div className="w-14 h-14 rounded-full bg-slate-900/60 backdrop-blur-md border border-white/10 text-white shadow-xl flex items-center justify-center text-2xl active:scale-95 transition-all group-hover:bg-slate-800 overflow-hidden p-3">
                {icon}
            </div>
            {/* Label */}
            <span className="text-white text-[10px] font-bold bg-black/50 px-2 py-0.5 rounded-full backdrop-blur-sm tracking-wide uppercase">
                {label}
            </span>
        </button>
    );
}
