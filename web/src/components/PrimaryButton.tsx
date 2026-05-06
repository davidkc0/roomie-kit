import React from 'react';

interface PrimaryButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    children: React.ReactNode;
}

export function PrimaryButton({ children, className = '', ...props }: PrimaryButtonProps) {
    return (
        <button
            style={{
                background: 'radial-gradient(100% 100% at 30% 10%, rgba(0, 201, 255, 0.3) 0%, rgba(152, 14, 255, 0.05) 100%), #301E5C',
                boxShadow: 'inset 0 0 60px rgba(84, 46, 255, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.3)'
            }}
            className={`
        relative px-6 py-3 
        rounded-xl
        text-white font-semibold
        overflow-hidden
        transition-all duration-200
        hover:bg-[#2B1E53]/90
        active:scale-95
        before:absolute before:inset-0 
        before:rounded-xl before:p-[2px]
        before:bg-gradient-to-br before:from-primary before:to-secondary
        before:-z-10
        before:[mask:linear-gradient(#fff_0_0)_content-box,linear-gradient(#fff_0_0)]
        before:[mask-composite:exclude]
        before:pointer-events-none
        disabled:opacity-50 disabled:cursor-not-allowed
        ${className}
      `}
            {...props}
        >
            <span className="relative z-10 flex items-center justify-center gap-2">{children}</span>
        </button>
    );
}
