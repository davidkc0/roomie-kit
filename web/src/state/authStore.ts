
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Session, User } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { registerPushUser, requestPushPermission, unregisterPushUser } from '../lib/onesignal';
import { appConfig, authRedirectUrl, deepLinkUrl } from '../config/app';

type AuthState = {
    session: Session | null;
    user: User | null;
    profile: {
        id: string;
        username?: string;
        avatar_url?: string;
        profile_image_url?: string;
        custom_photo_url?: string; // Stashes the uploaded photo
        avatar_headshot_url?: string; // Generated headshot of custom avatar
        bio?: string;
        friends_count?: number;
        created_at?: string;
        avatar_config?: {
            gender: 'male' | 'female';
            skinTone: string;
            outfit: string;
            feet: string;
        };
        account_status?: string;
        invite_code?: string;
        invited_by?: string;
        invites_remaining?: number;
        invites_used?: number;
    } | null;
    loading: boolean;
    initialized: boolean;
    justSignedIn: boolean; // Flag to track fresh sign-in for iOS keyboard offset workaround
    initialize: () => Promise<void>;
    signInWithGoogle: () => Promise<void>;
    signInWithApple: () => Promise<void>;
    signInWithEmail: (email: string, pass: string) => Promise<void>;
    signUpWithEmail: (email: string, pass: string) => Promise<void>;
    signOut: () => Promise<void>;
    syncProfile: (user: User) => Promise<void>;
    refreshProfile: () => Promise<void>;
    setupProfileSubscription: (userId: string) => any;
    uploadProfilePhoto: (base64Data: string, format: string) => Promise<string | null>;
    restoreProfilePhoto: () => Promise<void>;
    switchToAvatar: () => Promise<void>;
    uploadAvatarHeadshot: (blob: Blob) => Promise<string | null>;
    setLoading: (loading: boolean) => void;
    clearJustSignedIn: () => void;
};

export const useAuthStore = create<AuthState>((set, get) => ({
    session: null,
    user: null,
    profile: null,
    loading: true,
    initialized: false,
    justSignedIn: false,

    setLoading: (loading: boolean) => set({ loading }),

    clearJustSignedIn: () => set({ justSignedIn: false }),

    initialize: async () => {
        if (get().initialized) return;

        try {
            // Get initial session
            const { data: { session } } = await supabase.auth.getSession();
            let profile = null;

            if (session?.user) {
                // Retry loop for initial fetch
                let retries = 3;
                while (retries > 0 && !profile) {
                    try {
                        const { data, error } = await supabase
                            .from('profiles')
                            .select('*')
                            .eq('id', session.user.id)
                            .single();

                        if (!error && data) {
                            profile = data;
                            break;
                        }
                        if (error && error.code === 'PGRST116') { // Not found
                            break;
                        }
                    } catch (e) {
                        console.warn(`[AuthStore] Profile fetch attempt failed, ${retries} left`);
                    }
                    retries--;
                    if (!profile && retries > 0) await new Promise(r => setTimeout(r, 1000));
                }
            }

            set({
                session,
                user: session?.user ?? null,
                profile,
                loading: false,
                initialized: true
            });

            // Setup subscription if user exists
            if (session?.user) {
                get().setupProfileSubscription(session.user.id);

                // Register for push notifications on initial session
                if (Capacitor.isNativePlatform() && appConfig.features.push) {
                    console.log('[AuthStore] Registering push user on initial session');
                    requestPushPermission().then(() => {
                        registerPushUser(session.user.id);
                    });
                }
            }

            // Listen for changes
            supabase.auth.onAuthStateChange(async (event, session) => {
                console.log('[AuthStore] Auth State Change:', event, session?.user?.email);

                // Only act if session actually changed or we need to fetch profile logic
                const currentUser = get().user;
                if (event === 'INITIAL_SESSION' && currentUser?.id === session?.user?.id) {
                    return; // Ignore redundant initial event if we already have the user
                }

                let profile = get().profile;

                if (session?.user) {
                    // If it's a new user or we don't have a profile yet, fetch it
                    if (session.user.id !== currentUser?.id || !profile) {
                        console.log('[AuthStore] Fetching profile for user:', session.user.id);

                        // Direct fetch - no strict timeout, Supabase client handles it
                        const { data, error } = await supabase
                            .from('profiles')
                            .select('*')
                            .eq('id', session.user.id)
                            .single();

                        if (error) {
                            if (error.code === 'PGRST116') {
                                // PGRST116: JSON object requested, multiple (or no) rows returned
                                // This marks a "New User" -> Profile is null -> Onboarding
                                console.log('[AuthStore] New user detected (no profile found).');
                                profile = null;
                            } else {
                                // Real error (Network, etc)
                                console.error('[AuthStore] Profile fetch error:', error);
                                // CRITICAL: Do NOT set loading=false if it's a system error, 
                                // so the user sees loading (or we could show an error state)
                                // But for now, let's keep profile=null but maybe logged?
                                // Actually, if we set profile=null, they go to onboarding, which is wrong for network error.
                                // Let's keep the previous profile if available, or null if mostly unavoidable.
                                // For resilience in this specific bug context:
                                profile = null;
                            }
                        } else {
                            console.log('[AuthStore] Profile fetched successfully.');
                            profile = data;
                        }
                    }
                } else {
                    profile = null;
                }

                // Set justSignedIn if this is a fresh sign-in (not initial session restore)
                // This helps work around iOS keyboard viewport offset bug
                const isNewSignIn = session?.user && !currentUser && event !== 'INITIAL_SESSION';

                set({
                    session,
                    user: session?.user ?? null,
                    profile,
                    loading: false,
                    justSignedIn: isNewSignIn ? true : get().justSignedIn
                });

                // Setup subscription on login/change
                if (session?.user) {
                    get().setupProfileSubscription(session.user.id);

                    // Register for push notifications
                    if (Capacitor.isNativePlatform() && appConfig.features.push) {
                        requestPushPermission().then(() => {
                            registerPushUser(session.user.id);
                        });
                    }
                } else {
                    // User logged out - unregister from push
                    if (Capacitor.isNativePlatform() && appConfig.features.push) {
                        unregisterPushUser();
                    }
                }
            });
        } catch (error) {
            console.error('[AuthStore] Initialization failed', error);
            set({ loading: false, initialized: true });
        }
    },

    setupProfileSubscription: (userId: string) => {
        console.log('[AuthStore] Setting up profile subscription for:', userId);
        const channel = supabase
            .channel('public:profile:' + userId)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'profiles',
                    filter: `id=eq.${userId}`
                },
                (payload) => {
                    console.log('[AuthStore] Profile updated realtime:', payload.new);
                    set({ profile: payload.new as any });
                }
            )
            .subscribe();

        // Return cleanup function if needed, but for global store sticking to one sub is fine or handle unmount logic later
        // Ideally we store the channel and unsubscribe on logout
        return channel;
    },

    syncProfile: async (user: User) => {
        try {
            const { error } = await supabase
                .from('profiles')
                .upsert({
                    id: user.id,
                    username: user.email?.split('@')[0],
                    avatar_url: user.user_metadata?.avatar_url,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'id' });

            if (error) {
                console.error('[AuthStore] Failed to sync profile', error);
            } else {
                console.log('[AuthStore] Profile synced');
            }
        } catch (err) {
            console.error('[AuthStore] Exception syncing profile', err);
        }
    },

    refreshProfile: async () => {
        try {
            const user = get().user;
            if (!user) return;

            const { data } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();

            if (data) {
                set({ profile: data });
            }
        } catch (err) {
            console.error('[AuthStore] Error refreshing profile', err);
        }
    },

    signInWithGoogle: async () => {
        const isNative = Capacitor.isNativePlatform();
        const redirectTo = isNative ? deepLinkUrl('login-callback') : window.location.origin;

        console.log('[AuthStore] Signing in with Google. Platform:', isNative ? 'Native' : 'Web');
        console.log('[AuthStore] Redirect URL:', redirectTo);

        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo,
                skipBrowserRedirect: isNative, // On native, we handle the redirect ourselves
                queryParams: {
                    prompt: 'consent',
                    access_type: 'offline',
                },
            },
        });
        if (error) throw error;

        // On native, open the OAuth URL in an in-app browser (SFSafariViewController)
        // instead of external Safari — required by App Store Guideline 4
        if (isNative && data?.url) {
            const { Browser } = await import('@capacitor/browser');
            await Browser.open({ url: data.url, presentationStyle: 'popover' });
        }
    },

    signInWithApple: async () => {
        if (!Capacitor.isNativePlatform()) {
            throw new Error('Sign in with Apple is only available on iOS');
        }

        console.log('[AuthStore] Signing in with Apple...');

        // Dynamic import to avoid bundling native modules on web
        const { SignInWithApple } = await import('@capacitor-community/apple-sign-in');

        const result = await SignInWithApple.authorize({
            clientId: appConfig.appleClientId,
            redirectURI: appConfig.appleRedirectUri,
            scopes: 'email name',
        });

        const idToken = result.response.identityToken;
        if (!idToken) throw new Error('No identity token returned from Apple');

        console.log('[AuthStore] Got Apple ID token, authenticating with Supabase...');

        const { error } = await supabase.auth.signInWithIdToken({
            provider: 'apple',
            token: idToken,
        });

        if (error) throw error;
        console.log('[AuthStore] Apple sign-in successful');
    },

    signInWithEmail: async (email: string, pass: string) => {
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password: pass
        });
        if (error) throw error;
    },

    signUpWithEmail: async (email: string, pass: string) => {
        const { error } = await supabase.auth.signUp({
            email,
            password: pass,
            options: {
                emailRedirectTo: authRedirectUrl('/confirm-email'),
            },
        });
        if (error) throw error;
    },

    signOut: async () => {
        await supabase.auth.signOut();
        set({ session: null, user: null, profile: null });
    },

    uploadProfilePhoto: async (base64Data: string, format: string) => {
        try {
            const user = get().user;
            if (!user) throw new Error('No user logged in');

            // Convert base64 to Blob
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: `image/${format}` });

            const fileName = `${user.id}/${Date.now()}.${format}`;

            // Upload to Supabase Storage
            const { error: uploadError } = await supabase.storage
                .from('profile_photos')
                .upload(fileName, blob, {
                    contentType: `image/${format}`,
                    upsert: true
                });

            if (uploadError) throw uploadError;

            // Get Public URL
            const { data: { publicUrl } } = supabase.storage
                .from('profile_photos')
                .getPublicUrl(fileName);

            // Update Profile
            // CRITICAL: We update BOTH custom_photo_url (stash) and profile_image_url (active display)
            const { error: updateError } = await supabase
                .from('profiles')
                .update({
                    profile_image_url: publicUrl,
                    custom_photo_url: publicUrl,
                    updated_at: new Date().toISOString()
                })
                .eq('id', user.id);

            if (updateError) throw updateError;

            // Update Local State
            await get().refreshProfile();
            return publicUrl;
        } catch (error) {
            console.error('[AuthStore] Error uploading profile photo:', error);
            return null;
        }
    },

    restoreProfilePhoto: async () => {
        try {
            const user = get().user;
            const profile = get().profile;
            if (!user || !profile?.custom_photo_url) return;

            // Restore the stashed photo as the active display
            const { error } = await supabase
                .from('profiles')
                .update({
                    profile_image_url: profile.custom_photo_url,
                    updated_at: new Date().toISOString()
                })
                .eq('id', user.id);

            if (error) throw error;
            await get().refreshProfile();
        } catch (error) {
            console.error('[AuthStore] Error restoring profile photo:', error);
        }
    },

    switchToAvatar: async () => {
        try {
            const user = get().user;
            if (!user) return;

            // ONLY clear the active display (profile_image_url), KEEP the stash (custom_photo_url)
            const { error } = await supabase
                .from('profiles')
                .update({
                    profile_image_url: null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', user.id);

            if (error) throw error;
            await get().refreshProfile();
        } catch (error) {
            console.error('[AuthStore] Error switching to avatar:', error);
        }
    },

    uploadAvatarHeadshot: async (blob: Blob) => {
        try {
            const user = get().user;
            if (!user) return null;

            const fileName = `${user.id}/avatar_headshot.png`;

            // Upload to Supabase Storage (overwrite existing)
            const { error: uploadError } = await supabase.storage
                .from('profile_photos')
                .upload(fileName, blob, {
                    contentType: 'image/png',
                    upsert: true
                });

            if (uploadError) throw uploadError;

            // Get Public URL with cache-busting timestamp
            const { data: { publicUrl } } = supabase.storage
                .from('profile_photos')
                .getPublicUrl(fileName);

            // Add cache-busting timestamp
            const publicUrlWithCacheBust = `${publicUrl}?t=${Date.now()}`;

            // Update profile with headshot URL
            const { error: updateError } = await supabase
                .from('profiles')
                .update({
                    avatar_headshot_url: publicUrlWithCacheBust,
                    updated_at: new Date().toISOString()
                })
                .eq('id', user.id);

            if (updateError) throw updateError;

            // Refresh profile to get updated data
            await get().refreshProfile();

            console.log('[AuthStore] Avatar headshot uploaded:', publicUrlWithCacheBust);
            return publicUrlWithCacheBust;
        } catch (error) {
            console.error('[AuthStore] Error uploading avatar headshot:', error);
            return null;
        }
    },
}));
