import { useState, useRef, useEffect } from 'react';
import { Upload, Check, AlertCircle, RefreshCw, Landmark, Camera, Pencil, Trash2, X } from 'lucide-react';
import { useTransactions } from '../hooks/useTransactions';
import { useReservations } from '../hooks/useReservations';
import { useAppSetting } from '../hooks/useAppSetting';
import { supabase } from '../lib/supabase';
import { TRANSACTION_CATEGORIES } from '../data/sampleData';

// ── Helpers ────────────────────────────────────────────────────────────────────
function parseLine(line) {
  const fields = [];
  let cur = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) { fields.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  fields.push(cur.trim());
  return fields;
}

function parseCSV(text) {
  const lines = text.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = parseLine(lines[0]).map(h => h.toLowerCase());
  return lines.slice(1).map(line => {
    const values = parseLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] ?? ''; });
    return obj;
  });
}

function normalizeDate(str) {
  if (!str) return new Date().toISOString().slice(0, 10);
  const s = str.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
  const mdyShort = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (mdyShort) {
    const yr = parseInt(mdyShort[3]) > 50 ? `19${mdyShort[3]}` : `20${mdyShort[3]}`;
    return `${yr}-${mdyShort[1].padStart(2, '0')}-${mdyShort[2].padStart(2, '0')}`;
  }
  return s;
}

function guessField(row, candidates) {
  for (const c of candidates) { if (row[c] !== undefined) return c; }
  return '';
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const MONTH_NUM = { JAN:'01',FEB:'02',MAR:'03',APR:'04',MAY:'05',JUN:'06',JUL:'07',AUG:'08',SEP:'09',OCT:'10',NOV:'11',DEC:'12' };
const MGMT_RATE = 0.23;
const fmt = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const OR_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Vision-capable models on OpenRouter
const VISION_PRESETS = [
  'deepseek/deepseek-v4-flash',
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free',
];

const PARSE_PROMPT = `Extract ALL reservation entries from this Vacasa owner portal screenshot — both "GUEST STAY" and "OWNER HOLD" entries.
Return ONLY a JSON array — no markdown, no explanation, just the raw array.

For each entry return an object with exactly these keys:
{
  "type": "GUEST_STAY" or "OWNER_HOLD",
  "day": <integer — the day number shown in the colored date badge>,
  "month": <3-letter uppercase month abbreviation from the badge, e.g. "MAY">,
  "year": <4-digit integer — read from a year header like "2026 Reservations"; if not visible use ${new Date().getFullYear()}>,
  "nights": <integer number of nights>,
  "guestName": <first name + last initial for GUEST_STAY only, e.g. "Krystal J"; use null for OWNER_HOLD>,
  "netRent": <dollar amount in NET RENT column for GUEST_STAY, e.g. 289.33; use 0 for OWNER_HOLD>
}`;

export default function Import() {
  const { transactions, bulkAddTransactions, reload: reloadTx } = useTransactions();
  const { reservations, bulkAddReservations } = useReservations();
  const [sfAccessUrl, setSfAccessUrl]     = useAppSetting('simplefin_url', '');
  const [autoSyncDate, setAutoSyncDate]   = useAppSetting('auto_sync_date', '');
  const [apiKey, setApiKey]               = useAppSetting('openrouter_key', '');
  const [ssModel, setSsModel]             = useAppSetting('vision_model', 'google/gemma-4-31b-it:free');
  const [mode, setMode] = useState('bank');

  // ── CSV state ──────────────────────────────────────────────────────────────
  const [step, setStep] = useState('upload');
  const [rows, setRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({ date: '', description: '', amount: '', type: '', category: '' });
  const [defaultType, setDefaultType] = useState('Expense');
  const [defaultCategory, setDefaultCategory] = useState('');
  const [preview, setPreview] = useState([]);
  const [csvError, setCsvError] = useState('');
  const [csvSkipped, setCsvSkipped] = useState(0);
  const fileRef = useRef();

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) { setCsvError('Please upload a .csv file'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = parseCSV(ev.target.result);
        if (!parsed.length) { setCsvError('CSV appears empty'); return; }
        const hdrs = Object.keys(parsed[0]);
        setHeaders(hdrs); setRows(parsed);
        setMapping({
          date: guessField(parsed[0], ['date', 'transaction date', 'posted date']),
          description: guessField(parsed[0], ['description', 'memo', 'name', 'payee']),
          amount: guessField(parsed[0], ['amount', 'debit', 'credit', 'transaction amount']),
          type: guessField(parsed[0], ['type', 'transaction type']),
          category: guessField(parsed[0], ['category', 'sub category']),
        });
        setCsvError(''); setStep('map');
      } catch { setCsvError('Failed to parse CSV.'); }
    };
    reader.readAsText(file);
  };

  const buildRow = (row) => {
    // Preserve sign before stripping non-numeric characters
    const rawStr    = (row[mapping.amount] || '0').trim();
    const isNeg     = rawStr.startsWith('-') || rawStr.startsWith('(');
    const rawAmount = parseFloat(rawStr.replace(/[^0-9.]/g, '')) || 0;
    const signed    = isNeg ? -rawAmount : rawAmount;
    const amount    = Math.abs(signed);

    // Determine type: explicit type column → keywords; otherwise use sign of amount
    let type = defaultType;
    if (mapping.type && row[mapping.type]) {
      const t = row[mapping.type].toLowerCase();
      if (t.includes('credit') || t.includes('income') || t.includes('deposit')) type = 'Income';
      else if (t.includes('debit') || t.includes('expense') || t.includes('withdrawal')) type = 'Expense';
    } else if (signed !== 0) {
      type = signed > 0 ? 'Income' : 'Expense';
    }

    return {
      id:          crypto.randomUUID(),
      date:        normalizeDate(row[mapping.date]),
      description: row[mapping.description] || 'Imported transaction',
      amount,
      type,
      category:    row[mapping.category] || defaultCategory,
      notes:       'Imported from CSV',
    };
  };

  const existingKeys  = () => new Set(transactions.map(tx => `${tx.date}|${tx.description}|${Number(tx.amount)}|${tx.type}`));
  const existingSfIds = () => new Set(transactions.filter(t => t.sfTxId).map(t => t.sfTxId));
  const isDupe = (tx, keys) =>
    (tx.sfTxId && existingSfIds().has(tx.sfTxId)) ||
    keys.has(`${tx.date}|${tx.description}|${Number(tx.amount)}|${tx.type}`);

  const buildPreview = () => { setPreview(rows.slice(0, 20).map(buildRow)); setStep('preview'); };
  const doImport = async () => {
    const keys = existingKeys();
    const all = rows.map(buildRow);
    const fresh = all.filter(tx => !isDupe(tx, keys));
    setCsvSkipped(all.length - fresh.length);
    await bulkAddTransactions(fresh);
    setStep('done');
  };
  const resetCsv = () => {
    setStep('upload'); setRows([]); setHeaders([]); setPreview([]);
    setCsvError(''); setCsvSkipped(0);
    if (fileRef.current) fileRef.current.value = '';
  };
  const csvSteps = ['upload', 'map', 'preview', 'done'];

  // ── SimpleFIN state ────────────────────────────────────────────────────────
  const [sfStep, setSfStep] = useState('connect');

  // When sfAccessUrl loads from Supabase, advance to sync step
  useEffect(() => {
    if (sfAccessUrl) setSfStep(s => s === 'connect' ? 'sync' : s);
  }, [sfAccessUrl]);
  const [sfToken, setSfToken] = useState('');
  const [sfConnecting, setSfConnecting] = useState(false);
  const [sfSyncing, setSfSyncing] = useState(false);
  const [sfError, setSfError] = useState('');
  const [sfFetchedAccounts, setSfFetchedAccounts] = useState([]);
  const [sfPreview, setSfPreview] = useState([]);
  const [sfStartDate, setSfStartDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 90); return d.toISOString().slice(0, 10);
  });

  async function sfClaim() {
    setSfConnecting(true); setSfError('');
    try {
      const claimUrl = atob(sfToken.trim());
      const res = await fetch(claimUrl, { method: 'POST' });
      if (!res.ok) throw new Error(`Claim failed (${res.status})`);
      const accessUrl = (await res.text()).trim();
      await setSfAccessUrl(accessUrl);
      setSfStep('sync');
    } catch (e) {
      setSfError(e.message || 'Could not connect — check your token and try again.');
    } finally { setSfConnecting(false); }
  }

  async function sfSync() {
    setSfSyncing(true); setSfError('');
    try {
      const u = new URL(sfAccessUrl);
      const auth = btoa(`${u.username}:${u.password}`);
      const base = `${u.protocol}//${u.host}${u.pathname}`;
      const startTs = Math.floor(new Date(sfStartDate).getTime() / 1000);
      const res = await fetch(`${base}/accounts?start-date=${startTs}`, { headers: { Authorization: `Basic ${auth}` } });
      if (!res.ok) throw new Error(`API error (${res.status})`);
      const data = await res.json();
      const allAccounts = data.accounts || [];
      const EXCLUDED_ACCOUNT_SUFFIXES = ['6663', '5100', '9533'];
      const accounts = allAccounts.filter(a => {
        const accountStr = `${a.id || ''} ${a.name || ''}`;
        return !EXCLUDED_ACCOUNT_SUFFIXES.some(suffix => accountStr.includes(suffix));
      });
      setSfFetchedAccounts(accounts);
      const txs = accounts.flatMap(acct =>
        (acct.transactions || []).map(tx => {
          const amount = parseFloat(tx.amount);
          return {
            id: crypto.randomUUID(), sfTxId: tx.id,
            date: new Date(tx.posted * 1000).toISOString().slice(0, 10),
            description: tx.description || tx.memo || 'Bank transaction',
            amount: Math.abs(amount),
            type: amount >= 0 ? 'Income' : 'Expense',
            category: '', notes: `SimpleFIN — ${acct.name}`,
          };
        })
      );
      const keys = existingKeys();
      setSfPreview(txs.map(tx => ({ ...tx, _dupe: isDupe(tx, keys) })));
      setSfStep('preview');
    } catch (e) {
      setSfError(e.message || 'Sync failed.');
    } finally { setSfSyncing(false); }
  }

  async function sfImport() {
    const fresh = sfPreview.filter(tx => !tx._dupe).map(({ _dupe, ...tx }) => tx);
    await bulkAddTransactions(fresh);
    setSfStep('done');
  }

  function sfDisconnect() {
    setSfAccessUrl(''); setSfStep('connect');
    setSfFetchedAccounts([]); setSfPreview([]); setSfError(''); setSfToken('');
  }

  // ── Screenshot / Vision state ──────────────────────────────────────────────
  const [keyDraft, setKeyDraft]   = useState('');
  const [ssImageUrl, setSsImageUrl] = useState('');   // object URL for preview
  const [ssBase64, setSsBase64]   = useState('');     // base64 data URI
  const [ssMime, setSsMime]       = useState('');
  const [ssParsing, setSsParsing] = useState(false);
  const [ssError, setSsError]     = useState('');
  const [ssDraft, setSsDraft]     = useState([]);     // editable parsed rows
  const [ssStep, setSsStep]       = useState('upload');
  const ssFileRef = useRef();

  function handleSsFile(e) {
    const file = e.target.files?.[0] || e.dataTransfer?.files?.[0];
    if (!file || !file.type.startsWith('image/')) {
      setSsError('Please upload an image file (PNG, JPG, etc.)');
      return;
    }
    setSsError('');
    const objectUrl = URL.createObjectURL(file);
    setSsImageUrl(objectUrl);
    setSsMime(file.type);
    const reader = new FileReader();
    reader.onload = (ev) => setSsBase64(ev.target.result); // full data URI
    reader.readAsDataURL(file);
    setSsStep('parse');
  }

  async function parseScreenshot() {
    if (!ssBase64) return;
    if (!apiKey) { setSsError('OpenRouter API key required — enter it below.'); return; }
    setSsParsing(true); setSsError('');
    try {
      const res = await fetch(OR_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://warrior-beach-house.local',
          'X-Title': 'Warrior Beach House',
        },
        body: JSON.stringify({
          model: ssModel,
          max_tokens: 2048,
          messages: [{
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: ssBase64 } },
              { type: 'text', text: PARSE_PROMPT },
            ],
          }],
        }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const msg = data.choices?.[0]?.message;
      // Reasoning models put the answer in content; fallback to reasoning field if content is empty
      const raw = msg?.content || msg?.reasoning || '';

      if (!raw.trim()) throw new Error('Model returned an empty response. Try a different model.');

      // Extract JSON array — strip markdown fences, then find the first [...] block
      const stripped = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '');
      const arrayMatch = stripped.match(/\[[\s\S]*\]/);
      if (!arrayMatch) throw new Error(`Model did not return a JSON array. Response preview: ${raw.slice(0, 200)}`);
      const parsed = JSON.parse(arrayMatch[0]);
      if (!Array.isArray(parsed)) throw new Error('Expected a JSON array');

      // Convert each entry to a reservation draft
      const today = new Date().toISOString().slice(0, 10);
      const drafts = parsed.map(entry => {
        const isOwnerHold = entry.type === 'OWNER_HOLD';
        const monthNum    = MONTH_NUM[entry.month?.toUpperCase()] || '01';
        const checkIn     = `${entry.year}-${monthNum}-${String(entry.day).padStart(2, '0')}`;
        const checkOut    = addDays(checkIn, Number(entry.nights) || 0);
        const nights      = Number(entry.nights) || 0;
        let grossRent, mgmtFee, netRent, grossNightlyRate, netNightlyRate;
        if (isOwnerHold) {
          grossRent = 0; mgmtFee = 0; netRent = -122;
          grossNightlyRate = 0; netNightlyRate = 0;
        } else {
          // Vacasa "Net Rent" is already after their 23% fee — back-calculate gross
          netRent          = Number(entry.netRent) || 0;
          grossRent        = netRent / (1 - MGMT_RATE);
          mgmtFee          = grossRent * MGMT_RATE;
          grossNightlyRate = nights > 0 ? grossRent / nights : 0;
          netNightlyRate   = nights > 0 ? netRent   / nights : 0;
        }
        return {
          id:            crypto.randomUUID(),
          guestName:     isOwnerHold ? 'Owner Hold' : (entry.guestName || ''),
          guestEmail:    '',
          guestPhone:    '',
          isOwnerHold,
          checkIn,
          checkOut,
          nights,
          grossRent,
          managementFee: mgmtFee,
          netRent,
          grossNightlyRate,
          netNightlyRate,
          status:        checkIn > today ? 'Upcoming' : checkOut < today ? 'Complete' : 'Active',
          notes:         '',
        };
      });
      setSsDraft(drafts);
      setSsStep('review');
    } catch (e) {
      setSsError(e.message || 'Failed to parse screenshot. Try a different model or re-upload a clearer image.');
    } finally { setSsParsing(false); }
  }

  function updateDraft(id, field, value) {
    setSsDraft(prev => prev.map(r => {
      if (r.id !== id) return r;
      const updated = { ...r, [field]: value };
      // Recompute derived fields when grossRent, checkIn, or checkOut changes
      if (field === 'grossRent' || field === 'checkIn' || field === 'checkOut') {
        const nights = Math.max(
          (new Date(updated.checkOut + 'T12:00:00') - new Date(updated.checkIn + 'T12:00:00')) / 86400000, 0
        );
        const gross   = Number(updated.grossRent) || 0;
        const mgmtFee = gross * MGMT_RATE;
        const net     = gross - mgmtFee;
        return {
          ...updated,
          nights,
          managementFee:    mgmtFee,
          netRent:          net,
          grossNightlyRate: nights > 0 ? gross / nights : 0,
          netNightlyRate:   nights > 0 ? net   / nights : 0,
        };
      }
      return updated;
    }));
  }

  function removeDraft(id) { setSsDraft(prev => prev.filter(r => r.id !== id)); }

  async function ssImport() {
    const existingKeys = new Set(
      reservations.map(r => `${r.checkIn}|${r.guestName?.toLowerCase()}`)
    );
    const fresh = ssDraft.filter(r =>
      !existingKeys.has(`${r.checkIn}|${r.guestName?.toLowerCase()}`)
    );
    await bulkAddReservations(fresh);
    setSsStep('done');
  }

  function resetSs() {
    setSsStep('upload'); setSsImageUrl(''); setSsBase64('');
    setSsDraft([]); setSsError('');
    if (ssFileRef.current) ssFileRef.current.value = '';
  }

  // ── Cleanup state ──────────────────────────────────────────────────────────
  const [cleanupResult, setCleanupResult] = useState(null);
  const cleanup = async () => {
    const seen = new Set();
    const toDelete = [];
    for (const tx of transactions) {
      const key = `${tx.date}|${tx.description}|${String(tx.amount)}|${tx.type}`;
      if (seen.has(key)) toDelete.push(tx.id);
      else seen.add(key);
    }
    if (toDelete.length) {
        await supabase.from('transactions').delete().in('id', toDelete);
      await reloadTx();
    }
    setCleanupResult(toDelete.length);
  };

  const [fixCount, setFixCount] = useState(null);
  const fixDates = async () => {
    let fixed = 0;
    const updates = transactions
      .map(tx => ({ tx, normalized: normalizeDate(tx.date) }))
      .filter(({ tx, normalized }) => normalized !== tx.date);
    for (const { tx, normalized } of updates) {
      await supabase.from('transactions').update({ date: normalized }).eq('id', tx.id);
      fixed++;
    }
    if (fixed) await reloadTx();
    setFixCount(fixed);
  };

  const csvImported = transactions.filter(tx => tx.notes === 'Imported from CSV');
  const [removeCount, setRemoveCount] = useState(null);
  const removeCsvImports = async () => {
    if (!csvImported.length) { setRemoveCount(0); return; }
    if (!confirm(`Delete all ${csvImported.length} CSV-imported transactions?`)) return;
    await supabase.from('transactions').delete().eq('notes', 'Imported from CSV');
    await reloadTx();
    setRemoveCount(csvImported.length);
  };

  // ── Shared input style ─────────────────────────────────────────────────────
  const inp = 'bg-navy-900 border border-navy-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500';

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Import</h1>
        <p className="text-slate-400 text-sm mt-1">Sync bank transactions or import reservations from a screenshot</p>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 mb-8 p-1 bg-navy-800 border border-navy-700 rounded-lg w-fit overflow-x-auto max-w-full">
        <button onClick={() => setMode('bank')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${mode === 'bank' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white'}`}>
          <Landmark size={13} /> Bank Sync
        </button>
        <button onClick={() => setMode('csv')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${mode === 'csv' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white'}`}>
          <Upload size={13} /> CSV Upload
        </button>
        <button onClick={() => setMode('screenshot')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${mode === 'screenshot' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white'}`}>
          <Camera size={13} /> Screenshot
        </button>
      </div>

      {/* ═══ BANK SYNC ═══════════════════════════════════════════════════════ */}
      {mode === 'bank' && (
        <div>
          {sfStep === 'connect' && (
            <div className="space-y-5">
              <div className="p-5 bg-navy-800 border border-navy-700 rounded-xl space-y-3">
                <h2 className="text-white font-semibold flex items-center gap-2"><Landmark size={16} className="text-emerald-400" /> Connect Chase via SimpleFIN</h2>
                <ol className="text-slate-400 text-sm space-y-1.5 list-decimal list-inside">
                  <li>Go to <span className="text-emerald-400 font-mono text-xs">beta-bridge.simplefin.org</span> and create a free account</li>
                  <li>Click <strong className="text-white">Connect Account</strong> and link your Chase accounts</li>
                  <li>Click <strong className="text-white">+ Add Application Token</strong> and copy the token</li>
                  <li>Paste it below and click Connect</li>
                </ol>
                <p className="text-xs text-slate-500">Chase accounts ending in 6663, 5100, and 9533 are excluded from sync.</p>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">SimpleFIN Setup Token</label>
                <textarea value={sfToken} onChange={e => setSfToken(e.target.value)} placeholder="Paste your setup token here..." className={`w-full ${inp} font-mono h-24 resize-none`} />
              </div>
              {sfError && <div className="flex items-start gap-2 text-red-400 text-sm"><AlertCircle size={14} className="mt-0.5 shrink-0" />{sfError}</div>}
              <button onClick={sfClaim} disabled={!sfToken.trim() || sfConnecting} className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium">
                {sfConnecting ? 'Connecting...' : 'Connect'}
              </button>
            </div>
          )}

          {sfStep === 'sync' && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
                <div>
                  <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium"><Check size={15} /> Chase connected · auto-syncs nightly at midnight</div>
                  {autoSyncDate && <div className="text-xs text-slate-500 mt-0.5">Last auto-sync: {autoSyncDate}</div>}
                </div>
                <button onClick={sfDisconnect} className="text-xs text-slate-500 hover:text-red-400 transition-colors sm:ml-4">Disconnect</button>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Fetch transactions since</label>
                <input type="date" value={sfStartDate} onChange={e => setSfStartDate(e.target.value)} className={`w-full ${inp}`} />
              </div>
              {sfError && <div className="flex items-start gap-2 text-red-400 text-sm"><AlertCircle size={14} className="mt-0.5 shrink-0" />{sfError}</div>}
              <button onClick={sfSync} disabled={sfSyncing} className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center gap-2">
                <RefreshCw size={14} className={sfSyncing ? 'animate-spin' : ''} />
                {sfSyncing ? 'Syncing...' : 'Sync Transactions'}
              </button>
            </div>
          )}

          {sfStep === 'preview' && (() => {
            const sfFresh = sfPreview.filter(tx => !tx._dupe);
            const sfDupes = sfPreview.length - sfFresh.length;
            return (
              <div className="space-y-4">
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-400 text-sm flex items-center gap-2">
                  <AlertCircle size={14} />
                  {sfFresh.length} new transaction{sfFresh.length !== 1 ? 's' : ''} from {sfFetchedAccounts.length} Chase account{sfFetchedAccounts.length !== 1 ? 's' : ''}.
                  {sfDupes > 0 && <span className="text-slate-400">{sfDupes} already imported will be skipped.</span>}
                </div>
                <div className="bg-navy-800 rounded-xl border border-navy-700 overflow-hidden">
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-navy-700 text-slate-400 text-xs uppercase">
                      <th className="text-left px-4 py-2">Date</th><th className="text-left px-4 py-2">Description</th><th className="text-left px-4 py-2">Type</th><th className="text-right px-4 py-2">Amount</th>
                    </tr></thead>
                    <tbody className="divide-y divide-navy-700">
                      {sfPreview.slice(0, 50).map((tx, i) => (
                        <tr key={i} className={tx._dupe ? 'opacity-35' : ''}>
                          <td className="px-4 py-2 text-slate-300">{tx.date}</td>
                          <td className="px-4 py-2 text-white">{tx.description}{tx._dupe && <span className="ml-2 text-xs text-slate-500 italic">duplicate</span>}</td>
                          <td className={`px-4 py-2 ${tx.type === 'Income' ? 'text-emerald-400' : 'text-red-400'}`}>{tx.type}</td>
                          <td className="px-4 py-2 text-right text-white">{fmt(tx.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 justify-between">
                  <button onClick={() => setSfStep('sync')} className="text-slate-400 hover:text-white text-sm">← Back</button>
                  <button onClick={sfImport} disabled={sfFresh.length === 0} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white rounded-lg text-sm font-medium">
                    Import {sfFresh.length} Transaction{sfFresh.length !== 1 ? 's' : ''}
                  </button>
                </div>
              </div>
            );
          })()}

          {sfStep === 'done' && (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4"><Check size={32} className="text-emerald-400" /></div>
              <h2 className="text-xl font-semibold text-white mb-2">Import Complete!</h2>
              <p className="text-slate-400 text-sm mb-6">{sfPreview.filter(tx => !tx._dupe).length} transactions added.</p>
              <button onClick={() => setSfStep('sync')} className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium">Sync Again</button>
            </div>
          )}
        </div>
      )}

      {/* ═══ CSV UPLOAD ══════════════════════════════════════════════════════ */}
      {mode === 'csv' && (
        <div>
          <div className="flex items-center gap-2 mb-8 text-xs">
            {csvSteps.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                {i > 0 && <div className="w-8 h-px bg-navy-700" />}
                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full ${step === s ? 'bg-emerald-500/20 text-emerald-400 font-medium' : csvSteps.indexOf(step) > i ? 'text-slate-400' : 'text-slate-600'}`}>
                  {csvSteps.indexOf(step) > i ? <Check size={12} /> : <span>{i + 1}</span>}
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </div>
              </div>
            ))}
          </div>

          {step === 'upload' && (
            <div>
              <label className="flex flex-col items-center justify-center w-full h-48 bg-navy-800 border-2 border-dashed border-navy-600 rounded-xl cursor-pointer hover:border-emerald-500 transition-colors">
                <Upload size={32} className="text-slate-500 mb-3" />
                <span className="text-slate-400 text-sm">Drop a CSV file here, or click to browse</span>
                <span className="text-slate-600 text-xs mt-1">Supports bank exports and generic CSV</span>
                <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
              </label>
              {csvError && <div className="mt-3 flex items-center gap-2 text-red-400 text-sm"><AlertCircle size={14} />{csvError}</div>}
            </div>
          )}

          {step === 'map' && (
            <div className="space-y-4">
              <div className="p-4 bg-navy-800 border border-navy-700 rounded-xl">
                <div className="text-sm text-slate-300 mb-1">Found <strong className="text-white">{rows.length}</strong> rows</div>
                <div className="text-xs text-slate-500">Map CSV columns to transaction fields</div>
              </div>
              {[['date','Date column',true],['description','Description column',true],['amount','Amount column',true],['type','Type column',false],['category','Category column',false]].map(([field, label, req]) => (
                <div key={field}>
                  <label className="text-xs text-slate-400 block mb-1">{label}{req && ' *'}</label>
                  <select value={mapping[field]} onChange={e => setMapping({ ...mapping, [field]: e.target.value })} className={`w-full ${inp}`}>
                    <option value="">— Not mapped —</option>{headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-navy-700">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Default Type</label>
                  <select value={defaultType} onChange={e => setDefaultType(e.target.value)} className={`w-full ${inp}`}><option>Income</option><option>Expense</option></select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Default Category</label>
                  <select value={defaultCategory} onChange={e => setDefaultCategory(e.target.value)} className={`w-full ${inp}`}>
                    <option value="">— No category —</option>{TRANSACTION_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex justify-between pt-2">
                <button onClick={resetCsv} className="text-slate-400 hover:text-white text-sm">← Back</button>
                <button onClick={buildPreview} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium">Preview Import →</button>
              </div>
            </div>
          )}

          {step === 'preview' && (() => {
            const keys = existingKeys();
            const totalDupes = rows.map(buildRow).filter(tx => isDupe(tx, keys)).length;
            const totalFresh = rows.length - totalDupes;
            return (
              <div>
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-400 text-sm mb-4 flex items-center gap-2">
                  <AlertCircle size={14} />{totalFresh} new of {rows.length} rows will be imported.
                  {totalDupes > 0 && <span className="text-slate-400">{totalDupes} duplicates will be skipped.</span>}
                </div>
                <div className="bg-navy-800 rounded-xl border border-navy-700 overflow-hidden mb-4">
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-navy-700 text-slate-400 text-xs uppercase">
                      <th className="text-left px-4 py-2">Date</th><th className="text-left px-4 py-2">Description</th><th className="text-left px-4 py-2">Type</th><th className="text-right px-4 py-2">Amount</th>
                    </tr></thead>
                    <tbody className="divide-y divide-navy-700">
                      {preview.map((tx, i) => {
                        const dupe = isDupe(tx, keys);
                        return (
                          <tr key={i} className={dupe ? 'opacity-35' : ''}>
                            <td className="px-4 py-2 text-slate-300">{tx.date}</td>
                            <td className="px-4 py-2 text-white">{tx.description}{dupe && <span className="ml-2 text-xs text-slate-500 italic">duplicate</span>}</td>
                            <td className={`px-4 py-2 ${tx.type === 'Income' ? 'text-emerald-400' : 'text-red-400'}`}>{tx.type}</td>
                            <td className="px-4 py-2 text-right text-white">{fmt(tx.amount)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 justify-between">
                  <button onClick={() => setStep('map')} className="text-slate-400 hover:text-white text-sm">← Back</button>
                  <button onClick={doImport} disabled={totalFresh === 0} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white rounded-lg text-sm font-medium">
                    Import {totalFresh} Transaction{totalFresh !== 1 ? 's' : ''}
                  </button>
                </div>
              </div>
            );
          })()}

          {step === 'done' && (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4"><Check size={32} className="text-emerald-400" /></div>
              <h2 className="text-xl font-semibold text-white mb-2">Import Complete!</h2>
              <p className="text-slate-400 text-sm mb-6">{rows.length - csvSkipped} transactions added.</p>
              <button onClick={resetCsv} className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium">Import Another File</button>
            </div>
          )}
        </div>
      )}

      {/* ═══ SCREENSHOT IMPORT ═══════════════════════════════════════════════ */}
      {mode === 'screenshot' && (
        <div>
          {ssStep === 'upload' && (
            <div className="space-y-5">
              <div className="p-4 bg-navy-800 border border-navy-700 rounded-xl space-y-1">
                <h2 className="text-white font-semibold flex items-center gap-2"><Camera size={16} className="text-emerald-400" /> Import Reservations from Screenshot</h2>
                <p className="text-slate-400 text-sm">Take a screenshot of your Vacasa reservations page and upload it here. A vision AI will extract the reservation data automatically.</p>
                <p className="text-xs text-slate-500">Vacasa's "Net Rent" is already after their 23% fee. Gross Rent will be back-calculated (Net ÷ 0.77) so the numbers reconcile correctly.</p>
              </div>

              {/* API Key */}
              <div>
                <label className="text-xs text-slate-400 block mb-1 flex items-center justify-between">
                  <span>OpenRouter API Key <span className="text-slate-600">(required — free at openrouter.ai/keys)</span></span>
                  {apiKey && <span className="text-emerald-400 text-xs">✓ Saved</span>}
                </label>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="password"
                    value={keyDraft || (apiKey ? '••••••••••••••••' : '')}
                    onChange={e => setKeyDraft(e.target.value)}
                    onFocus={e => { if (!keyDraft) setKeyDraft(apiKey); }}
                    placeholder="sk-or-..."
                    className={`flex-1 min-w-0 ${inp} font-mono`}
                  />
                  <button
                    onClick={() => { if (keyDraft) { setApiKey(keyDraft); setKeyDraft(''); } }}
                    disabled={!keyDraft}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white rounded-lg text-sm font-medium"
                  >
                    Save
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1 flex items-center justify-between">
                  <span>AI Vision Model</span>
                  <a href="https://openrouter.ai/models?modalities=image" target="_blank" rel="noreferrer" className="text-emerald-400 hover:text-emerald-300">Browse models ↗</a>
                </label>
                <input
                  value={ssModel}
                  onChange={e => setSsModel(e.target.value)}
                  placeholder="e.g. meta-llama/llama-3.2-11b-vision-instruct:free"
                  className={`w-full ${inp} font-mono text-xs`}
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {VISION_PRESETS.map(id => (
                    <button key={id} onClick={() => setSsModel(id)}
                      className={`text-xs px-2 py-1 rounded border transition-colors font-mono ${ssModel === id ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400' : 'border-navy-600 text-slate-500 hover:text-slate-300 hover:border-navy-500'}`}>
                      {id.split('/')[1]}
                    </button>
                  ))}
                </div>
              </div>

              <label
                className="flex flex-col items-center justify-center w-full h-56 bg-navy-800 border-2 border-dashed border-navy-600 rounded-xl cursor-pointer hover:border-emerald-500 transition-colors"
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); handleSsFile(e); }}
                onClick={() => ssFileRef.current?.click()}
              >
                <Camera size={36} className="text-slate-500 mb-3" />
                <span className="text-slate-400 text-sm">Drop a screenshot here, or click to browse</span>
                <span className="text-slate-600 text-xs mt-1">PNG, JPG, or WEBP</span>
                <input ref={ssFileRef} type="file" accept="image/*" className="hidden" onChange={handleSsFile} />
              </label>
              {ssError && <div className="flex items-start gap-2 text-red-400 text-sm"><AlertCircle size={14} className="mt-0.5 shrink-0" />{ssError}</div>}
            </div>
          )}

          {ssStep === 'parse' && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row items-start gap-4 p-4 bg-navy-800 border border-navy-700 rounded-xl">
                <img src={ssImageUrl} alt="Screenshot preview" className="w-full sm:w-48 rounded-lg object-cover border border-navy-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium mb-1">Screenshot uploaded</p>
                  <p className="text-slate-400 text-xs mb-4">The AI will scan for GUEST STAY rows and extract dates, guest names, and net rent amounts. Owner holds will be skipped.</p>
                  <div className="mb-3">
                    <label className="text-xs text-slate-400 block mb-1 flex items-center justify-between">
                      <span>Vision Model</span>
                      <a href="https://openrouter.ai/models?modalities=image" target="_blank" rel="noreferrer" className="text-emerald-400 hover:text-emerald-300 text-xs">Browse ↗</a>
                    </label>
                    <input
                      value={ssModel}
                      onChange={e => setSsModel(e.target.value)}
                      className={`w-full ${inp} font-mono text-xs`}
                    />
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {VISION_PRESETS.map(id => (
                        <button key={id} onClick={() => setSsModel(id)}
                          className={`text-xs px-1.5 py-0.5 rounded border font-mono transition-colors ${ssModel === id ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400' : 'border-navy-600 text-slate-500 hover:text-slate-300'}`}>
                          {id.split('/')[1]}
                        </button>
                      ))}
                    </div>
                  </div>
                  {!apiKey && (
                    <div className="mb-3">
                      <label className="text-xs text-slate-400 block mb-1">OpenRouter API Key</label>
                      <div className="flex flex-wrap gap-2">
                        <input type="password" value={keyDraft} onChange={e => setKeyDraft(e.target.value)} placeholder="sk-or-..." className={`flex-1 min-w-0 ${inp} font-mono`} />
                        <button onClick={() => { if (keyDraft) { setApiKey(keyDraft); setKeyDraft(''); } }} disabled={!keyDraft} className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white rounded-lg text-xs font-medium">Save</button>
                      </div>
                    </div>
                  )}
                  {ssError && <div className="flex items-start gap-2 text-red-400 text-sm mb-3"><AlertCircle size={14} className="mt-0.5 shrink-0" />{ssError}</div>}
                  <div className="flex gap-2">
                    <button onClick={parseScreenshot} disabled={ssParsing || !apiKey} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center gap-2">
                      <Camera size={14} className={ssParsing ? 'animate-pulse' : ''} />
                      {ssParsing ? 'Parsing…' : 'Parse Reservations'}
                    </button>
                    <button onClick={resetSs} className="px-4 py-2 text-slate-400 hover:text-white text-sm">← Start over</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {ssStep === 'review' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="text-white font-medium">{ssDraft.length} reservation{ssDraft.length !== 1 ? 's' : ''} extracted ({ssDraft.filter(r => !r.isOwnerHold).length} guest, {ssDraft.filter(r => r.isOwnerHold).length} owner holds)</p>
                  <p className="text-xs text-slate-500 mt-0.5">Guest stays: Vacasa net rent back-calculated to gross (÷ 0.77). Owner holds: $122 cleaning fee applied.</p>
                </div>
                <button onClick={() => setSsStep('parse')} className="text-slate-400 hover:text-white text-sm">← Re-parse</button>
              </div>

              <div className="space-y-2">
                {ssDraft.map(r => (
                  <div key={r.id} className={`border rounded-xl p-4 ${r.isOwnerHold ? 'bg-yellow-500/5 border-yellow-500/30' : 'bg-navy-800 border-navy-700'}`}>
                    {r.isOwnerHold && (
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs font-medium text-yellow-400 bg-yellow-500/10 border border-yellow-500/30 px-2 py-0.5 rounded-full">Owner Hold</span>
                        <span className="text-xs text-slate-500">Cleaning fee: <span className="text-red-400">-$122.00</span></span>
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                      {!r.isOwnerHold && (
                        <>
                          <div>
                            <label className="text-xs text-slate-400 block mb-1">Guest Name</label>
                            <input value={r.guestName} onChange={e => updateDraft(r.id, 'guestName', e.target.value)} className={`w-full ${inp}`} />
                          </div>
                        </>
                      )}
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">Check-In</label>
                        <input type="date" value={r.checkIn} onChange={e => updateDraft(r.id, 'checkIn', e.target.value)} className={`w-full ${inp}`} />
                      </div>
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">Check-Out</label>
                        <input type="date" value={r.checkOut} onChange={e => updateDraft(r.id, 'checkOut', e.target.value)} className={`w-full ${inp}`} />
                      </div>
                      {!r.isOwnerHold && (
                        <div>
                          <label className="text-xs text-slate-400 block mb-1">Gross Rent ($)</label>
                          <input type="number" min="0" step="0.01" value={r.grossRent} onChange={e => updateDraft(r.id, 'grossRent', Number(e.target.value))} className={`w-full ${inp}`} />
                        </div>
                      )}
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">Status</label>
                        <select value={r.status} onChange={e => updateDraft(r.id, 'status', e.target.value)} className={`w-full ${inp}`}>
                          <option>Upcoming</option><option>Active</option><option>Complete</option><option>Cancelled</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex flex-wrap gap-4 text-slate-400">
                        <span><span className="text-slate-500">Nights:</span> <span className="text-white">{r.nights}</span></span>
                        {!r.isOwnerHold && <>
                          <span><span className="text-slate-500">Mgmt fee:</span> <span className="text-red-400">-{fmt(r.managementFee)}</span></span>
                          <span><span className="text-slate-500">Net rent:</span> <span className="text-emerald-400">{fmt(r.netRent)}</span></span>
                        </>}
                        <span><span className="text-slate-500">Net/night:</span> <span className="text-slate-300">{fmt(r.netNightlyRate)}</span></span>
                      </div>
                      <button onClick={() => removeDraft(r.id)} className="text-slate-500 hover:text-red-400 flex items-center gap-1">
                        <Trash2 size={13} /> Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {ssDraft.length > 0 && (
                <button onClick={ssImport} className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2">
                  <Check size={15} /> Import {ssDraft.length} Reservation{ssDraft.length !== 1 ? 's' : ''}
                </button>
              )}
            </div>
          )}

          {ssStep === 'done' && (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4"><Check size={32} className="text-emerald-400" /></div>
              <h2 className="text-xl font-semibold text-white mb-2">Reservations Imported!</h2>
              <p className="text-slate-400 text-sm mb-6">Go to the Reservations page to review them.</p>
              <button onClick={resetSs} className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium">Import Another Screenshot</button>
            </div>
          )}
        </div>
      )}

      {/* ═══ DATA REPAIR (transactions only) ════════════════════════════════ */}
      {mode !== 'screenshot' && transactions.length > 0 && (
        <div className="mt-12 pt-8 border-t border-navy-700">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Data Repair</h2>
          {[
            { label: 'Fix transaction date formats', sub: 'Converts MM/DD/YYYY dates to YYYY-MM-DD', action: fixDates, result: fixCount, btnLabel: 'Fix Dates', resultMsg: fixCount === 0 ? 'All dates correct.' : `Fixed ${fixCount} transactions.` },
            { label: `Delete all CSV-imported transactions`, sub: `Removes ${csvImported.length} CSV-imported transactions`, action: removeCsvImports, result: removeCount, btnLabel: 'Delete All', resultMsg: removeCount === 0 ? 'None found.' : `Deleted ${removeCount} transactions.` },
            { label: 'Clean up duplicates', sub: 'Removes exact duplicates and reassigns all IDs', action: cleanup, result: cleanupResult, btnLabel: 'Clean Up', resultMsg: cleanupResult === 0 ? 'No duplicates found.' : `Removed ${cleanupResult} duplicates.` },
          ].map(({ label, sub, action, result, btnLabel, resultMsg }) => (
            <div key={label}>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-navy-800 border border-navy-700 rounded-xl mb-1">
                <div><p className="text-sm text-white">{label}</p><p className="text-xs text-slate-500 mt-0.5">{sub}</p></div>
                <button onClick={action} className="px-4 py-2 bg-navy-700 hover:bg-navy-600 text-slate-300 hover:text-white rounded-lg text-sm font-medium shrink-0 w-full sm:w-auto sm:ml-4">{btnLabel}</button>
              </div>
              {result !== null && <p className="mb-3 text-sm text-emerald-400 flex items-center gap-1.5 px-1"><Check size={14} />{resultMsg}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
