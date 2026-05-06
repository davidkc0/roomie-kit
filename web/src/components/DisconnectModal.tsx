type DisconnectModalProps = {
    isOpen: boolean;
};

export function DisconnectModal({ isOpen }: DisconnectModalProps) {
    if (!isOpen) return null;

    const handleLeave = () => {
        // Navigate to lobby by reloading the root
        window.location.href = '/';
    };

    const handleReconnect = () => {
        // Reload the page - this is the safest way to reconnect
        // It ensures clean Playroom state and no stale connections
        window.location.reload();
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="bg-bg-surface border border-border rounded-2xl p-6 w-80 shadow-2xl flex flex-col items-center gap-4">
                {/* Icon */}
                <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
                    <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728M5.636 5.636a9 9 0 000 12.728M12 9v4m0 4h.01" />
                    </svg>
                </div>

                {/* Header */}
                <h2 className="text-white text-xl font-bold">Disconnected</h2>

                {/* Body */}
                <p className="text-slate-400 text-sm text-center">
                    Please check your internet connection and try again.
                </p>

                {/* Action Buttons */}
                <div className="flex gap-4 w-full mt-2">
                    <button
                        onClick={handleLeave}
                        className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold transition-colors"
                    >
                        Leave
                    </button>
                    <button
                        onClick={handleReconnect}
                        className="flex-1 py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold transition-colors"
                    >
                        Reconnect
                    </button>
                </div>
            </div>
        </div>
    );
}
