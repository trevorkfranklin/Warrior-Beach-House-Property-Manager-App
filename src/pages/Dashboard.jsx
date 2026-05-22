import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, DollarSign, CalendarDays, ArrowUpRight, Percent } from 'lucide-react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { sampleTransactions, sampleReservations, samplePropertyTaxes } from '../data/sampleData';
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
  const [transactions]  = useLocalStorage('wbh_transactions', sampleTransactions);
  const [reservations]  = useLocalStorage('wbh_reservations', sampleReservations);
  const [propertyTaxes] = useLocalStorage('wbh_property_taxes', samplePropertyTaxes);
  const [rentcastData]  = useLocalStorage('wbh_rentcast', {});

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

  const stats = useMemo(() => {
    const thisMonthTx = transactions.filter(tx => !tx.excluded && txInMonth(tx, currentMonth));
    const income    = thisMonthTx.filter(t => t.type === 'Income').reduce((s, t) => s + Number(t.amount), 0);
    const expenses  = thisMonthTx.filter(t => t.type === 'Expense' && t.category !== 'Owner Draw').reduce((s, t) => s + Number(t.amount), 0);
    const ownerDraw = thisMonthTx.filter(t => t.type === 'Expense' && t.category === 'Owner Draw').reduce((s, t) => s + Number(t.amount), 0);

    // Occupancy for current month
    const daysInMonth = new Date(currentYear, currentMonthIdx + 1, 0).getDate();
    let occupiedNights = 0;
    for (const r of reservations) {
      if (r.status === 'Cancelled') continue;
      const cin  = r.checkIn  > currentMonth + '-01' ? r.checkIn  : currentMonth + '-01';
      const cout = r.checkOut < currentMonth + '-' + String(daysInMonth).padStart(2,'0') ? r.checkOut : currentMonth + '-' + String(daysInMonth).padStart(2,'0');
      if (cin <= cout) {
        const diff = (new Date(cout) - new Date(cin)) / 86400000;
        occupiedNights += Math.max(diff, 0);
      }
    }
    const occupancyRate = daysInMonth > 0 ? Math.min(occupiedNights / daysInMonth * 100, 100) : 0;

    // ADR - this month's rental income / nights this month
    const rentalIncome = thisMonthTx.filter(t => t.category === 'Rental Income').reduce((s, t) => s + Number(t.amount), 0);
    const adr = occupiedNights > 0 ? rentalIncome / occupiedNights : 0;

    // Unpaid taxes
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

    return { income, expenses, ownerDraw, netCashflow: income - expenses, occupancyRate, adr, unpaidTaxes, occupiedNights };
  }, [transactions, reservations, propertyTaxes, currentMonth, currentMonthIdx, currentYear, today]);

  const monthlyData = useMemo(() => MONTHS.map((label, mi) => {
    const month = `${currentYear}-${String(mi + 1).padStart(2, '0')}`;
    const txs = transactions.filter(t => !t.excluded && txInMonth(t, month));
    const income   = txs.filter(t => t.type === 'Income').reduce((s, t) => s + amountForMonth(t, month), 0);
    const expenses = txs.filter(t => t.type === 'Expense' && t.category !== 'Owner Draw').reduce((s, t) => s + amountForMonth(t, month), 0);
    const ownerDraw = txs.filter(t => t.type === 'Expense' && t.category === 'Owner Draw').reduce((s, t) => s + amountForMonth(t, month), 0);
    const net = income - expenses;
    const isFuture = mi > currentMonthIdx;
    return { label, income, expenses, ownerDraw, net, isFuture };
  }), [transactions, currentYear, currentMonthIdx]);

  const maxVal = Math.max(...monthlyData.map(m => Math.max(m.income, m.expenses + m.ownerDraw)), 1);

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

  const platformColor = (p) => ({
    Airbnb: 'text-red-400', VRBO: 'text-blue-400', Direct: 'text-emerald-400', Other: 'text-slate-400',
  }[p] || 'text-slate-400');

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-400 text-sm mt-1">Warrior Beach House · {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
      </div>

      {/* Finance KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard icon={TrendingUp}   label="Monthly Income"   value={fmtFull(stats.income)}      sub="This month"       color="emerald" />
        <StatCard icon={TrendingDown} label="Monthly Expenses" value={fmtFull(stats.expenses)}    sub="Excl. owner draw" color="red" />
        <StatCard icon={DollarSign}   label="Owner Draw"       value={fmtFull(stats.ownerDraw)}   sub="This month"       color="purple" />
        <StatCard icon={DollarSign}   label="Net Cashflow"     value={fmtFull(stats.netCashflow)} sub="This month"       color={stats.netCashflow >= 0 ? 'emerald' : 'red'} />
      </div>

      {/* STR KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard icon={Percent}     label="Occupancy Rate" value={`${stats.occupancyRate.toFixed(0)}%`} sub={`${Math.round(stats.occupiedNights)} nights booked this month`} color="teal" />
        <StatCard icon={DollarSign}  label="Avg Daily Rate"  value={stats.adr > 0 ? fmtFull(stats.adr) : '—'} sub="Rental income ÷ occupied nights" color="blue" />
        <StatCard icon={DollarSign}  label="Unpaid Taxes"    value={fmtFull(stats.unpaidTaxes)} sub="Outstanding" color="yellow" />
      </div>

      {/* Income vs Expenses chart */}
      <div className="bg-navy-800 rounded-xl border border-navy-700 p-6 mb-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-white">{currentYear} Income vs Expenses</h2>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-500/80 inline-block" /> Income</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-500/80 inline-block" /> Expenses</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-purple-500/80 inline-block" /> Owner Draw</span>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="flex flex-col justify-between text-right text-xs text-slate-500 w-10 flex-shrink-0" style={{ height: 210, paddingBottom: 34 }}>
            {[1, 0.75, 0.5, 0.25, 0].map(pct => <span key={pct}>{fmtAxis(maxVal * pct)}</span>)}
          </div>
          <div className="flex-1 grid grid-cols-12 gap-1.5">
            {monthlyData.map((m, i) => {
              const iH = maxVal > 0 ? (m.income / maxVal) * 100 : 0;
              const eH = maxVal > 0 ? (m.expenses / maxVal) * 100 : 0;
              const oH = maxVal > 0 ? (m.ownerDraw / maxVal) * 100 : 0;
              const isCurrentMonth = i === currentMonthIdx;
              return (
                <div key={i} className={`${m.isFuture ? 'opacity-30' : ''} ${isCurrentMonth ? 'ring-1 ring-slate-500/40 rounded-lg' : ''} group relative`}>
                  <div className="flex gap-0.5 h-44">
                    <div className="flex-1 flex flex-col justify-end"><div className="bg-emerald-500/80 rounded-t transition-all" style={{ height: `${iH}%` }} /></div>
                    <div className="flex-1 flex flex-col justify-end"><div className="bg-red-500/80 rounded-t transition-all" style={{ height: `${eH}%` }} /></div>
                    <div className="flex-1 flex flex-col justify-end"><div className="bg-purple-500/80 rounded-t transition-all" style={{ height: `${oH}%` }} /></div>
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
                      {m.ownerDraw > 0 && <div className="flex justify-between text-purple-400"><span>Owner Draw</span><span>{fmt(m.ownerDraw)}</span></div>}
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
        {/* Recent Transactions */}
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

        {/* Upcoming Reservations */}
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
                  <div className={`text-xs mt-0.5 ${platformColor(r.platform)}`}>{r.platform}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-emerald-400">{fmtFull(r.totalRevenue)}</span>
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
