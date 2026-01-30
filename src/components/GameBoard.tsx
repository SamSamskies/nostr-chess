'use client';

import { Chessboard } from 'react-chessboard';
import { useChessGame, GameState } from '@/hooks/useChessGame';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from './ui/Badge';
import { useNostr } from '@/contexts/NostrContext';

const ChessboardAny = Chessboard as any;

export function GameBoard({ gameId, relay }: { gameId: string, relay?: string }) {
    const { game, gameState, makeMove } = useChessGame(gameId, relay);
    const { pubkey } = useNostr();

    if (!gameState) {
        return <div className="animate-pulse">Loading game...</div>;
    }

    const onDrop = (sourceSquare: string, targetSquare: string): boolean => {
        makeMove({
            from: sourceSquare,
            to: targetSquare,
            promotion: 'q',
        });
        return true; // react-chessboard expects a boolean for if the move was attempted
    };

    const isMyTurn = (gameState.turn === 'w' && pubkey === gameState.white) ||
        (gameState.turn === 'b' && pubkey === gameState.black);

    const statusColor = gameState.status === 'in-progress' ? 'bg-green-500' : 'bg-slate-500';

    return (
        <Card className="max-w-2xl mx-auto overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-800 pb-4">
                <div>
                    <CardTitle className="text-lg">Game #{gameId.slice(0, 8)}</CardTitle>
                    <div className="flex gap-2 mt-1">
                        <span className="text-xs text-slate-400 font-mono">White: {gameState.white.slice(0, 8)}...</span>
                        <span className="text-xs text-slate-400 font-mono">Black: {gameState.black?.slice(0, 8) || 'Waiting...'}...</span>
                    </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                    <div className={`px-2 py-1 rounded text-[10px] uppercase font-bold text-white ${statusColor}`}>
                        {gameState.status.replace('-', ' ')}
                    </div>
                    {gameState.status === 'in-progress' && (
                        <div className={`text-sm font-semibold ${isMyTurn ? 'text-indigo-400 animate-pulse' : 'text-slate-500'}`}>
                            {isMyTurn ? "Your Turn" : "Opponent's Turn"}
                        </div>
                    )}
                </div>
            </CardHeader>
            <CardContent className="p-0 sm:p-6 bg-slate-950/50">
                <div className="aspect-square w-full max-w-[500px] mx-auto">
                    <ChessboardAny
                        position={gameState.fen}
                        onPieceDrop={onDrop as any}
                        boardOrientation={pubkey === gameState.black ? 'black' : 'white'}
                        customDarkSquareStyle={{ backgroundColor: '#1e293b' }}
                        customLightSquareStyle={{ backgroundColor: '#334155' }}
                        animationDuration={300}
                    />
                </div>
            </CardContent>
        </Card>
    );
}
