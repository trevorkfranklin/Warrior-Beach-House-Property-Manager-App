import { warmupPostgREST } from '../lib/warmup';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { dbToNotif, notifToDb } from '../lib/db';

export function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    await warmupPostgREST();
    const { data } = await supabase.from('notifications').select('*').order('created_at', { ascending: false });
    setNotifications((data || []).map(dbToNotif));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addNotification = useCallback(async (n) => {
    const { data, error } = await supabase.from('notifications').insert(notifToDb(n)).select().single();
    if (!error && data) setNotifications(prev => [dbToNotif(data), ...prev]);
    return { error };
  }, []);

  const updateNotification = useCallback(async (n) => {
    const { data, error } = await supabase.from('notifications').update(notifToDb(n)).eq('id', n.id).select().single();
    if (!error && data) setNotifications(prev => prev.map(x => x.id === n.id ? dbToNotif(data) : x));
    return { error };
  }, []);

  const deleteNotification = useCallback(async (id) => {
    const { error } = await supabase.from('notifications').delete().eq('id', id);
    if (!error) setNotifications(prev => prev.filter(n => n.id !== id));
    return { error };
  }, []);

  const dismissNotification = useCallback(async (id) => {
    const { data, error } = await supabase.from('notifications')
      .update({ dismissed: true }).eq('id', id).select().single();
    if (!error && data) setNotifications(prev => prev.map(n => n.id === id ? dbToNotif(data) : n));
    return { error };
  }, []);

  const bulkUpsertNotifications = useCallback(async (items) => {
    if (!items.length) return { count: 0 };
    const { data, error } = await supabase.from('notifications')
      .upsert(items.map(notifToDb), { onConflict: 'id' }).select();
    if (!error && data) {
      const upserted = data.map(dbToNotif);
      setNotifications(prev => {
        const map = new Map(prev.map(n => [n.id, n]));
        upserted.forEach(n => map.set(n.id, n));
        return [...map.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      });
    }
    return { error, count: data?.length || 0 };
  }, []);

  return { notifications, loading, reload: load, addNotification, updateNotification, deleteNotification, dismissNotification, bulkUpsertNotifications };
}

