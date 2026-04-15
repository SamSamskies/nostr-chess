'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Chess } from 'chess.js';
import { useNostr } from '@/contexts/NostrContext';
import { CHESS_KIND } from '@/lib/nostr';
import {
    createOpenGamePgn,
    exportNip64Pgn,
    exportPgnAfterResignation,
    loadPgnFromNip64,
    resolveChessGameOutcome,
} from '@/lib/pgn';
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

interface PoolSubscription {
    close(): void;
}

interface QueryableNostrPool {
    querySync(relays: string[], filter: { kinds: number[]; '#d': string[]; limit: number }): Promise<Event[]>;
    subscribeMany(
        relays: string[],
        filter: { kinds: number[]; '#d': string[] },
        handlers: { onevent: (event: Event) => void; oneose?: () => void; onclose?: (reason: string) => void }
    ): PoolSubscription;
}

function isPubkeyTag(s: string | undefined): boolean {
    return !!s && s.length >= 32 && !s.startsWith('Player');
}

/** Prefer remote state; fall back to PGN headers so we can publish if the ref lags behind loaded PGN. */
function resolvePlayerPubkeys(
    r: Partial<GameState>,
    chess: Chess
): { white?: string; black?: string } {
    const h = chess.getHeaders();
    const white = isPubkeyTag(r.white) ? r.white : isPubkeyTag(h.White) ? h.White : undefined;
    const black = isPubkeyTag(r.black) ? r.black : isPubkeyTag(h.Black) ? h.Black : undefined;
    return { white, black };
}

/** Same relay set as the game subscription: game tag + link relay + app default (deduped). */
function buildPublishRelayUrls(
    gameRelay: string | undefined,
    initialRelay: string | undefined,
    fallbackRelay: string
): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const u of [gameRelay, initialRelay, fallbackRelay]) {
        const t = u?.trim();
        if (!t || seen.has(t)) continue;
        seen.add(t);
        out.push(t);
    }
    return out;
}

async function publishAndLogFailures(
    pool: { publish: (relays: string[], event: Event) => Promise<unknown>[] },
    relays: string[],
    signedEvent: Event,
    label: string
): Promise<void> {
    if (relays.length === 0) {
        console.error(`[useChessGame] ${label}: no relays to publish to`);
        return;
    }
    const pubs = pool.publish(relays, signedEvent);
    const results = await Promise.allSettled(pubs);
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed.length > 0) {
        console.error(`[useChessGame] ${label}: publish failed on ${failed.length}/${results.length} relay(s)`, failed.map(f => f.reason));
    }
}

function chessFromPgnOrStart(pgn: string): Chess {
    if (!pgn.trim()) return new Chess();
    const loaded = loadPgnFromNip64(pgn);
    return loaded ?? new Chess();
}

export function useChessGame(gameId?: string, initialRelay?: string) {
    const { pubkey, pool, effectiveRelay } = useNostr();
    const [pgnContent, setPgnContent] = useState('');
    const [remoteGameState, setRemoteGameState] = useState<Partial<GameState>>({});

    const lastEventTimestampRef = useRef<number>(0);
    const lastEventIdRef = useRef<string | null>(null);

    const game = useMemo(() => chessFromPgnOrStart(pgnContent), [pgnContent]);

    const remoteGameStateRef = useRef<Partial<GameState>>({});
    const relayRef = useRef(effectiveRelay);
    const initialRelayRef = useRef(initialRelay);
    /** Latest PGN for move/resign (updated synchronously with setPgnContent) so makeMove never applies to a stale board. */
    const pgnContentRef = useRef('');

    useEffect(() => {
        relayRef.current = effectiveRelay;
    }, [effectiveRelay]);

    useEffect(() => {
        initialRelayRef.current = initialRelay;
    }, [initialRelay]);

    useEffect(() => {
        pgnContentRef.current = pgnContent;
    }, [pgnContent]);

    /** Keep in sync with `remoteGameState` for makeMove/resign; also updated synchronously on setState to avoid a frame where the ref lags (useEffect runs after paint). */
    useEffect(() => {
        remoteGameStateRef.current = remoteGameState;
    }, [remoteGameState]);

    useEffect(() => {
        if (!gameId || !pool) return;
        const queryablePool = pool as unknown as QueryableNostrPool;

        const subscriptionRelays = initialRelay
            ? [...new Set([initialRelay, relayRef.current])]
            : [relayRef.current];
        console.log('[useChessGame] Setting up subscription for game:', gameId, 'on relays:', subscriptionRelays);

        const onEvent = (event: Event) => {
            const d = event.tags.find(t => t[0] === 'd')?.[1];
            if (d !== gameId) return;

            const eventTime = event.created_at;
            if (event.id === lastEventIdRef.current) {
                console.log('[useChessGame] Skipping duplicate event id:', event.id);
                return;
            }
            if (eventTime < lastEventTimestampRef.current) {
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
            lastEventIdRef.current = event.id;

            setPgnContent(event.content);
            pgnContentRef.current = event.content;

            const whitePk = p[0];
            const blackPk = p[1];

            setRemoteGameState(prev => {
                const next = {
                    white: whitePk || prev.white,
                    black: blackPk || prev.black,
                    relay: relay || prev.relay,
                    created_at: eventTime,
                };
                remoteGameStateRef.current = next;
                return next;
            });
        };

        const fetchLatest = async (reason: string) => {
            try {
                console.log(`[useChessGame] Fetching latest game state (${reason})...`);
                const events = await queryablePool.querySync(subscriptionRelays, {
                    kinds: [CHESS_KIND],
                    '#d': [gameId],
                    limit: 10,
                });

                if (events && events.length > 0) {
                    events.sort((a, b) => b.created_at - a.created_at);
                    console.log('[useChessGame] Found latest event:', events[0]);
                    onEvent(events[0]);
                } else {
                    console.log('[useChessGame] No game events found');
                }
            } catch (e) {
                console.error(`[useChessGame] Fetch latest failed (${reason}):`, e);
            }
        };

        fetchLatest('initial');

        const sub = queryablePool.subscribeMany(
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

        const onVisibilityOrFocus = () => {
            if (document.visibilityState === 'visible') {
                fetchLatest('tab-visible');
            }
        };
        const onWindowFocus = () => fetchLatest('window-focus');
        const onOnline = () => fetchLatest('network-online');

        document.addEventListener('visibilitychange', onVisibilityOrFocus);
        window.addEventListener('focus', onWindowFocus);
        window.addEventListener('online', onOnline);

        return () => {
            console.log('[useChessGame] Cleaning up subscription');
            sub.close();
            document.removeEventListener('visibilitychange', onVisibilityOrFocus);
            window.removeEventListener('focus', onWindowFocus);
            window.removeEventListener('online', onOnline);
        };
    }, [gameId, pool, initialRelay]);

    const makeMove = useCallback(
        async (move: string | { from: string; to: string; promotion?: string }) => {
            try {
                const gameCopy = chessFromPgnOrStart(pgnContentRef.current);
                const result = gameCopy.move(move);

                if (result) {
                    console.log('[useChessGame] Move made locally:', result.san);

                    const r = remoteGameStateRef.current;
                    const rp = resolvePlayerPubkeys(r, gameCopy);
                    if (isPubkeyTag(rp.white) && isPubkeyTag(rp.black)) {
                        gameCopy.setHeader('White', rp.white!);
                        gameCopy.setHeader('Black', rp.black!);
                    }

                    const body = exportNip64Pgn(gameCopy);
                    setPgnContent(body);
                    pgnContentRef.current = body;

                    if (pubkey && window.nostr && isPubkeyTag(rp.white) && isPubkeyTag(rp.black) && gameId) {
                        const eventTimestamp = Math.floor(Date.now() / 1000);

                        const event: UnsignedEvent = {
                            kind: CHESS_KIND,
                            pubkey: pubkey,
                            created_at: eventTimestamp,
                            tags: [
                                ['d', gameId],
                                ['p', rp.white!],
                                ['p', rp.black!],
                                ['alt', `Nostr Chess #${gameId.slice(0, 8)}`],
                                ...(r.relay ? [['relay', r.relay]] : []),
                            ],
                            content: body,
                        };

                        try {
                            const signedEvent = await window.nostr.signEvent(event);
                            const publishRelays = buildPublishRelayUrls(
                                r.relay,
                                initialRelayRef.current,
                                relayRef.current
                            );
                            await publishAndLogFailures(pool, publishRelays, signedEvent, 'makeMove');
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
        },
        [pubkey, gameId, pool]
    );

    const resign = useCallback(async () => {
        try {
            if (!pubkey || !window.nostr || !gameId) return false;

            const gameCopy = chessFromPgnOrStart(pgnContentRef.current);
            if (gameCopy.isCheckmate() || gameCopy.isDraw()) return false;

            const r = remoteGameStateRef.current;
            const rp = resolvePlayerPubkeys(r, gameCopy);
            if (!isPubkeyTag(rp.white) || !isPubkeyTag(rp.black)) return false;

            const iAmWhite = pubkey.toLowerCase() === rp.white!.toLowerCase();
            const iAmBlack = pubkey.toLowerCase() === rp.black!.toLowerCase();
            if (!iAmWhite && !iAmBlack) return false;

            gameCopy.setHeader('White', rp.white!);
            gameCopy.setHeader('Black', rp.black!);
            const resignedColor = iAmWhite ? 'w' : 'b';
            const body = exportPgnAfterResignation(gameCopy, resignedColor);
            setPgnContent(body);
            pgnContentRef.current = body;

            const eventTimestamp = Math.floor(Date.now() / 1000);

            const event: UnsignedEvent = {
                kind: CHESS_KIND,
                pubkey: pubkey,
                created_at: eventTimestamp,
                tags: [
                    ['d', gameId],
                    ['p', rp.white!],
                    ['p', rp.black!],
                    ['alt', `Nostr Chess #${gameId.slice(0, 8)}`],
                    ...(r.relay ? [['relay', r.relay]] : []),
                ],
                content: body,
            };

            const signedEvent = await window.nostr.signEvent(event);
            const publishRelays = buildPublishRelayUrls(r.relay, initialRelayRef.current, relayRef.current);
            await publishAndLogFailures(pool, publishRelays, signedEvent, 'resign');
            return true;
        } catch (e) {
            console.error('[useChessGame.resign]', e);
            return false;
        }
    }, [pubkey, gameId, pool]);

    const fen = game.fen();
    const whiteDisplay = remoteGameState.white || 'Player 1';
    const blackDisplay = remoteGameState.black || 'Player 2';
    const hasBothPlayers = isPubkeyTag(remoteGameState.white) && isPubkeyTag(remoteGameState.black);
    const outcome = resolveChessGameOutcome(game, hasBothPlayers);

    const gameState: GameState = {
        id: gameId || 'local-game',
        fen,
        white: whiteDisplay,
        black: blackDisplay,
        status: outcome.status,
        turn: game.turn(),
        winner: outcome.winner,
        relay: remoteGameState.relay,
    };

    return {
        game,
        gameState,
        makeMove,
        resign,
        createGame: async (targetRelay?: string) => {
            if (!pubkey || !window.nostr) return null;
            const newId = crypto.randomUUID();
            const selectedRelay = targetRelay || effectiveRelay;
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

            const targetRelay = preferredRelay || effectiveRelay;
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

            const joined: Partial<GameState> = {
                white: opponent,
                black: pubkey,
                status: 'in-progress',
                relay: targetRelay,
                created_at,
            };
            remoteGameStateRef.current = joined;
            setRemoteGameState(joined);
            setPgnContent(body);
            pgnContentRef.current = body;

            try {
                const signedEvent = await window.nostr.signEvent(event);
                const joinRelays = buildPublishRelayUrls(targetRelay, initialRelayRef.current, relayRef.current);
                await publishAndLogFailures(pool, joinRelays, signedEvent, 'joinGame');
                return true;
            } catch (e) {
                console.error('Failed to join game:', e);
                return false;
            }
        },
    };
}
