/**
 * ReportModal — reusable bottom-sheet for filing reports and optionally blocking users.
 * Used by AvatarProfileModal, PlayerListDrawer, ChatModal, ChatOverlay, and WhiteboardCanvas.
 */
import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../state/authStore';

type ReportReason = 'harassment' | 'inappropriate_content' | 'spam' | 'other';
type ContextType = 'chat' | 'profile' | 'whiteboard' | 'stream';

type ReportModalProps = {
    isOpen: boolean;
    onClose: () => void;
    reportedUserId: string;
    reportedUserName?: string;
    contextType: ContextType;
    contextDetail?: string;
    onBlock?: () => void;
};

const REASONS: { value: ReportReason; label: string; emoji: string }[] = [
    { value: 'harassment', label: 'Harassment', emoji: '🚫' },
    { value: 'inappropriate_content', label: 'Inappropriate Content', emoji: '⚠️' },
    { value: 'spam', label: 'Spam', emoji: '📧' },
    { value: 'other', label: 'Other', emoji: '💬' },
];

export function ReportModal({
    isOpen,
    onClose,
    reportedUserId,
    reportedUserName,
    contextType,
    contextDetail,
    onBlock,
}: ReportModalProps) {
    const { user } = useAuthStore();
    const [selectedReason, setSelectedReason] = useState<ReportReason | null>(null);
    const [details, setDetails] = useState('');
    const [blockUser, setBlockUser] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async () => {
        if (!user || !selectedReason) return;

        setSubmitting(true);
        try {
            // Build context detail
            let fullContext = contextDetail || '';
            if (details.trim()) {
                fullContext = fullContext
                    ? `${fullContext}\n---\nUser note: ${details.trim()}`
                    : details.trim();
            }

            const { error } = await supabase.from('reports').insert({
                reporter_id: user.id,
                reported_user_id: reportedUserId,
                reason: selectedReason,
                context_type: contextType,
                context_detail: fullContext || null,
            });

            if (error) {
                console.error('[ReportModal] Error submitting report:', error);
                alert('Failed to submit report. Please try again.');
                setSubmitting(false);
                return;
            }

            // Block if toggled
            if (blockUser && onBlock) {
                onBlock();
            }

            setSubmitted(true);
        } catch (err) {
            console.error('[ReportModal] Unexpected error:', err);
            alert('Failed to submit report. Please try again.');
        }
        setSubmitting(false);
    };

    const handleClose = () => {
        setSelectedReason(null);
        setDetails('');
        setBlockUser(false);
        setSubmitting(false);
        setSubmitted(false);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[200] flex flex-col justify-end pointer-events-none">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm pointer-events-auto"
                onClick={handleClose}
            />

            {/* Modal */}
            <div
                className="relative w-full max-w-lg mx-auto bg-bg-surface border-t border-border shadow-2xl rounded-t-3xl pointer-events-auto animate-in slide-in-from-bottom duration-300"
                style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            >


                {submitted ? (
                    /* Success State */
                    <div className="px-6 py-8 text-center">
                        <div className="text-4xl mb-4">✅</div>
                        <h2 className="text-xl font-bold text-white mb-2">Report Submitted</h2>
                        <p className="text-white/60 text-sm mb-6">
                            Thank you for helping keep our community safe. We'll review this report within 24 hours.
                        </p>
                        {blockUser && (
                            <p className="text-white/40 text-xs mb-4">
                                {reportedUserName || 'This user'} has been blocked.
                            </p>
                        )}
                        <button
                            onClick={handleClose}
                            className="w-full py-3 rounded-2xl bg-white text-slate-900 font-bold text-base
                                border-b-4 border-slate-200
                                active:border-b-0 active:translate-y-1 active:mt-1
                                transition-all shadow-lg shadow-black/10"
                        >
                            Done
                        </button>
                    </div>
                ) : (
                    /* Report Form */
                    <div className="px-6 py-4">
                        <div className="flex items-center gap-3 mb-4">
                            <AlertTriangle className="w-5 h-5 text-red-400" />
                            <h2 className="text-lg font-bold text-white">
                                Report {reportedUserName || 'User'}
                            </h2>
                        </div>

                        {/* Reason Selection */}
                        <p className="text-white/60 text-sm mb-3">Why are you reporting this user?</p>
                        <div className="grid grid-cols-2 gap-2 mb-4">
                            {REASONS.map(({ value, label, emoji }) => (
                                <button
                                    key={value}
                                    onClick={() => setSelectedReason(value)}
                                    className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all active:scale-95
                                        ${selectedReason === value
                                            ? 'bg-red-500/20 border-2 border-red-400/50 text-white'
                                            : 'bg-white/5 border-2 border-transparent text-white/70 hover:bg-white/10'
                                        }`}
                                >
                                    <span>{emoji}</span>
                                    <span>{label}</span>
                                </button>
                            ))}
                        </div>

                        {/* Additional Details */}
                        <textarea
                            value={details}
                            onChange={(e) => setDetails(e.target.value)}
                            placeholder="Add any additional details (optional)..."
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/30 resize-none h-20 mb-4"
                            maxLength={500}
                        />

                        {/* Block toggle */}
                        {onBlock && (
                            <button
                                onClick={() => setBlockUser(prev => !prev)}
                                className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-white/5 mb-4 active:bg-white/10 transition-colors"
                            >
                                <div className={`w-10 h-6 rounded-full transition-all duration-200 relative ${blockUser ? 'bg-red-500' : 'bg-white/10'}`}>
                                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-200 ${blockUser ? 'left-[18px]' : 'left-0.5'}`} />
                                </div>
                                <span className="text-sm text-white/80 font-medium">
                                    Also block {reportedUserName || 'this user'}
                                </span>
                            </button>
                        )}

                        {/* Submit */}
                        <div className="flex gap-3">
                            <button
                                onClick={handleClose}
                                className="flex-1 py-3 rounded-2xl text-white font-bold text-base
                                    bg-white/10 border-b-4 border-white/10
                                    active:border-b-0 active:translate-y-1 active:mt-1
                                    transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={!selectedReason || submitting}
                                className="flex-1 py-3 rounded-2xl bg-red-500 text-white font-bold text-base
                                    border-b-4 border-red-700
                                    active:border-b-0 active:translate-y-1 active:mt-1
                                    transition-all disabled:opacity-40 disabled:pointer-events-none"
                            >
                                {submitting ? 'Submitting...' : 'Submit Report'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
