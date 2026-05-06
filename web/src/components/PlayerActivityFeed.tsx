import { usePlayerActivity } from '../hooks/usePlayerActivity';
import type { WorldState } from '../multiplayer/playroom';

interface PlayerActivityFeedProps {
    worldPlayers: WorldState['players'];
    myPlayroomId: string | null;
}

/**
 * Left-aligned toast feed for player join/leave events.
 * Styled after GiftFeed.tsx — pill-shaped, semi-transparent, slides in from left.
 */
export function PlayerActivityFeed({ worldPlayers, myPlayroomId }: PlayerActivityFeedProps) {
    const events = usePlayerActivity(worldPlayers, myPlayroomId);

    if (events.length === 0) return null;

    return (
        <div className="flex flex-col gap-1.5 pointer-events-none">
            {events.slice(-3).map((event) => (
                <div
                    key={event.id}
                    className="bg-black/50 backdrop-blur-md px-4 py-2 rounded-full flex items-center gap-2 w-fit border border-white/10 shadow-lg"
                    style={{ animation: 'slideInLeft 0.3s ease-out' }}
                >
                    <span className="text-sm">
                        {event.type === 'join' ? '👋' : '💨'}
                    </span>
                    <span className="text-white text-sm">
                        <span className="font-bold text-white">{event.playerName}</span>
                        <span className="text-white/70"> {event.type === 'join' ? 'joined' : 'left'}</span>
                    </span>
                </div>
            ))}
        </div>
    );
}
