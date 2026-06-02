import { warmupPostgREST } from '../lib/warmup';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { dbToOwner, ownerToDb } from '../lib/db';

export function useOwners() {
  const [owners, setOwners] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    await warmupPostgREST();
    const { data } = await supabase.from('owners').select('*').order('created_at');
    setOwners((data || []).map(dbToOwner));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addOwner = useCallback(async (o) => {
    const { data, error } = await supabase.from('owners').insert(ownerToDb(o)).select().single();
    if (!error && data) setOwners(prev => [...prev, dbToOwner(data)]);
    return { error };
  }, []);

  const updateOwner = useCallback(async (o) => {
    const { data, error } = await supabase.from('owners').update(ownerToDb(o)).eq('id', o.id).select().single();
    if (!error && data) setOwners(prev => prev.map(x => x.id === o.id ? dbToOwner(data) : x));
    return { error };
  }, []);

  const deleteOwner = useCallback(async (id) => {
    const { error } = await supabase.from('owners').delete().eq('id', id);
    if (!error) setOwners(prev => prev.filter(o => o.id !== id));
    return { error };
  }, []);

  const bulkAddOwners = useCallback(async (items) => {
    if (!items.length) return { count: 0 };
    const { data, error } = await supabase.from('owners').insert(items.map(ownerToDb)).select();
    if (!error && data) setOwners(prev => [...prev, ...data.map(dbToOwner)]);
    return { error, count: data?.length || 0 };
  }, []);

  return { owners, loading, reload: load, addOwner, updateOwner, deleteOwner, bulkAddOwners };
}

