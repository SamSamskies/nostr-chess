'use client';

import { useState, useEffect, useCallback } from 'react';
import { Chess, Move } from 'chess.js';
import { useNostr } from '@/contexts/NostrContext';
import { CHESS_KIND } from '@/lib/nostr';
import { Event, UnsignedEvent, getEventHash } from 'nostr-tools';

export interface GameState {
    id: string;
    fen: string;
    white: string; // pubkey
    black?: string; // pubkey
    status: 'awaiting-player' | 'in-progress' | 'checkmate' | 'draw' | 'resigned';
    lastMove?: string;
    turn: 'w' | 'b';
    relay?: string;
}

export function useChessGame(gameId?: string, initialRelay?: string) {
    const { pubkey, pool, relays } = useNostr();
    const [game, setGame] = useState(new Chess());
    const [gameState, setGameState] = useState<GameState | null>(null);

    // Subscribe to game updates
    useEffect(() => {
        if (!gameId) return;

        const subscriptionRelays = initialRelay ? [...new Set([initialRelay, ...relays])] : relays;
        console.log(`[ChessGame] Subscribing to game ${gameId} on relays:`, subscriptionRelays);

        const handleEvent = (event: Event) => {
            const d = event.tags.find(t => t[0] === 'd')?.[1];
            const p = event.tags.filter(t => t[0] === 'p').map(t => t[1]);
            const fen = event.tags.find(t => t[0] === 'fen')?.[1];
            const status = event.tags.find(t => t[0] === 'status')?.[1] as GameState['status'];
            const lastMove = event.tags.find(t => t[0] === 'move')?.[1];
            const relay = event.tags.find(t => t[0] === 'relay')?.[1];

            if (d === gameId && fen) {
                setGameState(prev => {
                    // Only update if the event is newer
                    if (prev && (event.created_at <= (prev as any).created_at)) return prev;

                    return {
                        id: d,
                        fen,
                        white: p[0],
                        black: p[1],
                        status: status || 'in-progress',
                        lastMove,
                        turn: new Chess(fen).turn(),
                        relay,
                        created_at: event.created_at, // store for comparison
                    } as any;
                });
                setGame(new Chess(fen));
            }
        };

        // Fetch initial state first
        const fetchInitial = async () => {
            try {
                const events = await (pool as any).querySync(subscriptionRelays, {
                    kinds: [CHESS_KIND],
                    '#d': [gameId],
                    limit: 10,
                });
                if (events && events.length > 0) {
                    // Sort by newest first
                    events.sort((a: any, b: any) => b.created_at - a.created_at);
                    handleEvent(events[0]);
                } else {
                    console.log(`[ChessGame] No initial state found for ${gameId}`);
                }
            } catch (e) {
                console.error('[ChessGame] Failed to fetch initial state:', e);
            }
        };

        fetchInitial();

        // Then subscribe for updates
        const sub = (pool as any).subscribeMany(subscriptionRelays, [
            {
                kinds: [CHESS_KIND],
                '#d': [gameId],
            },
        ], {
            onevent: handleEvent,
            onclose: (reasons: any) => console.log('[ChessGame] Subscription closed:', reasons)
        });

        return () => sub.close();
    }, [gameId, pool, relays, initialRelay]);

    const makeMove = async (move: string | { from: string; to: string; promotion?: string }) => {
        if (!gameState || !pubkey || !window.nostr) return false;

        // Check if it's the player's turn
        const isWhite = pubkey === gameState.white;
        const isBlack = pubkey === gameState.black;
        if ((game.turn() === 'w' && !isWhite) || (game.turn() === 'b' && !isBlack)) {
            return false;
        }

        try {
            const result = game.move(move);
            if (result) {
                const nextFen = game.fen();
                const nextStatus = game.isCheckmate()
                    ? 'checkmate'
                    : game.isDraw()
                        ? 'draw'
                        : 'in-progress';

                const event: UnsignedEvent = {
                    kind: CHESS_KIND,
                    pubkey: pubkey,
                    created_at: Math.floor(Date.now() / 1000),
                    tags: [
                        ['d', gameState.id],
                        ['p', gameState.white],
                        ['p', gameState.black || ''],
                        ['fen', nextFen],
                        ['status', nextStatus],
                        ['move', typeof move === 'string' ? move : `${move.from}${move.to}`],
                        ...(gameState.relay ? [['relay', gameState.relay]] : []),
                    ],
                    content: `Move: ${result.san}`,
                };

                const signedEvent = await window.nostr.signEvent(event);
                // Strictly use the game's designated relay for consistency as requested
                const publishRelays = gameState.relay ? [gameState.relay] : relays;

                try {
                    await Promise.any(pool.publish(publishRelays, signedEvent));
                } catch (e) {
                    console.error('Failed to publish move to relay:', e);
                    return false;
                }
                return true;
            }
        } catch (e) {
            console.error('Invalid move:', e);
        }
        return false;
    };

    const createGame = async (targetRelay?: string) => {
        if (!pubkey || !window.nostr) return null;

        const id = crypto.randomUUID();
        const initialFen = new Chess().fen();

        const selectedRelay = targetRelay || 'wss://relay.damus.io';
        const event: UnsignedEvent = {
            kind: CHESS_KIND,
            pubkey: pubkey,
            created_at: Math.floor(Date.now() / 1000),
            tags: [
                ['d', id],
                ['p', pubkey],
                ['fen', initialFen],
                ['status', 'awaiting-player'],
                ['relay', selectedRelay],
            ],
            content: 'New Chess Game',
        };

        try {
            const signedEvent = await window.nostr.signEvent(event);
            await Promise.any(pool.publish([selectedRelay], signedEvent));
            return { id, relay: selectedRelay };
        } catch (e) {
            console.error('Failed to create game:', e);
            return null;
        }
    };

    const joinGame = async (gameId: string, opponentPubkey: string, preferredRelay?: string) => {
        if (!pubkey || !window.nostr) return false;

        const initialFen = new Chess().fen();
        const event: UnsignedEvent = {
            kind: CHESS_KIND,
            pubkey: pubkey,
            created_at: Math.floor(Date.now() / 1000),
            tags: [
                ['d', gameId],
                ['p', opponentPubkey],
                ['p', pubkey],
                ['fen', initialFen],
                ['status', 'in-progress'],
                ['relay', preferredRelay || relays[0]],
            ],
            content: 'Joined Chess Game',
        };

        try {
            const signedEvent = await window.nostr.signEvent(event);
            const targetRelay = preferredRelay || relays[0];
            await Promise.any(pool.publish([targetRelay], signedEvent));
            return true;
        } catch (e) {
            console.error('Failed to join game:', e);
            return false;
        }
    };

    return {
        game,
        gameState,
        makeMove,
        createGame,
        joinGame,
    };
}
