import { useState, useEffect } from 'react';
import { useAuthStore } from '../state/authStore';
import { useInviteStore } from '../state/inviteStore';
import { X, Copy, Share2, Check } from 'lucide-react';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { appConfig } from '../config/app';

type InviteModalProps = {
    isOpen: boolean;
    onClose: () => void;
};

export function InviteModal({ isOpen, onClose }: InviteModalProps) {
    const { user } = useAuthStore();
    const {
        inviteCodes,
        invitesRemaining,
        invitesUsed,
        loadInvites,
        generateCode,
    } = useInviteStore();

    const [copiedCode, setCopiedCode] = useState<string | null>(null);
    const [generating, setGenerating] = useState(false);

    useEffect(() => {
        if (isOpen && user?.id && appConfig.features.invites) {
            loadInvites(user.id);
        }
    }, [isOpen, user?.id]);

    const handleGenerate = async () => {
        if (!user?.id) return;
        setGenerating(true);
        await generateCode(user.id);
        setGenerating(false);
    };

    const copyToClipboard = async (code: string) => {
        try {
            await navigator.clipboard.writeText(code);
        } catch {
            // Fallback for native / older browsers
            const textarea = document.createElement('textarea');
            textarea.value = code;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
        }
        setCopiedCode(code);
        setTimeout(() => setCopiedCode(null), 2000);
    };

    const shareInvite = async (code: string) => {
        const appStoreLink = appConfig.inviteShareUrl;
        const text = `Join me on Roomie! Use my invite code ${code}, and we both get 100 coins!`;

        try {
            if (Capacitor.isNativePlatform()) {
                // Use native iOS/Android share sheet
                await Share.share({
                    title: 'Join Roomie',
                    text,
                    url: appStoreLink,
                    dialogTitle: 'Share your invite',
                });
            } else if (navigator.share) {
                await navigator.share({ title: 'Join Roomie', text, url: appStoreLink });
            } else {
                copyToClipboard(code);
            }
        } catch (e) {
            // User cancelled share sheet — silently ignore
            console.log('[InviteModal] Share cancelled or failed:', e);
        }
    };

    if (!isOpen || !appConfig.features.invites) return null;

    const activeCodes = inviteCodes.filter(c => c.is_active && !c.used_at);
    const usedCodes = inviteCodes.filter(c => c.used_at);

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4 animate-in fade-in duration-200">
            <div className="bg-bg-surface rounded-2xl p-6 max-w-sm w-full border border-border shadow-2xl relative max-h-[80vh] overflow-y-auto">
                {/* Close */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors p-1"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* Header */}
                <h2 className="text-2xl font-bold text-white mb-1">Invite Friends</h2>
                <p className="text-text-tertiary text-sm mb-6">You both get 100 coins when they join!</p>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                    <div className="bg-bg-elevated rounded-xl p-4 border border-border text-center">
                        <div className="text-3xl font-bold text-brand-primary">{invitesRemaining}</div>
                        <div className="text-xs text-text-tertiary font-medium">Invites left</div>
                    </div>
                    <div className="bg-bg-elevated rounded-xl p-4 border border-border text-center">
                        <div className="text-3xl font-bold text-green-400">{invitesUsed}</div>
                        <div className="text-xs text-text-tertiary font-medium">Friends joined</div>
                    </div>
                </div>

                {/* Generate button */}
                {invitesRemaining > 0 && activeCodes.length === 0 && (
                    <button
                        onClick={handleGenerate}
                        disabled={generating}
                        className="w-full py-3.5 rounded-2xl font-black text-slate-900 bg-white border-b-4 border-slate-200 hover:bg-slate-50 active:border-b-0 active:translate-y-1 active:mt-1 shadow-lg shadow-black/10 transition-all disabled:opacity-50 mb-6"
                    >
                        {generating ? 'Generating...' : 'Generate Invite Code'}
                    </button>
                )}

                {/* Active Codes */}
                {activeCodes.length > 0 && (
                    <div className="space-y-3 mb-6">
                        {activeCodes.map(code => (
                            <div key={code.id} className="bg-bg-elevated rounded-xl p-4 border border-brand-primary/40">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="font-mono text-xl font-bold text-white tracking-wide">{code.code}</span>
                                    <span className="text-xs bg-brand-primary/20 text-brand-primary px-2 py-1 rounded-full font-medium">Active</span>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => copyToClipboard(code.code)}
                                        className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white/10 text-white rounded-xl text-sm font-bold border border-white/20 border-b-4 border-b-white/20 hover:bg-white/15 active:border-b active:translate-y-0.5 active:mt-0.5 transition-all"
                                    >
                                        {copiedCode === code.code ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                                        {copiedCode === code.code ? 'Copied!' : 'Copy Code'}
                                    </button>
                                    <button
                                        onClick={() => shareInvite(code.code)}
                                        className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white text-slate-900 rounded-xl text-sm font-black border-b-4 border-slate-200 hover:bg-slate-50 active:border-b-0 active:translate-y-0.5 active:mt-0.5 shadow-lg shadow-black/10 transition-all"
                                    >
                                        <Share2 className="w-4 h-4" />
                                        Share
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Generate more if we have remaining but already have active codes */}
                {invitesRemaining > 0 && activeCodes.length > 0 && (
                    <button
                        onClick={handleGenerate}
                        disabled={generating}
                        className="w-full py-3 rounded-2xl font-bold text-white bg-white/10 border border-white/20 border-b-4 border-b-white/20 hover:bg-white/15 active:border-b active:translate-y-0.5 active:mt-0.5 transition-all disabled:opacity-50 mb-6 text-sm"
                    >
                        {generating ? 'Generating...' : `Generate Another Code (${invitesRemaining} left)`}
                    </button>
                )}

                {/* Used Codes */}
                {usedCodes.length > 0 && (
                    <div>
                        <p className="text-text-tertiary text-xs font-medium uppercase tracking-wider mb-2">Used Codes</p>
                        <div className="space-y-2">
                            {usedCodes.map(code => (
                                <div key={code.id} className="bg-bg-elevated rounded-xl p-3 border border-border opacity-60">
                                    <div className="flex items-center justify-between">
                                        <span className="font-mono text-sm text-white/70">{code.code}</span>
                                        <span className="text-xs text-green-400/70">Used</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {invitesRemaining === 0 && activeCodes.length === 0 && (
                    <p className="text-center text-text-tertiary text-sm">You've used all your invites. Check back later!</p>
                )}
            </div>
        </div>
    );
}
