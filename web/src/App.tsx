import { BrowserRouter, Route, Routes, useNavigate, useLocation, Navigate, Outlet } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { supabase } from './lib/supabase';
import Lobby from './pages/Lobby';
import Room from './pages/Room';
import SnakeTest from './pages/SnakeTest';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import { useAuthStore } from './state/authStore';
import { AvatarEditor } from './components/AvatarEditor';
import { ThumbnailGenerator } from './components/ThumbnailGenerator';
import { type AvatarConfig, DEFAULT_AVATAR_CONFIG } from './avatars/avatarTextures';
import BottomNav from './components/BottomNav';
import ProfilePage from './pages/ProfilePage';
import SettingsPage from './pages/SettingsPage';
import NotificationsPage from './pages/Notifications';
import FriendsPage from './pages/FriendsPage';
import SearchPage from './pages/SearchPage';
import { VideoChatOverlay } from './components/VideoChatOverlay';
import { IncomingCallModal } from './components/IncomingCallModal';
import { ChessInviteModal } from './components/ChessInviteModal';
import { initSignaling, subscribeToSignals, cleanupSignaling } from './lib/signaling';
import { useVideoCallStore } from './state/videoCallStore';
import { useChessStore } from './state/chessStore';
import { PurchaseDrawer } from './components/PurchaseDrawer';
import { DailyRewardModal } from './components/DailyRewardModal';
import { StreakInfoDrawer } from './components/StreakInfoDrawer';
import { RoomErrorBoundary } from './components/RoomErrorBoundary';
import { DisconnectModal } from './components/DisconnectModal';
import WaitlistPage from './pages/WaitlistPage';
import InviteRedirect from './pages/InviteRedirect';
import { SplashScreen } from './components/SplashScreen';
import { LoadingSpinner } from './components/LoadingSpinner';
import { appConfig, defaultAvatarUrl } from './config/app';
import ConfirmEmailPage from './pages/ConfirmEmail';
import ResetPasswordPage from './pages/ResetPassword';

console.log('[app.tsx] Module loaded');

function AvatarCreatorWrapper() {
  const navigate = useNavigate();
  const location = useLocation();
  const roomSlug = (location.state as any)?.roomSlug || 'plaza';
  const fromProfile = (location.state as any)?.fromProfile || false;
  const { profile, user } = useAuthStore();

  const handleSave = async (config: AvatarConfig) => {
    if (!user) {
      navigate(fromProfile ? '/profile' : (roomSlug === 'lobby' ? '/' : `/rooms/${roomSlug}`));
      return;
    }

    try {
      const { error } = await supabase.from('profiles').update({
        avatar_config: config,
        avatar_url: defaultAvatarUrl,
        updated_at: new Date().toISOString()
      }).eq('id', user.id);

      if (error) console.error('Failed to save avatar config:', error);
      else await useAuthStore.getState().refreshProfile();
    } catch (e) {
      console.error('Exception saving avatar:', e);
    }

    // Navigate back to where we came from
    navigate(fromProfile ? '/profile' : (roomSlug === 'lobby' ? '/' : `/rooms/${roomSlug}`));
  };

  const handleClose = () => {
    navigate(fromProfile ? '/profile' : (roomSlug === 'lobby' ? '/' : `/rooms/${roomSlug}`));
  };

  return (
    <AvatarEditor
      initialConfig={profile?.avatar_config || DEFAULT_AVATAR_CONFIG}
      onSave={handleSave}
      onClose={handleClose}
    />
  );
}

// CRITICAL: Module-level flag for disconnect state that persists across remounts
let PROTECTED_LAYOUT_DISCONNECTED = false;

function ProtectedLayout() {
  const { user, profile, loading } = useAuthStore();
  const location = useLocation();

  // Initialize from persistent flag
  const [isDisconnectedInRoom, setIsDisconnectedInRoom] = useState(PROTECTED_LAYOUT_DISCONNECTED);

  // Use Capacitor Network plugin for iOS compatibility
  useEffect(() => {
    let listenerHandle: any = null;

    const setupNetworkListener = async () => {
      // Only care about disconnect if we're in a room
      if (!location.pathname.startsWith('/rooms/')) return;

      try {
        const { Network } = await import('@capacitor/network');

        // Check initial state
        const status = await Network.getStatus();
        if (!status.connected) {
          PROTECTED_LAYOUT_DISCONNECTED = true;
          setIsDisconnectedInRoom(true);
        }

        // Listen for changes
        listenerHandle = await Network.addListener('networkStatusChange', (status) => {
          if (!status.connected && location.pathname.startsWith('/rooms/')) {
            PROTECTED_LAYOUT_DISCONNECTED = true;
            setIsDisconnectedInRoom(true);
          }
        });
      } catch (_err) {
        // Fallback to browser events for web
        const handleOffline = () => {
          if (location.pathname.startsWith('/rooms/')) {
            PROTECTED_LAYOUT_DISCONNECTED = true;
            setIsDisconnectedInRoom(true);
          }
        };
        window.addEventListener('offline', handleOffline);
      }
    };

    setupNetworkListener();

    return () => {
      if (listenerHandle?.remove) {
        listenerHandle.remove();
      }
    };
  }, [location.pathname]);

  // CRITICAL: If disconnected in room (from state OR flag), show disconnect modal instead of any redirects
  if (isDisconnectedInRoom || (PROTECTED_LAYOUT_DISCONNECTED && location.pathname.startsWith('/rooms/'))) {
    return <DisconnectModal isOpen={true} />;
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black text-white">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Force onboarding if profile or username is missing
  // But allow access to /onboarding to prevent loop
  // ALSO: Don't redirect if disconnected (we'll show disconnect modal instead)
  if ((!profile || !profile.username) && location.pathname !== '/onboarding' && !isDisconnectedInRoom && !PROTECTED_LAYOUT_DISCONNECTED) {
    return <Navigate to="/onboarding" replace />;
  }

  // Waitlist gating is opt-in for the open-source starter.
  const waitlistAllowedPaths = ['/profile', '/settings', '/onboarding', '/waitlist'];
  const isWaitlistAllowed = waitlistAllowedPaths.includes(location.pathname) ||
    location.pathname.startsWith('/avatar');

  if (
    appConfig.features.waitlist &&
    profile?.account_status &&
    profile.account_status !== 'active' &&
    !isWaitlistAllowed &&
    !isDisconnectedInRoom &&
    !PROTECTED_LAYOUT_DISCONNECTED
  ) {
    return <Navigate to="/waitlist" replace />;
  }

  // Check if we should show bottom nav (not in room, onboarding, or waitlist)
  const isWaitlisted = appConfig.features.waitlist && profile?.account_status === 'waitlist';
  const showBottomNav = !location.pathname.startsWith('/rooms/') && location.pathname !== '/onboarding' && !location.pathname.startsWith('/avatar') && location.pathname !== '/waitlist' && !isWaitlisted;

  return (
    <>
      <Outlet />
      {showBottomNav && <BottomNav />}
    </>
  );
}

function AuthNavigator() {
  const navigate = useNavigate();
  const deepLinkListenerSetup = useRef(false);

  useEffect(() => {
    // Only set up once
    if (deepLinkListenerSetup.current) return;
    deepLinkListenerSetup.current = true;

    console.log('[AuthNavigator] Initializing Auth & Listeners...');
    useAuthStore.getState().initialize();

    // Handle deep links (for OAuth redirects)
    let listenerHandle: any = null;

    if (Capacitor.isNativePlatform()) {
      CapacitorApp.addListener('appUrlOpen', async (data: any) => {
        console.log('[AuthNavigator] 🔗 Deep link received:', data.url);

        // IMMEDIATE: Enter loading state
        useAuthStore.getState().setLoading(true);

        try {
          const url = new URL(data.url);

          // DEBUG: Log all parts of the URL
          console.log('[AuthNavigator] URL parts:', {
            origin: url.origin,
            pathname: url.pathname,
            search: url.search,
            hash: url.hash,
          });

          const target = url.hostname || url.pathname.replace(/^\/+/, '');
          const isPasswordRecovery = target === 'reset-password' || url.searchParams.get('type') === 'recovery';

          // Try extracting tokens from HASH first (standard OAuth implicit flow)
          let access_token: string | null = null;
          let refresh_token: string | null = null;

          // Method 1: Check URL hash (e.g., roomie://callback#access_token=xxx&refresh_token=yyy)
          if (url.hash && url.hash.length > 1) {
            const hashParams = new URLSearchParams(url.hash.substring(1));
            access_token = hashParams.get('access_token');
            refresh_token = hashParams.get('refresh_token');
            console.log('[AuthNavigator] Tokens from HASH:', { access_token: !!access_token, refresh_token: !!refresh_token });
          }

          // Method 2: Check query params (e.g., roomie://callback?access_token=xxx&refresh_token=yyy)
          if (!access_token && url.search) {
            const searchParams = new URLSearchParams(url.search);
            access_token = searchParams.get('access_token');
            refresh_token = searchParams.get('refresh_token');
            console.log('[AuthNavigator] Tokens from QUERY:', { access_token: !!access_token, refresh_token: !!refresh_token });
          }

          // Method 3: Check if there's a code (PKCE flow) instead of tokens
          const code = url.searchParams?.get('code') || new URLSearchParams(url.hash?.substring(1) || '').get('code');
          if (code && !access_token) {
            console.log('[AuthNavigator] Found authorization CODE (PKCE flow). Exchanging...');
            // Supabase should handle code exchange automatically via detectSessionInUrl
            // But on native, we might need to do it manually
            const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
            if (exchangeError) {
              console.error('[AuthNavigator] Code exchange error:', exchangeError);
              useAuthStore.getState().setLoading(false);
              alert('Login error: ' + exchangeError.message);
              return;
            }
            if (exchangeData.session) {
              console.log('[AuthNavigator] ✅ Session from code exchange!');
              navigate(isPasswordRecovery ? '/reset-password' : '/');
              return;
            }
          }

          if (access_token && refresh_token) {
            console.log('[AuthNavigator] ✅ Found tokens. Setting session...');

            // Safety: Force navigation if stuck for 10s
            const safetyTimer = setTimeout(() => {
              if (useAuthStore.getState().loading) {
                console.warn('[AuthNavigator] Safety timer. Forcing home.');
                useAuthStore.getState().setLoading(false);
                navigate(isPasswordRecovery ? '/reset-password' : '/');
              }
            }, 10000);

            const { data: sessionData, error } = await supabase.auth.setSession({
              access_token,
              refresh_token
            });

            if (error) {
              clearTimeout(safetyTimer);
              console.error('[AuthNavigator] Session Error:', error);
              useAuthStore.getState().setLoading(false);
              alert('Login error: ' + error.message);
            } else if (sessionData.session) {
              console.log('[AuthNavigator] Session set. Waiting for store...');

              // Poll for store to finish profile fetch
              const interval = setInterval(() => {
                const state = useAuthStore.getState();
                if (!state.loading) {
                  clearInterval(interval);
                  clearTimeout(safetyTimer);
                  console.log('[AuthNavigator] Ready. Navigating home.');
                  navigate('/');
                }
              }, 500);
            }
          } else {
            console.log('[AuthNavigator] ❌ No tokens found in deep link.');
            console.log('[AuthNavigator] Full URL was:', data.url);
            useAuthStore.getState().setLoading(false);
          }
        } catch (e) {
          console.error('[AuthNavigator] Deep link error:', e);
          useAuthStore.getState().setLoading(false);
        }
      }).then(handle => {
        listenerHandle = handle;
      });
    }

    return () => {
      if (listenerHandle) listenerHandle.remove();
    };
  }, [navigate]);

  // Video Call Signaling
  const { user } = useAuthStore();
  const { receiveCall, acceptCall, endCall } = useVideoCallStore();

  useEffect(() => {
    if (user?.id) {
      // Init signaling
      initSignaling(user.id);

      if (appConfig.features.payments) {
        import('./services/revenueCatService')
          .then(({ initRevenueCat }) => initRevenueCat(user.id))
          .catch(err => console.warn('[App] RevenueCat init failed (expected on web):', err));
      }

      const unsubscribe = subscribeToSignals((payload) => {
        console.log('[App] Received signal:', payload);

        if (payload.type === 'request') {
          // If busy, maybe ignore?
          if (useVideoCallStore.getState().status !== 'idle') {
            return;
          }

          receiveCall(payload.roomId, {
            id: payload.fromId,
            username: payload.fromName,
            avatarUrl: payload.fromAvatar
          });
        }

        if (payload.type === 'accept') {
          const currentState = useVideoCallStore.getState();
          console.log('[App] Accept received. Current state:', currentState.status, 'roomId:', currentState.roomId);

          // If our state was reset (e.g., Agora had an error), restore it using payload
          if (currentState.status === 'idle' || !currentState.roomId) {
            console.log('[App] Restoring call state from accept payload');
            // Use startCall to restore full state, then setConnected
            useVideoCallStore.getState().startCall(payload.roomId, {
              id: payload.fromId,
              username: payload.fromName,
              avatarUrl: payload.fromAvatar
            });
          }

          // Now set to connected
          acceptCall();
        }

        if (payload.type === 'decline' || payload.type === 'end') {
          endCall();
        }

        // Chess signals
        if (payload.type === 'chess_request') {
          console.log('[App] Chess invite received from:', payload.fromName);
          useChessStore.getState().receiveInvite(
            payload.fromId,
            payload.fromName || 'Player',
            payload.fromAvatar,
            payload.roomId,
            payload.playerColor || 'b'
          );
        }

        if (payload.type === 'chess_accept') {
          console.log('[App] Chess invite accepted by:', payload.fromName);
          // Start the game as white (inviter)
          useChessStore.getState().startMultiplayerGame(
            payload.roomId,
            { id: payload.fromId, name: payload.fromName || 'Player', avatar: payload.fromAvatar },
            'w'
          );
        }

        if (payload.type === 'chess_decline') {
          console.log('[App] Chess invite declined');
          useChessStore.getState().endMultiplayerGame();
        }

        if (payload.type === 'chess_move' && payload.move) {
          console.log('[App] Chess move received:', payload.move);
          useChessStore.getState().receiveMove(
            payload.move.from as any,
            payload.move.to as any
          );
        }

        if (payload.type === 'chess_resign') {
          console.log('[App] Opponent resigned');
          useChessStore.getState().endMultiplayerGame();
        }
      });

      return () => {
        unsubscribe();
        cleanupSignaling();
      };
    }
  }, [user?.id]);

  // Presence Management: Set online on login, offline on app background/close
  useEffect(() => {
    if (!user?.id) return;

    // Set online when user is authenticated
    supabase.rpc('update_presence', {
      p_status: 'online',
      p_room_slug: null,
      p_room_type: null,
      p_room_owner_id: null
    }).then(({ error }) => {
      if (error) console.error('[App] Failed to set online presence:', error);
    });

    // Handle visibility change (app goes to background or user switches tabs)
    const handleVisibilityChange = () => {
      const status = document.visibilityState === 'visible' ? 'online' : 'offline';
      supabase.rpc('update_presence', {
        p_status: status,
        p_room_slug: null,
        p_room_type: null,
        p_room_owner_id: null
      }).then(({ error }) => {
        if (error) console.error('[App] Failed to update presence on visibility change:', error);
      });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Handle page unload (user closes tab/browser)
    const handleBeforeUnload = () => {
      // Use sendBeacon for reliable delivery on page close
      navigator.sendBeacon?.(
        `${String(import.meta.env.VITE_SUPABASE_URL || '').trim()}/rest/v1/rpc/update_presence`,
        JSON.stringify({ p_status: 'offline', p_room_slug: null, p_room_type: null, p_room_owner_id: null })
      );
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);

      // Set offline when cleanup runs (logout, etc)
      supabase.rpc('update_presence', {
        p_status: 'offline',
        p_room_slug: null,
        p_room_type: null,
        p_room_owner_id: null
      });
    };
  }, [user?.id]);

  return (
    <div className="flex-1 relative overflow-hidden" style={{ flex: '1', height: '100%', width: '100%' }}>
      <VideoChatOverlay />
      <IncomingCallModal />
      <ChessInviteModal />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/confirm-email" element={<ConfirmEmailPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        <Route element={<ProtectedLayout />}>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/" element={<Lobby />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/friends" element={<FriendsPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/avatar/edit" element={<AvatarCreatorWrapper />} />
          <Route path="/avatar/thumbnails" element={<ThumbnailGenerator />} />
          <Route path="/avatar/:slug" element={<AvatarCreatorWrapper />} />
          <Route path="/rooms/:slug" element={
            <RoomErrorBoundary>
              <Room />
            </RoomErrorBoundary>
          } />
          <Route path="/snake" element={<SnakeTest />} />
          <Route path="/waitlist" element={appConfig.features.waitlist ? <WaitlistPage /> : <Navigate to="/" replace />} />
        </Route>
        <Route path="/join/:code" element={<InviteRedirect />} />
      </Routes>
    </div>
  );
}

function App() {
  console.log('[App] Rendering...');

  // Splash screen — show on native only, once per app launch.
  // Uses sessionStorage so it survives HMR and module re-evaluation
  // but resets on cold start (app kill).
  const [showSplash, setShowSplash] = useState(() => {
    if (sessionStorage.getItem('splashShown')) return false;
    return Capacitor.isNativePlatform();
  });

  // iOS keyboard viewport offset workaround
  // After signing in with keyboard, iOS leaves a ~19px viewport offset
  // Try toggling StatusBar overlaysWebView to force viewport recalculation
  const { justSignedIn, clearJustSignedIn } = useAuthStore();
  const isIOS = Capacitor.getPlatform() === 'ios';

  useEffect(() => {
    if (isIOS && justSignedIn) {
      console.log('[App] iOS keyboard offset workaround: toggling StatusBar');
      clearJustSignedIn();

      // Try StatusBar toggle workaround
      import('@capacitor/status-bar').then(({ StatusBar }) => {
        // Toggle overlaysWebView off then on
        StatusBar.setOverlaysWebView({ overlay: false }).then(() => {
          setTimeout(() => {
            StatusBar.setOverlaysWebView({ overlay: true });
            console.log('[App] iOS keyboard offset workaround: StatusBar toggled');
          }, 50);
        }).catch(err => console.warn('[App] StatusBar toggle failed:', err));
      }).catch(err => console.warn('[App] StatusBar import failed:', err));
    }
  }, [isIOS, justSignedIn, clearJustSignedIn]);

  return (
    <BrowserRouter>
      {/* Animated Splash Screen */}
      {showSplash && <SplashScreen onComplete={() => { sessionStorage.setItem('splashShown', '1'); setShowSplash(false); }} />}
      {/* Root Container: Full screen background (ignoring safe area) */}
      <div
        className="fixed inset-0 bg-bg-base text-slate-100 flex flex-col overflow-hidden"
      >
        {/* Safe Area Wrapper: Respected by content only */}
        <div
          data-safe-area-wrapper
          className="flex-1 flex flex-col w-full h-full relative safe-area-padding"
        >
          <AuthNavigator />
          {appConfig.features.payments && <PurchaseDrawer />}
          {appConfig.features.dailyRewards && <DailyRewardModal />}
          {appConfig.features.economy && <StreakInfoDrawer />}
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;
