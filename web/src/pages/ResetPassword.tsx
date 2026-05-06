import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { LoadingSpinner } from '../components/LoadingSpinner';

type ResetState = 'loading' | 'form' | 'updating' | 'success' | 'error';

function readRecoveryParams() {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const searchParams = new URLSearchParams(window.location.search);
    return {
        accessToken: hashParams.get('access_token') || searchParams.get('access_token'),
        refreshToken: hashParams.get('refresh_token') || searchParams.get('refresh_token'),
        code: searchParams.get('code') || hashParams.get('code'),
        error: searchParams.get('error_description') || searchParams.get('error') || hashParams.get('error_description') || hashParams.get('error'),
    };
}

export default function ResetPasswordPage() {
    const navigate = useNavigate();
    const [state, setState] = useState<ResetState>('loading');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
                setState('form');
            }
        });

        const restoreRecoverySession = async () => {
            const params = readRecoveryParams();

            if (params.error) {
                setErrorMessage(params.error);
                setState('error');
                return;
            }

            try {
                if (params.code) {
                    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
                    if (error) throw error;
                } else if (params.accessToken && params.refreshToken) {
                    const { error } = await supabase.auth.setSession({
                        access_token: params.accessToken,
                        refresh_token: params.refreshToken,
                    });
                    if (error) throw error;
                } else {
                    const { data } = await supabase.auth.getSession();
                    if (!data.session) throw new Error('This reset link is invalid or has expired.');
                }

                if (!cancelled) setState('form');
            } catch (error: any) {
                if (!cancelled) {
                    setErrorMessage(error?.message || 'Unable to open this reset link.');
                    setState('error');
                }
            }
        };

        restoreRecoverySession();
        return () => {
            cancelled = true;
            subscription.unsubscribe();
        };
    }, []);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setErrorMessage('');

        if (password.length < 6) {
            setErrorMessage('Password must be at least 6 characters.');
            return;
        }

        if (password !== confirmPassword) {
            setErrorMessage('Passwords do not match.');
            return;
        }

        setState('updating');
        const { error } = await supabase.auth.updateUser({ password });

        if (error) {
            setState('form');
            setErrorMessage(error.message);
            return;
        }

        setState('success');
        setTimeout(() => navigate('/'), 1000);
    };

    return (
        <div className="min-h-screen bg-bg-base text-white flex items-center justify-center px-6">
            <div className="w-full max-w-md space-y-6">
                {state === 'loading' && (
                    <div className="text-center space-y-4">
                        <LoadingSpinner size="lg" />
                        <p className="text-text-secondary">Verifying reset link...</p>
                    </div>
                )}

                {(state === 'form' || state === 'updating') && (
                    <>
                        <div className="text-center">
                            <h1 className="text-2xl font-black">Set a new password</h1>
                            <p className="mt-2 text-text-secondary">Choose the password you want to use for Roomie.</p>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <label className="block">
                                <span className="block text-sm text-text-secondary mb-2">New password</span>
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(event) => setPassword(event.target.value)}
                                        disabled={state === 'updating'}
                                        minLength={6}
                                        required
                                        className="w-full rounded-xl bg-white/10 border border-white/15 px-4 py-3 pr-12 outline-none focus:ring-2 focus:ring-brand-primary"
                                    />
                                    <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60">
                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </label>
                            <label className="block">
                                <span className="block text-sm text-text-secondary mb-2">Confirm password</span>
                                <div className="relative">
                                    <input
                                        type={showConfirm ? 'text' : 'password'}
                                        value={confirmPassword}
                                        onChange={(event) => setConfirmPassword(event.target.value)}
                                        disabled={state === 'updating'}
                                        minLength={6}
                                        required
                                        className="w-full rounded-xl bg-white/10 border border-white/15 px-4 py-3 pr-12 outline-none focus:ring-2 focus:ring-brand-primary"
                                    />
                                    <button type="button" onClick={() => setShowConfirm((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60">
                                        {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </label>
                            {errorMessage && <p className="text-sm text-red-300 text-center">{errorMessage}</p>}
                            <button
                                type="submit"
                                disabled={state === 'updating'}
                                className="w-full rounded-xl py-3.5 font-black text-slate-950 bg-white border-b-4 border-slate-200 active:border-b-0 active:translate-y-1 disabled:opacity-60"
                            >
                                {state === 'updating' ? 'Updating...' : 'Update password'}
                            </button>
                        </form>
                    </>
                )}

                {state === 'success' && (
                    <div className="text-center space-y-4">
                        <div className="mx-auto w-16 h-16 rounded-full bg-green-500/20 text-green-300 flex items-center justify-center">✓</div>
                        <h1 className="text-2xl font-black">Password updated</h1>
                        <p className="text-text-secondary">Taking you back into Roomie...</p>
                    </div>
                )}

                {state === 'error' && (
                    <div className="text-center space-y-4">
                        <div className="mx-auto w-16 h-16 rounded-full bg-red-500/20 text-red-300 flex items-center justify-center">!</div>
                        <h1 className="text-2xl font-black">Reset link problem</h1>
                        <p className="text-text-secondary">{errorMessage}</p>
                        <Link to="/login" className="inline-flex rounded-xl px-6 py-3 bg-white text-slate-950 font-black border-b-4 border-slate-200 active:border-b-0 active:translate-y-1">
                            Back to login
                        </Link>
                    </div>
                )}
            </div>
        </div>
    );
}
