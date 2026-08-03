import { createClient } from '@supabase/supabase-js';

/**
 * Cliente do lado do SERVIDOR (usa a chave secreta service_role).
 * ⚠️ NUNCA importe este arquivo em código que roda no navegador —
 *    só em API routes (pages/api/...) e no getServerSideProps.
 */
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);
