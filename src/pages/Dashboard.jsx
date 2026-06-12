import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, DollarSign, CalendarDays, ArrowUpRight, Percent } from 'lucide-react';
import { useTransactions } from '../hooks/useTransactions';
import { useReservations } from '../hooks/useReservations';
import { usePropertyTaxes } from '../hooks/usePropertyTaxes';
import { useAppSetting } from '../hooks/useAppSetting';
import { txInMonth, amountForMonth } from '../utils/transactions';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function StatCard({ icon: Icon, label, value, sub, color = 'emerald' }) {
  const colors = {
    emerald: 'text-emerald-400 bg-emerald-400/10',
    blue:    'text-blue-400 bg-blue-400/10',
    red:     'text-red-400 bg-red-400/10',
    yellow:  'text-yellow-400 bg-yellow-400/10',
    purple:  'text-purple-400 bg-purple-400/10',
    teal:    'text-teal-400 bg-teal-400/10',
  };
  return (
    <div className="bg-navy-800 rounded-xl p-5 border border-navy-700">
      <div className="flex items-center justify-between mb-3">
        <span className="text-slate-400 text-sm">{label}</span>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colors[color]}`}>
          <Icon size={18} />
        </div>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-slate-400 text-xs mt-1">{sub}</div>}
    </div>
  );
}

function reservationStatus(r, today) {
  if (r.status === 'Cancelled') return 'Cancelled';
  if (r.checkOut < today) return 'Complete';
  if (r.checkIn <= today && r.checkOut >= today) return 'Active';
  return 'Upcoming';
}

export default function Dashboard() {
  const { transactions }  = useTransactions();
  const { reservations }  = useReservations();
  const { propertyTaxes } = usePropertyTaxes();
  const [rentcastData]    = useAppSetting('rentcast', {});

  const today = new Date().toISOString().slice(0, 10);
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentMonthIdx = new Date().getMonth();

  const fmt = (n) => '$' + Math.abs(Number(n)).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const fmtFull = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtAxis = (n) => {
    if (n === 0) return '$0';
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `$${Math.round(n / 1_000)}k`;
    return `$${Math.round(n)}`;
  };

  const [statsView, setStatsView] = useState('month');

  const stats = useMemo(() => {
    const yearPrefix = `${currentYear}-`;

    // ── Month ──────────────────────────────────────────────────────────────
    const monthTx        = transactions.filter(tx => !tx.excluded && txInMonth(tx, currentMonth));
    const monthIncome    = monthTx.filter(t => t.type === 'Income'  && t.category !== 'Cash Flow Support').reduce((s, t) => s + Number(t.amount), 0);
    const monthExpenses  = monthTx.filter(t => t.type === 'Expense' && t.category !== 'Cash Flow Support').reduce((s, t) => s + Number(t.amount), 0);
    const monthCFS       = monthTx.filter(t => t.category === 'Cash Flow Support').reduce((s, t) => s + Number(t.amount), 0);

    const daysInMonth = new Date(currentYear, currentMonthIdx + 1, 0).getDate();
    let monthOccupiedNights = 0;
    for (const r of reservations) {
      if (r.status === 'Cancelled') continue;
      const cin  = r.checkIn  > currentMonth + '-01' ? r.checkIn  : currentMonth + '-01';
      const cout = r.checkOut < currentMonth + '-' + String(daysInMonth).padStart(2,'0') ? r.checkOut : currentMonth + '-' + String(daysInMonth).padStart(2,'0');
      if (cin <= cout) monthOccupiedNights += Math.max((new Date(cout) - new Date(cin)) / 86400000, 0);
    }
    const monthRes     = reservations.filter(r => r.status !== 'Cancelled' && !r.isOwnerHold && r.checkIn?.startsWith(currentMonth));
    const monthNights  = monthRes.reduce((s, r) => s + (Number(r.nights) || 0), 0);
    const monthAdr     = monthNights > 0 ? monthRes.reduce((s, r) => s + (Number(r.netRent) || 0), 0) / monthNights : 0;

    // ── YTD ────────────────────────────────────────────────────────────────
    const ytdTx       = transactions.filter(tx => !tx.excluded && tx.date?.startsWith(yearPrefix));
    const ytdIncome   = ytdTx.filter(t => t.type === 'Income'  && t.category !== 'Cash Flow Support').reduce((s, t) => s + Number(t.amount), 0);
    const ytdExpenses = ytdTx.filter(t => t.type === 'Expense' && t.category !== 'Cash Flow Support').reduce((s, t) => s + Number(t.amount), 0);
    const ytdCFS      = ytdTx.filter(t => t.category === 'Cash Flow Support').reduce((s, t) => s + Number(t.amount), 0);

    const dayOfYear   = Math.floor((new Date(today) - new Date(`${currentYear}-01-01`)) / 86400000) + 1;
    let ytdOccupiedNights = 0;
    const ytdStart = `${currentYear}-01-01`, ytdEnd = today;
    for (const r of reservations) {
      if (r.status === 'Cancelled') continue;
      const cin  = r.checkIn  > ytdStart ? r.checkIn  : ytdStart;
      const cout = r.checkOut < ytdEnd   ? r.checkOut : ytdEnd;
      if (cin <= cout) ytdOccupiedNights += Math.max((new Date(cout) - new Date(cin)) / 86400000, 0);
    }
    const ytdRes    = reservations.filter(r => r.status !== 'Cancelled' && !r.isOwnerHold && r.checkIn?.startsWith(yearPrefix));
    const ytdNights = ytdRes.reduce((s, r) => s + (Number(r.nights) || 0), 0);
    const ytdAdr    = ytdNights > 0 ? ytdRes.reduce((s, r) => s + (Number(r.netRent) || 0), 0) / ytdNights : 0;

    // ── Shared ─────────────────────────────────────────────────────────────
    const taxPaid = new Map();
    transactions.filter(tx => tx.category === 'Property Tax' && tx.taxYear && !tx.excluded)
      .forEach(tx => {
        const key = `${tx.taxYear}|${tx.taxType || ''}`;
        taxPaid.set(key, (taxPaid.get(key) || 0) + Number(tx.amount));
      });
    const unpaidTaxes = propertyTaxes
      .filter(t => t.dueDate && t.dueDate < today && t.annualAmount > 0)
      .reduce((s, t) => {
        const key = `${t.taxYear}|${t.taxType || ''}`;
        return s + Math.max(Number(t.annualAmount) - (taxPaid.get(key) || 0), 0);
      }, 0);

    return {
      month: { income: monthIncome, expenses: monthExpenses, netCashflow: monthIncome - monthExpenses, cashFlowSupport: monthCFS, occupancyRate: daysInMonth > 0 ? Math.min(monthOccupiedNights / daysInMonth * 100, 100) : 0, adr: monthAdr, occupiedNights: monthOccupiedNights },
      ytd:   { income: ytdIncome,   expenses: ytdExpenses,   netCashflow: ytdIncome - ytdExpenses,     cashFlowSupport: ytdCFS,   occupancyRate: dayOfYear   > 0 ? Math.min(ytdOccupiedNights   / dayOfYear   * 100, 100) : 0, adr: ytdAdr,   occupiedNights: ytdOccupiedNights },
      unpaidTaxes,
    };
  }, [transactions, reservations, propertyTaxes, currentMonth, currentMonthIdx, currentYear, today]);

  const s = stats[statsView];

  const monthlyData = useMemo(() => MONTHS.map((label, mi) => {
    const month = `${currentYear}-${String(mi + 1).padStart(2, '0')}`;
    const txs = transactions.filter(t => !t.excluded && txInMonth(t, month));
    const income   = txs.filter(t => t.type === 'Income'  && t.category !== 'Cash Flow Support').reduce((s, t) => s + amountForMonth(t, month), 0);
    const expenses = txs.filter(t => t.type === 'Expense' && t.category !== 'Cash Flow Support').reduce((s, t) => s + amountForMonth(t, month), 0);
    const net = income - expenses;
    const isFuture = mi > currentMonthIdx;
    return { label, income, expenses, net, isFuture };
  }), [transactions, currentYear, currentMonthIdx]);

  const maxVal = Math.max(...monthlyData.map(m => Math.max(m.income, m.expenses)), 1);

  const recentTransactions = useMemo(() =>
    [...transactions].filter(tx => !tx.excluded).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6),
    [transactions]
  );

  const upcomingReservations = useMemo(() =>
    reservations
      .filter(r => r.status !== 'Cancelled' && r.checkOut >= today)
      .sort((a, b) => a.checkIn.localeCompare(b.checkIn))
      .slice(0, 5),
    [reservations, today]
  );

  const statusColor = (r) => {
    const s = reservationStatus(r, today);
    if (s === 'Active')   return 'bg-emerald-400/10 text-emerald-400';
    if (s === 'Upcoming') return 'bg-blue-400/10 text-blue-400';
    if (s === 'Complete') return 'bg-slate-400/10 text-slate-400';
    return 'bg-red-400/10 text-red-400';
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">Warrior Beach House · {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="flex gap-1 p-1 bg-navy-800 border border-navy-700 rounded-lg self-start sm:self-auto">
          <button onClick={() => setStatsView('month')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${statsView === 'month' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white'}`}>Current Month</button>
          <button onClick={() => setStatsView('ytd')}   className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${statsView === 'ytd'   ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white'}`}>Year to Date</button>
        </div>
      </div>

      <div className={`grid gap-4 mb-4 grid-cols-1 sm:grid-cols-2 ${s.cashFlowSupport > 0 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
        <StatCard icon={TrendingUp}   label="Income"       value={fmtFull(s.income)}      sub={statsView === 'month' ? 'This month' : `Jan–${new Date().toLocaleDateString('en-US',{month:'short'})}`} color="emerald" />
        <StatCard icon={TrendingDown} label="Expenses"     value={fmtFull(s.expenses)}    sub={statsView === 'month' ? 'This month' : 'Year to date'} color="red" />
        <StatCard icon={DollarSign}   label="Net Cashflow" value={fmtFull(s.netCashflow)} sub={statsView === 'month' ? 'This month' : 'Year to date'} color={s.netCashflow >= 0 ? 'emerald' : 'red'} />
        {s.cashFlowSupport > 0 && (
          <StatCard icon={DollarSign} label="Cash Flow Support" value={fmtFull(s.cashFlowSupport)} sub="Owner contributions" color="yellow" />
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <StatCard icon={Percent}    label="Occupancy Rate" value={`${s.occupancyRate.toFixed(0)}%`} sub={statsView === 'month' ? `${Math.round(s.occupiedNights)} nights this month` : `${Math.round(s.occupiedNights)} nights YTD`} color="teal" />
        <StatCard icon={DollarSign} label="Avg Daily Rate" value={s.adr > 0 ? fmtFull(s.adr) : '—'} sub={statsView === 'month' ? 'Net rent ÷ nights this month' : 'Net rent ÷ nights YTD'} color="blue" />
        <StatCard icon={DollarSign} label="Unpaid Taxes"   value={fmtFull(stats.unpaidTaxes)} sub="Outstanding" color="yellow" />
      </div>

      <div className="bg-navy-800 rounded-xl border border-navy-700 p-4 sm:p-6 mb-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-white">{currentYear} Income vs Expenses</h2>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-500/80 inline-block" /> Income</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-500/80 inline-block" /> Expenses</span>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto">
          <div className="flex flex-col justify-between text-right text-xs text-slate-500 w-10 flex-shrink-0" style={{ height: 210, paddingBottom: 34 }}>
            {[1, 0.75, 0.5, 0.25, 0].map(pct => <span key={pct}>{fmtAxis(maxVal * pct)}</span>)}
          </div>
          <div className="flex-1 grid grid-cols-12 gap-1.5 min-w-[640px]">
            {monthlyData.map((m, i) => {
              const iH = maxVal > 0 ? (m.income / maxVal) * 100 : 0;
              const eH = maxVal > 0 ? (m.expenses / maxVal) * 100 : 0;
              const isCurrentMonth = i === currentMonthIdx;
              return (
                <div key={i} className={`${m.isFuture ? 'opacity-30' : ''} ${isCurrentMonth ? 'ring-1 ring-slate-500/40 rounded-lg' : ''} group relative`}>
                  <div className="flex gap-0.5 h-44">
                    <div className="flex-1 flex flex-col justify-end"><div className="bg-emerald-500/80 rounded-t transition-all" style={{ height: `${iH}%` }} /></div>
                    <div className="flex-1 flex flex-col justify-end"><div className="bg-red-500/80 rounded-t transition-all" style={{ height: `${eH}%` }} /></div>
                  </div>
                  <div className="text-xs text-center text-slate-500 mt-1">{m.label}</div>
                  {(m.income > 0 || m.expenses > 0) && (
                    <div className={`text-xs text-center font-medium mt-0.5 ${m.net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {m.net >= 0 ? '+' : '-'}{fmt(m.net)}
                    </div>
                  )}
                  {!m.isFuture && (m.income > 0 || m.expenses > 0) && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10 w-36 bg-navy-900 border border-navy-600 rounded-lg p-2 text-xs shadow-lg">
                      <div className="text-slate-300 font-medium mb-1">{m.label} {currentYear}</div>
                      <div className="flex justify-between text-emerald-400"><span>Income</span><span>{fmt(m.income)}</span></div>
                      <div className="flex justify-between text-red-400"><span>Expenses</span><span>{fmt(m.expenses)}</span></div>
                      <div className={`flex justify-between font-semibold border-t border-navy-700 mt-1 pt-1 ${m.net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        <span>Net</span><span>{m.net >= 0 ? '+' : '-'}{fmt(m.net)}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-navy-800 rounded-xl border border-navy-700">
          <div className="flex items-center justify-between px-5 py-4 border-b border-navy-700">
            <h2 className="font-semibold text-white">Recent Transactions</h2>
            <Link to="/transactions" className="text-emerald-400 text-xs flex items-center gap-1 hover:text-emerald-300">View all <ArrowUpRight size={12} /></Link>
          </div>
          <div className="divide-y divide-navy-700">
            {recentTransactions.map(tx => (
              <div key={tx.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <div className="text-sm text-white">{tx.description}</div>
                  <div className="text-xs text-slate-500">{tx.date} · {tx.category}</div>
                </div>
                <span className={`text-sm font-semibold ${tx.type === 'Income' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {tx.type === 'Income' ? '+' : '-'}{fmtFull(tx.amount)}
                </span>
              </div>
            ))}
            {recentTransactions.length === 0 && <div className="px-5 py-8 text-center text-slate-500 text-sm">No transactions yet</div>}
          </div>
        </div>

        <div className="bg-navy-800 rounded-xl border border-navy-700">
          <div className="flex items-center justify-between px-5 py-4 border-b border-navy-700">
            <h2 className="font-semibold text-white">Upcoming Reservations</h2>
            <Link to="/reservations" className="text-emerald-400 text-xs flex items-center gap-1 hover:text-emerald-300">View all <ArrowUpRight size={12} /></Link>
          </div>
          <div className="divide-y divide-navy-700">
            {upcomingReservations.map(r => (
              <div key={r.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <div className="text-sm text-white">{r.guestName}</div>
                  <div className="text-xs text-slate-500">{r.checkIn} – {r.checkOut} · {r.nights} nights</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-emerald-400">{fmtFull(r.netRent || 0)}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(r)}`}>{reservationStatus(r, today)}</span>
                </div>
              </div>
            ))}
            {upcomingReservations.length === 0 && (
              <div className="px-5 py-8 text-center">
                <CalendarDays size={28} className="mx-auto mb-2 text-slate-600" />
                <div className="text-slate-500 text-sm">No upcoming reservations</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
