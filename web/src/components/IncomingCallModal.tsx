import React from 'react';
import { useVideoCallStore } from '../state/videoCallStore';
import { sendSignal } from '../lib/signaling';
import { useAuthStore } from '../state/authStore';

export function IncomingCallModal() {
    const { status, remoteUser, roomId, acceptCall, declineCall } = useVideoCallStore();
    const { user } = useAuthStore();

    if (status !== 'incoming' || !remoteUser) return null;

    const handleAccept = async () => {
        console.log('[IncomingCallModal] Accepting call from:', remoteUser.id);

        // 1. Send accept signal back to caller
        if (user?.id && remoteUser.id && roomId) {
            try {
                await sendSignal({
                    type: 'accept',
                    roomId,
                    toId: remoteUser.id,
                    fromId: user.id,
                    fromName: user.user_metadata?.username || 'Unknown',
                    fromAvatar: user.user_metadata?.avatar_url || ''
                });
                console.log('[IncomingCallModal] Accept signal sent');
            } catch (err) {
                console.error('[IncomingCallModal] Failed to send accept signal:', err);
            }
        }

        // 2. Update local state to connected
        acceptCall();
    };

    const handleDecline = async () => {
        console.log('[IncomingCallModal] Declining call from:', remoteUser.id);

        // Send decline signal back to caller
        if (user?.id && remoteUser.id && roomId) {
            try {
                await sendSignal({
                    type: 'decline',
                    roomId,
                    toId: remoteUser.id,
                    fromId: user.id
                });
                console.log('[IncomingCallModal] Decline signal sent');
            } catch (err) {
                console.error('[IncomingCallModal] Failed to send decline signal:', err);
            }
        }

        declineCall();
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
            <div className="bg-bg-surface border border-border rounded-2xl p-6 w-80 shadow-2xl flex flex-col items-center gap-4">
                {/* Avatar/Image */}
                <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-slate-600 bg-slate-800">
                    {remoteUser.avatarUrl ? (
                        <img src={remoteUser.avatarUrl} alt={remoteUser.username} className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-2xl">👤</div>
                    )}
                </div>

                <div className="text-center">
                    <h3 className="text-white text-xl font-bold">{remoteUser.username || 'Unknown User'}</h3>
                    <p className="text-slate-400 text-sm">Incoming Video Call...</p>
                </div>

                <div className="flex gap-4 w-full mt-2">
                    <button
                        onClick={handleDecline}
                        className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold transition-colors"
                    >
                        Decline
                    </button>
                    <button
                        onClick={handleAccept}
                        className="flex-1 py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold transition-colors"
                    >
                        Accept
                    </button>
                </div>
            </div>
        </div>
    );
}
