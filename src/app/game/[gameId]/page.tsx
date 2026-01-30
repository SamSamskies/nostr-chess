'use client';

import { useSearchParams, useParams } from 'next/navigation';
import { GameBoard } from '@/components/GameBoard';
import { Button } from '@/components/ui/Button';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';

export default function GamePage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const gameId = params.gameId as string;
    const relay = searchParams.get('relay') || undefined;

    return (
        <div className="container mx-auto py-8 space-y-4">
            <div className="flex items-center gap-4 max-w-2xl mx-auto px-4">
                <Link href="/">
                    <Button variant="ghost" size="sm">
                        <ChevronLeft className="w-4 h-4 mr-1" />
                        Back to Lobby
                    </Button>
                </Link>
                <h2 className="text-xl font-bold">Game Session</h2>
            </div>
            <GameBoard gameId={gameId} relay={relay} />
        </div>
    );
}
