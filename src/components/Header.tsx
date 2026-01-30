'use client';

import { useNostr } from '@/contexts/NostrContext';
import { useProfile } from '@/hooks/useProfile';
import { Button } from '@/components/ui/Button';
import { LogIn, LogOut, Swords } from 'lucide-react';

export function Header() {
    const { pubkey, login, logout, isLoading } = useNostr();
    const { profile } = useProfile(pubkey);

    return (
        <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
            <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-xl text-indigo-400">
                    <Swords className="w-6 h-6" />
                    <span>Nostr Chess</span>
                </div>

                <div>
                    {pubkey ? (
                        <div className="flex items-center gap-4">
                            {profile && (
                                <div className="hidden sm:flex items-center gap-2 bg-slate-800 px-3 py-1 rounded-full border border-slate-700">
                                    <span className="text-xs font-bold text-amber-400">{profile.elo}</span>
                                    <div className="w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center text-[10px] text-white overflow-hidden">
                                        {profile.picture ? (
                                            <img src={profile.picture} alt={profile.name || 'User'} className="w-full h-full object-cover" />
                                        ) : (
                                            (profile.name?.[0] || '?').toUpperCase()
                                        )}
                                    </div>
                                </div>
                            )}
                            <span className="text-sm text-slate-400 font-mono hidden md:inline">
                                {pubkey.slice(0, 8)}...{pubkey.slice(-8)}
                            </span>
                            <Button variant="outline" size="sm" onClick={logout}>
                                <LogOut className="w-4 h-4 mr-2" />
                                Logout
                            </Button>
                        </div>
                    ) : (
                        <Button size="sm" onClick={login} isLoading={isLoading}>
                            <LogIn className="w-4 h-4 mr-2" />
                            Login with Nostr
                        </Button>
                    )}
                </div>
            </div>
        </header>
    );
}
