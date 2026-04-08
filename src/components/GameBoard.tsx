'use client';

import { Chessboard } from 'react-chessboard';
import { useChessGame } from '@/hooks/useChessGame';
import { useNostr } from '@/contexts/NostrContext';
import { PlayerProfile } from '@/components/PlayerProfile';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useEffect, useState, useMemo, useRef, useCallback, type CSSProperties } from 'react';
import type { Square } from 'chess.js';
import type { SquareHandlerArgs } from 'react-chessboard';
import { playMoveSound } from '@/lib/moveSound';
import confetti from 'canvas-confetti';
import { Trophy as TrophyIcon, AlertCircle, Flag } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function GameBoard({ gameId, initialRelay }: { gameId: string, initialRelay?: string }) {
    const router = useRouter();
    const { pubkey, login } = useNostr();
    const { game, gameState, makeMove, joinGame, resign } = useChessGame(gameId, initialRelay);
    const [showGameOver, setShowGameOver] = useState(false);
    const [resignDialogOpen, setResignDialogOpen] = useState(false);
    const [resignLoading, setResignLoading] = useState(false);
    const [moveFrom, setMoveFrom] = useState<Square | null>(null);
    const prevMoveCountRef = useRef<number | null>(null);

    useEffect(() => {
        setMoveFrom(null);
    }, [gameState.fen]);

    const isMyTurn = useMemo(() => {
        return (pubkey?.toLowerCase() === gameState.white?.toLowerCase() && gameState.turn === 'w') ||
            (pubkey?.toLowerCase() === gameState.black?.toLowerCase() && gameState.turn === 'b');
    }, [pubkey, gameState.white, gameState.black, gameState.turn]);

    const amIPlaying = useMemo(() => {
        return pubkey?.toLowerCase() === gameState.white?.toLowerCase() ||
            pubkey?.toLowerCase() === gameState.black?.toLowerCase();
    }, [pubkey, gameState.white, gameState.black]);

    const amIBlack = useMemo(() => pubkey?.toLowerCase() === gameState.black?.toLowerCase(), [pubkey, gameState.black]);
    const boardOrientation = amIBlack ? 'black' : 'white';

    const lastMoveSquareStyles = useMemo(() => {
        const verbose = game.history({ verbose: true });
        if (verbose.length === 0) return {};
        const last = verbose[verbose.length - 1];
        const highlight: CSSProperties = {
            backgroundColor: 'rgba(251, 191, 36, 0.38)',
            boxShadow: 'inset 0 0 0 2px rgba(251, 191, 36, 0.55)',
        };
        return {
            [last.from]: highlight,
            [last.to]: highlight,
        };
    }, [game]);

    const legalMoveSquareStyles = useMemo(() => {
        if (!moveFrom || !isMyTurn || gameState.winner) return {};
        const verboseMoves = game.moves({ square: moveFrom, verbose: true });
        const out: Record<string, CSSProperties> = {};
        for (const m of verboseMoves) {
            const isCapture = Boolean(m.captured);
            out[m.to] = {
                ...out[m.to],
                ...(isCapture
                    ? {
                        boxShadow: 'inset 0 0 0 5px rgba(239, 68, 68, 0.55)',
                    }
                    : {
                        backgroundImage:
                            'radial-gradient(circle at center, rgba(226, 232, 240, 0.62) 15%, rgba(226, 232, 240, 0.16) 24%, transparent 25%)',
                    }),
            };
        }
        out[moveFrom] = {
            ...out[moveFrom],
            backgroundColor: 'rgba(82, 175, 96, 0.38)',
            boxShadow: 'inset 0 0 0 2px rgba(82, 175, 96, 0.65)',
        };
        return out;
    }, [moveFrom, game, isMyTurn, gameState.winner]);

    const mergedSquareStyles = useMemo(() => {
        return { ...lastMoveSquareStyles, ...legalMoveSquareStyles };
    }, [lastMoveSquareStyles, legalMoveSquareStyles]);

    const handleSquareClick = useCallback(
        ({ square }: SquareHandlerArgs) => {
            if (gameState.winner) return;
            if (!isMyTurn) return;

            const sq = square as Square;

            if (moveFrom) {
                const candidates = game.moves({ square: moveFrom, verbose: true }).filter(m => m.to === sq);
                if (candidates.length > 0) {
                    const hasPromotion = candidates.some(m => m.promotion);
                    makeMove({
                        from: moveFrom,
                        to: sq,
                        ...(hasPromotion ? { promotion: 'q' as const } : {}),
                    });
                    setMoveFrom(null);
                    return;
                }
            }

            const piece = game.get(sq);
            if (piece && piece.color === game.turn()) {
                setMoveFrom(prev => (prev === sq ? null : sq));
                return;
            }

            setMoveFrom(null);
        },
        [game, gameState.winner, isMyTurn, moveFrom, makeMove]
    );

    useEffect(() => {
        const n = game.history().length;
        if (prevMoveCountRef.current === null) {
            prevMoveCountRef.current = n;
            return;
        }
        if (n > prevMoveCountRef.current) {
            playMoveSound();
        }
        prevMoveCountRef.current = n;
    }, [game, gameState.fen]);

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
        setMoveFrom(null);
        return true;
    };

    const winnerText = gameState.winner === 'draw'
        ? "It's a Draw!"
        : `${gameState.winner === 'w' ? 'White' : 'Black'} Wins!`;

    const statusDetail = gameState.status === 'checkmate'
        ? "by Checkmate"
        : gameState.status === 'draw'
            ? "Game Drawn"
            : gameState.status === 'resigned'
                ? "by Resignation"
                : "";

    const handleResignClick = () => {
        if (!gameState.winner && amIPlaying) setResignDialogOpen(true);
    };

    const handleConfirmResign = async () => {
        setResignLoading(true);
        try {
            const ok = await resign();
            if (ok) setResignDialogOpen(false);
        } finally {
            setResignLoading(false);
        }
    };

    return (
        <div className="relative">
            <Card className="max-w-2xl mx-auto overflow-hidden border-slate-800 bg-slate-900/40 backdrop-blur-sm shadow-2xl">
                <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-slate-800 pb-4">
                    <div>
                        <CardTitle className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                            Nostr Chess
                        </CardTitle>
                        <p className="text-xs text-slate-500 font-mono flex items-center gap-1.5 mt-1">
                            <span className={`w-2 h-2 rounded-full ${gameState.winner ? 'bg-red-500' : 'bg-green-500 animate-pulse'}`} />
                            {gameState.status.replace('-', ' ')}
                        </p>
                    </div>
                    {amIPlaying && !gameState.winner && gameState.status === 'in-progress' && (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleResignClick}
                            className="shrink-0 border-rose-900/80 text-rose-300 hover:bg-rose-950/80 hover:text-rose-200"
                        >
                            <Flag className="w-4 h-4 mr-1.5" aria-hidden />
                            Resign
                        </Button>
                    )}
                </CardHeader>
                <CardContent className="p-6 bg-slate-950/30">

                    {/* Top: opponent */}
                    {amIBlack ? (
                        <div className="relative group/player">
                            <PlayerProfile
                                pubkey={gameState.white}
                                isTurn={gameState.turn === 'w' && !gameState.winner}
                                isWinner={gameState.winner === 'w'}
                                side="white"
                                label={amIPlaying ? 'Opponent' : 'White'}
                            />
                        </div>
                    ) : (
                        <div className="relative group/player">
                            <PlayerProfile
                                pubkey={gameState.black}
                                isTurn={gameState.turn === 'b' && !gameState.winner}
                                isWinner={gameState.winner === 'b'}
                                side="black"
                                label={amIPlaying ? 'Opponent' : 'Black'}
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
                    )}

                    <div className="relative w-full max-w-[500px] mx-auto group my-6">
                        <div className={`transition-all duration-700 ${showGameOver ? 'grayscale-[0.5] opacity-40 scale-[0.98]' : ''}`}>
                            <Chessboard
                                options={{
                                    id: "nostr-board",
                                    position: gameState.fen,
                                    onPieceDrop: handlePieceDrop,
                                    onSquareClick: handleSquareClick,
                                    boardOrientation,
                                    allowDragging: isMyTurn && !gameState.winner,
                                    showAnimations: true,
                                    animationDurationInMs: 200,
                                    darkSquareStyle: { backgroundColor: '#1e293b' },
                                    lightSquareStyle: { backgroundColor: '#334155' },
                                    squareStyles: mergedSquareStyles,
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
                                        onClick={() => router.push('/')}
                                        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg shadow-indigo-600/20"
                                    >
                                        Back to Lobby
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Bottom: current user (or white when spectating) */}
                    {amIBlack ? (
                        <PlayerProfile
                            pubkey={gameState.black}
                            isTurn={gameState.turn === 'b' && !gameState.winner}
                            isWinner={gameState.winner === 'b'}
                            side="black"
                            label={amIPlaying ? 'You' : 'Black'}
                        />
                    ) : (
                        <PlayerProfile
                            pubkey={gameState.white}
                            isTurn={gameState.turn === 'w' && !gameState.winner}
                            isWinner={gameState.winner === 'w'}
                            side="white"
                            label={amIPlaying ? 'You' : 'White'}
                        />
                    )}

                </CardContent>
            </Card>

            <ConfirmDialog
                open={resignDialogOpen}
                onOpenChange={setResignDialogOpen}
                icon={
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/15 ring-1 ring-rose-500/25">
                        <Flag className="h-7 w-7 text-rose-400" strokeWidth={2} aria-hidden />
                    </div>
                }
                title="Resign this game?"
                description="Your opponent wins and the result is sent to the relay. This cannot be undone."
                confirmLabel="Yes, resign"
                cancelLabel="Keep playing"
                variant="destructive"
                isLoading={resignLoading}
                onConfirm={handleConfirmResign}
            />
        </div>
    );
}
