import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { LoadingSpinner } from '../components/LoadingSpinner';

type ConfirmState = 'loading' | 'success' | 'error';

function readAuthParams() {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const searchParams = new URLSearchParams(window.location.search);
    return {
        accessToken: hashParams.get('access_token') || searchParams.get('access_token'),
        refreshToken: hashParams.get('refresh_token') || searchParams.get('refresh_token'),
        code: searchParams.get('code') || hashParams.get('code'),
        error: searchParams.get('error_description') || searchParams.get('error') || hashParams.get('error_description') || hashParams.get('error'),
    };
}

export default function ConfirmEmailPage() {
    const [state, setState] = useState<ConfirmState>('loading');
    const [message, setMessage] = useState('Confirming your email...');

    useEffect(() => {
        let cancelled = false;

        const confirm = async () => {
            const params = readAuthParams();

            if (params.error) {
                setMessage(params.error);
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
                    if (!data.session) throw new Error('This confirmation link is invalid or has expired.');
                }

                if (!cancelled) {
                    setMessage('Email confirmed. You can continue into Roomie.');
                    setState('success');
                }
            } catch (error: any) {
                if (!cancelled) {
                    setMessage(error?.message || 'Unable to confirm this email link.');
                    setState('error');
                }
            }
        };

        confirm();
        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <div className="min-h-screen bg-bg-base text-white flex items-center justify-center px-6">
            <div className="w-full max-w-md text-center space-y-6">
                {state === 'loading' && <LoadingSpinner size="lg" />}
                <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center ${state === 'success' ? 'bg-green-500/20 text-green-300' : state === 'error' ? 'bg-red-500/20 text-red-300' : 'bg-white/10 text-white/70'}`}>
                    {state === 'success' ? '✓' : state === 'error' ? '!' : '…'}
                </div>
                <div>
                    <h1 className="text-2xl font-black">
                        {state === 'success' ? 'Email confirmed' : state === 'error' ? 'Link problem' : 'One moment'}
                    </h1>
                    <p className="mt-2 text-text-secondary">{message}</p>
                </div>
                <Link
                    to={state === 'success' ? '/' : '/login'}
                    className="inline-flex items-center justify-center rounded-xl px-6 py-3 bg-white text-slate-950 font-black border-b-4 border-slate-200 active:border-b-0 active:translate-y-1"
                >
                    {state === 'success' ? 'Continue' : 'Back to login'}
                </Link>
            </div>
        </div>
    );
}
