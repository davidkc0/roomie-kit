import { useState } from 'react';
import { ItemPalette } from './ItemPalette';

type EditControlsProps = {
    isEditMode: boolean;
    onToggleEditMode: () => void;
    onSave: () => void;
    onSelectItem: (itemId: string) => void;
    onSelectFloor?: (textureId: string) => void;
    onSelectWall?: (textureId: string) => void;
    selectedItemId: string | null;
    isPlacementLocked: boolean;
    onConfirmPlacement: () => void;
    onRotatePlacement: () => void;
    onCancelPlacement: () => void;
    onDelete?: () => void;
};

export function EditControls({
    isEditMode,
    onToggleEditMode,
    onSave,
    onSelectItem,
    onSelectFloor,
    onSelectWall,
    selectedItemId,
    isPlacementLocked,
    onConfirmPlacement,
    onRotatePlacement,
    onCancelPlacement,
    onDelete
}: EditControlsProps) {
    const [drawerOpen, setDrawerOpen] = useState(true);

    return (
        <div className="absolute inset-0 pointer-events-none z-50 flex flex-col justify-between">
            {/* Top Bar - Glassmorphism Header */}
            <div className="pt-[calc(env(safe-area-inset-top)+1rem)] px-4 pb-4 flex items-center justify-between pointer-events-auto bg-gradient-to-b from-black/60 to-transparent">
                {/* ... (Unchanged) ... */}
                <div className="flex gap-3">
                    <button
                        onClick={onToggleEditMode}
                        className="h-10 px-5 rounded-xl bg-white/10 backdrop-blur-md border-b-4 border-white/10 active:border-b-0 active:translate-y-1 active:mt-1 text-white/70 hover:text-white font-bold text-sm transition-all active:scale-95 flex items-center justify-center"
                    >
                        Exit
                    </button>
                    <button
                        onClick={onSave}
                        className="h-10 px-5 rounded-xl bg-white text-slate-900 font-bold text-sm border-b-[3px] border-slate-200 hover:bg-slate-50 active:border-b-0 active:translate-y-0.5 active:mt-0.5 shadow-md shadow-black/10 transition-all flex items-center gap-2"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                        Save
                    </button>
                </div>
            </div>

            {/* Middle Area - Placement Controls */}
            {/* Show controls WHENEVER an item is selected, not just when locked. 
                This allows rotating/canceling immediately. */}
            <div className="flex-1 relative pointer-events-none">
                {selectedItemId && (
                    <div className="absolute inset-0 flex items-end justify-center pb-8 pointer-events-none">
                        <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-3xl p-2 flex gap-4 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300 mb-20 pointer-events-auto">
                            <button
                                onClick={onCancelPlacement}
                                className="w-14 h-14 rounded-2xl bg-slate-800 text-red-400 hover:bg-slate-700 flex items-center justify-center transition-colors hover:text-red-300"
                                title="Cancel"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>

                            {/* Delete Button (Only when editing existing) */}
                            {onDelete && (
                                <button
                                    onClick={onDelete}
                                    className="w-14 h-14 rounded-2xl bg-red-900/50 text-red-400 hover:bg-red-900 flex items-center justify-center transition-colors border border-red-500/20"
                                    title="Delete Item"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-7 h-7">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                    </svg>
                                </button>
                            )}
                            <div className="w-px bg-white/10 my-2"></div>
                            <button
                                onClick={onRotatePlacement}
                                className="w-14 h-14 rounded-2xl bg-slate-800 text-blue-400 hover:bg-slate-700 flex items-center justify-center transition-colors hover:text-blue-300"
                                title="Rotate"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                                </svg>
                            </button>
                            <button
                                onClick={onConfirmPlacement}
                                className="w-14 h-14 rounded-2xl bg-white text-black hover:bg-gray-100 flex items-center justify-center transition-all shadow-lg"
                                title="Confirm"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-8 h-8">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                                </svg>
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom - Collapsible Palette Drawer */}
            {/* Only show if NO item is selected */}
            {!selectedItemId && (
                <div className="pointer-events-auto">
                    {drawerOpen ? (
                        <>
                            {/* Collapse button */}
                            <div className="flex justify-center pb-1">
                                <button
                                    onClick={() => setDrawerOpen(false)}
                                    className="px-4 py-1.5 rounded-t-xl bg-bg-elevated/90 backdrop-blur-xl border border-b-0 border-white/10 text-white/60 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                                    </svg>
                                    Hide
                                </button>
                            </div>
                            <ItemPalette onSelectItem={onSelectItem} onSelectFloor={onSelectFloor} onSelectWall={onSelectWall} />
                        </>
                    ) : (
                        /* Collapsed state — small button at bottom */
                        <div className="flex justify-center" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
                            <button
                                onClick={() => setDrawerOpen(true)}
                                className="px-6 py-3 rounded-2xl bg-bg-elevated/90 backdrop-blur-xl border border-white/10 text-white font-bold text-sm shadow-2xl flex items-center gap-2 active:scale-95 transition-all"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
                                </svg>
                                Items
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
