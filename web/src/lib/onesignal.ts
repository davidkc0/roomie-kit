/**
 * OneSignal Push Notification Helper
 * 
 * This module handles OneSignal initialization and user registration.
 * Only runs on native platforms (iOS/Android).
 */

import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';
import { appConfig } from '../config/app';

// Declare window.plugins for TypeScript
declare global {
    interface Window {
        plugins?: {
            OneSignal?: any;
        };
    }
}

// OneSignal SDK reference
let OneSignal: any = null;

/**
 * Initialize OneSignal SDK.
 * Must be called early in app lifecycle (before React renders).
 */
export async function initializeOneSignal() {
    if (!Capacitor.isNativePlatform()) {
        console.log('[OneSignal] Skipping - not on native platform');
        return;
    }
    if (!appConfig.features.push || !appConfig.oneSignalAppId) {
        console.log('[OneSignal] Skipping - push disabled or VITE_ONESIGNAL_APP_ID missing');
        return;
    }

    // Wait for device ready (Cordova plugins load after DOM)
    const waitForOneSignal = (): Promise<any> => {
        return new Promise((resolve) => {
            const check = () => {
                if (window.plugins?.OneSignal) {
                    resolve(window.plugins.OneSignal);
                } else {
                    setTimeout(check, 100);
                }
            };
            check();
            // Timeout after 5 seconds
            setTimeout(() => resolve(null), 5000);
        });
    };

    try {
        OneSignal = await waitForOneSignal();

        if (!OneSignal) {
            console.error('[OneSignal] ❌ Plugin not found on window.plugins');
            return;
        }

        console.log('[OneSignal] Initializing');

        // Initialize the SDK
        OneSignal.initialize(appConfig.oneSignalAppId);

        // Set up notification click handler for deep linking
        OneSignal.Notifications.addEventListener('click', (event: any) => {
            console.log('[OneSignal] Notification clicked:', event);

            const data = event.notification?.additionalData;
            if (data?.type && data?.source_id) {
                handleNotificationDeepLink(data.type, data.source_id);
            }
        });

        console.log('[OneSignal] ✅ Initialized successfully');
    } catch (error) {
        console.error('[OneSignal] ❌ Failed to initialize:', error);
    }
}

/**
 * Request push notification permission.
 * Call this after user has logged in or at an appropriate moment.
 */
export async function requestPushPermission(): Promise<boolean> {
    if (!OneSignal) {
        console.log('[OneSignal] SDK not initialized');
        return false;
    }

    try {
        console.log('[OneSignal] Requesting permission...');
        const accepted = await OneSignal.Notifications.requestPermission(true);
        console.log('[OneSignal] Permission result:', accepted);
        return accepted;
    } catch (error) {
        console.error('[OneSignal] Permission request failed:', error);
        return false;
    }
}

/**
 * Link the current device to a Supabase user.
 * This allows the backend to send targeted push notifications.
 * 
 * @param userId - The Supabase user ID
 */
export async function registerPushUser(userId: string) {
    if (!OneSignal) {
        console.log('[OneSignal] SDK not initialized');
        return;
    }

    try {
        console.log('[OneSignal] Registering user:', userId);

        // Login with the external user ID (Supabase user ID)
        await OneSignal.login(userId);

        // Get the OneSignal Player ID
        const playerId = await OneSignal.User.getOnesignalId();
        console.log('[OneSignal] Player ID:', playerId);

        if (playerId) {
            // Store the mapping in Supabase
            const { error } = await supabase
                .from('push_tokens')
                .upsert({
                    user_id: userId,
                    onesignal_player_id: playerId,
                    platform: Capacitor.getPlatform(),
                    updated_at: new Date().toISOString(),
                }, {
                    onConflict: 'user_id'
                });

            if (error) {
                console.error('[OneSignal] Failed to store push token:', error);
            } else {
                console.log('[OneSignal] ✅ Push token registered');
            }
        }
    } catch (error) {
        console.error('[OneSignal] User registration failed:', error);
    }
}

/**
 * Logout from OneSignal (e.g., when user signs out).
 */
export async function unregisterPushUser() {
    if (!OneSignal) return;

    try {
        await OneSignal.logout();
        console.log('[OneSignal] User logged out');
    } catch (error) {
        console.error('[OneSignal] Logout failed:', error);
    }
}

/**
 * Handle deep linking from notification clicks.
 */
function handleNotificationDeepLink(type: string, sourceId: string) {
    console.log('[OneSignal] Deep link:', type, sourceId);

    switch (type) {
        case 'friend_request':
            window.location.href = '/friends';
            break;
        case 'room_visit':
            window.location.href = `/room/${sourceId}`;
            break;
        case 'whiteboard_message':
            window.location.href = `/room/${sourceId}`;
            break;
        case 'tournament_win':
            window.location.href = `/leaderboard/${sourceId}`;
            break;
        case 'account_activation':
            window.location.href = '/';
            break;
        default:
            console.log('[OneSignal] Unknown notification type:', type);
    }
}
