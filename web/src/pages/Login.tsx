import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../state/authStore';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { useKeyboardAdjust } from '../hooks/useKeyboardAdjust';
import { Capacitor } from '@capacitor/core';
import { Dialog } from '@capacitor/dialog';
import { supabase } from '../lib/supabase';
import { appConfig, authRedirectUrl } from '../config/app';
import { brandAssetUrls } from '../config/customization';



export default function Login() {
    const { signInWithGoogle, signInWithApple, signInWithEmail, signUpWithEmail, user, loading } = useAuthStore();
    const navigate = useNavigate();

    const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('signup');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [resetEmail, setResetEmail] = useState('');
    const [isWaitingForOAuth, setIsWaitingForOAuth] = useState(false);
    const [inviteCode, setInviteCode] = useState('');
    const [showInviteField, setShowInviteField] = useState(false);
    const [codeStatus, setCodeStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
    const codeCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [emailPending, setEmailPending] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(0);
    const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Keyboard Hook
    const { contentRef, containerStyle } = useKeyboardAdjust();

    // Load any pending invite code from deep link
    useEffect(() => {
        if (!appConfig.features.invites) {
            localStorage.removeItem('pending_invite_code');
            return;
        }

        const pendingCode = localStorage.getItem('pending_invite_code');
        if (pendingCode) {
            setInviteCode(pendingCode);
            setShowInviteField(true);
            setMode('signup');
        }
    }, []);

    // Redirect when user becomes authenticated
    useEffect(() => {
        if (user && !loading) {
            // Clear polling if active
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
            }
            setIsWaitingForOAuth(false);
            navigate('/');
        }
    }, [user, loading, navigate]);

    // Polling mechanism for iOS OAuth - checks auth state every 2 seconds
    useEffect(() => {
        if (isWaitingForOAuth && Capacitor.isNativePlatform()) {
            console.log('[Login] Starting OAuth polling...');
            pollIntervalRef.current = setInterval(() => {
                const currentUser = useAuthStore.getState().user;
                const currentLoading = useAuthStore.getState().loading;
                console.log('[Login] Polling auth state:', { user: !!currentUser, loading: currentLoading });
                if (currentUser && !currentLoading) {
                    console.log('[Login] User found via polling! Navigating...');
                    clearInterval(pollIntervalRef.current!);
                    pollIntervalRef.current = null;
                    setIsWaitingForOAuth(false);
                    navigate('/');
                }
            }, 2000);
        }

        return () => {
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
            }
        };
    }, [isWaitingForOAuth, navigate]);

    // Handle Google sign-in with polling trigger
    const handleGoogleSignIn = async () => {
        // Save invite code before OAuth redirect
        if (appConfig.features.invites && inviteCode.trim()) {
            localStorage.setItem('pending_invite_code', inviteCode.trim().toUpperCase());
        }
        setIsWaitingForOAuth(true);
        await signInWithGoogle();
    };

    // Handle Apple sign-in
    const handleAppleSignIn = async () => {
        try {
            // Save invite code before sign-in
            if (appConfig.features.invites && inviteCode.trim()) {
                localStorage.setItem('pending_invite_code', inviteCode.trim().toUpperCase());
            }
            setIsLoading(true);
            setErrorMsg(null);
            await signInWithApple();
        } catch (err: any) {
            // Don't show error for user cancellation
            const errMsg = err?.message || '';
            if (errMsg.includes('cancel') || errMsg.includes('Cancel') || errMsg.includes('1001')) {
                console.log('[Login] Apple sign-in cancelled by user');
            } else {
                console.error('[Login] Apple sign-in failed:', err);
                setErrorMsg(errMsg || 'Apple sign-in failed');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleEmailAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg(null);
        setIsLoading(true);
        try {
            if (mode === 'signup') {
                await signUpWithEmail(email, password);
                setEmailPending(true);
                setResendCooldown(60);
            } else {
                await signInWithEmail(email, password);
            }
        } catch (err: any) {
            console.error(err);
            setErrorMsg(err.message || "Authentication failed");
        } finally {
            setIsLoading(false);
        }
    };

    const handleForgotPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!resetEmail) return;
        setErrorMsg(null);
        setIsLoading(true);
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
                redirectTo: authRedirectUrl('/reset-password'),
            });
            if (error) throw error;
            // Auto-return to login after a brief confirmation
            setMode('login');
            setResetEmail('');
            setErrorMsg(null);
            // Show a temporary success message by reusing errorMsg with a special prefix
            setEmail(resetEmail); // Pre-fill login email for convenience
            if (Capacitor.isNativePlatform()) {
                await Dialog.alert({ title: 'Email Sent', message: 'Reset link sent! Check your inbox.' });
            } else {
                window.alert('Reset link sent! Check your inbox.');
            }
        } catch (err: any) {
            console.error('[Login] Password reset error:', err);
            setErrorMsg(err.message || 'Failed to send reset email');
        } finally {
            setIsLoading(false);
        }
    };

    // Save invite code to localStorage whenever it changes + validate
    useEffect(() => {
        if (!appConfig.features.invites) {
            localStorage.removeItem('pending_invite_code');
            setCodeStatus('idle');
            return;
        }

        if (inviteCode.trim()) {
            localStorage.setItem('pending_invite_code', inviteCode.trim().toUpperCase());
        } else {
            localStorage.removeItem('pending_invite_code');
            setCodeStatus('idle');
        }

        // Debounced validation when code looks complete (XXXX-XXXX = 9 chars)
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
        }

        return () => { if (codeCheckTimer.current) clearTimeout(codeCheckTimer.current); };
    }, [inviteCode]);

    // Resend cooldown timer
    useEffect(() => {
        if (resendCooldown <= 0) return;
        const timer = setInterval(() => {
            setResendCooldown(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [resendCooldown]);

    const handleResendEmail = async () => {
        if (resendCooldown > 0) return;
        try {
            const { error } = await supabase.auth.resend({ type: 'signup', email });
            if (error) throw error;
            setResendCooldown(60);
        } catch (err: any) {
            setErrorMsg(err.message || 'Failed to resend email');
        }
    };

    if (loading || isWaitingForOAuth) {
        return (
            <div className="flex h-screen items-center justify-center bg-bg-base text-white">
                <div className="flex flex-col items-center gap-4">
                    <LoadingSpinner size="lg" />
                    <p className="text-text-secondary animate-pulse">
                        {isWaitingForOAuth ? 'Signing you in...' : 'Entering the multiverse...'}
                    </p>
                </div>
            </div>
        );
    }

    // Email confirmation pending state
    if (emailPending) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-bg-base text-white p-4">
                <div className="w-full max-w-md space-y-6 rounded-xl bg-bg-elevated p-10 backdrop-blur-sm border border-border text-center">
                    <div className="text-5xl mb-2">✉️</div>
                    <h1 className="text-2xl font-bold text-white">Check your email</h1>
                    <p className="text-text-secondary text-sm">
                        We sent a confirmation link to<br />
                        <span className="font-bold text-white">{email}</span>
                    </p>

                    <div className="pt-4 space-y-3">
                        <button
                            onClick={handleResendEmail}
                            disabled={resendCooldown > 0}
                            className="w-full rounded-xl py-3.5 font-black text-slate-900 bg-white border-b-4 border-slate-200 hover:bg-slate-50 active:border-b-0 active:translate-y-1 active:mt-1 shadow-lg shadow-black/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:active:translate-y-0 disabled:active:border-b-4"
                        >
                            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Email'}
                        </button>

                        {errorMsg && (
                            <div className="p-3 text-red-200 bg-red-900/50 border border-red-800 rounded text-sm">
                                {errorMsg}
                            </div>
                        )}

                        <button
                            onClick={() => {
                                setEmailPending(false);
                                setResendCooldown(0);
                                setErrorMsg(null);
                                setMode('signup');
                            }}
                            className="text-sm text-brand-accent hover:text-brand-accent/80 font-medium transition"
                        >
                            Use a different email
                        </button>
                    </div>

                    <div className="pt-4 border-t border-border/50">
                        <p className="text-text-tertiary text-xs">
                            Already confirmed? {' '}
                            <button
                                onClick={() => {
                                    setEmailPending(false);
                                    setMode('login');
                                }}
                                className="text-brand-accent hover:text-brand-accent/80 font-semibold"
                            >
                                Log in
                            </button>
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            ref={contentRef}
            className="flex min-h-screen flex-col items-center justify-center bg-bg-base text-white p-4 overflow-y-auto"
            style={containerStyle}
        >
            <div className="w-full max-w-md space-y-8 rounded-xl bg-bg-elevated p-10 backdrop-blur-sm border border-border text-center">
                <div className="space-y-4 flex flex-col items-center">
                    <img src={brandAssetUrls.logoWordmark} alt={appConfig.appName} className="h-24 w-auto" />
                </div>

                <div className="space-y-4">
                    {/* Social Login Buttons — native only, hide on forgot password */}
                    {mode !== 'forgot' && Capacitor.isNativePlatform() && (
                        <>
                            <button
                                onClick={handleAppleSignIn}
                                disabled={isLoading}
                                className="w-full rounded-xl bg-white px-4 py-3 font-bold text-slate-900 flex items-center justify-center gap-2 border-b-4 border-slate-200 hover:bg-slate-50 active:border-b-0 active:translate-y-1 active:mt-1 shadow-lg shadow-black/10 transition-all disabled:opacity-50"
                            >
                                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                                </svg>
                                Sign in with Apple
                            </button>

                            <button
                                onClick={handleGoogleSignIn}
                                className="w-full rounded-xl bg-white px-4 py-3 font-bold text-slate-900 flex items-center justify-center gap-2 border-b-4 border-slate-200 hover:bg-slate-50 active:border-b-0 active:translate-y-1 active:mt-1 shadow-lg shadow-black/10 transition-all"
                            >
                                <svg className="h-5 w-5" viewBox="0 0 24 24">
                                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                </svg>
                                Sign in with Google
                            </button>

                            <div className="relative flex items-center py-2">
                                <div className="grow border-t border-border"></div>
                                <span className="shrink mx-4 text-text-tertiary text-xs">OR</span>
                                <div className="grow border-t border-border"></div>
                            </div>
                        </>
                    )}

                    {/* Forgot Password Form */}
                    {mode === 'forgot' ? (
                        <>
                            <form onSubmit={handleForgotPassword} className="space-y-3 text-left">
                                {errorMsg && (
                                    <div className="p-3 text-red-200 bg-red-900/50 border border-red-800 rounded text-sm mb-2">
                                        {errorMsg}
                                    </div>
                                )}
                                <div>
                                    <input
                                        type="email"
                                        placeholder="Email address"
                                        value={resetEmail}
                                        onChange={e => setResetEmail(e.target.value)}
                                        className="w-full rounded-lg bg-bg-surface border border-border px-4 py-3 text-white focus:border-brand-accent focus:ring-1 focus:ring-brand-accent focus:outline-none transition shadow-inner placeholder:text-text-tertiary"
                                        required
                                        autoFocus
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={isLoading || !resetEmail}
                                    className="w-full rounded-xl py-3.5 font-black text-slate-900 bg-white border-b-4 border-slate-200 hover:bg-slate-50 active:border-b-0 active:translate-y-1 active:mt-1 shadow-lg shadow-black/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isLoading ? 'Sending...' : 'Send Reset Link'}
                                </button>
                            </form>

                            <div className="text-center text-sm text-text-tertiary">
                                <button
                                    onClick={() => { setMode('login'); setErrorMsg(null); setResetEmail(''); }}
                                    className="text-brand-accent hover:text-brand-accent/80 font-semibold"
                                >
                                    Back to Sign In
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Email/Password Form */}
                            <form onSubmit={handleEmailAuth} className="space-y-3 text-left">
                                {errorMsg && (
                                    <div className="p-3 text-red-200 bg-red-900/50 border border-red-800 rounded text-sm mb-2">
                                        {errorMsg}
                                    </div>
                                )}
                                <div>
                                    <input
                                        type="email"
                                        placeholder="Email address"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        className="w-full rounded-lg bg-bg-surface border border-border px-4 py-3 text-white focus:border-brand-accent focus:ring-1 focus:ring-brand-accent focus:outline-none transition shadow-inner placeholder:text-text-tertiary"
                                        required
                                    />
                                </div>
                                <div>
                                    <input
                                        type="password"
                                        placeholder="Password"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        className="w-full rounded-lg bg-bg-surface border border-border px-4 py-3 text-white focus:border-brand-accent focus:ring-1 focus:ring-brand-accent focus:outline-none transition shadow-inner placeholder:text-text-tertiary"
                                        required
                                    />
                                </div>

                                {/* Forgot password link (login mode only) */}
                                {mode === 'login' && (
                                    <div className="text-right -mt-1">
                                        <button
                                            type="button"
                                            onClick={() => { setMode('forgot'); setErrorMsg(null); setResetEmail(''); }}
                                            className="text-xs text-text-tertiary hover:text-brand-accent transition"
                                        >
                                            Forgot password?
                                        </button>
                                    </div>
                                )}

                                {/* Invite Code Field (signup mode only) */}
                                {mode === 'signup' && appConfig.features.invites && (
                                    <div>
                                        {!showInviteField ? (
                                            <button
                                                type="button"
                                                onClick={() => setShowInviteField(true)}
                                                className="text-sm text-brand-accent hover:text-brand-accent/80 font-medium transition"
                                            >
                                                Have an invite code?
                                            </button>
                                        ) : (
                                            <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                                                <input
                                                    type="text"
                                                    placeholder="Invite code (optional)"
                                                    value={inviteCode}
                                                    onChange={e => setInviteCode(e.target.value.toUpperCase())}
                                                    className={`w-full rounded-lg bg-bg-surface border px-4 py-3 text-white font-mono text-center tracking-widest focus:ring-1 focus:outline-none transition shadow-inner placeholder:text-text-tertiary placeholder:font-sans placeholder:tracking-normal ${codeStatus === 'valid' ? 'border-green-500 focus:border-green-500 focus:ring-green-500' :
                                                        codeStatus === 'invalid' ? 'border-red-500 focus:border-red-500 focus:ring-red-500' :
                                                            'border-yellow-500/30 focus:border-yellow-500 focus:ring-yellow-500'
                                                        }`}
                                                    maxLength={9}
                                                />
                                                {codeStatus === 'checking' && (
                                                    <p className="text-xs text-slate-400 mt-1.5 text-center animate-pulse">Checking code...</p>
                                                )}
                                                {codeStatus === 'valid' && (
                                                    <p className="text-xs text-green-400 mt-1.5 text-center flex items-center justify-center gap-1">✓ Valid invite code</p>
                                                )}
                                                {codeStatus === 'invalid' && (
                                                    <p className="text-xs text-red-400 mt-1.5 text-center">✗ Invalid or expired invite code</p>
                                                )}
                                                {codeStatus === 'idle' && inviteCode.trim() && (
                                                    <p className="text-xs text-yellow-400/70 mt-1.5 text-center">Format: XXXX-XXXX</p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full rounded-xl py-3.5 font-black text-slate-900 bg-white border-b-4 border-slate-200 hover:bg-slate-50 active:border-b-0 active:translate-y-1 active:mt-1 shadow-lg shadow-black/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isLoading ? 'Processing...' : (mode === 'login' ? 'Sign In' : 'Sign Up')}
                                </button>
                            </form>

                            <div className="text-center text-sm text-text-tertiary">
                                {mode === 'login' ? "Don't have an account? " : "Already have an account? "}
                                <button
                                    onClick={() => {
                                        setMode(mode === 'login' ? 'signup' : 'login');
                                        setErrorMsg(null);
                                    }}
                                    className="text-brand-accent hover:text-brand-accent/80 font-semibold"
                                >
                                    {mode === 'login' ? 'Sign Up' : 'Log In'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
            <p className="text-text-tertiary text-[11px] leading-relaxed px-2 text-center mt-4 max-w-md">
                By continuing you agree to our{' '}
                {appConfig.termsUrl ? (
                    <a href={appConfig.termsUrl} target="_blank" rel="noopener noreferrer" className="text-brand-accent hover:text-brand-accent/80 underline">Terms of Service</a>
                ) : (
                    <span>Terms of Service</span>
                )}{' '}
                and have read our{' '}
                {appConfig.privacyUrl ? (
                    <a href={appConfig.privacyUrl} target="_blank" rel="noopener noreferrer" className="text-brand-accent hover:text-brand-accent/80 underline">Privacy Policy</a>
                ) : (
                    <span>Privacy Policy</span>
                )}.
            </p>
        </div >
    );
}
