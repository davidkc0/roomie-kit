const MAX_SEGMENT_LENGTH = 48;

function safeSegment(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, MAX_SEGMENT_LENGTH) || 'default';
}

export const mediaChannels = {
    roomVoice(roomCode: string): string {
        return `roomie-room-${safeSegment(roomCode)}-voice`;
    },
    directCall(roomId: string): string {
        return `roomie-call-${safeSegment(roomId)}`;
    },
    personalRoom(roomSlug: string): string {
        return `roomie-personal-${safeSegment(roomSlug)}-video`;
    },
    theaterStream(roomSlug: string): string {
        return `roomie-theater-${safeSegment(roomSlug)}-stream`;
    },
} as const;
