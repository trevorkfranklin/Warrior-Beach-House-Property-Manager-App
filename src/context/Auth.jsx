import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession]     = useState(null);
  const [profile, setProfile]     = useState(null);
  const [users, setUsers]         = useState([]);
  const [auditLog, setAuditLog]   = useState([]);
  const [userCount, setUserCount] = useState(null);
  const [loading, setLoading]     = useState(true);

  function profileFromSession(userObj) {
    const role = userObj?.user_metadata?.role || userObj?.app_metadata?.role || 'viewer';
    return { id: userObj?.id, email: userObj?.email, role };
  }

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 8000);

    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      clearTimeout(t);
      setSession(s);
      if (s) {
        // Set role immediately from JWT so sidebar shows correct role without waiting for DB
        setProfile(profileFromSession(s.user));
        // Then load the full profile from DB in background (PostgREST may be cold-starting)
        supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle()
          .then(({ data }) => { if (data) setProfile(data); });
      } else {
        try {
          const { data } = await supabase.rpc('get_user_count');
          setUserCount(data ?? 0);
        } catch {
          setUserCount(0);
        }
      }
      setLoading(false);
    }).catch(() => { clearTimeout(t); setLoading(false); });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, s) => {
      if (event === 'SIGNED_OUT') {
        setSession(null);
        setProfile(null);
        window.location.href = '/';
        return;
      }
      if (s) {
        setSession(s);
        setProfile(profileFromSession(s.user));
        supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle()
          .then(({ data }) => { if (data) setProfile(data); });
      }
    });

    return () => { clearTimeout(t); subscription.unsubscribe(); };
  }, []);

  const login = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.error('[login] Supabase error:', error);
      return { error: error.message };
    }
    return { success: true };
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut({ scope: 'local' });
    window.location.href = '/';
  }, []);

  const createUser = useCallback(async (email, password, role) => {
    const { data: { session: adminSession } } = await supabase.auth.getSession();

    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { role } },
    });
    if (error) return { error: error.message };

    if (data.user) {
      await supabase.from('profiles').upsert({ id: data.user.id, email, role }, { onConflict: 'id' });
    }

    if (adminSession?.access_token) {
      await supabase.auth.setSession({
        access_token:  adminSession.access_token,
        refresh_token: adminSession.refresh_token,
      });
    }

    await loadUsers();
    return { success: true };
  }, []);

  const updateRole = useCallback(async (userId, role) => {
    await supabase.from('profiles').update({ role }).eq('id', userId);
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u));
  }, []);

  const updateEmail = useCallback(async (userId, email) => {
    await supabase.from('profiles').update({ email }).eq('id', userId);
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, email } : u));
  }, []);

  const changePassword = useCallback(async (userId, newPassword) => {
    const { data: { session: s } } = await supabase.auth.getSession();
    if (userId !== s?.user?.id)
      return { error: 'Password changes for other users must be done via the Supabase Dashboard.' };
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { error: error.message };
    return { success: true };
  }, []);

  const deleteUser = useCallback(async (userId) => {
    await supabase.from('profiles').delete().eq('id', userId);
    setUsers(prev => prev.filter(u => u.id !== userId));
  }, []);

  const loadUsers = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').order('created_at');
    setUsers(data || []);
  }, []);

  const loadAuditLog = useCallback(async () => {
    const { data } = await supabase.from('audit_log').select('*')
      .order('created_at', { ascending: false }).limit(500);
    setAuditLog((data || []).map(r => ({
      id: r.id, timestamp: r.created_at, userId: r.user_id,
      username: r.username, action: r.action, details: r.details,
    })));
  }, []);

  const isAdmin    = profile?.role === 'admin';
  const canEdit    = isAdmin;
  const needsSetup = !loading && !session && userCount === 0;

  return (
    <AuthContext.Provider value={{
      session, profile, users, auditLog, loading,
      needsSetup, isAdmin, canEdit,
      login, logout,
      createUser, updateRole, updateEmail, changePassword, deleteUser,
      loadUsers, loadAuditLog,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
