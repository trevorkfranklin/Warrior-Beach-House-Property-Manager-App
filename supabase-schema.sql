-- ============================================================
-- Warrior Beach House — Supabase Schema  (idempotent — safe to re-run)
-- ============================================================

-- ============================================================
-- 1. PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
  last_login  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. HELPER FUNCTIONS
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
$$;

CREATE OR REPLACE FUNCTION public.get_user_count()
RETURNS INT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COUNT(*)::INT FROM public.profiles
$$;

-- ============================================================
-- 3. PROFILES RLS
-- ============================================================
DROP POLICY IF EXISTS "profiles_select"       ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert"       ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own"   ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_admin" ON public.profiles;

CREATE POLICY "profiles_select"       ON public.profiles FOR SELECT USING (auth.uid() = id OR public.is_admin());
CREATE POLICY "profiles_insert"       ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own"   ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_admin" ON public.profiles FOR UPDATE USING (public.is_admin());
CREATE POLICY "profiles_delete_admin" ON public.profiles FOR DELETE USING (public.is_admin());

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, COALESCE((NEW.raw_user_meta_data->>'role')::TEXT, 'viewer'))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 4. PROPERTY
-- ============================================================
CREATE TABLE IF NOT EXISTS public.property (
  id                  TEXT DEFAULT 'main' PRIMARY KEY,
  name                TEXT DEFAULT 'Warrior Beach House',
  address             TEXT DEFAULT '18611 Warrior Rd, Galveston, TX 77554',
  type                TEXT DEFAULT 'Vacation Rental',
  purchase_price      NUMERIC DEFAULT 0,
  bedrooms            INT DEFAULT 4,
  bathrooms           NUMERIC DEFAULT 3,
  sqft                INT DEFAULT 0,
  status              TEXT DEFAULT 'Active',
  notes               TEXT DEFAULT '',
  mortgage_account_id TEXT DEFAULT '',
  hoa                 TEXT DEFAULT '',
  hoa_url             TEXT DEFAULT '',
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.property ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "property_select" ON public.property;
DROP POLICY IF EXISTS "property_insert" ON public.property;
DROP POLICY IF EXISTS "property_update" ON public.property;
DROP POLICY IF EXISTS "property_delete" ON public.property;

CREATE POLICY "property_select" ON public.property FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "property_insert" ON public.property FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "property_update" ON public.property FOR UPDATE USING (public.is_admin());
CREATE POLICY "property_delete" ON public.property FOR DELETE USING (public.is_admin());

-- ============================================================
-- 5. TRANSACTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.transactions (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date         DATE NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  amount       NUMERIC NOT NULL DEFAULT 0,
  type         TEXT NOT NULL DEFAULT 'Expense' CHECK (type IN ('Income', 'Expense')),
  category     TEXT DEFAULT '',
  owner_id     UUID,
  tax_year     INT,
  tax_type     TEXT,
  notes        TEXT DEFAULT '',
  excluded     BOOLEAN DEFAULT false,
  categorized  BOOLEAN DEFAULT false,
  sf_tx_id     TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transactions_select" ON public.transactions;
DROP POLICY IF EXISTS "transactions_insert" ON public.transactions;
DROP POLICY IF EXISTS "transactions_update" ON public.transactions;
DROP POLICY IF EXISTS "transactions_delete" ON public.transactions;

CREATE POLICY "transactions_select" ON public.transactions FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "transactions_insert" ON public.transactions FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "transactions_update" ON public.transactions FOR UPDATE USING (public.is_admin());
CREATE POLICY "transactions_delete" ON public.transactions FOR DELETE USING (public.is_admin());

-- ============================================================
-- 6. RESERVATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.reservations (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  guest_name          TEXT NOT NULL DEFAULT '',
  guest_email         TEXT DEFAULT '',
  guest_phone         TEXT DEFAULT '',
  check_in            DATE NOT NULL,
  check_out           DATE NOT NULL,
  gross_rent          NUMERIC DEFAULT 0,
  is_owner_hold       BOOLEAN DEFAULT false,
  owner_id            UUID,
  status              TEXT DEFAULT 'Upcoming' CHECK (status IN ('Upcoming', 'Active', 'Complete', 'Cancelled')),
  notes               TEXT DEFAULT '',
  nights              INT DEFAULT 0,
  management_fee      NUMERIC DEFAULT 0,
  net_rent            NUMERIC DEFAULT 0,
  gross_nightly_rate  NUMERIC DEFAULT 0,
  net_nightly_rate    NUMERIC DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reservations_select" ON public.reservations;
DROP POLICY IF EXISTS "reservations_insert" ON public.reservations;
DROP POLICY IF EXISTS "reservations_update" ON public.reservations;
DROP POLICY IF EXISTS "reservations_delete" ON public.reservations;

CREATE POLICY "reservations_select" ON public.reservations FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "reservations_insert" ON public.reservations FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "reservations_update" ON public.reservations FOR UPDATE USING (public.is_admin());
CREATE POLICY "reservations_delete" ON public.reservations FOR DELETE USING (public.is_admin());

-- ============================================================
-- 7. OWNERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.owners (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name              TEXT NOT NULL DEFAULT '',
  email             TEXT DEFAULT '',
  phone             TEXT DEFAULT '',
  ownership_percent NUMERIC DEFAULT 0,
  notes             TEXT DEFAULT '',
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.owners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owners_select" ON public.owners;
DROP POLICY IF EXISTS "owners_insert" ON public.owners;
DROP POLICY IF EXISTS "owners_update" ON public.owners;
DROP POLICY IF EXISTS "owners_delete" ON public.owners;

CREATE POLICY "owners_select" ON public.owners FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "owners_insert" ON public.owners FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "owners_update" ON public.owners FOR UPDATE USING (public.is_admin());
CREATE POLICY "owners_delete" ON public.owners FOR DELETE USING (public.is_admin());

-- ============================================================
-- 8. PROPERTY TAXES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.property_taxes (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tax_year      INT NOT NULL,
  tax_type      TEXT DEFAULT '',
  annual_amount NUMERIC DEFAULT 0,
  due_date      DATE,
  notes         TEXT DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.property_taxes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "property_taxes_select" ON public.property_taxes;
DROP POLICY IF EXISTS "property_taxes_insert" ON public.property_taxes;
DROP POLICY IF EXISTS "property_taxes_update" ON public.property_taxes;
DROP POLICY IF EXISTS "property_taxes_delete" ON public.property_taxes;

CREATE POLICY "property_taxes_select" ON public.property_taxes FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "property_taxes_insert" ON public.property_taxes FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "property_taxes_update" ON public.property_taxes FOR UPDATE USING (public.is_admin());
CREATE POLICY "property_taxes_delete" ON public.property_taxes FOR DELETE USING (public.is_admin());

-- ============================================================
-- 9. HOA DUES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.hoa_dues (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  year          INT NOT NULL,
  annual_amount NUMERIC DEFAULT 0,
  due_date      DATE,
  notes         TEXT DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.hoa_dues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hoa_dues_select" ON public.hoa_dues;
DROP POLICY IF EXISTS "hoa_dues_insert" ON public.hoa_dues;
DROP POLICY IF EXISTS "hoa_dues_update" ON public.hoa_dues;
DROP POLICY IF EXISTS "hoa_dues_delete" ON public.hoa_dues;

CREATE POLICY "hoa_dues_select" ON public.hoa_dues FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "hoa_dues_insert" ON public.hoa_dues FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "hoa_dues_update" ON public.hoa_dues FOR UPDATE USING (public.is_admin());
CREATE POLICY "hoa_dues_delete" ON public.hoa_dues FOR DELETE USING (public.is_admin());

-- ============================================================
-- 10. AUDIT LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audit_log (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id    UUID,
  username   TEXT DEFAULT '',
  action     TEXT NOT NULL DEFAULT '',
  details    TEXT DEFAULT ''
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_select" ON public.audit_log;
DROP POLICY IF EXISTS "audit_log_insert" ON public.audit_log;

CREATE POLICY "audit_log_select" ON public.audit_log FOR SELECT USING (public.is_admin());
CREATE POLICY "audit_log_insert" ON public.audit_log FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- 11. NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  message         TEXT NOT NULL DEFAULT '',
  type            TEXT DEFAULT 'info',
  title           TEXT DEFAULT '',
  body            TEXT DEFAULT '',
  dismissed       BOOLEAN DEFAULT false,
  manual          BOOLEAN DEFAULT false,
  month           TEXT DEFAULT '',
  subtype         TEXT DEFAULT '',
  owner_breakdown JSONB
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update" ON public.notifications;
DROP POLICY IF EXISTS "notifications_delete" ON public.notifications;

CREATE POLICY "notifications_select" ON public.notifications FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "notifications_insert" ON public.notifications FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "notifications_update" ON public.notifications FOR UPDATE USING (public.is_admin());
CREATE POLICY "notifications_delete" ON public.notifications FOR DELETE USING (public.is_admin());

-- ============================================================
-- 12. APP SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.app_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_settings_select" ON public.app_settings;
DROP POLICY IF EXISTS "app_settings_insert" ON public.app_settings;
DROP POLICY IF EXISTS "app_settings_update" ON public.app_settings;
DROP POLICY IF EXISTS "app_settings_delete" ON public.app_settings;

CREATE POLICY "app_settings_select" ON public.app_settings FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "app_settings_insert" ON public.app_settings FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "app_settings_update" ON public.app_settings FOR UPDATE USING (public.is_admin());
CREATE POLICY "app_settings_delete" ON public.app_settings FOR DELETE USING (public.is_admin());
