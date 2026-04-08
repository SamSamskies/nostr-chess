import { Event, UnsignedEvent } from 'nostr-tools';
import { parse as parseTld } from 'tldts';

export interface NostrExtension {
    getPublicKey(): Promise<string>;
    signEvent(event: UnsignedEvent): Promise<Event>;
    getRelays(): Promise<Record<string, { read: boolean; write: boolean }>>;
}

declare global {
    interface Window {
        nostr?: NostrExtension;
    }
}

/** NIP-64: Chess (Portable Game Notation) */
export const CHESS_KIND = 64;

/**
 * WebSocket relay URL (Nostr relays use ws: or wss:). Empty is not valid — callers treat blank as default separately.
 * Host must be localhost, a literal IP, or a hostname under an ICANN public suffix (via Public Suffix List), so typos like
 * wss://relay.damus are rejected while wss://relay.damus.io is accepted.
 */
export function isValidRelayUrl(s: string): boolean {
    const t = s.trim();
    if (!t) return false;
    try {
        const u = new URL(t);
        if (u.protocol !== 'ws:' && u.protocol !== 'wss:') return false;
        if (u.username || u.password) return false;
        const host = u.hostname;
        if (!host) return false;
        const h = host.toLowerCase();
        if (h === 'localhost' || h.endsWith('.localhost')) return true;
        const p = parseTld(host);
        if (p.isIp) return true;
        return p.isIcann === true;
    } catch {
        return false;
    }
}
