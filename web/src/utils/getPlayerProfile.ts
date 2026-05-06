// Lazy load playroomkit to avoid initialization errors at module load time
let playroomkit: typeof import('playroomkit') | null = null;

const getPlayroomkit = async () => {
  if (!playroomkit) {
    playroomkit = await import('playroomkit');
  }
  return playroomkit;
};

import type { PlayerProfile } from '../types/playerProfile';

/**
 * Fetches player profile data from Playroomkit
 * @param playerId The ID of the player to get profile for
 * @returns Player profile or null if player not found
 */
export async function getPlayerProfile(playerId: string): Promise<PlayerProfile | null> {
  try {
    const pk = await getPlayroomkit();
    
    // Try to get player from participants
    const participants = pk.getParticipants ? pk.getParticipants() : {};
    const participant = (participants as Record<string, any>)[playerId];
    
    if (participant) {
      const profile = participant.getProfile();
      if (profile) {
        return profile as PlayerProfile;
      }
    }
    
    // Fallback: try to get from myPlayer if it's the local player
    const myPlayer = pk.myPlayer ? pk.myPlayer() : null;
    if (myPlayer && myPlayer.id === playerId) {
      const profile = myPlayer.getProfile();
      if (profile) {
        return profile as PlayerProfile;
      }
    }
    
    // Try getPlayer if available
    if (typeof pk.getPlayer === 'function') {
      const player = pk.getPlayer(playerId);
      if (player) {
        const profile = player.getProfile();
        if (profile) {
          return profile as PlayerProfile;
        }
      }
    }
    
    console.warn('[getPlayerProfile] Player not found:', playerId);
    return null;
  } catch (error) {
    console.error('[getPlayerProfile] Error fetching profile:', error);
    return null;
  }
}


