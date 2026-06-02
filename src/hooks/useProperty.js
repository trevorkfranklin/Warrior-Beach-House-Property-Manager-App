import { warmupPostgREST } from '../lib/warmup';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { dbToProp, propToDb } from '../lib/db';
import { defaultProperty } from '../data/sampleData';

export function useProperty() {
  const [property, setProperty] = useState(defaultProperty);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    await warmupPostgREST();
    const { data } = await supabase.from('property').select('*').eq('id', 'main').maybeSingle();
    if (data) setProperty(dbToProp(data));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveProperty = useCallback(async (p) => {
    const row = propToDb(p);
    const { data, error } = await supabase.from('property')
      .upsert(row, { onConflict: 'id' }).select().single();
    if (!error && data) setProperty(dbToProp(data));
    return { error };
  }, []);

  return { property, loading, saveProperty };
}

