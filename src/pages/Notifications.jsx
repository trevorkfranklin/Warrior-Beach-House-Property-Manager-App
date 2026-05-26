import { useMemo } from 'react';
import { Bell, AlertTriangle, Info, CheckCircle, Send, X } from 'lucide-react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { sampleReservations, samplePropertyTaxes, sampleHOADues, sampleOwners } from '../data/sampleData';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const PROTECTION_PER_NIGHT = 8.54;
const OWNER_CLEANING_FEE = 122;
const MIN_BALANCE = 1000;

function buildNotifications(reservations, propertyTaxes, hoaDues, transactions) {
  const today = new Date().toISOString().slice(0, 10);
  const in7  = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const notes = [];

  // Upcoming check-ins (next 7 days)
  for (const r of reservations) {
    if (r.status === 'Cancelled') continue;
    if (r.checkIn >= today && r.checkIn <= in7) {
      notes.push({
        id: `checkin-${r.id}`,
        type: 'info',
        title: `Check-in: ${r.guestName}`,
        body: `${r.checkIn} – ${r.checkOut} · ${r.nights} nights`,
      });
    }
  }

  // Check-outs today
  for (const r of reservations) {
    if (r.status === 'Cancelled') continue;
    if (r.checkOut === today) {
      notes.push({
        id: `checkout-${r.id}`,
        type: 'info',
        title: `Check-out today: ${r.guestName}`,
        body: `${r.checkOut} — remember cleaning and inspection`,
      });
    }
  }

  // Overdue property taxes
  const taxPaid = new Map();
  transactions
    .filter(tx => tx.category === 'Property Tax' && tx.taxYear && !tx.excluded)
    .forEach(tx => {
      const key = `${tx.taxYear}|${tx.taxType || ''}`;
      taxPaid.set(key, (taxPaid.get(key) || 0) + Number(tx.amount));
    });

  for (const t of propertyTaxes) {
    if (!t.dueDate || !t.annualAmount) continue;
    const key = `${t.taxYear}|${t.taxType || ''}`;
    const paid = taxPaid.get(key) || 0;
    const balance = Math.max(Number(t.annualAmount) - paid, 0);
    if (balance > 0 && t.dueDate < today) {
      notes.push({
        id: `tax-${t.id}`,
        type: 'warning',
        title: `Overdue property tax`,
        body: `${t.taxYear}${t.taxType ? ` ${t.taxType}` : ''} — $${balance.toLocaleString()} outstanding`,
      });
    } else if (balance > 0 && t.dueDate <= in30) {
      notes.push({
        id: `tax-upcoming-${t.id}`,
        type: 'info',
        title: `Property tax due soon`,
        body: `${t.taxYear}${t.taxType ? ` ${t.taxType}` : ''} — $${balance.toLocaleString()} due ${t.dueDate}`,
      });
    }
  }

  // Overdue HOA dues
  const hoaPaid = new Map();
  transactions
    .filter(tx => tx.category === 'HOA Fees' && !tx.excluded)
    .forEach(tx => {
      const year = tx.taxYear || new Date(tx.date).getFullYear();
      const key = String(year);
      hoaPaid.set(key, (hoaPaid.get(key) || 0) + Number(tx.amount));
    });

  for (const h of hoaDues) {
    if (!h.dueDate || !h.annualAmount) continue;
    const paid = hoaPaid.get(String(h.year)) || 0;
    const balance = Math.max(Number(h.annualAmount) - paid, 0);
    if (balance > 0 && h.dueDate < today) {
      notes.push({
        id: `hoa-${h.id}`,
        type: 'warning',
        title: `Overdue HOA dues`,
        body: `${h.year} — $${balance.toLocaleString()} outstanding`,
      });
    }
  }

  return notes;
}

function computeNextMonthProjection({
  transactions, reservations, owners, budgets, extraExpenses,
  monthly, monthItems, hoaDues, endBals,
}) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthIdx = now.getMonth();
  const currentMonthStr = `${currentYear}-${String(currentMonthIdx + 1).padStart(2, '0')}`;

  const nextMonthDate = new Date(currentYear, currentMonthIdx + 1, 1);
  const nextYear = nextMonthDate.getFullYear();
  const nextMonthIdx = nextMonthDate.getMonth();
  const nextMonthStr = `${nextYear}-${String(nextMonthIdx + 1).padStart(2, '0')}`;

  const startBalance = endBals[currentMonthStr] != null ? Number(endBals[currentMonthStr]) : MIN_BALANCE;

  // Income: reservations with checkIn in current month are counted as income next month
  let income = 0;
  for (const r of reservations) {
    if (r.status === 'Cancelled' || !r.checkIn) continue;
    const [yr, mo] = r.checkIn.slice(0, 7).split('-').map(Number);
    const payYr = mo === 12 ? yr + 1 : yr;
    const payMo = mo === 12 ? 1 : mo + 1;
    if (`${payYr}-${String(payMo).padStart(2, '0')}` !== nextMonthStr) continue;
    const protection = r.isOwnerHold ? 0 : Number(r.nights || 0) * PROTECTION_PER_NIGHT;
    income += Number(r.netRent || 0) - protection;
  }

  // Fixed expenses from monthly overrides or budget defaults
  const EXPENSE_KEYS = ['mortgage', 'cableInternet', 'electricity', 'waterTrash', 'windstormInsurance'];
  let fixedTotal = 0;
  for (const key of EXPENSE_KEYS) {
    fixedTotal += Number(monthly[nextMonthStr]?.[key] ?? budgets[key] ?? 0);
  }

  let extraTotal = 0;
  for (const e of extraExpenses) {
    extraTotal += Number(monthly[nextMonthStr]?.[e.id] ?? e.amount ?? 0);
  }

  const otherTotal = (monthItems[nextMonthStr] || []).reduce((s, i) => s + Number(i.amount || 0), 0);

  // HOA dues
  const hoaPaid = new Map();
  transactions.filter(tx => tx.category === 'HOA Fees' && !tx.excluded).forEach(tx => {
    const year = tx.taxYear || new Date(tx.date).getFullYear();
    hoaPaid.set(String(year), (hoaPaid.get(String(year)) || 0) + Number(tx.amount));
  });
  let hoaDue = 0;
  for (const r of hoaDues) {
    if (!r.dueDate || !r.annualAmount) continue;
    if (r.dueDate.slice(0, 7) !== nextMonthStr) continue;
    hoaDue += Math.max(Number(r.annualAmount) - (hoaPaid.get(String(r.year)) || 0), 0);
  }

  const totalExpenses = fixedTotal + extraTotal + otherTotal + hoaDue;
  const net = income - totalExpenses;
  const supportNeeded = Math.max(0, MIN_BALANCE - (startBalance + net));

  // Per-owner split: cleaning fees from current month holds, rest 50/50
  const cleaning = {};
  for (const owner of owners) {
    const holdCount = reservations.filter(r =>
      r.isOwnerHold && r.ownerId === owner.id && r.status !== 'Cancelled' &&
      r.checkIn?.startsWith(currentMonthStr)
    ).length;
    cleaning[owner.id] = holdCount * OWNER_CLEANING_FEE;
  }

  const N = owners.length;
  const totalCleaning = Object.values(cleaning).reduce((s, v) => s + v, 0);
  const shares = {};
  if (N > 0) {
    if (totalCleaning <= supportNeeded) {
      const remaining = supportNeeded - totalCleaning;
      for (const owner of owners) shares[owner.id] = remaining / N + cleaning[owner.id];
    } else if (totalCleaning > 0) {
      for (const owner of owners) shares[owner.id] = (cleaning[owner.id] / totalCleaning) * supportNeeded;
    } else {
      for (const owner of owners) shares[owner.id] = supportNeeded / N;
    }
  }

  return {
    currentMonthStr,
    nextMonthStr,
    monthLabel: `${MONTHS[nextMonthIdx]} ${nextYear}`,
    startBalance,
    income,
    totalExpenses,
    net,
    supportNeeded,
    shares,
    cleaning,
  };
}

export function useNotificationCount() {
  const [reservations]        = useLocalStorage('wbh_reservations', sampleReservations);
  const [propertyTaxes]       = useLocalStorage('wbh_property_taxes', samplePropertyTaxes);
  const [hoaDues]             = useLocalStorage('wbh_hoa_dues', sampleHOADues);
  const [transactions]        = useLocalStorage('wbh_transactions', []);
  const [manualNotifications] = useLocalStorage('wbh_manual_notifications', []);

  return useMemo(() => {
    const auto   = buildNotifications(reservations, propertyTaxes, hoaDues, transactions);
    const manual = manualNotifications.filter(n => !n.dismissed);
    return [...auto, ...manual].filter(n => n.type === 'warning').length;
  }, [reservations, propertyTaxes, hoaDues, transactions, manualNotifications]);
}

export default function Notifications() {
  const [reservations]  = useLocalStorage('wbh_reservations', sampleReservations);
  const [propertyTaxes] = useLocalStorage('wbh_property_taxes', samplePropertyTaxes);
  const [hoaDues]       = useLocalStorage('wbh_hoa_dues', sampleHOADues);
  const [transactions]  = useLocalStorage('wbh_transactions', []);
  const [owners]        = useLocalStorage('wbh_owners', sampleOwners);
  const [budgets]       = useLocalStorage('wbh_cashflow_budgets', {});
  const [extraExpenses] = useLocalStorage('wbh_cashflow_extra', []);
  const [monthly]       = useLocalStorage('wbh_cashflow_monthly', {});
  const [monthItems]    = useLocalStorage('wbh_cashflow_month_items', {});
  const [endBals]       = useLocalStorage('wbh_cashflow_end_bals', {});
  const [manualNotifications, setManualNotifications] = useLocalStorage('wbh_manual_notifications', []);

  const autoNotifications = useMemo(() =>
    buildNotifications(reservations, propertyTaxes, hoaDues, transactions),
    [reservations, propertyTaxes, hoaDues, transactions]
  );

  const projection = useMemo(() =>
    computeNextMonthProjection({
      transactions, reservations, owners, budgets, extraExpenses,
      monthly, monthItems, hoaDues, endBals,
    }),
    [transactions, reservations, owners, budgets, extraExpenses, monthly, monthItems, hoaDues, endBals]
  );

  const activeManual = manualNotifications.filter(n => !n.dismissed);
  const notifications = [...autoNotifications, ...activeManual];

  const alreadyGenerated = manualNotifications.some(
    n => n.manual && n.month === projection.nextMonthStr && !n.dismissed
  );

  const dismissManual = (id) => {
    setManualNotifications(prev => prev.map(n => n.id === id ? { ...n, dismissed: true } : n));
  };

  const generateCFSNotifications = () => {
    const { monthLabel, supportNeeded, shares, cleaning, nextMonthStr } = projection;
    const now = new Date().toISOString();
    const fmtAmt = (n) => '$' + Math.round(n).toLocaleString('en-US');
    const newNotes = [];

    if (supportNeeded > 0 && owners.length > 0) {
      for (const owner of owners) {
        const share = shares[owner.id] || 0;
        const cleaningAmt = cleaning[owner.id] || 0;
        const cleaningNote = cleaningAmt > 0 ? ` (incl. ${fmtAmt(cleaningAmt)} cleaning fee)` : '';
        newNotes.push({
          id: `cfs-${owner.id}-${nextMonthStr}-${Date.now()}`,
          type: 'warning',
          title: `Cash Flow Support — ${monthLabel}`,
          body: `${owner.name}: ${fmtAmt(share)} due${cleaningNote}`,
          month: nextMonthStr,
          createdAt: now,
          dismissed: false,
          manual: true,
        });
      }
    } else {
      newNotes.push({
        id: `cfs-none-${nextMonthStr}-${Date.now()}`,
        type: 'success',
        title: `Cash Flow Support — ${monthLabel}`,
        body: `No support needed — projected balance stays above $${MIN_BALANCE.toLocaleString()}`,
        month: nextMonthStr,
        createdAt: now,
        dismissed: false,
        manual: true,
      });
    }

    // Replace any existing CFS notifications for this month, then append new ones
    setManualNotifications(prev => [
      ...prev.filter(n => !n.manual || n.month !== nextMonthStr),
      ...newNotes,
    ]);
  };

  const fmtAmt = (n) => (n < 0 ? '-' : '') + '$' + Math.round(Math.abs(n)).toLocaleString('en-US');

  const iconFor = (type) => {
    if (type === 'warning') return <AlertTriangle size={16} className="text-yellow-400 flex-shrink-0" />;
    if (type === 'success') return <CheckCircle size={16} className="text-emerald-400 flex-shrink-0" />;
    return <Info size={16} className="text-blue-400 flex-shrink-0" />;
  };

  const colorFor = (type) => {
    if (type === 'warning') return 'border-yellow-500/30 bg-yellow-500/5';
    if (type === 'success') return 'border-emerald-500/30 bg-emerald-500/5';
    return 'border-blue-500/30 bg-blue-500/5';
  };

  return (
    <div className="p-8 flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Notifications</h1>
        <p className="text-slate-400 text-sm mt-1">Upcoming reservations, tax deadlines, and reminders</p>
      </div>

      {/* CFS Notification Generator */}
      <div className="bg-navy-800 border border-navy-700 rounded-xl p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-white">Generate CFS Notifications</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Cash flow support projection for {projection.monthLabel}
            </p>
          </div>
          <button
            onClick={generateCFSNotifications}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm font-medium flex-shrink-0 ml-4"
          >
            <Send size={14} />
            {alreadyGenerated ? 'Regenerate' : 'Generate'}
          </button>
        </div>

        {/* Projection preview */}
        <div className="bg-navy-900 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">{projection.monthLabel} projection</span>
            <span className="text-xs text-slate-500">Start bal: {fmtAmt(projection.startBalance)}</span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-xs text-slate-500 mb-0.5">Income</div>
              <div className="text-sm font-semibold text-emerald-400">
                {projection.income > 0 ? fmtAmt(projection.income) : <span className="text-slate-600">—</span>}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-0.5">Expenses</div>
              <div className="text-sm font-semibold text-red-400">
                {projection.totalExpenses > 0 ? fmtAmt(projection.totalExpenses) : <span className="text-slate-600">—</span>}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-0.5">Support Needed</div>
              <div className={`text-sm font-semibold ${projection.supportNeeded > 0 ? 'text-blue-600' : 'text-emerald-400'}`}>
                {projection.supportNeeded > 0 ? fmtAmt(projection.supportNeeded) : 'None'}
              </div>
            </div>
          </div>

          {projection.supportNeeded > 0 && owners.length > 0 && (
            <div className="border-t border-navy-700 pt-3 space-y-2">
              <div className="text-xs text-slate-500">Per-owner breakdown:</div>
              {owners.map(owner => {
                const share = projection.shares[owner.id] || 0;
                const cleaningAmt = projection.cleaning[owner.id] || 0;
                return (
                  <div key={owner.id} className="flex items-center justify-between text-xs">
                    <span className="text-slate-300">{owner.name}</span>
                    <div className="text-right">
                      <span className="text-blue-600 font-semibold">{fmtAmt(share)}</span>
                      {cleaningAmt > 0 && (
                        <span className="text-slate-600 ml-1">incl. {fmtAmt(cleaningAmt)} cleaning</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {projection.supportNeeded === 0 && (
            <div className="border-t border-navy-700 pt-3 text-xs text-emerald-400">
              No support needed — balance stays above ${MIN_BALANCE.toLocaleString()}
            </div>
          )}
        </div>
      </div>

      {/* Notification list */}
      {notifications.length === 0 ? (
        <div className="bg-navy-800 border border-navy-700 rounded-xl p-12 text-center">
          <Bell size={40} className="mx-auto mb-3 text-slate-600" />
          <p className="text-slate-500">No notifications at this time</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map(n => (
            <div key={n.id} className={`flex items-start gap-3 p-4 rounded-xl border ${colorFor(n.type)}`}>
              {iconFor(n.type)}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white">{n.title}</div>
                <div className="text-xs text-slate-400 mt-0.5">{n.body}</div>
              </div>
              {n.manual && (
                <button
                  onClick={() => dismissManual(n.id)}
                  className="text-slate-600 hover:text-slate-400 flex-shrink-0 mt-0.5"
                  title="Dismiss"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
