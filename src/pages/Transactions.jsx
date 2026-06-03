import { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, X, Check, Ban, Download, Sparkles } from 'lucide-react';

import { useTransactions } from '../hooks/useTransactions';
import { useOwners } from '../hooks/useOwners';
import { useAppSetting } from '../hooks/useAppSetting';
import { TRANSACTION_CATEGORIES } from '../data/sampleData';
import { buildPatternMap, suggest, isUncategorized } from '../utils/categorizer';
import { useAuth } from '../context/Auth';

const EMPTY = { id: '', date: new Date().toISOString().slice(0, 10), description: '', amount: '', type: 'Expense', category: '', ownerId: '', notes: '' };

const fmtAmt = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Modal({ title, form, setForm, onSave, onClose, owners }) {
  const inputCls = 'w-full bg-navy-900 border border-navy-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-navy-800 rounded-xl border border-navy-700 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-navy-700">
          <h2 className="font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>
        <div className="px-6 py-4 grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Date</label>
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Type</label>
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className={inputCls}>
              <option>Income</option><option>Expense</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-xs text-slate-400 block mb-1">Description</label>
            <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="e.g. Airbnb payout" className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Amount ($)</label>
            <input type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Category</label>
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className={inputCls}>
              <option value="">— No category —</option>
              {TRANSACTION_CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          {form.category === 'Cash Flow Support' && owners.length > 0 && (
            <div className="col-span-2">
              <label className="text-xs text-slate-400 block mb-1">Owner</label>
              <select value={form.ownerId || ''} onChange={e => setForm({ ...form, ownerId: e.target.value })} className={inputCls}>
                <option value="">— Select owner —</option>
                {owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          )}
          {form.category === 'Property Tax' && (
            <>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Tax Year</label>
                <select value={form.taxYear ?? ''} onChange={e => setForm({ ...form, taxYear: e.target.value ? Number(e.target.value) : null })} className={inputCls}>
                  <option value="">— Select year —</option>
                  {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 2 + i).map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Tax Type</label>
                <select value={form.taxType || ''} onChange={e => setForm({ ...form, taxType: e.target.value })} className={inputCls}>
                  <option value="">— Not specified —</option>
                  <option value="County">County</option>
                  <option value="MUD">MUD</option>
                </select>
              </div>
            </>
          )}
          <div className="col-span-2">
            <label className="text-xs text-slate-400 block mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className={`${inputCls} resize-none`} />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-navy-700">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
          <button onClick={onSave} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium flex items-center gap-2">
            <Check size={14} /> Save
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Transactions() {
  const { transactions, addTransaction, updateTransaction, deleteTransaction, updateTransactionCategory, toggleExclude, bulkUpdateCategories } = useTransactions();
  const { owners }       = useOwners();
  const [modal, setModal]   = useState(null);
  const [form, setForm]     = useState(EMPTY);
  const { canEdit }         = useAuth();

  const [filterType, setFilterType]         = useState('All');
  const [filterMonth, setFilterMonth]       = useState('');
  const [filterDesc, setFilterDesc]         = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterCategorized, setFilterCategorized] = useState('all');
  const [showExcluded, setShowExcluded]     = useState(false);

  const filtered = useMemo(() =>
    [...transactions]
      .filter(tx => filterType === 'All' || tx.type === filterType)
      .filter(tx => !filterMonth || tx.date.startsWith(filterMonth))
      .filter(tx => !filterDesc || tx.description.toLowerCase().includes(filterDesc.toLowerCase()))
      .filter(tx => !filterCategory || tx.category === filterCategory)
      .filter(tx => filterCategorized === 'all' || (filterCategorized === 'uncategorized') === isUncategorized(tx))
      .filter(tx => showExcluded || !tx.excluded)
      .sort((a, b) => new Date(b.date) - new Date(a.date)),
    [transactions, filterType, filterMonth, filterDesc, filterCategory, filterCategorized, showExcluded]
  );

  const totals = useMemo(() => {
    const base = transactions.filter(t => !t.excluded)
      .filter(t => !filterMonth || t.date.startsWith(filterMonth))
      .filter(t => !filterCategory || t.category === filterCategory);
    const income           = base.filter(t => t.type === 'Income'  && t.category !== 'Cash Flow Support').reduce((s, t) => s + Number(t.amount), 0);
    const expenses         = base.filter(t => t.type === 'Expense' && t.category !== 'Cash Flow Support').reduce((s, t) => s + Number(t.amount), 0);
    const cashFlowSupport  = base.filter(t => t.category === 'Cash Flow Support').reduce((s, t) => s + Number(t.amount), 0);
    return { income, expenses, net: income - expenses, cashFlowSupport };
  }, [transactions, filterMonth, filterCategory]);

  const patternMap = useMemo(() => buildPatternMap(transactions), [transactions]);

  const openAdd  = () => { setForm({ ...EMPTY, id: crypto.randomUUID() }); setModal('add'); };
  const openEdit = (tx) => { setForm({ ...tx }); setModal('edit'); };

  const save = async () => {
    if (!form.description || !form.amount) return;
    const record = { ...form, amount: Number(form.amount), categorized: !!form.category };
    if (modal === 'add') await addTransaction(record);
    else await updateTransaction(record);
    setModal(null);
  };

  const remove = async (id) => {
    if (confirm('Delete this transaction?')) await deleteTransaction(id);
  };

  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [aiError, setAiError]           = useState('');

  const suggestWithAI = async () => {
    const uncategorized = transactions.filter(t => isUncategorized(t) && !t.excluded);
    if (!uncategorized.length) { setAiError('No uncategorized transactions found.'); return; }

    setAiSuggesting(true); setAiError('');
    try {
      const examples = transactions
        .filter(t => !isUncategorized(t) && !t.excluded && t.category)
        .slice(0, 50)
        .map(t => ({ id: t.id, date: t.date, type: t.type, amount: t.amount, description: t.description, category: t.category, ownerId: t.ownerId || null, taxYear: t.taxYear || null, taxType: t.taxType || null }));

      const CHUNK = 50;
      const allSuggestions = [];

      for (let i = 0; i < uncategorized.length; i += CHUNK) {
        const chunk = uncategorized.slice(i, i + CHUNK);
        const res = await fetch('/api/ai-categorize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uncategorized: chunk, examples, owners }),
        });
        if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
        const { suggestions } = await res.json();
        if (suggestions?.length) allSuggestions.push(...suggestions);
      }

      const valid = allSuggestions.filter(s => s.category && TRANSACTION_CATEGORIES.includes(s.category));
      const { count } = await bulkUpdateCategories(valid);

      // Apply extra fields (ownerId, taxYear, taxType) from high-confidence suggestions
      for (const s of valid) {
        if (s.ownerId || s.taxYear || s.taxType) {
          const tx = transactions.find(t => t.id === s.id);
          if (tx) await updateTransaction({ ...tx, category: s.category, categorized: true, ownerId: s.ownerId || tx.ownerId, taxYear: s.taxYear || tx.taxYear, taxType: s.taxType || tx.taxType });
        }
      }

      setAiError(`✓ Categorized ${count} of ${uncategorized.length} transactions.`);
    } catch (e) {
      setAiError('AI categorization failed: ' + e.message);
    } finally {
      setAiSuggesting(false);
    }
  };

  const exportCSV = () => {
    const esc = (v) => { const s = String(v ?? ''); return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const headers = ['Date','Description','Type','Category','Amount','Notes'];
    const lines = transactions.filter(t => !isUncategorized(t) && !t.excluded)
      .map(tx => [tx.date, tx.description, tx.type, tx.category, Number(tx.amount).toFixed(2), tx.notes || ''].map(esc).join(','));
    const csv  = [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `wbh-transactions-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-8">
      {modal && (
        <Modal
          title={modal === 'add' ? 'Add Transaction' : 'Edit Transaction'}
          form={form} setForm={setForm} onSave={save} onClose={() => setModal(null)} owners={owners}
        />
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Transactions</h1>
          <p className="text-slate-400 text-sm mt-1">Track all income and expenses</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCSV} className="flex items-center gap-2 bg-navy-700 hover:bg-navy-600 border border-navy-600 text-slate-300 hover:text-white px-4 py-2 rounded-lg text-sm font-medium">
            <Download size={14} /> Export CSV
          </button>
          {canEdit && (
            <button onClick={suggestWithAI} disabled={aiSuggesting} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium">
              <Sparkles size={14} className={aiSuggesting ? 'animate-pulse' : ''} />
              {aiSuggesting ? 'Suggesting…' : 'AI Suggest'}
            </button>
          )}
          {canEdit && (
            <button onClick={openAdd} className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
              <Plus size={16} /> Add Transaction
            </button>
          )}
        </div>
      </div>

      {aiError && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm ${aiError.startsWith('✓') ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'}`}>
          {aiError}
        </div>
      )}

      <div className="flex flex-wrap gap-4 mb-5">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Description</span>
          <input type="text" placeholder="Search…" value={filterDesc} onChange={e => setFilterDesc(e.target.value)} className="bg-navy-800 border border-navy-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 w-52" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Type</span>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} className="bg-navy-800 border border-navy-700 rounded-lg px-3 py-2 text-sm text-white">
            <option>All</option><option>Income</option><option>Expense</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Month</span>
          <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="bg-navy-800 border border-navy-700 rounded-lg px-3 py-2 text-sm text-white" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Category</span>
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="bg-navy-800 border border-navy-700 rounded-lg px-3 py-2 text-sm text-white">
            <option value="">All Categories</option>
            {TRANSACTION_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Status</span>
          <select value={filterCategorized} onChange={e => setFilterCategorized(e.target.value)} className="bg-navy-800 border border-navy-700 rounded-lg px-3 py-2 text-sm text-white">
            <option value="all">All</option>
            <option value="categorized">Categorized</option>
            <option value="uncategorized">Uncategorized</option>
          </select>
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Excluded</span>
          <button onClick={() => setShowExcluded(v => !v)} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors ${showExcluded ? 'bg-navy-800 border-navy-700 text-slate-400 hover:text-white' : 'bg-navy-700 border-navy-600 text-slate-300'}`}>
            <Ban size={13} /> {showExcluded ? 'Showing' : 'Hidden'}
          </button>
        </div>
      </div>

      <div className="flex gap-4 mb-5 flex-wrap">
        <div className="bg-navy-800 border border-navy-700 rounded-lg px-4 py-2 text-sm"><span className="text-slate-400">Income: </span><span className="text-emerald-400 font-semibold">{fmtAmt(totals.income)}</span></div>
        <div className="bg-navy-800 border border-navy-700 rounded-lg px-4 py-2 text-sm"><span className="text-slate-400">Expenses: </span><span className="text-red-400 font-semibold">{fmtAmt(totals.expenses)}</span></div>
        <div className="bg-navy-800 border border-navy-700 rounded-lg px-4 py-2 text-sm"><span className="text-slate-400">Net: </span><span className={`font-semibold ${totals.net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtAmt(totals.net)}</span></div>
        {totals.cashFlowSupport > 0 && (
          <div className="bg-navy-800 border border-yellow-500/30 rounded-lg px-4 py-2 text-sm"><span className="text-slate-400">Cash Flow Support: </span><span className="text-yellow-400 font-semibold">{fmtAmt(totals.cashFlowSupport)}</span></div>
        )}
      </div>

      <div className="bg-navy-800 rounded-xl border border-navy-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-navy-700 text-slate-400 text-xs uppercase">
              <th className="text-left px-5 py-3">Date</th>
              <th className="text-left px-5 py-3">Description</th>
              <th className="text-left px-5 py-3">Category</th>
              <th className="text-right px-5 py-3">Amount</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-700">
            {filtered.map(tx => {
              const hit = isUncategorized(tx) ? suggest(tx.description, patternMap) : null;
              return (
                <tr key={tx.id} className={`transition-colors ${tx.excluded ? 'opacity-40' : ''} ${!tx.excluded && isUncategorized(tx) ? 'bg-yellow-500/15 hover:bg-yellow-500/25' : 'hover:bg-navy-700/40'}`}>
                  <td className="px-5 py-3 text-slate-300">{tx.date}</td>
                  <td className="px-5 py-3 text-white">
                    {tx.description}{tx.excluded && <span className="ml-2 text-xs text-slate-500 italic">excluded</span>}
                    {tx.category === 'Property Tax' && tx.taxYear && (
                      <div className="text-xs text-slate-500 mt-0.5">Tax year {tx.taxYear}{tx.taxType ? ` — ${tx.taxType}` : ''}</div>
                    )}
                    {tx.category === 'Cash Flow Support' && tx.ownerId && (
                      <div className="text-xs text-slate-500 mt-0.5">{owners.find(o => o.id === tx.ownerId)?.name || '—'}</div>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {hit
                      ? <span className="text-amber-400 italic text-xs" title="Suggested — click ✓ to confirm">{hit.category}</span>
                      : <span className="text-slate-400">{tx.category || '—'}</span>}
                  </td>
                  <td className={`px-5 py-3 text-right font-semibold ${tx.excluded ? 'line-through text-slate-500' : tx.type === 'Income' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {tx.type === 'Income' ? '+' : '-'}{fmtAmt(tx.amount)}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {canEdit && hit && <button onClick={() => updateTransactionCategory(tx.id, hit.category)} title="Confirm suggestion" className="text-amber-400 hover:text-emerald-400"><Check size={13} /></button>}
                      {canEdit && <button onClick={() => toggleExclude(tx.id)} title={tx.excluded ? 'Re-include' : 'Exclude'} className={`${tx.excluded ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-orange-400'}`}><Ban size={14} /></button>}
                      {canEdit && <button onClick={() => openEdit(tx)} className="text-slate-400 hover:text-white"><Pencil size={14} /></button>}
                      {canEdit && <button onClick={() => remove(tx.id)} className="text-slate-400 hover:text-red-400"><Trash2 size={14} /></button>}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-500">No transactions found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
