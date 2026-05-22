import { useState } from 'react';
import { Waves, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/Auth';

function AccountForm({ buttonLabel, onSubmit, showRole = false }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole]         = useState('viewer');
  const [showPwd, setShowPwd]   = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const inputCls = 'w-full bg-navy-900 border border-navy-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) return;
    setLoading(true);
    setError('');
    const result = await onSubmit(username, password, role, username);
    if (result?.error) setError(result.error);
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-xs text-slate-400 block mb-1">Email</label>
        <input type="email" value={username} onChange={e => setUsername(e.target.value)} className={inputCls} autoFocus autoComplete="email" />
      </div>
      <div>
        <label className="text-xs text-slate-400 block mb-1">Password</label>
        <div className="relative">
          <input type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} className={`${inputCls} pr-10`} autoComplete="current-password" />
          <button type="button" onClick={() => setShowPwd(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
            {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>
      {showRole && (
        <div>
          <label className="text-xs text-slate-400 block mb-1">Role</label>
          <select value={role} onChange={e => setRole(e.target.value)} className={inputCls}>
            <option value="admin">Admin — full access</option>
            <option value="viewer">Viewer — read only</option>
          </select>
        </div>
      )}
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button type="submit" disabled={loading || !username || !password}
        className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium transition-colors">
        {loading ? 'Please wait…' : buttonLabel}
      </button>
    </form>
  );
}

export default function Login() {
  const { login, createUser, needsSetup } = useAuth();

  return (
    <div className="h-screen bg-navy-900 flex items-center justify-center p-4 overflow-auto">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center flex-shrink-0">
            <Waves size={24} className="text-white" />
          </div>
          <div>
            <div className="font-bold text-white text-xl leading-tight">Warrior Beach House</div>
            <div className="text-xs text-slate-500">18611 Warrior Rd, Galveston, TX 77554</div>
          </div>
        </div>

        <div className="bg-navy-800 rounded-xl border border-navy-700 p-8">
          {needsSetup ? (
            <>
              <h2 className="text-lg font-semibold text-white mb-1">Create Admin Account</h2>
              <p className="text-slate-400 text-sm mb-6">No accounts exist yet. Set up your admin account to get started.</p>
              <AccountForm
                buttonLabel="Create Account & Sign In"
                showRole={false}
                onSubmit={async (u, p) => {
                  const r = await createUser(u, p, 'admin');
                  if (r.success) await login(u, p);
                  return r;
                }}
              />
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-white mb-6">Sign In</h2>
              <AccountForm buttonLabel="Sign In" onSubmit={login} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
