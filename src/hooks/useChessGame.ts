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
}

export function useChessGame(gameId?: string) {
    const { pubkey, pool, relays } = useNostr();
    const [game, setGame] = useState(new Chess());
    const [gameState, setGameState] = useState<GameState | null>(null);

    // Subscribe to game updates
    useEffect(() => {
        if (!gameId) return;

        const sub = (pool as any).subscribeMany(relays, [
            {
                kinds: [CHESS_KIND],
                '#d': [gameId],
            },
        ], {
            onevent: (event: Event) => {
                const d = event.tags.find(t => t[0] === 'd')?.[1];
                const p = event.tags.filter(t => t[0] === 'p').map(t => t[1]);
                const fen = event.tags.find(t => t[0] === 'fen')?.[1];
                const status = event.tags.find(t => t[0] === 'status')?.[1] as GameState['status'];
                const lastMove = event.tags.find(t => t[0] === 'move')?.[1];

                if (d && fen) {
                    setGameState({
                        id: d,
                        fen,
                        white: p[0],
                        black: p[1],
                        status: status || 'in-progress',
                        lastMove,
                        turn: new Chess(fen).turn(),
                    });
                    setGame(new Chess(fen));
                }
            }
        });

        return () => sub.close();
    }, [gameId, pool, relays]);

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
                    ],
                    content: `Move: ${result.san}`,
                };

                const signedEvent = await window.nostr.signEvent(event);
                await Promise.all(pool.publish(relays, signedEvent));
                return true;
            }
        } catch (e) {
            console.error('Invalid move:', e);
        }
        return false;
    };

    const createGame = async () => {
        if (!pubkey || !window.nostr) return null;

        const id = crypto.randomUUID();
        const initialFen = new Chess().fen();

        const event: UnsignedEvent = {
            kind: CHESS_KIND,
            pubkey: pubkey,
            created_at: Math.floor(Date.now() / 1000),
            tags: [
                ['d', id],
                ['p', pubkey],
                ['fen', initialFen],
                ['status', 'awaiting-player'],
            ],
            content: 'New Chess Game',
        };

        try {
            const signedEvent = await window.nostr.signEvent(event);
            await Promise.all(pool.publish(relays, signedEvent));
            return id;
        } catch (e) {
            console.error('Failed to create game:', e);
            return null;
        }
    };

    const joinGame = async (gameId: string, opponentPubkey: string) => {
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
            ],
            content: 'Joined Chess Game',
        };

        try {
            const signedEvent = await window.nostr.signEvent(event);
            await Promise.all(pool.publish(relays, signedEvent));
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
