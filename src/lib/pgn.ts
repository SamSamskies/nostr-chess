import { Chess } from 'chess.js';

/** PGN Seven Tag roster date: YYYY.MM.DD */
export function pgnDateTag(d = new Date()): string {
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Load a NIP-64 note body (import / lax). Returns null if invalid.
 */
export function loadPgnFromNip64(content: string): Chess | null {
    const trimmed = content.trim();
    if (!trimmed) return null;
    const c = new Chess();
    try {
        c.loadPgn(trimmed, { strict: false });
        return c;
    } catch {
        return null;
    }
}

/** Starting position as NIP-64 PGN while waiting for Black (player names = hex pubkeys). */
export function createOpenGamePgn(whitePubkey: string, site: string): string {
    const c = new Chess();
    c.setHeader('Event', 'Nostr Chess');
    c.setHeader('Site', site);
    c.setHeader('Date', pgnDateTag());
    c.setHeader('White', whitePubkey);
    c.setHeader('Black', '?');
    c.setHeader('Result', '*');
    return c.pgn({ maxWidth: 0 });
}

/** Sync [Result] with the current position (export / strict). */
export function setResultHeaderFromPosition(chess: Chess): void {
    if (chess.isCheckmate()) {
        chess.setHeader('Result', chess.turn() === 'w' ? '0-1' : '1-0');
    } else if (chess.isDraw()) {
        chess.setHeader('Result', '1/2-1/2');
    } else {
        chess.setHeader('Result', '*');
    }
}

/** Machine-oriented PGN export per NIP-64 guidance. */
export function exportNip64Pgn(chess: Chess): string {
    setResultHeaderFromPosition(chess);
    return chess.pgn({ maxWidth: 0 });
}
