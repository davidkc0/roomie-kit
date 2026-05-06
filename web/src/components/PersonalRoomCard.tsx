import { useRoomPresence } from '../hooks/useRoomPresence';
import { PERSONAL_ROOM_MAX_USERS } from '../config/roomLimits';

type PersonalRoomCardProps = {
    room: {
        id: string | number;
        slug: string;
        name: string;
        description?: string;
        owner_id?: string;
    };
    isOwner: boolean;
    onClick: () => void;
};

/**
 * Personal room card with live user count display
 */
export function PersonalRoomCard({ room, isOwner, onClick }: PersonalRoomCardProps) {
    // Live user count via presence
    const userCount = useRoomPresence(room.slug);
    const isFull = userCount >= PERSONAL_ROOM_MAX_USERS;

    return (
        <button
            onClick={onClick}
            className="group relative flex h-40 flex-col items-center justify-center rounded-xl bg-bg-elevated/50 p-6 backdrop-blur-sm border border-border transition-all active:scale-[0.98]"
        >
            <div className="absolute top-3 right-3 z-10">
                {/* User Count Badge - Shows X/5 format, matches global room styling */}
                <div
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-full backdrop-blur-md text-xs font-medium shadow-lg ${isFull
                        ? 'bg-red-500/30 text-red-300 border border-red-500/30'
                        : 'bg-black/50 border border-white/10 text-white'
                        }`}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-slate-300">
                        <path d="M10 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.465 14.493a1.23 1.23 0 0 0 .41 1.412A9.957 9.957 0 0 0 10 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 0 0-13.074.003Z" />
                    </svg>
                    <span>{userCount}/{PERSONAL_ROOM_MAX_USERS}</span>
                </div>
            </div>

            <h2 className="text-xl font-bold text-white group-hover:scale-105 transition-transform">
                {isOwner ? 'My Room' : room.name}
            </h2>
            <span className="mt-2 text-xs text-slate-400 line-clamp-1 max-w-full px-2">
                {room.description || `/${room.slug}`}
            </span>
        </button>
    );
}
