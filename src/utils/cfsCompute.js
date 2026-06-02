export const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export const PROTECTION_PER_NIGHT = 8.54;
export const OWNER_CLEANING_FEE = 122;
export const MIN_BALANCE = 1000;
export const RESERVE_TARGET = 500;

export const EXPENSE_ITEMS = [
  { key: 'mortgage',           label: 'Mortgage' },
  { key: 'cableInternet',      label: 'Cable/Internet' },
  { key: 'electricity',        label: 'Electricity' },
  { key: 'waterTrash',         label: 'Water/Trash' },
  { key: 'windstormInsurance', label: 'Insurance' },
];

/**
 * Compute per-owner CFS breakdown for a given month.
 *
 * targetMonthStr  — the month being estimated, e.g. "2026-06"
 * useActualIncome — false → projected income from prior-month reservations
 *                   true  → actual income from transactions in targetMonth
 */
export function computeMonthCFS(targetMonthStr, useActualIncome, {
  transactions, reservations, owners, budgets, extraExpenses,
  monthly, monthItems, hoaDues, endBals, ownerReserveStarts,
}) {
  const [targetYear, targetMonthNum] = targetMonthStr.split('-').map(Number);
  const targetMonthIdx = targetMonthNum - 1;

  const priorMonthDate = new Date(targetYear, targetMonthIdx - 1, 1);
  const priorMonthStr  = `${priorMonthDate.getFullYear()}-${String(priorMonthDate.getMonth() + 1).padStart(2, '0')}`;

  // Income
  let income = 0;
  if (useActualIncome) {
    income = transactions
      .filter(t => !t.excluded && t.type === 'Income' && t.category !== 'Cash Flow Support' && t.date?.startsWith(targetMonthStr))
      .reduce((s, t) => s + Number(t.amount), 0);
  } else {
    for (const r of reservations) {
      if (r.status === 'Cancelled' || !r.checkIn) continue;
      if (r.checkIn.slice(0, 7) !== priorMonthStr) continue;
      const protection = r.isOwnerHold ? 0 : Number(r.nights || 0) * PROTECTION_PER_NIGHT;
      income += Number(r.netRent || 0) - protection;
    }
  }

  // Expenses
  const expenseAmounts = {};
  let fixedTotal = 0;
  for (const item of EXPENSE_ITEMS) {
    const val = Number(monthly[targetMonthStr]?.[item.key] ?? budgets[item.key] ?? 0);
    expenseAmounts[item.key] = val;
    fixedTotal += val;
  }

  const extraAmounts = (extraExpenses || []).map(e => ({
    label: e.label,
    amount: Number(monthly[targetMonthStr]?.[e.id] ?? e.amount ?? 0),
  }));
  const extraTotal = extraAmounts.reduce((s, e) => s + e.amount, 0);
  const otherTotal  = (monthItems[targetMonthStr] || []).reduce((s, i) => s + Number(i.amount || 0), 0);

  // HOA dues
  const hoaPaid = new Map();
  transactions.filter(tx => tx.category === 'HOA Fees' && !tx.excluded).forEach(tx => {
    const year = tx.taxYear || new Date(tx.date).getFullYear();
    hoaPaid.set(String(year), (hoaPaid.get(String(year)) || 0) + Number(tx.amount));
  });
  let hoaDue = 0;
  for (const r of hoaDues) {
    if (!r.dueDate || !r.annualAmount) continue;
    if (r.dueDate.slice(0, 7) !== targetMonthStr) continue;
    hoaDue += Math.max(Number(r.annualAmount) - (hoaPaid.get(String(r.year)) || 0), 0);
  }

  const totalExpenses = fixedTotal + extraTotal + otherTotal + hoaDue;
  const net = income - totalExpenses;

  const allOwnersHaveReserves = owners.length > 0 && owners.every(o => ownerReserveStarts[o.id] != null);

  // Cleaning fees from prior-month owner holds
  const cleaning = {};
  for (const owner of owners) {
    const holdCount = reservations.filter(r =>
      r.isOwnerHold && r.ownerId === owner.id && r.status !== 'Cancelled' &&
      r.checkIn?.startsWith(priorMonthStr)
    ).length;
    cleaning[owner.id] = holdCount * OWNER_CLEANING_FEE;
  }
  const totalCleaning = Object.values(cleaning).reduce((s, v) => s + v, 0);

  const buildExpenseLines = (pct) => {
    const lines = [];
    for (const item of EXPENSE_ITEMS) {
      const amt = expenseAmounts[item.key] * pct;
      if (amt > 0) lines.push({ label: item.label, amount: amt });
    }
    if (hoaDue > 0) lines.push({ label: 'HOA Dues', amount: hoaDue * pct });
    for (const e of extraAmounts) {
      if (e.amount > 0) lines.push({ label: e.label, amount: e.amount * pct });
    }
    if (otherTotal > 0) lines.push({ label: 'Other', amount: otherTotal * pct });
    return lines;
  };

  const shares = {};
  const ownerBreakdowns = [];

  if (allOwnersHaveReserves) {
    const adjustedNet = net + totalCleaning;
    for (const owner of owners) {
      const pct          = (owner.ownershipPercent || 0) / 100;
      const startReserve = Number(ownerReserveStarts[owner.id]);
      const ownCleaning  = cleaning[owner.id] || 0;
      const cleaningPoolCredit = totalCleaning * pct;
      const netShare   = adjustedNet * pct - ownCleaning;
      const preReserve = startReserve + netShare;
      const cfsNeeded  = Math.max(0, RESERVE_TARGET - preReserve);
      const postReserve = cfsNeeded > 0 ? RESERVE_TARGET : preReserve;
      shares[owner.id] = cfsNeeded;
      ownerBreakdowns.push({
        ownerId: owner.id,
        name: owner.name,
        email: owner.email || '',
        pct: owner.ownershipPercent || 0,
        startReserve,
        incomeShare: income * pct,
        expenseLines: buildExpenseLines(pct),
        cleaningPoolCredit,
        cleaningFee: ownCleaning,
        netShare,
        preReserve,
        postReserve,
        cfsNeeded,
      });
    }
  } else {
    const startBalance  = endBals[targetMonthStr] != null ? Number(endBals[targetMonthStr]) : MIN_BALANCE;
    const supportNeeded = Math.max(0, MIN_BALANCE - (startBalance + net));
    const N = owners.length;
    if (N > 0) {
      for (const owner of owners) {
        const ownCleaning = cleaning[owner.id] || 0;
        let share;
        if (totalCleaning <= supportNeeded) {
          share = (supportNeeded - totalCleaning) / N + ownCleaning;
        } else if (totalCleaning > 0) {
          share = (ownCleaning / totalCleaning) * supportNeeded;
        } else {
          share = supportNeeded / N;
        }
        shares[owner.id] = share;
        const pct = (owner.ownershipPercent || 0) / 100;
        ownerBreakdowns.push({
          ownerId: owner.id,
          name: owner.name,
          pct: owner.ownershipPercent || 0,
          startReserve: null,
          incomeShare: income * pct,
          expenseLines: buildExpenseLines(pct),
          cleaningPoolCredit: 0,
          cleaningFee: ownCleaning,
          netShare: null,
          preReserve: null,
          postReserve: null,
          cfsNeeded: share,
        });
      }
    }
    return {
      targetMonthStr, priorMonthStr,
      monthLabel: `${MONTHS[targetMonthIdx]} ${targetYear}`,
      income, totalExpenses, net,
      supportNeeded,
      shares, cleaning, ownerBreakdowns,
      allOwnersHaveReserves: false,
    };
  }

  const supportNeeded = Object.values(shares).reduce((s, v) => s + v, 0);
  return {
    targetMonthStr, priorMonthStr,
    monthLabel: `${MONTHS[targetMonthIdx]} ${targetYear}`,
    income, totalExpenses, net,
    supportNeeded,
    shares, cleaning, ownerBreakdowns,
    allOwnersHaveReserves,
  };
}
