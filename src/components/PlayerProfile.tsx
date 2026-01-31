'use client';

import { useProfile } from '@/hooks/useProfile';
import { User, Trophy } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

interface PlayerProfileProps {
    pubkey?: string | null;
    isTurn?: boolean;
    isWinner?: boolean;
    side: 'white' | 'black';
    label?: string;
}

export function PlayerProfile({ pubkey, isTurn, isWinner, side, label }: PlayerProfileProps) {
    const { profile, isLoading } = useProfile(pubkey);

    const displayName = profile?.name || (pubkey ? `${pubkey.slice(0, 8)}...` : label || 'Searching...');
    const avatar = profile?.picture;
    const elo = profile?.elo;

    return (
        <div className={`flex items-center gap-3 p-3 rounded-xl transition-all duration-500 ${isTurn
                ? 'bg-indigo-500/10 border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.1)]'
                : 'bg-transparent border border-transparent opacity-80'
            } ${isWinner ? 'animate-bounce ring-2 ring-yellow-500/50' : ''}`}>

            {/* Avatar Container */}
            <div className="relative">
                <div className={`w-12 h-12 rounded-full overflow-hidden border-2 flex items-center justify-center transition-all duration-500 ${isTurn ? 'border-indigo-500 shadow-lg' : 'border-slate-800'
                    } bg-slate-900`}>
                    {avatar ? (
                        <img src={avatar} alt={displayName} className="w-full h-full object-cover" />
                    ) : (
                        <User className={`w-6 h-6 ${isTurn ? 'text-indigo-400' : 'text-slate-500'}`} />
                    )}
                </div>

                {/* Turn Status Dot */}
                {!isWinner && (
                    <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-slate-950 flex items-center justify-center transition-opacity duration-300 ${isTurn ? 'opacity-100' : 'opacity-0'}`}>
                        <div className="w-full h-full bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                    </div>
                )}

                {/* Winner Crown/Trophy icon placeholder if needed */}
                {isWinner && (
                    <div className="absolute -top-2 -right-2 bg-yellow-500 text-slate-950 font-bold p-1 rounded-full shadow-lg">
                        <Trophy className="w-3 h-3" />
                    </div>
                )}
            </div>

            {/* Info */}
            <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2">
                    <span className={`font-bold truncate text-base tracking-tight ${isTurn ? 'text-white' : 'text-slate-400'}`}>
                        {displayName}
                    </span>
                    {isTurn && !isWinner && (
                        <span className="text-[9px] uppercase font-black tracking-widest text-indigo-400 bg-indigo-510 px-1.5 py-0.5 rounded leading-none">
                            Moving
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] font-mono text-slate-500 uppercase">
                        {side}
                    </span>
                    {elo !== undefined && (
                        <div className="flex items-center gap-1 text-[10px] bg-slate-800/50 px-1.5 py-0.5 rounded text-slate-300 border border-slate-700/50">
                            <Trophy className="w-2.5 h-2.5 text-indigo-400" />
                            <span className="font-bold">{Math.round(elo)}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// Compact version for Lobby
export function PlayerAvatar({ pubkey, size = 'md' }: { pubkey: string, size?: 'sm' | 'md' | 'lg' }) {
    const { profile } = useProfile(pubkey);
    const sizeMap = {
        sm: 'w-6 h-6',
        md: 'w-8 h-8',
        lg: 'w-12 h-12'
    };

    return (
        <div className={`${sizeMap[size]} rounded-full overflow-hidden border border-slate-700 bg-slate-900 group-hover:border-indigo-500/50 transition-colors flex items-center justify-center`}>
            {profile?.picture ? (
                <img src={profile.picture} alt={profile.name} className="w-full h-full object-cover" />
            ) : (
                <User className="w-1/2 h-1/2 text-slate-500" />
            )}
        </div>
    );
}
