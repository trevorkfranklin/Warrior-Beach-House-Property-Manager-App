import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { dbToTx, txToDb } from '../lib/db';
import { warmupPostgREST } from '../lib/warmup';

export function useTransactions() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    await warmupPostgREST();
    const { data } = await supabase.from('transactions').select('*').order('date', { ascending: false });
    setTransactions((data || []).map(dbToTx));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addTransaction = useCallback(async (tx) => {
    const { data, error } = await supabase.from('transactions').insert(txToDb(tx)).select().single();
    if (!error && data) setTransactions(prev => [dbToTx(data), ...prev]);
    return { error };
  }, []);

  const updateTransaction = useCallback(async (tx) => {
    const { data, error } = await supabase.from('transactions').update(txToDb(tx)).eq('id', tx.id).select().single();
    if (!error && data) setTransactions(prev => prev.map(t => t.id === tx.id ? dbToTx(data) : t));
    return { error };
  }, []);

  const deleteTransaction = useCallback(async (id) => {
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (!error) setTransactions(prev => prev.filter(t => t.id !== id));
    return { error };
  }, []);

  const bulkAddTransactions = useCallback(async (txs) => {
    if (!txs.length) return { count: 0 };
    const { data, error } = await supabase.from('transactions').insert(txs.map(txToDb)).select();
    if (!error && data) setTransactions(prev => [...data.map(dbToTx), ...prev]);
    return { error, count: data?.length || 0 };
  }, []);

  // Used by SimpleFIN sync — deduplicates against DB before inserting
  const syncSimpleFINTransactions = useCallback(async (incoming) => {
    if (!incoming.length) return { count: 0 };
    const { data: existing } = await supabase
      .from('transactions').select('sf_tx_id, date, description, amount, type');
    const existingIds  = new Set((existing || []).map(t => t.sf_tx_id).filter(Boolean));
    const existingKeys = new Set((existing || []).map(t => `${t.date}|${t.description}|${Number(t.amount)}|${t.type}`));
    const fresh = incoming.filter(tx =>
      !existingIds.has(tx.sfTxId) &&
      !existingKeys.has(`${tx.date}|${tx.description}|${Number(tx.amount)}|${tx.type}`)
    );
    if (!fresh.length) return { count: 0 };
    return await bulkAddTransactions(fresh);
  }, [bulkAddTransactions]);

  const updateTransactionCategory = useCallback(async (id, category) => {
    const { data, error } = await supabase.from('transactions')
      .update({ category, categorized: true }).eq('id', id).select().single();
    if (!error && data) setTransactions(prev => prev.map(t => t.id === id ? dbToTx(data) : t));
    return { error };
  }, []);

  const toggleExclude = useCallback(async (id) => {
    const tx = transactions.find(t => t.id === id);
    if (!tx) return;
    const { data, error } = await supabase.from('transactions')
      .update({ excluded: !tx.excluded }).eq('id', id).select().single();
    if (!error && data) setTransactions(prev => prev.map(t => t.id === id ? dbToTx(data) : t));
    return { error };
  }, [transactions]);

  const bulkUpdateCategories = useCallback(async (suggestions) => {
    const updates = suggestions.map(s =>
      supabase.from('transactions').update({ category: s.category, categorized: true }).eq('id', s.id).select().single()
    );
    const results = await Promise.all(updates);
    const updated = results.filter(r => !r.error && r.data).map(r => dbToTx(r.data));
    if (updated.length) {
      setTransactions(prev => prev.map(t => {
        const u = updated.find(u => u.id === t.id);
        return u || t;
      }));
    }
    return { count: updated.length };
  }, []);

  return {
    transactions, loading, reload: load,
    addTransaction, updateTransaction, deleteTransaction,
    bulkAddTransactions, syncSimpleFINTransactions,
    updateTransactionCategory, toggleExclude, bulkUpdateCategories,
  };
}
