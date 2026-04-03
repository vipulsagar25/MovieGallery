import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getSupabase, apiFetch } from '../config/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);           // { email, supabaseUid, internalId, displayName, isNew }
  const [loading, setLoading] = useState(true);       // True while checking session on mount
  const [authError, setAuthError] = useState('');

  // ── Resolve Supabase user → internal profile ──
  const resolveProfile = useCallback(async (supabaseUser) => {
    try {
      const profile = await apiFetch('/auth/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supabase_uid: supabaseUser.id,
          email: supabaseUser.email || '',
        }),
      });
      setUser({
        email: supabaseUser.email,
        supabaseUid: supabaseUser.id,
        internalId: profile.internal_user_id,
        displayName: profile.display_name,
        isNew: profile.is_new_user,
        isDemo: false,
        isAdmin: supabaseUser.email === 'admin@movieai.com',
      });
    } catch (err) {
      console.error('Profile resolution failed:', err);
      // Fallback: use client-side hash
      const fallbackId = hashUuid(supabaseUser.id);
      setUser({
        email: supabaseUser.email,
        supabaseUid: supabaseUser.id,
        internalId: fallbackId,
        displayName: supabaseUser.email?.split('@')[0] || 'User',
        isNew: true,
        isDemo: false,
        isAdmin: supabaseUser.email === 'admin@movieai.com',
      });
    }
  }, []);

  // ── Check existing session on mount ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = await getSupabase();
      if (!sb) { setLoading(false); return; }

      // Check existing session
      const { data: { session } } = await sb.auth.getSession();
      if (session?.user && !cancelled) {
        await resolveProfile(session.user);
      }
      if (!cancelled) setLoading(false);

      // Listen for future auth changes (login/logout/token refresh)
      const { data: { subscription } } = sb.auth.onAuthStateChange(
        async (event, session) => {
          if (event === 'SIGNED_IN' && session?.user) {
            await resolveProfile(session.user);
          } else if (event === 'SIGNED_OUT') {
            setUser(null);
          }
        }
      );

      return () => subscription?.unsubscribe();
    })();

    return () => { cancelled = true; };
  }, [resolveProfile]);

  // ── Sign In ──
  const signIn = useCallback(async (email, password) => {
    setAuthError('');
    const sb = await getSupabase();
    if (!sb) { setAuthError('Supabase not configured'); return false; }

    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) { setAuthError(error.message); return false; }

    await resolveProfile(data.user);
    return true;
  }, [resolveProfile]);

  // ── Sign Up ──
  const signUp = useCallback(async (email, password) => {
    setAuthError('');
    const sb = await getSupabase();
    if (!sb) { setAuthError('Supabase not configured'); return false; }

    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) { setAuthError(error.message); return false; }

    // If email confirmation is required, session will be null
    if (!data.session) {
      setAuthError('');
      return 'confirm'; // Signal to show confirmation message
    }

    await resolveProfile(data.user);
    return true;
  }, [resolveProfile]);

  // ── Demo Login ──
  const demoLogin = useCallback((userId) => {
    setAuthError('');
    setUser({
      email: null,
      supabaseUid: null,
      internalId: userId,
      displayName: `User ${userId}`,
      isNew: false,
      isDemo: true,
      isAdmin: userId === 1,
    });
  }, []);

  // ── Logout ──
  const logout = useCallback(async () => {
    const sb = await getSupabase();
    if (sb) await sb.auth.signOut();
    setUser(null);
  }, []);

  const value = {
    user,
    loading,
    authError,
    setAuthError,
    signIn,
    signUp,
    demoLogin,
    logout,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// ── Fallback hash (same as original app.js) ──
function hashUuid(uuid) {
  if (!uuid) return 1;
  let h = 0;
  for (let i = 0; i < uuid.length; i++) {
    h = ((h << 5) - h) + uuid.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h % 330975) + 1;
}
