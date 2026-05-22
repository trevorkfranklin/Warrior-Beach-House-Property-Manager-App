import { useState } from 'react';
import { Plus, Trash2, X, Check, Shield, Eye, Key } from 'lucide-react';
import { useAuth } from '../context/Auth';

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-navy-800 rounded-xl border border-navy-700 w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-navy-700">
          <h2 className="font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function Users() {
  const { session, users, auditLog, isAdmin, createUser, updateRole, updateEmail, changePassword, deleteUser } = useAuth();
  const [showAdd, setShowAdd]     = useState(false);
  const [showPwd, setShowPwd]     = useState(null);
  const [newUser, setNewUser]     = useState({ username: '', password: '', role: 'viewer' });
  const [newPwd, setNewPwd]       = useState('');
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');

  const inputCls = 'w-full bg-navy-900 border border-navy-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500';

  const handleAddUser = async () => {
    setError('');
    if (!newUser.username || !newUser.password) { setError('Email and password are required'); return; }
    const r = await createUser(newUser.username, newUser.password, newUser.role, newUser.username);
    if (r.error) { setError(r.error); return; }
    setSuccess(`User ${newUser.username} created`);
    setNewUser({ username: '', password: '', role: 'viewer' });
    setShowAdd(false);
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleChangePwd = async (userId) => {
    if (!newPwd) return;
    await changePassword(userId, newPwd);
    setNewPwd(''); setShowPwd(null);
    setSuccess('Password changed'); setTimeout(() => setSuccess(''), 3000);
  };

  const handleDelete = (userId, username) => {
    if (userId === session.userId) { setError("You can't delete your own account"); return; }
    if (!confirm(`Delete user ${username}?`)) return;
    deleteUser(userId);
    setSuccess(`User ${username} deleted`); setTimeout(() => setSuccess(''), 3000);
  };

  if (!isAdmin) return (
    <div className="p-8 text-center text-slate-500">
      <Shield size={40} className="mx-auto mb-3 opacity-30" />
      <p>Admin access required</p>
    </div>
  );

  return (
    <div className="p-8">
      {showAdd && (
        <Modal title="Add User" onClose={() => { setShowAdd(false); setError(''); }}>
          <div className="px-6 py-4 space-y-4">
            <div><label className="text-xs text-slate-400 block mb-1">Email *</label><input type="email" value={newUser.username} onChange={e => setNewUser({ ...newUser, username: e.target.value })} className={inputCls} /></div>
            <div><label className="text-xs text-slate-400 block mb-1">Password *</label><input type="password" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} className={inputCls} /></div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Role</label>
              <select value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })} className={inputCls}>
                <option value="admin">Admin — full access</option>
                <option value="viewer">Viewer — read only</option>
              </select>
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
          </div>
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-navy-700">
            <button onClick={() => { setShowAdd(false); setError(''); }} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
            <button onClick={handleAddUser} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium flex items-center gap-2"><Check size={14} /> Create User</button>
          </div>
        </Modal>
      )}

      {showPwd && (
        <Modal title="Change Password" onClose={() => { setShowPwd(null); setNewPwd(''); }}>
          <div className="px-6 py-4 space-y-4">
            <div><label className="text-xs text-slate-400 block mb-1">New Password</label><input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} className={inputCls} autoFocus /></div>
          </div>
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-navy-700">
            <button onClick={() => { setShowPwd(null); setNewPwd(''); }} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
            <button onClick={() => handleChangePwd(showPwd)} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium flex items-center gap-2"><Check size={14} /> Save</button>
          </div>
        </Modal>
      )}

      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold text-white">Users</h1><p className="text-slate-400 text-sm mt-1">Manage access to this app</p></div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium"><Plus size={16} /> Add User</button>
      </div>

      {success && <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm rounded-lg">{success}</div>}

      <div className="bg-navy-800 rounded-xl border border-navy-700 overflow-hidden mb-8">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-navy-700 text-slate-400 text-xs uppercase">
            <th className="text-left px-5 py-3">User</th>
            <th className="text-left px-5 py-3">Role</th>
            <th className="text-left px-5 py-3">Last Login</th>
            <th className="px-5 py-3"></th>
          </tr></thead>
          <tbody className="divide-y divide-navy-700">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-navy-700/40">
                <td className="px-5 py-3">
                  <div className="text-white font-medium">{u.username}</div>
                  {u.id === session.userId && <span className="text-xs text-emerald-400">you</span>}
                </td>
                <td className="px-5 py-3">
                  <select value={u.role} onChange={e => updateRole(u.id, e.target.value)} disabled={u.id === session.userId}
                    className="bg-navy-900 border border-navy-700 rounded px-2 py-1 text-xs text-white disabled:opacity-50">
                    <option value="admin">Admin</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </td>
                <td className="px-5 py-3 text-slate-400 text-xs">{u.lastLogin ? new Date(u.lastLogin).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Never'}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => setShowPwd(u.id)} title="Change password" className="text-slate-400 hover:text-white"><Key size={14} /></button>
                    {u.id !== session.userId && <button onClick={() => handleDelete(u.id, u.username)} className="text-slate-400 hover:text-red-400"><Trash2 size={14} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Audit log */}
      <div>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Audit Log</h2>
        <div className="bg-navy-800 rounded-xl border border-navy-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-navy-700 text-slate-400 text-xs uppercase">
              <th className="text-left px-5 py-3">Time</th>
              <th className="text-left px-5 py-3">User</th>
              <th className="text-left px-5 py-3">Action</th>
              <th className="text-left px-5 py-3">Details</th>
            </tr></thead>
            <tbody className="divide-y divide-navy-700">
              {auditLog.slice(0, 50).map(e => (
                <tr key={e.id} className="hover:bg-navy-700/40">
                  <td className="px-5 py-2 text-slate-500 text-xs">{new Date(e.timestamp).toLocaleString()}</td>
                  <td className="px-5 py-2 text-slate-300 text-xs">{e.username}</td>
                  <td className="px-5 py-2 text-slate-400 text-xs font-mono">{e.action}</td>
                  <td className="px-5 py-2 text-slate-500 text-xs">{e.details}</td>
                </tr>
              ))}
              {auditLog.length === 0 && <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-500 text-sm">No audit log entries</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
