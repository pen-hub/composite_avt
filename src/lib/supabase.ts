import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const SUPABASE_BADGE_TABLE = import.meta.env.VITE_SUPABASE_TABLE || 'badge_images';
export const SUPABASE_BADGE_SAVED_VIEW = import.meta.env.VITE_SUPABASE_SAVED_VIEW || 'v_badge_images_saved';

let client: ReturnType<typeof createClient> | null = null;

export const getSupabaseClient = () => {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Thiếu cấu hình Supabase: VITE_SUPABASE_URL và (VITE_SUPABASE_ANON_KEY hoặc VITE_SUPABASE_PUBLISHABLE_KEY).');
  }

  if (!client) {
    client = createClient(supabaseUrl, supabaseKey);
  }

  return client;
};
