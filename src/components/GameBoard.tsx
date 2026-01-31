'use client';

import { Chessboard } from 'react-chessboard';
import { useChessGame } from '@/hooks/useChessGame';
import { useNostr } from '@/contexts/NostrContext';
import { PlayerProfile } from '@/components/PlayerProfile';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useEffect, useState, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { Trophy, AlertCircle } from 'lucide-react';
import { User, Trophy as TrophyIcon } from 'lucide-react';

export function GameBoard({ gameId, initialRelay }: { gameId: string, initialRelay?: string }) {
    const { pubkey, login } = useNostr();
    const { gameState, makeMove, resetGame, joinGame } = useChessGame(gameId, initialRelay);
    const [showGameOver, setShowGameOver] = useState(false);

    const isMyTurn = useMemo(() => {
        return (pubkey?.toLowerCase() === gameState.white?.toLowerCase() && gameState.turn === 'w') ||
            (pubkey?.toLowerCase() === gameState.black?.toLowerCase() && gameState.turn === 'b');
    }, [pubkey, gameState.white, gameState.black, gameState.turn]);

    const amIPlaying = useMemo(() => {
        return pubkey?.toLowerCase() === gameState.white?.toLowerCase() ||
            pubkey?.toLowerCase() === gameState.black?.toLowerCase();
    }, [pubkey, gameState.white, gameState.black]);

    useEffect(() => {
        if (gameState.winner) {
            setShowGameOver(true);
            if (gameState.winner !== 'draw') {
                const duration = 3 * 1000;
                const animationEnd = Date.now() + duration;
                const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };
                const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

                const interval: any = setInterval(function () {
                    const timeLeft = animationEnd - Date.now();
                    if (timeLeft <= 0) return clearInterval(interval);
                    const particleCount = 50 * (timeLeft / duration);
                    confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
                    confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
                }, 250);
            }
        } else {
            setShowGameOver(false);
        }
    }, [gameState.winner]);

    const handlePieceDrop = (args: any): boolean => {
        if (gameState.winner) return false;
        if (!isMyTurn) return false;

        const { sourceSquare, targetSquare } = args;
        if (!targetSquare) return false;

        makeMove({
            from: sourceSquare,
            to: targetSquare,
            promotion: 'q',
        });
        return true;
    };

    const winnerText = gameState.winner === 'draw'
        ? "It's a Draw!"
        : `${gameState.winner === 'w' ? 'White' : 'Black'} Wins!`;

    const statusDetail = gameState.status === 'checkmate'
        ? "by Checkmate"
        : gameState.status === 'draw'
            ? "Game Drawn"
            : "";

    return (
        <div className="relative">
            <Card className="max-w-2xl mx-auto overflow-hidden border-slate-800 bg-slate-900/40 backdrop-blur-sm shadow-2xl">
                <CardHeader className="flex flex-row items-center justify-between border-b border-slate-800 pb-4">
                    <div>
                        <CardTitle className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                            Nostr Chess
                        </CardTitle>
                        <p className="text-xs text-slate-500 font-mono flex items-center gap-1.5 mt-1">
                            <span className={`w-2 h-2 rounded-full ${gameState.winner ? 'bg-red-500' : 'bg-green-500 animate-pulse'}`} />
                            {gameState.status.replace('-', ' ')}
                        </p>
                    </div>
                </CardHeader>
                <CardContent className="p-6 bg-slate-950/30">

                    {/* Top Player (Black) */}
                    <div className="relative group/player">
                        <PlayerProfile
                            pubkey={gameState.black}
                            isTurn={gameState.turn === 'b' && !gameState.winner}
                            isWinner={gameState.winner === 'b'}
                            side="black"
                            label="Opponent"
                        />
                        {!amIPlaying && (!gameState.black || gameState.black === 'Player 2') && (
                            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 rounded-xl backdrop-blur-[2px] opacity-100 transition-opacity">
                                <Button
                                    onClick={() => pubkey ? joinGame(gameId, gameState.white, initialRelay) : login()}
                                    size="sm"
                                    className="bg-indigo-600 hover:bg-indigo-500 font-bold shadow-lg shadow-indigo-500/20"
                                >
                                    {pubkey ? 'Join as Black' : 'Login to Join'}
                                </Button>
                            </div>
                        )}
                    </div>

                    <div className="relative w-full max-w-[500px] mx-auto group my-6">
                        <div className={`transition-all duration-700 ${showGameOver ? 'grayscale-[0.5] opacity-40 scale-[0.98]' : ''}`}>
                            <Chessboard
                                options={{
                                    id: "nostr-board",
                                    position: gameState.fen,
                                    onPieceDrop: handlePieceDrop,
                                    boardOrientation: "white",
                                    allowDragging: isMyTurn && !gameState.winner,
                                    showAnimations: true,
                                    animationDurationInMs: 200,
                                    darkSquareStyle: { backgroundColor: '#1e293b' },
                                    lightSquareStyle: { backgroundColor: '#334155' }
                                }}
                            />
                        </div>

                        {showGameOver && (
                            <div className="absolute inset-0 flex items-center justify-center z-10 animate-in fade-in zoom-in duration-500">
                                <div className="bg-slate-900/90 border border-slate-700 p-8 rounded-2xl shadow-2xl text-center backdrop-blur-md max-w-[80%] border-t-indigo-500/50">
                                    <div className="mb-4 inline-flex p-3 rounded-full bg-indigo-500/10 text-indigo-400">
                                        {gameState.winner === 'draw' ? <AlertCircle className="w-10 h-10" /> : <TrophyIcon className="w-10 h-10" />}
                                    </div>
                                    <h2 className="text-3xl font-black text-white mb-1 tracking-tight">
                                        {winnerText}
                                    </h2>
                                    <p className="text-slate-400 mb-8 font-medium">
                                        {statusDetail}
                                    </p>
                                    <Button
                                        size="lg"
                                        onClick={resetGame}
                                        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg shadow-indigo-600/20"
                                    >
                                        Back to Lobby
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Bottom Player (White by default if user is White) */}
                    <PlayerProfile
                        pubkey={gameState.white}
                        isTurn={gameState.turn === 'w' && !gameState.winner}
                        isWinner={gameState.winner === 'w'}
                        side="white"
                        label="White"
                    />

                </CardContent>
            </Card>
        </div>
    );
}
