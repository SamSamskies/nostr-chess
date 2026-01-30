import { HTMLAttributes, forwardRef } from 'react';
import { VariantProps, cva } from 'class-variance-authority';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

const badgeVariants = cva(
    'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
    {
        variants: {
            variant: {
                default: 'border-transparent bg-indigo-600 text-white hover:bg-indigo-700',
                secondary: 'border-transparent bg-slate-800 text-slate-100 hover:bg-slate-700',
                destructive: 'border-transparent bg-red-500 text-white hover:bg-red-600',
                outline: 'text-slate-200 border-slate-700',
                success: 'border-transparent bg-emerald-500 text-white',
                warning: 'border-transparent bg-amber-500 text-white',
            },
        },
        defaultVariants: {
            variant: 'default',
        },
    }
);

export interface BadgeProps
    extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> { }

const Badge = forwardRef<HTMLDivElement, BadgeProps>(
    ({ className, variant, ...props }, ref) => {
        return (
            <div
                ref={ref}
                className={cn(badgeVariants({ variant }), className)}
                {...props}
            />
        );
    }
);
Badge.displayName = 'Badge';

export { Badge, badgeVariants };
