import { Event, UnsignedEvent } from 'nostr-tools';

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
