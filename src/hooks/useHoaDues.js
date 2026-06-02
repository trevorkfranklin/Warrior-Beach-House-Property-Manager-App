import { warmupPostgREST } from '../lib/warmup';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { dbToHoa, hoaToDb } from '../lib/db';

export function useHoaDues() {
  const [hoaDues, setHoaDues] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    await warmupPostgREST();
    const { data } = await supabase.from('hoa_dues').select('*').order('year', { ascending: false });
    setHoaDues((data || []).map(dbToHoa));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addHoaDue = useCallback(async (h) => {
    const { data, error } = await supabase.from('hoa_dues').insert(hoaToDb(h)).select().single();
    if (!error && data) setHoaDues(prev => [dbToHoa(data), ...prev]);
    return { error };
  }, []);

  const updateHoaDue = useCallback(async (h) => {
    const { data, error } = await supabase.from('hoa_dues').update(hoaToDb(h)).eq('id', h.id).select().single();
    if (!error && data) setHoaDues(prev => prev.map(x => x.id === h.id ? dbToHoa(data) : x));
    return { error };
  }, []);

  const deleteHoaDue = useCallback(async (id) => {
    const { error } = await supabase.from('hoa_dues').delete().eq('id', id);
    if (!error) setHoaDues(prev => prev.filter(h => h.id !== id));
    return { error };
  }, []);

  const bulkAddHoaDues = useCallback(async (items) => {
    if (!items.length) return { count: 0 };
    const { data, error } = await supabase.from('hoa_dues').insert(items.map(hoaToDb)).select();
    if (!error && data) setHoaDues(prev => [...data.map(dbToHoa), ...prev]);
    return { error, count: data?.length || 0 };
  }, []);

  return { hoaDues, loading, reload: load, addHoaDue, updateHoaDue, deleteHoaDue, bulkAddHoaDues };
}

