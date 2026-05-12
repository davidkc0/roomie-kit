import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, X, Bell } from 'lucide-react';
import { useAuthStore } from '../state/authStore';
import { supabase } from '../lib/supabase';
import { UserProfileSheet } from '../components/UserProfileSheet';

type Notification = {
    id: number;
    user_id: string;
    type: 'friend_request';
    sender_id: string;
    read: boolean;
    created_at: string;
    sender_profile?: {
        username: string;
        profile_image_url: string;
        avatar_headshot_url: string;
    };
};

export default function NotificationsPage() {
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
    const [isExiting, setIsExiting] = useState(false);

    useEffect(() => {
        if (!user) return;
        fetchNotifications();

        // Mark all as read on mount
        markAllAsRead();
    }, [user]);

    const fetchNotifications = async () => {
        try {
            console.log('[Notifications] Fetching for user:', user?.id);
            if (!user) return;

            // 1. Fetch notifications
            const { data: notificationsData, error: notifError } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (notifError) {
                console.error('[Notifications] Error fetching notifications table:', notifError);
                throw notifError;
            }

            console.log('[Notifications] Raw data:', notificationsData);

            if (!notificationsData || notificationsData.length === 0) {
                console.log('[Notifications] No notifications found.');
                setNotifications([]);
                return;
            }

            // 2. Extract sender IDs
            const senderIds = [...new Set(notificationsData.map(n => n.sender_id).filter(Boolean))];
            console.log('[Notifications] Sender IDs:', senderIds);

            // 3. Fetch profiles for senders
            const { data: profilesData, error: profilesError } = await supabase
                .from('profiles')
                .select('id, username, profile_image_url, avatar_headshot_url')
                .in('id', senderIds);

            if (profilesError) {
                console.error('[Notifications] Error fetching profiles:', profilesError);
                throw profilesError;
            }

            // 4. Map profiles to notifications
            const profilesMap = new Map(profilesData?.map(p => [p.id, p]));

            const enrichedNotifications = notificationsData.map(n => ({
                ...n,
                sender_profile: profilesMap.get(n.sender_id)
            }));

            console.log('[Notifications] Enriched list:', enrichedNotifications);
            setNotifications(enrichedNotifications);
        } catch (error) {
            console.error('Error fetching notifications:', error);
        } finally {
            setLoading(false);
        }
    };

    const markAllAsRead = async () => {
        try {
            await supabase
                .from('notifications')
                .update({ read: true })
                .eq('user_id', user!.id)
                .eq('read', false);
        } catch (error) {
            console.error('Error marking notifications read:', error);
        }
    };

    const handleAcceptRequest = async (notificationId: number, senderId: string) => {
        try {
            // 1. Update friendship to accepted
            const { error, count } = await supabase
                .from('friendships')
                .update({ status: 'accepted' }, { count: 'exact' })
                .eq('user_id_1', senderId)
                .eq('user_id_2', user!.id);

            if (error) throw error;

            // Check if update actually happened
            if (count === 0) {
                throw new Error('Friend request not found');
            }

            // 2. Remove notification from UI
            setNotifications(prev => prev.filter(n => n.id !== notificationId));

            // 3. Delete notification from DB (try RPC for better permissions)
            const { error: delError } = await supabase.rpc('delete_notification', { p_notification_id: notificationId });

            if (delError) {
                console.error('Error deleting notification via RPC, trying direct delete:', delError);
                await supabase.from('notifications').delete().eq('id', notificationId);
            }

            // 4. Refresh profile to update friends_count
            useAuthStore.getState().refreshProfile();

        } catch (error) {
            console.error('Error accepting friend request:', error);
            // If error is about missing row, clean up notification
            // But Supabase doesn't always throw for 0 rows updated, so we might need to check count above if desired.
            // However, simple approach:
            alert('Failed to accept request or request expired.');

            // Cleanup if it's expired
            setNotifications(prev => prev.filter(n => n.id !== notificationId));

            const { error: delError } = await supabase.rpc('delete_notification', { p_notification_id: notificationId });
            if (delError) {
                await supabase.from('notifications').delete().eq('id', notificationId);
            }
        }
    };

    const handleRejectRequest = async (notificationId: number, senderId: string) => {
        try {
            // Delete friendship row using explicit sender/recipient pairing
            const { error, count } = await supabase
                .from('friendships')
                .delete({ count: 'exact' })
                .match({ user_id_1: senderId, user_id_2: user!.id });

            if (error) throw error;

            // If count is 0, it means it was already deleted (orphaned notification)
            if (count === 0) {
                console.log('Friend request already deleted, cleaning up notification');
            }

            // Delete notification
            const { error: delNotifError } = await supabase.rpc('delete_notification', { p_notification_id: notificationId });

            if (delNotifError) {
                console.error('Error deleting notification via RPC (reject), trying direct:', delNotifError);
                await supabase.from('notifications').delete().eq('id', notificationId);
            }

            setNotifications(prev => prev.filter(n => n.id !== notificationId));

        } catch (error) {
            console.error('Error rejecting friend request:', error);
        }
    };

    const handleBack = () => {
        setIsExiting(true);
        setTimeout(() => navigate(-1), 280);
    };

    return (
        <div className={`min-h-screen bg-bg-base text-white pb-20 ${isExiting ? 'animate-slide-out-right' : 'animate-slide-in-right'}`}>
            {/* Header */}
            <div
                className="sticky top-0 z-10 bg-bg-base/80 backdrop-blur-md border-b border-border px-4 py-4 flex items-center justify-center relative"
            >
                <div className="relative mx-auto flex w-full max-w-2xl items-center justify-center">
                    <button
                        onClick={handleBack}
                        className="absolute left-0 p-2 -ml-2 text-text-secondary hover:text-white transition-colors"
                    >
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <h1 className="text-xl font-bold">Notifications</h1>
                </div>
            </div>

            <div className="mx-auto w-full max-w-2xl p-4 space-y-4">
                {loading ? (
                    <div className="text-center py-10 text-text-tertiary">Loading...</div>
                ) : notifications.length === 0 ? (
                    <div className="text-center py-20 flex flex-col items-center opacity-50">
                        <Bell className="w-16 h-16 mb-4 text-text-tertiary" />
                        <p className="text-text-tertiary font-medium">No new notifications</p>
                    </div>
                ) : (
                    notifications.map((notification) => (
                        <div
                            key={notification.id}
                            className="bg-bg-surface border border-border rounded-2xl p-4 flex items-center justify-between gap-4 animate-slide-up"
                        >
                            <div className="flex items-center gap-3 overflow-hidden">
                                {/* Avatar */}
                                <div
                                    className="w-12 h-12 rounded-full bg-bg-elevated flex-shrink-0 overflow-hidden border border-border cursor-pointer active:scale-95 transition-transform"
                                    onClick={() => setSelectedProfileId(notification.sender_id)}
                                >
                                    <img
                                        src={notification.sender_profile?.profile_image_url || notification.sender_profile?.avatar_headshot_url || `https://api.dicebear.com/7.x/initials/svg?seed=${notification.sender_profile?.username}`}
                                        alt={notification.sender_profile?.username}
                                        className="w-full h-full object-cover"
                                    />
                                </div>

                                {/* Text */}
                                <div className="min-w-0">
                                    <h3 className="font-bold text-sm truncate text-white">
                                        {notification.sender_profile?.username || 'Unknown User'}
                                    </h3>
                                    <p className="text-xs text-text-tertiary">
                                        {notification.type === 'friend_request' ? 'Sent you a friend request' : 'New notification'}
                                    </p>
                                </div>
                            </div>

                            {/* Actions */}
                            {notification.type === 'friend_request' && (
                                <div className="flex gap-2 flex-shrink-0">
                                    <button
                                        onClick={() => handleAcceptRequest(notification.id, notification.sender_id)}
                                        className="p-2 bg-[linear-gradient(135deg,#7C3AED_0%,#D946EF_50%,#FDBA74_100%)] rounded-full hover:brightness-110 transition-all shadow-lg shadow-purple-500/20"
                                        aria-label="Confirm"
                                    >
                                        <Check className="w-5 h-5 text-white" />
                                    </button>
                                    <button
                                        onClick={() => handleRejectRequest(notification.id, notification.sender_id)}
                                        className="p-2 bg-bg-elevated rounded-full hover:bg-bg-elevated/80 transition-colors border border-border"
                                        aria-label="Delete"
                                    >
                                        <X className="w-5 h-5 text-text-secondary" />
                                    </button>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
            {
                selectedProfileId && (
                    <UserProfileSheet
                        profileId={selectedProfileId}
                        onClose={() => setSelectedProfileId(null)}
                    />
                )
            }
        </div >
    );
}
