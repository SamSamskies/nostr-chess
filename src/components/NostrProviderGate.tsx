'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';

/** Client-only: NostrProvider reads localStorage on first paint without SSR/hydration mismatch. */
const NostrProvider = dynamic(
    () => import('@/contexts/NostrContext').then((m) => m.NostrProvider),
    { ssr: false }
);

export function NostrProviderGate({ children }: { children: ReactNode }) {
    return <NostrProvider>{children}</NostrProvider>;
}
