'use client';

import { useProfile } from '@/hooks/useProfile';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { User, Trophy, Hash, Zap } from 'lucide-react';

export function ProfileCard({ pubkey }: { pubkey: string }) {
    const { profile, isLoading } = useProfile(pubkey);

    if (isLoading) {
        return <div className="h-32 bg-slate-900/50 animate-pulse rounded-xl border border-slate-800" />;
    }

    if (!profile) return null;

    return (
        <Card className="overflow-hidden border-indigo-500/20">
            <div className="h-2 bg-gradient-to-r from-indigo-600 to-purple-600" />
            <CardHeader className="flex flex-row items-center gap-4 pb-2">
                {profile.picture ? (
                    <img src={profile.picture} alt={profile.name} className="w-12 h-12 rounded-full border-2 border-slate-800" />
                ) : (
                    <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center border-2 border-slate-800">
                        <User className="w-6 h-6 text-slate-400" />
                    </div>
                )}
                <div>
                    <CardTitle className="text-lg">{profile.name}</CardTitle>
                    <div className="flex gap-2 items-center">
                        <Badge variant="outline" className="text-[10px] font-mono">
                            {pubkey.slice(0, 8)}...
                        </Badge>
                        <div className="flex items-center gap-1 text-amber-400 text-sm font-bold">
                            <Trophy className="w-3 h-3" />
                            {profile.elo}
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-2 pt-2">
                <div className="bg-slate-950/50 p-2 rounded-lg text-center">
                    <div className="text-[10px] text-slate-500 uppercase">Games</div>
                    <div className="text-sm font-bold">{profile.gamesPlayed}</div>
                </div>
                <div className="bg-slate-950/50 p-2 rounded-lg text-center">
                    <div className="text-[10px] text-emerald-500 uppercase">Wins</div>
                    <div className="text-sm font-bold text-emerald-400">{profile.wins}</div>
                </div>
                <div className="bg-slate-950/50 p-2 rounded-lg text-center">
                    <div className="text-[10px] text-red-500 uppercase">Losses</div>
                    <div className="text-sm font-bold text-red-400">{profile.losses}</div>
                </div>
            </CardContent>
        </Card>
    );
}
