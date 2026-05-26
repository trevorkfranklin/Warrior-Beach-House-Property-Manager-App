import { useEffect, useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';

// Runs a background Wells Fargo checking-only SimpleFIN sync.
// On mount: syncs immediately if not yet synced today.
// On timer: syncs at midnight (00:00) each night while the app is open.
export function useAutoSimpleFINSync() {
  const [sfAccessUrl]               = useLocalStorage('wbh_simplefin_url', '');
  const [, setTransactions]         = useLocalStorage('wbh_transactions', []);
  const [lastSyncDate, setLastSyncDate] = useLocalStorage('wbh_auto_sync_date', '');

  const todayStr = () => new Date().toISOString().slice(0, 10);

  const runSync = useCallback(async () => {
    if (!sfAccessUrl) return;
    try {
      const u    = new URL(sfAccessUrl);
      const auth = btoa(`${u.username}:${u.password}`);
      const base = `${u.protocol}//${u.host}${u.pathname}`;
      // Look back 2 days to catch any late-posted transactions
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
      setTransactions(prev => {
        const existingIds  = new Set(prev.filter(t => t.sfTxId).map(t => t.sfTxId));
        const existingKeys = new Set(prev.map(t => `${t.date}|${t.description}|${Number(t.amount)}|${t.type}`));
        const fresh = incoming.filter(tx =>
          !existingIds.has(tx.sfTxId) &&
          !existingKeys.has(`${tx.date}|${tx.description}|${Number(tx.amount)}|${tx.type}`)
        );
        return fresh.length ? [...prev, ...fresh] : prev;
      });
      setLastSyncDate(todayStr());
    } catch { /* silent — will retry at next midnight or app open */ }
  }, [sfAccessUrl, setTransactions, setLastSyncDate]);

  useEffect(() => {
    if (!sfAccessUrl) return;

    // Sync on startup if we haven't synced today
    if (lastSyncDate !== todayStr()) runSync();

    // Check every 60s; fire sync at midnight (00:00)
    const interval = setInterval(() => {
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() === 0) runSync();
    }, 60_000);

    return () => clearInterval(interval);
  }, [sfAccessUrl]); // eslint-disable-line react-hooks/exhaustive-deps
}
