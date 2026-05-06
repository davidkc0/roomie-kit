
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, Home, User } from 'lucide-react';

export default function BottomNav() {
    const navigate = useNavigate();
    const location = useLocation();

    // Helper to check active state
    const isActive = (path: string) => location.pathname === path;

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 px-6 pb-6 pt-2 pointer-events-none">
            <div className="mx-auto max-w-md bg-bg-elevated/90 backdrop-blur-xl border border-border rounded-full shadow-2xl flex justify-between items-center px-8 py-4 pointer-events-auto">
                <button
                    onClick={() => navigate('/search')}
                    className={`p-2 rounded-full transition ${isActive('/search') ? 'text-white bg-white/10' : 'text-text-tertiary hover:text-white'}`}
                >
                    <Search className="w-6 h-6" />
                </button>

                <button
                    onClick={() => navigate('/')}
                    className={`p-3 rounded-full transition ${isActive('/') ? 'text-white bg-white/10' : 'text-text-tertiary hover:text-white'}`}
                >
                    <Home className="w-7 h-7" />
                </button>

                <button
                    onClick={() => navigate('/profile')}
                    className={`p-2 rounded-full transition ${isActive('/profile') ? 'text-white bg-white/10' : 'text-text-tertiary hover:text-white'}`}
                >
                    <User className="w-6 h-6" />
                </button>
            </div>
        </div>
    );
}
