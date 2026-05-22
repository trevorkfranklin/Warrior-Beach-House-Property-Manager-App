import { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, X, Check, CalendarDays, Download } from 'lucide-react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { sampleReservations, STR_PLATFORMS } from '../data/sampleData';
import { useAuth } from '../context/Auth';

const EMPTY = {
  id: '', guestName: '', guestEmail: '', guestPhone: '',
  platform: 'Airbnb', checkIn: '', checkOut: '',
  nightlyRate: '', cleaningFee: '', petFee: '', status: 'Upcoming', notes: '',
};

function computeNights(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  const diff = (new Date(checkOut) - new Date(checkIn)) / 86400000;
  return Math.max(diff, 0);
}

function computeTotal(checkIn, checkOut, nightlyRate, cleaningFee, petFee) {
  const nights = computeNights(checkIn, checkOut);
  return nights * (Number(nightlyRate) || 0) + (Number(cleaningFee) || 0) + (Number(petFee) || 0);
}

const fmtAmt = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Modal({ title, form, setForm, onSave, onClose }) {
  const inputCls = 'w-full bg-navy-900 border border-navy-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500';
  const nights      = computeNights(form.checkIn, form.checkOut);
  const totalRevenue = computeTotal(form.checkIn, form.checkOut, form.nightlyRate, form.cleaningFee, form.petFee);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-navy-800 rounded-xl border border-navy-700 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-navy-700">
          <h2 className="font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>
        <div className="px-6 py-4 grid grid-cols-2 gap-4">
          <div className="col-span-2">
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
          <div>
            <label className="text-xs text-slate-400 block mb-1">Platform</label>
            <select value={form.platform} onChange={e => setForm({ ...form, platform: e.target.value })} className={inputCls}>
              {STR_PLATFORMS.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
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
            <div className="col-span-2 text-xs text-slate-400 -mt-2">
              <span className="text-emerald-400 font-semibold">{nights}</span> night{nights !== 1 ? 's' : ''}
            </div>
          )}
          <div>
            <label className="text-xs text-slate-400 block mb-1">Nightly Rate ($)</label>
            <input type="number" min="0" step="0.01" value={form.nightlyRate} onChange={e => setForm({ ...form, nightlyRate: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Cleaning Fee ($)</label>
            <input type="number" min="0" step="0.01" value={form.cleaningFee} onChange={e => setForm({ ...form, cleaningFee: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Pet Fee ($)</label>
            <input type="number" min="0" step="0.01" value={form.petFee} onChange={e => setForm({ ...form, petFee: e.target.value })} className={inputCls} />
          </div>
          {totalRevenue > 0 && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 col-span-2">
              <div className="text-xs text-slate-400">Total Revenue</div>
              <div className="text-lg font-bold text-emerald-400">{fmtAmt(totalRevenue)}</div>
              {nights > 0 && Number(form.nightlyRate) > 0 && (
                <div className="text-xs text-slate-500 mt-0.5">{nights} nights × {fmtAmt(Number(form.nightlyRate))}</div>
              )}
            </div>
          )}
          <div className="col-span-2">
            <label className="text-xs text-slate-400 block mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className={`${inputCls} resize-none`} />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-navy-700">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
          <button
            onClick={onSave}
            disabled={!form.guestName || !form.checkIn || !form.checkOut}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium flex items-center gap-2"
          >
            <Check size={14} /> Save
          </button>
        </div>
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
  const [reservations, setReservations] = useLocalStorage('wbh_reservations', sampleReservations);
  const [modal, setModal] = useState(null);
  const [form, setForm]   = useState(EMPTY);
  const { canEdit }       = useAuth();

  const [filterStatus, setFilterStatus]     = useState('All');
  const [filterPlatform, setFilterPlatform] = useState('');
  const [filterYear, setFilterYear]         = useState('');

  const today = new Date().toISOString().slice(0, 10);
  const fmtFull = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const enriched = useMemo(() =>
    reservations.map(r => ({
      ...r,
      nights:       computeNights(r.checkIn, r.checkOut),
      totalRevenue: computeTotal(r.checkIn, r.checkOut, r.nightlyRate, r.cleaningFee, r.petFee),
      derivedStatus: reservationStatus(r, today),
    })).sort((a, b) => b.checkIn.localeCompare(a.checkIn)),
    [reservations, today]
  );

  const years = useMemo(() => {
    const ys = new Set(reservations.map(r => r.checkIn?.slice(0, 4)).filter(Boolean));
    return [...ys].sort((a, b) => b - a);
  }, [reservations]);

  const filtered = enriched
    .filter(r => filterStatus === 'All' || r.derivedStatus === filterStatus)
    .filter(r => !filterPlatform || r.platform === filterPlatform)
    .filter(r => !filterYear || r.checkIn?.startsWith(filterYear));

  const totals = useMemo(() => {
    const active = enriched.filter(r => r.derivedStatus !== 'Cancelled');
    return {
      totalRevenue: active.reduce((s, r) => s + r.totalRevenue, 0),
      totalNights:  active.reduce((s, r) => s + r.nights, 0),
      adr: active.reduce((s, r) => s + r.nights, 0) > 0
        ? active.reduce((s, r) => s + Number(r.nightlyRate || 0) * r.nights, 0) / active.reduce((s, r) => s + r.nights, 0)
        : 0,
    };
  }, [enriched]);

  const openAdd  = () => { setForm({ ...EMPTY, id: crypto.randomUUID() }); setModal('add'); };
  const openEdit = (r) => { setForm({ ...r }); setModal('edit'); };
  const save = () => {
    if (!form.guestName || !form.checkIn || !form.checkOut) return;
    const nights = computeNights(form.checkIn, form.checkOut);
    const totalRevenue = computeTotal(form.checkIn, form.checkOut, form.nightlyRate, form.cleaningFee, form.petFee);
    const record = {
      ...form,
      nights,
      totalRevenue,
      nightlyRate: Number(form.nightlyRate) || 0,
      cleaningFee: Number(form.cleaningFee) || 0,
      petFee:      Number(form.petFee)      || 0,
    };
    if (modal === 'add') setReservations(prev => [...prev, record]);
    else setReservations(prev => prev.map(r => r.id === record.id ? record : r));
    setModal(null);
  };
  const remove = (id) => {
    if (confirm('Delete this reservation?')) setReservations(prev => prev.filter(r => r.id !== id));
  };

  const exportCSV = () => {
    const esc = (v) => { const s = String(v ?? ''); return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const headers = ['Guest Name','Email','Phone','Platform','Check-In','Check-Out','Nights','Nightly Rate','Cleaning Fee','Pet Fee','Total Revenue','Status','Notes'];
    const lines = filtered.map(r => [
      r.guestName, r.guestEmail, r.guestPhone, r.platform,
      r.checkIn, r.checkOut, r.nights,
      Number(r.nightlyRate||0).toFixed(2), Number(r.cleaningFee||0).toFixed(2), Number(r.petFee||0).toFixed(2),
      r.totalRevenue.toFixed(2), r.derivedStatus, r.notes || '',
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

  const platformBadge = (p) => {
    const cls = p === 'Airbnb' ? 'text-red-400'
              : p === 'VRBO'   ? 'text-blue-400'
              : p === 'Direct' ? 'text-emerald-400'
              :                  'text-slate-400';
    return <span className={`text-xs font-medium ${cls}`}>{p}</span>;
  };

  return (
    <div className="p-8">
      {modal && (
        <Modal
          title={modal === 'add' ? 'Add Reservation' : 'Edit Reservation'}
          form={form} setForm={setForm} onSave={save} onClose={() => setModal(null)}
        />
      )}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Reservations</h1>
          <p className="text-slate-400 text-sm mt-1">Track all guest bookings</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCSV} className="flex items-center gap-2 bg-navy-700 hover:bg-navy-600 border border-navy-600 text-slate-300 hover:text-white px-4 py-2 rounded-lg text-sm font-medium">
            <Download size={14} /> Export CSV
          </button>
          {canEdit && (
            <button onClick={openAdd} className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
              <Plus size={16} /> Add Reservation
            </button>
          )}
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-navy-800 border border-navy-700 rounded-xl p-4">
          <div className="text-xs text-slate-400 mb-1">Total Revenue (active)</div>
          <div className="text-xl font-bold text-emerald-400">{fmtFull(totals.totalRevenue)}</div>
        </div>
        <div className="bg-navy-800 border border-navy-700 rounded-xl p-4">
          <div className="text-xs text-slate-400 mb-1">Total Nights Booked</div>
          <div className="text-xl font-bold text-white">{totals.totalNights}</div>
        </div>
        <div className="bg-navy-800 border border-navy-700 rounded-xl p-4">
          <div className="text-xs text-slate-400 mb-1">Avg Daily Rate</div>
          <div className="text-xl font-bold text-blue-400">{totals.adr > 0 ? fmtFull(totals.adr) : '—'}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        {['All', 'Upcoming', 'Active', 'Complete', 'Cancelled'].map(f => (
          <button key={f} onClick={() => setFilterStatus(f)}
            className={`px-3 py-1.5 rounded-lg text-sm ${filterStatus === f ? 'bg-emerald-500 text-white' : 'bg-navy-800 text-slate-400 hover:text-white border border-navy-700'}`}>
            {f}
          </button>
        ))}
        <select value={filterPlatform} onChange={e => setFilterPlatform(e.target.value)} className="bg-navy-800 border border-navy-700 rounded-lg px-3 py-1.5 text-sm text-white">
          <option value="">All Platforms</option>
          {STR_PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={filterYear} onChange={e => setFilterYear(e.target.value)} className="bg-navy-800 border border-navy-700 rounded-lg px-3 py-1.5 text-sm text-white">
          <option value="">All Years</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-navy-800 rounded-xl border border-navy-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-navy-700 text-slate-400 text-xs uppercase">
              <th className="text-left px-5 py-3">Guest</th>
              <th className="text-left px-5 py-3">Platform</th>
              <th className="text-left px-5 py-3">Check-In</th>
              <th className="text-left px-5 py-3">Check-Out</th>
              <th className="text-center px-5 py-3">Nights</th>
              <th className="text-right px-5 py-3">Rate/Night</th>
              <th className="text-right px-5 py-3">Total</th>
              <th className="text-left px-5 py-3">Status</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-700">
            {filtered.map(r => (
              <tr key={r.id} className={`hover:bg-navy-700/40 transition-colors ${r.derivedStatus === 'Cancelled' ? 'opacity-50' : ''}`}>
                <td className="px-5 py-3">
                  <div className="text-white font-medium">{r.guestName}</div>
                  {r.guestEmail && <div className="text-xs text-slate-500 mt-0.5">{r.guestEmail}</div>}
                </td>
                <td className="px-5 py-3">{platformBadge(r.platform)}</td>
                <td className="px-5 py-3 text-slate-300">{r.checkIn}</td>
                <td className="px-5 py-3 text-slate-300">{r.checkOut}</td>
                <td className="px-5 py-3 text-center text-slate-300">{r.nights}</td>
                <td className="px-5 py-3 text-right text-slate-300">{r.nightlyRate > 0 ? fmtFull(r.nightlyRate) : '—'}</td>
                <td className="px-5 py-3 text-right text-emerald-400 font-semibold">{fmtFull(r.totalRevenue)}</td>
                <td className="px-5 py-3">{statusBadge(r.derivedStatus)}</td>
                <td className="px-5 py-3">
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
              <tr><td colSpan={9} className="px-5 py-12 text-center">
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
