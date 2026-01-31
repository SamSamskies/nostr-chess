'use client';

import { useState, useEffect } from 'react';
import { useNostr } from '@/contexts/NostrContext';
import { CHESS_KIND } from '@/lib/nostr';
import { INITIAL_ELO, processGameResult } from '@/lib/elo';

export interface Profile {
    pubkey: string;
    name?: string;
    picture?: string;
    elo: number;
    gamesPlayed: number;
    wins: number;
    losses: number;
    draws: number;
}

// Global cache to prevent re-fetching
const profileCache = new Map<string, Profile>();
const activeRequests = new Map<string, Promise<void>>();

export function useProfile(pubkey?: string | null) {
    const { pool, relays } = useNostr();
    const [profile, setProfile] = useState<Profile | null>(() =>
        (pubkey && profileCache.has(pubkey)) ? profileCache.get(pubkey)! : null
    );
    const [isLoading, setIsLoading] = useState(!profile && !!pubkey);

    useEffect(() => {
        if (!pubkey) {
            setProfile(null);
            setIsLoading(false);
            return;
        }

        // Check cache first
        if (profileCache.has(pubkey)) {
            setProfile(profileCache.get(pubkey)!);
            setIsLoading(false);
            return;
        }

        // Check if a request is already in progress
        if (activeRequests.has(pubkey)) {
            setIsLoading(true);
            activeRequests.get(pubkey)!.then(() => {
                if (profileCache.has(pubkey)) {
                    setProfile(profileCache.get(pubkey)!);
                }
            }).finally(() => setIsLoading(false));
            return;
        }

        setIsLoading(true);

        const fetchPromise = async () => {
            try {
                // Fetch metadata (Kind 0)
                const metadata = await pool.get(relays, {
                    kinds: [0],
                    authors: [pubkey],
                });

                let name = pubkey.slice(0, 8);
                let picture = undefined;

                if (metadata) {
                    try {
                        const content = JSON.parse(metadata.content);
                        name = content.name || content.display_name || name;
                        picture = content.picture;
                    } catch (e) {
                        console.error('Failed to parse metadata content', e);
                    }
                }

                // Fetch all completed games to calculate ELO
                const games = await pool.querySync(relays, {
                    kinds: [CHESS_KIND],
                    '#p': [pubkey],
                });

                // Sort by timestamp to process in order
                const sortedGames = games.sort((a, b) => a.created_at - b.created_at);

                // We use a simple map to track ELOs of all players we encounter to calculate correctly
                const elos: Record<string, number> = {};
                const getElo = (pk: string) => elos[pk] || INITIAL_ELO;

                let wins = 0;
                let losses = 0;
                let draws = 0;
                let gamesPlayed = 0;

                sortedGames.forEach(game => {
                    const status = game.tags.find(t => t[0] === 'status')?.[1];
                    const pTags = game.tags.filter(t => t[0] === 'p').map(t => t[1]);
                    const white = pTags[0];
                    const black = pTags[1];

                    if (!black || !status || status === 'in-progress' || status === 'awaiting-player') return;

                    gamesPlayed++;
                    const fen = game.tags.find(t => t[0] === 'fen')?.[1];
                    const turn = fen ? fen.split(' ')[1] : 'w';

                    let result: 'white' | 'black' | 'draw' = 'draw';
                    if (status === 'checkmate') {
                        result = turn === 'w' ? 'black' : 'white';
                    } else if (status === 'resigned') {
                        result = turn === 'w' ? 'black' : 'white';
                    }

                    if (result === 'draw') draws++;
                    else if ((result === 'white' && pubkey === white) || (result === 'black' && pubkey === black)) wins++;
                    else losses++;

                    const { whiteNew, blackNew } = processGameResult(getElo(white), getElo(black), result);
                    elos[white] = whiteNew;
                    elos[black] = blackNew;
                });

                const newProfile: Profile = {
                    pubkey,
                    name,
                    picture,
                    elo: getElo(pubkey),
                    gamesPlayed,
                    wins,
                    losses,
                    draws,
                };

                profileCache.set(pubkey, newProfile);
                setProfile(newProfile);

            } catch (e) {
                console.error('Failed to fetch profile', e);
            }
        };

        const request = fetchPromise();
        activeRequests.set(pubkey, request);

        request.finally(() => {
            activeRequests.delete(pubkey);
            setIsLoading(false);
        });

    }, [pubkey, pool, relays]); // Re-run if pubkey changes. Relays/pool usually stable.

    return { profile, isLoading };
}
