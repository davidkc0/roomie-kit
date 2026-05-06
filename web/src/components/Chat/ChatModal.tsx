import { useEffect, useRef, useState } from 'react';
import { useKeyboardAdjust } from '../../hooks/useKeyboardAdjust';

export type ChatMessage = {
    id: string;
    senderId: string;
    senderName: string;
    text: string;
    timestamp: number;
};

type ChatModalProps = {
    isOpen: boolean;
    onClose: () => void;
    messages: ChatMessage[];
    onSendMessage: (text: string) => void;
    currentUserId: string;
};

export function ChatModal({ isOpen, onClose, messages, onSendMessage, currentUserId }: ChatModalProps) {
    const [inputText, setInputText] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Use keyboard adjust hook for mobile
    const containerRef = useRef<HTMLDivElement>(null);
    useKeyboardAdjust(containerRef);

    // Auto-scroll to bottom
    useEffect(() => {
        if (isOpen) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isOpen]);

    // Focus input on open
    useEffect(() => {
        if (isOpen) {
            // Small delay to allow animation/render
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    const handleSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!inputText.trim()) return;

        onSendMessage(inputText);
        setInputText('');

        // Keep focus
        inputRef.current?.focus();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end pointer-events-none" style={{ touchAction: 'none' }}>
            {/* Backdrop (Tappable to close) */}
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity pointer-events-auto"
                onClick={onClose}
            />

            {/* Modal Container */}
            <div
                ref={containerRef}
                className="relative w-full max-w-lg mx-auto bg-bg-surface border-t border-border shadow-2xl rounded-t-3xl flex flex-col pointer-events-auto h-[60vh] max-h-[80vh] animate-in slide-in-from-bottom duration-300"
            >
                {/* Handle Bar */}
                <div className="flex justify-center pt-3 pb-1" onClick={onClose} >
                    <div className="w-12 h-1.5 bg-slate-600 rounded-full" />
                </div>

                {/* Messages List */}
                <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3 overscroll-contain">
                    <div className="text-center text-slate-500 text-xs py-4">
                        Welcome to the chat! 👋
                    </div>

                    {messages.map((msg) => {
                        const isMe = msg.senderId === currentUserId;
                        return (
                            <div
                                key={msg.id}
                                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                            >
                                <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm break-words shadow-sm ${isMe
                                    ? 'bg-brand-primary text-white rounded-br-none'
                                    : 'bg-slate-800 text-slate-100 border border-slate-700 rounded-bl-none'
                                    }`}
                                >
                                    {!isMe && <div className="text-[10px] text-slate-400 font-bold mb-0.5">{msg.senderName}</div>}
                                    {msg.text}
                                </div>
                            </div>
                        );
                    })}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <form
                    onSubmit={handleSubmit}
                    className="p-3 border-t border-slate-800 bg-slate-900/90 pb-[max(1rem,env(safe-area-inset-bottom))]"
                >
                    <div className="flex gap-2">
                        <input
                            ref={inputRef}
                            type="text"
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            placeholder="Say something..."
                            className="flex-1 bg-slate-800 border border-slate-700 text-white rounded-full px-4 py-3 outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-all placeholder:text-slate-500"
                            maxLength={140}
                        />
                        <div className="flex flex-col justify-end">
                            <button
                                type="submit"
                                disabled={!inputText.trim()}
                                className="bg-brand-primary p-3 rounded-full text-white disabled:opacity-50 disabled:grayscale transition-all active:scale-95 shadow-lg"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                    <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
