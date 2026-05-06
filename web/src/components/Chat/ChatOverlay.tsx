import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAuthStore } from '../../state/authStore';
import { useStreamingStore } from '../../state/streamingStore';
import { getMyId, registerRpc, callRpc } from '../../multiplayer/playroom';
import { Keyboard } from '@capacitor/keyboard';
import { Capacitor } from '@capacitor/core';
import { ReportModal } from '../ReportModal';
import { useBlockedUsers } from '../../hooks/useBlockedUsers';

type ChatMessage = {
    id: string;
    senderId: string;
    senderName: string;
    avatarUrl?: string;
    text: string;
    timestamp: number;
    expiresAt?: number; // For auto-fade in streaming mode
};

interface ChatOverlayProps {
    onOpenChange?: (isOpen: boolean) => void;
    showInputField?: boolean; // If true, shows TikTok-style inline chat
}

const VISIBLE_MESSAGE_DURATION = 4000; // 4 seconds before fade (faster)
const MAX_VISIBLE_MESSAGES = 4;

export function ChatOverlay({ onOpenChange, showInputField = false }: ChatOverlayProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [visibleMessages, setVisibleMessages] = useState<ChatMessage[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [inputText, setInputText] = useState('');
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const [longPressTarget, setLongPressTarget] = useState<ChatMessage | null>(null);
    const [showReportModal, setShowReportModal] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const { blockUser, isBlocked } = useBlockedUsers();

    // Notify parent when open state changes
    useEffect(() => {
        onOpenChange?.(isOpen);
    }, [isOpen, onOpenChange]);

    // Keyboard height handling for native platforms
    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;

        const showHandle = Keyboard.addListener('keyboardWillShow', info => {
            setKeyboardHeight(info.keyboardHeight);
        });

        const hideHandle = Keyboard.addListener('keyboardWillHide', () => {
            setKeyboardHeight(0);
        });

        return () => {
            showHandle.then(h => h.remove());
            hideHandle.then(h => h.remove());
        };
    }, []);

    // Register RPC - Encapsulated here to prevent Room re-renders
    useEffect(() => {
        registerRpc('chat', (data: any, sender: any) => {
            const now = Date.now();
            const msg: ChatMessage = {
                id: Math.random().toString(36).substring(7),
                senderId: sender.id,
                senderName: (data.senderName as string) || 'Unknown',
                avatarUrl: (data.avatarUrl as string) || undefined,
                text: (data.text as string) || '',
                timestamp: now,
                expiresAt: now + VISIBLE_MESSAGE_DURATION,
            };

            // Add to all messages
            setMessages((prev) => [...prev, msg].slice(-50));

            // Add to visible messages (for TikTok-style display)
            setVisibleMessages((prev) => [...prev, msg].slice(-MAX_VISIBLE_MESSAGES));

            // Update unread count if closed
            setIsOpen(currentIsOpen => {
                if (!currentIsOpen) {
                    setUnreadCount(c => c + 1);
                }
                return currentIsOpen;
            });
        });
    }, []);

    // Auto-cleanup expired visible messages (TikTok-style fade)
    useEffect(() => {
        if (!showInputField) return;

        const interval = setInterval(() => {
            const now = Date.now();
            setVisibleMessages(prev =>
                prev.filter(msg => msg.expiresAt && msg.expiresAt > now)
            );
        }, 500); // Check every 500ms

        return () => clearInterval(interval);
    }, [showInputField]);

    // Auto-scroll when new messages or keyboard changes
    useEffect(() => {
        if (isOpen) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isOpen, keyboardHeight]);

    // Reset unread on open
    useEffect(() => {
        if (isOpen) {
            setUnreadCount(0);
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    const handleSendMessage = useCallback(async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!inputText.trim()) return;

        const myId = getMyId() || 'anon';
        const authState = useAuthStore.getState();
        const name = authState.profile?.username || authState.user?.email?.split('@')[0] || `User ${myId.substring(0, 4)}`;
        const avatarUrl = authState.profile?.profile_image_url || authState.profile?.avatar_headshot_url;

        await callRpc('chat', { text: inputText, senderName: name, avatarUrl });
        setInputText('');
        inputRef.current?.focus();
    }, [inputText]);

    const toggleChat = () => setIsOpen(v => !v);

    // Calculate opacity based on time remaining (for fade effect)
    const getMessageOpacity = (msg: ChatMessage) => {
        if (!msg.expiresAt) return 1;
        const now = Date.now();
        const remaining = msg.expiresAt - now;
        const fadeStart = 1000; // Start fading 1 second before expiry (faster fade)
        if (remaining > fadeStart) return 1;
        if (remaining <= 0) return 0;
        return remaining / fadeStart;
    };

    // Get current streamer ID for Host tag
    const currentStreamerId = useStreamingStore.getState().currentStreamerId;
    const myPlayerId = getMyId();

    // Long-press handlers
    const handleTouchStart = useCallback((msg: ChatMessage) => {
        if (msg.senderId === myPlayerId) return; // Don't report own messages
        longPressTimerRef.current = setTimeout(() => {
            setLongPressTarget(msg);
        }, 500);
    }, [myPlayerId]);

    const handleTouchEnd = useCallback(() => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    }, []);

    // Filter blocked users from messages
    const filteredMessages = messages.filter(msg => !isBlocked(msg.senderId));
    const filteredVisibleMessages = visibleMessages.filter(msg => !isBlocked(msg.senderId));

    return (
        <>
            {/* TikTok-style: Visible comments + Input field */}
            {showInputField && !isOpen && (
                <div className="flex flex-col gap-2">
                    {/* Visible messages (auto-fading) - NO backgrounds */}
                    <div className="space-y-2 max-h-48 overflow-hidden">
                        {filteredVisibleMessages.map((msg) => {
                            const isHost = msg.senderId === currentStreamerId;
                            return (
                                <div
                                    key={msg.id}
                                    className="flex items-start gap-2 transition-opacity duration-300"
                                    style={{ opacity: getMessageOpacity(msg) }}
                                    onTouchStart={() => handleTouchStart(msg)}
                                    onTouchEnd={handleTouchEnd}
                                    onTouchCancel={handleTouchEnd}
                                    onContextMenu={(e) => { e.preventDefault(); if (msg.senderId !== myPlayerId) setLongPressTarget(msg); }}
                                >
                                    {/* Avatar */}
                                    <div className="w-8 h-8 rounded-full bg-bg-elevated overflow-hidden shrink-0">
                                        {msg.avatarUrl ? (
                                            <img src={msg.avatarUrl} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-white/50 text-xs font-bold">
                                                {msg.senderName.charAt(0).toUpperCase()}
                                            </div>
                                        )}
                                    </div>
                                    {/* Name + Host tag + Message */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="font-bold text-white text-sm">{msg.senderName}</span>
                                            {isHost && (
                                                <span className="bg-white/60 text-black text-[10px] font-bold px-1.5 py-0.5 rounded">Host</span>
                                            )}
                                        </div>
                                        <p className="text-white/90 text-sm break-words">{msg.text}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Input field */}
                    <div
                        onClick={toggleChat}
                        data-no-joystick
                        className="bg-black/40 backdrop-blur-sm rounded-full h-12 flex items-center px-4 text-white/50 text-sm border border-white/10 cursor-pointer active:bg-black/60 transition-colors"
                    >
                        Add a comment...
                    </div>
                </div>
            )}

            {/* Chat Button - only when closed and not showing input field (room mode) */}
            {!isOpen && !showInputField && (
                <div className="fixed bottom-8 right-5 z-40 pointer-events-auto">
                    <button
                        onClick={toggleChat}
                        className={`relative group bg-bg-surface/60 backdrop-blur-md border border-white/10 p-3 rounded-full shadow-xl active:scale-95 transition-all text-white hover:bg-bg-elevated ${unreadCount > 0 ? 'scale-110' : ''}`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.068.157 2.148.279 3.238.364.466.037.893.281 1.153.671L12 21l2.652-4.178c.26-.39.687-.634 1.153-.67 1.09-.086 2.17-.208 3.238-.365 1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                        </svg>
                        {unreadCount > 0 && (
                            <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center border-2 border-slate-900">
                                {unreadCount > 99 ? '99+' : unreadCount}
                            </div>
                        )}
                    </button>
                </div>
            )}

            {/* Chat Modal - rendered via portal to escape all stacking contexts */}
            {createPortal(
                <div
                    className="fixed inset-0 z-[100] flex flex-col justify-end"
                    style={{
                        touchAction: 'none',
                        visibility: isOpen ? 'visible' : 'hidden',
                        pointerEvents: isOpen ? 'auto' : 'none',
                        transform: keyboardHeight > 0 ? `translateY(-${keyboardHeight}px)` : 'none',
                        transition: 'transform 0.25s ease-out'
                    }}
                >
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/60 pointer-events-auto"
                        onClick={() => setIsOpen(false)}
                    />

                    {/* Chat Container */}
                    <div className="relative w-full max-w-lg mx-auto pointer-events-auto flex flex-col h-[55vh] max-h-[70vh]">
                        {/* Close button at top */}
                        <div className="flex justify-end p-2">
                            <button
                                onClick={() => setIsOpen(false)}
                                className="bg-black/60 backdrop-blur-md rounded-full p-2 text-white/70 hover:text-white active:scale-90 transition-all"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Messages Area */}
                        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2 overscroll-contain">
                            <div className="text-white/40 text-xs py-4 font-medium italic text-center">
                                Welcome to the chat room...
                            </div>

                            {filteredMessages.map((msg) => {
                                const isHost = msg.senderId === currentStreamerId;
                                return (
                                    <div
                                        key={msg.id}
                                        className="flex items-start gap-2 text-sm leading-relaxed"
                                        onTouchStart={() => handleTouchStart(msg)}
                                        onTouchEnd={handleTouchEnd}
                                        onTouchCancel={handleTouchEnd}
                                        onContextMenu={(e) => { e.preventDefault(); if (msg.senderId !== myPlayerId) setLongPressTarget(msg); }}
                                    >
                                        {/* Avatar */}
                                        <div className="w-8 h-8 rounded-full bg-bg-elevated overflow-hidden shrink-0">
                                            {msg.avatarUrl ? (
                                                <img src={msg.avatarUrl} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-white/50 text-xs font-bold">
                                                    {msg.senderName.charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                        </div>
                                        {/* Name + Host tag + Message */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="font-bold text-white/90">{msg.senderName}</span>
                                                {isHost && (
                                                    <span className="bg-white/60 text-black text-[10px] font-bold px-1.5 py-0.5 rounded">Host</span>
                                                )}
                                            </div>
                                            <p className="text-white/80 break-words">{msg.text}</p>
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <form
                            onSubmit={handleSendMessage}
                            className="p-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
                        >
                            <div className="flex gap-2 items-center">
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={inputText}
                                    onChange={(e) => setInputText(e.target.value)}
                                    placeholder="Type a message..."
                                    className="flex-1 bg-white/15 backdrop-blur-xl border border-white/20 text-white rounded-full px-4 py-3 outline-none focus:bg-white/20 focus:border-white/40 transition-all placeholder:text-white/40 text-sm font-medium shadow-lg"
                                    maxLength={140}
                                    enterKeyHint="send"
                                />
                                <button
                                    type="submit"
                                    disabled={!inputText.trim()}
                                    className="p-3 rounded-full text-white disabled:opacity-30 transition-all shadow-lg active:scale-90"
                                    style={{ backgroundColor: inputText.trim() ? '#3004F6' : '#6b7280' }}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                        <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
                                    </svg>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* Long-press Context Menu */}
            {longPressTarget && !showReportModal && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black/40"
                        onClick={() => setLongPressTarget(null)}
                    />
                    <div className="relative bg-bg-surface rounded-2xl shadow-2xl border border-white/10 overflow-hidden w-64 animate-in zoom-in-95 duration-150">
                        <div className="px-4 py-3 border-b border-white/10">
                            <p className="text-white/60 text-xs truncate">{longPressTarget.senderName}: {longPressTarget.text}</p>
                        </div>
                        <button
                            onClick={() => {
                                setShowReportModal(true);
                            }}
                            className="w-full px-4 py-3 text-left text-red-400 font-medium text-sm hover:bg-white/5 active:bg-white/10 transition-colors flex items-center gap-2"
                        >
                            🚩 Report Message
                        </button>
                        {!isBlocked(longPressTarget.senderId) && (
                            <button
                                onClick={() => {
                                    blockUser(longPressTarget.senderId);
                                    setLongPressTarget(null);
                                }}
                                className="w-full px-4 py-3 text-left text-red-400 font-medium text-sm hover:bg-white/5 active:bg-white/10 transition-colors flex items-center gap-2 border-t border-white/5"
                            >
                                🚫 Block User
                            </button>
                        )}
                        <button
                            onClick={() => setLongPressTarget(null)}
                            className="w-full px-4 py-3 text-left text-white/60 font-medium text-sm hover:bg-white/5 active:bg-white/10 transition-colors border-t border-white/10"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Report Modal */}
            {longPressTarget && (
                <ReportModal
                    isOpen={showReportModal}
                    onClose={() => {
                        setShowReportModal(false);
                        setLongPressTarget(null);
                    }}
                    reportedUserId={longPressTarget.senderId}
                    reportedUserName={longPressTarget.senderName}
                    contextType="chat"
                    contextDetail={`Message: "${longPressTarget.text}"`}
                    onBlock={() => {
                        blockUser(longPressTarget.senderId);
                        setShowReportModal(false);
                        setLongPressTarget(null);
                    }}
                />
            )}
        </>
    );
}
