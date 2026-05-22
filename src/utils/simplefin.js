export async function fetchAccounts(accessUrl, daysBack = 1) {
  const u    = new URL(accessUrl);
  const auth = btoa(`${u.username}:${u.password}`);
  const base = `${u.protocol}//${u.host}${u.pathname}`;
  const since = new Date();
  since.setDate(since.getDate() - daysBack);
  const startTs = Math.floor(since.getTime() / 1000);
  const res = await fetch(`${base}/accounts?start-date=${startTs}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error(`SimpleFIN API error (${res.status})`);
  const data = await res.json();
  return data.accounts || [];
}
