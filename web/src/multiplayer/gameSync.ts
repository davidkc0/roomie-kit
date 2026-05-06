
import { supabase } from '../lib/supabase';

export type GameScore = {
  id?: number;
  user_id?: string;
  playerName: string;
  score: number;
  game: string;
  created_at?: string;
};

export type LeaderboardState = {
  scores: GameScore[];
  version: number;
};

const MAX_SCORES = 10;

// Fetch top scores from Supabase
async function fetchLeaderboard(): Promise<GameScore[]> {
  const { data, error } = await supabase
    .from('scores')
    .select('*')
    .order('score', { ascending: false })
    .limit(MAX_SCORES);

  if (error) {
    console.error('[gameSync] Error fetching leaderboard:', error);
    return [];
  }

  // Map to GameScore type
  return (data || []).map(row => ({
    id: row.id,
    user_id: row.user_id,
    playerName: row.username || 'Anonymous',
    score: row.score,
    game: row.game
  }));
}

// Subscribe to realtime updates
export function subscribeLeaderboard(
  callback: (state: LeaderboardState) => void
): () => void {
  let version = 0;

  // Initial fetch
  fetchLeaderboard().then(scores => {
    version++;
    callback({ scores, version });
  });

  // Realtime subscription
  const channel = supabase
    .channel('public:scores')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'scores' },
      async (payload) => {
        console.log('[gameSync] New score received:', payload);
        const scores = await fetchLeaderboard();
        version++;
        callback({ scores, version });
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// Submit score to Supabase (only updates if new high score - one entry per user per game)
export async function submitScore(
  score: number,
  playerName: string,
  userId?: string,
  game: string = 'snake' // Default to snake for backwards compatibility
): Promise<void> {
  if (!userId) {
    console.warn('[gameSync] Cannot submit score without userId');
    return;
  }

  const { data, error } = await supabase.rpc('submit_high_score', {
    p_user_id: userId,
    p_game: game,
    p_score: score,
    p_username: playerName
  });

  if (error) {
    console.error('[gameSync] Failed to submit score:', error);
  } else {
    console.log('[gameSync] Score result:', data);
  }
}

export async function getLeaderboard(): Promise<LeaderboardState> {
  const scores = await fetchLeaderboard();
  return { scores, version: Date.now() };
}

// ==========================================
// Chess ELO Rating System
// ==========================================

import { calculateEloChange, DEFAULT_RATING } from '../lib/elo';

export type ChessRankEntry = {
  rank: number;
  userId: string;
  username: string;
  profilePic: string | null;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
};

/**
 * Get a user's current chess rating (or default if not found)
 */
export async function getChessRating(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('chess_ratings')
    .select('rating')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return DEFAULT_RATING;
  }
  return data.rating;
}

/**
 * Update chess ratings after a game
 * @param winnerId - User ID of the winner
 * @param loserId - User ID of the loser
 * @param isDraw - Whether the game was a draw
 */
export async function updateChessRatings(
  winnerId: string,
  loserId: string,
  isDraw: boolean = false
): Promise<{ winnerNewRating: number; loserNewRating: number }> {
  // Get current ratings
  const [winnerRating, loserRating] = await Promise.all([
    getChessRating(winnerId),
    getChessRating(loserId)
  ]);

  // Calculate deltas
  const { winnerDelta, loserDelta } = calculateEloChange(winnerRating, loserRating, isDraw);

  console.log(`[gameSync] ELO update: Winner ${winnerId} (${winnerRating} + ${winnerDelta}), Loser ${loserId} (${loserRating} + ${loserDelta})`);

  // Update both ratings using the upsert function
  const [winnerResult, loserResult] = await Promise.all([
    supabase.rpc('upsert_chess_rating', {
      p_user_id: winnerId,
      p_rating_delta: winnerDelta,
      p_is_win: !isDraw,
      p_is_draw: isDraw
    }),
    supabase.rpc('upsert_chess_rating', {
      p_user_id: loserId,
      p_rating_delta: loserDelta,
      p_is_win: false,
      p_is_draw: isDraw
    })
  ]);

  if (winnerResult.error) {
    console.error('[gameSync] Failed to update winner rating:', winnerResult.error);
  }
  if (loserResult.error) {
    console.error('[gameSync] Failed to update loser rating:', loserResult.error);
  }

  return {
    winnerNewRating: winnerRating + winnerDelta,
    loserNewRating: loserRating + loserDelta
  };
}

/**
 * Get chess leaderboard with profile info
 * @param limit - Maximum number of entries (default 50)
 */
export async function getChessLeaderboard(limit: number = 50): Promise<ChessRankEntry[]> {
  console.log('[gameSync] Fetching chess leaderboard...');

  // First, get chess ratings
  const { data: ratingsData, error: ratingsError } = await supabase
    .from('chess_ratings')
    .select('user_id, rating, wins, losses, draws')
    .order('rating', { ascending: false })
    .limit(limit);

  if (ratingsError) {
    console.error('[gameSync] Error fetching chess ratings:', ratingsError);
    return [];
  }

  if (!ratingsData || ratingsData.length === 0) {
    console.log('[gameSync] No chess ratings found');
    return [];
  }

  // Get user IDs to fetch profiles
  const userIds = ratingsData.map(r => r.user_id);

  // Fetch profiles for these users
  const { data: profilesData, error: profilesError } = await supabase
    .from('profiles')
    .select('id, username, profile_image_url, avatar_headshot_url')
    .in('id', userIds);

  if (profilesError) {
    console.warn('[gameSync] Could not fetch profiles:', profilesError);
  }

  // Create a lookup map for profiles
  const profilesMap = new Map((profilesData || []).map(p => [p.id, p]));

  // Merge the data
  const entries = ratingsData.map((row, index) => {
    const profile = profilesMap.get(row.user_id);
    return {
      rank: index + 1,
      userId: row.user_id,
      username: profile?.username || 'Player',
      profilePic: profile?.profile_image_url || profile?.avatar_headshot_url || null,
      rating: row.rating,
      wins: row.wins,
      losses: row.losses,
      draws: row.draws
    };
  });

  console.log('[gameSync] Mapped leaderboard entries:', entries);
  return entries;
}
