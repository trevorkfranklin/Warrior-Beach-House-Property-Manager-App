// Mapper functions: Supabase snake_case ↔ app camelCase

// ─── Transactions ────────────────────────────────────────────
export const dbToTx = (r) => ({
  id:          r.id,
  date:        r.date,
  description: r.description,
  amount:      Number(r.amount),
  type:        r.type,
  category:    r.category || '',
  ownerId:     r.owner_id || '',
  taxYear:     r.tax_year ?? null,
  taxType:     r.tax_type || '',
  notes:       r.notes || '',
  excluded:    r.excluded ?? false,
  categorized: r.categorized ?? false,
  sfTxId:      r.sf_tx_id || null,
});

export const txToDb = (t) => ({
  id:          t.id,
  date:        t.date,
  description: t.description,
  amount:      Number(t.amount),
  type:        t.type,
  category:    t.category || '',
  owner_id:    t.ownerId || null,
  tax_year:    t.taxYear ?? null,
  tax_type:    t.taxType || null,
  notes:       t.notes || '',
  excluded:    t.excluded ?? false,
  categorized: t.categorized ?? false,
  sf_tx_id:    t.sfTxId || null,
});

// ─── Reservations ────────────────────────────────────────────
export const dbToRes = (r) => ({
  id:               r.id,
  guestName:        r.guest_name,
  guestEmail:       r.guest_email || '',
  guestPhone:       r.guest_phone || '',
  checkIn:          r.check_in,
  checkOut:         r.check_out,
  grossRent:        Number(r.gross_rent),
  isOwnerHold:      r.is_owner_hold ?? false,
  ownerId:          r.owner_id || '',
  status:           r.status,
  notes:            r.notes || '',
  nights:           Number(r.nights),
  managementFee:    Number(r.management_fee),
  netRent:          Number(r.net_rent),
  grossNightlyRate: Number(r.gross_nightly_rate),
  netNightlyRate:   Number(r.net_nightly_rate),
});

export const resToDb = (r) => ({
  id:                 r.id,
  guest_name:         r.guestName,
  guest_email:        r.guestEmail || '',
  guest_phone:        r.guestPhone || '',
  check_in:           r.checkIn,
  check_out:          r.checkOut,
  gross_rent:         Number(r.grossRent) || 0,
  is_owner_hold:      r.isOwnerHold ?? false,
  owner_id:           r.ownerId || null,
  status:             r.status,
  notes:              r.notes || '',
  nights:             Number(r.nights) || 0,
  management_fee:     Number(r.managementFee) || 0,
  net_rent:           Number(r.netRent) || 0,
  gross_nightly_rate: Number(r.grossNightlyRate) || 0,
  net_nightly_rate:   Number(r.netNightlyRate) || 0,
});

// ─── Owners ──────────────────────────────────────────────────
export const dbToOwner = (r) => ({
  id:               r.id,
  name:             r.name,
  email:            r.email || '',
  phone:            r.phone || '',
  ownershipPercent: Number(r.ownership_percent),
  notes:            r.notes || '',
});

export const ownerToDb = (o) => ({
  id:                o.id,
  name:              o.name,
  email:             o.email || '',
  phone:             o.phone || '',
  ownership_percent: Number(o.ownershipPercent) || 0,
  notes:             o.notes || '',
});

// ─── Property Taxes ──────────────────────────────────────────
export const dbToTax = (r) => ({
  id:           r.id,
  taxYear:      r.tax_year,
  taxType:      r.tax_type || '',
  annualAmount: Number(r.annual_amount),
  dueDate:      r.due_date || '',
  notes:        r.notes || '',
});

export const taxToDb = (t) => ({
  id:            t.id,
  tax_year:      t.taxYear,
  tax_type:      t.taxType || '',
  annual_amount: Number(t.annualAmount) || 0,
  due_date:      t.dueDate || null,
  notes:         t.notes || '',
});

// ─── HOA Dues ────────────────────────────────────────────────
export const dbToHoa = (r) => ({
  id:           r.id,
  year:         r.year,
  annualAmount: Number(r.annual_amount),
  dueDate:      r.due_date || '',
  notes:        r.notes || '',
});

export const hoaToDb = (h) => ({
  id:            h.id,
  year:          h.year,
  annual_amount: Number(h.annualAmount) || 0,
  due_date:      h.dueDate || null,
  notes:         h.notes || '',
});

// ─── Property ────────────────────────────────────────────────
export const dbToProp = (r) => ({
  id:                r.id,
  name:              r.name,
  address:           r.address,
  type:              r.type,
  purchasePrice:     Number(r.purchase_price),
  bedrooms:          Number(r.bedrooms),
  bathrooms:         Number(r.bathrooms),
  sqft:              Number(r.sqft),
  status:            r.status,
  notes:             r.notes || '',
  mortgageAccountId: r.mortgage_account_id || '',
  hoa:               r.hoa || '',
  hoaUrl:            r.hoa_url || '',
});

export const propToDb = (p) => ({
  id:                  'main',
  name:                p.name,
  address:             p.address,
  type:                p.type,
  purchase_price:      Number(p.purchasePrice) || 0,
  bedrooms:            Number(p.bedrooms) || 0,
  bathrooms:           Number(p.bathrooms) || 0,
  sqft:                Number(p.sqft) || 0,
  status:              p.status,
  notes:               p.notes || '',
  mortgage_account_id: p.mortgageAccountId || '',
  hoa:                 p.hoa || '',
  hoa_url:             p.hoaUrl || '',
  updated_at:          new Date().toISOString(),
});

// ─── Audit Log ───────────────────────────────────────────────
export const dbToAudit = (r) => ({
  id:        r.id,
  timestamp: r.created_at,
  userId:    r.user_id,
  username:  r.username,
  action:    r.action,
  details:   r.details || '',
});

// ─── Notifications ───────────────────────────────────────────
export const dbToNotif = (r) => ({
  id:             r.id,
  createdAt:      r.created_at,
  message:        r.message || '',
  type:           r.type || 'info',
  title:          r.title || '',
  body:           r.body || '',
  dismissed:      r.dismissed ?? false,
  manual:         r.manual ?? false,
  month:          r.month || '',
  subtype:        r.subtype || '',
  ownerBreakdown: r.owner_breakdown || null,
});

export const notifToDb = (n) => ({
  id:               n.id,
  message:          n.message || '',
  type:             n.type || 'info',
  title:            n.title || '',
  body:             n.body || '',
  dismissed:        n.dismissed ?? false,
  manual:           n.manual ?? false,
  month:            n.month || '',
  subtype:          n.subtype || '',
  owner_breakdown:  n.ownerBreakdown || null,
});
