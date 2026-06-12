import { useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { useTransactions } from '../hooks/useTransactions';
import { usePropertyTaxes } from '../hooks/usePropertyTaxes';
import { useHoaDues } from '../hooks/useHoaDues';
import { useReservations } from '../hooks/useReservations';
import { useAppSetting } from '../hooks/useAppSetting';
import { txInMonth, amountForMonth } from '../utils/transactions';

function StatCard({ icon: Icon, label, value, sub, color = 'emerald' }) {
  const colors = {
    emerald: 'text-emerald-400 bg-emerald-400/10',
    red:     'text-red-400 bg-red-400/10',
    yellow:  'text-yellow-400 bg-yellow-400/10',
    purple:  'text-purple-400 bg-purple-400/10',
  };
  return (
    <div className="bg-navy-800 rounded-xl p-5 border border-navy-700">
      <div className="flex items-center justify-between mb-3">
        <span className="text-slate-400 text-sm">{label}</span>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colors[color]}`}><Icon size={18} /></div>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-slate-400 text-xs mt-1">{sub}</div>}
    </div>
  );
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function Bar({ income, expense, taxDue, cfs, maxVal, height }) {
  const h = (v) => maxVal > 0 ? `${(v / maxVal) * 100}%` : '0%';
  const taxFrac = taxDue > 0 && expense > 0 ? (taxDue / expense) * 100 : 0;
  const totalIncome = income + (cfs || 0);
  const cfsFrac = cfs > 0 && totalIncome > 0 ? (cfs / totalIncome) * 100 : 0;
  return (
    <div className="flex gap-px" style={{ height }}>
      <div className="flex-1 flex flex-col justify-end">
        <div style={{ height: h(totalIncome) }} className="flex flex-col-reverse overflow-hidden rounded-t w-full">
          <div className="bg-emerald-500/80 flex-1" />
          {cfsFrac > 0 && <div className="bg-blue-600/90 flex-shrink-0" style={{ height: `${cfsFrac}%` }} />}
        </div>
      </div>
      <div className="flex-1 flex flex-col justify-end">
        <div style={{ height: h(expense) }} className="flex flex-col-reverse overflow-hidden rounded-t w-full">
          <div className="bg-red-500/80 flex-1" />
          {taxFrac > 0 && <div className="bg-yellow-400/90 flex-shrink-0" style={{ height: `${taxFrac}%` }} />}
        </div>
      </div>
    </div>
  );
}

const DEFAULT_CASHFLOW_BUDGETS = { mortgage: 0, cableInternet: 0, electricity: 0, waterTrash: 0, windstormInsurance: 0 };
const EXPENSE_KEYS = Object.keys(DEFAULT_CASHFLOW_BUDGETS);
const PROTECTION_PER_NIGHT = 8.54;

export default function ProjectedCashflow() {
  const { transactions }              = useTransactions();
  const { propertyTaxes: taxRecords } = usePropertyTaxes();
  const { hoaDues: hoaRecords }       = useHoaDues();
  const { reservations }              = useReservations();
  const [sfAccounts]       = useAppSetting('simplefin_accounts', {});
  const [projStartBal]     = useAppSetting('cashflow_proj_start', 0);
  const [startBals]        = useAppSetting('cashflow_start_bals', {});
  const [endBals]          = useAppSetting('cashflow_end_bals', {});
  const [cashflowBudgets]    = useAppSetting('cashflow_budgets', DEFAULT_CASHFLOW_BUDGETS);
  const [cashflowExtra]      = useAppSetting('cashflow_extra', []);
  const [cashflowMonthly]    = useAppSetting('cashflow_monthly', {});
  const [cashflowMonthItems] = useAppSetting('cashflow_month_items', {});
  const [viewMode, setViewMode]       = useState('year');
  const [selectedIdx, setSelectedIdx] = useState(null);

  const handleBarClick = (i) => setSelectedIdx(prev => prev === i ? null : i);

  const currentYear     = new Date().getFullYear();
  const currentMonthIdx = new Date().getMonth();
  const currentMonthStr = `${currentYear}-${String(currentMonthIdx + 1).padStart(2, '0')}`;
  const effectiveStartBal = startBals[currentMonthStr] ?? Number(projStartBal) ?? 0;
  const fmt     = (n) => '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const fmtAxis = (n) => {
    if (n === 0) return '$0';
    if (n >= 1_000_000) return `$${(n/1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `$${Math.round(n/1_000)}k`;
    return `$${Math.round(n)}`;
  };

  const monthlyActuals = useMemo(() => MONTHS.map((_, mi) => {
    const month = `${currentYear}-${String(mi + 1).padStart(2, '0')}`;
    const txs = transactions.filter(t => !t.excluded && txInMonth(t, month));
    const income  = txs.filter(t => t.type === 'Income'  && t.category !== 'Cash Flow Support').reduce((s, t) => s + amountForMonth(t, month), 0);
    const expense = txs.filter(t => t.type === 'Expense' && t.category !== 'Cash Flow Support').reduce((s, t) => s + amountForMonth(t, month), 0);
    return { income, expense, net: income - expense };
  }), [transactions, currentYear]);

  // Income is paid the month AFTER the night was stayed.
  // Cross-month reservations are split proportionally by nights per calendar month.
  const incomeByPayMonth = useMemo(() => {
    const map = {};
    for (const r of reservations) {
      if (r.status === 'Cancelled' || !r.checkIn || !r.checkOut) continue;
      const totalNights = r.nights || 0;
      if (totalNights <= 0) continue;
      const protection  = r.isOwnerHold ? 0 : totalNights * PROTECTION_PER_NIGHT;
      const netPerNight = (Number(r.netRent || 0) - protection) / totalNights;
      // Walk each night and assign its income to the following month
      let d = new Date(r.checkIn + 'T12:00:00');
      const out = new Date(r.checkOut + 'T12:00:00');
      while (d < out) {
        const [yr, mo] = d.toISOString().slice(0, 7).split('-').map(Number);
        const payMo = mo === 12 ? 1 : mo + 1;
        const payYr = mo === 12 ? yr + 1 : yr;
        const pay = `${payYr}-${String(payMo).padStart(2, '0')}`;
        map[pay] = (map[pay] || 0) + netPerNight;
        d.setDate(d.getDate() + 1);
      }
    }
    return map;
  }, [reservations]);

  const taxByMonth = useMemo(() => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const paid = new Map();
    transactions.filter(tx => tx.category === 'Property Tax' && tx.taxYear && !tx.excluded)
      .forEach(tx => {
        const key = `${tx.taxYear}|${tx.taxType || ''}`;
        paid.set(key, (paid.get(key) || 0) + Number(tx.amount));
      });
    const map = new Map();
    for (const r of taxRecords) {
      if (!r.dueDate || !r.annualAmount) continue;
      if (r.dueDate.slice(0, 7) < currentMonth) continue;
      const key = `${r.taxYear}|${r.taxType || ''}`;
      const balance = Math.max(Number(r.annualAmount) - (paid.get(key) || 0), 0);
      if (balance <= 0) continue;
      const month = r.dueDate.slice(0, 7);
      map.set(month, (map.get(month) || 0) + balance);
    }
    return map;
  }, [taxRecords, transactions]);

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

  const chartSlots = useMemo(() => {
    if (viewMode === 'year') {
      return Array.from({ length: 12 }, (_, i) => ({
        label: MONTHS[i],
        month: `${currentYear}-${String(i + 1).padStart(2, '0')}`,
        isPast: i < currentMonthIdx,
        isCurrent: i === currentMonthIdx,
      }));
    }
    return Array.from({ length: 12 }, (_, i) => {
      const d   = new Date(currentYear, currentMonthIdx + i, 1);
      const yr  = d.getFullYear();
      const mi  = d.getMonth();
      const month = `${yr}-${String(mi + 1).padStart(2, '0')}`;
      const label = MONTHS[mi] + (yr !== currentYear ? ` '${String(yr).slice(2)}` : '');
      return { label, month, isPast: false, isCurrent: i === 0 };
    });
  }, [viewMode, currentYear, currentMonthIdx]);

  const monthData = useMemo(() => chartSlots.map(({ label, month, isPast, isCurrent }) => {
    const txs = transactions.filter(t => !t.excluded && txInMonth(t, month));
    const actualIncome  = txs.filter(t => t.type === 'Income'  && t.category !== 'Cash Flow Support').reduce((s, t) => s + amountForMonth(t, month), 0);
    const actualExpense = txs.filter(t => t.type === 'Expense' && t.category !== 'Cash Flow Support').reduce((s, t) => s + amountForMonth(t, month), 0);
    const taxDue = (taxByMonth.get(month) || 0) + (hoaByMonth.get(month) || 0);

    const fixedTotal = EXPENSE_KEYS.reduce((s, key) => s + (cashflowMonthly[month]?.[key] ?? cashflowBudgets[key] ?? 0), 0);
    const extraTotal = (cashflowExtra || []).reduce((s, e) => s + (cashflowMonthly[month]?.[e.id] ?? Number(e.amount || 0)), 0);
    const otherTotal = (cashflowMonthItems[month] || []).reduce((s, i) => s + Number(i.amount || 0), 0);
    const budgetExpense = fixedTotal + extraTotal + otherTotal;

    let projExpense;
    if (isPast) {
      projExpense = actualExpense;
    } else if (isCurrent) {
      // Use actuals if present, otherwise fall back to budget so the current month shows something
      projExpense = actualExpense > 0 ? actualExpense : budgetExpense;
    } else {
      projExpense = budgetExpense;
    }

    const cashFlowSupport = (isPast || isCurrent)
      ? txs.filter(t => t.category === 'Cash Flow Support').reduce((s, t) => s + amountForMonth(t, month), 0)
      : 0;

    // Current month: use actuals if recorded, otherwise show projected reservation income
    const income  = isPast ? actualIncome
      : isCurrent ? (actualIncome > 0 ? actualIncome : (incomeByPayMonth[month] || 0))
      : (incomeByPayMonth[month] || 0);
    const expense = projExpense + (isPast ? 0 : taxDue);
    return { label, month, income, expense, cashFlowSupport, taxDue: isPast ? 0 : taxDue, net: income - expense, projected: !isPast && !isCurrent, isCurrent };
  }), [chartSlots, transactions, incomeByPayMonth, taxByMonth, hoaByMonth, cashflowBudgets, cashflowExtra, cashflowMonthly, cashflowMonthItems]);

  const totalIncome  = monthData.reduce((s, m) => s + m.income, 0);
  const totalExpense = monthData.reduce((s, m) => s + m.expense, 0);
  const totalNet     = monthData.reduce((s, m) => s + m.net, 0);

  const MIN_BALANCE = 1000;
  const currentEndBal = endBals[currentMonthStr] != null ? Number(endBals[currentMonthStr]) : MIN_BALANCE;

  // Support calc:
  //  Past months  → 0 (we don't retroactively project; only actual CFS transactions show)
  //  Current month → computed from effectiveStartBal + June net vs $1k floor
  //  Future months → running balance forward from currentEndBal
  const supportCalc = useMemo(() => {
    const items = [];
    let balance = null;

    for (let i = 0; i < monthData.length; i++) {
      const m = monthData[i];

      if (balance === null) {
        if (m.isCurrent || viewMode === 'forward') {
          const natural       = effectiveStartBal + m.net;
          const supportNeeded = m.cashFlowSupport > 0 ? 0 : Math.max(0, MIN_BALANCE - natural);
          balance = currentEndBal;
          items.push({ supportNeeded, endBalance: currentEndBal });
        } else {
          // Past month before we've hit the current month
          items.push({ supportNeeded: 0, endBalance: null });
        }
      } else {
        // Future months: project forward from running balance
        const natural       = balance + m.net + m.cashFlowSupport;
        const supportNeeded = Math.max(0, MIN_BALANCE - natural);
        balance = supportNeeded > 0 ? MIN_BALANCE : natural;
        items.push({ supportNeeded, endBalance: balance });
      }
    }
    return items;
  }, [effectiveStartBal, currentEndBal, monthData, viewMode]);

  const totalSupportNeeded = supportCalc.reduce((s, m) => s + (m.supportNeeded || 0), 0);

  // CFS bar: actual CFS from transactions when present, else projected support needed
  const cfsForBar = monthData.map((m, i) => {
    if (m.cashFlowSupport > 0) return m.cashFlowSupport;
    return supportCalc[i]?.supportNeeded || 0;
  });

  const maxVal = Math.max(...monthData.map((m, i) => Math.max(m.income + cfsForBar[i], m.expense)), 1);

  const CHART_H = 320;

  const ytdInc = monthlyActuals.reduce((s, m) => s + m.income, 0);
  const ytdExp = monthlyActuals.reduce((s, m) => s + m.expense, 0);
  const period = viewMode === 'year' ? `${currentYear}` : 'Next 12 months';

  return (
    <div className="p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Cashflow Summary</h1>
          <p className="text-slate-400 text-sm mt-1">{viewMode === 'year' ? `${currentYear} — Actuals + forward projections` : '12 months forward from today'}</p>
        </div>
        <div className="flex gap-1 p-1 bg-navy-800 border border-navy-700 rounded-lg w-full sm:w-auto">
          <button onClick={() => setViewMode('year')} className={`flex-1 sm:flex-none px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'year' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white'}`}>Current Year</button>
          <button onClick={() => setViewMode('forward')} className={`flex-1 sm:flex-none px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'forward' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white'}`}>12 Months Forward</button>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={TrendingUp}   label={`${period} Income`}   value={fmt(totalIncome)}  sub={viewMode === 'year' ? `YTD: ${fmt(ytdInc)}` : 'Actuals + projected'} color="emerald" />
        <StatCard icon={TrendingDown} label={`${period} Expenses`} value={fmt(totalExpense)} sub={viewMode === 'year' ? `YTD: ${fmt(ytdExp)}` : 'Actuals + projected'} color="red" />
        <StatCard icon={DollarSign}   label="Net Cashflow"         value={(totalNet >= 0 ? '+' : '-') + fmt(totalNet)} sub={period} color={totalNet >= 0 ? 'emerald' : 'red'} />
        <StatCard icon={DollarSign} label="Est. Support Needed"
          value={totalSupportNeeded > 0 ? fmt(totalSupportNeeded) : '$0'}
          sub={totalSupportNeeded > 0 ? 'to maintain $1,000 min balance' : 'Balance stays above $1,000'}
          color={totalSupportNeeded > 0 ? 'yellow' : 'emerald'} />
      </div>

      <div className="bg-navy-800 border border-navy-700 rounded-xl p-6">
        <div className="flex items-center flex-wrap gap-4 mb-5 text-xs text-slate-400">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-500/80 inline-block" /> Income</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-600/90 inline-block" /> CFS / Proj. support</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-500/80 inline-block" /> Expenses</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-yellow-400/90 inline-block" /> Taxes/HOA</span>
          <span className="text-slate-600">Faded = projected</span>
        </div>

        <div className="flex gap-3 overflow-x-auto">
          <div className="flex flex-col justify-between text-right text-xs text-slate-500 w-10 flex-shrink-0" style={{ height: 358, paddingBottom: 38 }}>
            {[1, 0.75, 0.5, 0.25, 0].map(pct => <span key={pct}>{fmtAxis(maxVal * pct)}</span>)}
          </div>
          <div className="flex-1 relative min-w-[640px]">
            <div className="grid grid-cols-12 gap-3">
              {monthData.map((m, i) => {
                const isSelected = selectedIdx === i;
                return (
                  <div key={i}
                    onClick={() => handleBarClick(i)}
                    className={`relative cursor-pointer rounded-lg transition-all ${
                      isSelected ? 'ring-2 ring-emerald-500' :
                      m.isCurrent ? 'ring-1 ring-slate-500/40' : 'hover:bg-navy-700/20'
                    }`}>
                    <div className={m.projected ? 'opacity-40' : ''}>
                      <Bar income={m.income} expense={m.expense} taxDue={m.taxDue ?? 0} cfs={cfsForBar[i]} maxVal={maxVal} height={CHART_H} />
                      <div className={`text-xs text-center mt-2 ${isSelected ? 'text-emerald-400 font-medium' : 'text-slate-500'}`}>{m.label}</div>
                      <div className={`text-xs text-center font-semibold mt-0.5 ${m.net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{m.net >= 0 ? '+' : ''}{fmt(m.net)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Month detail panel */}
      {selectedIdx !== null && (() => {
        const m    = monthData[selectedIdx];
        const sc   = supportCalc[selectedIdx];
        const cfs  = cfsForBar[selectedIdx];
        const proj = m.projected;
        const label = `${m.label}${proj ? ' (projected)' : m.isCurrent ? ' (current)' : ''}`;

        // Income for month M = nights stayed in month M-1, paid out in M.
        // Cross-month stays are split by night count in the prior month.
        const [yr, mo] = m.month.split('-').map(Number);
        const priorMo  = mo === 1 ? 12 : mo - 1;
        const priorYr  = mo === 1 ? yr - 1 : yr;
        const priorStr = `${priorYr}-${String(priorMo).padStart(2, '0')}`;

        const contributingRes = reservations
          .filter(r => r.status !== 'Cancelled' && r.checkIn && r.checkOut && (r.nights || 0) > 0)
          .map(r => {
            // Count nights in the prior month
            let nightsInPrior = 0;
            let d = new Date(r.checkIn + 'T12:00:00');
            const out = new Date(r.checkOut + 'T12:00:00');
            while (d < out) {
              if (d.toISOString().startsWith(priorStr)) nightsInPrior++;
              d.setDate(d.getDate() + 1);
            }
            if (!nightsInPrior) return null;
            const totalNights = r.nights;
            const protection  = r.isOwnerHold ? 0 : totalNights * PROTECTION_PER_NIGHT;
            const netPerNight = (Number(r.netRent || 0) - protection) / totalNights;
            return { ...r, nightsInPrior, totalNights, incomeContrib: netPerNight * nightsInPrior };
          })
          .filter(Boolean);

        const fmtFull = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        return (
          <div className="bg-navy-800 border border-navy-700 rounded-xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
              <h3 className="font-semibold text-white">{label}</h3>
              <button onClick={() => setSelectedIdx(null)} className="text-slate-500 hover:text-white text-xs">✕ close</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

              {/* Income */}
              <div className="bg-navy-900 rounded-lg p-4">
                <div className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-3">
                  Income <span className="text-slate-600 normal-case font-normal">(nights stayed in {priorStr.slice(0,7) === priorStr ? priorStr : priorStr})</span>
                </div>
                {contributingRes.length > 0 ? (
                  <div className="space-y-2">
                    {contributingRes.map(r => (
                      <div key={r.id} className="flex justify-between text-xs gap-2">
                        <span className={`truncate ${r.isOwnerHold ? 'text-yellow-400' : 'text-slate-400'}`}>
                          {r.isOwnerHold ? 'Owner Hold' : r.guestName}
                          {r.nightsInPrior < r.totalNights && (
                            <span className="text-slate-600 ml-1">({r.nightsInPrior}/{r.totalNights} nights)</span>
                          )}
                        </span>
                        <span className={`flex-shrink-0 font-medium ${r.incomeContrib >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {r.incomeContrib >= 0 ? '' : '-'}{fmtFull(Math.abs(r.incomeContrib))}
                        </span>
                      </div>
                    ))}
                    <div className="flex justify-between text-sm font-semibold border-t border-navy-700 pt-2 mt-2">
                      <span className="text-slate-300">Total</span>
                      <span className={m.income >= 0 ? 'text-emerald-400' : 'text-red-400'}>{fmtFull(m.income)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">{proj ? 'Projected' : 'No stays in prior month'}</span>
                    <span className="text-emerald-400">{m.income > 0 ? fmtFull(m.income) : '—'}</span>
                  </div>
                )}
              </div>

              {/* Expenses */}
              <div className="bg-navy-900 rounded-lg p-4">
                <div className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-3">Expenses</div>
                <div className="space-y-2 text-xs">
                  {cashflowBudgets.mortgage       > 0 && <div className="flex justify-between"><span className="text-slate-400">Mortgage</span><span className="text-red-400">{fmtFull(cashflowBudgets.mortgage)}</span></div>}
                  {cashflowBudgets.electricity    > 0 && <div className="flex justify-between"><span className="text-slate-400">Electricity</span><span className="text-red-400">{fmtFull(cashflowBudgets.electricity)}</span></div>}
                  {cashflowBudgets.waterTrash     > 0 && <div className="flex justify-between"><span className="text-slate-400">Water / Trash</span><span className="text-red-400">{fmtFull(cashflowBudgets.waterTrash)}</span></div>}
                  {cashflowBudgets.cableInternet  > 0 && <div className="flex justify-between"><span className="text-slate-400">Cable / Internet</span><span className="text-red-400">{fmtFull(cashflowBudgets.cableInternet)}</span></div>}
                  {cashflowBudgets.windstormInsurance > 0 && <div className="flex justify-between"><span className="text-slate-400">Insurance</span><span className="text-red-400">{fmtFull(cashflowBudgets.windstormInsurance)}</span></div>}
                  {m.taxDue > 0 && <div className="flex justify-between"><span className="text-yellow-400">Taxes / HOA</span><span className="text-yellow-400">{fmtFull(m.taxDue)}</span></div>}
                  <div className="flex justify-between text-sm font-semibold border-t border-navy-700 pt-2 mt-2">
                    <span className="text-slate-300">Total</span>
                    <span className="text-red-400">{fmtFull(m.expense)}</span>
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="bg-navy-900 rounded-lg p-4">
                <div className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-3">Summary</div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Income</span>
                    <span className="text-emerald-400">{fmtFull(m.income)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Expenses</span>
                    <span className="text-red-400">-{fmtFull(m.expense)}</span>
                  </div>
                  {cfs > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">{proj ? 'Proj. CFS' : 'Cash Flow Support'}</span>
                      <span className="text-blue-400">+{fmtFull(cfs)}</span>
                    </div>
                  )}
                  <div className={`flex justify-between text-sm font-bold border-t border-navy-700 pt-2 mt-2 ${m.net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    <span>Net</span>
                    <span>{m.net >= 0 ? '+' : ''}{fmtFull(m.net)}</span>
                  </div>
                  {sc?.endBalance != null && (
                    <div className="flex justify-between text-xs border-t border-navy-700 pt-2 mt-1">
                      <span className="text-slate-500">Proj. end balance</span>
                      <span className={sc.endBalance >= MIN_BALANCE ? 'text-emerald-400' : 'text-red-400'}>{fmtFull(sc.endBalance)}</span>
                    </div>
                  )}
                  {sc?.supportNeeded > 0 && (
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-blue-400">Support needed</span>
                      <span className="text-blue-400">{fmtFull(sc.supportNeeded)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
