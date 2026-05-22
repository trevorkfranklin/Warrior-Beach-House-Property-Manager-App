const API_KEY = import.meta.env.VITE_RENTCAST_API_KEY;
const BASE = 'https://api.rentcast.io/v1';

async function get(path, address) {
  const res = await fetch(`${BASE}${path}?address=${encodeURIComponent(address)}`, {
    headers: { 'X-Api-Key': API_KEY },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`RentCast ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function fetchPropertyEstimates(address) {
  const [valueRes] = await Promise.allSettled([
    get('/avm/value', address),
  ]);

  return {
    estimatedValue: valueRes.status === 'fulfilled' ? valueRes.value?.price         ?? null : null,
    valueLow:       valueRes.status === 'fulfilled' ? valueRes.value?.priceRangeLow ?? null : null,
    valueHigh:      valueRes.status === 'fulfilled' ? valueRes.value?.priceRangeHigh ?? null : null,
    error:  valueRes.status === 'rejected' ? valueRes.reason?.message : null,
    fetchedAt: new Date().toISOString().slice(0, 10),
  };
}
