export const MILESTONES: Record<number, number> = {
    3: 10,       // 3 day streak
    7: 25,       // One week
    14: 50,      // Two weeks
    30: 100,     // One month
    60: 200,     // Two months
    100: 500,    // 100 days
    365: 1000    // One year
};

export function calculateDailyReward(streakDays: number) {
    let baseDaily: number;

    if (streakDays <= 2) {
        baseDaily = 5;
    } else if (streakDays <= 4) {
        baseDaily = 8;
    } else if (streakDays <= 6) {
        baseDaily = 10;
    } else if (streakDays <= 30) {
        baseDaily = 15;
    } else if (streakDays <= 100) {
        baseDaily = 20;
    } else {
        baseDaily = 25;
    }

    const milestoneBonus = MILESTONES[streakDays] || 0;

    return {
        baseDaily,
        milestoneBonus,
        total: baseDaily + milestoneBonus,
        nextMilestone: getNextMilestone(streakDays)
    };
}

export function getNextMilestone(current: number) {
    const milestones = Object.keys(MILESTONES).map(Number).sort((a, b) => a - b);
    const next = milestones.find(m => m > current);
    return next ? {
        day: next,
        bonus: MILESTONES[next]
    } : null;
}
