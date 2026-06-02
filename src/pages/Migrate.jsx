import { useState } from 'react';
import { Database, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { txToDb, resToDb, ownerToDb, taxToDb, hoaToDb, propToDb, notifToDb } from '../lib/db';

function read(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

const STEPS = [
  { key: 'property',       label: 'Property details',     ls: 'wbh_property',       table: 'property' },
  { key: 'transactions',   label: 'Transactions',          ls: 'wbh_transactions',   table: 'transactions' },
  { key: 'reservations',   label: 'Reservations',          ls: 'wbh_reservations',   table: 'reservations' },
  { key: 'owners',         label: 'Owners',                ls: 'wbh_owners',         table: 'owners' },
  { key: 'property_taxes', label: 'Property taxes',        ls: 'wbh_property_taxes', table: 'property_taxes' },
  { key: 'hoa_dues',       label: 'HOA dues',              ls: 'wbh_hoa_dues',       table: 'hoa_dues' },
  { key: 'notifications',  label: 'Notifications',         ls: 'wbh_manual_notifications', table: 'notifications' },
  { key: 'settings',       label: 'App settings (cashflow, API keys, etc.)', ls: null, table: 'app_settings' },
];

const SETTING_KEYS = [
  'simplefin_url',       'wbh_simplefin_url',
  'simplefin_accounts',  'wbh_simplefin_accounts',
  'openrouter_key',      'wbh_openrouter_key',
  'vision_model',        'wbh_vision_model',
  'email_settings',      'wbh_email_settings',
  'rentcast',            'wbh_rentcast',
  'cashflow_budgets',    'wbh_cashflow_budgets',
  'cashflow_extra',      'wbh_cashflow_extra',
  'cashflow_monthly',    'wbh_cashflow_monthly',
  'cashflow_month_items','wbh_cashflow_month_items',
  'cashflow_start_bals', 'wbh_cashflow_start_bals',
  'cashflow_end_bals',   'wbh_cashflow_end_bals',
  'cashflow_proj_start', 'wbh_cashflow_proj_start',
  'owner_reserve_starts','wbh_owner_reserve_starts',
  'cfs_auto_sent',       'wbh_cfs_auto_sent',
  'property_photo',      'wbh_property_photo',
  'auto_sync_date',      'wbh_auto_sync_date',
  'mortgage_sync_date',  'wbh_mortgage_sync_date',
];

export default function Migrate() {
  const [status, setStatus] = useState({});
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  const setStep = (key, state) => setStatus(prev => ({ ...prev, [key]: state }));

  const migrateProperty = async () => {
    const p = read('wbh_property');
    if (!p) { setStep('property', { ok: true, msg: 'Nothing in localStorage' }); return; }
    const { error } = await supabase.from('property').upsert(propToDb(p), { onConflict: 'id' });
    setStep('property', error ? { ok: false, msg: error.message } : { ok: true, msg: 'Property migrated' });
  };

  const migrateTransactions = async () => {
    const txs = read('wbh_transactions') || [];
    if (!txs.length) { setStep('transactions', { ok: true, msg: 'Nothing to migrate' }); return; }
    const CHUNK = 200;
    let total = 0;
    for (let i = 0; i < txs.length; i += CHUNK) {
      const chunk = txs.slice(i, i + CHUNK).map(txToDb);
      const { error } = await supabase.from('transactions').upsert(chunk, { onConflict: 'id' });
      if (error) { setStep('transactions', { ok: false, msg: error.message }); return; }
      total += chunk.length;
    }
    setStep('transactions', { ok: true, msg: `${total} transactions migrated` });
  };

  const migrateReservations = async () => {
    const items = read('wbh_reservations') || [];
    if (!items.length) { setStep('reservations', { ok: true, msg: 'Nothing to migrate' }); return; }
    const CHUNK = 100;
    let total = 0;
    for (let i = 0; i < items.length; i += CHUNK) {
      const chunk = items.slice(i, i + CHUNK).map(resToDb);
      const { error } = await supabase.from('reservations').upsert(chunk, { onConflict: 'id' });
      if (error) { setStep('reservations', { ok: false, msg: error.message }); return; }
      total += chunk.length;
    }
    setStep('reservations', { ok: true, msg: `${total} reservations migrated` });
  };

  const migrateOwners = async () => {
    const items = read('wbh_owners') || [];
    if (!items.length) { setStep('owners', { ok: true, msg: 'Nothing to migrate' }); return; }
    const { error } = await supabase.from('owners').upsert(items.map(ownerToDb), { onConflict: 'id' });
    setStep('owners', error ? { ok: false, msg: error.message } : { ok: true, msg: `${items.length} owners migrated` });
  };

  const migratePropertyTaxes = async () => {
    const items = read('wbh_property_taxes') || [];
    if (!items.length) { setStep('property_taxes', { ok: true, msg: 'Nothing to migrate' }); return; }
    const { error } = await supabase.from('property_taxes').upsert(items.map(taxToDb), { onConflict: 'id' });
    setStep('property_taxes', error ? { ok: false, msg: error.message } : { ok: true, msg: `${items.length} records migrated` });
  };

  const migrateHoaDues = async () => {
    const items = read('wbh_hoa_dues') || [];
    if (!items.length) { setStep('hoa_dues', { ok: true, msg: 'Nothing to migrate' }); return; }
    const { error } = await supabase.from('hoa_dues').upsert(items.map(hoaToDb), { onConflict: 'id' });
    setStep('hoa_dues', error ? { ok: false, msg: error.message } : { ok: true, msg: `${items.length} records migrated` });
  };

  const migrateNotifications = async () => {
    const items = read('wbh_manual_notifications') || [];
    if (!items.length) { setStep('notifications', { ok: true, msg: 'Nothing to migrate' }); return; }
    const { error } = await supabase.from('notifications').upsert(items.map(notifToDb), { onConflict: 'id' });
    setStep('notifications', error ? { ok: false, msg: error.message } : { ok: true, msg: `${items.length} notifications migrated` });
  };

  const migrateSettings = async () => {
    const upserts = [];
    for (let i = 0; i < SETTING_KEYS.length; i += 2) {
      const supaKey = SETTING_KEYS[i];
      const lsKey   = SETTING_KEYS[i + 1];
      const raw = localStorage.getItem(lsKey);
      if (raw === null) continue;
      try {
        const value = JSON.parse(raw);
        upserts.push({ key: supaKey, value, updated_at: new Date().toISOString() });
      } catch { /* skip malformed */ }
    }
    if (!upserts.length) { setStep('settings', { ok: true, msg: 'Nothing to migrate' }); return; }
    const { error } = await supabase.from('app_settings').upsert(upserts, { onConflict: 'key' });
    setStep('settings', error ? { ok: false, msg: error.message } : { ok: true, msg: `${upserts.length} settings migrated` });
  };

  const runMigration = async () => {
    setRunning(true);
    setStatus({});
    setDone(false);
    await migrateProperty();
    await migrateTransactions();
    await migrateReservations();
    await migrateOwners();
    await migratePropertyTaxes();
    await migrateHoaDues();
    await migrateNotifications();
    await migrateSettings();
    setRunning(false);
    setDone(true);
  };

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Database size={22} className="text-emerald-400" />
          Migrate localStorage → Supabase
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          One-time import of existing data from this browser's localStorage into Supabase.
          Safe to run multiple times — uses upsert (no duplicates).
        </p>
      </div>

      <div className="bg-navy-800 border border-navy-700 rounded-xl p-5 mb-6">
        <div className="space-y-3 mb-5">
          {STEPS.map(s => {
            const st = status[s.key];
            return (
              <div key={s.key} className="flex items-center gap-3">
                <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
                  {!st && running && <Loader size={14} className="text-slate-500 animate-spin" />}
                  {!st && !running && <div className="w-2 h-2 rounded-full bg-navy-600" />}
                  {st?.ok === true  && <CheckCircle size={14} className="text-emerald-400" />}
                  {st?.ok === false && <AlertCircle size={14} className="text-red-400" />}
                </div>
                <div className="flex-1">
                  <span className="text-sm text-slate-300">{s.label}</span>
                  {st && <span className={`ml-2 text-xs ${st.ok ? 'text-slate-500' : 'text-red-400'}`}>{st.msg}</span>}
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={runMigration}
          disabled={running}
          className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
        >
          {running && <Loader size={14} className="animate-spin" />}
          {running ? 'Migrating…' : done ? 'Run Again' : 'Start Migration'}
        </button>
      </div>

      {done && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-sm text-emerald-400">
          Migration complete. Your data is now in Supabase. You can navigate to any page and it will load from the database.
        </div>
      )}
    </div>
  );
}
