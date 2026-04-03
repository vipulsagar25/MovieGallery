import { createClient } from '@supabase/supabase-js';

// ── API Base URL ──
// In dev mode, Vite proxies /api → http://127.0.0.1:8000
// In production, you'd set VITE_API_URL to your deployed backend
export const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

// ── Supabase client (lazy-init from backend config) ──
let _supabase = null;
let _configLoaded = false;

export async function getSupabase() {
  if (_supabase) return _supabase;
  if (_configLoaded) return null; // Already tried, no keys available

  try {
    const res = await fetch(`${API_BASE}/config`);
    if (!res.ok) throw new Error('Config endpoint failed');
    const config = await res.json();
    _configLoaded = true;

    if (
      config.supabase_url &&
      config.supabase_anon_key &&
      config.supabase_url !== 'https://your-project.supabase.co'
    ) {
      _supabase = createClient(config.supabase_url, config.supabase_anon_key);
      return _supabase;
    }
  } catch (err) {
    console.warn('Could not load Supabase config from backend:', err);
    _configLoaded = true;
  }
  return null;
}

// ── Convenience fetcher ──
export async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json();
}
