'use client';

import { useState } from 'react';
import { Lobby } from '@/components/Lobby';
import { GameBoard } from '@/components/GameBoard';
import { Button } from '@/components/ui/Button';
import { ChevronLeft } from 'lucide-react';
import { useNostr } from '@/contexts/NostrContext';

export default function Home() {
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const { pubkey } = useNostr();

  return (
    <div className="container mx-auto py-8">
      {selectedGameId ? (
        <div className="space-y-4">
          <div className="flex items-center gap-4 max-w-2xl mx-auto px-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedGameId(null)}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back to Lobby
            </Button>
            <h2 className="text-xl font-bold">Game Session</h2>
          </div>
          <GameBoard gameId={selectedGameId} />
        </div>
      ) : (
        <Lobby onSelectGame={setSelectedGameId} />
      )}
    </div>
  );
}
