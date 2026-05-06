import { useEffect, useState } from 'react';

interface SplashScreenProps {
    onComplete: () => void;
}

export function SplashScreen({ onComplete }: SplashScreenProps) {
    const [fadingOut, setFadingOut] = useState(false);

    useEffect(() => {
        const splashTimer = window.setTimeout(() => {
            setFadingOut(true);
            window.setTimeout(() => {
                onComplete();
            }, 400);
        }, 900);

        return () => {
            window.clearTimeout(splashTimer);
        };
    }, [onComplete]);

    return (
        <div
            className={`fixed inset-0 z-[9999] flex items-center justify-center transition-opacity duration-400 ${fadingOut ? 'opacity-0' : 'opacity-100'
                }`}
            style={{ backgroundColor: '#0A0A12' }}
        >
            <div className="relative h-20 w-20">
                <div className="absolute inset-0 rounded-full border border-violet-400/25" />
                <div className="absolute inset-2 rounded-full border-4 border-slate-700 border-t-violet-400 animate-spin" />
                <div className="absolute inset-7 rounded-full bg-violet-300/80 shadow-[0_0_24px_rgba(167,139,250,0.5)]" />
            </div>
        </div>
    );
}
