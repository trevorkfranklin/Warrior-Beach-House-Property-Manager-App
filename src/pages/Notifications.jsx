import { useMemo, useState } from 'react';
import { Bell, AlertTriangle, Info, CheckCircle, X, Mail, ChevronDown, ChevronUp, Send } from 'lucide-react';
import { sendCFSEmail } from '../utils/sendCFSEmail';
import { useTransactions } from '../hooks/useTransactions';
import { useReservations } from '../hooks/useReservations';
import { usePropertyTaxes } from '../hooks/usePropertyTaxes';
import { useHoaDues } from '../hooks/useHoaDues';
import { useOwners } from '../hooks/useOwners';
import { useNotifications } from '../hooks/useNotifications';
import { useAppSetting } from '../hooks/useAppSetting';
import { computeMonthCFS, MONTHS, MIN_BALANCE } from '../utils/cfsCompute';

function buildAutoNotifications(reservations, propertyTaxes, hoaDues, transactions) {
  const today = new Date().toISOString().slice(0, 10);
  const in7  = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const notes = [];

  for (const r of reservations) {
    if (r.status === 'Cancelled') continue;
    if (r.checkIn >= today && r.checkIn <= in7) {
      notes.push({ id: `checkin-${r.id}`, type: 'info', title: `Check-in: ${r.guestName}`, body: `${r.checkIn} – ${r.checkOut} · ${r.nights} nights` });
    }
  }

  for (const r of reservations) {
    if (r.status === 'Cancelled') continue;
    if (r.checkOut === today) {
      notes.push({ id: `checkout-${r.id}`, type: 'info', title: `Check-out today: ${r.guestName}`, body: `${r.checkOut} — remember cleaning and inspection` });
    }
  }

  const taxPaid = new Map();
  transactions.filter(tx => tx.category === 'Property Tax' && tx.taxYear && !tx.excluded)
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
      notes.push({ id: `tax-${t.id}`, type: 'warning', title: `Overdue property tax`, body: `${t.taxYear}${t.taxType ? ` ${t.taxType}` : ''} — $${balance.toLocaleString()} outstanding` });
    } else if (balance > 0 && t.dueDate <= in30) {
      notes.push({ id: `tax-upcoming-${t.id}`, type: 'info', title: `Property tax due soon`, body: `${t.taxYear}${t.taxType ? ` ${t.taxType}` : ''} — $${balance.toLocaleString()} due ${t.dueDate}` });
    }
  }

  const hoaPaid = new Map();
  transactions.filter(tx => tx.category === 'HOA Fees' && !tx.excluded)
    .forEach(tx => {
      const year = tx.taxYear || new Date(tx.date).getFullYear();
      hoaPaid.set(String(year), (hoaPaid.get(String(year)) || 0) + Number(tx.amount));
    });

  for (const h of hoaDues) {
    if (!h.dueDate || !h.annualAmount) continue;
    const paid = hoaPaid.get(String(h.year)) || 0;
    const balance = Math.max(Number(h.annualAmount) - paid, 0);
    if (balance > 0 && h.dueDate < today) {
      notes.push({ id: `hoa-${h.id}`, type: 'warning', title: `Overdue HOA dues`, body: `${h.year} — $${balance.toLocaleString()} outstanding` });
    }
  }

  return notes;
}

export function useNotificationCount() {
  const { transactions }         = useTransactions();
  const { reservations }         = useReservations();
  const { propertyTaxes }        = usePropertyTaxes();
  const { hoaDues }              = useHoaDues();
  const { notifications }        = useNotifications();

  return useMemo(() => {
    const auto   = buildAutoNotifications(reservations, propertyTaxes, hoaDues, transactions);
    const manual = notifications.filter(n => !n.dismissed);
    return [...auto, ...manual].filter(n => n.type === 'warning').length;
  }, [reservations, propertyTaxes, hoaDues, transactions, notifications]);
}

export default function Notifications() {
  const { transactions }   = useTransactions();
  const { reservations }   = useReservations();
  const { propertyTaxes }  = usePropertyTaxes();
  const { hoaDues }        = useHoaDues();
  const { owners }         = useOwners();
  const { notifications, dismissNotification, bulkUpsertNotifications } = useNotifications();
  const [budgets]            = useAppSetting('cashflow_budgets', {});
  const [extraExpenses]      = useAppSetting('cashflow_extra', []);
  const [monthly]            = useAppSetting('cashflow_monthly', {});
  const [monthItems]         = useAppSetting('cashflow_month_items', {});
  const [endBals]            = useAppSetting('cashflow_end_bals', {});
  const [ownerReserveStarts] = useAppSetting('owner_reserve_starts', {});
  const [autoSent, setAutoSent] = useAppSetting('cfs_auto_sent', {});
  const [emailSettings, setEmailSettings] = useAppSetting('email_settings', { enabled: false, serviceId: '', templateId: '', publicKey: '' });
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailDraft, setEmailDraft] = useState(null);
  const [testStatus, setTestStatus] = useState(null);

  const autoNotifications = useMemo(() =>
    buildAutoNotifications(reservations, propertyTaxes, hoaDues, transactions),
    [reservations, propertyTaxes, hoaDues, transactions]
  );

  const today = new Date();
  const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  const computeArgs = { transactions, reservations, owners, budgets, extraExpenses, monthly, monthItems, hoaDues, endBals, ownerReserveStarts };

  const projection = useMemo(() =>
    computeMonthCFS(currentMonthStr, false, computeArgs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions, reservations, owners, budgets, extraExpenses, monthly, monthItems, hoaDues, endBals, ownerReserveStarts]
  );

  const activeManual = notifications.filter(n => !n.dismissed);
  const allNotifications = [...autoNotifications, ...activeManual];

  const resendCFS = async (subtype) => {
    const useActual = subtype === 'updated';
    const proj = computeMonthCFS(currentMonthStr, useActual, computeArgs);
    const subtitle   = subtype === 'initial' ? 'Initial Estimate' : 'Updated Estimate';
    const incomeNote = subtype === 'updated' ? ` — actual income: $${Math.round(proj.income).toLocaleString()}` : '';
    const now        = new Date().toISOString();
    const newNotes   = [];

    if (proj.supportNeeded > 0 && owners.length > 0) {
      for (const bd of proj.ownerBreakdowns) {
        if (bd.cfsNeeded <= 0) continue;
        newNotes.push({
          id: `cfs-auto-${subtype}-${bd.ownerId}-${proj.targetMonthStr}-${Date.now()}`,
          type: 'warning',
          title: `CFS ${subtitle} — ${proj.monthLabel}`,
          body: `${bd.name}: $${Math.round(bd.cfsNeeded).toLocaleString()} due${incomeNote}`,
          ownerBreakdown: bd,
          month: proj.targetMonthStr,
          subtype,
          createdAt: now,
          dismissed: false,
          manual: true,
        });
      }
    } else {
      newNotes.push({
        id: `cfs-auto-${subtype}-none-${proj.targetMonthStr}-${Date.now()}`,
        type: 'success',
        title: `CFS ${subtitle} — ${proj.monthLabel}`,
        body: `No support needed${incomeNote}`,
        month: proj.targetMonthStr,
        subtype,
        createdAt: now,
        dismissed: false,
        manual: true,
      });
    }

    await bulkUpsertNotifications(newNotes);
    await setAutoSent(prev => ({ ...prev, [currentMonthStr]: { ...(prev[currentMonthStr] || {}), [subtype]: true } }));
  };

  const fmtAmt = (n) => (n < 0 ? '-' : '') + '$' + Math.round(Math.abs(n)).toLocaleString('en-US');

  const saveEmailSettings = async () => {
    await setEmailSettings(emailDraft);
    setEmailDraft(null);
  };

  const sendTestEmail = async () => {
    const draft = emailDraft || emailSettings;
    const firstOwnerWithEmail = owners.find(o => o.email);
    if (!firstOwnerWithEmail) { setTestStatus('error:No owner email address found'); return; }
    const proj = computeMonthCFS(currentMonthStr, false, computeArgs);
    const bd   = proj.ownerBreakdowns.find(b => b.ownerId === firstOwnerWithEmail.id);
    if (!bd) { setTestStatus('error:Could not build breakdown'); return; }
    setTestStatus('sending');
    try {
      await sendCFSEmail({ bd, monthLabel: proj.monthLabel, estimateType: 'Test', emailSettings: draft });
      setTestStatus('sent');
    } catch (e) {
      setTestStatus(`error:${e?.text || e?.message || 'Send failed'}`);
    }
    setTimeout(() => setTestStatus(null), 5000);
  };

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
    <div className="p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Notifications</h1>
        <p className="text-slate-400 text-sm mt-1">Upcoming reservations, tax deadlines, and reminders</p>
      </div>

      <div className="bg-navy-800 border border-navy-700 rounded-xl overflow-hidden">
        <button
          className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
          onClick={() => { setEmailOpen(v => !v); setEmailDraft(null); setTestStatus(null); }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <Mail size={16} className={`flex-shrink-0 ${emailSettings.enabled ? 'text-emerald-400' : 'text-slate-500'}`} />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">Email Notifications</div>
              <div className="text-xs text-slate-500 mt-0.5">
                {emailSettings.enabled ? 'Enabled — emails sent to owners automatically' : 'Disabled — owners not emailed'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 ml-4 flex-shrink-0">
            <div
              onClick={e => { e.stopPropagation(); setEmailSettings(s => ({ ...s, enabled: !s.enabled })); setEmailDraft(null); }}
              className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${emailSettings.enabled ? 'bg-emerald-500' : 'bg-navy-600'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${emailSettings.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
            {emailOpen ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
          </div>
        </button>

        {emailOpen && (
          <div className="px-5 pb-5 border-t border-navy-700 pt-4 space-y-4">
            {(() => {
              const draft = emailDraft || emailSettings;
              const set   = (k, v) => setEmailDraft(d => ({ ...(d || emailSettings), [k]: v }));
              const inputCls = 'w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono';
              return (
                <>
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">EmailJS Service ID</label>
                      <input type="text" placeholder="service_xxxxxxx" value={draft.serviceId} onChange={e => set('serviceId', e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">EmailJS Template ID</label>
                      <input type="text" placeholder="template_xxxxxxx" value={draft.templateId} onChange={e => set('templateId', e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">EmailJS Public Key</label>
                      <input type="password" placeholder="••••••••••••••••••••" value={draft.publicKey} onChange={e => set('publicKey', e.target.value)} className={inputCls} />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                      {emailDraft && (
                        <button onClick={saveEmailSettings} className="px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-medium">Save</button>
                      )}
                      <button onClick={sendTestEmail} disabled={testStatus === 'sending'}
                        className="flex items-center gap-1.5 px-3 py-2 bg-navy-700 hover:bg-navy-600 border border-navy-600 text-slate-300 hover:text-white rounded-lg text-xs font-medium disabled:opacity-50">
                        <Send size={12} />
                        {testStatus === 'sending' ? 'Sending…' : 'Send Test Email'}
                      </button>
                    </div>
                    {testStatus === 'sent' && <span className="text-xs text-emerald-400">Test email sent ✓</span>}
                    {testStatus?.startsWith('error:') && <span className="text-xs text-red-400">{testStatus.slice(6)}</span>}
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>

      <div className="bg-navy-800 border border-navy-700 rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-white">Cash Flow Support — {projection.monthLabel}</h2>
            <p className="text-xs text-slate-500 mt-0.5">Auto-sent on the 1st (initial) and when Vacasa income is recorded (updated)</p>
          </div>
          <div className="flex flex-wrap gap-2 flex-shrink-0 sm:ml-4">
            <button onClick={() => resendCFS('initial')} className="flex items-center gap-1.5 bg-navy-700 hover:bg-navy-600 border border-navy-600 text-slate-300 hover:text-white px-3 py-2 rounded-lg text-xs font-medium">Resend Initial</button>
            <button onClick={() => resendCFS('updated')} className="flex items-center gap-1.5 bg-navy-700 hover:bg-navy-600 border border-navy-600 text-slate-300 hover:text-white px-3 py-2 rounded-lg text-xs font-medium">Resend Updated</button>
          </div>
        </div>

        <div className="bg-navy-900 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <div className="text-xs text-slate-500 mb-0.5">Income</div>
              <div className="text-sm font-semibold text-emerald-400">{projection.income > 0 ? fmtAmt(projection.income) : <span className="text-slate-600">—</span>}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-0.5">Expenses</div>
              <div className="text-sm font-semibold text-red-400">{projection.totalExpenses > 0 ? fmtAmt(projection.totalExpenses) : <span className="text-slate-600">—</span>}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-0.5">Support Needed</div>
              <div className={`text-sm font-semibold ${projection.supportNeeded > 0 ? 'text-blue-600' : 'text-emerald-400'}`}>
                {projection.supportNeeded > 0 ? fmtAmt(projection.supportNeeded) : 'None'}
              </div>
            </div>
          </div>

          {projection.supportNeeded > 0 && projection.ownerBreakdowns?.length > 0 && (
            <div className="border-t border-navy-700 pt-3 space-y-3">
              <div className="text-xs text-slate-500">Per-owner breakdown:</div>
              {projection.ownerBreakdowns.map(bd => (
                <div key={bd.ownerId} className="bg-navy-800 rounded-lg p-3 space-y-1.5">
                  <div className="flex justify-between items-baseline text-xs mb-2">
                    <span className="text-slate-200 font-medium">{bd.name}</span>
                    <span className="text-slate-500">{bd.pct}% owner</span>
                  </div>
                  {bd.startReserve != null && (
                    <div className="flex justify-between text-xs border-b border-navy-700 pb-1.5 mb-1">
                      <span className="text-slate-400">Starting reserve</span>
                      <span className="text-slate-300">{fmtAmt(bd.startReserve)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Income share</span>
                    <span className="text-emerald-400">+{fmtAmt(bd.incomeShare)}</span>
                  </div>
                  {bd.expenseLines.map((line, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-slate-500">{line.label}</span>
                      <span className="text-red-400">-{fmtAmt(line.amount)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-xs border-t border-navy-700 pt-1.5 mt-1">
                    <span className="text-white font-medium">Cash Flow Support Required</span>
                    <span className="text-blue-400 font-semibold">{fmtAmt(bd.cfsNeeded)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {projection.supportNeeded === 0 && (
            <div className="border-t border-navy-700 pt-3 text-xs text-emerald-400">
              No support needed — balance stays above ${MIN_BALANCE.toLocaleString()}
            </div>
          )}
        </div>
      </div>

      {allNotifications.length === 0 ? (
        <div className="bg-navy-800 border border-navy-700 rounded-xl p-12 text-center">
          <Bell size={40} className="mx-auto mb-3 text-slate-600" />
          <p className="text-slate-500">No notifications at this time</p>
        </div>
      ) : (
        <div className="space-y-3">
          {allNotifications.map(n => (
            <div key={n.id} className={`flex items-start gap-3 p-4 rounded-xl border ${colorFor(n.type)}`}>
              {iconFor(n.type)}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white">{n.title}</div>
                <div className="text-xs text-slate-400 mt-0.5">{n.body}</div>
                {n.ownerBreakdown && (() => {
                  const bd = n.ownerBreakdown;
                  return (
                    <div className="mt-3 pt-3 border-t border-white/5 space-y-1.5">
                      <div className="text-xs text-slate-500 font-medium mb-2">{bd.name} — {bd.pct}% owner</div>
                      {bd.startReserve != null && (
                        <div className="flex justify-between text-xs border-b border-white/5 pb-1.5 mb-1">
                          <span className="text-slate-400">Starting reserve</span>
                          <span className="text-slate-300">{fmtAmt(bd.startReserve)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Income share</span>
                        <span className="text-emerald-400">+{fmtAmt(bd.incomeShare)}</span>
                      </div>
                      {bd.expenseLines.map((line, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="text-slate-500">{line.label}</span>
                          <span className="text-red-400">-{fmtAmt(line.amount)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between text-xs border-t border-yellow-500/20 pt-1.5 mt-1">
                        <span className="text-white font-medium">Cash Flow Support Required</span>
                        <span className="text-yellow-400 font-bold">{fmtAmt(bd.cfsNeeded)}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
              {n.manual && (
                <button onClick={() => dismissNotification(n.id)} className="text-slate-600 hover:text-slate-400 flex-shrink-0 mt-0.5" title="Dismiss">
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
