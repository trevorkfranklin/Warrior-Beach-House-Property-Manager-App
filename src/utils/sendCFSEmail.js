import emailjs from '@emailjs/browser';

const fmt = (n) => '$' + Math.round(Math.abs(n)).toLocaleString('en-US');

export async function sendCFSEmail({ bd, monthLabel, estimateType, emailSettings }) {
  const { serviceId, templateId, publicKey } = emailSettings;

  if (!bd.email || !serviceId || !templateId || !publicKey) return;

  const expenseBreakdown = bd.expenseLines
    .map(l => `${l.label}: -${fmt(l.amount)}`)
    .join('\n');

  const cleaningLines = [
    bd.cleaningPoolCredit > 0 ? `Cleaning pool credit: +${fmt(bd.cleaningPoolCredit)}` : '',
    bd.cleaningFee > 0       ? `Cleaning fee: -${fmt(bd.cleaningFee)}`                 : '',
  ].filter(Boolean).join('\n');

  await emailjs.send(serviceId, templateId, {
    to_email:            bd.email,
    to_name:             bd.name,
    subject:             `CFS ${estimateType} — ${monthLabel}`,
    month_label:         monthLabel,
    estimate_type:       estimateType,
    owner_name:          bd.name,
    ownership_pct:       `${bd.pct}%`,
    starting_reserve:    bd.startReserve != null ? fmt(bd.startReserve) : '',
    income_share:        `+${fmt(bd.incomeShare)}`,
    expense_breakdown:   expenseBreakdown,
    cleaning_lines:      cleaningLines,
    ending_reserve:      bd.postReserve != null ? fmt(bd.postReserve) : '',
    cfs_amount:          fmt(bd.cfsNeeded),
    property_name:       'Warrior Beach House',
  }, publicKey);
}
