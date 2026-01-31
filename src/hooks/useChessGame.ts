'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { Chess } from 'chess.js';
import { useNostr } from '@/contexts/NostrContext';
import { CHESS_KIND } from '@/lib/nostr';
import { Event, UnsignedEvent } from 'nostr-tools';

export interface GameState {
    id: string;
    fen: string;
    white: string; // pubkey or name
    black?: string; // pubkey or name
    status: 'awaiting-player' | 'in-progress' | 'checkmate' | 'draw' | 'resigned';
    turn: 'w' | 'b';
    winner?: 'w' | 'b' | 'draw';
    relay?: string;
    created_at?: number;
}

export function useChessGame(gameId?: string, initialRelay?: string) {
    const { pubkey, pool, relays } = useNostr();
    const [fen, setFen] = useState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    const [remoteGameState, setRemoteGameState] = useState<Partial<GameState>>({});

    const game = useMemo(() => {
        try {
            return new Chess(fen);
        } catch (e) {
            console.error('[useChessGame] FEN error, falling back to start:', e);
            return new Chess();
        }
    }, [fen]);

    // Handle incoming Nostr events
    const handleEvent = useCallback((event: Event) => {
        const d = event.tags.find(t => t[0] === 'd')?.[1];
        if (d !== gameId) return;

        const p = event.tags.filter(t => t[0] === 'p').map(t => t[1]);
        const eventFen = event.tags.find(t => t[0] === 'fen')?.[1];
        const status = event.tags.find(t => t[0] === 'status')?.[1] as GameState['status'];
        const relay = event.tags.find(t => t[0] === 'relay')?.[1];

        if (eventFen) {
            setFen(prevFen => {
                // Only update if the event is newer
                const eventTime = event.created_at;
                const prevTime = remoteGameState.created_at || 0;

                if (eventTime < prevTime) return prevFen;
                if (eventTime === prevTime && eventFen === prevFen) return prevFen;

                return eventFen;
            });

            setRemoteGameState(prev => {
                if (event.created_at < (prev.created_at || 0)) return prev;
                return {
                    white: p[0],
                    black: p[1],
                    status: status || 'in-progress',
                    relay,
                    created_at: event.created_at
                };
            });
        }
    }, [gameId, remoteGameState.created_at]);

    // Subscribe to gameplay updates
    useEffect(() => {
        if (!gameId || !pool) return;

        const subscriptionRelays = initialRelay ? [...new Set([initialRelay, ...relays])] : relays;

        const fetchInitial = async () => {
            try {
                const events = await (pool as any).querySync(subscriptionRelays, {
                    kinds: [CHESS_KIND],
                    '#d': [gameId],
                    limit: 10,
                });

                if (events && events.length > 0) {
                    events.sort((a: any, b: any) => b.created_at - a.created_at);
                    handleEvent(events[0]);
                }
            } catch (e) {
                console.error('[useChessGame] Initial fetch failed:', e);
            }
        };

        fetchInitial();

        const sub = (pool as any).subscribeMany(subscriptionRelays, [
            {
                kinds: [CHESS_KIND],
                '#d': [gameId],
            },
        ], {
            onevent: handleEvent
        });

        return () => sub.close();
    }, [gameId, pool, relays, initialRelay, handleEvent]);

    const makeMove = useCallback(async (move: string | { from: string; to: string; promotion?: string }) => {
        try {
            const gameCopy = new Chess(game.fen());
            const result = gameCopy.move(move);

            if (result) {
                const nextFen = gameCopy.fen();
                // Optimistic update
                setFen(nextFen);

                // If multi-player, publish move
                if (pubkey && window.nostr && (remoteGameState.white || remoteGameState.black)) {
                    const nextStatus = gameCopy.isCheckmate() ? 'checkmate' : gameCopy.isDraw() ? 'draw' : 'in-progress';
                    const event: UnsignedEvent = {
                        kind: CHESS_KIND,
                        pubkey: pubkey,
                        created_at: Math.floor(Date.now() / 1000),
                        tags: [
                            ['d', gameId!],
                            ['p', remoteGameState.white || pubkey],
                            ['p', remoteGameState.black || (remoteGameState.white === pubkey ? '' : pubkey)],
                            ['fen', nextFen],
                            ['status', nextStatus],
                            ['move', result.san],
                            ...(remoteGameState.relay ? [['relay', remoteGameState.relay]] : []),
                        ],
                        content: `Move: ${result.san}`,
                    };

                    try {
                        const signedEvent = await window.nostr.signEvent(event);
                        const publishRelays = remoteGameState.relay ? [remoteGameState.relay] : (relays.length > 0 ? relays : ['wss://relay.damus.io']);

                        // Publish to relays without crashing if one fails
                        const pubs = pool.publish(publishRelays, signedEvent);
                        await Promise.allSettled(pubs);
                    } catch (publishError) {
                        console.error('[useChessGame] Failed to publish move:', publishError);
                    }
                }
                return true;
            }
        } catch (e) {
            console.error('[useChessGame.makeMove] EXCEPTION:', e);
        }
        return false;
    }, [game, pubkey, gameId, remoteGameState, pool, relays]);

    const resetGame = useCallback(() => {
        setFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    }, []);

    const isCheckmate = game.isCheckmate();
    const isDraw = game.isDraw();

    let winner: 'w' | 'b' | 'draw' | undefined = undefined;
    if (isCheckmate) {
        winner = game.turn() === 'w' ? 'b' : 'w';
    } else if (isDraw) {
        winner = 'draw';
    }

    const gameState: GameState = {
        id: gameId || 'local-game',
        fen: fen,
        white: remoteGameState.white || 'Player 1',
        black: remoteGameState.black || 'Player 2',
        status: isCheckmate ? 'checkmate' : isDraw ? 'draw' : (remoteGameState.status || 'in-progress'),
        turn: game.turn(),
        winner,
        relay: remoteGameState.relay,
    };

    return {
        game,
        gameState,
        makeMove,
        resetGame,
        createGame: async (targetRelay?: string) => {
            if (!pubkey || !window.nostr) return null;
            const newId = crypto.randomUUID();
            const startFen = new Chess().fen();
            const selectedRelay = targetRelay || relays[0] || 'wss://relay.damus.io';

            const event: UnsignedEvent = {
                kind: CHESS_KIND,
                pubkey: pubkey,
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                    ['d', newId],
                    ['p', pubkey],
                    ['fen', startFen],
                    ['status', 'awaiting-player'],
                    ['relay', selectedRelay],
                ],
                content: 'New Chess Game',
            };

            try {
                const signedEvent = await window.nostr.signEvent(event);
                const pubs = pool.publish([selectedRelay], signedEvent);
                await Promise.allSettled(pubs);
                return { id: newId, relay: selectedRelay };
            } catch (e) {
                console.error('Failed to create game:', e);
                return null;
            }
        },
        joinGame: async (gId: string, opponent: string, preferredRelay?: string) => {
            if (!pubkey || !window.nostr) return false;

            // refuse to join if opponent is a placeholder
            if (!opponent || opponent === 'Player 1') {
                console.error('Cannot join game with invalid opponent pubkey');
                return false;
            }

            const startFen = fen; // Use current FEN (safest) or new Chess().fen() if strictly new
            const targetRelay = preferredRelay || relays[0] || 'wss://relay.damus.io';

            const event: UnsignedEvent = {
                kind: CHESS_KIND,
                pubkey: pubkey,
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                    ['d', gId],
                    ['p', opponent],
                    ['p', pubkey],
                    ['fen', startFen],
                    ['status', 'in-progress'],
                    ['relay', targetRelay],
                ],
                content: 'Joined Chess Game',
            };

            // OPTIMISTIC UPDATE
            setRemoteGameState({
                white: opponent,
                black: pubkey,
                status: 'in-progress',
                relay: targetRelay,
                created_at: event.created_at
            });

            try {
                const signedEvent = await window.nostr.signEvent(event);
                const pubs = pool.publish([targetRelay], signedEvent);
                const results = await Promise.allSettled(pubs);
                const success = results.some(r => r.status === 'fulfilled');
                if (!success) console.warn('Publish completed but may have failed on some relays');
                return true;
            } catch (e) {
                console.error('Failed to join game:', e);
                // Revert optimistic update? 
                // In practice, it's better to leave it or handle error UI, but for now we log.
                return false;
            }
        },
    };
}
