interface LoadingSpinnerProps {
    size?: 'lg' | 'md';
    className?: string;
}

const sizeClasses = {
    lg: 'h-16 w-16 border-4',
    md: 'h-8 w-8 border-2',
};

export function LoadingSpinner({ size = 'lg', className = '' }: LoadingSpinnerProps) {
    return (
        <div
            aria-label="Loading"
            role="status"
            className={`${sizeClasses[size]} rounded-full border-slate-700 border-t-violet-400 animate-spin ${className}`}
        />
    );
}
