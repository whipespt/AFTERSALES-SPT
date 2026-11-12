/**
 * KONFIGURASI SUPABASE
 * Isi dengan nilai dari Supabase -> Project Settings -> API:
 *   - Project URL            -> SUPABASE_URL
 *   - anon / public key      -> SUPABASE_ANON_KEY
 * Kunci "anon" AMAN berada di sini (memang dirancang publik); data dilindungi oleh login + Row Level Security.
 * JANGAN PERNAH menaruh kunci "service_role" di berkas ini atau di GitHub.
 */
window.APP_CONFIG = {
  SUPABASE_URL: 'https://gqzdfkcsruwnomuzpdxa.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_g53QmpWZpDc7Am81lEIlUw_XOOwqg7P'
};
