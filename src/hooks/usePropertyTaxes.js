import { warmupPostgREST } from '../lib/warmup';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { dbToTax, taxToDb } from '../lib/db';

export function usePropertyTaxes() {
  const [propertyTaxes, setPropertyTaxes] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    await warmupPostgREST();
    const { data } = await supabase.from('property_taxes').select('*').order('tax_year', { ascending: false });
    setPropertyTaxes((data || []).map(dbToTax));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addPropertyTax = useCallback(async (t) => {
    const { data, error } = await supabase.from('property_taxes').insert(taxToDb(t)).select().single();
    if (!error && data) setPropertyTaxes(prev => [dbToTax(data), ...prev]);
    return { error };
  }, []);

  const updatePropertyTax = useCallback(async (t) => {
    const { data, error } = await supabase.from('property_taxes').update(taxToDb(t)).eq('id', t.id).select().single();
    if (!error && data) setPropertyTaxes(prev => prev.map(x => x.id === t.id ? dbToTax(data) : x));
    return { error };
  }, []);

  const deletePropertyTax = useCallback(async (id) => {
    const { error } = await supabase.from('property_taxes').delete().eq('id', id);
    if (!error) setPropertyTaxes(prev => prev.filter(t => t.id !== id));
    return { error };
  }, []);

  const bulkAddPropertyTaxes = useCallback(async (items) => {
    if (!items.length) return { count: 0 };
    const { data, error } = await supabase.from('property_taxes').insert(items.map(taxToDb)).select();
    if (!error && data) setPropertyTaxes(prev => [...data.map(dbToTax), ...prev]);
    return { error, count: data?.length || 0 };
  }, []);

  return { propertyTaxes, loading, reload: load, addPropertyTax, updatePropertyTax, deletePropertyTax, bulkAddPropertyTaxes };
}

