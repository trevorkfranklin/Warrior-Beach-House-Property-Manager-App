import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

// Vercel Cron Job target — runs the SimpleFIN sync server-side so it no
// longer depends on someone having the app open in a browser tab.
// Requires SUPABASE_SERVICE_ROLE_KEY (bypasses RLS, since there's no
// logged-in admin session in a cron context) and CRON_SECRET (Vercel
// auto-attaches this as `Authorization: Bearer <CRON_SECRET>` on cron
// invocations — see https://vercel.com/docs/cron-jobs/manage-cron-jobs).

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

async function fetchAccounts(accessUrl, daysBack = 2) {
  const u = new URL(accessUrl);
  const auth = Buffer.from(`${u.username}:${u.password}`).toString('base64');
  const base = `${u.protocol}//${u.host}${u.pathname}`;
  const since = new Date();
  since.setDate(since.getDate() - daysBack);
  const startTs = Math.floor(since.getTime() / 1000);
  const res = await fetch(`${base}/accounts?start-date=${startTs}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error(`SimpleFIN API error (${res.status})`);
  const data = await res.json();
  return data.accounts || [];
}

const txToDb = (t) => ({
  id: t.id,
  date: t.date,
  description: t.description,
  amount: Number(t.amount),
  type: t.type,
  category: t.category || '',
  owner_id: t.ownerId || null,
  tax_year: t.taxYear ?? null,
  tax_type: t.taxType || null,
  notes: t.notes || '',
  excluded: t.excluded ?? false,
  categorized: t.categorized ?? false,
  sf_tx_id: t.sfTxId || null,
});

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Missing SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_URL env var' });
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { data: setting } = await supabase
      .from('app_settings').select('value').eq('key', 'simplefin_url').maybeSingle();
    const sfAccessUrl = setting?.value;
    if (!sfAccessUrl) {
      return res.status(200).json({ skipped: true, reason: 'simplefin_url not configured' });
    }

    // SimpleFIN's Wells Fargo feed can lag more than a day or two behind actual
    // posting dates, so a narrow window can miss a transaction on the night it
    // posts and then age it out of range on every subsequent run. Dedup below is
    // keyed on sf_tx_id / date+description+amount+type, so re-checking a wider
    // window nightly is safe — nothing gets double-imported.
    const allAccounts = await fetchAccounts(sfAccessUrl, 14);

    if (allAccounts.length) {
      const balanceMap = {};
      for (const acct of allAccounts) {
        balanceMap[acct.id] = {
          id: acct.id, orgName: acct.org?.name || 'Unknown',
          accountName: acct.name, balance: Math.abs(parseFloat(acct.balance || 0)),
          fetchedAt: todayStr(),
        };
      }
      await supabase.from('app_settings').upsert(
        { key: 'simplefin_accounts', value: balanceMap, updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      );
      await supabase.from('app_settings').upsert(
        { key: 'mortgage_sync_date', value: todayStr(), updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      );
    }

    const accounts = allAccounts.filter(a =>
      (a.org?.name || '').toLowerCase().includes('wells fargo') &&
      !(a.name || '').toLowerCase().includes('credit')
    );
    const incoming = accounts.flatMap(acct =>
      (acct.transactions || []).map(tx => {
        const amount = parseFloat(tx.amount);
        return {
          id: randomUUID(),
          sfTxId: tx.id,
          date: new Date(tx.posted * 1000).toISOString().slice(0, 10),
          description: tx.description || tx.memo || 'Bank transaction',
          amount: Math.abs(amount),
          type: amount >= 0 ? 'Income' : 'Expense',
          category: '',
          notes: `SimpleFIN — ${acct.name}`,
        };
      })
    );

    let insertedCount = 0;
    if (incoming.length) {
      const { data: existing } = await supabase
        .from('transactions').select('sf_tx_id, date, description, amount, type');
      const existingIds  = new Set((existing || []).map(t => t.sf_tx_id).filter(Boolean));
      const existingKeys = new Set((existing || []).map(t => `${t.date}|${t.description}|${Number(t.amount)}|${t.type}`));
      const fresh = incoming.filter(tx =>
        !existingIds.has(tx.sfTxId) &&
        !existingKeys.has(`${tx.date}|${tx.description}|${Number(tx.amount)}|${tx.type}`)
      );

      if (fresh.length) {
        const { error } = await supabase.from('transactions').insert(fresh.map(txToDb));
        if (error) throw error;
        insertedCount = fresh.length;
      }
    }

    await supabase.from('app_settings').upsert(
      { key: 'auto_sync_date', value: todayStr(), updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    );

    return res.status(200).json({ ok: true, accountsChecked: accounts.length, transactionsImported: insertedCount });
  } catch (err) {
    return res.status(500).json({ error: err.message || String(err) });
  }
}
