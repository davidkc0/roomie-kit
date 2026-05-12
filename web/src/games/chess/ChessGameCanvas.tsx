import { useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, RotateCcw, Trophy, Bot, Users, ChevronLeft } from 'lucide-react';
import { Dialog } from '@capacitor/dialog';
import { Capacitor } from '@capacitor/core';
import { ChessBoard } from './ChessBoard';
import { useChessStore } from '../../state/chessStore';
import { getRandomAIMove } from './ChessGame';
import { sendSignal } from '../../lib/signaling';
import { useAuthStore } from '../../state/authStore';
import { useEconomyStore } from '../../state/economyStore';
import { updateChessRatings } from '../../multiplayer/gameSync';
import { ChessLeaderboard } from '../../components/ChessLeaderboard';
import type { PlayerState } from '../../multiplayer/playroom';
import { useOrientationLock } from '../../hooks/useOrientationLock';
import { GamePrimaryButton } from '../../components/GamePrimaryButton';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { brandAssetUrls } from '../../config/customization';

type RoomPlayer = {
    id: string; // Playroom ID
    state: PlayerState;
};

type ChessGameCanvasProps = {
    onClose: () => void;
    onGameEnd?: (won: boolean) => void;
    players?: RoomPlayer[]; // Players in the room
    myPlayroomId?: string;
    writeMyState?: (partial: Partial<PlayerState>) => Promise<void>;
};


export function ChessGameCanvas({ onClose, onGameEnd, players = [], myPlayroomId, writeMyState }: ChessGameCanvasProps) {
    // Lock to portrait during chess game
    useOrientationLock(true);
    const {
        gameState,
        gameMode,
        playerColor,
        isPlaying,
        engine,
        startGame,
        makeMove,
        getValidMoves,
        resetGame,
        showPlayerSelect,
        setShowPlayerSelect,
        sendInvite,
        multiplayerStatus,
        gameSessionId,
        opponentInfo,
        endMultiplayerGame,
    } = useChessStore();

    const { user, profile } = useAuthStore();
    const { checkGamePlayCost, startGamePlay, openPurchaseDrawer } = useEconomyStore();
    const [opponentLeft, setOpponentLeft] = useState(false);
    const [gamePlayCost, setGamePlayCost] = useState<{ isFree: boolean; cost: number; balance: number } | null>(null);
    const [showLeaderboard, setShowLeaderboard] = useState(false);
    const [ratingsSubmitted, setRatingsSubmitted] = useState(false);

    // Listen for opponent leaving (resign signal handled in App.tsx, but we need local state)
    useEffect(() => {
        // Subscribe to chess store changes
        const unsubscribe = useChessStore.subscribe((state, prevState) => {
            // If we were playing multiplayer and now status is idle (opponent left)
            if (prevState.multiplayerStatus === 'playing' && state.multiplayerStatus === 'idle' && isPlaying) {
                setOpponentLeft(true);
            }
        });
        return unsubscribe;
    }, [isPlaying]);

    // Check cost when entering menu
    useEffect(() => {
        if (!isPlaying && !showPlayerSelect && !showLeaderboard) {
            checkGamePlayCost('chess').then(setGamePlayCost).catch(err => {
                console.error('[ChessGameCanvas] Failed to check game cost:', err);
            });
        }
    }, [isPlaying, showPlayerSelect, showLeaderboard, checkGamePlayCost]);

    // Cleanup engine - no terminate method on ChessGameEngine, just nullify
    useEffect(() => {
        return () => {
            // ChessGameEngine doesn't have a terminate method
            // Cleanup is handled by zustand store
        };
    }, [engine]);

    // Sync isPlayingGame state when game starts (covers both AI and multiplayer)
    // CRITICAL: Cleanup is essential! If isPlayingGame stays true, the avatar is hidden from other players.
    useEffect(() => {
        if (isPlaying) {
            writeMyState?.({ isPlayingGame: true });
        }

        // Cleanup: When component unmounts OR when isPlaying becomes false
        return () => {
            console.log('[Chess] Cleanup: Setting isPlayingGame: false');
            writeMyState?.({ isPlayingGame: false });
        };
    }, [isPlaying, writeMyState]);

    // Handle close with confirmation when actively playing
    const handleClose = async () => {
        // If in an active game (AI or multiplayer), confirm before leaving
        if (isPlaying && !opponentLeft) {
            let confirmed = false;

            if (Capacitor.isNativePlatform()) {
                const { value } = await Dialog.confirm({
                    title: 'End Game?',
                    message: gameMode === 'multiplayer'
                        ? 'Are you sure you want to leave? This will end the game.'
                        : 'Are you sure you want to end this game?',
                    okButtonTitle: gameMode === 'multiplayer' ? 'Leave' : 'End Game',
                    cancelButtonTitle: gameMode === 'multiplayer' ? 'Stay' : 'Keep Playing',
                });
                confirmed = value;
            } else {
                confirmed = window.confirm(
                    gameMode === 'multiplayer'
                        ? 'Are you sure you want to leave? This will end the game.'
                        : 'Are you sure you want to end this game?'
                );
            }

            if (!confirmed) return;

            // For multiplayer, send resign signal
            if (gameMode === 'multiplayer' && opponentInfo?.id && user?.id) {
                await sendSignal({
                    type: 'chess_resign',
                    fromId: user.id,
                    toId: opponentInfo.id,
                    roomId: gameSessionId || ''
                });
                endMultiplayerGame();
            }
        }

        // Clear game state for avatar
        writeMyState?.({ isPlayingGame: false });
        onClose();
    };

    // AI move logic
    useEffect(() => {
        if (!isPlaying || !engine || !gameState) return;
        if (gameMode !== 'ai') return;
        if (gameState.turn === playerColor) return;
        if (gameState.status !== 'playing') return;

        // AI's turn - make move after short delay
        const timeout = setTimeout(() => {
            const aiMove = getRandomAIMove(engine);
            if (aiMove) {
                engine.move(aiMove.from, aiMove.to);
                useChessStore.setState({ gameState: engine.getState() });
            }
        }, 500);

        return () => clearTimeout(timeout);
    }, [gameState?.turn, gameState?.status, isPlaying, gameMode, playerColor, engine]);

    // Handle game end
    useEffect(() => {
        if (!gameState) return;
        if (gameState.status === 'checkmate') {
            const winner = gameState.turn === 'w' ? 'b' : 'w';
            const playerWon = winner === playerColor;
            onGameEnd?.(playerWon);

            // Submit ELO ratings for multiplayer games (only once)
            console.log('[Chess] Checkmate detected', {
                gameMode,
                opponentId: opponentInfo?.id,
                userId: user?.id,
                ratingsSubmitted,
                playerWon,
                winner
            });

            if (gameMode === 'multiplayer' && opponentInfo?.id && user?.id && !ratingsSubmitted) {
                setRatingsSubmitted(true);
                const winnerId = playerWon ? user.id : opponentInfo.id;
                const loserId = playerWon ? opponentInfo.id : user.id;
                console.log('[Chess] Submitting ratings', { winnerId, loserId });
                updateChessRatings(winnerId, loserId)
                    .then(result => {
                        console.log('[Chess] Ratings updated:', result);
                    })
                    .catch(err => {
                        console.error('[Chess] Failed to update ratings:', err);
                    });
            } else {
                console.log('[Chess] Rating update skipped - conditions not met');
            }
        }
    }, [gameState?.status, playerColor, onGameEnd, gameMode, opponentInfo, user?.id, ratingsSubmitted]);

    const handleMove = useCallback((from: string, to: string) => {
        const moved = makeMove(from as any, to as any);

        // If multiplayer, send move to opponent
        if (moved && gameMode === 'multiplayer' && opponentInfo?.id && user?.id) {
            sendSignal({
                type: 'chess_move',
                fromId: user.id,
                toId: opponentInfo.id,
                roomId: gameSessionId || '',
                move: { from, to }
            });
        }
    }, [makeMove, gameMode, opponentInfo, gameSessionId, user?.id]);

    const handleStartVsAI = async () => {
        // Check payment first
        const result = await startGamePlay('chess');
        if (!result.allowed) {
            if (result.reason === 'insufficient_coins') {
                await Dialog.alert({
                    title: 'Not Enough Coins',
                    message: `You need ${result.cost} coins to play. You have ${result.balance}.`
                });
                openPurchaseDrawer();
            } else {
                // Generic error
                await Dialog.alert({
                    title: 'Cannot Start Game',
                    message: 'There was an error starting the game. Please try again.'
                });
            }
            return;
        }

        startGame('ai');
        // Mark as playing for avatar hiding
        writeMyState?.({ isPlayingGame: true });
    };

    const handleStartVsPlayer = async () => {
        // Check if we need to pay (just peek at cost, don't charge yet)
        const cost = await checkGamePlayCost('chess');

        if (!cost.isFree && cost.balance < cost.cost) {
            await Dialog.alert({
                title: 'Not Enough Coins',
                message: `You need ${cost.cost} coins to play. You have ${cost.balance}.`
            });
            openPurchaseDrawer();
            return;
        }

        setShowPlayerSelect(true);
    };

    const handleSelectPlayer = async (player: RoomPlayer) => {
        if (!user?.id || !player.state.profile?.id) return;

        // Charge initiator when they send invite (game will start when accepted)
        const result = await startGamePlay('chess');
        if (!result.allowed) {
            if (result.reason === 'insufficient_coins') {
                await Dialog.alert({
                    title: 'Not Enough Coins',
                    message: `You need ${result.cost} coins to play. You have ${result.balance}.`
                });
                openPurchaseDrawer();
            } else {
                await Dialog.alert({
                    title: 'Cannot Start Game',
                    message: 'There was an error starting the game. Please try again.'
                });
            }
            return;
        }

        // Store invite locally
        sendInvite(
            player.state.profile.id,
            player.state.profile.name || player.state.profile.username || 'Player',
            player.state.profile.photo
        );

        // Get current session ID from store
        const { gameSessionId: sessionId } = useChessStore.getState();

        // Get proper avatar URL from profile
        const avatarUrl = profile?.profile_image_url || profile?.avatar_headshot_url;

        // Send invite signal - inviter is white, invitee is black
        await sendSignal({
            type: 'chess_request',
            fromId: user.id,
            fromName: profile?.username || 'Player',
            fromAvatar: avatarUrl,
            toId: player.state.profile.id,
            roomId: sessionId || '',
            playerColor: 'b' // Their assigned color
        });
    };

    // Filter out self from players list
    const otherPlayers = players.filter(p => p.id !== myPlayroomId && p.state.profile?.id);

    const getStatusText = () => {
        if (!gameState) return '';
        if (gameState.status === 'checkmate') {
            const winner = gameState.turn === 'w' ? 'Black' : 'White';
            return `Checkmate! ${winner} wins!`;
        }
        if (gameState.status === 'stalemate') return 'Stalemate!';
        if (gameState.status === 'draw') return 'Draw!';
        if (gameState.isCheck) return 'Check!';
        return gameState.turn === playerColor ? 'Your turn' : "Opponent's turn";
    };

    const content = (
        <div className="fixed inset-0 z-[9999] bg-black flex flex-col pt-safe-top pb-safe-bottom">
            {/* Header */}
            <div className="flex items-center justify-between p-4 pt-14 border-b border-white/10">
                <div className="flex items-center gap-2">
                    {showPlayerSelect && (
                        <button
                            onClick={() => setShowPlayerSelect(false)}
                            className="p-2 text-slate-400 hover:text-white transition-colors"
                        >
                            <ChevronLeft className="w-6 h-6" />
                        </button>
                    )}
                    <h1 className="text-xl font-bold text-white">
                        {showPlayerSelect ? 'Select Player' : 'Chess'}
                    </h1>
                </div>
                <button
                    onClick={handleClose}
                    className="p-2 text-text-tertiary hover:text-white transition-colors"
                >
                    <X className="w-6 h-6" />
                </button>
            </div>

            {/* Opponent Left Overlay */}
            {opponentLeft && (
                <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-10">
                    <div className="text-center p-8">
                        <div className="text-6xl mb-4">👋</div>
                        <h3 className="text-xl font-bold text-white mb-2">Opponent Left</h3>
                        <p className="text-text-secondary mb-6">Your opponent has left the game.</p>
                        <GamePrimaryButton
                            onClick={onClose}
                        >
                            Back to Menu
                        </GamePrimaryButton>
                    </div>
                </div>
            )}

            {/* Main content */}
            <div className="flex-1 flex flex-col items-center justify-center p-4 gap-6">
                {!isPlaying ? (
                    <>
                        {/* Player Selection Screen */}
                        {showPlayerSelect ? (
                            <div className="flex flex-col items-center gap-4 w-full max-w-sm">
                                {multiplayerStatus === 'inviting' ? (
                                    // Waiting for response
                                    <div className="flex flex-col items-center gap-4 p-8">
                                        <div className="w-16 h-16 rounded-full bg-slate-700 animate-pulse flex items-center justify-center overflow-hidden">
                                            {opponentInfo?.avatar ? (
                                                <img src={opponentInfo.avatar} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <Users className="w-8 h-8 text-text-tertiary" />
                                            )}
                                        </div>
                                        <div className="text-white font-bold">{opponentInfo?.name || 'Player'}</div>
                                        <div className="text-slate-400 text-sm">Waiting for response...</div>
                                        <LoadingSpinner size="md" />
                                    </div>
                                ) : otherPlayers.length > 0 ? (
                                    // Player list
                                    <div className="w-full space-y-2">
                                        <p className="text-text-tertiary text-sm text-center mb-4">
                                            Tap a player to invite them
                                        </p>
                                        {otherPlayers.map((player) => (
                                            <button
                                                key={player.id}
                                                onClick={() => handleSelectPlayer(player)}
                                                className="w-full flex items-center gap-3 p-4 bg-bg-elevated/60 hover:bg-bg-surface/60 border border-white/10 rounded-xl transition-all active:scale-[0.98]"
                                            >
                                                <div className="w-12 h-12 rounded-full bg-bg-surface overflow-hidden">
                                                    {player.state.profile?.photo ? (
                                                        <img
                                                            src={player.state.profile.photo}
                                                            alt=""
                                                            className="w-full h-full object-cover"
                                                        />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-white text-xl font-bold">
                                                            {(player.state.profile?.name || player.state.profile?.username || 'P').charAt(0).toUpperCase()}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1 text-left">
                                                    <div className="text-white font-medium">
                                                        {player.state.profile?.name || player.state.profile?.username || 'Player'}
                                                    </div>
                                                </div>
                                                <Users className="w-5 h-5 text-slate-400" />
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    // No players available
                                    <div className="text-center p-8">
                                        <Users className="w-16 h-16 text-text-disabled mx-auto mb-4" />
                                        <div className="text-text-tertiary">No other players in the room</div>
                                        <button
                                            onClick={() => setShowPlayerSelect(false)}
                                            className="mt-4 px-6 py-2 rounded-full text-white font-medium transition-all active:scale-95
                                                bg-bg-surface/60 backdrop-blur-xl border border-white/10
                                                shadow-[0_4px_16px_rgba(0,0,0,0.2)]"
                                        >
                                            Back
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            // Start menu
                            <div className="flex flex-col items-center gap-6">
                                <div className="w-32 h-32 animate-bounce">
                                    <img src={brandAssetUrls.chessLogo} alt="Chess" className="w-full h-full object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]" />
                                </div>
                                <h2 className="text-2xl font-bold text-white">Play Chess</h2>

                                {/* Cost Badge */}
                                {gamePlayCost && (
                                    <div className={`px-3 py-1.5 rounded-full text-sm font-medium border flex items-center gap-2
                                        bg-bg-surface/60 backdrop-blur-xl
                                        ${gamePlayCost.isFree
                                            ? 'text-success border-success/30 shadow-[inset_0_0_20px_rgba(0,255,156,0.1)]'
                                            : 'text-yellow-400 border-yellow-500/30 shadow-[inset_0_0_20px_rgba(234,179,8,0.1)]'
                                        }`}>
                                        {gamePlayCost.isFree ? (
                                            <>✨ 1 Free Game</>
                                        ) : (
                                            <>
                                                <img src={brandAssetUrls.coinIcon} alt="Coins" className="w-4 h-4 object-contain" />
                                                {gamePlayCost.cost} Coins / game
                                            </>
                                        )}
                                    </div>
                                )}

                                <div className="flex flex-col gap-3 w-72">
                                    <GamePrimaryButton
                                        onClick={handleStartVsAI}
                                    >
                                        <Bot className="w-5 h-5" />
                                        Play vs Computer
                                    </GamePrimaryButton>
                                    <GamePrimaryButton
                                        onClick={handleStartVsPlayer}
                                    >
                                        <Users className="w-5 h-5" />
                                        Invite Player
                                    </GamePrimaryButton>
                                    <button
                                        onClick={() => setShowLeaderboard(true)}
                                        className="flex items-center justify-center gap-2 w-full py-4 px-8 rounded-2xl text-white font-black text-lg tracking-wide transition-all active:scale-95
                                            bg-white/10 backdrop-blur-xl border-b-4 border-white/10
                                            active:border-b-0 active:translate-y-1 active:mt-1
                                            shadow-lg shadow-black/10"
                                    >
                                        <Trophy className="w-5 h-5 text-yellow-400" />
                                        Leaderboard
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    // Game screen
                    <div className="flex flex-col w-full h-full max-w-lg mx-auto gap-4 pb-4">
                        {/* Turn Status */}
                        <div className="text-center">
                            <div className={`inline-block px-4 py-1 rounded-full text-sm font-bold ${gameState?.isCheck ? 'bg-red-500/20 text-red-200 border border-red-500/50 animate-pulse' :
                                gameState?.status !== 'playing' ? 'bg-yellow-500/20 text-yellow-200 border border-yellow-500/50' :
                                    'bg-white/10 text-white border border-white/10'
                                }`}>
                                {getStatusText()}
                            </div>
                        </div>

                        {/* Opponent Info */}
                        <div className="flex items-center gap-3 p-3 bg-bg-elevated/60 backdrop-blur-md rounded-xl border border-white/10 shadow-lg">
                            <div className="w-12 h-12 rounded-full bg-bg-surface overflow-hidden ring-2 ring-white/10">
                                {gameMode === 'ai' ? (
                                    <div className="w-full h-full flex items-center justify-center bg-indigo-600">
                                        <Bot className="w-6 h-6 text-white" />
                                    </div>
                                ) : opponentInfo?.avatar ? (
                                    <img src={opponentInfo.avatar} alt={opponentInfo.name} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-white font-bold">
                                        {(opponentInfo?.name || 'P').charAt(0).toUpperCase()}
                                    </div>
                                )}
                            </div>
                            <div>
                                <div className="text-white font-bold text-lg leading-tight">
                                    {gameMode === 'ai' ? 'Computer' : opponentInfo?.name || 'Opponent'}
                                </div>
                                <div className="text-text-tertiary text-xs font-medium flex items-center gap-1">
                                    <Trophy className="w-3 h-3 text-yellow-500" />
                                    Rank: 1200
                                </div>
                            </div>
                            {/* Timer could go here */}
                        </div>

                        {/* Chessboard Area */}
                        <div className="flex-1 flex items-center justify-center min-h-0 relative">
                            {gameState && (
                                <ChessBoard
                                    gameState={gameState}
                                    playerColor={playerColor}
                                    onMove={handleMove}
                                    getValidMoves={getValidMoves}
                                    disabled={gameState.status !== 'playing' || gameState.turn !== playerColor}
                                />
                            )}

                            {/* Game over overlay controls */}
                            {gameState?.status !== 'playing' && (
                                <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-[2px] rounded-lg">
                                    <div className="flex gap-3 scale-110">
                                        <GamePrimaryButton
                                            onClick={resetGame}
                                            className="px-6"
                                        >
                                            <RotateCcw className="w-5 h-5" />
                                            Play Again
                                        </GamePrimaryButton>
                                        <button
                                            onClick={handleClose}
                                            className="py-4 px-8 rounded-2xl text-white font-black text-lg tracking-wide transition-all active:scale-95
                                                bg-white/10 backdrop-blur-xl border-b-4 border-white/10
                                                active:border-b-0 active:translate-y-1 active:mt-1
                                                shadow-lg shadow-black/10"
                                        >
                                            Exit
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Player Info (You) */}
                        <div className="flex items-center gap-3 p-3 bg-bg-elevated/60 backdrop-blur-md rounded-xl border border-white/10 shadow-lg mt-auto">
                            <div className="w-12 h-12 rounded-full bg-bg-surface overflow-hidden ring-2 ring-brand-primary/50">
                                {(profile?.profile_image_url || profile?.avatar_headshot_url) ? (
                                    <img src={profile.profile_image_url || profile.avatar_headshot_url} alt="You" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-white font-bold">
                                        {(profile?.username || 'Y').charAt(0).toUpperCase()}
                                    </div>
                                )}
                            </div>
                            <div>
                                <div className="text-white font-bold text-lg leading-tight">
                                    {profile?.username || 'Player'} <span className="text-text-tertiary text-sm font-normal">(You)</span>
                                </div>
                                <div className="text-slate-400 text-xs font-medium flex items-center gap-1">
                                    <Trophy className="w-3 h-3 text-yellow-500" />
                                    Rank: 1200
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );

    return createPortal(
        <>
            {content}
            <ChessLeaderboard isOpen={showLeaderboard} onClose={() => setShowLeaderboard(false)} />
        </>,
        document.body
    );
}
