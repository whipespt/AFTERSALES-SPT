/**
 * KONFIGURASI SUPABASE
 * Isi dengan nilai dari Supabase -> Project Settings -> API:
 *   - Project URL            -> SUPABASE_URL
 *   - anon / public key      -> SUPABASE_ANON_KEY
 * Kunci "anon" AMAN berada di sini (memang dirancang publik); data dilindungi oleh login + Row Level Security.
 * JANGAN PERNAH menaruh kunci "service_role" di berkas ini atau di GitHub.
 */
window.APP_CONFIG = {
  SUPABASE_URL: 'ISI_URL_PROYEK_SUPABASE',
  SUPABASE_ANON_KEY: 'ISI_ANON_KEY_SUPABASE'
};
