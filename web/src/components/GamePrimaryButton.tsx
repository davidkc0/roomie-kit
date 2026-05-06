import React from 'react';

interface GamePrimaryButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    children: React.ReactNode;
}

export function GamePrimaryButton({ children, className = '', ...props }: GamePrimaryButtonProps) {
    return (
        <button
            type="button"
            className={`
                relative flex items-center justify-center gap-2
                px-8 py-4 rounded-2xl whitespace-nowrap
                bg-white text-slate-900 font-black text-lg tracking-wide
                border-b-4 border-slate-200
                hover:bg-slate-50 transition-all
                active:border-b-0 active:translate-y-1 active:mt-1
                shadow-lg shadow-black/10
                ${className}
            `}
            {...props}
        >
            {children}
        </button>
    );
}
