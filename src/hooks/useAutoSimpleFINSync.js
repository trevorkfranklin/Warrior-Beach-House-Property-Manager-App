import { useEffect, useCallback } from 'react';
import { useAppSetting } from './useAppSetting';
import { supabase } from '../lib/supabase';
import { txToDb } from '../lib/db';

export function useAutoSimpleFINSync() {
  const [sfAccessUrl]               = useAppSetting('simplefin_url', '');
  const [lastSyncDate, setLastSyncDate] = useAppSetting('auto_sync_date', '');

  const todayStr = () => new Date().toISOString().slice(0, 10);

  const runSync = useCallback(async () => {
    if (!sfAccessUrl) return;
    try {
      const u    = new URL(sfAccessUrl);
      const auth = btoa(`${u.username}:${u.password}`);
      const base = `${u.protocol}//${u.host}${u.pathname}`;
      const since = new Date();
      since.setDate(since.getDate() - 2);
      const startTs = Math.floor(since.getTime() / 1000);
      const res = await fetch(`${base}/accounts?start-date=${startTs}`, {
        headers: { Authorization: `Basic ${auth}` },
      });
      if (!res.ok) return;
      const data     = await res.json();
      const accounts = (data.accounts || []).filter(a =>
        (a.org?.name || '').toLowerCase().includes('wells fargo') &&
        !(a.name    || '').toLowerCase().includes('credit')
      );
      const incoming = accounts.flatMap(acct =>
        (acct.transactions || []).map(tx => {
          const amount = parseFloat(tx.amount);
          return {
            id:          crypto.randomUUID(),
            sfTxId:      tx.id,
            date:        new Date(tx.posted * 1000).toISOString().slice(0, 10),
            description: tx.description || tx.memo || 'Bank transaction',
            amount:      Math.abs(amount),
            type:        amount >= 0 ? 'Income' : 'Expense',
            category:    '',
            notes:       `SimpleFIN — ${acct.name}`,
          };
        })
      );

      if (!incoming.length) { await setLastSyncDate(todayStr()); return; }

      // Deduplication: check existing sfTxId and description+amount+date+type keys
      const { data: existing } = await supabase
        .from('transactions').select('sf_tx_id, date, description, amount, type');
      const existingIds  = new Set((existing || []).map(t => t.sf_tx_id).filter(Boolean));
      const existingKeys = new Set((existing || []).map(t => `${t.date}|${t.description}|${Number(t.amount)}|${t.type}`));
      const fresh = incoming.filter(tx =>
        !existingIds.has(tx.sfTxId) &&
        !existingKeys.has(`${tx.date}|${tx.description}|${Number(tx.amount)}|${tx.type}`)
      );

      if (fresh.length) {
        await supabase.from('transactions').insert(fresh.map(txToDb));
      }
      await setLastSyncDate(todayStr());
    } catch { /* silent */ }
  }, [sfAccessUrl, setLastSyncDate]);

  useEffect(() => {
    if (!sfAccessUrl) return;
    if (lastSyncDate !== todayStr()) runSync();

    const interval = setInterval(() => {
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() === 0) runSync();
    }, 60_000);

    return () => clearInterval(interval);
  }, [sfAccessUrl]); // eslint-disable-line react-hooks/exhaustive-deps
}
