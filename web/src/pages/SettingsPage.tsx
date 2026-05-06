import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, ChevronLeft, Bell, Ban, ExternalLink, Mail, FileText, Shield, Gamepad2, Trash2 } from 'lucide-react';
import { Dialog } from '@capacitor/dialog';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { useAuthStore } from '../state/authStore';
import { supabase } from '../lib/supabase';
import { useBlockedUsers } from '../hooks/useBlockedUsers';
import { useControlsPrefsStore, type JoystickMode } from '../state/controlsPrefsStore';
import { appConfig } from '../config/app';

type NotificationPrefs = {
    friend_requests: boolean;
    room_visits: boolean;
    whiteboard_messages: boolean;
    tournament_wins: boolean;
    marketing: boolean;
};

export default function SettingsPage() {
    const navigate = useNavigate();
    const { signOut, user, profile } = useAuthStore();
    const [prefs, setPrefs] = useState<NotificationPrefs>({
        friend_requests: true,
        room_visits: true,
        whiteboard_messages: true,
        tournament_wins: true,
        marketing: true,
    });
    const [loading, setLoading] = useState(true);
    const { blockedIds, unblockUser } = useBlockedUsers();
    const [blockedProfiles, setBlockedProfiles] = useState<Array<{ id: string; username: string; profile_image_url?: string }>>([]);
    const [blockedLoading, setBlockedLoading] = useState(true);
    const joystickMode = useControlsPrefsStore((s) => s.joystickMode);
    const setJoystickMode = useControlsPrefsStore((s) => s.setJoystickMode);
    const [isExiting, setIsExiting] = useState(false);
    const [appVersion, setAppVersion] = useState('');

    const handleBack = () => {
        setIsExiting(true);
        setTimeout(() => navigate(appConfig.features.waitlist && profile?.account_status === 'waitlist' ? '/waitlist' : '/profile'), 280);
    };

    // Fetch native app version from Xcode Info.plist
    useEffect(() => {
        if (Capacitor.isNativePlatform()) {
            App.getInfo().then(info => {
                setAppVersion(info.version);
            }).catch(() => setAppVersion(''));
        }
    }, []);

    // Fetch preferences on mount
    useEffect(() => {
        if (!user) return;
        supabase
            .from('notification_preferences')
            .select('*')
            .eq('user_id', user.id)
            .single()
            .then(({ data }) => {
                if (data) {
                    setPrefs({
                        friend_requests: data.friend_requests ?? true,
                        room_visits: data.room_visits ?? true,
                        whiteboard_messages: data.whiteboard_messages ?? true,
                        tournament_wins: data.tournament_wins ?? true,
                        marketing: data.marketing ?? true,
                    });
                }
                setLoading(false);
            });
    }, [user]);

    // Fetch blocked user profiles
    useEffect(() => {
        if (blockedIds.size === 0) {
            setBlockedProfiles([]);
            setBlockedLoading(false);
            return;
        }

        const fetchBlockedProfiles = async () => {
            const { data } = await supabase
                .from('profiles')
                .select('id, username, profile_image_url')
                .in('id', Array.from(blockedIds));
            setBlockedProfiles(data || []);
            setBlockedLoading(false);
        };

        fetchBlockedProfiles();
    }, [blockedIds]);

    // Toggle handler
    const handleToggle = async (key: keyof NotificationPrefs) => {
        if (!user) return;
        const newValue = !prefs[key];
        setPrefs(prev => ({ ...prev, [key]: newValue }));

        await supabase
            .from('notification_preferences')
            .upsert({ user_id: user.id, [key]: newValue }, { onConflict: 'user_id' });
    };

    const handleSignOut = async () => {
        if (Capacitor.isNativePlatform()) {
            const { value } = await Dialog.confirm({
                title: 'Sign Out',
                message: 'Are you sure you want to sign out?',
                okButtonTitle: 'Sign Out',
                cancelButtonTitle: 'Cancel',
            });
            if (!value) return;
        } else {
            if (!window.confirm('Are you sure you want to sign out?')) return;
        }

        await signOut();
        navigate('/login');
    };

    const handleDeleteAccount = async () => {
        // Double confirmation
        let confirmed = false;
        if (Capacitor.isNativePlatform()) {
            const { value } = await Dialog.confirm({
                title: 'Delete Account',
                message: 'This will permanently delete your account, including all your data, rooms, and purchases. This action cannot be undone.',
                okButtonTitle: 'Delete Forever',
                cancelButtonTitle: 'Cancel',
            });
            confirmed = value;
        } else {
            confirmed = window.confirm('This will permanently delete your account, including all your data, rooms, and purchases. This action cannot be undone. Are you sure?');
        }
        if (!confirmed) return;

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                alert('Session expired. Please sign in again.');
                navigate('/login');
                return;
            }

            const res = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-account`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${session.access_token}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            const body = await res.json();
            console.log('[Settings] Delete account response:', res.status, body);

            if (!res.ok) {
                throw new Error(body?.error || `Failed with status ${res.status}`);
            }

            // Sign out and redirect
            await signOut();
            navigate('/login');
        } catch (err: any) {
            console.error('[Settings] Delete account error:', err.message || err);
            const msg = err.message || 'Failed to delete account. Please try again or contact support.';
            if (Capacitor.isNativePlatform()) {
                await Dialog.alert({ title: 'Error', message: msg });
            } else {
                window.alert(msg);
            }
        }
    };

    const toggleItems = [
        { key: 'friend_requests' as const, label: 'Friend Requests', desc: 'When someone sends you a friend request' },
        { key: 'room_visits' as const, label: 'Room Visits', desc: 'When someone visits your room' },
        { key: 'whiteboard_messages' as const, label: 'Whiteboard Messages', desc: 'When someone leaves a message on your board' },
        { key: 'tournament_wins' as const, label: 'Tournament Wins', desc: 'When you win a weekly leaderboard' },
        { key: 'marketing' as const, label: 'Updates & News', desc: 'New features and announcements' },
    ];

    return (
        <div className={`h-screen bg-bg-base text-white flex flex-col ${isExiting ? 'animate-slide-out-right' : 'animate-slide-in-right'}`}>
            {/* Header — fixed, never moves */}
            <div className="flex-none z-10 bg-bg-base border-b border-border/50 px-4 py-4 flex items-center">
                <button onClick={handleBack} className="p-2 -ml-2 text-text-tertiary">
                    <ChevronLeft className="w-6 h-6" />
                </button>
                <h1 className="text-lg font-bold flex-1 text-center pr-8">Settings</h1>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-6">
                <div className="space-y-4">
                    {/* Notifications Section */}
                    <div className="bg-bg-elevated/50 rounded-xl overflow-hidden">
                        <div className="px-4 py-3 flex items-center gap-3 border-b border-border/50">
                            <Bell className="w-5 h-5 text-text-tertiary" />
                            <span className="font-medium">Notifications</span>
                        </div>

                        {loading ? (
                            <div className="px-4 py-6 flex justify-center">
                                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                            </div>
                        ) : (
                            <div className="divide-y divide-border/30">
                                {toggleItems.map(item => (
                                    <div key={item.key} className="flex items-center justify-between px-4 py-3">
                                        <div className="flex-1 pr-4">
                                            <p className="text-sm font-medium">{item.label}</p>
                                            <p className="text-xs text-text-tertiary">{item.desc}</p>
                                        </div>
                                        <button
                                            onClick={() => handleToggle(item.key)}
                                            className={`w-12 h-7 rounded-full transition-all duration-200 relative ${prefs[item.key] ? 'bg-brand-primary' : 'bg-white/10 hover:bg-white/20'
                                                }`}
                                        >
                                            <span
                                                className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-200 ${prefs[item.key] ? 'left-[26px]' : 'left-1'
                                                    }`}
                                            />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Controls Section */}
                    <div className="bg-bg-elevated/50 rounded-xl overflow-hidden">
                        <div className="px-4 py-3 flex items-center gap-3 border-b border-border/50">
                            <Gamepad2 className="w-5 h-5 text-text-tertiary" />
                            <span className="font-medium">Controls</span>
                        </div>
                        <div className="px-4 py-3">
                            <div className="flex items-center justify-between">
                                <div className="flex-1 pr-4">
                                    <p className="text-sm font-medium">Movement Joystick</p>
                                    <p className="text-xs text-text-tertiary">
                                        {joystickMode === 'dynamic'
                                            ? 'Invisible — appears where you touch'
                                            : 'Always visible in bottom-left corner'}
                                    </p>
                                </div>
                                <div className="flex bg-white/10 rounded-lg overflow-hidden">
                                    {(['dynamic', 'fixed'] as JoystickMode[]).map((mode) => (
                                        <button
                                            key={mode}
                                            onClick={() => setJoystickMode(mode)}
                                            className={`px-3 py-1.5 text-xs font-medium transition-all ${joystickMode === mode
                                                ? 'bg-brand-primary text-white'
                                                : 'text-text-tertiary hover:text-white'
                                                }`}
                                        >
                                            {mode === 'dynamic' ? 'Dynamic' : 'Fixed'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Blocked Users Section */}
                    <div className="bg-bg-elevated/50 rounded-xl overflow-hidden">
                        <div className="px-4 py-3 flex items-center gap-3 border-b border-border/50">
                            <Ban className="w-5 h-5 text-text-tertiary" />
                            <span className="font-medium">Blocked Users</span>
                        </div>

                        {blockedLoading ? (
                            <div className="px-4 py-6 flex justify-center">
                                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                            </div>
                        ) : blockedProfiles.length === 0 ? (
                            <div className="px-4 py-6 text-center text-text-tertiary text-sm">
                                No blocked users
                            </div>
                        ) : (
                            <div className="divide-y divide-border/30">
                                {blockedProfiles.map(profile => (
                                    <div key={profile.id} className="flex items-center justify-between px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-bg-surface overflow-hidden">
                                                {profile.profile_image_url ? (
                                                    <img src={profile.profile_image_url} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-white/50 text-xs font-bold">
                                                        {profile.username?.charAt(0).toUpperCase() || '?'}
                                                    </div>
                                                )}
                                            </div>
                                            <span className="text-sm font-medium">{profile.username || 'Unknown'}</span>
                                        </div>
                                        <button
                                            onClick={() => unblockUser(profile.id)}
                                            className="text-xs font-medium text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                                        >
                                            Unblock
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Legal & Support Section */}
                    <div className="bg-bg-elevated/50 rounded-xl overflow-hidden">
                        <div className="px-4 py-3 flex items-center gap-3 border-b border-border/50">
                            <Shield className="w-5 h-5 text-text-tertiary" />
                            <span className="font-medium">Legal & Support</span>
                        </div>
                        <div className="divide-y divide-border/30">
                            {appConfig.termsUrl && <a
                                href={appConfig.termsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-between px-4 py-3 text-sm text-text-secondary hover:text-white transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <FileText className="w-4 h-4 text-text-tertiary" />
                                    <span>Terms of Service</span>
                                </div>
                                <ExternalLink className="w-4 h-4 text-text-tertiary" />
                            </a>}
                            {appConfig.privacyUrl && <a
                                href={appConfig.privacyUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-between px-4 py-3 text-sm text-text-secondary hover:text-white transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <Shield className="w-4 h-4 text-text-tertiary" />
                                    <span>Privacy Policy</span>
                                </div>
                                <ExternalLink className="w-4 h-4 text-text-tertiary" />
                            </a>}
                            <a
                                href={`mailto:${appConfig.supportEmail}`}
                                className="flex items-center justify-between px-4 py-3 text-sm text-text-secondary hover:text-white transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <Mail className="w-4 h-4 text-text-tertiary" />
                                    <span>Contact Support</span>
                                </div>
                                <ExternalLink className="w-4 h-4 text-text-tertiary" />
                            </a>
                            {appConfig.communityUrl && <a
                                href={appConfig.communityUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-between px-4 py-3 text-sm text-text-secondary hover:text-white transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <svg className="w-4 h-4 text-[#5865F2]" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9460 2.4189-2.1568 2.4189z" />
                                    </svg>
                                    <span>Join our Discord</span>
                                </div>
                                <ExternalLink className="w-4 h-4 text-text-tertiary" />
                            </a>}
                        </div>
                    </div>

                    {/* App Info */}
                    <div className="text-center pt-8">
                        {appVersion && <p className="text-xs text-text-tertiary">Version {appVersion}</p>}
                    </div>

                    {/* Sign Out - Always at bottom */}
                    <div className="bg-bg-elevated/50 rounded-xl overflow-hidden mt-4">
                        <button
                            onClick={handleSignOut}
                            className="w-full flex items-center gap-3 px-4 py-4 text-red-400 hover:bg-red-400/5 transition"
                        >
                            <LogOut className="w-5 h-5" />
                            <span>Sign Out</span>
                        </button>
                    </div>

                    {/* Delete Account */}
                    <div className="bg-bg-elevated/50 rounded-xl overflow-hidden mt-2">
                        <button
                            onClick={handleDeleteAccount}
                            className="w-full flex items-center gap-3 px-4 py-4 text-red-400 hover:bg-red-400/5 transition"
                        >
                            <Trash2 className="w-5 h-5" />
                            <div className="text-left">
                                <span className="block font-medium">Delete Account</span>
                                <span className="block text-xs text-red-400/60">Permanently remove your account and all data</span>
                            </div>
                        </button>
                    </div>

                    {/* Bottom safe area spacer */}
                    <div style={{ height: 'calc(env(safe-area-inset-bottom) + 160px)' }} />
                </div>
            </div>
        </div >
    );
}
