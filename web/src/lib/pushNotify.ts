/**
 * Push Notification Client Helper
 * 
 * Functions for triggering push notifications from the client.
 * These call the send-notification Edge Function.
 */

import { supabase } from './supabase';

interface NotificationPayload {
    target_user_id: string;
    notification_type: 'friend_requests' | 'room_visits' | 'whiteboard_messages' | 'tournament_wins' | 'marketing' | 'streak_reminders' | 'account_activation';
    title: string;
    message: string;
    data?: {
        type: string;
        source_id?: string;
    };
}

/**
 * Send a push notification via the Edge Function
 */
async function sendNotification(payload: NotificationPayload): Promise<boolean> {
    try {
        const { data, error } = await supabase.functions.invoke('send-notification', {
            body: payload,
        });

        if (error) {
            console.error('[PushNotify] Error:', error);
            return false;
        }

        console.log('[PushNotify] Result:', data);
        return data?.success === true;
    } catch (err) {
        console.error('[PushNotify] Failed to send:', err);
        return false;
    }
}

/**
 * Notify room owner that someone visited their room
 */
export async function notifyRoomVisit(
    roomOwnerId: string,
    visitorName: string,
    roomSlug: string
): Promise<boolean> {
    // Don't notify if the visitor is the owner
    const currentUserId = (await supabase.auth.getUser()).data.user?.id;
    if (currentUserId === roomOwnerId) {
        return false;
    }

    return sendNotification({
        target_user_id: roomOwnerId,
        notification_type: 'room_visits',
        title: 'Visitor in your room!',
        message: `👋 ${visitorName} is visiting your room`,
        data: {
            type: 'room_visit',
            source_id: roomSlug,
        },
    });
}

/**
 * Notify user about a new friend request
 */
export async function notifyFriendRequest(
    targetUserId: string,
    senderName: string
): Promise<boolean> {
    return sendNotification({
        target_user_id: targetUserId,
        notification_type: 'friend_requests',
        title: 'New Friend Request',
        message: `🤝 ${senderName} sent you a friend request`,
        data: {
            type: 'friend_request',
        },
    });
}

/**
 * Notify about tournament win
 */
export async function notifyTournamentWin(
    targetUserId: string,
    gameName: string,
    position: number
): Promise<boolean> {
    const positionText = position === 1 ? '1st' : position === 2 ? '2nd' : position === 3 ? '3rd' : `${position}th`;

    return sendNotification({
        target_user_id: targetUserId,
        notification_type: 'tournament_wins',
        title: 'Tournament Results!',
        message: `🏆 You placed ${positionText} in this week's ${gameName} tournament!`,
        data: {
            type: 'tournament_win',
            source_id: gameName.toLowerCase(),
        },
    });
}

/**
 * Notify room owner that someone drew on their whiteboard
 */
export async function notifyWhiteboardMessage(
    roomOwnerId: string,
    drawerName: string,
    roomSlug: string
): Promise<boolean> {
    // Don't notify if the drawer is the owner
    const currentUserId = (await supabase.auth.getUser()).data.user?.id;
    if (currentUserId === roomOwnerId) {
        return false;
    }

    return sendNotification({
        target_user_id: roomOwnerId,
        notification_type: 'whiteboard_messages',
        title: 'Someone drew on your whiteboard! 🎨',
        message: `✏️ ${drawerName} left something on your whiteboard`,
        data: {
            type: 'whiteboard_message',
            source_id: roomSlug,
        },
    });
}
