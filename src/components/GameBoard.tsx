'use client';

import { useEffect } from 'react';
import { Chessboard } from 'react-chessboard';
import { useChessGame, GameState } from '@/hooks/useChessGame';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from './ui/Badge';
import { Button } from '@/components/ui/Button';
import { useNostr } from '@/contexts/NostrContext';

const ChessboardAny = Chessboard as any;

export function GameBoard({ gameId, relay }: { gameId: string, relay?: string }) {
    const { pubkey, login, addRelay } = useNostr();
    const { game, gameState, makeMove, joinGame } = useChessGame(gameId, relay);

    // Ensure we are connected to the relay in the URL
    useEffect(() => {
        if (relay) {
            addRelay(relay);
        }
    }, [relay, addRelay]);

    if (!gameState) {
        return (
            <div className="flex flex-col items-center justify-center p-12 space-y-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
                <div className="text-slate-400">Fetching game state from Nostr...</div>
            </div>
        );
    }

    const onDrop = (sourceSquare: string, targetSquare: string): boolean => {
        if (!pubkey) return false;
        makeMove({
            from: sourceSquare,
            to: targetSquare,
            promotion: 'q',
        });
        return true;
    };

    const isWhite = pubkey === gameState.white;
    const isBlack = pubkey === gameState.black;
    const isPlayer = isWhite || isBlack;
    const isMyTurn = (gameState.turn === 'w' && isWhite) || (gameState.turn === 'b' && isBlack);

    const canJoin = !isPlayer && gameState.status === 'awaiting-player';

    const handleJoin = async () => {
        if (!pubkey) {
            await login();
            return;
        }
        await joinGame(gameState.id, gameState.white, relay);
    };

    const statusColor = gameState.status === 'in-progress' ? 'bg-green-500' : 'bg-slate-500';

    return (
        <Card className="max-w-2xl mx-auto overflow-hidden border-slate-800 bg-slate-900/40">
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-800 pb-4">
                <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                        Game #{gameId.slice(0, 8)}
                        {relay && (
                            <span className="text-[10px] font-mono text-slate-500 px-1.5 py-0.5 bg-slate-800 rounded">
                                {relay.replace('wss://', '')}
                            </span>
                        )}
                    </CardTitle>
                    <div className="flex gap-2 mt-1">
                        <span className="text-xs text-slate-400 font-mono">White: {gameState.white.slice(0, 8)}...</span>
                        {gameState.black && (
                            <span className="text-xs text-slate-400 font-mono">Black: {gameState.black.slice(0, 8)}...</span>
                        )}
                    </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2">
                        {canJoin && (
                            <Button size="sm" onClick={handleJoin} className="h-8 shadow-lg shadow-indigo-500/20">
                                {pubkey ? 'Join as Black' : 'Login to Join'}
                            </Button>
                        )}
                        <div className={`px-2 py-1 rounded text-[10px] uppercase font-bold text-white ${statusColor}`}>
                            {gameState.status.replace('-', ' ')}
                        </div>
                    </div>
                    {gameState.status === 'in-progress' && (
                        <div className={`text-sm font-semibold ${isMyTurn ? 'text-indigo-400 animate-pulse' : 'text-slate-400'}`}>
                            {isPlayer ? (isMyTurn ? "Your Turn" : "Opponent's Turn") : `${gameState.turn === 'w' ? 'White' : 'Black'}'s Turn`}
                        </div>
                    )}
                </div>
            </CardHeader>
            <CardContent className="p-0 sm:p-6 bg-slate-950/50">
                <div className="aspect-square w-full max-w-[500px] mx-auto">
                    <ChessboardAny
                        position={gameState.fen}
                        onPieceDrop={onDrop as any}
                        boardOrientation={isBlack ? 'black' : 'white'}
                        customDarkSquareStyle={{ backgroundColor: '#1e293b' }}
                        customLightSquareStyle={{ backgroundColor: '#334155' }}
                        animationDuration={300}
                        arePiecesDraggable={isMyTurn}
                    />
                </div>
            </CardContent>
        </Card>
    );
}
