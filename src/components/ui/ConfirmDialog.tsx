'use client';

import { type ReactNode, useCallback, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/Button';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export type ConfirmDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    /** Optional icon or illustration above the title */
    icon?: ReactNode;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void | Promise<void>;
    variant?: 'default' | 'destructive';
    /** Disables actions and shows loading on confirm */
    isLoading?: boolean;
};

export function ConfirmDialog({
    open,
    onOpenChange,
    title,
    icon,
    description,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    onConfirm,
    variant = 'default',
    isLoading = false,
}: ConfirmDialogProps) {
    const titleId = useId();
    const descriptionId = useId();
    const cancelButtonRef = useRef<HTMLButtonElement>(null);

    const handleClose = useCallback(() => {
        if (!isLoading) onOpenChange(false);
    }, [isLoading, onOpenChange]);

    useEffect(() => {
        if (!open) return;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        cancelButtonRef.current?.focus({ preventScroll: true });
        return () => {
            document.body.style.overflow = prevOverflow;
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                handleClose();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [open, handleClose]);

    if (!open || typeof document === 'undefined') return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            role="presentation"
            aria-hidden={!open}
        >
            <button
                type="button"
                className="absolute inset-0 bg-slate-950/75 backdrop-blur-[2px] transition-opacity animate-in fade-in duration-200"
                aria-label="Close dialog"
                onClick={handleClose}
                disabled={isLoading}
            />
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={description ? descriptionId : undefined}
                className={cn(
                    'relative z-[101] w-full max-w-md rounded-2xl border border-slate-700/90 bg-slate-900/95 p-6 shadow-2xl shadow-black/40 backdrop-blur-md',
                    'animate-in fade-in zoom-in duration-200',
                    variant === 'destructive' && 'border-t-rose-500/40 ring-1 ring-rose-500/15'
                )}
                onClick={e => e.stopPropagation()}
            >
                {icon ? (
                    <div className="mb-4 flex justify-center" aria-hidden>
                        {icon}
                    </div>
                ) : null}
                <h2
                    id={titleId}
                    className={cn(
                        'text-lg font-semibold tracking-tight text-white',
                        icon && 'text-center'
                    )}
                >
                    {title}
                </h2>
                {description ? (
                    <p
                        id={descriptionId}
                        className={cn('mt-2 text-sm leading-relaxed text-slate-400', icon && 'text-center')}
                    >
                        {description}
                    </p>
                ) : null}
                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
                    <Button
                        ref={cancelButtonRef}
                        type="button"
                        variant="outline"
                        className="w-full border-slate-600 sm:w-auto"
                        onClick={handleClose}
                        disabled={isLoading}
                    >
                        {cancelLabel}
                    </Button>
                    <Button
                        type="button"
                        variant={variant === 'destructive' ? 'destructive' : 'default'}
                        className={cn(
                            'w-full font-semibold sm:w-auto',
                            variant === 'destructive' && 'bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-900/30'
                        )}
                        onClick={() => void onConfirm()}
                        disabled={isLoading}
                        isLoading={isLoading}
                    >
                        {confirmLabel}
                    </Button>
                </div>
            </div>
        </div>,
        document.body
    );
}
