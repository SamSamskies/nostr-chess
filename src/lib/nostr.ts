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

export const DEFAULT_RELAYS = [
    'wss://relay.damus.io',
    'wss://relay.snort.social',
    'wss://nos.lol',
    'wss://relay.nostr.band',
];

export const CHESS_KIND = 3064;
