import { useState, useEffect, useCallback, useRef } from 'react';
import { Pencil, X, Check, Home, RefreshCw, TrendingUp, Landmark, Camera } from 'lucide-react';
import { useProperty } from '../hooks/useProperty';
import { useAppSetting } from '../hooks/useAppSetting';
import { PROPERTY_ID } from '../data/sampleData';
import { useAuth } from '../context/Auth';
import { fetchPropertyEstimates } from '../utils/rentcast';
import { fetchAccounts } from '../utils/simplefin';

function PropertyPhoto() {
  const [photoData, setPhotoData] = useAppSetting('property_photo', null);
  const [url, setUrl]     = useState(null);
  const [hover, setHover] = useState(false);
  const fileRef           = useRef();

  useEffect(() => {
    if (photoData) {
      const blob = dataURLtoBlob(photoData);
      const objUrl = URL.createObjectURL(blob);
      setUrl(objUrl);
      return () => URL.revokeObjectURL(objUrl);
    }
  }, [photoData]);

  function dataURLtoBlob(dataURL) {
    const [header, data] = dataURL.split(',');
    const mime = header.match(/:(.*?);/)[1];
    const byteString = atob(data);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
    return new Blob([ab], { type: mime });
  }

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (ev) => { setPhotoData(ev.target.result); };
    reader.readAsDataURL(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleRemove = (ev) => {
    ev.stopPropagation();
    setPhotoData(null);
    setUrl(null);
  };

  return (
    <div className="relative -mx-6 -mt-6 mb-5 cursor-pointer overflow-hidden rounded-t-xl" style={{ height: url ? 200 : 60 }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onClick={() => fileRef.current?.click()}>
      {url ? (
        <>
          <img src={url} alt="Property" className="w-full h-full object-cover" />
          <div className={`absolute inset-0 bg-black/40 flex items-center justify-center gap-3 transition-opacity ${hover ? 'opacity-100' : 'opacity-0'}`}>
            <span className="text-white text-xs flex items-center gap-1"><Camera size={13} /> Change photo</span>
            <button onClick={handleRemove} className="text-white/70 hover:text-red-400 text-xs flex items-center gap-1"><X size={13} /> Remove</button>
          </div>
        </>
      ) : (
        <div className={`flex items-center justify-center h-full bg-navy-900 border-b border-navy-700 transition-colors ${hover ? 'bg-navy-700' : ''}`}>
          <span className="text-slate-500 text-xs flex items-center gap-1.5"><Camera size={13} /> Add property photo</span>
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}

function Modal({ form, setForm, onSave, onClose, sfAccounts }) {
  const inputCls = 'w-full bg-navy-900 border border-navy-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500';
  const accountOptions = Object.values(sfAccounts);
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-navy-800 rounded-xl border border-navy-700 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-navy-700">
          <h2 className="font-semibold text-white">Edit Property Details</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>
        <div className="px-6 py-4 grid grid-cols-2 gap-4">
          <div className="col-span-2"><label className="text-xs text-slate-400 block mb-1">Purchase Price ($)</label><input type="number" value={form.purchasePrice} onChange={e => setForm({ ...form, purchasePrice: e.target.value })} className={inputCls} /></div>
          <div><label className="text-xs text-slate-400 block mb-1">Bedrooms</label><input type="number" value={form.bedrooms} onChange={e => setForm({ ...form, bedrooms: e.target.value })} className={inputCls} /></div>
          <div><label className="text-xs text-slate-400 block mb-1">Bathrooms</label><input type="number" step="0.5" value={form.bathrooms} onChange={e => setForm({ ...form, bathrooms: e.target.value })} className={inputCls} /></div>
          <div><label className="text-xs text-slate-400 block mb-1">Sq Ft</label><input type="number" value={form.sqft} onChange={e => setForm({ ...form, sqft: e.target.value })} className={inputCls} /></div>
          <div><label className="text-xs text-slate-400 block mb-1">Status</label><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className={inputCls}><option>Active</option><option>Maintenance</option></select></div>
          <div><label className="text-xs text-slate-400 block mb-1">HOA Name</label><input value={form.hoa || ''} onChange={e => setForm({ ...form, hoa: e.target.value })} placeholder="e.g. Beachfront HOA" className={inputCls} /></div>
          <div><label className="text-xs text-slate-400 block mb-1">HOA Website</label><input type="url" value={form.hoaUrl || ''} onChange={e => setForm({ ...form, hoaUrl: e.target.value })} placeholder="https://..." className={inputCls} /></div>
          <div className="col-span-2"><label className="text-xs text-slate-400 block mb-1">Notes</label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className={`${inputCls} resize-none`} /></div>
          {accountOptions.length > 0 && (
            <div className="col-span-2">
              <label className="text-xs text-slate-400 block mb-1">Mortgage Account (SimpleFIN)</label>
              <select value={form.mortgageAccountId || ''} onChange={e => setForm({ ...form, mortgageAccountId: e.target.value })} className={inputCls}>
                <option value="">— None —</option>
                {accountOptions.map(a => <option key={a.id} value={a.id}>{a.orgName} — {a.accountName}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-navy-700">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
          <button onClick={onSave} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium flex items-center gap-2"><Check size={14} /> Save</button>
        </div>
      </div>
    </div>
  );
}

export default function Property() {
  const { property, saveProperty }      = useProperty();
  const [rentcastData, setRentcastData] = useAppSetting('rentcast', {});
  const [sfAccounts, setSfAccounts]     = useAppSetting('simplefin_accounts', {});
  const [sfAccessUrl]                   = useAppSetting('simplefin_url', '');
  const [, setMortgageSyncDate]         = useAppSetting('mortgage_sync_date', '');
  const { canEdit }                     = useAuth();
  const [modal, setModal]           = useState(false);
  const [form, setForm]             = useState({});
  const [syncing, setSyncing]       = useState(false);
  const [balanceSyncing, setBalanceSyncing] = useState(false);

  const fmt      = (n) => n ? '$' + Number(n).toLocaleString() : '—';
  const fmtRange = (lo, hi) => lo && hi ? `$${Number(lo).toLocaleString()} – $${Number(hi).toLocaleString()}` : null;
  const rc = rentcastData[PROPERTY_ID];
  const mortgageAcct = property.mortgageAccountId ? sfAccounts[property.mortgageAccountId] : null;

  const syncRentcast = useCallback(async () => {
    if (!property.address) return;
    setSyncing(true);
    try {
      const result = await fetchPropertyEstimates(property.address);
      setRentcastData(prev => ({ ...prev, [PROPERTY_ID]: result }));
    } catch { /* keep old */ }
    setSyncing(false);
  }, [property.address, setRentcastData]);

  const syncMortgageBalances = useCallback(async () => {
    if (!sfAccessUrl) return;
    setBalanceSyncing(true);
    try {
      const accounts = await fetchAccounts(sfAccessUrl, 1);
      const map = {};
      for (const acct of accounts) {
        map[acct.id] = {
          id: acct.id, orgName: acct.org?.name || 'Unknown',
          accountName: acct.name, balance: Math.abs(parseFloat(acct.balance || 0)),
          fetchedAt: new Date().toISOString().slice(0, 10),
        };
      }
      setSfAccounts(map);
      setMortgageSyncDate(new Date().toISOString().slice(0, 10));
    } catch (e) { console.error('Mortgage balance sync failed:', e); }
    finally { setBalanceSyncing(false); }
  }, [sfAccessUrl, setSfAccounts, setMortgageSyncDate]);

  useEffect(() => {
    if (!rentcastData[PROPERTY_ID]) syncRentcast();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sfAccessUrl || Object.keys(sfAccounts).length > 0) return;
    syncMortgageBalances();
  }, [sfAccessUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const openEdit = () => { setForm({ ...property }); setModal(true); };
  const save = async () => {
    await saveProperty({ ...form, purchasePrice: Number(form.purchasePrice), bedrooms: Number(form.bedrooms), bathrooms: Number(form.bathrooms), sqft: Number(form.sqft) });
    setModal(false);
  };

  return (
    <div className="p-8">
      {modal && <Modal form={form} setForm={setForm} onSave={save} onClose={() => setModal(false)} sfAccounts={sfAccounts} />}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Property</h1>
          <p className="text-slate-400 text-sm mt-1">18611 Warrior Rd, Galveston, TX 77554</p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && sfAccessUrl && (
            <button onClick={syncMortgageBalances} disabled={balanceSyncing} className="flex items-center gap-2 bg-navy-700 hover:bg-navy-600 border border-navy-600 text-slate-300 hover:text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
              <RefreshCw size={14} className={balanceSyncing ? 'animate-spin' : ''} />
              {balanceSyncing ? 'Syncing…' : 'Sync Balances'}
            </button>
          )}
          {canEdit && (
            <button onClick={syncRentcast} disabled={syncing} className="flex items-center gap-2 bg-navy-700 hover:bg-navy-600 border border-navy-600 text-slate-300 hover:text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing…' : 'Sync RentCast'}
            </button>
          )}
        </div>
      </div>

      <div className="max-w-2xl">
        <div className="bg-navy-800 rounded-xl border border-navy-700 p-6">
          <PropertyPhoto />
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-400/10 rounded-lg flex items-center justify-center flex-shrink-0"><Home size={18} className="text-emerald-400" /></div>
              <div>
                <div className="font-semibold text-white">{property.name}</div>
                <div className="text-xs text-slate-500">{property.address}</div>
              </div>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full ${property.status === 'Active' ? 'bg-emerald-400/10 text-emerald-400' : 'bg-yellow-400/10 text-yellow-400'}`}>{property.status}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
            <div className="bg-navy-900 rounded-lg p-2"><div className="text-slate-500">Purchase Price</div><div className="text-white font-semibold">{fmt(property.purchasePrice)}</div></div>
            <div className="bg-navy-900 rounded-lg p-2"><div className="text-slate-500">Beds / Baths</div><div className="text-white">{property.bedrooms || '—'} bd / {property.bathrooms || '—'} ba</div></div>
            <div className="bg-navy-900 rounded-lg p-2"><div className="text-slate-500">Sq Ft</div><div className="text-white">{property.sqft ? property.sqft.toLocaleString() : '—'}</div></div>
            <div className="bg-navy-900 rounded-lg p-2"><div className="text-slate-500">Type</div><div className="text-white">{property.type}</div></div>
          </div>

          {(property.hoa) && (
            <div className="text-xs text-slate-500 mb-4">
              <span className="text-slate-600">HOA: </span>
              {property.hoaUrl
                ? <a href={property.hoaUrl} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">{property.hoa}</a>
                : property.hoa}
            </div>
          )}
          {property.notes && <div className="text-xs text-slate-500 italic mb-4">{property.notes}</div>}

          {/* Mortgage balance */}
          {(mortgageAcct || Object.keys(sfAccounts).length > 0) && (
            <div className="border-t border-navy-700 pt-4 mb-4">
              <div className="flex items-center gap-1 mb-2"><Landmark size={11} className="text-slate-500" /><span className="text-xs text-slate-500">Mortgage Balance</span></div>
              {mortgageAcct ? (
                <div className="bg-navy-900 rounded-lg p-2 text-xs">
                  <div className="text-slate-500 mb-1">{mortgageAcct.orgName} — {mortgageAcct.accountName}</div>
                  <div className="text-white font-semibold">{fmt(mortgageAcct.balance)}</div>
                  <div className="text-slate-600 mt-0.5">as of {mortgageAcct.fetchedAt}</div>
                </div>
              ) : (
                <div className="text-xs text-slate-600 italic">No account linked — click Edit to link one</div>
              )}
            </div>
          )}

          {/* RentCast estimates */}
          <div className="border-t border-navy-700 pt-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-500 flex items-center gap-1"><TrendingUp size={11} /> RentCast Estimates</span>
              {canEdit && (
                <button onClick={syncRentcast} disabled={syncing} className="text-xs text-slate-500 hover:text-emerald-400 disabled:opacity-40 flex items-center gap-1">
                  <RefreshCw size={10} className={syncing ? 'animate-spin' : ''} />
                  {rc?.fetchedAt || 'Fetch'}
                </button>
              )}
            </div>
            {rc && !rc.error ? (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-navy-900 rounded-lg p-2">
                  <div className="text-slate-500">Est. Value</div>
                  <div className="text-white font-semibold">{rc.estimatedValue ? fmt(rc.estimatedValue) : '—'}</div>
                  {fmtRange(rc.valueLow, rc.valueHigh) && <div className="text-slate-600 mt-0.5">{fmtRange(rc.valueLow, rc.valueHigh)}</div>}
                </div>
                <div className="bg-navy-900 rounded-lg p-2">
                  <div className="text-slate-500">Est. Value Range</div>
                  <div className="text-slate-400">{fmtRange(rc.valueLow, rc.valueHigh) || '—'}</div>
                </div>
              </div>
            ) : syncing ? (
              <div className="text-xs text-slate-500">Fetching…</div>
            ) : (
              <div className="text-xs text-slate-600 italic">{rc?.error || 'No data — click Fetch or Sync RentCast'}</div>
            )}
          </div>

          {canEdit && (
            <div className="flex justify-end pt-3 border-t border-navy-700">
              <button onClick={openEdit} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white"><Pencil size={12} /> Edit Details</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
