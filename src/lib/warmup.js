import { supabase } from './supabase';

let warmed = false;

// Pings PostgREST on first call so it wakes up before data hooks run.
// Supabase free tier cold-starts the REST API after inactivity.
export async function warmupPostgREST() {
  if (warmed) return;
  try {
    await Promise.race([
      supabase.from('profiles').select('id').limit(1),
      new Promise(r => setTimeout(r, 30000)),
    ]);
    warmed = true;
  } catch {}
}
