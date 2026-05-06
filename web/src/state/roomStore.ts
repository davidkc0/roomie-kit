
import { create } from 'zustand';
import { supabase } from '../lib/supabase';

export type RoomData = {
    id: number;
    name: string;
    slug: string;
    description?: string;
    owner_id?: string;
    created_at?: string;
};

type RoomState = {
    rooms: RoomData[];
    loading: boolean;
    error: string | null;
    fetchRooms: () => Promise<void>;
    createRoom: (name: string, slug: string) => Promise<boolean>;
    fetchPersonalRoom: (slug: string) => Promise<any>;
};

export const useRoomStore = create<RoomState>((set, get) => ({
    rooms: [],
    loading: false,
    error: null,

    fetchRooms: async () => {
        set({ loading: true, error: null });
        try {
            const { data: { user } } = await supabase.auth.getUser();

            let allowedOwnerIds: string[] = [];

            if (user) {
                // 1. Start with user's own ID
                allowedOwnerIds.push(user.id);

                // 2. Fetch accepted friendships
                const { data: friendships, error: friendError } = await supabase
                    .from('friendships')
                    .select('user_id_1, user_id_2')
                    .eq('status', 'accepted')
                    .or(`user_id_1.eq.${user.id},user_id_2.eq.${user.id}`);

                if (!friendError && friendships) {
                    // Extract friend IDs
                    const friendIds = friendships.map(f =>
                        f.user_id_1 === user.id ? f.user_id_2 : f.user_id_1
                    );
                    allowedOwnerIds = [...allowedOwnerIds, ...friendIds];
                }
            } else {
                // Not logged in: Show no custom rooms for now
                set({ rooms: [], loading: false });
                return;
            }

            // 3. Fetch rooms belonging to user or friends
            const { data, error } = await supabase
                .from('rooms')
                .select('*')
                .in('owner_id', allowedOwnerIds)
                .order('created_at', { ascending: false });

            if (error) throw error;
            set({ rooms: data as RoomData[], loading: false });
        } catch (err: any) {
            console.error('[RoomStore] Error fetching rooms:', err);
            set({ error: err.message, loading: false });
        }
    },

    createRoom: async (name: string, slug: string) => {
        set({ loading: true, error: null });
        try {
            const { data: { user } } = await supabase.auth.getUser();

            const { error } = await supabase
                .from('rooms')
                .insert([{
                    name,
                    slug,
                    owner_id: user?.id
                }]);

            if (error) throw error;

            // Refresh list
            await get().fetchRooms();
            return true;
        } catch (err: any) {
            console.error('[RoomStore] Error creating room:', err);
            const isUniqueError = err.code === '23505'; // Postgres unique violation
            set({
                error: isUniqueError ? 'Room ID already exists. Try another.' : err.message,
                loading: false
            });
            return false;
        }
    },

    fetchPersonalRoom: async (slug: string) => {
        set({ loading: true, error: null });
        try {
            // Remove '@' if present
            const cleanSlug = slug.replace('@', '').toLowerCase();

            const { data, error } = await supabase
                .rpc('get_room_by_slug_rpc', { slug_input: cleanSlug });

            if (error) throw error;

            // If data is empty array, room not found
            if (!data || data.length === 0) {
                throw new Error('Room not found');
            }

            return data[0];
        } catch (err: any) {
            console.error('[RoomStore] Error fetching personal room:', err);
            set({ error: err.message, loading: false });
            return null;
        }
    }
}));
