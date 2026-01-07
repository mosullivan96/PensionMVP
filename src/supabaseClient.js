import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.REACT_APP_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const supabaseKey =
  process.env.REACT_APP_SUPABASE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    'Supabase not configured. Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_KEY in your .env file.'
  );
}

export const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

export const signUp = async (email, password) => {
  if (!supabase) {
    return { data: null, error: new Error('Supabase not configured.') };
  }
  return supabase.auth.signUp({ email, password });
};

