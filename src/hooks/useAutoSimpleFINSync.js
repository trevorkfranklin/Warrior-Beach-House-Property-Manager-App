import { useEffect, useCallback } from 'react';
import { useAppSetting } from './useAppSetting';
import { supabase } from '../lib/supabase';
import { txToDb } from '../lib/db';
import { fetchAccounts } from '../utils/simplefin';

export function useAutoSimpleFINSync() {
  const [sfAccessUrl]               = useAppSetting('simplefin_url', '');
  const [lastSyncDate, setLastSyncDate] = useAppSetting('auto_sync_date', '');
  const [, setSfAccounts]           = useAppSetting('simplefin_accounts', {});
  const [, setMortgageSyncDate]     = useAppSetting('mortgage_sync_date', '');

  const todayStr = () => new Date().toISOString().slice(0, 10);

  const runSync = useCallback(async () => {
    if (!sfAccessUrl) return;
    try {
      const allAccounts = await fetchAccounts(sfAccessUrl, 2);

      // Refresh cached balances for every account — this is what drives the
      // "Current Balance" / "Starting Balance" cards, which otherwise only
      // update when someone manually clicks "Sync Balances" on the Property page.
      if (allAccounts.length) {
        const balanceMap = {};
        for (const acct of allAccounts) {
          balanceMap[acct.id] = {
            id: acct.id, orgName: acct.org?.name || 'Unknown',
            accountName: acct.name, balance: Math.abs(parseFloat(acct.balance || 0)),
            fetchedAt: todayStr(),
          };
        }
        await setSfAccounts(balanceMap);
        await setMortgageSyncDate(todayStr());
      }

      const accounts = allAccounts.filter(a =>
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
