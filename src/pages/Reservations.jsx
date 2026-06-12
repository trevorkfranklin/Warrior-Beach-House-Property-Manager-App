import { useState, useMemo, useRef } from 'react';
import { Plus, Pencil, Trash2, X, Check, CalendarDays, Download, Home } from 'lucide-react';
import { useReservations } from '../hooks/useReservations';
import { useOwners } from '../hooks/useOwners';
import { useAuth } from '../context/Auth';

const MGMT_RATE          = 0.23;
const OWNER_CLEANING_FEE = 122;

const EMPTY = {
  id: '', guestName: '', guestEmail: '', guestPhone: '',
  checkIn: '', checkOut: '',
  grossRent: '', isOwnerHold: false, status: 'Upcoming', notes: '',
};

function computeNights(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  return Math.max((new Date(checkOut) - new Date(checkIn)) / 86400000, 0);
}

function deriveFields(grossRent, nights, isOwnerHold) {
  if (isOwnerHold) {
    return { managementFee: 0, netRent: -OWNER_CLEANING_FEE, grossNightlyRate: 0, netNightlyRate: 0 };
  }
  const gross         = Number(grossRent) || 0;
  const mgmtFee       = gross * MGMT_RATE;
  const netRent       = gross - mgmtFee;
  const grossPerNight = nights > 0 ? gross   / nights : 0;
  const netPerNight   = nights > 0 ? netRent / nights : 0;
  return { managementFee: mgmtFee, netRent, grossNightlyRate: grossPerNight, netNightlyRate: netPerNight };
}

const fmtAmt = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Modal({ title, form, setForm, onSave, onClose, owners }) {
  const inputCls    = 'w-full bg-navy-900 border border-navy-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500';
  const readonlyCls = 'w-full bg-navy-900/50 border border-navy-700/50 rounded-lg px-3 py-2 text-sm text-slate-400 cursor-default';
  const nights      = computeNights(form.checkIn, form.checkOut);
  const { managementFee, netRent, grossNightlyRate, netNightlyRate } = deriveFields(form.grossRent, nights, form.isOwnerHold);
  const gross = Number(form.grossRent) || 0;

  const toggleOwnerHold = (checked) => {
    setForm({
      ...form,
      isOwnerHold: checked,
      guestName:   checked ? 'Owner Hold' : (form.guestName === 'Owner Hold' ? '' : form.guestName),
      grossRent:   checked ? '' : form.grossRent,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-navy-800 rounded-xl border border-navy-700 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-navy-700">
          <h2 className="font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>
        <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Owner Hold toggle */}
          <div className="sm:col-span-2">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div
                onClick={() => toggleOwnerHold(!form.isOwnerHold)}
                className={`w-10 h-5 rounded-full transition-colors flex-shrink-0 flex items-center ${form.isOwnerHold ? 'bg-yellow-500' : 'bg-navy-600'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white mx-0.5 transition-transform ${form.isOwnerHold ? 'translate-x-5' : 'translate-x-0'}`} />
              </div>
              <span className="text-sm text-slate-300">Owner Hold <span className="text-slate-500 text-xs">(${OWNER_CLEANING_FEE} cleaning fee applied)</span></span>
            </label>
          </div>

          {!form.isOwnerHold && (
            <>
              <div className="sm:col-span-2">
                <label className="text-xs text-slate-400 block mb-1">Guest Name *</label>
                <input value={form.guestName} onChange={e => setForm({ ...form, guestName: e.target.value })} placeholder="Full name" className={inputCls} />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Email</label>
                <input type="email" value={form.guestEmail} onChange={e => setForm({ ...form, guestEmail: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Phone</label>
                <input value={form.guestPhone} onChange={e => setForm({ ...form, guestPhone: e.target.value })} className={inputCls} />
              </div>
            </>
          )}

          <div>
            <label className="text-xs text-slate-400 block mb-1">Status</label>
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className={inputCls}>
              <option>Upcoming</option>
              <option>Active</option>
              <option>Complete</option>
              <option>Cancelled</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Check-In *</label>
            <input type="date" value={form.checkIn} onChange={e => setForm({ ...form, checkIn: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Check-Out *</label>
            <input type="date" value={form.checkOut} onChange={e => setForm({ ...form, checkOut: e.target.value })} className={inputCls} />
          </div>

          {nights > 0 && (
            <div className="sm:col-span-2 text-xs text-slate-400 -mt-2">
              <span className={form.isOwnerHold ? 'text-yellow-400 font-semibold' : 'text-emerald-400 font-semibold'}>{nights}</span> night{nights !== 1 ? 's' : ''}
            </div>
          )}

          {form.isOwnerHold ? (
            <div className="sm:col-span-2 space-y-3">
              {owners.length > 0 && (
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Owner</label>
                  <select value={form.ownerId || ''} onChange={e => setForm({ ...form, ownerId: e.target.value })} className={inputCls}>
                    <option value="">— Select owner —</option>
                    {owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
              )}
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <div className="text-xs text-yellow-400 font-medium mb-0.5">Owner Hold</div>
                <div className="text-xs text-slate-400">Cleaning fee: <span className="text-red-400 font-medium">-{fmtAmt(OWNER_CLEANING_FEE)}</span> will be recorded</div>
              </div>
            </div>
          ) : (
            <>
              <div className="sm:col-span-2">
                <label className="text-xs text-slate-400 block mb-1">Gross Rent ($)</label>
                <input
                  type="number" min="0" step="0.01"
                  value={form.grossRent}
                  onChange={e => setForm({ ...form, grossRent: e.target.value })}
                  className={inputCls}
                  placeholder="Total rent before management fee"
                />
              </div>
              {gross > 0 && (
                <>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Management Fee (23%)</label>
                    <div className={readonlyCls}>{fmtAmt(managementFee)}</div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Net Rent</label>
                    <div className={`${readonlyCls} text-emerald-400 border-emerald-500/30`}>{fmtAmt(netRent)}</div>
                  </div>
                  {nights > 0 && (
                    <>
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">Gross / Night</label>
                        <div className={readonlyCls}>{fmtAmt(grossNightlyRate)}</div>
                      </div>
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">Net / Night</label>
                        <div className={`${readonlyCls} text-emerald-400 border-emerald-500/30`}>{fmtAmt(netNightlyRate)}</div>
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}

          <div className="sm:col-span-2">
            <label className="text-xs text-slate-400 block mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className={`${inputCls} resize-none`} />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-navy-700">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
          <button
            onClick={onSave}
            disabled={(!form.isOwnerHold && !form.guestName) || !form.checkIn || !form.checkOut}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium flex items-center gap-2"
          >
            <Check size={14} /> Save
          </button>
        </div>
      </div>
    </div>
  );
}

const CHART_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const METRIC_OPTIONS = [
  { value: 'nights',    label: 'Nights Booked' },
  { value: 'holdNights',label: 'Owner Hold Nights' },
  { value: 'occupancy', label: 'Occupancy Rate' },
  { value: 'avgRate',   label: 'Avg Nightly Rate' },
];

const METRIC_COLORS = {
  nights:    '#60a5fa',
  holdNights:'#facc15',
  occupancy: '#a78bfa',
  avgRate:   '#34d399',
};

function niceMax(val, metric) {
  if (val === 0) return metric === 'occupancy' ? 100 : metric === 'avgRate' ? 500 : 10;
  const exp    = Math.floor(Math.log10(val));
  const factor = Math.pow(10, exp);
  const norm   = val / factor;
  const nice   = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return nice * factor;
}

function ReservationsChart({ enriched }) {
  const currentYear = new Date().getFullYear();
  const allYears    = useMemo(() => {
    const ys = new Set(enriched.map(r => r.checkIn?.slice(0, 4)).filter(Boolean));
    ys.add(String(currentYear));
    return [...ys].sort((a, b) => b - a);
  }, [enriched, currentYear]);

  const [chartYear, setChartYear] = useState(String(currentYear));
  const [metric,    setMetric]    = useState('nights');
  const [hovered,   setHovered]   = useState(null);
  const containerRef = useRef(null);

  const monthlyData = useMemo(() => CHART_MONTHS.map((label, mo) => {
    const monthStr  = `${chartYear}-${String(mo + 1).padStart(2, '0')}`;
    const monthRes  = enriched.filter(r => r.derivedStatus !== 'Cancelled' && r.checkIn?.startsWith(monthStr));
    const guests    = monthRes.filter(r => !r.isOwnerHold);
    const holds     = monthRes.filter(r => r.isOwnerHold);
    const guestNights = guests.reduce((s, r) => s + r.nights, 0);
    const ownerNights = holds.reduce((s, r) => s + r.nights, 0);
    const totalGross  = guests.reduce((s, r) => s + (Number(r.grossRent) || 0), 0);
    const daysInMonth = new Date(Number(chartYear), mo + 1, 0).getDate();
    return {
      label, monthStr,
      guestNights, ownerNights,
      guestStays: guests.length, ownerHoldCount: holds.length,
      occupancy: daysInMonth > 0 ? (guestNights / daysInMonth) * 100 : 0,
      avgRate:   guestNights > 0 ? totalGross / guestNights : 0,
      daysInMonth,
    };
  }), [enriched, chartYear]);

  const getValue = (d) => ({
    nights:    d.guestNights,
    holdNights:d.ownerNights,
    occupancy: d.occupancy,
    avgRate:   d.avgRate,
  }[metric]);

  const fmtTick = (v) => {
    if (metric === 'occupancy') return v.toFixed(0) + '%';
    if (metric === 'avgRate')   return '$' + v.toFixed(0);
    return String(Math.round(v));
  };

  const values = monthlyData.map(getValue);
  const maxVal = niceMax(Math.max(...values, 0), metric);
  const color  = METRIC_COLORS[metric];

  // SVG logical dimensions
  const W = 780, H = 200, padL = 52, padR = 12, padT = 12, padB = 36;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const slotW  = chartW / 12;
  const barW   = slotW * 0.55;
  const NUM_TICKS = 4;
  const ticks  = Array.from({ length: NUM_TICKS + 1 }, (_, i) => (maxVal * i) / NUM_TICKS);

  const onEnter = (idx, e) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHovered({ idx, x: e.clientX - rect.left, y: e.clientY - rect.top, cw: rect.width });
  };

  const metricLabel = METRIC_OPTIONS.find(m => m.value === metric)?.label ?? '';

  return (
    <div className="bg-navy-800 border border-navy-700 rounded-xl p-5 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
        <div className="text-sm font-semibold text-white">{metricLabel} · {chartYear}</div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={metric} onChange={e => setMetric(e.target.value)}
            className="bg-navy-900 border border-navy-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500">
            {METRIC_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          {allYears.length > 1 && (
            <select value={chartYear} onChange={e => setChartYear(e.target.value)}
              className="bg-navy-900 border border-navy-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500">
              {allYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
        </div>
      </div>

      <div ref={containerRef} className="relative select-none" onMouseLeave={() => setHovered(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="overflow-visible">
          {/* Grid lines + Y labels */}
          {ticks.map((tick, ti) => {
            const y = padT + chartH - (tick / maxVal) * chartH;
            return (
              <g key={ti}>
                <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="#1e293b" strokeWidth="1" />
                <text x={padL - 6} y={y} textAnchor="end" dominantBaseline="middle" fill="#475569" fontSize="10">
                  {fmtTick(tick)}
                </text>
              </g>
            );
          })}

          {/* Axes */}
          <line x1={padL} x2={padL}      y1={padT} y2={padT + chartH} stroke="#334155" strokeWidth="1" />
          <line x1={padL} x2={W - padR}  y1={padT + chartH} y2={padT + chartH} stroke="#334155" strokeWidth="1" />

          {/* Bars */}
          {monthlyData.map((d, i) => {
            const v    = getValue(d);
            const h    = maxVal > 0 ? (v / maxVal) * chartH : 0;
            const x    = padL + i * slotW + (slotW - barW) / 2;
            const y    = padT + chartH - h;
            const isHov = hovered?.idx === i;
            return (
              <g key={d.monthStr}
                onMouseEnter={e => onEnter(i, e)}
                onMouseMove={e  => onEnter(i, e)}
                style={{ cursor: 'default' }}>
                <rect x={x} y={h > 0 ? y : padT + chartH - 1}
                  width={barW} height={Math.max(h, 0)} rx="3"
                  fill={isHov ? color : color + 'aa'} />
                <text x={padL + i * slotW + slotW / 2} y={padT + chartH + 16}
                  textAnchor="middle" fill={isHov ? '#cbd5e1' : '#475569'} fontSize="11">
                  {d.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Tooltip */}
        {hovered != null && (() => {
          const d = monthlyData[hovered.idx];
          const flipLeft = hovered.x > (hovered.cw || 600) * 0.6;
          return (
            <div className="absolute z-10 pointer-events-none bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 text-xs shadow-lg"
              style={{
                left: hovered.x,
                top: Math.max(hovered.y - 80, 4),
                transform: flipLeft ? 'translateX(calc(-100% - 8px))' : 'translateX(12px)',
                minWidth: 148,
              }}>
              <div className="font-semibold text-white mb-1.5">{d.label} {chartYear}</div>
              {metric === 'nights' && <>
                <div className="text-slate-400">Guest nights: <span className="text-blue-400 font-semibold">{d.guestNights}</span></div>
                <div className="text-slate-400">Stays: <span className="text-slate-300">{d.guestStays}</span></div>
              </>}
              {metric === 'holdNights' && <>
                <div className="text-slate-400">Hold nights: <span className="text-yellow-400 font-semibold">{d.ownerNights}</span></div>
                <div className="text-slate-400">Holds: <span className="text-slate-300">{d.ownerHoldCount}</span></div>
              </>}
              {metric === 'occupancy' && <>
                <div className="text-slate-400">Occupancy: <span className="text-violet-400 font-semibold">{d.occupancy.toFixed(1)}%</span></div>
                <div className="text-slate-400">Nights: <span className="text-slate-300">{d.guestNights} / {d.daysInMonth} days</span></div>
              </>}
              {metric === 'avgRate' && <>
                <div className="text-slate-400">Avg gross/night: <span className="text-emerald-400 font-semibold">${d.avgRate.toFixed(2)}</span></div>
                <div className="text-slate-400">Guest nights: <span className="text-slate-300">{d.guestNights}</span></div>
              </>}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function reservationStatus(r, today) {
  if (r.status === 'Cancelled') return 'Cancelled';
  if (r.status === 'Complete' || r.checkOut < today) return 'Complete';
  if (r.checkIn <= today) return 'Active';
  return 'Upcoming';
}

export default function Reservations() {
  const { reservations, addReservation, updateReservation, deleteReservation } = useReservations();
  const { owners } = useOwners();
  const [modal, setModal] = useState(null);
  const [form, setForm]   = useState(EMPTY);
  const { canEdit }       = useAuth();

  const [filterStatus, setFilterStatus] = useState('All');
  const [filterYear, setFilterYear]     = useState('');
  const [filterMonth, setFilterMonth]   = useState('');

  const today   = new Date().toISOString().slice(0, 10);
  const fmtFull = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const enriched = useMemo(() =>
    reservations.map(r => {
      const nights      = computeNights(r.checkIn, r.checkOut);
      const isOwnerHold = !!r.isOwnerHold;
      const { managementFee, netRent, grossNightlyRate, netNightlyRate } = deriveFields(r.grossRent, nights, isOwnerHold);
      return { ...r, nights, isOwnerHold, managementFee, netRent, grossNightlyRate, netNightlyRate, derivedStatus: reservationStatus(r, today) };
    }).sort((a, b) => b.checkIn.localeCompare(a.checkIn)),
    [reservations, today]
  );

  const years = useMemo(() => {
    const ys = new Set(reservations.map(r => r.checkIn?.slice(0, 4)).filter(Boolean));
    return [...ys].sort((a, b) => b - a);
  }, [reservations]);

  const filtered = useMemo(() => enriched
    .filter(r => filterStatus === 'All' || r.derivedStatus === filterStatus)
    .filter(r => !filterYear  || r.checkIn?.startsWith(filterYear))
    .filter(r => !filterMonth || r.checkIn?.startsWith(filterMonth)),
  [enriched, filterStatus, filterYear, filterMonth]);

  const totals = useMemo(() => {
    const active      = filtered.filter(r => r.derivedStatus !== 'Cancelled');
    const guestStays  = active.filter(r => !r.isOwnerHold);
    const ownerHolds  = active.filter(r => r.isOwnerHold);
    const guestNights = guestStays.reduce((s, r) => s + r.nights, 0);
    const ownerNights = ownerHolds.reduce((s, r) => s + r.nights, 0);
    const totalGross  = guestStays.reduce((s, r) => s + (Number(r.grossRent) || 0), 0);
    const totalNet    = guestStays.reduce((s, r) => s + r.netRent, 0);
    const cleaningCost = ownerHolds.length * OWNER_CLEANING_FEE;
    return { totalGross, totalNet, guestNights, ownerNights, ownerHoldCount: ownerHolds.length, cleaningCost, netAdr: guestNights > 0 ? totalNet / guestNights : 0 };
  }, [filtered]);

  const openAdd       = () => { setForm({ ...EMPTY, id: crypto.randomUUID() }); setModal('add'); };
  const openOwnerHold = () => { setForm({ ...EMPTY, id: crypto.randomUUID(), isOwnerHold: true, guestName: 'Owner Hold' }); setModal('add'); };
  const openEdit      = (r) => { setForm({ ...r }); setModal('edit'); };

  const save = async () => {
    if (!form.isOwnerHold && !form.guestName) return;
    if (!form.checkIn || !form.checkOut) return;
    const nights      = computeNights(form.checkIn, form.checkOut);
    const isOwnerHold = !!form.isOwnerHold;
    const grossRent   = isOwnerHold ? 0 : (Number(form.grossRent) || 0);
    const { managementFee, netRent, grossNightlyRate, netNightlyRate } = deriveFields(grossRent, nights, isOwnerHold);
    const record = {
      ...form,
      guestName: isOwnerHold ? 'Owner Hold' : form.guestName,
      grossRent, nights, managementFee, netRent, grossNightlyRate, netNightlyRate, isOwnerHold,
    };
    if (modal === 'add') await addReservation(record);
    else await updateReservation(record);
    setModal(null);
  };

  const remove = async (id) => {
    if (confirm('Delete this reservation?')) await deleteReservation(id);
  };

  const exportCSV = () => {
    const esc = (v) => { const s = String(v ?? ''); return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const headers = ['Type','Guest Name','Email','Phone','Check-In','Check-Out','Nights','Gross Rent','Management Fee','Net Rent','Gross $/Night','Net $/Night','Status','Notes'];
    const lines = filtered.map(r => [
      r.isOwnerHold ? 'Owner Hold' : 'Guest Stay',
      r.guestName, r.guestEmail || '', r.guestPhone || '',
      r.checkIn, r.checkOut, r.nights,
      Number(r.grossRent || 0).toFixed(2),
      r.managementFee.toFixed(2),
      r.netRent.toFixed(2),
      r.grossNightlyRate.toFixed(2),
      r.netNightlyRate.toFixed(2),
      r.derivedStatus, r.notes || '',
    ].map(esc).join(','));
    const csv  = [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `wbh-reservations-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const statusBadge = (s) => {
    const cls = s === 'Active'   ? 'bg-emerald-400/10 text-emerald-400'
              : s === 'Upcoming' ? 'bg-blue-400/10 text-blue-400'
              : s === 'Complete' ? 'bg-slate-400/10 text-slate-400'
              :                    'bg-red-400/10 text-red-400';
    return <span className={`text-xs px-2 py-0.5 rounded-full ${cls}`}>{s}</span>;
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {modal && (
        <Modal
          title={modal === 'edit' ? 'Edit Reservation' : form.isOwnerHold ? 'Add Owner Hold' : 'Add Reservation'}
          form={form} setForm={setForm} onSave={save} onClose={() => setModal(null)} owners={owners}
        />
      )}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Reservations</h1>
          <p className="text-slate-400 text-sm mt-1">Vacasa · guest stays + owner holds · 23% management fee</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={exportCSV} className="flex items-center justify-center gap-2 bg-navy-700 hover:bg-navy-600 border border-navy-600 text-slate-300 hover:text-white px-4 py-2 rounded-lg text-sm font-medium w-full sm:w-auto">
            <Download size={14} /> Export CSV
          </button>
          {canEdit && (
            <button onClick={openOwnerHold} className="flex items-center justify-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-lg text-sm font-medium w-full sm:w-auto">
              <Home size={16} /> Add Owner Hold
            </button>
          )}
          {canEdit && (
            <button onClick={openAdd} className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium w-full sm:w-auto">
              <Plus size={16} /> Add Reservation
            </button>
          )}
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
        <div className="bg-navy-800 border border-navy-700 rounded-xl p-4">
          <div className="text-xs text-slate-400 mb-1">Total Gross Rent</div>
          <div className="text-xl font-bold text-slate-300">{fmtFull(totals.totalGross)}</div>
        </div>
        <div className="bg-navy-800 border border-navy-700 rounded-xl p-4">
          <div className="text-xs text-slate-400 mb-1">Mgmt Fee (23%)</div>
          <div className="text-xl font-bold text-red-400">{fmtFull(totals.totalGross * MGMT_RATE)}</div>
        </div>
        <div className="bg-navy-800 border border-navy-700 rounded-xl p-4">
          <div className="text-xs text-slate-400 mb-1">Total Net Rent</div>
          <div className="text-xl font-bold text-emerald-400">{fmtFull(totals.totalNet)}</div>
        </div>
        <div className="bg-navy-800 border border-navy-700 rounded-xl p-4">
          <div className="text-xs text-slate-400 mb-1">Net $/Night (avg)</div>
          <div className="text-xl font-bold text-blue-400">{totals.netAdr > 0 ? fmtFull(totals.netAdr) : '—'}</div>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <div className="bg-navy-800 border border-navy-700 rounded-xl p-4">
          <div className="text-xs text-slate-400 mb-1">Guest Nights</div>
          <div className="text-xl font-bold text-white">{totals.guestNights}</div>
        </div>
        <div className="bg-navy-800 border border-navy-700 rounded-xl p-4">
          <div className="text-xs text-slate-400 mb-1">Owner Hold Nights</div>
          <div className="text-xl font-bold text-yellow-400">{totals.ownerNights} <span className="text-sm font-normal text-slate-500">({totals.ownerHoldCount} stays)</span></div>
        </div>
        <div className="bg-navy-800 border border-navy-700 rounded-xl p-4">
          <div className="text-xs text-slate-400 mb-1">Owner Cleaning Cost</div>
          <div className="text-xl font-bold text-red-400">-{fmtFull(totals.cleaningCost)}</div>
        </div>
      </div>

      {/* Time-phased chart */}
      <ReservationsChart enriched={enriched} />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        {['All', 'Upcoming', 'Active', 'Complete', 'Cancelled'].map(f => (
          <button key={f} onClick={() => setFilterStatus(f)}
            className={`px-3 py-1.5 rounded-lg text-sm ${filterStatus === f ? 'bg-emerald-500 text-white' : 'bg-navy-800 text-slate-400 hover:text-white border border-navy-700'}`}>
            {f}
          </button>
        ))}
        <select value={filterYear} onChange={e => { setFilterYear(e.target.value); setFilterMonth(''); }} className="bg-navy-800 border border-navy-700 rounded-lg px-3 py-1.5 text-sm text-white flex-1 min-w-[120px]">
          <option value="">All Years</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <input
          type="month"
          value={filterMonth}
          onChange={e => { setFilterMonth(e.target.value); setFilterYear(''); }}
          className="bg-navy-800 border border-navy-700 rounded-lg px-3 py-1.5 text-sm text-white flex-1 min-w-[120px]"
        />
      </div>

      {/* Table */}
      <div className="bg-navy-800 rounded-xl border border-navy-700 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-navy-700 text-slate-400 text-xs uppercase">
              <th className="text-left px-4 py-3">Guest</th>
              <th className="text-left px-4 py-3">Check-In</th>
              <th className="text-left px-4 py-3">Check-Out</th>
              <th className="text-center px-4 py-3">Nights</th>
              <th className="text-right px-4 py-3">Gross Rent</th>
              <th className="text-right px-4 py-3">Mgmt Fee</th>
              <th className="text-right px-4 py-3">Net Rent</th>
              <th className="text-right px-4 py-3">Gross/Night</th>
              <th className="text-right px-4 py-3">Net/Night</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-700">
            {filtered.map(r => (
              <tr key={r.id} className={`transition-colors ${r.derivedStatus === 'Cancelled' ? 'opacity-50' : ''} ${r.isOwnerHold ? 'bg-yellow-500/5 hover:bg-yellow-500/10' : 'hover:bg-navy-700/40'}`}>
                <td className="px-4 py-3">
                  {r.isOwnerHold
                    ? <span className="text-yellow-400 font-medium flex items-center gap-1.5"><Home size={13} /> Owner Hold</span>
                    : <><div className="text-white font-medium">{r.guestName}</div>{r.guestEmail && <div className="text-xs text-slate-500 mt-0.5">{r.guestEmail}</div>}</>
                  }
                </td>
                <td className="px-4 py-3 text-slate-300">{r.checkIn}</td>
                <td className="px-4 py-3 text-slate-300">{r.checkOut}</td>
                <td className="px-4 py-3 text-center text-slate-300">{r.nights}</td>
                <td className="px-4 py-3 text-right text-slate-300">{r.isOwnerHold ? '—' : (r.grossRent > 0 ? fmtFull(r.grossRent) : '—')}</td>
                <td className="px-4 py-3 text-right text-red-400">{r.isOwnerHold ? '—' : (r.managementFee > 0 ? fmtFull(r.managementFee) : '—')}</td>
                <td className={`px-4 py-3 text-right font-semibold ${r.isOwnerHold ? 'text-red-400' : 'text-emerald-400'}`}>
                  {r.isOwnerHold ? `-${fmtAmt(OWNER_CLEANING_FEE)}` : (r.netRent > 0 ? fmtFull(r.netRent) : '—')}
                </td>
                <td className="px-4 py-3 text-right text-slate-400">{r.isOwnerHold ? '—' : (r.grossNightlyRate > 0 ? fmtFull(r.grossNightlyRate) : '—')}</td>
                <td className="px-4 py-3 text-right text-slate-300">{r.isOwnerHold ? '—' : (r.netNightlyRate > 0 ? fmtFull(r.netNightlyRate) : '—')}</td>
                <td className="px-4 py-3">{statusBadge(r.derivedStatus)}</td>
                <td className="px-4 py-3">
                  {canEdit && (
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEdit(r)} className="text-slate-400 hover:text-white"><Pencil size={14} /></button>
                      <button onClick={() => remove(r.id)} className="text-slate-400 hover:text-red-400"><Trash2 size={14} /></button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={11} className="px-5 py-12 text-center">
                <CalendarDays size={32} className="mx-auto mb-2 text-slate-600" />
                <div className="text-slate-500">No reservations found</div>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
