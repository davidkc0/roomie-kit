/**
 * Avatar Editor Component
 * Roblox-style avatar customization with 3D preview.
 * 
 * Features:
 * - 3D avatar preview with orbit controls
 * - Category tabs: Body, Hair, Outfit, Shoes, Skin, Costumes
 * - Hair tab has two sub-sections: hair color circles + hairstyle thumbnails
 * - Costumes override all slots; individual tab changes clear costume
 * - Purchase gating for premium items (costumes, streak unlocks)
 * - Real-time texture preview
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import {
    Engine,
    Scene,
    ArcRotateCamera,
    HemisphericLight,
    Vector3,
    Color4,
    DirectionalLight,
    Color3
} from '@babylonjs/core';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import '@babylonjs/loaders';
import { X, Check, User, Shirt, Footprints, Palette, Scissors, Star, Lock } from 'lucide-react';
import { CoinBalanceButton } from './CoinBalanceButton';
import { R2_PATHS } from '../config/r2';
import { type AvatarConfig, DEFAULT_AVATAR_CONFIG, applyAvatarTextures } from '../avatars/avatarTextures';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../state/authStore';
import { appConfig } from '../config/app';

type AvatarEditorProps = {
    initialConfig?: AvatarConfig;
    onSave: (config: AvatarConfig) => Promise<void>;
    onClose: () => void;
};

type Category = 'body' | 'hair' | 'outfit' | 'shoes' | 'skin' | 'costume';

type AvatarOption = {
    id: string;
    category: string;
    gender: 'male' | 'female' | 'neutral';
    option_key: string;
    display_name: string;
    thumbnail_url: string;
    is_premium: boolean;
    coin_price: number;
    sort_order: number;
    costume_head_url?: string;
    costume_body_url?: string;
    costume_feet_url?: string;
    unlock_type: string;
    unlock_value: number;
};

const CATEGORY_ICONS: Record<Category, typeof User> = {
    body: User,
    hair: Scissors,
    outfit: Shirt,
    shoes: Footprints,
    skin: Palette,
    costume: Star,
};

const CATEGORIES: Category[] = ['body', 'hair', 'outfit', 'shoes', 'skin', 'costume'];

// Hair color display mapping
const HAIR_COLORS: Record<string, string> = {
    '1': '#3D2519',  // Brown
    '2': '#F4CB7B',  // Blonde
    '3': '#202020',  // Black
};

// Hair color names for tooltips
const HAIR_COLOR_NAMES: Record<string, string> = {
    '1': 'Brown',
    '2': 'Blonde',
    '3': 'Black',
};

export function AvatarEditor({ initialConfig, onSave, onClose }: AvatarEditorProps) {
    const [config, setConfig] = useState<AvatarConfig>(initialConfig || DEFAULT_AVATAR_CONFIG);
    const [activeCategory, setActiveCategory] = useState<Category>('outfit');
    const [saving, setSaving] = useState(false);
    const [allOptions, setAllOptions] = useState<AvatarOption[]>([]);
    const [optionsLoading, setOptionsLoading] = useState(true);
    const [unlockedItems, setUnlockedItems] = useState<Set<string>>(new Set());
    const [purchaseConfirm, setPurchaseConfirm] = useState<AvatarOption | null>(null);
    const [purchasing, setPurchasing] = useState(false);
    const [coinBalance, setCoinBalance] = useState(0);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<Engine | null>(null);
    const sceneRef = useRef<Scene | null>(null);
    const meshesRef = useRef<any[]>([]);

    // Fetch options + unlocked items from database
    useEffect(() => {
        const fetchData = async () => {
            const user = useAuthStore.getState().user;

            // Fetch all options
            const { data: optionsData, error: optionsError } = await supabase
                .from('avatar_customization_options')
                .select('*')
                .order('sort_order', { ascending: true });

            if (optionsError) {
                console.error('[AvatarEditor] Error fetching options:', optionsError);
            } else {
                setAllOptions(optionsData as AvatarOption[]);
            }

            // Fetch unlocked items
            if (user) {
                const { data: unlockedData, error: unlockedError } = await supabase
                    .rpc('get_user_unlocked_items', { p_user_id: user.id });

                if (!unlockedError && unlockedData) {
                    setUnlockedItems(new Set(unlockedData as string[]));
                }

                if (appConfig.features.economy) {
                    // Fetch coin balance
                    const { data: coinsData } = await supabase
                        .from('user_coins')
                        .select('balance')
                        .eq('user_id', user.id)
                        .single();

                    if (coinsData) {
                        setCoinBalance(coinsData.balance);
                    }
                }
            }

            setOptionsLoading(false);
        };

        fetchData();
    }, []);

    // Get options for current category, filtered by gender where applicable
    const getOptionsForCategory = useCallback((category: Category): AvatarOption[] => {
        if (category === 'body') {
            return allOptions.filter(o => o.category === 'body');
        }
        if (category === 'hair') {
            // Hairstyle options (not hair_color), filtered by gender
            return allOptions.filter(o =>
                o.category === 'hair' &&
                (o.gender === config.gender || o.gender === 'neutral')
            );
        }
        if (category === 'costume') {
            // Costumes are gender-neutral
            return allOptions.filter(o => o.category === 'costume');
        }
        // Other categories filter by current gender
        return allOptions.filter(o =>
            o.category === category &&
            (o.gender === config.gender || o.gender === 'neutral')
        );
    }, [allOptions, config.gender]);

    // Check if an item is available to the user
    const isItemAvailable = useCallback((option: AvatarOption): boolean => {
        if (!appConfig.features.economy) return true;
        if (option.unlock_type === 'free') return true;
        return unlockedItems.has(option.id);
    }, [unlockedItems]);

    // Initialize Babylon scene
    useEffect(() => {
        if (!canvasRef.current) return;

        const engine = new Engine(canvasRef.current, true, { preserveDrawingBuffer: true, stencil: true });
        const scene = new Scene(engine);
        scene.clearColor = new Color4(0, 0, 0, 0); // Transparent background

        // Camera - orbit around avatar (looking straight at chest level)
        const camera = new ArcRotateCamera(
            'camera',
            -Math.PI / 2, // Alpha - start facing the front of avatar
            Math.PI / 2, // Beta - horizontal level (not looking down)
            3.5, // Radius (distance)
            new Vector3(0, 0.5, 0), // Target (lower - around waist/hips)
            scene
        );
        camera.attachControl(canvasRef.current, true);
        camera.lowerRadiusLimit = 2;
        camera.upperRadiusLimit = 5;
        camera.wheelPrecision = 50;
        camera.minZ = 0.1;

        // Lighting - Studio Setup
        const hemiLight = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
        hemiLight.intensity = 0.8;
        hemiLight.groundColor = new Color3(0.2, 0.2, 0.2);

        const dirLight = new DirectionalLight('dir', new Vector3(-1, -2, -1), scene);
        dirLight.position = new Vector3(20, 40, 20);
        dirLight.intensity = 1.0;

        // Load base avatar - using body3.glb
        const avatarUrl = `${R2_PATHS.avatars}/body3.glb?meshLod=2&t=${Date.now()}`;
        SceneLoader.ImportMeshAsync('', '', avatarUrl, scene)
            .then((result) => {
                console.log('[AvatarEditor] Loaded avatar meshes:', result.meshes.map(m => m.name));

                if (result.meshes[0]) {
                    result.meshes[0].position.y = 0;
                    result.meshes[0].rotationQuaternion = null;
                    result.meshes[0].rotation.x = -Math.PI / 2;
                }

                meshesRef.current = result.meshes;
                applyAvatarTextures(result.meshes, config, scene);
            })
            .catch((err) => {
                console.error('[AvatarEditor] Failed to load avatar:', err);
            });

        engineRef.current = engine;
        sceneRef.current = scene;

        engine.runRenderLoop(() => {
            scene.render();
        });

        const handleResize = () => engine.resize();
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            engine.dispose();
        };
    }, []);

    // Apply textures when config changes
    useEffect(() => {
        if (sceneRef.current && meshesRef.current.length > 0) {
            applyAvatarTextures(meshesRef.current, config, sceneRef.current);
        }
    }, [config]);

    const handleOptionSelect = useCallback((category: Category, value: string, option?: AvatarOption) => {
        // Check purchase/streak gating
        if (option && !isItemAvailable(option)) {
            // Both purchase and streak items open the modal now
            if (option.unlock_type === 'purchase' || option.unlock_type === 'streak') {
                setPurchaseConfirm(option);
            }
            return;
        }

        setConfig(prev => {
            const updated = { ...prev };

            if (category === 'costume') {
                // Selecting a costume overrides all slots
                updated.costume = value;
            } else {
                // Any individual tab change clears the costume
                if (prev.costume) {
                    updated.costume = undefined;
                }

                switch (category) {
                    case 'body':
                        updated.gender = value as 'male' | 'female';
                        break;
                    case 'hair':
                        updated.hair = value;
                        break;
                    case 'outfit':
                        updated.outfit = value;
                        break;
                    case 'shoes':
                        updated.feet = value;
                        break;
                    case 'skin':
                        updated.skinTone = value;
                        break;
                }
            }
            return updated;
        });
    }, [isItemAvailable]);

    const handleHairColorSelect = useCallback((colorKey: string) => {
        setConfig(prev => {
            const updated = { ...prev };
            // Clear costume when changing hair color
            if (prev.costume) {
                updated.costume = undefined;
            }
            updated.hairColor = colorKey;
            return updated;
        });
    }, []);

    const handlePurchase = async () => {
        if (!purchaseConfirm) return;
        const user = useAuthStore.getState().user;
        if (!user) return;

        setPurchasing(true);
        try {
            if (!appConfig.features.economy) {
                setUnlockedItems(prev => new Set([...prev, purchaseConfirm.id]));
                handleOptionSelect(
                    purchaseConfirm.category as Category,
                    purchaseConfirm.option_key,
                    { ...purchaseConfirm, unlock_type: 'free' }
                );
                setPurchaseConfirm(null);
                return;
            }

            const { data, error } = await supabase.rpc('purchase_avatar_item', {
                p_user_id: user.id,
                p_item_id: purchaseConfirm.id,
            });

            if (error) {
                console.error('[AvatarEditor] Purchase error:', error);
                return;
            }

            if (data?.success) {
                // Update local state
                setUnlockedItems(prev => new Set([...prev, purchaseConfirm.id]));
                if (data.new_balance !== undefined) {
                    setCoinBalance(data.new_balance);
                }

                // Apply the purchased item
                handleOptionSelect(
                    purchaseConfirm.category as Category,
                    purchaseConfirm.option_key,
                    { ...purchaseConfirm, unlock_type: 'free' } // Pass as free so it doesn't re-prompt
                );
                setPurchaseConfirm(null);
            } else {
                console.error('[AvatarEditor] Purchase failed:', data?.error);
            }
        } finally {
            setPurchasing(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await captureAndUploadHeadshot();
            await onSave(config);
        } finally {
            setSaving(false);
        }
    };

    // Capture headshot from the existing canvas
    const captureAndUploadHeadshot = async (): Promise<void> => {
        const scene = sceneRef.current;
        const engine = engineRef.current;
        const canvas = canvasRef.current;
        const { uploadAvatarHeadshot } = useAuthStore.getState();

        if (!scene || !engine || !canvas) {
            console.warn('[AvatarEditor] Cannot capture headshot - scene not ready');
            return;
        }

        try {
            const headCamera = new ArcRotateCamera(
                'headshot-camera',
                -Math.PI / 2,
                Math.PI / 2.2,
                2.0,
                new Vector3(0, 1.4, 0),
                scene
            );

            const originalCamera = scene.activeCamera;
            scene.activeCamera = headCamera;
            scene.render();

            const blob = await new Promise<Blob>((resolve, reject) => {
                canvas.toBlob((b) => {
                    if (b) resolve(b);
                    else reject(new Error('Failed to capture canvas'));
                }, 'image/png', 0.95);
            });

            scene.activeCamera = originalCamera;
            headCamera.dispose();
            scene.render();

            await uploadAvatarHeadshot(blob);
            console.log('[AvatarEditor] Headshot captured and uploaded');
        } catch (error) {
            console.error('[AvatarEditor] Error capturing headshot:', error);
        }
    };

    const getSelectedValue = (category: Category): string => {
        switch (category) {
            case 'body': return config.gender;
            case 'hair': return config.hair;
            case 'outfit': return config.outfit;
            case 'shoes': return config.feet;
            case 'skin': return config.skinTone;
            case 'costume': return config.costume || '';
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex flex-col font-sans"
            style={{
                backgroundColor: '#F2F2F7',
                backgroundImage: 'linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)',
                backgroundSize: '24px 24px',
            }}
        >
            {/* Edge vignette — fades grid at screen edges */}
            <div className="absolute inset-0 pointer-events-none z-[1]" style={{
                background: 'radial-gradient(ellipse at center, transparent 40%, #F2F2F7 85%)'
            }} />

            {/* Header */}
            <div
                className="relative z-10 flex items-center justify-between px-4 py-3 bg-bg-elevated/95 backdrop-blur-md border-b border-white/5"
                style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
            >
                <button
                    onClick={onClose}
                    className="p-2 -ml-2 text-slate-400 hover:text-white transition-colors rounded-full hover:bg-white/10"
                >
                    <X className="w-6 h-6" />
                </button>
                <div className="flex items-center gap-3">
                    <CoinBalanceButton variant="profile" />
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-4 py-1.5 bg-white text-slate-900 font-bold text-sm rounded-lg border-b-[3px] border-slate-200 hover:bg-slate-50 active:border-b-0 active:translate-y-0.5 active:mt-0.5 shadow-md shadow-black/10 transition-all disabled:opacity-50 disabled:active:border-b-[3px] disabled:active:translate-y-0 disabled:active:mt-0 flex items-center justify-center min-w-[70px]"
                    >
                        {saving ? (
                            <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                        ) : (
                            'Save'
                        )}
                    </button>
                </div>
            </div>

            {/* 3D Preview */}
            <div className="flex-1 relative z-0 flex items-center justify-center overflow-hidden">
                <div className="w-full h-full max-h-[50vh]">
                    <canvas ref={canvasRef} className="w-full h-full touch-none" />
                </div>

                {/* Subtle shadow beneath avatar */}
                <div
                    className="absolute bottom-[15%] left-1/2 -translate-x-1/2 w-32 h-6 rounded-[50%] pointer-events-none"
                    style={{ background: 'radial-gradient(ellipse, rgba(0,0,0,0.12) 0%, transparent 70%)' }}
                />

                <div className="absolute bottom-8 left-0 right-0 flex justify-center pointer-events-none">
                    <div className="bg-black/40 backdrop-blur-md rounded-full px-4 py-1.5 border border-white/10 text-xs text-slate-300 shadow-xl mb-4">
                        Drag to rotate • Pinch to zoom
                    </div>
                </div>
            </div>

            {/* Controls Drawer */}
            <div className="relative z-10 bg-bg-elevated/90 backdrop-blur-xl border-t border-white/10 pb-safe shadow-2xl rounded-t-3xl -mt-6">
                {/* Category Tabs */}
                <div className="pt-4 px-4 pb-3">
                    <div className="flex justify-around items-center">
                        {CATEGORIES.map((cat) => {
                            const Icon = CATEGORY_ICONS[cat];
                            const isActive = activeCategory === cat;
                            return (
                                <button
                                    key={cat}
                                    onClick={() => setActiveCategory(cat)}
                                    className={`p-3 rounded-full transition-all duration-300 ${isActive
                                        ? 'text-white bg-white/10 scale-110'
                                        : 'text-white/40 hover:text-white/80'
                                        }`}
                                >
                                    <Icon className="w-6 h-6" />
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Options Grid */}
                <div
                    className="px-4 pb-8 pt-3 overflow-y-auto max-h-[40vh]"
                    style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
                >
                    <div className="flex items-center justify-between mb-2 px-1">
                        <h2 className="text-base font-semibold text-white">
                            Select {activeCategory === 'hair' ? 'Hair' : activeCategory.charAt(0).toUpperCase() + activeCategory.slice(1)}
                        </h2>
                    </div>

                    {optionsLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : (
                        <>
                            {/* Hair Color sub-section (only in Hair tab) */}
                            {activeCategory === 'hair' && (
                                <div className="mb-2">
                                    <h3 className="text-sm font-medium text-slate-400 mb-2 px-1">Hair Color</h3>
                                    <div className="flex gap-3 px-1">
                                        {Object.entries(HAIR_COLORS).map(([key, color]) => {
                                            const isSelected = config.hairColor === key;
                                            return (
                                                <button
                                                    key={key}
                                                    onClick={() => handleHairColorSelect(key)}
                                                    className={`
                                                        relative w-12 h-12 rounded-full transition-all duration-200 border-2
                                                        ${isSelected
                                                            ? 'border-brand-primary scale-110 shadow-[0_0_10px_rgba(var(--brand-primary-rgb),0.3)]'
                                                            : 'border-white/10 hover:border-white/30 hover:scale-105'
                                                        }
                                                    `}
                                                    style={{ backgroundColor: color }}
                                                    title={HAIR_COLOR_NAMES[key]}
                                                >
                                                    {isSelected && (
                                                        <div className="absolute inset-0 flex items-center justify-center">
                                                            <Check className="w-4 h-4 text-white drop-shadow-md" />
                                                        </div>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <h3 className="text-sm font-medium text-slate-400 mt-3 mb-1 px-1">Hairstyle</h3>
                                </div>
                            )}

                            {/* Main options grid */}
                            <div className="grid grid-cols-3 gap-3">
                                {getOptionsForCategory(activeCategory).map((option) => {
                                    const isSelected = getSelectedValue(activeCategory) === option.option_key;
                                    const available = isItemAvailable(option);
                                    const isLocked = !available;

                                    const skinColors: Record<string, string> = {
                                        '1': '#f5d0b0',
                                        '2': '#e0ac69',
                                        '3': '#2D1509',
                                    };
                                    const isSkin = activeCategory === 'skin';
                                    const isBody = activeCategory === 'body';

                                    {/* Skin and Body: simple circle + label, no card */ }
                                    if (isSkin || isBody) {
                                        return (
                                            <button
                                                key={option.id}
                                                onClick={() => handleOptionSelect(activeCategory, option.option_key, option)}
                                                className="group flex flex-col items-center gap-2 py-3"
                                            >
                                                {isSkin ? (
                                                    <div
                                                        className={`w-14 h-14 rounded-full shadow-lg border-2 group-hover:scale-110 transition-all ${isSelected ? 'border-brand-primary scale-110 shadow-[0_0_12px_rgba(var(--brand-primary-rgb),0.3)]' : 'border-white/20'
                                                            }`}
                                                        style={{ backgroundColor: skinColors[option.option_key] || '#ccc' }}
                                                    >
                                                        {isSelected && (
                                                            <div className="w-full h-full flex items-center justify-center">
                                                                <Check className="w-5 h-5 text-white drop-shadow-md" />
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className={`w-14 h-14 rounded-full flex items-center justify-center border-2 group-hover:scale-110 transition-all ${isSelected
                                                        ? 'border-brand-primary bg-brand-primary/20 scale-110 shadow-[0_0_12px_rgba(var(--brand-primary-rgb),0.3)]'
                                                        : 'border-white/10 bg-white/5'
                                                        }`}>
                                                        {option.option_key === 'male' ? (
                                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7 text-blue-400">
                                                                <circle cx="10" cy="14" r="5" />
                                                                <path d="M19 5l-5.4 5.4" />
                                                                <path d="M15 5h4v4" />
                                                            </svg>
                                                        ) : (
                                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7 text-pink-400">
                                                                <circle cx="12" cy="10" r="5" />
                                                                <path d="M12 15v7" />
                                                                <path d="M9 19h6" />
                                                            </svg>
                                                        )}
                                                    </div>
                                                )}
                                                <span className={`text-[10px] font-bold ${isSelected ? 'text-white' : 'text-slate-400'}`}>
                                                    {option.display_name}
                                                </span>
                                            </button>
                                        );
                                    }

                                    {/* All other categories: unified card layout */ }
                                    return (
                                        <button
                                            key={option.id}
                                            onClick={() => handleOptionSelect(activeCategory, option.option_key, option)}
                                            className={`
                                                group relative flex flex-col rounded-xl transition-all duration-200
                                                border
                                                ${isLocked ? 'opacity-70' : ''}
                                                ${isSelected
                                                    ? 'bg-brand-primary/20 border-brand-primary shadow-[0_0_10px_rgba(var(--brand-primary-rgb),0.3)]'
                                                    : 'bg-white/5 border-white/5 hover:border-white/15 hover:bg-white/8'
                                                }
                                            `}
                                        >
                                            {/* Thumbnail area */}
                                            <div className="relative aspect-square rounded-t-xl overflow-hidden flex items-center justify-center bg-white/[0.02]">
                                                <img
                                                    src={option.thumbnail_url}
                                                    alt={option.display_name}
                                                    className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-200 ${isLocked ? 'grayscale' : ''}`}
                                                    onError={(e) => {
                                                        (e.target as HTMLImageElement).style.display = 'none';
                                                    }}
                                                />

                                                {/* Selected checkmark */}
                                                {isSelected && !isLocked && (
                                                    <div className="absolute top-1.5 right-1.5 bg-brand-primary text-black rounded-full p-0.5">
                                                        <Check className="w-3 h-3" />
                                                    </div>
                                                )}

                                                {/* Streak lock overlay */}
                                                {isLocked && option.unlock_type === 'streak' && (
                                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-t-xl">
                                                        <div className="w-8 h-8 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center border border-white/20">
                                                            <Lock className="w-4 h-4 text-white" />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Name + Price/Status */}
                                            <div className="px-2 py-1.5">
                                                <p className={`text-[10px] font-bold truncate ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                                                    {option.display_name}
                                                </p>
                                                <div className="flex items-center gap-1 mt-0.5">
                                                    {isLocked && option.unlock_type === 'purchase' ? (
                                                        <>
                                                            <img src="/coin.png" alt="coins" className="w-3 h-3 object-contain" />
                                                            <span className="text-[10px] font-bold text-yellow-400">{option.coin_price}</span>
                                                        </>
                                                    ) : isLocked && option.unlock_type === 'streak' ? (
                                                        <span className="text-[10px] font-bold text-orange-400">🔥 {option.unlock_value} day streak</span>
                                                    ) : option.is_premium && !isLocked ? (
                                                        <span className="text-[10px] font-medium text-green-400">Owned</span>
                                                    ) : (
                                                        <span className="text-[10px] font-medium text-slate-500">Free</span>
                                                    )}
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Active costume indicator */}
                            {config.costume && activeCategory !== 'costume' && (
                                <p className="text-xs text-center text-slate-500 mt-4">
                                    Changing this will remove your costume
                                </p>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Purchase / Info Modal */}
            {purchaseConfirm && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-bg-elevated rounded-2xl p-6 mx-6 max-w-sm w-full border border-white/10 shadow-2xl">
                        <h3 className="text-lg font-bold text-white text-center mb-2">
                            {purchaseConfirm.unlock_type === 'streak' ? 'Locked Item' : `Unlock ${purchaseConfirm.display_name}?`}
                        </h3>

                        {purchaseConfirm.thumbnail_url && (
                            <div className="flex justify-center mb-4">
                                <img
                                    src={purchaseConfirm.thumbnail_url}
                                    alt={purchaseConfirm.display_name}
                                    className="w-40 h-40 object-cover rounded-2xl border border-white/10"
                                />
                            </div>
                        )}

                        {purchaseConfirm.unlock_type === 'streak' ? (
                            // Streak requirement info
                            <div className="text-center mb-6">
                                <p className="text-slate-300 text-sm mb-2">
                                    To unlock the <strong>{purchaseConfirm.display_name}</strong>, you need to maintain a Daily Login Streak for {purchaseConfirm.unlock_value} days.
                                </p>
                                <div className="inline-flex items-center gap-1.5 bg-orange-500/20 text-orange-400 px-3 py-1.5 rounded-lg border border-orange-500/30 font-bold text-sm">
                                    🔥 {purchaseConfirm.unlock_value} Day Streak Required
                                </div>
                            </div>
                        ) : (
                            // Purchase flow
                            <>
                                <div className="flex items-center justify-center gap-2 mb-4">
                                    <img src="/coin.png" alt="coins" className="w-6 h-6 object-contain drop-shadow" />
                                    <span className="text-xl font-bold text-yellow-400">{purchaseConfirm.coin_price}</span>
                                    <span className="text-sm text-slate-400">coins</span>
                                </div>

                                {coinBalance < purchaseConfirm.coin_price && (
                                    <p className="text-xs text-red-400 text-center mb-4">
                                        Not enough coins! You have {coinBalance.toLocaleString()}.
                                    </p>
                                )}
                            </>
                        )}

                        <div className="flex gap-3">
                            {purchaseConfirm.unlock_type === 'streak' ? (
                                <button
                                    onClick={() => setPurchaseConfirm(null)}
                                    className="w-full py-3 rounded-xl bg-white text-slate-900 font-bold text-sm border-b-[3px] border-slate-200 hover:bg-slate-50 active:border-b-0 active:translate-y-0.5 active:mt-0.5 shadow-md shadow-black/10 transition-all"
                                >
                                    Got it
                                </button>
                            ) : (
                                <>
                                    <button
                                        onClick={() => setPurchaseConfirm(null)}
                                        className="flex-1 py-3 rounded-xl bg-white/10 backdrop-blur-md text-white/70 hover:text-white font-bold text-sm border-b-4 border-white/10 active:border-b-0 active:translate-y-1 active:mt-1 transition-all"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handlePurchase}
                                        disabled={purchasing || coinBalance < purchaseConfirm.coin_price}
                                        className="flex-1 py-3 rounded-xl bg-white text-slate-900 font-bold text-sm border-b-[3px] border-slate-200 hover:bg-slate-50 active:border-b-0 active:translate-y-0.5 active:mt-0.5 shadow-md shadow-black/10 transition-all disabled:opacity-50 disabled:active:border-b-[3px] disabled:active:translate-y-0 disabled:active:mt-0 flex items-center justify-center gap-2"
                                    >
                                        {purchasing ? (
                                            <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                            <>
                                                <img src="/coin.png" alt="buy" className="w-4 h-4 object-contain drop-shadow-sm" />
                                                Buy
                                            </>
                                        )}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
