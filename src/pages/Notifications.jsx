import { useMemo } from 'react';
import { Bell, AlertTriangle, Info, CheckCircle } from 'lucide-react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { sampleReservations, samplePropertyTaxes, sampleHOADues } from '../data/sampleData';

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
        body: `${r.platform} · ${r.checkIn} – ${r.checkOut} · ${r.nights} nights`,
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
        body: `${r.platform} — remember cleaning and inspection`,
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

export function useNotificationCount() {
  const [reservations] = useLocalStorage('wbh_reservations', sampleReservations);
  const [propertyTaxes] = useLocalStorage('wbh_property_taxes', samplePropertyTaxes);
  const [hoaDues] = useLocalStorage('wbh_hoa_dues', sampleHOADues);
  const [transactions] = useLocalStorage('wbh_transactions', []);

  return useMemo(() => {
    const notes = buildNotifications(reservations, propertyTaxes, hoaDues, transactions);
    return notes.filter(n => n.type === 'warning').length;
  }, [reservations, propertyTaxes, hoaDues, transactions]);
}

export default function Notifications() {
  const [reservations]  = useLocalStorage('wbh_reservations', sampleReservations);
  const [propertyTaxes] = useLocalStorage('wbh_property_taxes', samplePropertyTaxes);
  const [hoaDues]       = useLocalStorage('wbh_hoa_dues', sampleHOADues);
  const [transactions]  = useLocalStorage('wbh_transactions', []);

  const notifications = useMemo(() =>
    buildNotifications(reservations, propertyTaxes, hoaDues, transactions),
    [reservations, propertyTaxes, hoaDues, transactions]
  );

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
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Notifications</h1>
        <p className="text-slate-400 text-sm mt-1">Upcoming reservations, tax deadlines, and reminders</p>
      </div>

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
              <div>
                <div className="text-sm font-medium text-white">{n.title}</div>
                <div className="text-xs text-slate-400 mt-0.5">{n.body}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
