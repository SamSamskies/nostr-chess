export const INITIAL_ELO = 1200;
export const K_FACTOR = 32;

export function calculateExpectedScore(ratingA: number, ratingB: number): number {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export function calculateNewRating(currentRating: number, expectedScore: number, actualScore: number): number {
    return Math.round(currentRating + K_FACTOR * (actualScore - expectedScore));
}

export function processGameResult(
    whiteRating: number,
    blackRating: number,
    result: 'white' | 'black' | 'draw'
): { whiteNew: number; blackNew: number } {
    const expectedWhite = calculateExpectedScore(whiteRating, blackRating);
    const expectedBlack = calculateExpectedScore(blackRating, whiteRating);

    let scoreWhite = 0.5;
    let scoreBlack = 0.5;

    if (result === 'white') {
        scoreWhite = 1;
        scoreBlack = 0;
    } else if (result === 'black') {
        scoreWhite = 0;
        scoreBlack = 1;
    }

    return {
        whiteNew: calculateNewRating(whiteRating, expectedWhite, scoreWhite),
        blackNew: calculateNewRating(blackRating, expectedBlack, scoreBlack),
    };
}
