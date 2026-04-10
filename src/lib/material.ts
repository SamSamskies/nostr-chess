import type { Chess } from 'chess.js';

function pieceMaterialValue(type: string): number {
    switch (type) {
        case 'p':
            return 1;
        case 'n':
        case 'b':
            return 3;
        case 'r':
            return 5;
        case 'q':
            return 9;
        default:
            return 0;
    }
}

/** Sum of piece values on the board for each side (kings excluded). */
export function getMaterialByColor(chess: Chess): { white: number; black: number } {
    let white = 0;
    let black = 0;
    for (const row of chess.board()) {
        for (const cell of row) {
            if (!cell || cell.type === 'k') continue;
            const v = pieceMaterialValue(cell.type);
            if (cell.color === 'w') white += v;
            else black += v;
        }
    }
    return { white, black };
}
