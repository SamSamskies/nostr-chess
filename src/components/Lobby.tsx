'use client';

import { useEffect, useState } from 'react';
import { useNostr } from '@/contexts/NostrContext';
import { useChessGame, GameState } from '@/hooks/useChessGame';
import { Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { CHESS_KIND } from '@/lib/nostr';
import { Event } from 'nostr-tools';
import { Plus, Play, User, RefreshCw } from 'lucide-react';

export function Lobby({ onSelectGame }: { onSelectGame: (id: string) => void }) {
    const { pubkey, pool, relays, login } = useNostr();
    const { createGame, joinGame } = useChessGame();
    const [games, setGames] = useState<GameState[]>([]);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const fetchGames = async () => {
        setIsRefreshing(true);
        try {
            const events = await pool.querySync(relays, {
                kinds: [CHESS_KIND],
                limit: 50,
            });

            const gameMap = new Map<string, GameState>();
            events.forEach((event: Event) => {
                const d = event.tags.find(t => t[0] === 'd')?.[1];
                if (!d) return;

                // Since it's a replaceable event kind, we only care about the latest one for each 'd'
                const existing = gameMap.get(d);
                if (existing && (event.created_at <= (existing as any).created_at)) return;

                const p = event.tags.filter(t => t[0] === 'p').map(t => t[1]);
                const fen = event.tags.find(t => t[0] === 'fen')?.[1];
                const status = event.tags.find(t => t[0] === 'status')?.[1] as GameState['status'];

                if (fen) {
                    gameMap.set(d, {
                        id: d,
                        fen,
                        white: p[0],
                        black: p[1],
                        status: status || 'in-progress',
                        turn: 'w', // simplified for list
                        created_at: event.created_at, // for comparison
                    } as any);
                }
            });

            setGames(Array.from(gameMap.values()).sort((a: any, b: any) => b.created_at - a.created_at));
        } catch (e) {
            console.error('Failed to fetch games:', e);
        } finally {
            setIsRefreshing(false);
        }
    };

    useEffect(() => {
        fetchGames();
        const interval = setInterval(fetchGames, 10000);
        return () => clearInterval(interval);
    }, [pool, relays]);

    const handleCreateGame = async () => {
        const id = await createGame();
        if (id) {
            onSelectGame(id);
        }
    };

    const handleJoinGame = async (game: GameState) => {
        if (game.white === pubkey) {
            onSelectGame(game.id);
            return;
        }
        const success = await joinGame(game.id, game.white);
        if (success) {
            onSelectGame(game.id);
        }
    };

    if (!pubkey) {
        return (
            <Card className="max-w-md mx-auto text-center p-12 mt-20">
                <CardHeader>
                    <div className="mx-auto bg-indigo-500/10 p-4 rounded-full w-fit mb-4">
                        <User className="w-12 h-12 text-indigo-400" />
                    </div>
                    <CardTitle className="text-2xl">Welcome to Nostr Chess</CardTitle>
                    <CardDescription>
                        Login with your Nostr extension to start playing decentralized chess.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Button onClick={login} className="w-full">Login with NIP-07</Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto p-4">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                    Current Games
                    <Badge variant="secondary" className="ml-2 font-mono">
                        {games.length}
                    </Badge>
                </h2>
                <div className="flex gap-2">
                    <Button variant="outline" size="icon" onClick={fetchGames} isLoading={isRefreshing}>
                        <RefreshCw className="w-4 h-4" />
                    </Button>
                    <Button onClick={handleCreateGame}>
                        <Plus className="w-4 h-4 mr-2" />
                        New Game
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {games.length === 0 ? (
                    <div className="col-span-full text-center p-12 text-slate-500 border-2 border-dashed border-slate-800 rounded-xl">
                        No active games found. Create one!
                    </div>
                ) : (
                    games.map((game) => (
                        <Card key={game.id} className="hover:border-indigo-500/50 transition-all cursor-pointer group" onClick={() => handleJoinGame(game)}>
                            <CardHeader className="pb-2">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <CardTitle className="text-md font-mono">#{game.id.slice(0, 8)}</CardTitle>
                                        <CardDescription className="text-xs truncate max-w-[200px]">
                                            Created by {game.white.slice(0, 8)}...
                                        </CardDescription>
                                    </div>
                                    <Badge variant={game.status === 'awaiting-player' ? 'warning' : 'success'}>
                                        {game.status}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center gap-4 text-sm text-slate-300">
                                    <div className="flex -space-x-2">
                                        <div className="w-8 h-8 rounded-full bg-slate-700 border-2 border-slate-900 flex items-center justify-center">
                                            <User className="w-4 h-4" />
                                        </div>
                                        {game.black && (
                                            <div className="w-8 h-8 rounded-full bg-indigo-700 border-2 border-slate-900 flex items-center justify-center">
                                                <User className="w-4 h-4" />
                                            </div>
                                        )}
                                    </div>
                                    <span>
                                        {game.black ? 'In Progress' : 'Waiting for opponent'}
                                    </span>
                                </div>
                            </CardContent>
                            <CardFooter className="pt-0 flex justify-end">
                                <Button size="sm" variant="ghost" className="group-hover:text-indigo-400">
                                    <Play className="w-4 h-4 mr-2" />
                                    {game.white === pubkey || game.black === pubkey ? 'Resume' : game.black ? 'Watch' : 'Join'}
                                </Button>
                            </CardFooter>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
}
