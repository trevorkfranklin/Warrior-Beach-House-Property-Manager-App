export function txInMonth(tx, month) {
  return tx.date.startsWith(month);
}

export function txInYear(tx, year) {
  return tx.date.startsWith(String(year));
}

export function amountForMonth(tx, month) {
  return tx.date.startsWith(month) ? Number(tx.amount) : 0;
}

export function amountForYear(tx, year) {
  return tx.date.startsWith(String(year)) ? Number(tx.amount) : 0;
}
