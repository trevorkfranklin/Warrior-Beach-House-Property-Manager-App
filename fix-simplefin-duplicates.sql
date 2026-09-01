-- Run this once against the existing database to fix duplicate SimpleFIN
-- transactions and stop new ones from being created.
--
-- Root cause: the sync code (api/sync-transactions.js and
-- useAutoSimpleFINSync.js) deduped by reading existing rows and filtering
-- in JS before inserting. That's a check-then-insert race: the client-side
-- sync (fires on page load) and the Vercel cron sync (fires daily) can both
-- read the "existing" set before either has inserted, both decide the same
-- incoming transactions are new, and both insert. There was no unique
-- constraint in the database to stop it.

-- 1. Remove existing duplicates, keeping the oldest row per sf_tx_id.
DELETE FROM public.transactions t
USING public.transactions t2
WHERE t.sf_tx_id IS NOT NULL
  AND t.sf_tx_id = t2.sf_tx_id
  AND t.created_at > t2.created_at
  AND t.id <> t2.id;

-- 2. Add a real uniqueness guarantee so this can't happen again, even if
--    two sync runs race. NULLs (manually-entered transactions with no
--    sf_tx_id) are unaffected — Postgres never treats NULL = NULL as a
--    conflict.
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_sf_tx_id_key UNIQUE (sf_tx_id);
