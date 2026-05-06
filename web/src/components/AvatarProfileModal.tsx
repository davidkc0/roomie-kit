
import { useEffect, useState } from 'react';
import type { PlayerProfile } from '../types/playerProfile';
import { useAuthStore } from '../state/authStore';
import { supabase } from '../lib/supabase';
import { Loader2, UserPlus, Check, Video, Home, VolumeX, Volume2, Ban } from 'lucide-react';
import { useMutedPlayersStore } from '../state/mutedPlayersStore';
import { useVideoCallStore } from '../state/videoCallStore';
import { sendSignal } from '../lib/signaling';
import { ReportModal } from './ReportModal';
import { useBlockedUsers } from '../hooks/useBlockedUsers';

type AvatarProfileModalProps = {
  playerId: string | null;
  onClose: () => void;
  profile: PlayerProfile | null;
};

export function AvatarProfileModal({
  playerId,
  onClose,
  profile,
}: AvatarProfileModalProps) {
  const { user } = useAuthStore();
  const [closing, setClosing] = useState(false);
  const [friendStatus, setFriendStatus] = useState<'none' | 'pending' | 'accepted' | 'loading'>('loading');
  const [liveProfile, setLiveProfile] = useState<PlayerProfile | null>(profile);
  const [showReportModal, setShowReportModal] = useState(false);
  const { blockUser, isBlocked } = useBlockedUsers();
  const { startCall } = useVideoCallStore();
  const { isPlayerMuted, toggleMute } = useMutedPlayersStore();

  // Sync initial profile - but keep last known data if player leaves
  useEffect(() => {
    if (profile) {
      setLiveProfile(profile);
    }
    // When profile becomes null (player left), keep showing last known data
  }, [profile]);

  // Check friendship status on mount/change
  useEffect(() => {
    if (!user || !profile?.id || user.id === profile.id) {
      setFriendStatus('none');
      return;
    }

    const checkStatus = async () => {
      setFriendStatus('loading');

      // 1. Check Friendship Status
      // We need to find a row where EITHER:
      // (user_id_1 = me AND user_id_2 = them) OR (user_id_1 = them AND user_id_2 = me)
      const { data } = await supabase
        .from('friendships')
        .select('status')
        .or(`and(user_id_1.eq.${user.id},user_id_2.eq.${profile.id}),and(user_id_1.eq.${profile.id},user_id_2.eq.${user.id})`)
        .maybeSingle();

      console.log('[AvatarProfileModal] Friendship check result:', data);

      if (data) {
        setFriendStatus(data.status as 'pending' | 'accepted');
      } else {
        setFriendStatus('none');
      }

      // 2. Fetch fresh profile data (friend count etc)
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', profile.id)
        .single();

      if (profileData) {
        setLiveProfile(prev => ({ ...prev, ...profileData, name: profileData.username, photo: profileData.profile_image_url || prev?.photo || '' }));
      }
    };

    checkStatus();
  }, [user, profile?.id]);

  const handleFriendAction = async () => {
    if (!user || !profile?.id) return;

    if (friendStatus === 'pending') {
      // Cancel request
      try {
        setFriendStatus('loading');

        // DELETE friendship if we are user_id_1 (requester)
        // However, to be safe, we match based on both IDs
        const { error } = await supabase
          .from('friendships')
          .delete()
          .match({ user_id_1: user.id, user_id_2: profile.id });

        // Also try to delete notification
        await supabase.from('notifications').delete().match({
          user_id: profile.id,
          sender_id: user.id,
          type: 'friend_request'
        });

        if (error) throw error;
        setFriendStatus('none');
      } catch (e) {
        console.error('Error cancelling request', e);
        setFriendStatus('pending'); // Revert
      }
      return;
    }

    // Add Friend Logic
    try {
      setFriendStatus('loading');

      // 1. Create Friendship (Pending)
      const { error: fError } = await supabase.from('friendships').insert({
        user_id_1: user.id,
        user_id_2: profile.id,
        status: 'pending'
      });

      if (fError) throw fError;

      // 2. Create Notification
      const { error: nError } = await supabase.from('notifications').insert({
        user_id: profile.id,
        type: 'friend_request',
        sender_id: user.id
      });

      if (nError) console.error('Failed to send notification', nError);

      setFriendStatus('pending');

    } catch (error) {
      console.error('Error adding friend:', error);
      setFriendStatus('none');
      alert('Failed to send friend request');
    }
  };

  // Handle ESC key to close modal
  useEffect(() => {
    if (!playerId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [playerId]);

  const handleClose = () => {
    setClosing(true);
    setTimeout(onClose, 200); // Wait for animation
  };


  if (!playerId) {
    return null;
  }

  const playerName = liveProfile?.name || 'Player';
  const playerPhoto = liveProfile?.photo || '';
  const hasPhoto = playerPhoto && playerPhoto !== 'false';
  const playerBio = liveProfile?.bio || 'No bio available';

  // Calculate initials color
  const getInitialsColor = (name: string) => {
    const colors = [
      'from-brand-accent to-brand-peach',
      'from-blue-500 to-teal-400',
      'from-purple-600 to-pink-500',
      'from-green-400 to-emerald-600'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const isMe = user?.id === profile?.id;
  // IMPORTANT: Use playerId (Playroom/Agora ID) for mute, NOT profile.id (Supabase UUID)
  // VoiceChat checks mute using Agora UID which matches the Playroom player ID
  const isMuted = playerId ? isPlayerMuted(playerId) : false;

  const handleStartCall = async () => {
    console.log('[AvatarProfileModal] handleStartCall clicked. User:', user?.id, 'Profile:', profile?.id);
    if (profile?.id && user?.id) {
      // Create a shorter roomId - Agora limits channel names to 64 chars
      // Use first 8 chars of each sorted UUID (total: 17 chars with underscore)
      const sortedIds = [user.id, profile.id].sort();
      const roomId = `${sortedIds[0].slice(0, 8)}_${sortedIds[1].slice(0, 8)}`;
      console.log('[AvatarProfileModal] Generated roomId:', roomId);

      // 1. Start local call state
      startCall(roomId, {
        id: profile.id,
        username: playerName,
        avatarUrl: playerPhoto
      });

      // 2. Send signal to remote user
      try {
        console.log('[AvatarProfileModal] Sending signal request to:', profile.id);
        await sendSignal({
          type: 'request',
          roomId,
          toId: profile.id,
          fromId: user.id,
          fromName: user.user_metadata?.username || 'Unknown',
          fromAvatar: user.user_metadata?.avatar_url || ''
        });
        console.log('[AvatarProfileModal] Signal sent successfully.');
      } catch (err) {
        console.error('[AvatarProfileModal] Failed to send signal:', err);
      }

      handleClose();
    }
  };

  return (
    <div className={`fixed inset-0 z-[9998] flex items-center justify-center p-4 transition-opacity duration-200 ${closing ? 'opacity-0' : 'opacity-100'}`}>
      {/* Backdrop overlay with blur */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal card */}
      <div
        className={`relative w-full max-w-md bg-bg-surface backdrop-blur-xl border border-border rounded-3xl shadow-2xl overflow-hidden transform transition-all duration-300 ${closing ? 'scale-95 translate-y-4' : 'scale-100 translate-y-0'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Background gradient splash - relative layout to push content down */}
        <div className="h-32 bg-[linear-gradient(135deg,#7C3AED_0%,#D946EF_50%,#FDBA74_100%)] opacity-30" />

        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors z-10 p-2 active:scale-90"
          aria-label="Close"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex flex-col items-center pb-8 px-6 relative z-0">
          {/* Profile picture - pushed up with negative margin */}
          <div className="relative -mt-16 mb-4 group">
            <div className="w-32 h-32 rounded-full p-[3px] bg-[linear-gradient(135deg,#7C3AED_0%,#D946EF_50%,#FDBA74_100%)] shadow-xl shadow-purple-500/20">
              <div className="w-full h-full rounded-full overflow-hidden bg-zinc-900 border-4 border-black relative">
                {hasPhoto ? (
                  <img
                    src={playerPhoto}
                    alt={playerName}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${getInitialsColor(playerName)} text-white text-3xl font-bold`}>
                    {playerName.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons Row (Add Friend + Video Call) positioned absolutely next to avatar? 
                Or just below? User wanted "video chat button". 
                Let's put the button row below the name/stats for clarity, OR floating next to avatar if space permits.
                Given "top content cut off", safely putting it below or inline is better.
            */}
          </div>

          <div className="w-full flex justify-center gap-4 mb-4">
            {!isMe && (
              <>
                {friendStatus !== 'accepted' ? (
                  <button
                    onClick={handleFriendAction}
                    disabled={friendStatus === 'loading'}
                    className={`p-3 rounded-full border border-border text-white transition-colors flex items-center gap-2 ${friendStatus === 'pending' ? 'bg-bg-elevated' : 'bg-bg-surface hover:bg-bg-elevated'
                      } ${friendStatus === 'loading' ? 'opacity-50 cursor-wait' : ''}`}
                    title={friendStatus === 'pending' ? 'Request Sent' : 'Add Friend'}
                  >
                    {friendStatus === 'loading' ? (
                      <Loader2 size={20} className="animate-spin" />
                    ) : friendStatus === 'pending' ? (
                      <Check size={20} />
                    ) : (
                      <UserPlus size={20} />
                    )}
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      const roomSlug = playerName.toLowerCase().replace(/[^a-z0-9]/g, '');
                      // CRITICAL: PlayroomKit requires a full page reload to switch rooms cleanly
                      // navigate() causes sticky loading state because insertCoin cannot be called twice
                      window.location.href = `/rooms/${roomSlug}`;
                      onClose();
                    }}
                    className="p-3 bg-emerald-600 hover:bg-emerald-500 rounded-full text-white shadow-lg shadow-emerald-500/30 transition-all hover:scale-105 flex items-center gap-2"
                    title="Visit Room"
                  >
                    <Home size={20} />
                  </button>
                )}
                <button
                  onClick={handleStartCall}
                  className="p-3 bg-indigo-600 hover:bg-indigo-500 rounded-full text-white shadow-lg shadow-indigo-500/30 transition-all hover:scale-105"
                  title="Video Call"
                >
                  <Video size={20} />
                </button>
                <button
                  onClick={() => playerId && toggleMute(playerId)}
                  className={`p-3 rounded-full border transition-all hover:scale-105 ${isMuted
                    ? 'bg-red-500/20 border-red-500/40 text-red-400 shadow-lg shadow-red-500/20'
                    : 'bg-bg-surface border-border text-text-secondary hover:bg-bg-elevated hover:text-white'
                    }`}
                  title={isMuted ? 'Unmute Player' : 'Mute Player'}
                >
                  {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                </button>
              </>
            )}
          </div>

          {/* Username */}
          <h2 className="text-2xl font-bold text-white mb-1 drop-shadow-md text-center">{playerName}</h2>

          {/* Handle/Stats */}
          <div className="flex items-center gap-3 text-white/40 text-sm font-medium mb-6">
            <span>@{playerName.toLowerCase().replace(/\s+/g, '')}</span>
            <span className="w-1 h-1 rounded-full bg-white/30"></span>
            <span>{liveProfile?.friends_count || 0} Friends</span>
          </div>

          {/* Bio section */}
          <div className="w-full bg-white/5 rounded-2xl p-4 mb-6 text-center">
            <p className="text-white/70 text-sm leading-relaxed">
              {playerBio}
            </p>
          </div>



          <div className="flex items-center gap-3 mt-4">
            <button
              className="text-xs font-medium text-red-400 hover:text-red-300 transition-colors py-2 px-4 rounded-lg hover:bg-red-500/10"
              onClick={() => setShowReportModal(true)}
            >
              Report User
            </button>
            {!isBlocked(playerId!) && (
              <button
                className="flex items-center gap-1 text-xs font-medium text-red-400 hover:text-red-300 transition-colors py-2 px-4 rounded-lg hover:bg-red-500/10"
                onClick={() => {
                  if (playerId && liveProfile?.id) {
                    blockUser(liveProfile.id);
                    handleClose();
                  }
                }}
              >
                <Ban className="w-3 h-3" />
                Block User
              </button>
            )}
          </div>

          <ReportModal
            isOpen={showReportModal}
            onClose={() => setShowReportModal(false)}
            reportedUserId={liveProfile?.id || playerId || ''}
            reportedUserName={playerName}
            contextType="profile"
            onBlock={() => {
              if (liveProfile?.id) {
                blockUser(liveProfile.id);
              }
              handleClose();
            }}
          />
        </div>
      </div>
    </div>
  );
}
