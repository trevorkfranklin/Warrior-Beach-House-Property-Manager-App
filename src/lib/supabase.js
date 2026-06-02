import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Log at startup so we can diagnose env var issues in production
console.log('[supabase] URL:', supabaseUrl ?? 'MISSING');
console.log('[supabase] Key:', supabaseKey ? supabaseKey.slice(0, 20) + '…' : 'MISSING');

export const supabase = createClient(
  supabaseUrl ?? '',
  supabaseKey ?? ''
);
