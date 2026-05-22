import { createContext, useContext, useState, useCallback } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';

const AuthContext = createContext(null);

async function hashPwd(pwd) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pwd));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function AuthProvider({ children }) {
  const [users, setUsers]       = useLocalStorage('wbh_users', []);
  const [auditLog, setAuditLog] = useLocalStorage('wbh_audit_log', []);
  const [session, setSession]   = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('wbh_session')); }
    catch { return null; }
  });

  const addAudit = useCallback((userId, username, action, details = '') => {
    setAuditLog(prev => [{
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      userId, username, action, details,
    }, ...prev].slice(0, 2000));
  }, [setAuditLog]);

  const login = useCallback(async (username, password) => {
    const hash = await hashPwd(password);
    const user = users.find(u =>
      u.username.toLowerCase() === username.toLowerCase() && u.passwordHash === hash
    );
    if (!user) {
      addAudit('unknown', username, 'login_failed', 'Invalid credentials');
      return { error: 'Invalid username or password' };
    }
    const sess = { userId: user.id, username: user.username, role: user.role, loginTime: new Date().toISOString() };
    sessionStorage.setItem('wbh_session', JSON.stringify(sess));
    setSession(sess);
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, lastLogin: new Date().toISOString() } : u));
    addAudit(user.id, user.username, 'login');
    return { success: true };
  }, [users, setUsers, addAudit]);

  const logout = useCallback(() => {
    if (session) addAudit(session.userId, session.username, 'logout');
    sessionStorage.removeItem('wbh_session');
    setSession(null);
  }, [session, addAudit]);

  const createUser = useCallback(async (username, password, role, email = '') => {
    if (users.find(u => u.username.toLowerCase() === username.toLowerCase()))
      return { error: 'Username already exists' };
    const hash = await hashPwd(password);
    const user = {
      id: crypto.randomUUID(), username, passwordHash: hash, role, email,
      createdAt: new Date().toISOString(), lastLogin: null,
    };
    setUsers(prev => [...prev, user]);
    if (session) addAudit(session.userId, session.username, 'create_user', `${username} (${role})`);
    return { success: true };
  }, [users, setUsers, session, addAudit]);

  const updateRole = useCallback((userId, role) => {
    const target = users.find(u => u.id === userId);
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u));
    if (session) addAudit(session.userId, session.username, 'update_role', `${target?.username} → ${role}`);
  }, [users, setUsers, session, addAudit]);

  const updateEmail = useCallback((userId, email) => {
    const target = users.find(u => u.id === userId);
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, email } : u));
    if (session) addAudit(session.userId, session.username, 'update_email', `For: ${target?.username}`);
  }, [users, setUsers, session, addAudit]);

  const changePassword = useCallback(async (userId, newPassword) => {
    const hash = await hashPwd(newPassword);
    const target = users.find(u => u.id === userId);
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, passwordHash: hash } : u));
    if (session) addAudit(session.userId, session.username, 'change_password', `For: ${target?.username}`);
  }, [users, setUsers, session, addAudit]);

  const deleteUser = useCallback((userId) => {
    const target = users.find(u => u.id === userId);
    setUsers(prev => prev.filter(u => u.id !== userId));
    if (session) addAudit(session.userId, session.username, 'delete_user', target?.username);
  }, [users, setUsers, session, addAudit]);

  const isAdmin  = session?.role === 'admin';
  const canEdit  = isAdmin;
  const needsSetup = users.length === 0;

  return (
    <AuthContext.Provider value={{
      session, users, auditLog, needsSetup,
      isAdmin, canEdit,
      login, logout,
      createUser, updateRole, updateEmail, changePassword, deleteUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
