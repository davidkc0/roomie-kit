import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../state/authStore';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { appConfig } from '../config/app';

export default function InviteRedirect() {
    const { code } = useParams<{ code: string }>();
    const navigate = useNavigate();
    const { user, profile, loading } = useAuthStore();

    useEffect(() => {
        if (loading) return; // Wait for auth to initialize

        if (code && appConfig.features.invites) {
            // Store the invite code for later use
            localStorage.setItem('pending_invite_code', code.toUpperCase());
        }

        if (!user) {
            // Not logged in → go to login
            navigate('/login', { replace: true });
        } else if (!appConfig.features.invites || profile?.account_status === 'active') {
            // Already active → just go home
            navigate('/', { replace: true });
        } else {
            // Waitlisted → go to waitlist page (will auto-fill the code)
            navigate('/waitlist', { replace: true });
        }
    }, [code, user, profile, loading, navigate]);

    return (
        <div className="flex h-screen items-center justify-center bg-black text-white">
            <LoadingSpinner size="lg" />
        </div>
    );
}
