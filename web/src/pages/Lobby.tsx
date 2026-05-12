import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import hexArenaCardBg from '../assets/hex_arena_card.jpg';
import { useRoomStore } from '../state/roomStore';
import { useAuthStore } from '../state/authStore';
import { Bell } from 'lucide-react';
import { supabase } from '../lib/supabase';
import loungeCardBg from '../assets/lounge_card.png';
import theaterCardBg from '../assets/theater_card.png';
import { useRoomPresence } from '../hooks/useRoomPresence';
import { PersonalRoomCard } from '../components/PersonalRoomCard';
import { useOrientationLock } from '../hooks/useOrientationLock';
import { appConfig } from '../config/app';
import { DEFAULT_PROFILE_IMAGE_URL, resolveAssetUrl } from '../config/r2';

console.log('[Lobby.tsx] Module loaded');

export default function Lobby() {
  const navigate = useNavigate();
  const { rooms, loading, error, fetchRooms, createRoom } = useRoomStore();
  const { user, profile } = useAuthStore();

  // Lock to portrait in Lobby
  useOrientationLock(true);

  // Live user counts for global rooms
  const loungeCount = useRoomPresence('lounge');
  const theaterCount = useRoomPresence('theater');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomSlug, setNewRoomSlug] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const profileImageUrl = resolveAssetUrl(
    profile?.avatar_headshot_url || profile?.profile_image_url || DEFAULT_PROFILE_IMAGE_URL
  );

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  // Fetch unread notifications count
  useEffect(() => {
    if (!user) return;

    const fetchUnread = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('read', false);

      setUnreadCount(count || 0);
    };

    fetchUnread();

    // Realtime subscription for notifications
    const channel = supabase
      .channel('public:notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, (_payload) => {
        setUnreadCount(prev => prev + 1);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const handleRoomClick = (slug: string) => {
    // Navigate directly to the room using the stored avatar from Auth/Profile
    navigate(`/rooms/${slug}`);
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName || !newRoomSlug) return;

    // Simple slugify
    const cleanSlug = newRoomSlug.toLowerCase().replace(/[^a-z0-9-]/g, '-');

    const success = await createRoom(newRoomName, cleanSlug);
    if (success) {
      setShowCreateModal(false);
      setNewRoomName('');
      setNewRoomSlug('');
    }
  };

  return (
    <div
      className="flex flex-col items-center bg-bg-base text-white h-screen overflow-y-auto ios-scroll hide-scrollbar p-4"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 120px)' }}
    >

      <div className="w-full max-w-4xl flex justify-between items-center pt-2 pb-4">
        <button onClick={() => navigate('/profile')} className="flex items-center gap-3 active:opacity-70 transition-opacity">
          <img
            src={profileImageUrl}
            alt="Profile"
            className="h-10 w-10 rounded-full object-cover border border-white/20"
            onError={(event) => {
              event.currentTarget.src = DEFAULT_PROFILE_IMAGE_URL;
            }}
          />
          <span className="text-lg font-semibold text-white">
            {profile?.username || 'Guest'}
          </span>
        </button>

        <button
          onClick={() => navigate('/notifications')}
          className="relative p-2 text-white hover:bg-white/10 rounded-full transition-colors"
        >
          <Bell className="w-6 h-6" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </div>

      <div className="w-full max-w-4xl space-y-6">
        {/* Waitlist Banner */}
        {appConfig.features.waitlist && profile?.account_status && profile.account_status !== 'active' && (
          <button
            onClick={() => navigate('/waitlist')}
            className="w-full bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/30 rounded-xl p-4 text-center transition hover:from-yellow-500/30 hover:to-orange-500/30 active:scale-[0.99]"
          >
            <p className="text-yellow-400 font-bold text-sm">⏳ You're on the waitlist</p>
            <p className="text-slate-300 text-xs mt-0.5">Enter an invite code to unlock full access →</p>
          </button>
        )}
        {/* Actions - Create Room button hidden for now
        <div className="flex justify-end">
          <PrimaryButton
            onClick={() => setShowCreateModal(true)}
            className=""
          >
            + Create Room
          </PrimaryButton>
        </div>
        */}



        {/* Room List */}
        <h2 className="text-2xl font-bold text-white mb-4">Rooms</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Featured Global Room: Lounge */}
          <button
            onClick={() => handleRoomClick('lounge')}
            className="group relative flex h-40 flex-col items-center justify-center rounded-xl overflow-hidden border border-white/10 transition-all col-span-full sm:col-span-1 active:scale-[0.98]"
          >
            {/* Background Image */}
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${loungeCardBg})` }}
            />

            {/* Dark Overlay with Blur */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />

            {/* Badges Container - Top Row */}
            <div className="absolute top-3 left-3 right-3 flex justify-between items-start z-10">
              {/* Global Badge (Left) */}
              <span className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-[10px] font-bold uppercase tracking-wider text-white shadow-lg">
                Global
              </span>

              {/* User Count Badge (Right) */}
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-xs font-medium text-white shadow-lg">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-slate-300">
                  <path d="M10 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.465 14.493a1.23 1.23 0 0 0 .41 1.412A9.957 9.957 0 0 0 10 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 0 0-13.074.003Z" />
                </svg>
                <span>{loungeCount}</span>
              </div>
            </div>

            {/* Content (Centered) */}
            <div className="relative z-10 flex flex-col items-center text-center">
              <h2 className="text-2xl font-bold text-white tracking-wide drop-shadow-lg">
                Lounge
              </h2>
              <span className="mt-1 text-xs text-slate-200 font-medium drop-shadow-md opacity-80 group-hover:opacity-100 transition-opacity">
                Hang out with everyone and play games
              </span>
            </div>
          </button>

          {/* Featured Global Room: Theater */}
          <button
            onClick={() => handleRoomClick('theater')}
            className="group relative flex h-40 flex-col items-center justify-center rounded-xl overflow-hidden border border-white/10 transition-all col-span-full sm:col-span-1 active:scale-[0.98]"
          >
            {/* Background Image */}
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${theaterCardBg})` }}
            />

            {/* Dark Overlay with Blur */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />

            {/* Badges Container */}
            <div className="absolute top-3 left-3 right-3 flex justify-between items-start z-10">
              {/* Global Badge */}
              <span className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-[10px] font-bold uppercase tracking-wider text-white shadow-lg">
                Global
              </span>

              {/* User Count Badge */}
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-xs font-medium text-white shadow-lg">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-slate-300">
                  <path d="M10 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.465 14.493a1.23 1.23 0 0 0 .41 1.412A9.957 9.957 0 0 0 10 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 0 0-13.074.003Z" />
                </svg>
                <span>{theaterCount}</span>
              </div>
            </div>

            {/* Content (Centered) */}
            <div className="relative z-10 flex flex-col items-center text-center">
              <h2 className="text-2xl font-bold text-white tracking-wide drop-shadow-lg">
                Theater
              </h2>
              <span className="mt-1 text-xs text-slate-200 font-medium drop-shadow-md opacity-80 group-hover:opacity-100 transition-opacity">
                Watch content together
              </span>
            </div>
          </button>

          {/* Featured Game Room: Hex Arena */}
          <HexArenaCard onClick={() => handleRoomClick('hex')} />

          {loading && rooms.length === 0 ? (
            <div className="col-span-full text-center text-slate-500 py-10">Loading rooms...</div>
          ) : rooms.length === 0 ? (
            <div className="col-span-full text-center text-slate-500 py-10">
              No rooms found. Create one to get started!
            </div>
          ) : (
            [...rooms]
              .sort((a, b) => {
                if (user?.id && a.owner_id === user.id) return -1;
                if (user?.id && b.owner_id === user.id) return 1;
                return 0;
              })
              .map((room) => (
                <PersonalRoomCard
                  key={room.id}
                  room={room}
                  isOwner={!!(user?.id && room.owner_id === user.id)}
                  onClick={() => handleRoomClick(room.slug)}
                />
              ))
          )}
        </div>
      </div>

      {/* Create Room Modal */}
      {
        showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-xl bg-bg-surface border border-border p-6 shadow-2xl">
              <h3 className="text-xl font-bold mb-4">Create New Room</h3>

              {error && (
                <div className="mb-4 p-3 rounded bg-red-900/50 border border-red-800 text-red-200 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleCreateRoom} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Room Name</label>
                  <input
                    type="text"
                    value={newRoomName}
                    onChange={e => setNewRoomName(e.target.value)}
                    placeholder="e.g. My Awesome Hangout"
                    className="w-full rounded bg-bg-elevated border-border px-3 py-2 text-white focus:border-purple-500 focus:outline-none transition"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Room ID (Slug)</label>
                  <input
                    type="text"
                    value={newRoomSlug}
                    onChange={e => setNewRoomSlug(e.target.value)}
                    placeholder="e.g. hangout-1"
                    className="w-full rounded bg-bg-elevated border-border px-3 py-2 text-white focus:border-purple-500 focus:outline-none transition font-mono text-sm"
                    required
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 rounded px-4 py-2 text-slate-400 hover:bg-bg-elevated transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 rounded bg-purple-600 px-4 py-2 font-semibold hover:bg-purple-500 transition disabled:opacity-50"
                  >
                    {loading ? 'Creating...' : 'Create Room'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )
      }
    </div >
  );
}

/**
 * Hex Arena lobby card with live player count via presence
 */
function HexArenaCard({ onClick }: { onClick: () => void }) {
  const userCount = useRoomPresence('hex');

  return (
    <button
      onClick={onClick}
      className="group relative flex h-40 flex-col items-center justify-center rounded-xl overflow-hidden border border-white/10 transition-all col-span-full sm:col-span-1 active:scale-[0.98]"
    >
      {/* Card Background Image */}
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${hexArenaCardBg})` }} />

      {/* Dark Overlay for text readability */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Badges Container */}
      <div className="absolute top-3 left-3 right-3 flex justify-between items-start z-10">
        {/* Game Badge */}
        <span className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-[10px] font-bold uppercase tracking-wider text-white shadow-lg">
          🎮 Game
        </span>

        {/* User Count Badge */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-xs font-medium text-white shadow-lg">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-slate-300">
            <path d="M10 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.465 14.493a1.23 1.23 0 0 0 .41 1.412A9.957 9.957 0 0 0 10 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 0 0-13.074.003Z" />
          </svg>
          <span>{userCount}</span>
        </div>
      </div>

      {/* Content (Centered) */}
      <div className="relative z-10 flex flex-col items-center text-center">
        <h2 className="text-2xl font-bold text-white tracking-wide drop-shadow-lg">
          Hex Arena
        </h2>
        <span className="mt-1 text-xs text-slate-200 font-medium drop-shadow-md opacity-80 group-hover:opacity-100 transition-opacity">
          Battle royale on disappearing platforms
        </span>
      </div>
    </button>
  );
}
