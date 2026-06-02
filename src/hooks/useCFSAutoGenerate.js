import { useEffect } from 'react';
import { useAppSetting } from './useAppSetting';
import { useTransactions } from './useTransactions';
import { useReservations } from './useReservations';
import { useOwners } from './useOwners';
import { useHoaDues } from './useHoaDues';
import { useNotifications } from './useNotifications';
import { computeMonthCFS, MONTHS } from '../utils/cfsCompute';
import { sendCFSEmail } from '../utils/sendCFSEmail';

export function useCFSAutoGenerate() {
  const { transactions }         = useTransactions();
  const { reservations }         = useReservations();
  const { owners }               = useOwners();
  const { hoaDues }              = useHoaDues();
  const { bulkUpsertNotifications } = useNotifications();
  const [budgets]            = useAppSetting('cashflow_budgets', {});
  const [extraExpenses]      = useAppSetting('cashflow_extra', []);
  const [monthly]            = useAppSetting('cashflow_monthly', {});
  const [monthItems]         = useAppSetting('cashflow_month_items', {});
  const [endBals]            = useAppSetting('cashflow_end_bals', {});
  const [ownerReserveStarts] = useAppSetting('owner_reserve_starts', {});
  const [autoSent, setAutoSent] = useAppSetting('cfs_auto_sent', {});
  const [emailSettings]         = useAppSetting('email_settings', { enabled: false, serviceId: '', templateId: '', publicKey: '' });

  useEffect(() => {
    if (owners.length === 0) return;

    const today = new Date();
    const year     = today.getFullYear();
    const monthNum = today.getMonth() + 1;
    const currentMonthStr = `${year}-${String(monthNum).padStart(2, '0')}`;
    const monthLabel = `${MONTHS[monthNum - 1]} ${year}`;

    const monthSent = autoSent[currentMonthStr] || {};

    const actualIncomeTxs = transactions.filter(t =>
      !t.excluded &&
      t.type === 'Income' &&
      t.category !== 'Cash Flow Support' &&
      t.date?.startsWith(currentMonthStr)
    );
    const hasActualIncome = actualIncomeTxs.length > 0;

    const needsInitial = !monthSent.initial;
    const needsUpdated = hasActualIncome && !monthSent.updated;

    if (!needsInitial && !needsUpdated) return;

    const computeArgs = {
      transactions, reservations, owners, budgets, extraExpenses,
      monthly, monthItems, hoaDues, endBals, ownerReserveStarts,
    };

    const now      = new Date().toISOString();
    const newNotes = [];

    const buildNotes = (proj, subtype) => {
      const subtitle  = subtype === 'initial' ? 'Initial Estimate' : 'Updated Estimate';
      const incomeNote = subtype === 'updated'
        ? ` — actual income: $${Math.round(proj.income).toLocaleString()}`
        : '';

      if (proj.supportNeeded > 0 && owners.length > 0) {
        for (const bd of proj.ownerBreakdowns) {
          if (bd.cfsNeeded <= 0) continue;
          newNotes.push({
            id: `cfs-auto-${subtype}-${bd.ownerId}-${proj.targetMonthStr}-${Date.now()}`,
            type: 'warning',
            title: `CFS ${subtitle} — ${monthLabel}`,
            body: `${bd.name}: $${Math.round(bd.cfsNeeded).toLocaleString()} due${incomeNote}`,
            ownerBreakdown: bd,
            month: proj.targetMonthStr,
            subtype,
            createdAt: now,
            dismissed: false,
            manual: true,
          });
        }
      } else {
        newNotes.push({
          id: `cfs-auto-${subtype}-none-${proj.targetMonthStr}-${Date.now()}`,
          type: 'success',
          title: `CFS ${subtitle} — ${monthLabel}`,
          body: `No support needed${incomeNote}`,
          month: proj.targetMonthStr,
          subtype,
          createdAt: now,
          dismissed: false,
          manual: true,
        });
      }
    };

    if (needsInitial) buildNotes(computeMonthCFS(currentMonthStr, false, computeArgs), 'initial');
    if (needsUpdated) buildNotes(computeMonthCFS(currentMonthStr, true, computeArgs), 'updated');

    if (newNotes.length === 0) return;

    if (emailSettings.enabled && emailSettings.serviceId && emailSettings.templateId && emailSettings.publicKey) {
      for (const note of newNotes) {
        if (note.ownerBreakdown) {
          const estimateType = note.subtype === 'initial' ? 'Initial Estimate' : 'Updated Estimate';
          sendCFSEmail({ bd: note.ownerBreakdown, monthLabel, estimateType, emailSettings }).catch(console.error);
        }
      }
    }

    bulkUpsertNotifications(newNotes);

    setAutoSent(prev => ({
      ...prev,
      [currentMonthStr]: {
        ...(prev[currentMonthStr] || {}),
        ...(needsInitial && { initial: true }),
        ...(needsUpdated && { updated: true }),
      },
    }));
  }, [transactions, autoSent]); // eslint-disable-line react-hooks/exhaustive-deps
}
