import { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, X, Check, User, Home, DollarSign, TrendingUp, ChevronDown, ChevronUp, Wallet } from 'lucide-react';
import { useOwners } from '../hooks/useOwners';
import { useTransactions } from '../hooks/useTransactions';
import { useReservations } from '../hooks/useReservations';
import { useAppSetting } from '../hooks/useAppSetting';
import { useSupportCalc } from '../hooks/useSupportCalc';
import { useAuth } from '../context/Auth';

const OWNER_CLEANING_FEE = 122;
const RESERVE_TARGET = 500;
const EMPTY = { id: '', name: '', email: '', phone: '', ownershipPercent: '', notes: '' };

function Modal({ title, form, setForm, onSave, onClose }) {
  const inputCls = 'w-full bg-navy-900 border border-navy-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500';
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-navy-800 rounded-xl border border-navy-700 w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-navy-700">
          <h2 className="font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>
        <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
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
          <div className="sm:col-span-2">
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
  const { owners, addOwner, updateOwner, deleteOwner } = useOwners();
  const { transactions }   = useTransactions();
  const { reservations }   = useReservations();
  const [ownerReserveStarts, setOwnerReserveStarts] = useAppSetting('owner_reserve_starts', {});
  const { canEdit }        = useAuth();
  const [modal, setModal]               = useState(null);
  const [form, setForm]                 = useState(EMPTY);
  const [expanded, setExpanded]         = useState({});
  const [editingReserve, setEditingReserve] = useState({});
  const [reserveInput, setReserveInput] = useState({});

  const { chartSlots, monthData } = useSupportCalc();

  const fmt     = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtSign = (n) => (n >= 0 ? '+' : '') + fmt(n);

  const currentMonthSlotIdx = chartSlots.findIndex(s => s.isCurrent);

  const toggleExpanded  = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const openEditReserve = (owner) => {
    setReserveInput(prev => ({ ...prev, [owner.id]: ownerReserveStarts[owner.id] ?? '' }));
    setEditingReserve(prev => ({ ...prev, [owner.id]: true }));
  };
  const cancelEditReserve = (id) => setEditingReserve(prev => ({ ...prev, [id]: false }));
  const saveReserve = (id) => {
    const val = parseFloat(reserveInput[id]);
    if (!isNaN(val)) setOwnerReserveStarts(prev => ({ ...prev, [id]: val }));
    setEditingReserve(prev => ({ ...prev, [id]: false }));
  };

  const ownerStats = useMemo(() => owners.map(owner => {
    const pct          = (owner.ownershipPercent || 0) / 100;
    const holds        = reservations.filter(r => r.isOwnerHold && r.ownerId === owner.id);
    const holdNights   = holds.reduce((s, r) => s + (r.nights || 0), 0);
    const cleaningCost = holds.length * OWNER_CLEANING_FEE;
    const supportTxs   = transactions.filter(t => !t.excluded && t.category === 'Cash Flow Support' && t.ownerId === owner.id);
    const totalSupport = supportTxs.reduce((s, t) => s + Number(t.amount), 0);
    const net          = totalSupport - cleaningCost;

    // Reserve balance projection starting from May 2026 (current month)
    const mayBalance  = ownerReserveStarts[owner.id];
    const hasStart    = mayBalance != null;

    let reserveProjection = [];
    if (hasStart && currentMonthSlotIdx >= 0) {
      let bal = Number(mayBalance);
      for (let i = currentMonthSlotIdx; i < chartSlots.length; i++) {
        if (i === currentMonthSlotIdx) {
          // Entered balance IS the current actual state — show as-is, no net adjustment
          reserveProjection.push({ ...chartSlots[i], netShare: 0, startBalance: bal, endBalance: bal });
          continue;
        }
        // Cleaning fees from prior month's owner holds (same payment timing as rental income)
        const [slotYr, slotMo] = chartSlots[i].month.split('-').map(Number);
        const priorMonth = `${slotMo === 1 ? slotYr - 1 : slotYr}-${String(slotMo === 1 ? 12 : slotMo - 1).padStart(2, '0')}`;
        const totalCleaning = owners.reduce((sum, own) =>
          sum + reservations.filter(r =>
            r.isOwnerHold && r.ownerId === own.id &&
            r.status !== 'Cancelled' && r.checkIn?.slice(0, 7) === priorMonth
          ).length * OWNER_CLEANING_FEE
        , 0);
        const ownCleaning = reservations.filter(r =>
          r.isOwnerHold && r.ownerId === owner.id &&
          r.status !== 'Cancelled' && r.checkIn?.slice(0, 7) === priorMonth
        ).length * OWNER_CLEANING_FEE;
        const adjustedNet = (monthData[i]?.net ?? 0) + totalCleaning;
        const netShare = adjustedNet * pct - ownCleaning;
        const startBal = bal;
        bal += netShare;
        reserveProjection.push({ ...chartSlots[i], netShare, startBalance: startBal, endBalance: bal });
      }
    }

    const currentReserve = hasStart ? Number(mayBalance) : null;
    const surplus        = currentReserve != null ? currentReserve - RESERVE_TARGET : null;

    return { ...owner, holdCount: holds.length, holdNights, cleaningCost, totalSupport, net, currentReserve, surplus, hasStart, reserveProjection };
  }), [owners, reservations, transactions, ownerReserveStarts, chartSlots, monthData, currentMonthSlotIdx]);

  const openAdd  = () => { setForm({ ...EMPTY, id: crypto.randomUUID() }); setModal('add'); };
  const openEdit = (o) => { setForm({ ...o }); setModal('edit'); };
  const save = async () => {
    if (!form.name) return;
    const record = { ...form, ownershipPercent: Number(form.ownershipPercent) || 0 };
    if (modal === 'add') await addOwner(record);
    else await updateOwner(record);
    setModal(null);
  };
  const remove = async (id) => {
    if (confirm('Delete this owner?')) await deleteOwner(id);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {modal && (
        <Modal
          title={modal === 'add' ? 'Add Owner' : 'Edit Owner'}
          form={form} setForm={setForm} onSave={save} onClose={() => setModal(null)}
        />
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Owners</h1>
          <p className="text-slate-400 text-sm mt-1">Owner holds, cash flow support, and reserve balances</p>
        </div>
        {canEdit && (
          <button onClick={openAdd} className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium w-full sm:w-auto">
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

              {/* Holds & CFS stats */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
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

              {/* Reserve Balance */}
              <div className="border-t border-navy-700 pt-4 mt-2">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Wallet size={13} className="text-slate-400" />
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Reserve Balance</span>
                  </div>
                  {canEdit && !editingReserve[o.id] && (
                    <button onClick={() => openEditReserve(o)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors">
                      <Pencil size={11} /> {o.hasStart ? 'Edit' : 'Set'} May balance
                    </button>
                  )}
                </div>

                {/* May balance input */}
                {editingReserve[o.id] && canEdit && (
                  <div className="flex flex-wrap items-center gap-2 mb-3 bg-navy-900 rounded-lg px-3 py-2.5 border border-navy-600">
                    <span className="text-xs text-slate-400 flex-shrink-0">May 2026 actual balance:</span>
                    <span className="text-slate-500 text-xs">$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={reserveInput[o.id] ?? ''}
                      onChange={e => setReserveInput(prev => ({ ...prev, [o.id]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') saveReserve(o.id); if (e.key === 'Escape') cancelEditReserve(o.id); }}
                      className="flex-1 min-w-0 bg-transparent text-sm text-white focus:outline-none"
                      placeholder="0.00"
                      autoFocus
                    />
                    <button onClick={() => saveReserve(o.id)} className="text-emerald-400 hover:text-emerald-300 flex-shrink-0"><Check size={14} /></button>
                    <button onClick={() => cancelEditReserve(o.id)} className="text-slate-400 hover:text-white flex-shrink-0"><X size={14} /></button>
                  </div>
                )}

                {!o.hasStart ? (
                  <div className="bg-navy-900 border border-dashed border-navy-600 rounded-lg p-4 text-center">
                    <p className="text-xs text-slate-500">No May 2026 balance set</p>
                    {canEdit && (
                      <button onClick={() => openEditReserve(o)} className="mt-1.5 text-xs text-emerald-400 hover:text-emerald-300">
                        Enter actual balance →
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Balance tiles */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                      <div className="bg-navy-900 rounded-lg p-2.5">
                        <div className="text-xs text-slate-500 mb-1">May Balance</div>
                        <div className={`font-semibold text-sm ${o.currentReserve >= RESERVE_TARGET ? 'text-emerald-400' : o.currentReserve >= RESERVE_TARGET / 2 ? 'text-yellow-400' : 'text-red-400'}`}>
                          {fmt(o.currentReserve)}
                        </div>
                        <div className="text-xs text-slate-600 mt-0.5">actual</div>
                      </div>
                      <div className="bg-navy-900 rounded-lg p-2.5">
                        <div className="text-xs text-slate-500 mb-1">Target</div>
                        <div className="font-semibold text-sm text-slate-300">{fmt(RESERVE_TARGET)}</div>
                        <div className="text-xs text-slate-600 mt-0.5">reserve floor</div>
                      </div>
                      <div className="bg-navy-900 rounded-lg p-2.5">
                        <div className="text-xs text-slate-500 mb-1">{o.surplus >= 0 ? 'Surplus' : 'Deficit'}</div>
                        <div className={`font-semibold text-sm ${o.surplus >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {fmtSign(o.surplus)}
                        </div>
                        <div className="text-xs text-slate-600 mt-0.5">vs $500 target</div>
                      </div>
                    </div>

                    {/* Monthly projection toggle */}
                    {o.reserveProjection.length > 0 && (
                      <>
                        <button
                          onClick={() => toggleExpanded(o.id)}
                          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
                        >
                          {expanded[o.id] ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          Monthly projection ({o.reserveProjection.length} months)
                        </button>

                        {expanded[o.id] && (
                          <div className="mt-3 rounded-lg overflow-hidden border border-navy-700 overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-navy-900 text-slate-500">
                                  <th className="text-left px-3 py-2 font-medium">Month</th>
                                  <th className="text-right px-3 py-2 font-medium">Net Share</th>
                                  <th className="text-right px-3 py-2 font-medium">End Balance</th>
                                  <th className="text-right px-3 py-2 font-medium">vs $500</th>
                                </tr>
                              </thead>
                              <tbody>
                                {o.reserveProjection.map((m, idx) => {
                                  const diff = m.endBalance - RESERVE_TARGET;
                                  const balColor = m.endBalance >= RESERVE_TARGET ? 'text-emerald-400' : m.endBalance >= RESERVE_TARGET / 2 ? 'text-yellow-400' : 'text-red-400';
                                  return (
                                    <tr key={m.month} className={`border-t border-navy-700/50 ${idx % 2 === 0 ? 'bg-navy-900/30' : ''}`}>
                                      <td className="px-3 py-2 text-slate-300">
                                        {m.label}
                                        {m.isCurrent && <span className="ml-1 text-blue-400 text-xs">(actual)</span>}
                                        {m.projected && <span className="ml-1 text-slate-600">(proj)</span>}
                                      </td>
                                      <td className={`px-3 py-2 text-right ${m.isCurrent ? 'text-slate-600' : m.netShare >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {m.isCurrent ? '—' : fmtSign(m.netShare)}
                                      </td>
                                      <td className={`px-3 py-2 text-right font-medium ${balColor}`}>
                                        {fmt(m.endBalance)}
                                      </td>
                                      <td className={`px-3 py-2 text-right ${diff >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {fmtSign(diff)}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>

              {canEdit && (
                <div className="flex justify-end gap-2 pt-3 mt-3 border-t border-navy-700">
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
