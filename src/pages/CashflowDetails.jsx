import { useState, useMemo } from 'react';
import { Settings2, Check, X, Plus, Trash2, ChevronRight, ChevronLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { sampleTransactions, sampleReservations, sampleOwners, sampleHOADues } from '../data/sampleData';
import { txInMonth, amountForMonth } from '../utils/transactions';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const PROTECTION_PER_NIGHT = 8.54;
const OWNER_CLEANING_FEE = 122;
const MIN_BALANCE    = 1000;
const RESERVE_TARGET = 500;

const DEFAULT_BUDGETS = {
  mortgage:            0,
  cableInternet:       0,
  electricity:         0,
  waterTrash:          0,
  windstormInsurance:  0,
};

const EXPENSE_ITEMS = [
  { key: 'mortgage',           label: 'Mortgage',            col: 'text-blue-400' },
  { key: 'cableInternet',      label: 'Cable / Internet',    col: 'text-purple-400' },
  { key: 'electricity',        label: 'Electricity',         col: 'text-yellow-400' },
  { key: 'waterTrash',         label: 'Water / Trash',       col: 'text-teal-400' },
  { key: 'windstormInsurance', label: 'Insurance',           col: 'text-orange-400' },
];

const CITY_OF_GALVESTON = /city\s+of\s+galveston/i;

export default function CashflowDetails() {
  const [transactions]                    = useLocalStorage('wbh_transactions', sampleTransactions);
  const [reservations]                    = useLocalStorage('wbh_reservations', sampleReservations);
  const [budgets, setBudgets]             = useLocalStorage('wbh_cashflow_budgets', DEFAULT_BUDGETS);
  const [extraExpenses, setExtraExpenses] = useLocalStorage('wbh_cashflow_extra', []);
  const [monthly, setMonthly]             = useLocalStorage('wbh_cashflow_monthly', {});
  const [monthItems, setMonthItems]       = useLocalStorage('wbh_cashflow_month_items', {});
  const [sfAccounts]                      = useLocalStorage('wbh_simplefin_accounts', {});
  const [owners]                          = useLocalStorage('wbh_owners', sampleOwners);
  const [hoaRecords]                      = useLocalStorage('wbh_hoa_dues', sampleHOADues);
  const [ownerReserveStarts]              = useLocalStorage('wbh_owner_reserve_starts', {});

  const [projStartBal, setProjStartBal]     = useLocalStorage('wbh_cashflow_proj_start', 0);
  const [startBals, setStartBals]           = useLocalStorage('wbh_cashflow_start_bals', {});
  const [endBals, setEndBals]               = useLocalStorage('wbh_cashflow_end_bals', {});

  const [editingBudgets, setEditingBudgets] = useState(false);
  const [budgetDraft, setBudgetDraft]       = useState(DEFAULT_BUDGETS);
  const [extraDraft, setExtraDraft]         = useState([]);
  const [viewMode, setViewMode]             = useState('forward');
  const [editingStartBal, setEditingStartBal] = useState(false);
  const [startBalDraft, setStartBalDraft]     = useState('');
  const [editingEndBal, setEditingEndBal]     = useState(false);
  const [endBalDraft, setEndBalDraft]         = useState('');

  const [editCell, setEditCell]   = useState(null);
  const [editValue, setEditValue] = useState('');
  const [itemsModal, setItemsModal]     = useState(null);
  const [itemsDraft, setItemsDraft]     = useState([]);
  const [showExpenseDetail, setShowExpenseDetail] = useState(false);
  const [showCFSDetail, setShowCFSDetail]         = useState(false);
  const [showReserveDetail, setShowReserveDetail] = useState(false);
  const [showCFSSummary, setShowCFSSummary]       = useState(false);

  const currentYear     = new Date().getFullYear();
  const currentMonthIdx = new Date().getMonth();
  const currentMonthStr = `${currentYear}-${String(currentMonthIdx + 1).padStart(2, '0')}`;

  const wfBalance = useMemo(() => {
    const acct = Object.values(sfAccounts).find(a =>
      a.orgName?.toLowerCase().includes('wells fargo') &&
      a.accountName?.toLowerCase().includes('checking')
    );
    return acct ? Number(acct.balance) : null;
  }, [sfAccounts]);

  const currentStartBal = startBals[currentMonthStr] ?? (wfBalance !== null ? Number(wfBalance) : Number(projStartBal) || 0);
  const currentEndBal   = endBals[currentMonthStr] != null ? Number(endBals[currentMonthStr]) : MIN_BALANCE;

  const saveStartBal = () => {
    const val = parseFloat(startBalDraft);
    const amount = isNaN(val) ? 0 : val;
    setStartBals(prev => ({ ...prev, [currentMonthStr]: amount }));
    setProjStartBal(amount);
    setEditingStartBal(false);
  };
  const saveEndBal = () => {
    const val = parseFloat(endBalDraft);
    const amount = isNaN(val) ? 1000 : val;
    setEndBals(prev => ({ ...prev, [currentMonthStr]: amount }));
    setEditingEndBal(false);
  };

  const fmt         = (n) => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const fmtDec      = (n) => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const endBalColor = (v) => v < MIN_BALANCE ? 'text-red-400' : v > MIN_BALANCE ? 'text-emerald-400' : 'text-slate-400';
  const reserveColor = (v) => v == null ? 'text-slate-600' : v >= RESERVE_TARGET ? 'text-emerald-400' : v >= RESERVE_TARGET / 2 ? 'text-yellow-400' : 'text-red-400';

  // ── Does every owner have a May 2026 reserve set? ───────────────────────
  const allOwnersHaveReserves = owners.length > 0 && owners.every(o => ownerReserveStarts[o.id] != null);

  // ── Slots ────────────────────────────────────────────────────────────────
  const slots = useMemo(() => {
    if (viewMode === 'year') {
      return Array.from({ length: 12 }, (_, i) => {
        const month = `${currentYear}-${String(i + 1).padStart(2, '0')}`;
        return { label: MONTHS[i], month, isPast: i < currentMonthIdx, isCurrent: i === currentMonthIdx };
      });
    }
    return Array.from({ length: 13 }, (_, i) => {
      const d  = new Date(currentYear, currentMonthIdx + i, 1);
      const yr = d.getFullYear();
      const mi = d.getMonth();
      const month = `${yr}-${String(mi + 1).padStart(2, '0')}`;
      const label = MONTHS[mi] + (yr !== currentYear ? ` '${String(yr).slice(2)}` : '');
      return { label, month, isPast: false, isCurrent: i === 0 };
    });
  }, [viewMode, currentYear, currentMonthIdx]);

  // ── Projected income ─────────────────────────────────────────────────────
  const incomeByPayMonth = useMemo(() => {
    const map = {};
    for (const r of reservations) {
      if (r.status === 'Cancelled' || !r.checkIn) continue;
      const [yr, mo] = r.checkIn.slice(0, 7).split('-').map(Number);
      const payYr = mo === 12 ? yr + 1 : yr;
      const payMo = mo === 12 ? 1 : mo + 1;
      const pay   = `${payYr}-${String(payMo).padStart(2, '0')}`;
      const protection = r.isOwnerHold ? 0 : Number(r.nights || 0) * PROTECTION_PER_NIGHT;
      map[pay] = (map[pay] || 0) + Number(r.netRent || 0) - protection;
    }
    return map;
  }, [reservations]);

  // ── HOA dues ─────────────────────────────────────────────────────────────
  const hoaByMonth = useMemo(() => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const paid = new Map();
    transactions.filter(tx => tx.category === 'HOA Fees' && !tx.excluded)
      .forEach(tx => {
        const year = tx.taxYear || new Date(tx.date).getFullYear();
        paid.set(String(year), (paid.get(String(year)) || 0) + Number(tx.amount));
      });
    const map = new Map();
    for (const r of hoaRecords) {
      if (!r.dueDate || !r.annualAmount) continue;
      if (r.dueDate.slice(0, 7) < currentMonth) continue;
      const balance = Math.max(Number(r.annualAmount) - (paid.get(String(r.year)) || 0), 0);
      if (balance <= 0) continue;
      map.set(r.dueDate.slice(0, 7), (map.get(r.dueDate.slice(0, 7)) || 0) + balance);
    }
    return map;
  }, [hoaRecords, transactions]);

  // ── Rows ─────────────────────────────────────────────────────────────────
  const rows = useMemo(() => slots.map(({ label, month, isPast, isCurrent }) => {
    const isActual = isPast || isCurrent;

    let income;
    if (isActual) {
      const txs = transactions.filter(t => !t.excluded && txInMonth(t, month));
      income = txs.filter(t => t.type === 'Income' && t.category !== 'Cash Flow Support')
                  .reduce((s, t) => s + amountForMonth(t, month), 0);
    } else {
      income = incomeByPayMonth[month] || 0;
    }

    let expenseItems;
    if (isPast) {
      const txs  = transactions.filter(t => !t.excluded && txInMonth(t, month) && t.type === 'Expense' && t.category !== 'Cash Flow Support');
      const sum  = (arr) => arr.reduce((s, t) => s + amountForMonth(t, month), 0);
      const utils = txs.filter(t => t.category === 'Utilities');
      expenseItems = {
        mortgage:           sum(txs.filter(t => t.category === 'Mortgage')),
        cableInternet:      sum(txs.filter(t => t.category === 'Internet / Cable')),
        electricity:        sum(utils.filter(t => !CITY_OF_GALVESTON.test(t.description))),
        waterTrash:         sum(utils.filter(t =>  CITY_OF_GALVESTON.test(t.description))),
        windstormInsurance: sum(txs.filter(t => t.category === 'Insurance')),
      };
    } else if (isCurrent) {
      const txs  = transactions.filter(t => !t.excluded && txInMonth(t, month) && t.type === 'Expense' && t.category !== 'Cash Flow Support');
      const sum  = (arr) => arr.reduce((s, t) => s + amountForMonth(t, month), 0);
      const utils = txs.filter(t => t.category === 'Utilities');
      expenseItems = {
        mortgage:           monthly[month]?.mortgage           ?? sum(txs.filter(t => t.category === 'Mortgage')),
        cableInternet:      monthly[month]?.cableInternet      ?? sum(txs.filter(t => t.category === 'Internet / Cable')),
        electricity:        monthly[month]?.electricity        ?? sum(utils.filter(t => !CITY_OF_GALVESTON.test(t.description))),
        waterTrash:         monthly[month]?.waterTrash         ?? sum(utils.filter(t =>  CITY_OF_GALVESTON.test(t.description))),
        windstormInsurance: monthly[month]?.windstormInsurance ?? sum(txs.filter(t => t.category === 'Insurance')),
      };
    } else {
      expenseItems = Object.fromEntries(
        EXPENSE_ITEMS.map(item => [item.key, monthly[month]?.[item.key] ?? budgets[item.key] ?? 0])
      );
    }

    const extraItems = Object.fromEntries(
      extraExpenses.map(e => [e.id, monthly[month]?.[e.id] ?? Number(e.amount || 0)])
    );

    const fixedTotal     = EXPENSE_ITEMS.reduce((s, item) => s + Number(expenseItems[item.key] || 0), 0);
    const extraTotal     = extraExpenses.reduce((s, e) => s + (extraItems[e.id] || 0), 0);
    const monthItemsList = monthItems[month] || [];
    const otherTotal     = monthItemsList.reduce((s, i) => s + Number(i.amount || 0), 0);
    const hoaDue         = isActual
      ? transactions.filter(t => !t.excluded && txInMonth(t, month) && t.category === 'HOA Fees')
          .reduce((s, t) => s + amountForMonth(t, month), 0)
      : (hoaByMonth.get(month) || 0);
    const totalExpenses  = fixedTotal + extraTotal + otherTotal + hoaDue;
    const cashFlowSupport = isActual
      ? transactions.filter(t => !t.excluded && txInMonth(t, month) && t.category === 'Cash Flow Support')
          .reduce((s, t) => s + amountForMonth(t, month), 0)
      : 0;

    return { label, month, isPast, isCurrent, isActual, income, cashFlowSupport, hoaDue, expenseItems, extraItems, otherTotal, monthItemsList, totalExpenses, net: income - totalExpenses };
  }), [slots, transactions, incomeByPayMonth, budgets, extraExpenses, monthly, monthItems, hoaByMonth]);

  // ── Per-owner actual CFS paid (past/current months) ─────────────────────
  const ownerCFSActual = useMemo(() => {
    const map = {};
    transactions
      .filter(t => !t.excluded && t.category === 'Cash Flow Support' && t.ownerId)
      .forEach(t => {
        const month = t.date?.slice(0, 7);
        if (!month) return;
        if (!map[month]) map[month] = {};
        map[month][t.ownerId] = (map[month][t.ownerId] || 0) + Number(t.amount);
      });
    return map;
  }, [transactions]);

  // ── Per-owner reserve projection ─────────────────────────────────────────
  // Cleaning fees go into the property pool (like income), then get split by ownership %.
  // Only the booking owner pays their own cleaning fee out, so the net effect is:
  //   owner_net[M] = (row.net[M] + totalCleaning[M-1]) × pct − ownCleaning[M-1]
  // If end_balance < $500 the owner needs CFS to bring it back to $500.
  const ownerReserveCalc = useMemo(() => {
    if (owners.length === 0) return [];
    const runningBals = {};
    for (const o of owners) {
      runningBals[o.id] = ownerReserveStarts[o.id] != null ? Number(ownerReserveStarts[o.id]) : null;
    }
    return slots.map(({ month, isPast, isCurrent }, i) => {
      if (isPast) return { month, ownerBals: {}, cfsPerOwner: {}, preBalance: {}, startBalance: {}, netShare: {}, totalCFS: 0 };

      const row         = rows[i];
      const ownerBals   = {};
      const cfsPerOwner = {};
      const preBalance  = {};
      const startBalance= {};
      const netShare    = {};
      let   totalCFS    = 0;

      // Prior month — cleaning fees from holds in M-1 are charged in M (same timing as rental income)
      const [slotYr, slotMo] = month.split('-').map(Number);
      const priorMonthStr = `${slotMo === 1 ? slotYr - 1 : slotYr}-${String(slotMo === 1 ? 12 : slotMo - 1).padStart(2, '0')}`;

      // Total cleaning from ALL owners' prior-month holds — paid into the property pool
      const totalCleaning = isCurrent ? 0 : owners.reduce((sum, own) =>
        sum + reservations.filter(r =>
          r.isOwnerHold && r.ownerId === own.id &&
          r.status !== 'Cancelled' && r.checkIn?.slice(0, 7) === priorMonthStr
        ).length * OWNER_CLEANING_FEE
      , 0);

      // Adjusted net: shared income pool includes cleaning fees paid by booking owners
      const adjustedNet = (row?.net || 0) + totalCleaning;

      for (const o of owners) {
        if (runningBals[o.id] == null) {
          ownerBals[o.id] = null; cfsPerOwner[o.id] = null;
          preBalance[o.id] = null; startBalance[o.id] = null; netShare[o.id] = null;
          continue;
        }
        const pct = (o.ownershipPercent || 0) / 100;

        // This owner's own cleaning fees — deducted after taking their pool share
        const ownCleaning = isCurrent ? 0 : reservations.filter(r =>
          r.isOwnerHold && r.ownerId === o.id &&
          r.status !== 'Cancelled' && r.checkIn?.slice(0, 7) === priorMonthStr
        ).length * OWNER_CLEANING_FEE;

        const endBal = runningBals[o.id] + adjustedNet * pct - ownCleaning;

        if (isCurrent) {
          // Entered balance IS the current actual state — carry it forward unchanged, no net adjustment
          ownerBals[o.id]    = runningBals[o.id];
          cfsPerOwner[o.id]  = 0;
          preBalance[o.id]   = runningBals[o.id];
          startBalance[o.id] = runningBals[o.id];
          netShare[o.id]     = 0;
          // runningBals[o.id] intentionally not updated here — June uses entered balance as starting point
        } else {
          const cfsNeeded = Math.max(0, RESERVE_TARGET - endBal);
          ownerBals[o.id]    = cfsNeeded > 0 ? RESERVE_TARGET : endBal;
          cfsPerOwner[o.id]  = cfsNeeded;
          preBalance[o.id]   = endBal;
          startBalance[o.id] = runningBals[o.id];
          netShare[o.id]     = adjustedNet * pct - ownCleaning;
          totalCFS           += cfsNeeded;
          runningBals[o.id]   = ownerBals[o.id];
        }
      }

      return { month, ownerBals, cfsPerOwner, preBalance, startBalance, netShare, totalCFS };
    });
  }, [slots, rows, owners, ownerReserveStarts, reservations]);

  // ── Projection (account balance + CFS needed) ────────────────────────────
  const projection = useMemo(() => {
    const result     = [];
    let balance      = MIN_BALANCE;
    let lastPastIdx  = -1;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.isPast) {
        result.push({ month: row.month, startBalance: null, endBalance: null, supportNeeded: 0 });
        lastPastIdx = i;
        continue;
      }
      if (row.isCurrent) {
        result.push({ month: row.month, startBalance: currentStartBal, endBalance: currentEndBal, supportNeeded: 0 });
        balance = currentEndBal;
        continue;
      }
      const startBal  = balance;
      const natural   = startBal + row.net + row.cashFlowSupport;
      // CFS: reserve-based when all owners have entered their May balance; otherwise account floor
      const reserveEntry   = ownerReserveCalc.find(x => x.month === row.month);
      const supportNeeded  = allOwnersHaveReserves
        ? (reserveEntry?.totalCFS || 0)
        : Math.max(0, MIN_BALANCE - natural);
      balance = natural + supportNeeded;
      result.push({ month: row.month, startBalance: startBal, endBalance: balance, supportNeeded });
    }
    if (lastPastIdx >= 0) result[lastPastIdx] = { ...result[lastPastIdx], endBalance: currentStartBal };
    return result;
  }, [rows, currentStartBal, currentEndBal, ownerReserveCalc, allOwnersHaveReserves]);

  const totalSupportNeeded = projection.reduce((s, p) => s + p.supportNeeded, 0);

  const combinedCFSTotal = useMemo(() => rows.reduce((s, row) => {
    if (row.isPast) return s + row.cashFlowSupport;
    if (row.isCurrent) {
      if (row.cashFlowSupport > 0) return s + row.cashFlowSupport;
      return s + Math.max(0, MIN_BALANCE - (currentStartBal + row.net));
    }
    const proj = projection.find(p => p.month === row.month);
    return s + (proj?.supportNeeded || 0);
  }, 0), [rows, projection, currentStartBal]);

  const ownerTotals = useMemo(() =>
    owners.map(owner => ({
      ...owner,
      totalCFS: ownerReserveCalc.reduce((s, m) => s + (m.cfsPerOwner[owner.id] || 0), 0),
    }))
  , [owners, ownerReserveCalc]);

  const totals = useMemo(() => ({
    income:          rows.reduce((s, r) => s + r.income, 0),
    cashFlowSupport: rows.reduce((s, r) => s + r.cashFlowSupport, 0),
    totalExpenses:   rows.reduce((s, r) => s + r.totalExpenses, 0),
    net:             rows.reduce((s, r) => s + r.net, 0),
    hoaDue:          rows.reduce((s, r) => s + r.hoaDue, 0),
    ...Object.fromEntries(EXPENSE_ITEMS.map(item => [item.key, rows.reduce((s, r) => s + (r.expenseItems[item.key] || 0), 0)])),
    ...Object.fromEntries(extraExpenses.map(e => [e.id, rows.reduce((s, r) => s + (r.extraItems[e.id] || 0), 0)])),
    otherTotal: rows.reduce((s, r) => s + r.otherTotal, 0),
  }), [rows, extraExpenses]);

  // ── Budget panel ──────────────────────────────────────────────────────────
  const startEditBudgets = () => { setBudgetDraft({ ...budgets }); setExtraDraft(extraExpenses.map(e => ({ ...e }))); setEditingBudgets(true); };
  const saveBudgets = () => { setBudgets({ ...budgetDraft }); setExtraExpenses(extraDraft.filter(e => e.label.trim())); setEditingBudgets(false); };
  const addExtra    = () => setExtraDraft(prev => [...prev, { id: crypto.randomUUID(), label: '', amount: 0 }]);
  const removeExtra = (id) => setExtraDraft(prev => prev.filter(e => e.id !== id));
  const updateExtra = (id, field, value) => setExtraDraft(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));

  // ── Inline cell editing ───────────────────────────────────────────────────
  const startEdit  = (month, key, current) => { setEditCell({ month, key }); setEditValue(String(current)); };
  const commitEdit = () => {
    if (!editCell) return;
    const val = parseFloat(editValue);
    setMonthly(prev => ({ ...prev, [editCell.month]: { ...(prev[editCell.month] || {}), [editCell.key]: isNaN(val) ? 0 : val } }));
    setEditCell(null);
  };
  const onKeyDown = (e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditCell(null); };

  // ── Per-month items modal ─────────────────────────────────────────────────
  const openItemsModal = (month, existing) => { setItemsModal(month); setItemsDraft((existing || []).map(i => ({ ...i }))); };
  const addItem    = () => setItemsDraft(prev => [...prev, { id: crypto.randomUUID(), label: '', amount: 0 }]);
  const removeItem = (id) => setItemsDraft(prev => prev.filter(i => i.id !== id));
  const updateItem = (id, field, value) => setItemsDraft(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  const saveItems  = () => { setMonthItems(prev => ({ ...prev, [itemsModal]: itemsDraft.filter(i => i.label.trim()) })); setItemsModal(null); };

  const isEditable = (isActual, isFixedItem) => !isActual || !isFixedItem;
  const inputCls     = 'w-full bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500';
  const cellInputCls = 'w-24 bg-navy-900 border border-emerald-500 rounded px-2 py-0.5 text-sm text-white text-right focus:outline-none';

  const EditableCell = ({ month, itemKey, value, isActualRow, isFixed }) => {
    const editable  = isEditable(isActualRow, isFixed);
    const isEditing = editCell?.month === month && editCell?.key === itemKey;
    if (isEditing) {
      return (
        <td className="px-2 py-2 text-right">
          <input autoFocus type="number" min="0" step="0.01" value={editValue}
            onChange={e => setEditValue(e.target.value)} onBlur={commitEdit} onKeyDown={onKeyDown}
            className={cellInputCls} />
        </td>
      );
    }
    return (
      <td className={`px-4 py-3 text-right text-slate-300 ${editable ? 'cursor-pointer hover:bg-navy-700/40 hover:text-white group' : ''}`}
        onClick={editable ? () => startEdit(month, itemKey, value) : undefined}
        title={editable ? 'Click to edit' : undefined}>
        {value > 0 ? fmt(value) : <span className="text-slate-600">—</span>}
        {editable && value === 0 && <span className="text-slate-700 group-hover:text-slate-500 text-xs ml-1">+</span>}
      </td>
    );
  };

  return (
    <div className="p-8 flex flex-col gap-6">

      {/* Per-month items modal */}
      {itemsModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-navy-800 rounded-xl border border-navy-700 w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-navy-700">
              <h2 className="font-semibold text-white">
                Other Expenses — {MONTHS[parseInt(itemsModal.split('-')[1], 10) - 1]} {itemsModal.split('-')[0]}
              </h2>
              <button onClick={() => setItemsModal(null)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="px-6 py-4 flex flex-col gap-2">
              {itemsDraft.map(item => (
                <div key={item.id} className="flex items-center gap-2">
                  <input type="text" placeholder="Description" value={item.label}
                    onChange={e => updateItem(item.id, 'label', e.target.value)}
                    className="flex-1 bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500" />
                  <div className="relative w-32 flex-shrink-0">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
                    <input type="number" min="0" step="0.01" value={item.amount}
                      onChange={e => updateItem(item.id, 'amount', e.target.value)}
                      className="w-full bg-navy-900 border border-navy-600 rounded-lg pl-7 pr-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500" />
                  </div>
                  <button onClick={() => removeItem(item.id)} className="text-slate-500 hover:text-red-400 flex-shrink-0"><Trash2 size={14} /></button>
                </div>
              ))}
              {itemsDraft.length === 0 && <p className="text-xs text-slate-500 italic">No items yet — click Add to create one.</p>}
              <button onClick={addItem} className="mt-1 flex items-center gap-1.5 text-sm text-emerald-400 hover:text-emerald-300 self-start">
                <Plus size={14} /> Add expense
              </button>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-navy-700">
              <button onClick={() => setItemsModal(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
              <button onClick={saveItems} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium flex items-center gap-2">
                <Check size={14} /> Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Cashflow Details</h1>
          <p className="text-slate-400 text-sm mt-1">Month-by-month expense breakdown vs projected rental income</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 p-1 bg-navy-800 border border-navy-700 rounded-lg">
            <button onClick={() => setViewMode('year')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'year' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white'}`}>Current Year</button>
            <button onClick={() => setViewMode('forward')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'forward' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white'}`}>13 Months</button>
          </div>
          {!editingBudgets && (
            <button onClick={startEditBudgets} className="flex items-center gap-2 bg-navy-700 hover:bg-navy-600 border border-navy-600 text-slate-300 hover:text-white px-3 py-2 rounded-lg text-sm">
              <Settings2 size={14} /> Defaults &amp; Extras
            </button>
          )}
        </div>
      </div>

      {/* Reserve mode notice */}
      {allOwnersHaveReserves ? (
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-3 text-xs text-emerald-400">
          Reserve mode active — CFS projections are based on keeping each owner's reserve balance at or above ${RESERVE_TARGET.toLocaleString()}.
        </div>
      ) : owners.length > 0 && (
        <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl px-4 py-3 text-xs text-yellow-400">
          Set May 2026 reserve balances for all owners on the Owners page to enable per-owner reserve tracking in CFS projections.
        </div>
      )}

      {/* Balance cards */}
      <div className="grid grid-cols-2 gap-4">
        {wfBalance !== null && (
          <div className="bg-navy-800 border border-blue-500/30 rounded-xl px-5 py-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-400 mb-1">WF Checking — Current Balance</div>
              <div className={`text-2xl font-bold ${wfBalance >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                {wfBalance < 0 ? '-' : ''}${Math.abs(wfBalance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="w-12 h-12 bg-blue-400/10 rounded-xl flex items-center justify-center flex-shrink-0">
              <span className="text-blue-400 text-lg font-bold">$</span>
            </div>
          </div>
        )}
        <div className="bg-navy-800 border border-navy-700 rounded-xl px-5 py-4 flex items-center justify-between">
          <div className="flex-1">
            <div className="text-xs text-slate-400 mb-2">
              {MONTHS[currentMonthIdx]} {currentYear} — Starting Balance
              {wfBalance !== null && startBals[currentMonthStr] == null && <span className="ml-2 text-slate-600">defaulting to WF balance</span>}
            </div>
            <div className="flex items-center gap-4">
              <div>
                {editingStartBal ? (
                  <input autoFocus type="number" step="0.01" value={startBalDraft}
                    onChange={e => setStartBalDraft(e.target.value)}
                    onBlur={saveStartBal}
                    onKeyDown={e => { if (e.key === 'Enter') saveStartBal(); if (e.key === 'Escape') setEditingStartBal(false); }}
                    className="w-40 bg-navy-900 border border-emerald-500 rounded-lg px-3 py-1 text-xl font-bold text-white focus:outline-none" />
                ) : (
                  <div className={`text-2xl font-bold cursor-pointer hover:opacity-80 ${currentStartBal >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                    onClick={() => { setStartBalDraft(String(currentStartBal)); setEditingStartBal(true); }}
                    title="Click to record actual starting balance">
                    {fmt(currentStartBal)}
                  </div>
                )}
                <div className="text-xs text-slate-500 mt-0.5">Click to update</div>
              </div>
              <div className="text-slate-600 text-lg">→</div>
              <div>
                {editingEndBal ? (
                  <input autoFocus type="number" step="0.01" value={endBalDraft}
                    onChange={e => setEndBalDraft(e.target.value)}
                    onBlur={saveEndBal}
                    onKeyDown={e => { if (e.key === 'Enter') saveEndBal(); if (e.key === 'Escape') setEditingEndBal(false); }}
                    className="w-40 bg-navy-900 border border-emerald-500 rounded-lg px-3 py-1 text-xl font-bold text-white focus:outline-none" />
                ) : (
                  <div className={`text-2xl font-bold cursor-pointer hover:opacity-80 ${endBalColor(currentEndBal)}`}
                    onClick={() => { setEndBalDraft(String(currentEndBal)); setEditingEndBal(true); }}
                    title="Click to record actual ending balance">
                    {fmt(currentEndBal)}
                  </div>
                )}
                <div className="text-xs text-slate-500 mt-0.5">{endBals[currentMonthStr] != null ? 'Actual end' : 'Proj. end (click to record)'}</div>
              </div>
            </div>
          </div>
          <div className="w-12 h-12 bg-emerald-400/10 rounded-xl flex items-center justify-center flex-shrink-0 ml-4">
            <span className="text-emerald-400 text-lg font-bold">$</span>
          </div>
        </div>
      </div>

      {/* Budget defaults panel */}
      <div className="bg-navy-800 border border-navy-700 rounded-xl p-5">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h2 className="text-sm font-semibold text-white">Monthly Expense Defaults</h2>
            <p className="text-xs text-slate-500 mt-0.5">Used to pre-fill future months — click any cell in the table to override per month</p>
          </div>
          {editingBudgets && (
            <div className="flex gap-2">
              <button onClick={saveBudgets} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-medium"><Check size={12} /> Save</button>
              <button onClick={() => setEditingBudgets(false)} className="flex items-center gap-1.5 px-3 py-1.5 bg-navy-700 hover:bg-navy-600 border border-navy-600 text-slate-300 rounded-lg text-xs font-medium"><X size={12} /> Cancel</button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-5 gap-3 mt-4">
          {EXPENSE_ITEMS.map(item => (
            <div key={item.key} className="bg-navy-900 rounded-lg p-3">
              <div className={`text-xs font-medium mb-2 ${item.col}`}>{item.label}</div>
              {editingBudgets ? (
                <>
                  <label className="text-xs text-slate-500 block mb-1">$ / month</label>
                  <input type="number" min="0" step="1" value={budgetDraft[item.key]}
                    onChange={e => setBudgetDraft(prev => ({ ...prev, [item.key]: Number(e.target.value) }))}
                    className={inputCls} />
                </>
              ) : (
                <>
                  <div className="text-xl font-bold text-white">${Number(budgets[item.key]).toLocaleString()}</div>
                  <div className="text-xs text-slate-500 mt-0.5">default</div>
                </>
              )}
            </div>
          ))}
        </div>
        {(editingBudgets || extraExpenses.length > 0) && (
          <div className="mt-4 pt-4 border-t border-navy-700">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-slate-400">Additional Expenses</span>
              {editingBudgets && (
                <button onClick={addExtra} className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300"><Plus size={12} /> Add expense</button>
              )}
            </div>
            {editingBudgets ? (
              <div className="flex flex-col gap-2">
                {extraDraft.map(item => (
                  <div key={item.id} className="flex items-center gap-2">
                    <input type="text" placeholder="Expense name" value={item.label}
                      onChange={e => updateExtra(item.id, 'label', e.target.value)}
                      className="flex-1 bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500" />
                    <div className="relative w-36 flex-shrink-0">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
                      <input type="number" min="0" step="1" value={item.amount}
                        onChange={e => updateExtra(item.id, 'amount', Number(e.target.value))}
                        className="w-full bg-navy-900 border border-navy-600 rounded-lg pl-7 pr-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500" />
                    </div>
                    <span className="text-xs text-slate-500 flex-shrink-0">/ mo</span>
                    <button onClick={() => removeExtra(item.id)} className="text-slate-500 hover:text-red-400 flex-shrink-0"><Trash2 size={14} /></button>
                  </div>
                ))}
                {extraDraft.length === 0 && <p className="text-xs text-slate-600 italic">No additional expenses.</p>}
              </div>
            ) : (
              <div className="grid grid-cols-5 gap-3">
                {extraExpenses.map(item => (
                  <div key={item.id} className="bg-navy-900 rounded-lg p-3">
                    <div className="text-xs font-medium text-slate-400 mb-2 truncate">{item.label}</div>
                    <div className="text-xl font-bold text-white">${Number(item.amount).toLocaleString()}</div>
                    <div className="text-xs text-slate-500 mt-0.5">default</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="flex flex-col gap-2">
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-3 text-xs text-blue-400">
          Income timing: current &amp; past months show actual received income from transactions.
          Future months show net rent from prior month's reservations minus ${PROTECTION_PER_NIGHT}/night protection.
        </div>
        <div className="bg-slate-500/5 border border-slate-500/20 rounded-xl px-4 py-3 text-xs text-slate-400">
          Past &amp; current months show actual categorized expenses.
          <span className="text-yellow-400"> Electricity</span> = non-City-of-Galveston Utilities;
          <span className="text-teal-400"> Water / Trash</span> = City of Galveston Utilities.
          Click any <span className="text-white">future month cell</span> (or extra expense cell) to enter the amount for that month.
        </div>
      </div>

      {/* Table */}
      <div className="bg-navy-800 border border-navy-700 rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="border-b border-navy-700 text-xs uppercase">
              <th className="text-left px-4 py-3 text-slate-400 sticky left-0 bg-navy-800">Month</th>
              <th className="text-right px-4 py-3 text-slate-400">Start Bal</th>
              {showExpenseDetail && EXPENSE_ITEMS.map(item => (
                <th key={item.key} className={`text-right px-4 py-3 ${item.col}`}>{item.label}</th>
              ))}
              {showExpenseDetail && <th className="text-right px-4 py-3 text-yellow-400">HOA</th>}
              {showExpenseDetail && extraExpenses.map(item => (
                <th key={item.id} className="text-right px-4 py-3 text-slate-400">{item.label}</th>
              ))}
              {showExpenseDetail && <th className="text-right px-4 py-3 text-slate-400">Other</th>}
              <th className="text-right px-4 py-3 text-red-400 cursor-pointer select-none hover:text-red-300 whitespace-nowrap"
                onClick={() => setShowExpenseDetail(v => !v)}
                title={showExpenseDetail ? 'Collapse expense detail' : 'Expand expense detail'}>
                <span className="inline-flex items-center justify-end gap-1">
                  {showExpenseDetail ? <ChevronLeft size={11} /> : <ChevronRight size={11} />}
                  Total Exp
                </span>
              </th>
              <th className="text-right px-4 py-3 text-emerald-400">Income</th>
              {/* CFS columns — expand/collapse */}
              {showCFSDetail && owners.length > 0
                ? owners.map((o, idx) => (
                    <th key={`cfs-h-${o.id}`}
                      className={`text-right px-4 py-3 text-blue-400 whitespace-nowrap ${idx === 0 ? 'cursor-pointer hover:text-blue-300 select-none' : ''}`}
                      onClick={idx === 0 ? () => setShowCFSDetail(false) : undefined}
                      title={idx === 0 ? 'Collapse CFS detail' : undefined}>
                      <span className="inline-flex items-center justify-end gap-1">
                        {idx === 0 && <ChevronLeft size={11} />}
                        {o.name.split(' ')[0]} CFS
                      </span>
                    </th>
                  ))
                : <th className="text-right px-4 py-3 text-blue-400 cursor-pointer select-none hover:text-blue-300 whitespace-nowrap"
                    onClick={() => owners.length > 0 && setShowCFSDetail(true)}
                    title={owners.length > 0 ? 'Expand CFS per owner' : undefined}>
                    <span className="inline-flex items-center justify-end gap-1">
                      {owners.length > 0 && <ChevronRight size={11} />}
                      CFS
                    </span>
                  </th>
              }
              <th className="text-right px-4 py-3 text-slate-300">Net</th>
              {/* Reserve columns — expand/collapse */}
              {showReserveDetail && owners.length > 0
                ? owners.map((o, idx) => (
                    <th key={o.id}
                      className={`text-right px-4 py-3 text-slate-400 whitespace-nowrap ${idx === 0 ? 'cursor-pointer hover:text-slate-300 select-none' : ''}`}
                      onClick={idx === 0 ? () => setShowReserveDetail(false) : undefined}
                      title={idx === 0 ? 'Collapse reserve detail' : undefined}>
                      <span className="inline-flex items-center justify-end gap-1">
                        {idx === 0 && <ChevronLeft size={11} />}
                        {o.name.split(' ')[0]} Reserve
                      </span>
                    </th>
                  ))
                : owners.length > 0
                  ? <th className="text-right px-4 py-3 text-slate-400 cursor-pointer select-none hover:text-slate-300 whitespace-nowrap"
                      onClick={() => setShowReserveDetail(true)}
                      title="Expand reserve per owner">
                      <span className="inline-flex items-center justify-end gap-1">
                        <ChevronRight size={11} />
                        Reserve
                      </span>
                    </th>
                  : <th className="text-right px-4 py-3 text-slate-400">End Balance</th>
              }
            </tr>
          </thead>

          <tbody className="divide-y divide-navy-700">
            {rows.map((row, i) => {
              const reserveEntry = ownerReserveCalc[i];
              return (
                <tr key={row.month} className={`transition-colors ${
                  row.isPast    ? 'opacity-50 hover:opacity-70' :
                  row.isCurrent ? 'bg-navy-700/30' :
                  'hover:bg-navy-700/10'
                }`}>
                  <td className="px-4 py-3 sticky left-0 bg-navy-800 font-medium text-white whitespace-nowrap">
                    {row.label}
                    {row.isPast    && <span className="ml-2 text-xs text-slate-500 font-normal">actual</span>}
                    {row.isCurrent && <span className="ml-2 text-xs text-emerald-500 font-normal">current</span>}
                  </td>

                  {/* Start Balance */}
                  {(() => {
                    const p = projection.find(x => x.month === row.month);
                    return (
                      <td className={`px-4 py-3 text-right ${p?.startBalance != null ? endBalColor(p.startBalance) : ''}`}>
                        {p?.startBalance != null ? fmt(p.startBalance) : <span className="text-slate-600">—</span>}
                      </td>
                    );
                  })()}

                  {/* Fixed expense cells */}
                  {showExpenseDetail && EXPENSE_ITEMS.map(item => (
                    <EditableCell key={item.key} month={row.month} itemKey={item.key}
                      value={row.expenseItems[item.key]} isActualRow={row.isPast} isFixed={true} />
                  ))}
                  {showExpenseDetail && (
                    <td className={`px-4 py-3 text-right ${row.hoaDue > 0 ? 'text-yellow-400' : 'text-slate-600'}`}>
                      {row.hoaDue > 0 ? fmt(row.hoaDue) : '—'}
                    </td>
                  )}
                  {showExpenseDetail && extraExpenses.map(e => (
                    <EditableCell key={e.id} month={row.month} itemKey={e.id}
                      value={row.extraItems[e.id]} isActualRow={row.isActual} isFixed={false} />
                  ))}
                  {showExpenseDetail && (
                    <td className="px-4 py-3 text-right text-slate-300 cursor-pointer hover:bg-navy-700/40 hover:text-white group"
                      onClick={() => openItemsModal(row.month, row.monthItemsList)}
                      title="Click to add/edit other expenses">
                      {row.otherTotal > 0
                        ? <span className="text-slate-200">{fmt(row.otherTotal)}</span>
                        : <span className="text-slate-600 group-hover:text-slate-400">+ add</span>}
                    </td>
                  )}

                  <td className="px-4 py-3 text-right font-semibold text-red-400">
                    {row.totalExpenses > 0 ? fmt(row.totalExpenses) : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-400">
                    {row.income > 0 ? fmt(row.income) : <span className="text-slate-600">—</span>}
                  </td>

                  {/* CFS columns — per-owner when expanded, combined when collapsed */}
                  {showCFSDetail && owners.length > 0
                    ? owners.map(o => {
                        const entry  = ownerReserveCalc[i];
                        const cfsVal = (row.isPast || row.isCurrent)
                          ? (ownerCFSActual[row.month]?.[o.id] || 0)
                          : (entry?.cfsPerOwner[o.id] || 0);
                        const start  = entry?.startBalance[o.id];
                        const net    = entry?.netShare[o.id];
                        const pre    = entry?.preBalance[o.id];
                        const showDetail = !row.isPast && !row.isCurrent && start != null;
                        return (
                          <td key={`cfs-${o.id}`} className={`px-4 py-3 text-right ${cfsVal > 0 ? 'text-blue-400' : 'text-slate-600'}`}>
                            <div className={`font-semibold ${cfsVal > 0 ? 'text-blue-400' : 'text-slate-600'}`}>
                              {cfsVal > 0 ? fmt(cfsVal) : '—'}
                            </div>
                            {showDetail && (
                              <div className="text-xs text-slate-600 mt-0.5 space-y-0.5">
                                <div>start {fmtDec(start)}</div>
                                <div>{net >= 0 ? '+' : ''}{fmtDec(net)} net</div>
                                <div className={pre < RESERVE_TARGET ? 'text-red-500/70' : 'text-slate-600'}>{fmtDec(pre)} pre</div>
                              </div>
                            )}
                          </td>
                        );
                      })
                    : (() => {
                        if (row.isPast) return (
                          <td key="cfs" className={`px-4 py-3 text-right font-semibold ${row.cashFlowSupport > 0 ? 'text-blue-400' : 'text-slate-600'}`}>
                            {row.cashFlowSupport > 0 ? fmt(row.cashFlowSupport) : '—'}
                          </td>
                        );
                        if (row.isCurrent) {
                          const projSupport = Math.max(0, MIN_BALANCE - (currentStartBal + row.net));
                          const displayVal  = row.cashFlowSupport > 0 ? row.cashFlowSupport : projSupport;
                          const isProj      = row.cashFlowSupport === 0 && projSupport > 0;
                          return (
                            <td key="cfs" className={`px-4 py-3 text-right font-semibold ${displayVal > 0 ? 'text-blue-400' : 'text-slate-600'}`}>
                              {displayVal > 0 ? fmt(displayVal) : '—'}
                              {isProj && <div className="text-xs text-slate-500 leading-none mt-0.5">proj.</div>}
                            </td>
                          );
                        }
                        const p = projection.find(x => x.month === row.month);
                        const supportNeeded = p?.supportNeeded || 0;
                        return (
                          <td key="cfs" className={`px-4 py-3 text-right font-semibold ${supportNeeded > 0 ? 'text-blue-400' : 'text-slate-600'}`}>
                            {supportNeeded > 0 ? fmt(supportNeeded) : '—'}
                          </td>
                        );
                      })()
                  }

                  <td className={`px-4 py-3 text-right font-bold ${row.net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {row.net === 0 ? <span className="text-slate-600">—</span> : (row.net > 0 ? '+' : '') + fmt(row.net)}
                  </td>

                  {/* Reserve columns — per-owner when expanded, single placeholder when collapsed */}
                  {showReserveDetail && owners.length > 0
                    ? owners.map(o => {
                        const bal = reserveEntry?.ownerBals[o.id];
                        if (row.isPast) return <td key={o.id} className="px-4 py-3 text-right text-slate-600">—</td>;
                        return (
                          <td key={o.id} className="px-4 py-3 text-right">
                            {bal == null
                              ? <span className="text-slate-600">—</span>
                              : <span className={`font-semibold ${reserveColor(bal)}`}>{fmtDec(bal)}</span>
                            }
                          </td>
                        );
                      })
                    : owners.length > 0
                      ? [(() => {
                          if (row.isPast) return <td key="reserve-collapsed" className="px-4 py-3 text-right text-slate-600">—</td>;
                          const hasAll  = owners.every(o => reserveEntry?.ownerBals[o.id] != null);
                          const totalBal = hasAll ? owners.reduce((s, o) => s + reserveEntry.ownerBals[o.id], 0) : null;
                          return (
                            <td key="reserve-collapsed" className="px-4 py-3 text-right">
                              {totalBal == null
                                ? <span className="text-slate-600">—</span>
                                : <span className={`font-semibold ${reserveColor(totalBal / owners.length)}`}>{fmtDec(totalBal)}</span>
                              }
                            </td>
                          );
                        })()]
                      : (() => {
                          const p = projection.find(x => x.month === row.month);
                          if (row.isCurrent) return (
                            <td className={`px-4 py-3 text-right font-semibold cursor-pointer hover:bg-navy-700/40 ${endBalColor(currentEndBal)}`}
                              onClick={() => { setEndBalDraft(String(currentEndBal)); setEditingEndBal(true); }}
                              title="Click to record actual ending balance">
                              {fmt(currentEndBal)}
                            </td>
                          );
                          return (
                            <td className={`px-4 py-3 text-right font-semibold ${p?.endBalance == null ? 'text-slate-600' : endBalColor(p.endBalance)}`}>
                              {p?.endBalance != null ? fmt(p.endBalance) : <span className="text-slate-600">—</span>}
                            </td>
                          );
                        })()
                  }
                </tr>
              );
            })}
          </tbody>

          <tfoot>
            <tr className="border-t-2 border-navy-600 bg-navy-900/60">
              <td className="px-4 py-3 font-bold text-white sticky left-0 bg-navy-900/60">Total</td>
              <td className="px-4 py-3" />
              {showExpenseDetail && EXPENSE_ITEMS.map(item => (
                <td key={item.key} className="px-4 py-3 text-right font-semibold text-slate-200">{fmt(totals[item.key])}</td>
              ))}
              {showExpenseDetail && <td className={`px-4 py-3 text-right font-semibold ${totals.hoaDue > 0 ? 'text-yellow-400' : 'text-slate-600'}`}>{totals.hoaDue > 0 ? fmt(totals.hoaDue) : '—'}</td>}
              {showExpenseDetail && extraExpenses.map(e => (
                <td key={e.id} className="px-4 py-3 text-right font-semibold text-slate-200">{fmt(totals[e.id])}</td>
              ))}
              {showExpenseDetail && <td className="px-4 py-3 text-right font-semibold text-slate-200">{fmt(totals.otherTotal)}</td>}
              <td className="px-4 py-3 text-right font-bold text-red-400">{fmt(totals.totalExpenses)}</td>
              <td className="px-4 py-3 text-right font-bold text-emerald-400">{fmt(totals.income)}</td>
              {/* CFS tfoot — per-owner or combined to match header */}
              {showCFSDetail && owners.length > 0
                ? owners.map(o => {
                    const ownerTotal = ownerTotals.find(t => t.id === o.id);
                    return (
                      <td key={`cfs-total-${o.id}`} className="px-4 py-3 text-right font-bold">
                        {(ownerTotal?.totalCFS || 0) > 0
                          ? <span className="text-blue-400">{fmt(ownerTotal.totalCFS)}</span>
                          : <span className="text-slate-600">—</span>}
                      </td>
                    );
                  })
                : <td className={`px-4 py-3 text-right font-bold ${combinedCFSTotal > 0 ? 'text-blue-400' : 'text-slate-600'}`}>
                    {combinedCFSTotal > 0 ? fmt(combinedCFSTotal) : '—'}
                  </td>
              }
              <td className={`px-4 py-3 text-right font-bold ${totals.net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {totals.net >= 0 ? '+' : ''}{fmt(totals.net)}
              </td>
              {/* Reserve tfoot — per-owner or single placeholder to match header */}
              {showReserveDetail && owners.length > 0
                ? owners.map(o => <td key={o.id} className="px-4 py-3 text-right text-slate-600">—</td>)
                : owners.length > 0
                  ? <td className="px-4 py-3 text-right text-slate-600">—</td>
                  : <td className="px-4 py-3" />
              }
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Cash flow support summary */}
      {totalSupportNeeded > 0 && (
        <div className="bg-navy-800 border border-blue-400/30 rounded-xl p-5">
          {/* Header row — always visible, click to expand/collapse */}
          <button
            className="w-full flex items-center justify-between text-left"
            onClick={() => setShowCFSSummary(v => !v)}
          >
            <div>
              <div className="text-sm font-semibold text-white mb-1">Cash Flow Support Required</div>
              {owners.length > 0 && ownerTotals.some(o => o.totalCFS > 0) && (
                <div className="flex flex-wrap gap-4">
                  {ownerTotals.filter(o => o.totalCFS > 0).map(o => (
                    <span key={o.id} className="text-xs text-slate-400">
                      {o.name.split(' ')[0]}: <span className="text-blue-400 font-semibold">{fmt(o.totalCFS)}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 ml-4 flex-shrink-0">
              <div className="text-right">
                <div className="text-lg font-bold text-blue-400">{fmt(totalSupportNeeded)}</div>
                <div className="text-xs text-slate-500">combined total</div>
              </div>
              {showCFSSummary ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
            </div>
          </button>

          {/* Expanded month-by-month breakdown */}
          {showCFSSummary && (
            <div className="mt-4 pt-4 border-t border-navy-700">
              <p className="text-xs text-slate-500 mb-3">
                {allOwnersHaveReserves
                  ? `Amount needed each month to keep each owner's reserve balance at or above $${RESERVE_TARGET.toLocaleString()}`
                  : `Amount needed each month to keep the WF checking balance at or above $${MIN_BALANCE.toLocaleString()}`}
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {projection.filter(p => p.supportNeeded > 0).map(p => {
                  const [yr, mo] = p.month.split('-').map(Number);
                  const resEntry = ownerReserveCalc.find(x => x.month === p.month);
                  return (
                    <div key={p.month} className="bg-navy-900 border border-blue-400/20 rounded-lg p-3">
                      <div className="text-xs text-slate-400 mb-1">{MONTHS[mo - 1]} {yr}</div>
                      <div className="text-lg font-bold text-blue-400">{fmt(p.supportNeeded)}</div>
                      {allOwnersHaveReserves && resEntry && owners.length > 0 ? (
                        <div className="mt-2 pt-2 border-t border-navy-800 space-y-1">
                          {owners.map(o => {
                            const cfs = resEntry.cfsPerOwner[o.id] || 0;
                            const bal = resEntry.ownerBals[o.id];
                            return (
                              <div key={o.id}>
                                <div className="flex justify-between items-baseline text-xs">
                                  <span className="text-slate-400 truncate mr-1">{o.name.split(' ')[0]}</span>
                                  <span className={`font-semibold shrink-0 ${cfs > 0 ? 'text-blue-400' : 'text-slate-600'}`}>
                                    {cfs > 0 ? fmt(cfs) : '—'}
                                  </span>
                                </div>
                                {bal != null && (
                                  <div className={`text-xs text-right ${reserveColor(bal)}`}>
                                    reserve: {fmtDec(bal)}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 mt-0.5">Proj. end bal: {fmt(p.endBalance)}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {totalSupportNeeded === 0 && (
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-3 text-sm text-emerald-400">
          {allOwnersHaveReserves
            ? `No cash flow support needed — all owner reserves projected to stay at or above $${RESERVE_TARGET.toLocaleString()} throughout the period.`
            : `No cash flow support needed — projected balance stays above $${MIN_BALANCE.toLocaleString()} throughout the period.`}
        </div>
      )}

    </div>
  );
}
