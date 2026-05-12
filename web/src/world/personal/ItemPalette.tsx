import { useState, useEffect } from 'react';
import { Lock } from 'lucide-react';
import { brandAssetUrls } from '../../config/customization';
import { resolveAssetUrl } from '../../config/r2';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../state/authStore';

// Types for items from Supabase
type CatalogItem = {
    id: string;
    name: string;
    category: string;
    model_url: string;
    thumbnail_url: string | null;
    price_coins: number;
};

// Fallback data in case DB fetch fails
const FALLBACK_FURNITURE = [
    { id: '1', name: 'Chair', category: 'furniture', model_url: 'Chair.glb', thumbnail_url: null, price_coins: 0 },
    { id: '2', name: 'Table', category: 'furniture', model_url: 'Table.glb', thumbnail_url: null, price_coins: 0 },
    { id: '3', name: 'Couch', category: 'furniture', model_url: 'Couch.glb', thumbnail_url: null, price_coins: 0 },
    { id: '4', name: 'Lamp', category: 'furniture', model_url: 'Lamp.glb', thumbnail_url: null, price_coins: 0 },
];

// Hook to fetch items catalog from Supabase
function useItemsCatalog() {
    const [furniture, setFurniture] = useState<CatalogItem[]>([]);
    const [decor, setDecor] = useState<CatalogItem[]>([]);
    const [floors, setFloors] = useState<CatalogItem[]>([]);
    const [walls, setWalls] = useState<CatalogItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchItems() {
            try {
                const { data, error } = await supabase
                    .from('items')
                    .select('id, name, category, model_url, thumbnail_url, price_coins')
                    .in('category', ['furniture', 'decoration', 'floor', 'wall']);

                if (error) {
                    console.error('[ItemPalette] Error fetching items:', error);
                    setFurniture(FALLBACK_FURNITURE);
                    return;
                }

                if (data) {
                    setFurniture(data.filter(item => item.category === 'furniture'));
                    setDecor(data.filter(item => item.category === 'decoration'));
                    setFloors(data.filter(item => item.category === 'floor'));
                    setWalls(data.filter(item => item.category === 'wall'));
                }
            } catch (err) {
                console.error('[ItemPalette] Exception fetching items:', err);
                setFurniture(FALLBACK_FURNITURE);
            } finally {
                setLoading(false);
            }
        }

        fetchItems();
    }, []);

    return { furniture, decor, floors, walls, loading };
}

// Emoji fallbacks for furniture without thumbnail images
const EMOJI_FALLBACKS: Record<string, string> = {
    'Chair.glb': '🪑',
    'Table.glb': '🪵',
    'Couch.glb': '🛋️',
    'Lamp.glb': '💡',
};

type Category = 'furniture' | 'decor' | 'floor' | 'wall';

type ItemPaletteProps = {
    onSelectItem: (itemId: string) => void;
    onSelectFloor?: (textureId: string) => void;
    onSelectWall?: (textureId: string) => void;
};

// Export for other components that need furniture items (e.g., PlacementGhost)
export function useFurnitureItems() {
    const { furniture, loading } = useItemsCatalog();
    return { items: furniture, loading };
}

export function ItemPalette({ onSelectItem, onSelectFloor, onSelectWall }: ItemPaletteProps) {
    const [selectedCategory, setSelectedCategory] = useState<Category>('furniture');
    const { furniture, decor, floors, walls, loading } = useItemsCatalog();
    const [ownedItems, setOwnedItems] = useState<Set<string>>(new Set());
    const [coinBalance, setCoinBalance] = useState(0);
    const [purchaseConfirm, setPurchaseConfirm] = useState<CatalogItem | null>(null);
    const [purchasing, setPurchasing] = useState(false);

    // Fetch owned furniture + coin balance on mount
    useEffect(() => {
        const fetchOwnership = async () => {
            const user = useAuthStore.getState().user;
            if (!user) return;

            const { data: ownedData } = await supabase
                .rpc('get_user_owned_furniture', { p_user_id: user.id });
            if (ownedData) {
                setOwnedItems(new Set(ownedData as string[]));
            }

            const { data: coinsData } = await supabase
                .from('user_coins')
                .select('balance')
                .eq('user_id', user.id)
                .single();
            if (coinsData) {
                setCoinBalance(coinsData.balance);
            }
        };
        fetchOwnership();
    }, []);

    const handlePurchase = async () => {
        if (!purchaseConfirm) return;
        const user = useAuthStore.getState().user;
        if (!user) return;

        setPurchasing(true);
        try {
            const { data, error } = await supabase.rpc('purchase_furniture_item', {
                p_user_id: user.id,
                p_item_id: purchaseConfirm.id,
            });

            if (error) {
                console.error('[ItemPalette] Purchase error:', error);
                return;
            }

            if (data?.success) {
                setOwnedItems(prev => new Set([...prev, purchaseConfirm.id]));
                if (data.new_balance !== undefined) {
                    setCoinBalance(data.new_balance);
                }
                // Place the item after purchase
                onSelectItem(purchaseConfirm.id);
                setPurchaseConfirm(null);
            } else {
                console.error('[ItemPalette] Purchase failed:', data?.error);
            }
        } finally {
            setPurchasing(false);
        }
    };

    const categories: { key: Category; label: string }[] = [
        { key: 'furniture', label: 'Furniture' },
        { key: 'decor', label: 'Decor' },
        { key: 'floor', label: 'Floor' },
        { key: 'wall', label: 'Wall' },
    ];

    // Get items for current category
    const currentItems = selectedCategory === 'furniture' ? furniture
        : selectedCategory === 'decor' ? decor
            : selectedCategory === 'floor' ? floors
                : walls;

    const handleItemClick = (item: CatalogItem) => {
        if (selectedCategory === 'floor') {
            onSelectFloor?.(item.model_url);
        } else if (selectedCategory === 'wall') {
            onSelectWall?.(item.model_url);
        } else if (item.price_coins > 0 && !ownedItems.has(item.id)) {
            // Paid item not yet owned — show purchase modal
            setPurchaseConfirm(item);
        } else {
            onSelectItem(item.id);
        }
    };

    const getThumbnailSrc = (item: CatalogItem) => {
        if (item.thumbnail_url) return resolveAssetUrl(item.thumbnail_url, selectedCategory === 'wall' ? 'wall' : selectedCategory === 'floor' ? 'floor' : 'furniture');
        if (selectedCategory === 'floor') return resolveAssetUrl(item.model_url, 'floor');
        if (selectedCategory === 'wall') return resolveAssetUrl(item.model_url, 'wall');
        return null;
    };

    return (
        <>
            <div className="bg-bg-elevated/90 backdrop-blur-xl border-t border-white/10 rounded-t-3xl shadow-2xl pb-12 animate-in slide-in-from-bottom duration-300">

                {/* Header / Tabs */}
                <div className="px-6 pt-4 pb-2">
                    <div className="flex gap-4 border-b border-white/5 overflow-x-auto scrollbar-hide">
                        {categories.map(cat => (
                            <button
                                key={cat.key}
                                className={`pb-3 text-sm font-bold uppercase tracking-wider transition-colors relative whitespace-nowrap ${selectedCategory === cat.key ? 'text-white' : 'text-text-tertiary hover:text-white'
                                    }`}
                                onClick={() => setSelectedCategory(cat.key)}
                            >
                                {cat.label}
                                {selectedCategory === cat.key && (
                                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-accent rounded-full shadow-[0_0_8px_var(--color-brand-accent)]"></div>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Scrollable Content — Vertical Grid */}
                <div
                    className="overflow-y-auto px-4 pt-4 max-h-[35vh]"
                    style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
                >
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : currentItems.length === 0 ? (
                        <div className="text-center py-8 text-slate-500 text-sm italic">
                            No items in this category yet.
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 gap-3">
                            {currentItems.map(item => {
                                const thumbSrc = getThumbnailSrc(item);
                                const isLocked = item.price_coins > 0 && !ownedItems.has(item.id);
                                return (
                                    <button
                                        key={item.id}
                                        className={`group relative flex flex-col rounded-xl border transition-all active:scale-[0.97] ${isLocked ? 'bg-white/5 border-white/5' : 'bg-white/5 border-white/5 hover:border-white/15 hover:bg-white/8'
                                            }`}
                                        onClick={() => handleItemClick(item)}
                                    >
                                        {/* Thumbnail */}
                                        <div className={`relative aspect-square rounded-t-xl overflow-hidden flex items-center justify-center bg-white/[0.02] ${isLocked ? 'opacity-70' : ''}`}>
                                            {thumbSrc ? (
                                                <img
                                                    src={thumbSrc}
                                                    alt={item.name}
                                                    className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-200 ${isLocked ? 'grayscale' : ''}`}
                                                />
                                            ) : (
                                                <span className="text-3xl drop-shadow-md">
                                                    {EMOJI_FALLBACKS[item.model_url] || '📦'}
                                                </span>
                                            )}

                                            {/* Lock overlay for unowned paid items */}
                                            {isLocked && (
                                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-t-xl">
                                                    <div className="w-8 h-8 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center border border-white/20">
                                                        <Lock className="w-4 h-4 text-white" />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        {/* Name + Price */}
                                        <div className="px-2 py-1.5 flex flex-col h-[52px]">
                                            <p className="text-[11px] font-bold text-white line-clamp-2 leading-tight text-left">
                                                {item.name}
                                            </p>
                                            <div className="flex items-center gap-1 mt-auto">
                                                {item.price_coins > 0 && isLocked ? (
                                                    <>
                                                        <img src={brandAssetUrls.coinIcon} alt="coins" className="w-3 h-3 object-contain" />
                                                        <span className="text-[10px] font-bold text-yellow-400">{item.price_coins}</span>
                                                    </>
                                                ) : item.price_coins > 0 && !isLocked ? (
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
                    )}
                </div>
            </div>

            {/* Purchase Confirmation Modal — outside drawer to avoid backdrop-blur stacking context */}
            {purchaseConfirm && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-bg-elevated rounded-2xl p-6 mx-6 max-w-sm w-full border border-white/10 shadow-2xl">
                        <h3 className="text-lg font-bold text-white text-center mb-2">
                            Unlock {purchaseConfirm.name}?
                        </h3>

                        {purchaseConfirm.thumbnail_url && (
                            <div className="flex justify-center mb-4">
                                <img
                                    src={getThumbnailSrc(purchaseConfirm) || ''}
                                    alt={purchaseConfirm.name}
                                    className="w-40 h-40 object-cover rounded-2xl border border-white/10"
                                />
                            </div>
                        )}

                        <div className="flex items-center justify-center gap-2 mb-4">
                            <img src={brandAssetUrls.coinIcon} alt="coins" className="w-6 h-6 object-contain drop-shadow" />
                            <span className="text-xl font-bold text-yellow-400">{purchaseConfirm.price_coins}</span>
                            <span className="text-sm text-slate-400">coins</span>
                        </div>

                        {coinBalance < purchaseConfirm.price_coins && (
                            <p className="text-xs text-red-400 text-center mb-4">
                                Not enough coins! You have {coinBalance.toLocaleString()}.
                            </p>
                        )}

                        <div className="flex gap-3">
                            <button
                                onClick={() => setPurchaseConfirm(null)}
                                className="flex-1 py-3 rounded-xl bg-white/10 backdrop-blur-md text-white/70 hover:text-white font-bold text-sm border-b-4 border-white/10 active:border-b-0 active:translate-y-1 active:mt-1 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handlePurchase}
                                disabled={purchasing || coinBalance < purchaseConfirm.price_coins}
                                className="flex-1 py-3 rounded-xl bg-white text-slate-900 font-bold text-sm border-b-[3px] border-slate-200 hover:bg-slate-50 active:border-b-0 active:translate-y-0.5 active:mt-0.5 shadow-md shadow-black/10 transition-all disabled:opacity-50 disabled:active:border-b-[3px] disabled:active:translate-y-0 disabled:active:mt-0 flex items-center justify-center gap-2"
                            >
                                {purchasing ? (
                                    <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <>
                                        <img src={brandAssetUrls.coinIcon} alt="buy" className="w-4 h-4 object-contain drop-shadow-sm" />
                                        Buy
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
