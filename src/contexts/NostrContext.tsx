'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { SimplePool, Event } from 'nostr-tools';
import { DEFAULT_RELAYS, NostrExtension } from '@/lib/nostr';

interface NostrContextType {
    pubkey: string | null;
    pool: SimplePool;
    relays: string[];
    login: () => Promise<void>;
    logout: () => void;
    isLoading: boolean;
    error: string | null;
}

const NostrContext = createContext<NostrContextType | undefined>(undefined);

export function NostrProvider({ children }: { children: ReactNode }) {
    const [pubkey, setPubkey] = useState<string | null>(null);
    const [pool] = useState(() => new SimplePool());
    const [relays] = useState(DEFAULT_RELAYS);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Check if previously logged in (optional, but good for UX)
        const savedPubkey = localStorage.getItem('nostr_pubkey');
        if (savedPubkey) {
            setPubkey(savedPubkey);
        }
        setIsLoading(false);
    }, []);

    const login = async () => {
        setIsLoading(true);
        setError(null);
        try {
            if (!window.nostr) {
                throw new Error('Nostr extension (NIP-07) not found. Please install an extension like Alby or Nos2x.');
            }
            const pk = await window.nostr.getPublicKey();
            setPubkey(pk);
            localStorage.setItem('nostr_pubkey', pk);
        } catch (err: any) {
            setError(err.message || 'Failed to login with Nostr');
            console.error('Nostr login error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const logout = () => {
        setPubkey(null);
        localStorage.removeItem('nostr_pubkey');
    };

    return (
        <NostrContext.Provider
            value={{
                pubkey,
                pool,
                relays,
                login,
                logout,
                isLoading,
                error,
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
