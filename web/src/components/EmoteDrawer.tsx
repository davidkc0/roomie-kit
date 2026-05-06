import { useState } from 'react';
import { R2_PATHS } from '../config/r2';

type Emote = {
    id: string;
    src: string;
    label: string;
};

const REACTIONS: Emote[] = [
    { id: 'angry', src: `${R2_PATHS.emotes}/angry.png`, label: 'Angry' },
    { id: 'cool', src: `${R2_PATHS.emotes}/cool.png`, label: 'Cool' },
    { id: 'crying', src: `${R2_PATHS.emotes}/crying.png`, label: 'Crying' },
    { id: 'evil', src: `${R2_PATHS.emotes}/evil.png`, label: 'Evil' },
    { id: 'gross', src: `${R2_PATHS.emotes}/gross.png`, label: 'Gross' },
    { id: 'laugh', src: `${R2_PATHS.emotes}/laugh.png`, label: 'Laugh' },
    { id: 'sad', src: `${R2_PATHS.emotes}/sad.png`, label: 'Sad' },
];

const BODY_EMOTES: Emote[] = [
    { id: 'Dance', src: '', label: 'Dance' },
    { id: 'Wave', src: '', label: 'Wave' },
    { id: 'ThumbsUp', src: '', label: 'Thumbs Up' },
    { id: 'ThumbsDown', src: '', label: 'Thumbs Down' },
];

// Using Emoji for Body Emotes visual since we don't have PNGs yet
const BODY_EMOTE_ICONS: Record<string, string> = {
    'Dance': '💃',
    'Wave': '👋',
    'ThumbsUp': '👍',
    'ThumbsDown': '👎'
};

type EmoteDrawerProps = {
    isOpen: boolean;
    onClose: () => void;
    onSelectEmote: (emoteType: string) => void;
    onSelectBodyEmote: (animName: string) => void;
};

export function EmoteDrawer({ isOpen, onClose, onSelectEmote, onSelectBodyEmote }: EmoteDrawerProps) {
    const [activeTab, setActiveTab] = useState<'reactions' | 'emotes'>('reactions');

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50 z-40"
                onClick={onClose}
            />

            {/* Drawer */}
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900 border-t border-slate-700 p-6 rounded-t-2xl animate-in slide-in-from-bottom duration-200">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-white font-bold text-lg">Express Yourself</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex bg-slate-800 rounded-lg p-1 mb-6">
                    <button
                        className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${activeTab === 'reactions' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                        onClick={() => setActiveTab('reactions')}
                    >
                        Reactions
                    </button>
                    <button
                        className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${activeTab === 'emotes' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                        onClick={() => setActiveTab('emotes')}
                    >
                        Emotes
                    </button>
                </div>

                {/* Content */}
                <div className="grid grid-cols-4 gap-4 max-h-[40vh] overflow-y-auto">
                    {activeTab === 'reactions' ? (
                        REACTIONS.map((emote) => (
                            <button
                                key={emote.id}
                                onClick={() => {
                                    onSelectEmote(emote.id);
                                    onClose();
                                }}
                                className="flex flex-col items-center gap-2 group"
                            >
                                <div className="w-16 h-16 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden transition-transform group-hover:scale-110 group-active:scale-95">
                                    <img
                                        src={emote.src}
                                        alt={emote.label}
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                                <span className="text-xs text-slate-400 group-hover:text-white font-medium">{emote.label}</span>
                            </button>
                        ))
                    ) : (
                        BODY_EMOTES.map((emote) => (
                            <button
                                key={emote.id}
                                onClick={() => {
                                    onSelectBodyEmote(emote.id);
                                    onClose();
                                }}
                                className="flex flex-col items-center gap-2 group"
                            >
                                <div className="w-16 h-16 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden transition-transform group-hover:scale-110 group-active:scale-95 text-3xl">
                                    {BODY_EMOTE_ICONS[emote.id]}
                                </div>
                                <span className="text-xs text-slate-400 group-hover:text-white font-medium">{emote.label}</span>
                            </button>
                        ))
                    )}
                </div>
            </div>
        </>
    );
}
