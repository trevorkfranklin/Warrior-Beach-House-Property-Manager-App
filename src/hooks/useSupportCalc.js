import { useMemo } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { sampleTransactions, samplePropertyTaxes, sampleHOADues, sampleReservations } from '../data/sampleData';
import { txInMonth, amountForMonth } from '../utils/transactions';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MIN_BALANCE = 1000;
const PROTECTION_PER_NIGHT = 8.54;
const DEFAULT_BUDGETS = { mortgage: 0, cableInternet: 0, electricity: 0, waterTrash: 0, windstormInsurance: 0 };
const EXPENSE_KEYS = Object.keys(DEFAULT_BUDGETS);

export function useSupportCalc() {
  const [transactions]       = useLocalStorage('wbh_transactions', sampleTransactions);
  const [taxRecords]         = useLocalStorage('wbh_property_taxes', samplePropertyTaxes);
  const [hoaRecords]         = useLocalStorage('wbh_hoa_dues', sampleHOADues);
  const [reservations]       = useLocalStorage('wbh_reservations', sampleReservations);
  const [endBals]            = useLocalStorage('wbh_cashflow_end_bals', {});
  const [cashflowBudgets]    = useLocalStorage('wbh_cashflow_budgets', DEFAULT_BUDGETS);
  const [cashflowExtra]      = useLocalStorage('wbh_cashflow_extra', []);
  const [cashflowMonthly]    = useLocalStorage('wbh_cashflow_monthly', {});
  const [cashflowMonthItems] = useLocalStorage('wbh_cashflow_month_items', {});

  const currentYear     = new Date().getFullYear();
  const currentMonthIdx = new Date().getMonth();
  const currentMonthStr = `${currentYear}-${String(currentMonthIdx + 1).padStart(2, '0')}`;
  const currentEndBal   = endBals[currentMonthStr] != null ? Number(endBals[currentMonthStr]) : MIN_BALANCE;

  const chartSlots = useMemo(() => Array.from({ length: 12 }, (_, i) => ({
    label: MONTHS[i],
    month: `${currentYear}-${String(i + 1).padStart(2, '0')}`,
    isPast: i < currentMonthIdx,
    isCurrent: i === currentMonthIdx,
    projected: i > currentMonthIdx,
  })), [currentYear, currentMonthIdx]);

  const incomeByPayMonth = useMemo(() => {
    const map = {};
    for (const r of reservations) {
      if (r.status === 'Cancelled' || !r.checkIn) continue;
      const [yr, mo] = r.checkIn.slice(0, 7).split('-').map(Number);
      const payYr = mo === 12 ? yr + 1 : yr;
      const payMo = mo === 12 ? 1 : mo + 1;
      const pay = `${payYr}-${String(payMo).padStart(2, '0')}`;
      const protection = r.isOwnerHold ? 0 : Number(r.nights || 0) * PROTECTION_PER_NIGHT;
      map[pay] = (map[pay] || 0) + Number(r.netRent || 0) - protection;
    }
    return map;
  }, [reservations]);

  const taxByMonth = useMemo(() => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const paid = new Map();
    transactions.filter(tx => tx.category === 'Property Tax' && tx.taxYear && !tx.excluded)
      .forEach(tx => {
        const key = `${tx.taxYear}|${tx.taxType || ''}`;
        paid.set(key, (paid.get(key) || 0) + Number(tx.amount));
      });
    const map = new Map();
    for (const r of taxRecords) {
      if (!r.dueDate || !r.annualAmount) continue;
      if (r.dueDate.slice(0, 7) < currentMonth) continue;
      const key = `${r.taxYear}|${r.taxType || ''}`;
      const balance = Math.max(Number(r.annualAmount) - (paid.get(key) || 0), 0);
      if (balance <= 0) continue;
      const month = r.dueDate.slice(0, 7);
      map.set(month, (map.get(month) || 0) + balance);
    }
    return map;
  }, [taxRecords, transactions]);

  const hoaByMonth = useMemo(() => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const paid = new Map();
    transactions.filter(tx => tx.category === 'HOA Fees' && !tx.excluded)
      .forEach(tx => {
        const year = tx.taxYear || new Date(tx.date).getFullYear();
        paid.set(String(year), (paid.get(String(year)) || 0) + Number(tx.amount));
      });
    const map = new Map();
    for (const r of hoaRecords) {
      if (!r.dueDate || !r.annualAmount) continue;
      if (r.dueDate.slice(0, 7) < currentMonth) continue;
      const balance = Math.max(Number(r.annualAmount) - (paid.get(String(r.year)) || 0), 0);
      if (balance <= 0) continue;
      map.set(r.dueDate.slice(0, 7), (map.get(r.dueDate.slice(0, 7)) || 0) + balance);
    }
    return map;
  }, [hoaRecords, transactions]);

  const monthData = useMemo(() => chartSlots.map(({ label, month, isPast, isCurrent }) => {
    const txs = transactions.filter(t => !t.excluded && txInMonth(t, month));
    const actualIncome  = txs.filter(t => t.type === 'Income'  && t.category !== 'Cash Flow Support').reduce((s, t) => s + amountForMonth(t, month), 0);
    const actualExpense = txs.filter(t => t.type === 'Expense' && t.category !== 'Cash Flow Support').reduce((s, t) => s + amountForMonth(t, month), 0);
    const taxDue = (taxByMonth.get(month) || 0) + (hoaByMonth.get(month) || 0);

    let projExpense;
    if (isPast || isCurrent) {
      projExpense = actualExpense;
    } else {
      const fixedTotal = EXPENSE_KEYS.reduce((s, key) => s + (cashflowMonthly[month]?.[key] ?? cashflowBudgets[key] ?? 0), 0);
      const extraTotal = cashflowExtra.reduce((s, e) => s + (cashflowMonthly[month]?.[e.id] ?? Number(e.amount || 0)), 0);
      const otherTotal = (cashflowMonthItems[month] || []).reduce((s, i) => s + Number(i.amount || 0), 0);
      projExpense = fixedTotal + extraTotal + otherTotal;
    }

    const cashFlowSupport = (isPast || isCurrent)
      ? txs.filter(t => t.category === 'Cash Flow Support').reduce((s, t) => s + amountForMonth(t, month), 0)
      : 0;

    const income  = isPast || isCurrent ? actualIncome : (incomeByPayMonth[month] || 0);
    const expense = projExpense + (isPast ? 0 : taxDue);
    return { label, month, income, expense, cashFlowSupport, taxDue: isPast ? 0 : taxDue, net: income - expense, projected: !isPast && !isCurrent, isCurrent };
  }), [chartSlots, transactions, incomeByPayMonth, taxByMonth, hoaByMonth, cashflowBudgets, cashflowExtra, cashflowMonthly, cashflowMonthItems]);

  const supportCalc = useMemo(() => {
    const items = [];
    let balance = null;
    for (let i = 0; i < monthData.length; i++) {
      const m = monthData[i];
      if (balance === null) {
        if (m.isCurrent) {
          balance = currentEndBal;
          items.push({ supportNeeded: 0, endBalance: currentEndBal });
        } else {
          items.push({ supportNeeded: null, endBalance: null });
        }
      } else {
        const natural       = balance + m.net + m.cashFlowSupport;
        const supportNeeded = m.projected ? Math.max(0, MIN_BALANCE - natural) : 0;
        balance = supportNeeded > 0 ? MIN_BALANCE : natural;
        items.push({ supportNeeded, endBalance: balance });
      }
    }
    return items;
  }, [currentEndBal, monthData]);

  // Total actual CFS deposited (all owners) per past/current month
  const cfsActualByMonth = useMemo(() => {
    const map = {};
    for (const slot of chartSlots) {
      if (slot.projected) continue;
      const total = transactions
        .filter(t => !t.excluded && t.category === 'Cash Flow Support' && txInMonth(t, slot.month))
        .reduce((s, t) => s + Number(t.amount), 0);
      if (total > 0) map[slot.month] = total;
    }
    return map;
  }, [chartSlots, transactions]);

  const totalSupportNeeded = supportCalc.reduce((s, m) => s + (m.supportNeeded || 0), 0);

  return { chartSlots, monthData, supportCalc, totalSupportNeeded, cfsActualByMonth };
}
