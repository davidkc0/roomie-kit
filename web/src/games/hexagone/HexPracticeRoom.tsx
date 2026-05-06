/**
 * Hex Practice Room Component
 * Local-only, single-player practice mode for Hex Arena.
 * No Playroom connection, no coins, no multiplayer sync.
 * Reuses HexArena (3D scene), HexPlayerController, and hexGameStore.
 */

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { Vector3, Color4 } from '@babylonjs/core';
import { SceneRoot, useScene } from '../../world/scene';
import { Avatar } from '../../world/Avatar';
import type { PlayerState } from '../../multiplayer/playroom';
import { useAuthStore } from '../../state/authStore';
import { useKeyboardMovement, useJoystickMovement, type MovementInput } from '../../state/movement';
import { Joystick } from '../../components/Joystick';
import { ActionButton } from '../../components/ActionButton';
import { HexArena, getSpawnPosition } from './HexArena';
import { useHexGameStore, type GameStage, checkPlayerDeath } from './hexGameStore';
import { HexPlayerController } from './HexPlayerController';
import { useJumpStore } from './jumpStore';
import { FLOORS, FLOOR_HEIGHT, HEX_NAMEPLATE_SCALE } from './hexConfig';
import './hexFonts.css';
import { AudioManagerProvider, useHexAudioManager } from './useHexAudioManager';
import { ArrowLeft } from 'lucide-react';

const PRACTICE_PLAYER_ID = 'practice-player';

function HexPracticeRoomContent() {
    const { profile } = useAuthStore();
    const { playAudio } = useHexAudioManager();

    // Game store
    const stage = useHexGameStore((s) => s.stage);
    const winnerId = useHexGameStore((s) => s.winnerId);
    const isPlayerDead = useHexGameStore((s) => s.isPlayerDead);
    const eliminatePlayer = useHexGameStore((s) => s.eliminatePlayer);
    const destroyHex = useHexGameStore((s) => s.destroyHex);
    const destroyedHexes = useHexGameStore((s) => s.destroyedHexes);
    const tickTimer = useHexGameStore((s) => s.tickTimer);
    const startPracticeGame = useHexGameStore((s) => s.startPracticeGame);
    const resetGame = useHexGameStore((s) => s.resetGame);
    const timer = useHexGameStore((s) => s.timer);
    const arenaReady = useHexGameStore((s) => s.arenaReady);

    // Jump store
    const requestJump = useJumpStore((s) => s.requestJump);

    // Player state refs — initialized eagerly so Avatar renders from first frame
    const localPlayerStateRef = useRef<PlayerState | null>(null);

    // Movement
    const keyboardInput = useKeyboardMovement();
    const [joystickInput] = useJoystickMovement();

    // Check if I'm dead
    const amIDead = isPlayerDead(PRACTICE_PLAYER_ID);

    // Auto-start practice game on mount
    useEffect(() => {
        const playerName = profile?.username || 'Player';
        const playerPhoto = profile?.profile_image_url || profile?.avatar_headshot_url || '';
        startPracticeGame(playerName, playerPhoto);

        // Initialize local player state immediately so Avatar renders at spawn
        if (!localPlayerStateRef.current) {
            localPlayerStateRef.current = createFallbackPlayer();
        }

        return () => {
            // Reset game on unmount so multiplayer is clean
            resetGame();
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Create fallback player with proper avatar data
    const createFallbackPlayer = useCallback((): PlayerState => {
        const spawn = getSpawnPosition();

        let avatarUrl: string | undefined = undefined;
        if (profile?.avatar_url) {
            try {
                const url = new URL(profile.avatar_url);
                url.searchParams.set('meshLod', '2');
                url.searchParams.set('t', String(Date.now()));
                avatarUrl = url.toString();
            } catch {
                avatarUrl = profile.avatar_url;
            }
        }

        return {
            pos: { x: spawn.x, y: spawn.y, z: spawn.z },
            rotY: 0,
            anim: 'idle',
            head: { q: [0, 0, 0, 1] },
            blend: {},
            avatarUrl,
            avatarConfig: profile?.avatar_config,
            profile: {
                name: profile?.username || 'Player',
                photo: profile?.profile_image_url || profile?.avatar_headshot_url || '',
                bio: profile?.bio,
                username: profile?.username,
                id: profile?.id,
                friends_count: profile?.friends_count || 0,
            }
        };
    }, [profile]);

    // Game timer (host-equivalent — we drive all stages locally)
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    useEffect(() => {
        // Don't run timer in lobby OR when showing winner screen in practice
        // (let the player tap "Play Again" instead of auto-transitioning)
        if (stage === 'lobby' || stage === 'winner') {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
            return;
        }

        timerRef.current = setInterval(() => {
            tickTimer();
        }, 1000);

        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [stage, tickTimer]);

    // Death detection (only after arena is loaded)
    const eliminatedRef = useRef(false);
    useEffect(() => {
        if (stage !== 'game' || amIDead || !arenaReady) return;
        eliminatedRef.current = false;

        const checkDeath = setInterval(() => {
            if (eliminatedRef.current) return;
            const state = localPlayerStateRef.current;
            if (state && checkPlayerDeath(state.pos.y)) {
                eliminatedRef.current = true;
                console.log('[HexPracticeRoom] Player fell! Eliminating...');
                playAudio('Dead', true);
                eliminatePlayer(PRACTICE_PLAYER_ID);
            }
        }, 100);

        return () => clearInterval(checkDeath);
    }, [stage, amIDead, eliminatePlayer, playAudio, arenaReady]);

    // Countdown sound
    useEffect(() => {
        if (stage === 'countdown') {
            playAudio('countdown', true);
        }
    }, [stage, playAudio]);

    // Game over sound
    useEffect(() => {
        if (stage === 'winner') {
            // In practice mode, player always dies (no one to beat), so play death sound
            // Unless they somehow survived (shouldn't happen in solo, but just in case)
            playAudio(winnerId === PRACTICE_PLAYER_ID ? 'win' : 'Dead', true);
        }
    }, [stage, winnerId, playAudio]);

    // Hex hit handler (local-only, no RPC)
    const handleHexHit = useCallback((hexKey: string) => {
        if (destroyedHexes.has(hexKey)) return;
        destroyHex(hexKey);
    }, [destroyedHexes, destroyHex]);

    // Movement input (disabled when dead)
    const movementInput: MovementInput = useMemo(() => {
        if (amIDead || stage !== 'game') {
            return { forward: 0, right: 0 };
        }
        if (joystickInput.forward !== 0 || joystickInput.right !== 0) {
            return joystickInput;
        }
        return keyboardInput;
    }, [keyboardInput, joystickInput, amIDead, stage]);

    // Leave practice — go back to hex multiplayer lobby
    const handleLeave = useCallback(() => {
        window.location.href = '/rooms/hex';
    }, []);

    // Play again — reset player state so avatar + controller rebuild
    const handlePlayAgain = useCallback(() => {
        const playerName = profile?.username || 'Player';
        const playerPhoto = profile?.profile_image_url || profile?.avatar_headshot_url || '';
        startPracticeGame(playerName, playerPhoto);
        // Reset local player to new spawn position
        localPlayerStateRef.current = createFallbackPlayer();
    }, [profile, startPracticeGame]);

    const showArena = stage === 'countdown' || stage === 'game' || stage === 'winner';

    // Jump icon for ActionButton
    const jumpIcon = (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-full h-full">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" />
        </svg>
    );

    return (
        <div className="fixed inset-0">
            {/* Practice Mode HUD */}
            <div className="fixed inset-0 z-30 pointer-events-none font-sans">
                {/* TOP BAR */}
                <div
                    className="absolute top-0 left-0 right-0 grid grid-cols-3 items-start pb-2 bg-gradient-to-b from-black/60 to-transparent pointer-events-none"
                    style={{
                        paddingTop: 'calc(env(safe-area-inset-top) + 12px)',
                        paddingLeft: 'max(env(safe-area-inset-left), 16px)',
                        paddingRight: 'max(env(safe-area-inset-right), 16px)',
                    }}
                >
                    {/* Left: Back Button */}
                    <div className="justify-self-start">
                        <button
                            className="pointer-events-auto p-2 bg-black/40 hover:bg-black/60 backdrop-blur-md rounded-full text-white/80 hover:text-white transition-colors border border-white/10"
                            onClick={handleLeave}
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Center: Stage info */}
                    <div className="justify-self-center text-center">
                        {stage === 'countdown' && (
                            <div className="text-4xl font-black text-white drop-shadow-lg hex-font animate-in zoom-in duration-300">
                                {timer}
                            </div>
                        )}
                        {stage === 'game' && (
                            <div className="flex flex-col items-center">
                                <span className="text-xs text-white/50 uppercase tracking-wider font-semibold">Practice</span>
                                <span className="text-2xl font-black text-white hex-font tabular-nums">
                                    {Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, '0')}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Right: empty spacer for grid balance */}
                    <div className="justify-self-end" />
                </div>

                {/* GAME OVER SCREEN */}
                {stage === 'winner' && (
                    <div className="flex-1 flex flex-col items-center justify-center h-full p-6 text-center pointer-events-auto">
                        <div className="bg-bg-surface/80 backdrop-blur-xl rounded-3xl border border-white/10 p-8 max-w-sm w-full shadow-2xl">
                            <h2 className="text-3xl font-black text-white hex-font mb-2">Game Over!</h2>
                            <p className="text-white/60 text-sm mb-1">You survived</p>
                            <p className="text-4xl font-black text-white hex-font mb-6 tabular-nums">
                                {Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, '0')}
                            </p>

                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={handlePlayAgain}
                                    className="w-full py-4 rounded-2xl bg-white text-slate-900 font-black text-lg tracking-wide
                                        border-b-4 border-slate-200
                                        active:border-b-0 active:translate-y-1 active:mt-1
                                        transition-all shadow-lg shadow-black/10"
                                >
                                    PLAY AGAIN
                                </button>
                                <button
                                    onClick={handleLeave}
                                    className="w-full py-4 rounded-2xl bg-white/10 text-white font-black text-lg tracking-wide
                                        border-b-4 border-white/10
                                        active:border-b-0 active:translate-y-1 active:mt-1
                                        transition-all shadow-lg shadow-black/10"
                                >
                                    Back to Lobby
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Joystick (during game only — alive) */}
            {stage === 'game' && !amIDead && (
                <Joystick />
            )}

            {/* Jump Button (during game only — alive) */}
            {stage === 'game' && !amIDead && (
                <ActionButton
                    icon={jumpIcon}
                    label="Jump"
                    onClick={requestJump}
                    visible={true}
                    className="fixed bottom-24 right-6"
                />
            )}

            {/* 3D Scene */}
            <SceneRoot paused={false} hideGround={true}>
                {/* Dark space background */}
                <HexPracticeBackground />

                {/* Hex Arena (practice mode — no RPCs) */}
                <HexArena visible={showArena} practiceMode={true} />

                {/* Local player avatar — always rendered (ref initialized on mount) */}
                <Avatar
                    key={PRACTICE_PLAYER_ID}
                    playerId={PRACTICE_PLAYER_ID}
                    player={localPlayerStateRef.current ?? createFallbackPlayer()}
                    isLocal={true}
                    getLocalState={() => localPlayerStateRef.current}
                    nameplateScale={HEX_NAMEPLATE_SCALE}
                />

                {/* Player Controller — mount during countdown to pre-create agent,
                    freeze until game stage */}
                {(stage === 'countdown' || stage === 'game') && !amIDead && arenaReady && (
                    <HexPlayerController
                        myId={PRACTICE_PLAYER_ID}
                        movementInput={movementInput}
                        localPlayerStateRef={localPlayerStateRef}
                        createFallbackPlayer={createFallbackPlayer}
                        onHexHit={handleHexHit}
                        frozen={stage !== 'game'}
                    />
                )}

                {/* Camera Setup */}
                <HexPracticeCameraSetup stage={stage} />
            </SceneRoot>
        </div>
    );
}

/**
 * Override scene background for hex arena (dark space theme)
 */
function HexPracticeBackground() {
    const { scene } = useScene();

    useEffect(() => {
        if (!scene) return;
        scene.clearColor = new Color4(0.05, 0.05, 0.1, 1);
    }, [scene]);

    return null;
}

/**
 * Camera setup for different game stages (same as multiplayer)
 */
function HexPracticeCameraSetup({ stage }: { stage: GameStage }) {
    const { camera } = useScene();

    useEffect(() => {
        if (!camera) return;

        switch (stage) {
            case 'lobby':
                camera.radius = 50;
                camera.beta = Math.PI / 3.5;
                camera.target = new Vector3(0, (FLOORS.length - 1) * FLOOR_HEIGHT, 0);
                break;
            case 'countdown':
                camera.radius = 60;
                camera.beta = Math.PI / 4;
                camera.target = new Vector3(0, (FLOORS.length - 1) * FLOOR_HEIGHT, 0);
                break;
            case 'game':
                // Camera following handled by HexPlayerController
                break;
            case 'winner':
                camera.radius = 40;
                camera.beta = Math.PI / 4;
                break;
        }
    }, [camera, stage]);

    return null;
}

// Wrapper component to provide audio context
export function HexPracticeRoom() {
    return (
        <AudioManagerProvider>
            <HexPracticeRoomContent />
        </AudioManagerProvider>
    );
}
