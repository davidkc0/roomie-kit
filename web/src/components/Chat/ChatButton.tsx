import { useEffect, useState } from 'react';

type ChatButtonProps = {
    onClick: () => void;
    unreadCount: number;
};

export function ChatButton({ onClick, unreadCount }: ChatButtonProps) {
    const [bounced, setBounced] = useState(false);

    // Bounce animation when unread count increases
    useEffect(() => {
        if (unreadCount > 0) {
            setBounced(true);
            const t = setTimeout(() => setBounced(false), 300);
            return () => clearTimeout(t);
        }
    }, [unreadCount]);

    return (
        <button
            onClick={onClick}
            className={`relative group bg-slate-900/80 backdrop-blur-md border border-slate-700 p-3 rounded-full shadow-xl active:scale-95 transition-all text-white hover:bg-slate-800 ${bounced ? 'scale-110' : ''}`}
        >
            {/* Chat Icon */}
            <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-6 h-6"
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.068.157 2.148.279 3.238.364.466.037.893.281 1.153.671L12 21l2.652-4.178c.26-.39.687-.634 1.153-.67 1.09-.086 2.17-.208 3.238-.365 1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
                />
            </svg>

            {/* Unread Badge */}
            {unreadCount > 0 && (
                <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center border-2 border-slate-900 animate-in zoom-in duration-200">
                    {unreadCount > 99 ? '99+' : unreadCount}
                </div>
            )}
        </button>
    );
}
