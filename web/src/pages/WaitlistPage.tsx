import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../state/authStore';
import { useInviteStore } from '../state/inviteStore';
import { useEconomyStore } from '../state/economyStore';
import { useKeyboardAdjust } from '../hooks/useKeyboardAdjust';
import { supabase } from '../lib/supabase';
import { Settings } from 'lucide-react';
import roomieLogo from '../assets/roomie_logo_no_background.png';
import { appConfig } from '../config/app';

export default function WaitlistPage() {
    const { user, profile, refreshProfile } = useAuthStore();
    const { waitlistPosition, loadWaitlistPosition, redeemCode, redeemLoading, redeemError } = useInviteStore();
    const navigate = useNavigate();

    const [showCodeInput, setShowCodeInput] = useState(false);
    const [inviteCode, setInviteCode] = useState('');
    const [redeemSuccess, setRedeemSuccess] = useState<{ inviterUsername: string; reward: number } | null>(null);

    useEffect(() => {
        const ensureWaitlistPosition = async () => {
            if (!appConfig.features.waitlist || !user?.id) return;
            // Try to load existing position
            const pos = await loadWaitlistPosition(user.id);
            if (pos === null) {
                // Not in waitlist table yet — insert via RPC
                console.log('[Waitlist] No position found, calling add_to_waitlist');
                const { data, error } = await supabase.rpc('add_to_waitlist', {
                    p_user_id: user.id,
                    p_username: profile?.username || 'User',
                });
                console.log('[Waitlist] add_to_waitlist result:', { data, error });
                // Reload position after insert
                await loadWaitlistPosition(user.id);
            }
        };
        ensureWaitlistPosition();
    }, [user?.id]);

    useEffect(() => {
        if (!appConfig.features.waitlist) {
            navigate('/');
        }
    }, [navigate]);

    // If user is already active, redirect to lobby
    useEffect(() => {
        if (profile?.account_status === 'active') {
            navigate('/');
        }
    }, [profile?.account_status, navigate]);

    // Check for pending invite code from deep link
    useEffect(() => {
        if (!appConfig.features.invites) return;
        const pendingCode = localStorage.getItem('pending_invite_code');
        if (pendingCode) {
            setInviteCode(pendingCode);
            setShowCodeInput(true);
            localStorage.removeItem('pending_invite_code');
        }
    }, []);

    const handleRedeemCode = async () => {
        if (!user?.id || !inviteCode.trim()) return;

        console.log('[Waitlist] Redeeming code:', inviteCode.trim(), 'for user:', user.id);
        if (!appConfig.features.invites) return;

        const result = await redeemCode(user.id, inviteCode);
        console.log('[Waitlist] Redeem result:', result);

        if (result.success) {
            setRedeemSuccess({
                inviterUsername: result.inviterUsername || 'someone',
                reward: result.reward || 100,
            });

            // Refresh profile (account_status will change to 'active')
            await refreshProfile();
            if (appConfig.features.economy) await useEconomyStore.getState().fetchBalances();

            // Auto-redirect after showing success
            setTimeout(() => {
                navigate('/');
            }, 3000);
        }
    };

    const playerPhoto = profile?.profile_image_url || profile?.avatar_headshot_url || '';
    const hasPhoto = !!playerPhoto;
    const playerName = profile?.username || 'User';

    // Keyboard handling
    const { contentRef, containerStyle } = useKeyboardAdjust();

    return (
        <div className="fixed inset-0 bg-bg-base text-white overflow-hidden font-sans">
            {/* Background Effects */}
            {/* Header with Settings - starts below safe area */}
            <div className="absolute top-0 right-0 p-4 z-50 pt-[max(env(safe-area-inset-top),20px)]">
                <button
                    onClick={() => navigate('/settings')}
                    className="p-3 text-white/70 hover:text-white transition-all active:scale-95"
                >
                    <Settings className="w-6 h-6" />
                </button>
            </div>

            {/* Scrollable Content */}
            <div
                ref={contentRef}
                className="absolute inset-0 overflow-y-auto ios-scroll px-6 pb-32"
                style={{
                    paddingTop: 'max(env(safe-area-inset-top), 60px)',
                    paddingBottom: `calc(env(safe-area-inset-bottom) + ${containerStyle?.paddingBottom || 140}px)`
                }}
            >
                <div className="flex flex-col items-center max-w-sm mx-auto space-y-8">

                    {/* Logo Section */}
                    <div className="flex flex-col items-center animate-in fade-in slide-in-from-top-4 duration-700">
                        <img src={roomieLogo} alt="Roomie" className="h-10 w-auto opacity-80" />
                    </div>

                    {/* Main Status Card */}
                    <div className="w-full bg-bg-elevated/50 rounded-2xl p-8 flex flex-col items-center text-center overflow-visible">
                        <p className="text-text-secondary text-xs font-bold uppercase tracking-widest mb-1 opacity-60">Your place in line</p>
                        <div className="text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-white/40 tracking-tighter drop-shadow-sm px-2 w-full overflow-visible" style={{ fontSize: 'clamp(3rem, 15vw, 6rem)' }}>
                            #{waitlistPosition ?? '...'}
                        </div>
                    </div>

                    {/* Avatar Preview */}
                    <div className="w-full bg-bg-elevated/50 rounded-2xl p-6 flex flex-col items-center text-center">
                        {/* Avatar Circle */}
                        <div className="relative mb-6">
                            <div className="w-32 h-32 rounded-full relative z-10 mx-auto bg-bg-surface border-4 border-[#2A2A2A] shadow-xl overflow-hidden">
                                {hasPhoto ? (
                                    <img src={playerPhoto} alt={playerName} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-white text-3xl font-bold">
                                        {playerName.charAt(0).toUpperCase()}
                                    </div>
                                )}
                            </div>
                        </div>

                        <h3 className="text-2xl font-bold text-white mb-6">@{playerName}</h3>

                        <button
                            onClick={() => navigate('/avatar/edit', { state: { fromProfile: false } })}
                            className="w-full rounded-xl py-4 font-black text-slate-900 bg-white border-b-4 border-slate-200 hover:bg-slate-50 active:border-b-0 active:translate-y-1 active:mt-1 shadow-lg shadow-black/10 transition-all text-sm uppercase tracking-wide"
                        >
                            Edit Avatar
                        </button>
                    </div>


                    {/* Action Area - Invite Code */}
                    {appConfig.features.invites && <div className="w-full">
                        {/* Divider with Text */}
                        <div className="relative flex items-center py-4">
                            <div className="grow border-t border-white/10"></div>
                            <span className="shrink mx-4 text-white/30 text-xs font-bold uppercase tracking-widest">or</span>
                            <div className="grow border-t border-white/10"></div>
                        </div>

                        {!showCodeInput ? (
                            <button
                                onClick={() => setShowCodeInput(true)}
                                className="w-full bg-bg-surface hover:bg-[#222] border border-white/5 rounded-2xl p-5 flex items-center justify-between transition-all active:scale-[0.98] group"
                            >
                                <div className="flex flex-col items-start">
                                    <span className="text-white font-bold text-lg">Have an invite code?</span>
                                    <span className="text-yellow-500 text-xs font-medium">Get instant access + 100 coins</span>
                                </div>
                                <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-500">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                </div>
                            </button>
                        ) : (
                            <div className="w-full bg-bg-surface rounded-2xl p-6 border border-yellow-500/20 animate-in fade-in slide-in-from-bottom-2 zoom-in-95 duration-300">
                                <div className="text-center mb-5">
                                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-yellow-500/10 mb-3 text-yellow-400">
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                                    </div>
                                    <h3 className="text-white font-bold text-lg">Redeem Code</h3>
                                    <p className="text-white/40 text-xs mt-1">Enter your 9-character code to join immediately.</p>
                                </div>


                                <input
                                    type="text"
                                    value={inviteCode}
                                    onChange={e => setInviteCode(e.target.value.toUpperCase())}
                                    placeholder="XXXX-XXXX"
                                    className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-4 text-white font-mono text-center text-xl tracking-[0.2em] focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 focus:outline-none transition placeholder:text-white/10 mb-4"
                                    maxLength={9}
                                    autoFocus
                                />

                                {redeemError && (
                                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg mb-4">
                                        <p className="text-red-400 text-xs text-center font-medium flex items-center justify-center gap-1">
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                            {redeemError}
                                        </p>
                                    </div>
                                )}

                                <div className="flex gap-3">
                                    <button
                                        onClick={() => { setShowCodeInput(false); setInviteCode(''); }}
                                        className="flex-1 py-3.5 text-white/50 font-bold bg-white/5 hover:bg-white/10 rounded-xl transition-all text-sm"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleRedeemCode}
                                        disabled={redeemLoading || inviteCode.trim().length < 7}
                                        className="flex-1 py-3.5 font-bold text-black bg-yellow-400 hover:bg-yellow-300 rounded-xl shadow-lg shadow-yellow-500/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                                    >
                                        {redeemLoading ? 'Verifying...' : 'Redeem'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>}

                    {/* Discord Community */}
                    <a
                        href="https://discord.gg/3F35gySQQK"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full bg-[#5865F2]/10 hover:bg-[#5865F2]/20 border border-[#5865F2]/20 rounded-2xl p-5 flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
                    >
                        <svg className="w-6 h-6 text-[#5865F2]" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9460 2.4189-2.1568 2.4189z" />
                        </svg>
                        <span className="text-[#5865F2] font-bold text-sm">Join our Discord Community</span>
                    </a>

                </div>
            </div>

            {/* Success Overlay - Fixed Full Screen */}
            {redeemSuccess && (
                <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in duration-500">
                    <div className="w-full max-w-sm bg-bg-surface rounded-3xl p-8 border border-white/10 text-center shadow-2xl relative overflow-hidden animate-in zoom-in-50 slide-in-from-bottom-4 duration-500">
                        {/* Confetti/Rays effects could go here */}
                        <div className="absolute inset-0 bg-gradient-to-tr from-yellow-500/20 to-purple-500/20 mix-blend-overlay"></div>

                        <div className="text-7xl mb-6 animate-bounce drop-shadow-2xl">🎉</div>
                        <h2 className="text-4xl font-black text-white mb-2 tracking-tight">You're In!</h2>
                        <div className="inline-block px-4 py-1.5 rounded-full bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 font-bold text-sm mb-6">
                            + {redeemSuccess.reward} Coins Welcome Bonus
                        </div>

                        <div className="p-4 bg-white/5 rounded-2xl border border-white/5 mb-6">
                            <p className="text-white/40 text-xs font-bold uppercase tracking-wider mb-2">Invited By</p>
                            <p className="text-white font-bold text-xl">@{redeemSuccess.inviterUsername}</p>
                        </div>

                        <div className="text-white/30 text-xs">Redirecting to lobby...</div>
                    </div>
                </div>
            )}
        </div>
    );
}
