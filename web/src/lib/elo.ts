/**
 * ELO Rating Calculation
 * Standard ELO formula with K-factor of 32 (used in chess)
 */

const K_FACTOR = 32;
const DEFAULT_RATING = 1200;

/**
 * Calculate expected score based on ratings
 * @param myRating - Your current rating
 * @param opponentRating - Opponent's rating
 * @returns Expected score (0 to 1)
 */
function expectedScore(myRating: number, opponentRating: number): number {
    return 1 / (1 + Math.pow(10, (opponentRating - myRating) / 400));
}

/**
 * Calculate rating changes after a game
 * @param winnerRating - Winner's current rating
 * @param loserRating - Loser's current rating
 * @param isDraw - Whether the game was a draw
 * @returns Rating deltas for winner and loser
 */
export function calculateEloChange(
    winnerRating: number,
    loserRating: number,
    isDraw: boolean = false
): { winnerDelta: number; loserDelta: number } {
    const expectedWinner = expectedScore(winnerRating, loserRating);
    const expectedLoser = expectedScore(loserRating, winnerRating);

    if (isDraw) {
        // Draw: both get 0.5 actual score
        const winnerDelta = Math.round(K_FACTOR * (0.5 - expectedWinner));
        const loserDelta = Math.round(K_FACTOR * (0.5 - expectedLoser));
        return { winnerDelta, loserDelta };
    }

    // Win/Loss: winner gets 1, loser gets 0
    const winnerDelta = Math.round(K_FACTOR * (1 - expectedWinner));
    const loserDelta = Math.round(K_FACTOR * (0 - expectedLoser));

    return { winnerDelta, loserDelta };
}

/**
 * Get default rating for new players
 */
export function getDefaultRating(): number {
    return DEFAULT_RATING;
}

export { K_FACTOR, DEFAULT_RATING };
