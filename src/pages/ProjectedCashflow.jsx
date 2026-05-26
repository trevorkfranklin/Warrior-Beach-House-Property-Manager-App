import { useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { sampleTransactions, samplePropertyTaxes, sampleHOADues, sampleReservations } from '../data/sampleData';
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
  const [transactions] = useLocalStorage('wbh_transactions', sampleTransactions);
  const [taxRecords]   = useLocalStorage('wbh_property_taxes', samplePropertyTaxes);
  const [hoaRecords]   = useLocalStorage('wbh_hoa_dues', sampleHOADues);
  const [reservations] = useLocalStorage('wbh_reservations', sampleReservations);
  const [sfAccounts]   = useLocalStorage('wbh_simplefin_accounts', {});
  const [projStartBal]       = useLocalStorage('wbh_cashflow_proj_start', 0);
  const [startBals]          = useLocalStorage('wbh_cashflow_start_bals', {});
  const [endBals]            = useLocalStorage('wbh_cashflow_end_bals', {});
  const [cashflowBudgets]    = useLocalStorage('wbh_cashflow_budgets', DEFAULT_CASHFLOW_BUDGETS);
  const [cashflowExtra]      = useLocalStorage('wbh_cashflow_extra', []);
  const [cashflowMonthly]    = useLocalStorage('wbh_cashflow_monthly', {});
  const [cashflowMonthItems] = useLocalStorage('wbh_cashflow_month_items', {});
  const [viewMode, setViewMode] = useState('year');

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

  // Projected income: net rent from checkIn month M is paid out in month M+1, minus protection deduction
  const incomeByPayMonth = useMemo(() => {
    const map = {};
    for (const r of reservations) {
      if (r.status === 'Cancelled' || !r.checkIn) continue;
      const [yr, mo] = r.checkIn.slice(0, 7).split('-').map(Number);
      const payYr = mo === 12 ? yr + 1 : yr;
      const payMo = mo === 12 ? 1 : mo + 1;
      const pay = `${payYr}-${String(payMo).padStart(2, '0')}`;
      const protection = r.isOwnerHold ? 0 : Number(r.nights || 0) * PROTECTION_PER_NIGHT;
      map[pay] = (map[pay] || 0) + Number(r.netRent || 0) - protection;
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

    let projExpense;
    if (isPast || isCurrent) {
      projExpense = actualExpense;
    } else {
      const fixedTotal = EXPENSE_KEYS.reduce((s, key) => s + (cashflowMonthly[month]?.[key] ?? cashflowBudgets[key] ?? 0), 0);
      const extraTotal = cashflowExtra.reduce((s, e) => s + (cashflowMonthly[month]?.[e.id] ?? Number(e.amount || 0)), 0);
      const otherTotal = (cashflowMonthItems[month] || []).reduce((s, i) => s + Number(i.amount || 0), 0);
      projExpense = fixedTotal + extraTotal + otherTotal;
    }

    const cashFlowSupport = (isPast || isCurrent)
      ? txs.filter(t => t.category === 'Cash Flow Support').reduce((s, t) => s + amountForMonth(t, month), 0)
      : 0;

    const income  = isPast || isCurrent ? actualIncome : (incomeByPayMonth[month] || 0);
    const expense = projExpense + (isPast ? 0 : taxDue);
    return { label, month, income, expense, cashFlowSupport, taxDue: isPast ? 0 : taxDue, net: income - expense, projected: !isPast && !isCurrent, isCurrent };
  }), [chartSlots, transactions, incomeByPayMonth, taxByMonth, hoaByMonth, cashflowBudgets, cashflowExtra, cashflowMonthly, cashflowMonthItems]);

  const totalIncome  = monthData.reduce((s, m) => s + m.income, 0);
  const totalExpense = monthData.reduce((s, m) => s + m.expense, 0);
  const totalNet     = monthData.reduce((s, m) => s + m.net, 0);

  const MIN_BALANCE = 1000;
  const currentEndBal = endBals[currentMonthStr] != null ? Number(endBals[currentMonthStr]) : MIN_BALANCE;

  // For each projected month: how much cash must be injected to keep balance >= $1,000
  const supportCalc = useMemo(() => {
    const items = [];
    let balance = null;
    for (let i = 0; i < monthData.length; i++) {
      const m = monthData[i];
      if (balance === null) {
        if (m.isCurrent || viewMode === 'forward') {
          balance = currentEndBal;
          items.push({ supportNeeded: 0, endBalance: currentEndBal });
        } else {
          items.push({ supportNeeded: null, endBalance: null });
        }
      } else {
        const natural       = balance + m.net + m.cashFlowSupport;
        const supportNeeded = m.projected ? Math.max(0, MIN_BALANCE - natural) : 0;
        balance = supportNeeded > 0 ? MIN_BALANCE : natural;
        items.push({ supportNeeded, endBalance: balance });
      }
    }
    return items;
  }, [currentEndBal, monthData, viewMode]);

  const totalSupportNeeded = supportCalc.reduce((s, m) => s + (m.supportNeeded || 0), 0);

  // CFS to display on each income bar: actual for past/current, projected support needed for future
  const cfsForBar = monthData.map((m, i) =>
    m.projected ? (supportCalc[i]?.supportNeeded || 0) : m.cashFlowSupport
  );

  const maxVal = Math.max(...monthData.map((m, i) => Math.max(m.income + cfsForBar[i], m.expense)), 1);

  const CHART_H = 320;

  const ytdInc = monthlyActuals.reduce((s, m) => s + m.income, 0);
  const ytdExp = monthlyActuals.reduce((s, m) => s + m.expense, 0);
  const period = viewMode === 'year' ? `${currentYear}` : 'Next 12 months';

  return (
    <div className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Projected Cashflow</h1>
          <p className="text-slate-400 text-sm mt-1">{viewMode === 'year' ? `${currentYear} — Actuals + forward projections` : '12 months forward from today'}</p>
        </div>
        <div className="flex gap-1 p-1 bg-navy-800 border border-navy-700 rounded-lg">
          <button onClick={() => setViewMode('year')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'year' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white'}`}>Current Year</button>
          <button onClick={() => setViewMode('forward')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'forward' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white'}`}>12 Months Forward</button>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-4">
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

        <div className="flex gap-3">
          <div className="flex flex-col justify-between text-right text-xs text-slate-500 w-10 flex-shrink-0" style={{ height: 358, paddingBottom: 38 }}>
            {[1, 0.75, 0.5, 0.25, 0].map(pct => <span key={pct}>{fmtAxis(maxVal * pct)}</span>)}
          </div>
          <div className="flex-1 relative">
            <div className="grid grid-cols-12 gap-3">
              {monthData.map((m, i) => (
                <div key={i} className={`relative group ${m.isCurrent ? 'ring-1 ring-slate-500/40 rounded-lg' : ''}`}>
                  <div className={m.projected ? 'opacity-40' : ''}>
                    <Bar income={m.income} expense={m.expense} taxDue={m.taxDue ?? 0} cfs={cfsForBar[i]} maxVal={maxVal} height={CHART_H} />
                    <div className="text-xs text-center text-slate-500 mt-2">{m.label}</div>
                    <div className={`text-xs text-center font-semibold mt-0.5 ${m.net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{m.net >= 0 ? '+' : ''}{fmt(m.net)}</div>
                  </div>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-20 w-44 bg-navy-900 border border-navy-600 rounded-lg p-2.5 text-xs shadow-lg pointer-events-none">
                    <div className="text-slate-300 font-medium mb-1.5">{m.label}{m.projected ? ' (proj.)' : ''}</div>
                    <div className="flex justify-between text-emerald-400 mb-0.5"><span>Income</span><span>{fmt(m.income)}</span></div>
                    <div className="flex justify-between text-red-400 mb-0.5"><span>Expenses</span><span>{fmt(m.expense)}</span></div>
                    {m.taxDue > 0 && <div className="flex justify-between text-yellow-400 mb-0.5"><span>Taxes/HOA</span><span>{fmt(m.taxDue)}</span></div>}
                    {cfsForBar[i] > 0 && <div className="flex justify-between text-blue-400 mb-0.5"><span>{m.projected ? 'Proj. support' : 'CFS'}</span><span>{fmt(cfsForBar[i])}</span></div>}
                    <div className={`flex justify-between font-semibold border-t border-navy-700 mt-1 pt-1 ${m.net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}><span>Net</span><span>{m.net >= 0 ? '+' : ''}{fmt(m.net)}</span></div>
                    {supportCalc?.[i]?.supportNeeded > 0 && (
                      <div className="flex justify-between text-blue-400 font-semibold border-t border-navy-700 mt-1 pt-1"><span>Support needed</span><span>{fmt(supportCalc[i].supportNeeded)}</span></div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Monthly support breakdown */}
      {totalSupportNeeded > 0 && (
        <div className="bg-navy-800 border border-yellow-500/30 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-1">Cash Flow Support Required — Month by Month</h3>
          <p className="text-xs text-slate-500 mb-4">Amount needed each month to keep the WF checking balance at or above ${MIN_BALANCE.toLocaleString()}</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {chartSlots.map((slot, i) => {
              const s = supportCalc[i];
              if (!s || s.supportNeeded === null || s.supportNeeded === 0) return null;
              return (
                <div key={slot.month} className="bg-navy-900 border border-yellow-500/20 rounded-lg p-3">
                  <div className="text-xs text-slate-400 mb-1">{slot.label}</div>
                  <div className="text-lg font-bold text-yellow-400">{fmt(s.supportNeeded)}</div>
                  <div className="text-xs text-slate-500 mt-0.5">Proj. end bal: {fmtAxis(s.endBalance)}</div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-3 border-t border-navy-700 flex items-center justify-between">
            <span className="text-sm text-slate-400">Total support needed ({period})</span>
            <span className="text-lg font-bold text-yellow-400">{fmt(totalSupportNeeded)}</span>
          </div>
        </div>
      )}

      {totalSupportNeeded === 0 && (
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 text-sm text-emerald-400">
          No cash flow support needed — projected balance stays above ${MIN_BALANCE.toLocaleString()} throughout {period}.
        </div>
      )}
    </div>
  );
}
