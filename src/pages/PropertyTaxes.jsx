import { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, X, Check, ChevronRight, ChevronDown } from 'lucide-react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { samplePropertyTaxes, sampleTransactions } from '../data/sampleData';
import { useAuth } from '../context/Auth';

const EMPTY = { id: '', taxYear: new Date().getFullYear(), taxType: '', annualAmount: '', dueDate: '', notes: '' };
const TAX_TYPES = ['County', 'MUD'];

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
          <div>
            <label className="text-xs text-slate-400 block mb-1">Tax Year *</label>
            <input type="number" value={form.taxYear} onChange={e => setForm({ ...form, taxYear: Number(e.target.value) })} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Tax Type</label>
            <select value={form.taxType || ''} onChange={e => setForm({ ...form, taxType: e.target.value })} className={inputCls}>
              <option value="">— Not specified —</option>
              {TAX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Annual Amount ($)</label>
            <input type="number" min="0" step="0.01" value={form.annualAmount} onChange={e => setForm({ ...form, annualAmount: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Due Date</label>
            <input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-slate-400 block mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className={`${inputCls} resize-none`} />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-navy-700">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
          <button onClick={onSave} disabled={!form.taxYear} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white rounded-lg text-sm font-medium flex items-center gap-2"><Check size={14} /> Save</button>
        </div>
      </div>
    </div>
  );
}

export default function PropertyTaxes() {
  const [taxRecords, setTaxRecords] = useLocalStorage('wbh_property_taxes', samplePropertyTaxes);
  const [transactions]              = useLocalStorage('wbh_transactions', sampleTransactions);
  const [modal, setModal]           = useState(null);
  const [form, setForm]             = useState(EMPTY);
  const { canEdit }                 = useAuth();
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterYear, setFilterYear]     = useState('');
  const [filterType, setFilterType]     = useState('');
  const [expanded, setExpanded]         = useState(new Set());

  const fmt   = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const today = new Date().toISOString().slice(0, 10);

  const toggleExpanded = (id) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const paymentMap = useMemo(() => {
    const map = new Map();
    transactions.filter(tx => tx.category === 'Property Tax' && tx.taxYear && !tx.excluded)
      .forEach(tx => {
        const key = `${tx.taxYear}|${tx.taxType || ''}`;
        const prev = map.get(key) || { total: 0, lastDate: '', txList: [] };
        map.set(key, { total: prev.total + Number(tx.amount), lastDate: tx.date > prev.lastDate ? tx.date : prev.lastDate, txList: [...prev.txList, tx] });
      });
    return map;
  }, [transactions]);

  const entries = useMemo(() => {
    const seen = new Set();
    const result = [];
    for (const r of taxRecords) {
      const key = `${r.taxYear}|${r.taxType || ''}`;
      seen.add(key);
      const payments = paymentMap.get(key) || { total: 0, lastDate: '', txList: [] };
      const obligation = Number(r.annualAmount) || 0;
      const paid = payments.total;
      const balance = obligation > 0 ? obligation - paid : 0;
      const isPastDue = r.dueDate && r.dueDate < today;
      const status =
        (obligation === 0 && paid > 0) || (paid >= obligation && obligation > 0) ? 'Paid'
        : paid > 0 ? 'Partial'
        : isPastDue ? 'Unpaid'
        : 'Upcoming';
      result.push({ ...r, taxType: r.taxType || '', amountPaid: paid, lastPaymentDate: payments.lastDate, balance, status, txList: payments.txList });
    }
    for (const [key, data] of paymentMap) {
      if (seen.has(key)) continue;
      const [year, taxType] = key.split('|');
      result.push({ id: `derived|${key}`, taxYear: Number(year), taxType: taxType || '', annualAmount: 0, dueDate: '', notes: '', amountPaid: data.total, lastPaymentDate: data.lastDate, balance: 0, status: 'Paid', derived: true, txList: data.txList });
    }
    return result.sort((a, b) => a.taxYear - b.taxYear || (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
  }, [taxRecords, paymentMap]);

  const taxYears = useMemo(() => [...new Set(entries.map(e => e.taxYear))].sort((a, b) => b - a), [entries]);

  const filtered = entries
    .filter(e => filterStatus === 'All' || e.status === filterStatus)
    .filter(e => !filterYear || String(e.taxYear) === filterYear)
    .filter(e => !filterType || e.taxType === filterType);

  const totalObligations = entries.reduce((s, e) => s + Number(e.annualAmount || 0), 0);
  const totalPaid        = entries.reduce((s, e) => s + e.amountPaid, 0);
  const totalUnpaid      = entries.filter(e => (e.status === 'Unpaid' || e.status === 'Partial') && e.dueDate && e.dueDate < today)
    .reduce((s, e) => s + Math.max(Number(e.annualAmount || 0) - e.amountPaid, 0), 0);

  const openAdd  = () => { setForm({ ...EMPTY, id: crypto.randomUUID() }); setModal('add'); };
  const openEdit = (e) => {
    if (e.derived) { setForm({ ...EMPTY, id: crypto.randomUUID(), taxYear: e.taxYear, taxType: e.taxType }); setModal('add'); return; }
    setForm({ id: e.id, taxYear: e.taxYear, taxType: e.taxType || '', annualAmount: e.annualAmount, dueDate: e.dueDate || '', notes: e.notes || '' });
    setModal('edit');
  };
  const save = () => {
    if (!form.taxYear) return;
    const record = { ...form, annualAmount: Number(form.annualAmount) || 0 };
    if (modal === 'add') setTaxRecords(prev => [...prev, record]);
    else setTaxRecords(prev => prev.map(r => r.id === record.id ? record : r));
    setModal(null);
  };
  const remove = (id) => { if (confirm('Delete this tax record?')) setTaxRecords(prev => prev.filter(r => r.id !== id)); };

  const statusBadge = (status) => {
    const cls = status === 'Paid'     ? 'bg-emerald-400/10 text-emerald-400'
              : status === 'Partial'  ? 'bg-blue-400/10 text-blue-400'
              : status === 'Upcoming' ? 'bg-slate-400/10 text-slate-400'
              :                         'bg-red-400/10 text-red-400';
    return <span className={`text-xs px-2 py-0.5 rounded-full ${cls}`}>{status}</span>;
  };
  const typeBadge = (t) => {
    if (!t) return <span className="text-slate-600 text-xs">—</span>;
    const cls = t === 'County' ? 'bg-blue-400/10 text-blue-400' : 'bg-orange-400/10 text-orange-400';
    return <span className={`text-xs px-2 py-0.5 rounded-full ${cls}`}>{t}</span>;
  };

  return (
    <div className="p-8">
      {modal && <Modal title={modal === 'add' ? 'Add Tax Record' : 'Edit Tax Record'} form={form} setForm={setForm} onSave={save} onClose={() => setModal(null)} />}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Property Taxes</h1>
          <p className="text-slate-400 text-sm mt-1">Obligations and payments — 18611 Warrior Rd</p>
        </div>
        {canEdit && <button onClick={openAdd} className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium"><Plus size={16} /> Add Tax Record</button>}
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-navy-800 border border-navy-700 rounded-xl p-4"><div className="text-xs text-slate-400 mb-1">Total Obligations</div><div className="text-xl font-bold text-white">{fmt(totalObligations)}</div></div>
        <div className="bg-navy-800 border border-navy-700 rounded-xl p-4"><div className="text-xs text-slate-400 mb-1">Total Paid</div><div className="text-xl font-bold text-emerald-400">{fmt(totalPaid)}</div></div>
        <div className="bg-navy-800 border border-navy-700 rounded-xl p-4"><div className="text-xs text-slate-400 mb-1">Outstanding Balance</div><div className="text-xl font-bold text-yellow-400">{fmt(totalUnpaid)}</div></div>
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        {['All', 'Upcoming', 'Unpaid', 'Partial', 'Paid'].map(f => (
          <button key={f} onClick={() => setFilterStatus(f)} className={`px-3 py-1.5 rounded-lg text-sm ${filterStatus === f ? 'bg-emerald-500 text-white' : 'bg-navy-800 text-slate-400 hover:text-white border border-navy-700'}`}>{f}</button>
        ))}
        <select value={filterYear} onChange={e => setFilterYear(e.target.value)} className="bg-navy-800 border border-navy-700 rounded-lg px-3 py-1.5 text-sm text-white">
          <option value="">All Years</option>
          {taxYears.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="bg-navy-800 border border-navy-700 rounded-lg px-3 py-1.5 text-sm text-white">
          <option value="">All Types</option>
          {TAX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div className="bg-navy-800 rounded-xl border border-navy-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-navy-700 text-slate-400 text-xs uppercase">
              <th className="text-left px-5 py-3 w-6"></th>
              <th className="text-left px-5 py-3">Year</th>
              <th className="text-left px-5 py-3">Type</th>
              <th className="text-right px-5 py-3">Obligation</th>
              <th className="text-right px-5 py-3">Paid</th>
              <th className="text-right px-5 py-3">Balance</th>
              <th className="text-left px-5 py-3">Due Date</th>
              <th className="text-left px-5 py-3">Status</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-700">
            {filtered.map(e => {
              const isOpen = expanded.has(e.id);
              const hasTx  = e.txList?.length > 0;
              const txList = [...(e.txList || [])].sort((a, b) => a.date.localeCompare(b.date));
              return (
                <>
                  <tr key={e.id} className="hover:bg-navy-700/40 transition-colors">
                    <td className="pl-5 py-3">{hasTx && <button onClick={() => toggleExpanded(e.id)} className="text-slate-500 hover:text-slate-300">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>}</td>
                    <td className="px-5 py-3 text-slate-300">{e.taxYear}</td>
                    <td className="px-5 py-3">{typeBadge(e.taxType)}</td>
                    <td className="px-5 py-3 text-right text-slate-400">{e.annualAmount ? fmt(e.annualAmount) : <span className="text-slate-600 italic">not set</span>}</td>
                    <td className="px-5 py-3 text-right text-emerald-400 font-semibold">{e.amountPaid > 0 ? fmt(e.amountPaid) : '—'}</td>
                    <td className="px-5 py-3 text-right">{e.annualAmount > 0 ? <span className={e.balance <= 0 ? 'text-emerald-400' : 'text-yellow-400 font-semibold'}>{e.balance <= 0 ? '—' : fmt(e.balance)}</span> : <span className="text-slate-600">—</span>}</td>
                    <td className="px-5 py-3 text-slate-400">{e.dueDate || '—'}</td>
                    <td className="px-5 py-3">{statusBadge(e.status)}</td>
                    <td className="px-5 py-3">{canEdit && <div className="flex items-center justify-end gap-2"><button onClick={() => openEdit(e)} className="text-slate-400 hover:text-white"><Pencil size={14} /></button>{!e.derived && <button onClick={() => remove(e.id)} className="text-slate-400 hover:text-red-400"><Trash2 size={14} /></button>}</div>}</td>
                  </tr>
                  {isOpen && txList.map((tx, i) => (
                    <tr key={tx.id || i} className="bg-navy-900/60">
                      <td className="pl-5 py-2" /><td className="px-5 py-2" colSpan={3}><div className="flex items-center gap-2 text-xs"><div className="w-px h-4 bg-navy-600 ml-1" /><span className="text-slate-500">{tx.date}</span><span className="text-slate-400">{tx.description}</span></div></td>
                      <td className="px-5 py-2" colSpan={2}><div className="text-right text-xs text-emerald-400">{fmt(tx.amount)}</div></td>
                      <td colSpan={3} />
                    </tr>
                  ))}
                </>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={9} className="px-5 py-10 text-center text-slate-500">No tax records found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
