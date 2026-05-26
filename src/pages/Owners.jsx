import { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, X, Check, User, Home, DollarSign, TrendingUp } from 'lucide-react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { sampleOwners, sampleTransactions, sampleReservations } from '../data/sampleData';
import { useAuth } from '../context/Auth';

const OWNER_CLEANING_FEE = 122;
const EMPTY = { id: '', name: '', email: '', phone: '', ownershipPercent: '', notes: '' };

function Modal({ title, form, setForm, onSave, onClose }) {
  const inputCls = 'w-full bg-navy-900 border border-navy-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500';
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-navy-800 rounded-xl border border-navy-700 w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-navy-700">
          <h2 className="font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>
        <div className="px-6 py-4 grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="text-xs text-slate-400 block mb-1">Name *</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Full name" className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Email</label>
            <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Phone</label>
            <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Ownership %</label>
            <input type="number" min="0" max="100" step="0.1" value={form.ownershipPercent} onChange={e => setForm({ ...form, ownershipPercent: e.target.value })} className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-slate-400 block mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className={`${inputCls} resize-none`} />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-navy-700">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
          <button onClick={onSave} disabled={!form.name} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white rounded-lg text-sm font-medium flex items-center gap-2">
            <Check size={14} /> Save
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Owners() {
  const [owners, setOwners]         = useLocalStorage('wbh_owners', sampleOwners);
  const [transactions]              = useLocalStorage('wbh_transactions', sampleTransactions);
  const [reservations]              = useLocalStorage('wbh_reservations', sampleReservations);
  const { canEdit }                 = useAuth();
  const [modal, setModal]           = useState(null);
  const [form, setForm]             = useState(EMPTY);

  const fmt = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const ownerStats = useMemo(() => owners.map(owner => {
    const holds         = reservations.filter(r => r.isOwnerHold && r.ownerId === owner.id);
    const holdNights    = holds.reduce((s, r) => s + (r.nights || 0), 0);
    const cleaningCost  = holds.length * OWNER_CLEANING_FEE;
    const supportTxs    = transactions.filter(t => !t.excluded && t.category === 'Cash Flow Support' && t.ownerId === owner.id);
    const totalSupport  = supportTxs.reduce((s, t) => s + Number(t.amount), 0);
    const net           = totalSupport - cleaningCost;
    return { ...owner, holdCount: holds.length, holdNights, cleaningCost, totalSupport, net };
  }), [owners, reservations, transactions]);

  const openAdd  = () => { setForm({ ...EMPTY, id: crypto.randomUUID() }); setModal('add'); };
  const openEdit = (o) => { setForm({ ...o }); setModal('edit'); };
  const save = () => {
    if (!form.name) return;
    const record = { ...form, ownershipPercent: Number(form.ownershipPercent) || 0 };
    if (modal === 'add') setOwners(prev => [...prev, record]);
    else setOwners(prev => prev.map(o => o.id === record.id ? record : o));
    setModal(null);
  };
  const remove = (id) => {
    if (confirm('Delete this owner?')) setOwners(prev => prev.filter(o => o.id !== id));
  };

  return (
    <div className="p-8">
      {modal && (
        <Modal
          title={modal === 'add' ? 'Add Owner' : 'Edit Owner'}
          form={form} setForm={setForm} onSave={save} onClose={() => setModal(null)}
        />
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Owners</h1>
          <p className="text-slate-400 text-sm mt-1">Owner holds and cash flow support by individual</p>
        </div>
        {canEdit && (
          <button onClick={openAdd} className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
            <Plus size={16} /> Add Owner
          </button>
        )}
      </div>

      {owners.length === 0 ? (
        <div className="bg-navy-800 border border-navy-700 rounded-xl p-12 text-center">
          <User size={40} className="mx-auto mb-3 text-slate-600" />
          <p className="text-slate-500 text-sm">No owners yet — add one to start tracking holds and cash flow support</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {ownerStats.map(o => (
            <div key={o.id} className="bg-navy-800 border border-navy-700 rounded-xl p-5">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-400/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <User size={18} className="text-emerald-400" />
                  </div>
                  <div>
                    <div className="font-semibold text-white">{o.name}</div>
                    <div className="text-xs text-slate-500">{o.email || '—'}{o.phone ? ` · ${o.phone}` : ''}</div>
                  </div>
                </div>
                {o.ownershipPercent > 0 && (
                  <span className="text-xs bg-blue-400/10 text-blue-400 px-2 py-0.5 rounded-full">{o.ownershipPercent}%</span>
                )}
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-navy-900 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1"><Home size={11} /> Owner Holds</div>
                  <div className="text-white font-semibold">{o.holdCount} stays</div>
                  <div className="text-xs text-slate-500 mt-0.5">{o.holdNights} nights</div>
                </div>
                <div className="bg-navy-900 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1"><Home size={11} /> Cleaning Cost</div>
                  <div className="text-red-400 font-semibold">-{fmt(o.cleaningCost)}</div>
                  <div className="text-xs text-slate-500 mt-0.5">${OWNER_CLEANING_FEE}/stay</div>
                </div>
                <div className="bg-navy-900 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1"><TrendingUp size={11} /> Cash Flow Support</div>
                  <div className="text-emerald-400 font-semibold">{fmt(o.totalSupport)}</div>
                  <div className="text-xs text-slate-500 mt-0.5">from transactions</div>
                </div>
                <div className="bg-navy-900 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1"><DollarSign size={11} /> Net Contribution</div>
                  <div className={`font-semibold ${o.net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {o.net >= 0 ? '+' : ''}{fmt(o.net)}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">support − cleaning</div>
                </div>
              </div>

              {o.notes && <div className="text-xs text-slate-500 italic mb-4">{o.notes}</div>}

              {canEdit && (
                <div className="flex justify-end gap-2 pt-3 border-t border-navy-700">
                  <button onClick={() => openEdit(o)} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white"><Pencil size={12} /> Edit</button>
                  <button onClick={() => remove(o.id)} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-400"><Trash2 size={12} /> Delete</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
