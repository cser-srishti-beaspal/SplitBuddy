
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
console.log('SUPABASE URL:', supabaseUrl);
console.log('SUPABASE KEY:', supabaseAnonKey?.slice(0, 20));
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase environment variables (VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY) are missing. Please configure them in your local .env or Vercel environment settings.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
export default supabase;
