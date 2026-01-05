import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client with service role key for backend operations
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    'Missing Supabase environment variables. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
  );
}

// Service role client - bypasses RLS, use with caution
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Anon client for client-side operations (respects RLS)
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

export const supabaseAnon = supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
