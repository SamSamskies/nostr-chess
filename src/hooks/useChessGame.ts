'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Chess } from 'chess.js';
import { useNostr } from '@/contexts/NostrContext';
import { CHESS_KIND } from '@/lib/nostr';
import { createOpenGamePgn, exportNip64Pgn, loadPgnFromNip64 } from '@/lib/pgn';
import { Event, UnsignedEvent } from 'nostr-tools';

export interface GameState {
    id: string;
    fen: string;
    white: string;
    black?: string;
    status: 'awaiting-player' | 'in-progress' | 'checkmate' | 'draw' | 'resigned';
    turn: 'w' | 'b';
    winner?: 'w' | 'b' | 'draw';
    relay?: string;
    created_at?: number;
}

function isPubkeyTag(s: string | undefined): boolean {
    return !!s && s.length >= 32 && !s.startsWith('Player');
}

function deriveStatus(
    chess: Chess,
    whitePk: string | undefined,
    blackPk: string | undefined
): GameState['status'] {
    if (!isPubkeyTag(whitePk) || !isPubkeyTag(blackPk)) return 'awaiting-player';
    if (chess.isCheckmate()) return 'checkmate';
    if (chess.isDraw()) return 'draw';
    return 'in-progress';
}

function chessFromPgnOrStart(pgn: string): Chess {
    if (!pgn.trim()) return new Chess();
    const loaded = loadPgnFromNip64(pgn);
    return loaded ?? new Chess();
}

export function useChessGame(gameId?: string, initialRelay?: string) {
    const { pubkey, pool, relay } = useNostr();
    const [pgnContent, setPgnContent] = useState('');
    const [remoteGameState, setRemoteGameState] = useState<Partial<GameState>>({});

    const lastEventTimestampRef = useRef<number>(0);

    const game = useMemo(() => chessFromPgnOrStart(pgnContent), [pgnContent]);

    const remoteGameStateRef = useRef<Partial<GameState>>({});
    const relayRef = useRef(relay);

    useEffect(() => {
        relayRef.current = relay;
    }, [relay]);

    useEffect(() => {
        remoteGameStateRef.current = remoteGameState;
    }, [remoteGameState]);

    useEffect(() => {
        if (!gameId || !pool) return;

        const subscriptionRelays = initialRelay
            ? [...new Set([initialRelay, relayRef.current])]
            : [relayRef.current];
        console.log('[useChessGame] Setting up subscription for game:', gameId, 'on relays:', subscriptionRelays);

        const onEvent = (event: Event) => {
            const d = event.tags.find(t => t[0] === 'd')?.[1];
            if (d !== gameId) return;

            const eventTime = event.created_at;
            if (eventTime <= lastEventTimestampRef.current) {
                console.log('[useChessGame] Skipping old event:', eventTime, 'vs', lastEventTimestampRef.current);
                return;
            }

            const p = event.tags.filter(t => t[0] === 'p').map(t => t[1]).filter(Boolean);
            const relay = event.tags.find(t => t[0] === 'relay')?.[1];

            const chess = loadPgnFromNip64(event.content);
            if (!chess) {
                console.warn('[useChessGame] Invalid NIP-64 PGN in event', event.id);
                return;
            }

            lastEventTimestampRef.current = eventTime;

            setPgnContent(event.content);

            const whitePk = p[0];
            const blackPk = p[1];
            const status = deriveStatus(chess, whitePk, blackPk);

            setRemoteGameState(prev => ({
                white: whitePk || prev.white,
                black: blackPk || prev.black,
                status,
                relay: relay || prev.relay,
                created_at: eventTime,
            }));
        };

        const fetchInitial = async () => {
            try {
                console.log('[useChessGame] Fetching initial game state...');
                const events = await (pool as any).querySync(subscriptionRelays, {
                    kinds: [CHESS_KIND],
                    '#d': [gameId],
                    limit: 10,
                });

                if (events && events.length > 0) {
                    events.sort((a: any, b: any) => b.created_at - a.created_at);
                    console.log('[useChessGame] Found initial event:', events[0]);
                    onEvent(events[0]);
                } else {
                    console.log('[useChessGame] No initial events found');
                }
            } catch (e) {
                console.error('[useChessGame] Initial fetch failed:', e);
            }
        };

        fetchInitial();

        const sub = (pool as any).subscribeMany(
            subscriptionRelays,
            {
                kinds: [CHESS_KIND],
                '#d': [gameId],
            },
            {
                onevent: onEvent,
                oneose: () => {
                    console.log('[useChessGame] Subscription EOSE received');
                },
                onclose: (reason: string) => {
                    console.log('[useChessGame] Subscription closed:', reason);
                },
            }
        );

        return () => {
            console.log('[useChessGame] Cleaning up subscription');
            sub.close();
        };
    }, [gameId, pool, initialRelay]);

    const makeMove = useCallback(
        async (move: string | { from: string; to: string; promotion?: string }) => {
            try {
                const gameCopy = chessFromPgnOrStart(pgnContent);
                const result = gameCopy.move(move);

                if (result) {
                    console.log('[useChessGame] Move made locally:', result.san);

                    const r = remoteGameStateRef.current;
                    if (isPubkeyTag(r.white) && isPubkeyTag(r.black)) {
                        gameCopy.setHeader('White', r.white!);
                        gameCopy.setHeader('Black', r.black!);
                    }

                    const body = exportNip64Pgn(gameCopy);
                    setPgnContent(body);

                    if (pubkey && window.nostr && isPubkeyTag(r.white) && isPubkeyTag(r.black) && gameId) {
                        const nextStatus = deriveStatus(gameCopy, r.white, r.black);
                        const eventTimestamp = Math.floor(Date.now() / 1000);
                        lastEventTimestampRef.current = eventTimestamp;

                        const event: UnsignedEvent = {
                            kind: CHESS_KIND,
                            pubkey: pubkey,
                            created_at: eventTimestamp,
                            tags: [
                                ['d', gameId],
                                ['p', r.white!],
                                ['p', r.black!],
                                ['alt', `Nostr Chess #${gameId.slice(0, 8)}`],
                                ...(r.relay ? [['relay', r.relay]] : []),
                            ],
                            content: body,
                        };

                        try {
                            const signedEvent = await window.nostr.signEvent(event);
                            const publishRelays = r.relay ? [r.relay] : [relay];
                            const pubs = pool.publish(publishRelays, signedEvent);
                            await Promise.allSettled(pubs);
                        } catch (publishError) {
                            console.error('[useChessGame] Failed to publish move:', publishError);
                        }

                        setRemoteGameState(prev => ({
                            ...prev,
                            status: nextStatus,
                        }));
                    }
                    return true;
                }
            } catch (e) {
                console.error('[useChessGame.makeMove] EXCEPTION:', e);
            }
            return false;
        },
        [pubkey, gameId, pgnContent, pool, relay]
    );

    const fen = game.fen();
    const isCheckmate = game.isCheckmate();
    const isDraw = game.isDraw();

    let winner: 'w' | 'b' | 'draw' | undefined = undefined;
    if (isCheckmate) {
        winner = game.turn() === 'w' ? 'b' : 'w';
    } else if (isDraw) {
        winner = 'draw';
    }

    const whiteDisplay = remoteGameState.white || 'Player 1';
    const blackDisplay = remoteGameState.black || 'Player 2';

    const gameState: GameState = {
        id: gameId || 'local-game',
        fen,
        white: whiteDisplay,
        black: blackDisplay,
        status: isCheckmate ? 'checkmate' : isDraw ? 'draw' : remoteGameState.status || 'in-progress',
        turn: game.turn(),
        winner,
        relay: remoteGameState.relay,
    };

    return {
        game,
        gameState,
        makeMove,
        createGame: async (targetRelay?: string) => {
            if (!pubkey || !window.nostr) return null;
            const newId = crypto.randomUUID();
            const selectedRelay = targetRelay || relay || 'wss://relay.damus.io';
            const body = createOpenGamePgn(pubkey, selectedRelay);

            const event: UnsignedEvent = {
                kind: CHESS_KIND,
                pubkey: pubkey,
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                    ['d', newId],
                    ['p', pubkey],
                    ['alt', `Nostr Chess #${newId.slice(0, 8)} — awaiting opponent`],
                    ['relay', selectedRelay],
                ],
                content: body,
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

            if (!opponent || opponent === 'Player 1') {
                console.error('Cannot join game with invalid opponent pubkey');
                return false;
            }

            const targetRelay = preferredRelay || relay || 'wss://relay.damus.io';
            const created_at = Math.floor(Date.now() / 1000);

            const c = chessFromPgnOrStart(pgnContent);
            c.setHeader('White', opponent);
            c.setHeader('Black', pubkey);
            c.setHeader('Result', '*');
            const body = c.pgn({ maxWidth: 0 });

            const event: UnsignedEvent = {
                kind: CHESS_KIND,
                pubkey: pubkey,
                created_at,
                tags: [
                    ['d', gId],
                    ['p', opponent],
                    ['p', pubkey],
                    ['alt', `Nostr Chess #${gId.slice(0, 8)}`],
                    ['relay', targetRelay],
                ],
                content: body,
            };

            setRemoteGameState({
                white: opponent,
                black: pubkey,
                status: 'in-progress',
                relay: targetRelay,
                created_at,
            });
            setPgnContent(body);

            try {
                const signedEvent = await window.nostr.signEvent(event);
                const pubs = pool.publish([targetRelay], signedEvent);
                const results = await Promise.allSettled(pubs);
                const success = results.some(r => r.status === 'fulfilled');
                if (!success) console.warn('Publish completed but may have failed on some relays');
                return true;
            } catch (e) {
                console.error('Failed to join game:', e);
                return false;
            }
        },
    };
}
