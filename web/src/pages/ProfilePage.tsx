import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../state/authStore';
import { useNavigate } from 'react-router-dom';
import { Settings, X, Camera, Image, Trash2, User, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { CoinBalanceButton } from '../components/CoinBalanceButton';
import { StreakBadge } from '../components/StreakBadge';
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { useOrientationLock } from '../hooks/useOrientationLock';
import { AvatarEditor } from '../components/AvatarEditor';
import { type AvatarConfig, DEFAULT_AVATAR_CONFIG } from '../avatars/avatarTextures';
import { GamePrimaryButton } from '../components/GamePrimaryButton';
import { InviteModal } from '../components/InviteModal';
import { appConfig, defaultAvatarUrl } from '../config/app';

export default function ProfilePage() {
    const { user, profile, refreshProfile, uploadProfilePhoto, restoreProfilePhoto, switchToAvatar } = useAuthStore();
    const navigate = useNavigate();
    const [isEditing, setIsEditing] = useState(false);
    const [editedBio, setEditedBio] = useState('');
    const [saving, setSaving] = useState(false);

    // Invite modal
    const [showInviteModal, setShowInviteModal] = useState(false);

    // Invited by name
    const [inviterName, setInviterName] = useState<string | null>(null);

    // Accurate friend count (only accepted friendships)
    const [friendCount, setFriendCount] = useState<number | null>(null);

    // Fetch accurate friend count on mount
    useEffect(() => {
        const fetchFriendCount = async () => {
            if (!user) return;

            console.log('[ProfilePage] Fetching friend count for user:', user.id);

            const { count, error, data } = await supabase
                .from('friendships')
                .select('*', { count: 'exact', head: true })
                .or(`and(user_id_1.eq.${user.id},status.eq.accepted),and(user_id_2.eq.${user.id},status.eq.accepted)`);

            console.log('[ProfilePage] Friend count result:', { count, error, data });

            if (!error && count !== null) {
                setFriendCount(count);
                console.log('[ProfilePage] Set friendCount to:', count);
            }
        };

        fetchFriendCount();
    }, [user]);

    // Fetch inviter name
    useEffect(() => {
        const fetchInviter = async () => {
            if (!profile?.invited_by) return;
            const { data } = await supabase
                .from('profiles')
                .select('username')
                .eq('id', profile.invited_by)
                .single();
            if (data) setInviterName(data.username);
        };
        fetchInviter();
    }, [profile?.invited_by]);

    // Ref for bio textarea to scroll into view on focus
    const bioTextareaRef = useRef<HTMLTextAreaElement>(null);

    // Lock to portrait on Profile page
    useOrientationLock(true);

    // Photo Selection State
    const [isPhotoSheetOpen, setIsPhotoSheetOpen] = useState(false);

    // Avatar Editor State
    const [isAvatarEditorOpen, setIsAvatarEditorOpen] = useState(false);

    // Initialize edit state when entering edit mode
    const startEditing = () => {
        setEditedBio(profile?.bio || '');
        setIsEditing(true);
    };

    const handleSaveProfile = async () => {
        if (!user) return;
        setSaving(true);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ bio: editedBio })
                .eq('id', user.id);

            if (error) throw error;

            await refreshProfile();
            setIsEditing(false);
        } catch (e) {
            console.error('Error saving profile:', e);
            alert('Failed to save profile');
        } finally {
            setSaving(false);
        }
    };

    const handleTakePhoto = async (source: CameraSource) => {
        try {
            setIsPhotoSheetOpen(false);
            const image = await CapacitorCamera.getPhoto({
                quality: 90,
                allowEditing: true,
                resultType: CameraResultType.Base64,
                source: source
            });

            if (image.base64String) {
                // Determine format
                const format = image.format;
                await uploadProfilePhoto(image.base64String, format);
            }
        } catch (error) {
            console.error('Error taking photo:', error);
        }
    };

    const handleRemoveCurrentPhoto = async () => {
        setIsPhotoSheetOpen(false);
        // "Remove" now means switch back to avatar (clearing active photo)
        // But we keep the custom_photo_url in DB if they want to restore it later
        await switchToAvatar();
    };

    const handleRestorePhoto = async () => {
        // Switch back to using the custom uploaded photo
        await restoreProfilePhoto();
    };

    const handleAvatarSelect = async () => {
        // Switch to showing avatar headshot
        await switchToAvatar();
    };

    const handleAvatarConfigSave = async (config: AvatarConfig) => {
        if (!user) return;
        try {
            const { error } = await supabase
                .from('profiles')
                .update({
                    avatar_config: config,
                    avatar_url: defaultAvatarUrl,
                    updated_at: new Date().toISOString()
                })
                .eq('id', user.id);

            if (error) throw error;

            await refreshProfile();
            setIsAvatarEditorOpen(false);
            setIsPhotoSheetOpen(false);
        } catch (e) {
            console.error('Error saving avatar config:', e);
            alert('Failed to save avatar');
        }
    };

    if (!user || !profile) return null;

    // Derived Display Image - use avatar_headshot_url from profile
    const avatarHeadshot = profile.avatar_headshot_url
        || `https://api.dicebear.com/7.x/initials/svg?seed=${profile.username}`;

    // Display Logic:
    // Left circle (Photo) preview ONLY shows custom_photo_url (the stashed uploaded photo).
    // If no photo has been uploaded, show placeholder.
    const customPhotoPreview = profile.custom_photo_url;

    // Active Selection Logic:
    // Photo mode is active ONLY if profile_image_url is set AND it's NOT the avatar headshot
    // Avatar mode is active when profile_image_url is null, empty, or matches the avatar headshot
    const isAvatarUrl = !profile.profile_image_url ||
        profile.profile_image_url === profile.avatar_headshot_url;
    const isPhotoModeActive = !!(profile.profile_image_url &&
        profile.profile_image_url.trim().length > 0 &&
        !isAvatarUrl);

    // Main Display Image (for non-edit mode)
    const displayImage = profile.profile_image_url || avatarHeadshot;

    return (
        <div className="h-[100dvh] bg-bg-base text-white pb-24 overflow-y-auto relative">
            {/* Header - no bottom border */}
            <div
                className="sticky top-0 z-10 bg-bg-base/80 backdrop-blur-md px-4 py-4"
            >
                <div className="relative mx-auto flex w-full max-w-xl items-center justify-between">
                    {isEditing ? (
                        <button onClick={() => setIsEditing(false)} className="p-2 -ml-2 text-slate-400">
                            <X className="w-5 h-5" />
                        </button>
                    ) : appConfig.features.invites && profile.account_status === 'active' ? (
                        <button
                            onClick={() => setShowInviteModal(true)}
                            className="px-4 py-1.5 bg-white text-slate-900 font-bold text-sm rounded-lg border-b-[3px] border-slate-200 hover:bg-slate-50 active:border-b-0 active:translate-y-0.5 active:mt-0.5 shadow-md shadow-black/10 transition-all"
                        >
                            Invite
                        </button>
                    ) : (
                        <div className="w-9" />
                    )}

                    <h1 className="absolute left-0 right-0 text-center text-lg font-bold pointer-events-none">
                        {isEditing ? 'Edit Profile' : ''}
                    </h1>

                    {isEditing ? (
                        <button
                            onClick={handleSaveProfile}
                            disabled={saving}
                            className="px-4 py-1.5 bg-white text-slate-900 font-bold text-sm rounded-lg border-b-[3px] border-slate-200 hover:bg-slate-50 active:border-b-0 active:translate-y-0.5 active:mt-0.5 shadow-md shadow-black/10 transition-all disabled:opacity-50 disabled:active:border-b-[3px] disabled:active:translate-y-0 disabled:active:mt-0 flex items-center justify-center min-w-[70px]"
                        >
                            {saving ? (
                                <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                            ) : (
                                'Save'
                            )}
                        </button>
                    ) : (
                        <div className="flex items-center gap-2">
                            {appConfig.features.economy && <StreakBadge />}
                            {appConfig.features.economy && <CoinBalanceButton variant="profile" />}
                            <button
                                onClick={() => navigate('/settings')}
                                className="p-2 text-white hover:text-slate-300 transition-colors"
                            >
                                <Settings className="w-6 h-6" />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <div className="mx-auto flex w-full max-w-xl flex-col px-4 py-6 sm:py-8 animate-fade-in">

                {/* Profile Header (Photo + Username) - Centered */}
                <div className="flex flex-col items-center gap-4 mb-6 relative">
                    {/* User Status Dot */}
                    <div className="flex items-end">
                        <div className="relative">
                            {isEditing ? (
                                <div className="flex items-center gap-6">
                                    {/* Edit Mode Photos - Keep Centered-style layout for edit mode only? Or left aligned? Let's keep existing edit UI but left aligned */}
                                    <button
                                        onClick={handleRestorePhoto}
                                        className={`relative w-[120px] h-[120px] rounded-full p-1 transition-all ${isPhotoModeActive ? 'ring-2 ring-brand-primary ring-offset-2 ring-offset-bg-base' : 'opacity-70 hover:opacity-100'}`}
                                    >
                                        <div className="w-full h-full rounded-full bg-bg-surface overflow-hidden relative border border-white/10">
                                            {customPhotoPreview ? (
                                                <img src={customPhotoPreview} alt="Custom" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-bg-surface">
                                                    <Camera className="w-8 h-8 text-slate-400" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="absolute bottom-0 right-0 bg-bg-elevated rounded-full p-1.5 border border-bg-base">
                                            <Camera className="w-3 h-3 text-white" />
                                        </div>
                                    </button>

                                    <button
                                        onClick={handleAvatarSelect}
                                        className={`relative w-[120px] h-[120px] rounded-full p-1 transition-all ${!isPhotoModeActive ? 'ring-2 ring-brand-primary ring-offset-2 ring-offset-bg-base' : 'opacity-70 hover:opacity-100'}`}
                                    >
                                        <div className="w-full h-full rounded-full bg-bg-surface overflow-hidden border border-white/10">
                                            <img src={avatarHeadshot} alt="Avatar" className="w-full h-full object-cover bg-[#202020]" />
                                        </div>
                                        <div className="absolute bottom-0 right-0 bg-bg-elevated rounded-full p-1.5 border border-bg-base">
                                            <User className="w-3 h-3 text-white" />
                                        </div>
                                    </button>
                                </div>
                            ) : (
                                /* Normal Profile Photo */
                                <div className="relative">
                                    <div className="w-[120px] h-[120px] rounded-full p-1 bg-bg-base relative z-10">
                                        <img
                                            src={displayImage}
                                            alt={profile.username}
                                            className="w-full h-full rounded-full object-cover bg-bg-surface"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/initials/svg?seed=${profile.username}`;
                                            }}
                                        />
                                    </div>
                                    {/* Online Status Dot */}
                                    <div className="absolute bottom-1 right-1 w-6 h-6 bg-green-500 rounded-full border-4 border-bg-base z-20"></div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Edit picture button - directly under profile pics in edit mode */}
                    {isEditing && (
                        <button
                            className="text-brand-primary text-sm font-medium text-center"
                            onClick={() => setIsPhotoSheetOpen(true)}
                        >
                            Edit picture or avatar
                        </button>
                    )}

                    {/* Username */}
                    <div className="text-center">
                        <h2 className="text-2xl font-bold">{profile.username || 'User'}</h2>

                    </div>
                </div>

                {/* Action Buttons */}
                {!isEditing && (
                    <div className="grid w-full max-w-md grid-cols-2 gap-3 self-center mb-8">
                        <GamePrimaryButton
                            className="w-full !py-2 !rounded-lg"
                            onClick={() => navigate('/avatar/edit', { state: { fromProfile: true } })}
                        >
                            Edit Avatar
                        </GamePrimaryButton>
                        <GamePrimaryButton
                            className="w-full !py-2 !rounded-lg"
                            onClick={startEditing}
                        >
                            Edit Profile
                        </GamePrimaryButton>
                    </div>
                )}

                {/* Invite Section (only in view mode for active users) */}
                {!isEditing && appConfig.features.invites && profile.account_status === 'active' && (inviterName || (profile.invites_used ?? 0) > 0) && (
                    <div className="w-full bg-bg-surface rounded-xl p-4 mb-4">
                        <h3 className="text-xs font-bold text-slate-400 mb-1">Invites</h3>
                        {inviterName && (
                            <p className="text-sm text-slate-300">Invited by <span className="text-white font-medium">{inviterName}</span></p>
                        )}
                        {(profile.invites_used ?? 0) > 0 && (
                            <p className="text-sm text-slate-400">Invited {profile.invites_used} friend{(profile.invites_used ?? 0) !== 1 ? 's' : ''}</p>
                        )}
                    </div>
                )}

                {/* About Me Card */}
                <div className="w-full bg-bg-surface rounded-xl p-4 mb-4">
                    <h3 className="text-xs font-bold text-slate-400 mb-2">About Me</h3>

                    {isEditing ? (
                        <textarea
                            ref={bioTextareaRef}
                            value={editedBio}
                            onChange={(e) => setEditedBio(e.target.value)}
                            onFocus={() => {
                                // Scroll the parent scroll container so the textarea is visible
                                // WITHOUT using scrollIntoView which displaces the sticky header on iOS
                                setTimeout(() => {
                                    const textarea = bioTextareaRef.current;
                                    if (!textarea) return;
                                    // Find the scrollable parent (the page container)
                                    const scrollParent = textarea.closest('.overflow-y-auto');
                                    if (scrollParent) {
                                        const headerHeight = 72; // rough sticky header height
                                        const targetTop = textarea.offsetTop - headerHeight - 16;
                                        scrollParent.scrollTo({ top: targetTop, behavior: 'smooth' });
                                    }
                                }, 300);
                            }}
                            onBlur={() => {
                                // Force scroll correction when keyboard dismisses on iOS
                                // This prevents the sticky header from staying stuck off-screen
                                setTimeout(() => {
                                    window.scrollTo(0, 0);
                                }, 100);
                            }}
                            className="w-full bg-bg-base rounded-lg p-3 text-white focus:outline-none focus:ring-1 focus:ring-brand-primary transition resize-none min-h-[100px] border border-white/10"
                            placeholder="Tell us about yourself..."
                        />
                    ) : (
                        <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
                            {profile.bio || "No bio yet."}
                        </p>
                    )}
                </div>

                {/* Friends Button Card (Only in View Mode) */}
                {!isEditing && (
                    <button
                        onClick={() => navigate('/friends')}
                        className="w-full bg-bg-surface rounded-xl p-4 flex items-center justify-between hover:bg-bg-elevated transition group"
                    >
                        <span className="font-medium">Friends</span>
                        <div className="flex items-center gap-2 text-slate-400 group-hover:text-white transition-colors">
                            <span>{friendCount ?? 0}</span>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </div>
                    </button>
                )}
            </div>

            {/* Custom Bottom Sheet / Drawer for Photo Options */}
            {isPhotoSheetOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 bg-black/60 z-[60] backdrop-blur-sm transition-opacity"
                        onClick={() => setIsPhotoSheetOpen(false)}
                    />

                    {/* Drawer */}
                    <div className="fixed inset-x-0 bottom-0 z-[70] px-3 pointer-events-none">
                        <div className="mx-auto w-full max-w-md bg-bg-surface rounded-t-2xl p-6 pb-12 animate-slide-up border-t border-border pointer-events-auto shadow-2xl">
                            <div className="w-12 h-1.5 bg-bg-elevated rounded-full mx-auto mb-6" />

                            <div className="space-y-2">
                                <button
                                    onClick={() => handleTakePhoto(CameraSource.Photos)}
                                    className="w-full flex items-center gap-3 p-4 bg-bg-elevated hover:bg-bg-elevated/80 rounded-xl transition text-left"
                                >
                                    <Image className="w-6 h-6 text-white" />
                                    <span className="font-medium text-white">Choose from library</span>
                                </button>

                                <button
                                    onClick={() => handleTakePhoto(CameraSource.Camera)}
                                    className="w-full flex items-center gap-3 p-4 bg-bg-elevated hover:bg-bg-elevated/80 rounded-xl transition text-left"
                                >
                                    <Camera className="w-6 h-6 text-white" />
                                    <span className="font-medium text-white">Take Photo</span>
                                </button>

                                {isPhotoModeActive && (
                                    <button
                                        onClick={handleRemoveCurrentPhoto}
                                        className="w-full flex items-center gap-3 p-4 bg-bg-elevated hover:bg-bg-elevated/80 rounded-xl transition text-left text-red-400"
                                    >
                                        <Trash2 className="w-6 h-6" />
                                        <span className="font-medium">Remove current picture</span>
                                    </button>
                                )}

                                <div className="border-t border-border my-2" />

                                <button
                                    onClick={() => setIsAvatarEditorOpen(true)}
                                    className="w-full flex items-center gap-3 p-4 bg-bg-elevated hover:bg-bg-elevated/80 rounded-xl transition text-left"
                                >
                                    <Sparkles className="w-6 h-6 text-brand-primary" />
                                    <span className="font-medium text-white">Edit Avatar</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Avatar Editor Modal */}
            {isAvatarEditorOpen && (
                <AvatarEditor
                    initialConfig={profile?.avatar_config || DEFAULT_AVATAR_CONFIG}
                    onSave={handleAvatarConfigSave}
                    onClose={() => setIsAvatarEditorOpen(false)}
                />
            )}

            {/* Invite Modal */}
            <InviteModal isOpen={showInviteModal} onClose={() => setShowInviteModal(false)} />
        </div>
    );
}
