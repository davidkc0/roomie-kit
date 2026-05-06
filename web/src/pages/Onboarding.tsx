import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../state/authStore';
import { useEconomyStore } from '../state/economyStore';
import { supabase } from '../lib/supabase';
import { useKeyboardAdjust } from '../hooks/useKeyboardAdjust';
import roomieLogo from '../assets/roomie_logo_no_background.png';
import { AvatarEditor } from '../components/AvatarEditor';
import { type AvatarConfig, DEFAULT_AVATAR_CONFIG } from '../avatars/avatarTextures';
import { appConfig, defaultAvatarUrl } from '../config/app';

export default function Onboarding() {
    const { user, profile, refreshProfile } = useAuthStore();
    const navigate = useNavigate();

    // Keyboard Hook
    const { contentRef, containerStyle } = useKeyboardAdjust();

    // Step 1: Username, Step 2: Avatar, Step 'invite': Invite Code, Step 3: Profile Photo, Step 4: Welcome
    const [step, setStep] = useState<1 | 2 | 'invite' | 3 | 4>(1);
    const [username, setUsername] = useState('');
    const [formLoading, setFormLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Username availability state
    const [usernameStatus, setUsernameStatus] = useState<'idle' | 'too-short' | 'invalid-chars' | 'checking' | 'available' | 'taken'>('idle');
    const usernameCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Invite code state
    const [inviteCode, setInviteCode] = useState('');
    const [codeStatus, setCodeStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
    const codeCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        // If we already have a profile with a username, skip onboarding
        if (profile?.username) {
            navigate('/');
        }
    }, [profile, navigate]);

    // Username validation + debounced availability check
    const handleUsernameChange = (value: string) => {
        // Strip spaces, force lowercase
        const cleaned = value.replace(/\s/g, '').toLowerCase();
        setUsername(cleaned);
        setError(null);

        // Clear any pending timer
        if (usernameCheckTimer.current) clearTimeout(usernameCheckTimer.current);

        if (cleaned.length === 0) {
            setUsernameStatus('idle');
            return;
        }

        // Character validation: only alphanumeric + underscores
        if (!/^[a-zA-Z0-9_]+$/.test(cleaned)) {
            setUsernameStatus('invalid-chars');
            return;
        }

        // Minimum length
        if (cleaned.length < 4) {
            setUsernameStatus('too-short');
            return;
        }

        // Debounced availability check
        setUsernameStatus('checking');
        usernameCheckTimer.current = setTimeout(async () => {
            try {
                const { data } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('username', cleaned)
                    .maybeSingle();

                setUsernameStatus(data ? 'taken' : 'available');
            } catch {
                setUsernameStatus('available'); // Allow submit if check fails
            }
        }, 400);
    };

    useEffect(() => {
        return () => { if (usernameCheckTimer.current) clearTimeout(usernameCheckTimer.current); };
    }, []);

    const handleUsernameSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !username || usernameStatus !== 'available') return;

        setFormLoading(true);
        setError(null);

        try {
            const { error } = await supabase
                .from('profiles')
                .upsert({
                    id: user.id,
                    username: username,
                    updated_at: new Date().toISOString()
                });

            if (error) throw error;

            // Refresh local profile state so we don't loop
            // But don't navigate yet, we need avatar
            setStep(2);
        } catch (err: any) {
            const msg = err.message || '';
            if (msg.includes('unique constraint') || msg.includes('duplicate key') || err.code === '23505') {
                setError('This username is already taken. Try another one!');
                setUsernameStatus('taken');
            } else if (msg.includes('check constraint') || err.code === '23514') {
                setError('Username contains invalid characters or is too short.');
            } else {
                setError('Something went wrong. Please try again.');
            }
            console.error('[Onboarding] Username error:', msg);
            setFormLoading(false);
        }
    };

    const handleAvatarSave = async (config: AvatarConfig) => {
        if (!user) return;

        try {
            // Save avatar config to profile
            const { error } = await supabase
                .from('profiles')
                .update({
                    avatar_config: config,
                    avatar_url: defaultAvatarUrl,
                    updated_at: new Date().toISOString()
                })
                .eq('id', user.id);

            if (error) {
                console.error('[Onboarding] Error saving avatar config:', error);
            }

            // Refresh profile state
            const { refreshProfile } = useAuthStore.getState();
            await refreshProfile();

            if (!appConfig.features.invites) localStorage.removeItem('pending_invite_code');
            const pendingCode = appConfig.features.invites ? localStorage.getItem('pending_invite_code') : null;
            const shouldAskForInvite = appConfig.features.invites && !pendingCode;
            if (pendingCode) console.log('[Onboarding] Pending invite code found, skipping invite step');
            setStep(shouldAskForInvite ? 'invite' : 3);

        } catch (e) {
            console.error('[Onboarding] Exception in handleAvatarSave:', e);
            // Check pending code even on error
            const pendingCode = appConfig.features.invites ? localStorage.getItem('pending_invite_code') : null;
            setStep(appConfig.features.invites && !pendingCode ? 'invite' : 3);
        }
    };

    // Invite code validation (debounced)
    useEffect(() => {
        if (!appConfig.features.invites) {
            setCodeStatus('idle');
            return;
        }

        if (codeCheckTimer.current) clearTimeout(codeCheckTimer.current);
        const code = inviteCode.trim().toUpperCase();

        if (code.length >= 9) {
            setCodeStatus('checking');
            codeCheckTimer.current = setTimeout(async () => {
                try {
                    const { data, error } = await supabase.rpc('validate_invite_code', {
                        p_code: code,
                    });
                    if (!error && data === true) {
                        setCodeStatus('valid');
                    } else {
                        setCodeStatus('invalid');
                    }
                } catch {
                    setCodeStatus('invalid');
                }
            }, 400);
        } else if (code.length > 0) {
            setCodeStatus('idle');
        } else {
            setCodeStatus('idle');
        }

        return () => { if (codeCheckTimer.current) clearTimeout(codeCheckTimer.current); };
    }, [inviteCode]);

    return (
        <div
            ref={contentRef}
            className="flex min-h-screen flex-col items-center justify-center bg-brand-bg text-white p-4 overflow-y-auto"
            style={containerStyle}
        >
            {step === 1 && (
                <div className="w-full max-w-md space-y-6 rounded-xl bg-bg-elevated p-8 backdrop-blur-sm border border-border text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <img src={roomieLogo} alt="Roomie" className="h-16 w-auto mx-auto mb-4" />
                    <h1 className="text-2xl font-bold text-white">
                        Welcome!
                    </h1>
                    <p className="text-text-tertiary">
                        Let's get you set up. First, pick a unique username.
                    </p>

                    <form onSubmit={handleUsernameSubmit} className="space-y-4">
                        {error && (
                            <div className="text-red-400 text-sm bg-red-900/20 p-2 rounded">{error}</div>
                        )}
                        <div>
                            <input
                                type="text"
                                value={username}
                                onChange={e => handleUsernameChange(e.target.value)}
                                placeholder="Username"
                                className={`w-full rounded-lg bg-bg-surface border px-4 py-3 text-white focus:ring-1 focus:outline-none transition text-center text-lg font-mono placeholder:text-text-tertiary ${usernameStatus === 'available' ? 'border-green-500 focus:border-green-500 focus:ring-green-500' :
                                        usernameStatus === 'taken' || usernameStatus === 'invalid-chars' ? 'border-red-500 focus:border-red-500 focus:ring-red-500' :
                                            'border-border focus:border-brand-accent focus:ring-brand-accent'
                                    }`}
                                maxLength={15}
                                required
                            />
                            {/* Status indicators */}
                            {usernameStatus === 'too-short' && (
                                <p className="text-xs text-yellow-400/70 mt-1.5 text-center">Minimum 4 characters</p>
                            )}
                            {usernameStatus === 'invalid-chars' && (
                                <p className="text-xs text-red-400 mt-1.5 text-center">Letters, numbers, and underscores only</p>
                            )}
                            {usernameStatus === 'checking' && (
                                <p className="text-xs text-slate-400 mt-1.5 text-center animate-pulse">Checking availability...</p>
                            )}
                            {usernameStatus === 'available' && (
                                <p className="text-xs text-green-400 mt-1.5 text-center flex items-center justify-center gap-1">✓ Available!</p>
                            )}
                            {usernameStatus === 'taken' && (
                                <p className="text-xs text-red-400 mt-1.5 text-center">✗ This username is already taken</p>
                            )}
                        </div>
                        <button
                            type="submit"
                            disabled={formLoading || usernameStatus !== 'available'}
                            className="w-full rounded-xl py-3.5 font-bold text-black shadow-lg transition-transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed bg-white hover:bg-slate-200"
                        >
                            {formLoading ? 'Saving...' : 'Next'}
                        </button>
                    </form>

                    <div className="pt-4 border-t border-border/50">
                        <button
                            onClick={() => useAuthStore.getState().signOut()}
                            className="text-sm text-text-tertiary hover:text-white transition-colors"
                        >
                            Sign Out / Use different account
                        </button>
                    </div>
                </div>
            )}

            {step === 2 && (
                <AvatarEditor
                    initialConfig={profile?.avatar_config || DEFAULT_AVATAR_CONFIG}
                    onSave={handleAvatarSave}
                    onClose={() => setStep(1)}
                />
            )}

            {step === 'invite' && appConfig.features.invites && (
                <div className="w-full max-w-md space-y-6 rounded-xl bg-bg-elevated p-8 backdrop-blur-sm border border-border text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <img src={roomieLogo} alt="Roomie" className="h-12 w-auto mx-auto mb-4" />
                    <h1 className="text-2xl font-bold text-white">Have an invite code?</h1>
                    <p className="text-text-tertiary text-sm">
                        Enter a friend's code for instant access + bonus coins.
                    </p>

                    <div className="space-y-4">
                        <input
                            type="text"
                            value={inviteCode}
                            onChange={e => setInviteCode(e.target.value.toUpperCase())}
                            placeholder="XXXX-XXXX"
                            className={`w-full rounded-lg bg-bg-surface border px-4 py-3 text-white font-mono text-center text-xl tracking-[0.2em] focus:ring-1 focus:outline-none transition placeholder:text-text-tertiary ${codeStatus === 'valid' ? 'border-green-500 focus:border-green-500 focus:ring-green-500' :
                                codeStatus === 'invalid' ? 'border-red-500 focus:border-red-500 focus:ring-red-500' :
                                    'border-border focus:border-brand-accent focus:ring-brand-accent'
                                }`}
                            maxLength={9}
                            autoFocus
                        />

                        {codeStatus === 'checking' && (
                            <p className="text-xs text-slate-400 animate-pulse">Checking code...</p>
                        )}
                        {codeStatus === 'valid' && (
                            <p className="text-xs text-green-400 flex items-center justify-center gap-1">
                                {appConfig.features.waitlist ? '✓ Valid invite code — skip the waitlist!' : '✓ Valid invite code'}
                            </p>
                        )}
                        {codeStatus === 'invalid' && (
                            <p className="text-xs text-red-400">✗ Invalid or expired invite code</p>
                        )}
                        {codeStatus === 'idle' && inviteCode.trim() && (
                            <p className="text-xs text-text-tertiary">Format: XXXX-XXXX</p>
                        )}

                        <button
                            onClick={() => {
                                if (inviteCode.trim()) {
                                    localStorage.setItem('pending_invite_code', inviteCode.trim().toUpperCase());
                                }
                                setStep(3);
                            }}
                            disabled={inviteCode.trim().length > 0 && codeStatus !== 'valid'}
                            className="w-full rounded-xl py-3.5 font-black text-slate-900 bg-white border-b-4 border-slate-200 hover:bg-slate-50 active:border-b-0 active:translate-y-1 active:mt-1 shadow-lg shadow-black/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {inviteCode.trim() ? 'Continue with Code' : 'Next'}
                        </button>

                        <button
                            onClick={() => setStep(3)}
                            className="text-sm text-text-tertiary hover:text-white transition"
                        >
                            Skip — I don't have a code
                        </button>
                    </div>
                </div>
            )}

            {step === 3 && (
                <div className="w-full max-w-md space-y-6 rounded-xl bg-bg-elevated p-8 backdrop-blur-sm border border-border text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <img src={roomieLogo} alt="Roomie" className="h-12 w-auto mx-auto mb-4" />
                    <h1 className="text-2xl font-bold text-white">Add a Profile Photo</h1>
                    <p className="text-text-tertiary">Show your friends who you are.</p>

                    <div className="flex justify-center py-6">
                        <div className="relative w-32 h-32 rounded-full bg-bg-surface flex items-center justify-center border-4 border-border overflow-hidden">
                            {/* Preview or Fallback */}
                            <span className="text-4xl font-bold text-text-tertiary">
                                {username.charAt(0).toUpperCase()}
                            </span>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <label className="block w-full cursor-pointer rounded-lg bg-bg-surface border border-border hover:bg-bg-elevated transition px-4 py-3 text-sm font-medium">
                            <span>Choose from Library</span>
                            <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                                console.log('File selected', e.target.files);
                                alert("Image upload coming soon! Using fallback.");
                                setStep(4);
                            }} />
                        </label>

                        <button
                            onClick={() => setStep(4)}
                            className="block w-full py-3 text-sm text-text-tertiary hover:text-white transition"
                        >
                            Skip for now
                        </button>
                    </div>
                </div>
            )}

            {step === 4 && (
                <div className="w-full max-w-md space-y-6 rounded-xl bg-bg-elevated p-8 backdrop-blur-sm border border-border text-center animate-in fade-in slide-in-from-bottom-4 duration-500 relative overflow-hidden">
                    {/* Background Glow */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

                    <img src={roomieLogo} alt="Roomie" className="h-16 w-auto mx-auto mb-2 relative z-10" />

                    <div className="relative z-10">
                        <h1 className="text-2xl font-bold text-white mb-2">You're All Set! 🎉</h1>
                        <p className="text-text-secondary text-sm">
                            {appConfig.features.economy
                                ? 'Welcome to Roomie! Hang out with friends in 3D rooms, play games together, and earn coins.'
                                : 'Welcome to Roomie! Hang out with friends in 3D rooms and play games together.'}
                        </p>
                    </div>

                    {/* Welcome Bonus Card */}
                    {appConfig.features.economy && <div className="relative bg-gradient-to-br from-yellow-500/10 to-orange-500/10 rounded-2xl p-6 border border-yellow-500/30 shadow-[0_0_30px_rgba(234,179,8,0.1)]">
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-yellow-500/20 blur-2xl rounded-full pointer-events-none"></div>

                        <div className="mb-4 relative">
                            <img src="/coin.png" alt="Coins" className="w-24 h-24 object-contain mx-auto drop-shadow-[0_4px_10px_rgba(0,0,0,0.3)] animate-bounce" />
                        </div>

                        <div className="relative">
                            <div className="text-xs font-bold text-yellow-500 uppercase tracking-widest mb-1">Welcome Bonus</div>
                            <div className="text-4xl font-black text-white drop-shadow-[0_2px_10px_rgba(234,179,8,0.3)]">+20 Coins</div>
                        </div>
                    </div>}

                    <button
                        onClick={async () => {
                            if (!user) return;
                            setFormLoading(true);
                            let inviteRedeemed = false;
                            try {
                                // 1. Claim welcome bonus
                                if (appConfig.features.economy) {
                                    const { error: bonusError } = await supabase.rpc('claim_welcome_bonus', { p_user_id: user.id });
                                    if (bonusError) console.error('[Onboarding] Welcome bonus error:', bonusError);
                                    await useEconomyStore.getState().fetchBalances();
                                }

                                // 2. Set starter access status. Waitlist is opt-in.
                                const { error: profileError } = await supabase.from('profiles').update({
                                    account_status: appConfig.features.waitlist ? 'waitlist' : 'active',
                                    ...(appConfig.features.waitlist ? { waitlist_joined_at: new Date().toISOString() } : {}),
                                }).eq('id', user.id);
                                if (profileError) console.error('[Onboarding] Profile update error:', profileError);

                                if (appConfig.features.waitlist) {
                                    const { data: waitlistData, error: waitlistError } = await supabase.rpc('add_to_waitlist', {
                                        p_user_id: user.id,
                                        p_username: profile?.username || 'User',
                                    });
                                    console.log('[Onboarding] Waitlist result:', { data: waitlistData, error: waitlistError });
                                }

                                // 3. Check for pending invite code (from deep link or login page)
                                const pendingCode = localStorage.getItem('pending_invite_code');
                                if (appConfig.features.invites && pendingCode) {
                                    console.log('[Onboarding] Attempting to redeem pending invite code:', pendingCode);
                                    const { data: redeemData, error: redeemError } = await supabase.rpc('redeem_invite_code', {
                                        p_user_id: user.id,
                                        p_code: pendingCode.toUpperCase(),
                                    });

                                    if (redeemError) {
                                        console.error('[Onboarding] Invite code redeem FAILED:', redeemError.message);
                                        // Keep code in localStorage so WaitlistPage can retry
                                    } else {
                                        console.log('[Onboarding] Invite code redeemed successfully:', redeemData);
                                        inviteRedeemed = true;
                                        localStorage.removeItem('pending_invite_code');
                                        if (appConfig.features.economy) await useEconomyStore.getState().fetchBalances();
                                    }
                                }

                                // 4. Small delay to let DB replicas catch up, then refresh
                                await new Promise(r => setTimeout(r, 500));
                                await refreshProfile();
                            } catch (e) {
                                console.error('[Onboarding] Failed during setup:', e);
                            }

                            // Navigate — trust the local flag over potentially stale profile
                            if (inviteRedeemed || !appConfig.features.waitlist) {
                                console.log('[Onboarding] Invite redeemed, going to lobby');
                                navigate('/');
                            } else {
                                const latestProfile = useAuthStore.getState().profile;
                                console.log('[Onboarding] Final account_status:', latestProfile?.account_status);
                                if (latestProfile?.account_status === 'active') {
                                    navigate('/');
                                } else {
                                    navigate('/waitlist');
                                }
                            }
                        }}
                        disabled={formLoading}
                        className="relative z-10 w-full rounded-xl py-4 font-black text-lg text-black shadow-[0_0_20px_rgba(234,179,8,0.3)] transition-all active:scale-[0.98] disabled:opacity-50 bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600 hover:from-yellow-300 hover:to-yellow-500"
                    >
                        {formLoading ? 'Claiming...' : 'Claim & Get Started'}
                    </button>
                </div>
            )}
        </div>
    );
}
