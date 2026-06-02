import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useAppSetting(key, defaultValue) {
  const [value, setValue] = useState(defaultValue);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', key).maybeSingle()
      .then(({ data }) => {
        if (data?.value !== undefined && data.value !== null) setValue(data.value);
        setLoading(false);
      });
  }, [key]);

  const save = useCallback(async (newValueOrFn) => {
    const newValue = typeof newValueOrFn === 'function' ? newValueOrFn(value) : newValueOrFn;
    setValue(newValue);
    await supabase.from('app_settings')
      .upsert({ key, value: newValue, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  }, [key, value]);

  return [value, save, loading];
}
