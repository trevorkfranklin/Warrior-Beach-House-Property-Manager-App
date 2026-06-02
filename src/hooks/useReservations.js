import { warmupPostgREST } from '../lib/warmup';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { dbToRes, resToDb } from '../lib/db';

export function useReservations() {
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    await warmupPostgREST();
    const { data } = await supabase.from('reservations').select('*').order('check_in', { ascending: false });
    setReservations((data || []).map(dbToRes));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addReservation = useCallback(async (r) => {
    const { data, error } = await supabase.from('reservations').insert(resToDb(r)).select().single();
    if (!error && data) setReservations(prev => [dbToRes(data), ...prev]);
    return { error };
  }, []);

  const updateReservation = useCallback(async (r) => {
    const { data, error } = await supabase.from('reservations').update(resToDb(r)).eq('id', r.id).select().single();
    if (!error && data) setReservations(prev => prev.map(x => x.id === r.id ? dbToRes(data) : x));
    return { error };
  }, []);

  const deleteReservation = useCallback(async (id) => {
    const { error } = await supabase.from('reservations').delete().eq('id', id);
    if (!error) setReservations(prev => prev.filter(r => r.id !== id));
    return { error };
  }, []);

  const bulkAddReservations = useCallback(async (items) => {
    if (!items.length) return { count: 0 };
    const { data, error } = await supabase.from('reservations').insert(items.map(resToDb)).select();
    if (!error && data) setReservations(prev => [...data.map(dbToRes), ...prev]);
    return { error, count: data?.length || 0 };
  }, []);

  return { reservations, loading, reload: load, addReservation, updateReservation, deleteReservation, bulkAddReservations };
}

