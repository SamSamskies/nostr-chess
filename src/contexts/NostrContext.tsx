'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { SimplePool } from 'nostr-tools';
import { isValidRelayUrl } from '@/lib/nostr';

function readStoredPubkey(): string | null {
    try {
        return localStorage.getItem('nostr_pubkey');
    } catch {
        return null;
    }
}

export const DEFAULT_RELAY = 'wss://relay.damus.io';

interface NostrContextType {
    pubkey: string | null;
    pool: SimplePool;
    relay: string;
    effectiveRelay: string;
    login: () => Promise<void>;
    logout: () => void;
    isLoading: boolean;
    error: string | null;
    setRelay: (url: string) => void;
}

const NostrContext = createContext<NostrContextType | undefined>(undefined);

/** Resolve default relay from `relay` query param synchronously (no useEffect ordering issues). */
function relayFromUrlParams(params: Pick<URLSearchParams, 'has' | 'get'>): string {
    if (!params.has('relay')) return DEFAULT_RELAY;
    const candidate = (params.get('relay') ?? '').trim();
    if (isValidRelayUrl(candidate)) return candidate;
    return DEFAULT_RELAY;
}

/**
 * Only mount via `next/dynamic` with `{ ssr: false }` so this never SSRs:
 * we read localStorage on first paint without hydration mismatch vs server HTML.
 */
export function NostrProvider({ children }: { children: ReactNode }) {
    const searchParams = useSearchParams();
    const [pubkey, setPubkey] = useState<string | null>(() => readStoredPubkey());
    const [pool] = useState(() => new SimplePool());
    /** Use Next searchParams only so SSR and first client render match (avoid hydration mismatch). */
    const [relay, setRelayState] = useState(() => relayFromUrlParams(searchParams));
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const setRelay = (url: string) => {
        setRelayState(url.trim());
    };

    const effectiveRelay = relay.trim() || DEFAULT_RELAY;

    useEffect(() => {
        if (!searchParams.has('relay')) {
            setRelayState(relayFromUrlParams(searchParams));
            return;
        }
        const candidate = (searchParams.get('relay') ?? '').trim();
        if (isValidRelayUrl(candidate)) {
            setRelayState(candidate);
        }
    }, [searchParams]);

    useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            if (e.key === 'nostr_pubkey') {
                setPubkey(e.newValue);
            }
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    const login = async () => {
        setIsLoading(true);
        setError(null);
        try {
            if (!window.nostr) {
                throw new Error('Nostr extension (NIP-07) not found. Please install an extension like Alby or Nos2x.');
            }
            const pk = await window.nostr.getPublicKey();
            localStorage.setItem('nostr_pubkey', pk);
            setPubkey(pk);
        } catch (err: any) {
            setError(err.message || 'Failed to login with Nostr');
            console.error('Nostr login error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const logout = () => {
        localStorage.removeItem('nostr_pubkey');
        setPubkey(null);
    };

    return (
        <NostrContext.Provider
            value={{
                pubkey,
                pool,
                relay,
                effectiveRelay,
                login,
                logout,
                isLoading,
                error,
                setRelay,
            }}
        >
            {children}
        </NostrContext.Provider>
    );
}

export function useNostr() {
    const context = useContext(NostrContext);
    if (context === undefined) {
        throw new Error('useNostr must be used within a NostrProvider');
    }
    return context;
}
