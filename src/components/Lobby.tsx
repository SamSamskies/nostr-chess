'use client';

import { useEffect, useState } from 'react';
import { useNostr } from '@/contexts/NostrContext';
import { useChessGame, GameState } from '@/hooks/useChessGame';
import { Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { CHESS_KIND } from '@/lib/nostr';
import { PlayerAvatar } from '@/components/PlayerProfile';
import { Event } from 'nostr-tools';
import { Plus, Play, User, RefreshCw, Globe, X, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function Lobby() {
    const router = useRouter();
    const { pubkey, pool, relays, login, addRelay } = useNostr();
    const { createGame, joinGame } = useChessGame();
    const [games, setGames] = useState<GameState[]>([]);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [selectedRelay, setSelectedRelay] = useState('wss://relay.damus.io');

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

                const existing = gameMap.get(d);
                if (existing && (event.created_at <= (existing as any).created_at)) return;

                const p = event.tags.filter(t => t[0] === 'p').map(t => t[1]);
                const fen = event.tags.find(t => t[0] === 'fen')?.[1];
                const status = event.tags.find(t => t[0] === 'status')?.[1] as GameState['status'];
                const relay = event.tags.find(t => t[0] === 'relay')?.[1];

                if (fen) {
                    gameMap.set(d, {
                        id: d,
                        fen,
                        white: p[0],
                        black: p[1],
                        status: status || 'in-progress',
                        turn: 'w',
                        created_at: event.created_at,
                        relay,
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
        addRelay(selectedRelay);
        const result = await createGame(selectedRelay);
        if (result) {
            router.push(`/game/${result.id}?relay=${encodeURIComponent(result.relay)}`);
        }
    };

    const handleJoinGame = (game: GameState) => {
        router.push(`/game/${game.id}?relay=${encodeURIComponent(game.relay || '')}`);
    };

    if (!pubkey) {
        return (
            <Card className="max-w-md mx-auto text-center p-12 mt-20 border-slate-800 bg-slate-900/40 backdrop-blur-md shadow-2xl">
                <CardHeader>
                    <div className="mx-auto bg-indigo-500/10 p-6 rounded-full w-fit mb-6 ring-1 ring-indigo-500/20">
                        <User className="w-12 h-12 text-indigo-400" />
                    </div>
                    <CardTitle className="text-3xl font-black text-white tracking-tight">Welcome to Nostr Chess</CardTitle>
                    <CardDescription className="text-slate-400 text-lg mt-2">
                        Login with your Nostr extension to start playing decentralized chess.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Button onClick={login} size="lg" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold h-12">
                        Login with NIP-07
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-8 max-w-5xl mx-auto p-4">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-6 border-b border-slate-800">
                <div>
                    <h2 className="text-3xl font-black text-white flex items-center gap-3 tracking-tight">
                        Lobby
                        <Badge variant="secondary" className="bg-slate-800 text-slate-300 font-mono text-xs px-2.5">
                            {games.length} Active
                        </Badge>
                    </h2>
                    <p className="text-slate-500 mt-1 font-medium">Find or create a decentralized chess match.</p>
                </div>
                <div className="flex flex-wrap gap-4 items-end bg-slate-900/40 p-5 rounded-2xl border border-slate-800/50 backdrop-blur-sm w-full md:w-auto">
                    <div className="space-y-2 flex-1 min-w-[200px]">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 ml-1">
                            <Globe className="w-3 h-3" />
                            Hosting Relay
                        </label>
                        <div className="relative group/input">
                            <input
                                type="text"
                                value={selectedRelay}
                                onChange={(e) => setSelectedRelay(e.target.value)}
                                list="relay-list"
                                placeholder="wss://relay.damus.io"
                                className="appearance-none bg-slate-950/50 border border-slate-700/50 rounded-xl text-sm px-3.5 py-2.5 pr-9 outline-none focus:ring-2 focus:ring-indigo-500/50 w-full transition-all text-white"
                            />
                            {selectedRelay && (
                                <button
                                    onClick={() => setSelectedRelay('')}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                            <datalist id="relay-list">
                                {relays.map(r => (
                                    <option key={r} value={r} />
                                ))}
                            </datalist>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="icon" onClick={fetchGames} isLoading={isRefreshing} className="h-11 w-11 border-slate-700 hover:bg-slate-800 rounded-xl">
                            <RefreshCw className="w-4 h-4" />
                        </Button>
                        <Button onClick={handleCreateGame} className="h-11 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl px-6">
                            <Plus className="w-4 h-4 mr-2" />
                            New Game
                        </Button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {games.length === 0 ? (
                    <div className="col-span-full text-center py-24 text-slate-500 border-2 border-dashed border-slate-800/50 rounded-3xl bg-slate-900/10">
                        <div className="bg-slate-900 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-800">
                            <Globe className="w-8 h-8 text-slate-700" />
                        </div>
                        <p className="text-lg font-medium">No active games found on this relay.</p>
                        <p className="text-sm text-slate-600 mt-1">Be the first to start a match!</p>
                    </div>
                ) : (
                    games.map((game) => (
                        <Card key={game.id} className="bg-slate-900/40 border-slate-800 hover:border-indigo-500/50 transition-all cursor-pointer group hover:translate-y-[-2px] hover:shadow-xl hover:shadow-indigo-500/5" onClick={() => handleJoinGame(game)}>
                            <CardHeader className="pb-4">
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-3">
                                        <PlayerAvatar pubkey={game.white} />
                                        <div>
                                            <CardTitle className="text-sm font-mono text-slate-400 group-hover:text-white transition-colors">
                                                #{game.id.slice(0, 8)}
                                            </CardTitle>
                                            <CardDescription className="text-xs font-medium text-slate-500 line-clamp-1">
                                                {game.white === pubkey ? 'Your Game' : 'Join Match'}
                                            </CardDescription>
                                        </div>
                                    </div>
                                    <Badge variant={game.status === 'awaiting-player' ? 'warning' : 'success'} className="text-[10px] uppercase font-black tracking-wider">
                                        {game.status === 'awaiting-player' ? 'Waiting' : 'Live'}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="pb-4">
                                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/40 border border-slate-800/50">
                                    <div className="flex -space-x-3">
                                        <div className="ring-4 ring-slate-950 rounded-full overflow-hidden">
                                            <PlayerAvatar pubkey={game.white} size="sm" />
                                        </div>
                                        {game.black && (
                                            <div className="ring-4 ring-slate-950 rounded-full overflow-hidden">
                                                <PlayerAvatar pubkey={game.black} size="sm" />
                                            </div>
                                        )}
                                        {!game.black && (
                                            <div className="w-6 h-6 rounded-full bg-slate-800 ring-4 ring-slate-950 flex items-center justify-center border border-dashed border-slate-700">
                                                <span className="text-[8px] text-slate-600 font-black">?</span>
                                            </div>
                                        )}
                                    </div>
                                    <span className="text-xs font-bold text-slate-400">
                                        {game.black ? 'Match Full' : 'Open for Play'}
                                    </span>
                                </div>
                            </CardContent>
                            <CardFooter className="pt-2 flex justify-between items-center border-t border-slate-800/50 mt-2">
                                <span className="text-[10px] text-slate-600 font-mono font-bold truncate pr-4">
                                    {game.relay?.replace('wss://', '')}
                                </span>
                                <Button size="sm" variant="ghost" className="text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 font-bold px-0 h-auto">
                                    {game.white === pubkey || game.black === pubkey ? 'Resume' : game.black ? 'Watch' : 'Join Match'}
                                    <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
                                </Button>
                            </CardFooter>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
}
