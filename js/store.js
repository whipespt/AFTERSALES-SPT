/**
 * LAPISAN DATA (browser <-> Supabase)
 *
 * Logika bisnis (server.js) bekerja pada tabel di memori, seperti dulu bekerja pada Google Sheets.
 * Setiap perubahan dicatat di "jurnal", lalu dikirim ke Supabase (upsert / delete) sebelum fungsi
 * api() mengembalikan hasil. Keamanan sesungguhnya ada di database: Row Level Security (supabase/schema.sql)
 * hanya mengizinkan ADMIN menulis; VIEWER hanya membaca.
 */

/* ---------- pengganti Utilities milik Apps Script ---------- */
var Utilities = {
  getUuid: function () {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    var h = '0123456789abcdef', s = '';
    for (var i = 0; i < 36; i++) s += (i === 8 || i === 13 || i === 18 || i === 23) ? '-' : h[Math.floor(Math.random() * 16)];
    return s;
  },
  /** Hanya zona Asia/Jakarta (WIB, UTC+7 tanpa DST). Pola: yyyy MM dd HH mm ss XXX dan teks dalam 'kutip'. */
  formatDate: function (d, tz, pat) {
    var t = new Date(d.getTime() + 7 * 3600000), z = function (n) { return String(n).padStart(2, '0'); };
    var map = { yyyy: String(t.getUTCFullYear()), MM: z(t.getUTCMonth() + 1), dd: z(t.getUTCDate()), HH: z(t.getUTCHours()), mm: z(t.getUTCMinutes()), ss: z(t.getUTCSeconds()), XXX: '+07:00' };
    return pat.replace(/'([^']*)'|yyyy|MM|dd|HH|mm|ss|XXX/g, function (m, q) { return q !== undefined ? q : map[m]; });
  }
};

/* ---------- pemetaan tabel / kolom ---------- */
var TABLE_ = { Quotation: 'quotation', Ringkasan: 'ringkasan', Target: 'target', Customer: 'customer', FollowUp: 'followup', AR: 'ar', ARBayar: 'ar_bayar', GrupPIC: 'grup_pic', Log: 'log_aktivitas' };
var DBCOL_ = { Log: { user: 'pengguna' } };           // 'user' kata terlarang di Postgres
function dbCol_(name, key) { return (DBCOL_[name] && DBCOL_[name][key]) || key; }
function pkKeys_(name) { return name === 'Target' ? ['tahun', 'bulan'] : name === 'Log' ? [] : ['id']; }
var DATA_TABLES_ = ['Quotation', 'Ringkasan', 'Target', 'Customer', 'FollowUp', 'AR', 'ARBayar', 'GrupPIC']; // Log tidak dimuat kecuali diminta
var PAGE_ = 1000;

/* ---------- tabel di memori + jurnal ---------- */
var DB_ = {}, JOURNAL_ = [], STORAGE_TRASH_ = [];
function tbl_(name) { return DB_[name] || (DB_[name] = []); }

function cast_(v, type) {
  if (type === 'u') return v === null || v === undefined ? '' : String(v).trim().toUpperCase();
  if (type === 'n') { var n = Number(v); return isNaN(n) ? 0 : n; }
  if (type === 'd') {
    var s = String(v || '').trim();
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
  }
  return v === null || v === undefined ? '' : String(v);
}
function castRec_(name, obj) {
  var o = {};
  SCHEMA[name].forEach(function (c) { o[c[0]] = cast_(obj[c[0]], c[2]); });
  return o;
}
function keyOf_(name, rec) { return pkKeys_(name).map(function (k) { return rec[k]; }).join('|'); }

function readAll_(name) {
  var cols = SCHEMA[name], out = [];
  tbl_(name).forEach(function (r, i) {
    var o = { _row: i + 2 };
    cols.forEach(function (c) { o[c[0]] = r[c[0]]; });
    var pk = o[cols[0][0]];
    if (pk !== '' && pk !== 0) out.push(o);
  });
  return out;
}
function appendRow_(name, obj) {
  var rec = castRec_(name, obj);
  if (name === 'Log') { JOURNAL_.push({ op: 'ins', name: name, rec: rec }); return; } // log tidak disimpan di memori
  tbl_(name).push(rec); JOURNAL_.push({ op: 'up', name: name, rec: rec });
}
function appendRows_(name, objs) { objs.forEach(function (o) { appendRow_(name, o); }); }
function updateRow_(name, row, obj) {
  var t = tbl_(name), rec = castRec_(name, obj);
  if (!t[row - 2]) throw new Error('Baris data tidak ditemukan.');
  t[row - 2] = rec; JOURNAL_.push({ op: 'up', name: name, rec: rec });
}
function deleteRow_(name, row) {
  var t = tbl_(name), rec = t[row - 2];
  if (!rec) return;
  t.splice(row - 2, 1); JOURNAL_.push({ op: 'del', name: name, rec: rec });
}
/** Pengganti objek Sheet (hanya metode yang dipakai logika bisnis). */
function sheet_(name) {
  if (!SCHEMA[name]) throw new Error('Tabel "' + name + '" tidak dikenal.');
  return { deleteRow: function (r) { deleteRow_(name, r); }, getLastRow: function () { return tbl_(name).length + 1; } };
}
function deleteById_(name, id, user) {
  var rec = readAll_(name).filter(function (r) { return r.id === id; })[0];
  if (!rec) throw new Error('Data tidak ditemukan (mungkin sudah dihapus).');
  deleteRow_(name, rec._row);
  log_(user, 'HAPUS ' + name, id + (rec.customer ? ' | ' + rec.customer : ''));
  return { id: id };
}
function withLock_(fn) { return fn(); }          // semua aksi tulis diproses satu per satu oleh antrean api()
function requireCols_() { }                      // (khusus Google Sheets) tidak diperlukan
function verifyCols_() { }
function ensureTab_() { }
function log_(user, aksi, detail) {
  try { appendRow_('Log', { waktu: now_(), user: user && user.email ? user.email : '', aksi: aksi, detail: detail || '' }); } catch (e) { }
}
function now_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'); }
function today_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function newId_(prefix) { return prefix + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase(); }

/* ---------- bukti foto (Supabase Storage, bucket privat "bukti") ---------- */
var BUKTI_MAX_BYTES = 8 * 1024 * 1024;
var BUKTI_PATH_RE = /^(quot|po)\/\d{4}\/[A-Za-z0-9_-]{8,}\.(jpg|png|webp)$/;
function cleanBukti_(v) {
  v = String(v == null ? '' : v).trim();
  if (!v) return '';
  if (BUKTI_PATH_RE.test(v)) return v;
  if (/^https:\/\/[^\s<>"']{4,500}$/.test(v)) return v; // tautan lama (mis. Google Drive) hasil migrasi
  throw new Error('Referensi bukti tidak valid. Unggah ulang fotonya.');
}
function trashBukti_(ref) { if (BUKTI_PATH_RE.test(String(ref || ''))) STORAGE_TRASH_.push(ref); }

/* ---------- data awal aplikasi ---------- */
function yearList_() {
  var years = {}, cy = new Date().getFullYear();
  years[cy] = 1; years[cy + 1] = 1;
  readAll_('Quotation').forEach(function (r) { var y = r.tgl ? +r.tgl.slice(0, 4) : 0; if (y >= 2000 && y <= 2100) years[y] = 1; });
  readAll_('Ringkasan').forEach(function (r) { if (r.tahun) years[r.tahun] = 1; });
  readAll_('Target').forEach(function (r) { if (r.tahun) years[r.tahun] = 1; });
  return Object.keys(years).map(Number).sort();
}
function initData_(user) {
  var cy = new Date().getFullYear();
  return {
    appName: APP_NAME, user: user, today: today_(), currentYear: cy, currentMonth: new Date().getMonth() + 1,
    years: yearList_(), months: MONTHS, kategori: KATEGORI, status: STATUS, fuJenis: FU_JENIS, fuTahap: FU_TAHAP
  };
}

/* ---------- peran & izin (cermin dari aturan RLS di supabase/schema.sql; yang mengikat tetap RLS di database) ---------- */
var ROLES_ = ['ADMIN', 'BRANCH_MANAGER', 'SALES', 'VIEWER', 'MENUNGGU'];
var ROLE_LABEL_ = { ADMIN: 'Admin', BRANCH_MANAGER: 'Branch Manager', SALES: 'Sales', VIEWER: 'Viewer', MENUNGGU: 'Menunggu' };
var PLAN_ACTIONS_ = { saveTargets: 1, saveGrupPIC: 1 };                 // target & PIC: Admin + Branch Manager
var ADMIN_ONLY_ACTIONS_ = { backupExport: 1, backupInfo: 1 };           // backup: hanya Admin
/** Apakah peran boleh menjalankan aksi ini? (aksi baca terbuka untuk semua anggota, kecuali yang khusus Admin) */
function can_(role, action, h) {
  if (role === 'ADMIN') return true;
  if (ADMIN_ONLY_ACTIONS_[action]) return false;
  if (action === 'listRingkasan') return role === 'SALES' || role === 'BRANCH_MANAGER';
  if (!h.admin) return role !== 'MENUNGGU';                             // aksi baca biasa
  if (PLAN_ACTIONS_[action]) return role === 'BRANCH_MANAGER';
  return role === 'SALES';                                              // aksi tulis operasional
}

/* ============================================================
 * CLOUD: Supabase (login, baca/tulis tabel, Storage)
 * ============================================================ */
var Cloud = (function () {
  var sb = null, profile = null, lastLoad = 0, queue = Promise.resolve(), STALE_MS = 45000;

  function err_(e, pre) { var m = e && e.message ? e.message : String(e || ''); return new Error((pre ? pre + ' ' : '') + m); }

  function init(cfg, createClient) {
    if (!cfg || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || /ISI_/.test(cfg.SUPABASE_URL + cfg.SUPABASE_ANON_KEY)) {
      throw new Error('Konfigurasi Supabase belum diisi. Buka js/config.js lalu isi SUPABASE_URL dan SUPABASE_ANON_KEY (lihat README).');
    }
    var url = String(cfg.SUPABASE_URL).trim(), key = String(cfg.SUPABASE_ANON_KEY).trim();
    try { var u = new URL(url); url = u.origin; } catch (e) { throw new Error('SUPABASE_URL di js/config.js bukan alamat yang valid. Contoh yang benar: https://abcdefgh.supabase.co'); }
    if (/(^|\.)supabase\.com$/i.test(new URL(url).hostname)) throw new Error('SUPABASE_URL salah: itu alamat dashboard. Pakai "Project URL" dari Project Settings → API, bentuknya https://xxxxxxxx.supabase.co');
    if (/^sb_secret_|service_role/i.test(key)) throw new Error('Jangan pakai kunci secret/service_role. Pakai kunci anon (public) atau publishable.');
    sb = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    return sb;
  }
  function client() { if (!sb) throw new Error('Supabase belum diinisialisasi.'); return sb; }

  /* ---- auth ---- */
  function getSession() { return client().auth.getSession().then(function (r) { return r.data && r.data.session ? r.data.session : null; }); }
  function signIn(email, password) {
    email = String(email || '').trim(); password = String(password || '');
    if (!email || !password) return Promise.reject(new Error('Email dan password wajib diisi.'));
    return client().auth.signInWithPassword({ email: email, password: password }).then(function (r) {
      if (r.error) throw new Error(/invalid login/i.test(r.error.message) ? 'Email atau password salah.' : /not confirmed/i.test(r.error.message) ? 'Email belum dikonfirmasi. Minta admin mengaktifkan akun ini di dashboard Supabase.' : r.error.message);
      return r.data.session;
    }, function (e) {
      if (/invalid path/i.test(e && e.message)) throw new Error('Alamat Supabase di js/config.js salah. Isi SUPABASE_URL hanya dengan Project URL, mis. https://abcdefgh.supabase.co (tanpa /rest/v1 atau garis miring tambahan).');
      throw new Error(/failed to fetch|networkerror|load failed/i.test(e && e.message) ? 'Tidak dapat terhubung ke Supabase. Periksa koneksi internet dan isi js/config.js.' : e.message);
    });
  }
  function signOut() { profile = null; DB_ = {}; JOURNAL_ = []; STORAGE_TRASH_ = []; lastLoad = 0; return client().auth.signOut().then(function () { }); }
  function resetPassword(email) {
    email = String(email || '').trim();
    if (!email) return Promise.reject(new Error('Isi email Anda terlebih dahulu.'));
    return client().auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }).then(function (r) { if (r.error) throw new Error(r.error.message); });
  }
  function updatePassword(pw) {
    pw = String(pw || '');
    if (pw.length < 8) return Promise.reject(new Error('Password minimal 8 karakter.'));
    return client().auth.updateUser({ password: pw }).then(function (r) { if (r.error) throw new Error(r.error.message); });
  }
  function onAuth(cb) { return client().auth.onAuthStateChange(function (ev, session) { cb(ev, session); }); }

  /** Ambil profil (nama & peran) dari tabel profiles. Peran asli ditegakkan oleh RLS di database. */
  function loadProfile() {
    return getSession().then(function (s) {
      if (!s) throw new Error('Belum masuk.');
      return client().from('profiles').select('id,email,nama,role').eq('id', s.user.id).maybeSingle().then(function (r) {
        if (r.error) throw new Error('Gagal membaca profil: ' + r.error.message);
        var p = r.data;
        if (!p) throw new Error('Akun Anda belum punya profil. Hubungi admin.');
        var role = String(p.role || '').toUpperCase(); if (ROLES_.indexOf(role) < 0) role = 'MENUNGGU';
        var nama = String(p.nama || '').trim() || String(p.email || s.user.email || '').split('@')[0];
        profile = { id: p.id, email: p.email || s.user.email, nama: nama, role: role };
        return profile;
      });
    });
  }
  function me() { return profile; }
  function userObj() { return profile ? { role: profile.role, nama: profile.nama, email: profile.nama, login: profile.email } : { role: 'VIEWER', nama: 'Tamu', email: 'viewer' }; }

  /* ---- baca tabel ---- */
  function orderCols_(name) { return name === 'Target' ? ['tahun', 'bulan'] : ['seq']; }
  function fetchTable_(name) {
    var out = [];
    function page(from) {
      var q = client().from(TABLE_[name]).select('*');
      orderCols_(name).forEach(function (c) { q = q.order(c, { ascending: true }); });
      return q.range(from, from + PAGE_ - 1).then(function (r) {
        if (r.error) throw new Error('Gagal membaca tabel ' + name + ': ' + r.error.message);
        var rows = r.data || [];
        rows.forEach(function (row) {
          var o = {};
          SCHEMA[name].forEach(function (c) { o[c[0]] = cast_(row[dbCol_(name, c[0])], c[2]); });
          out.push(o);
        });
        return rows.length === PAGE_ ? page(from + PAGE_) : out;
      });
    }
    return page(0);
  }
  function reloadAll(extra) {
    var names = DATA_TABLES_.concat(extra || []);
    return Promise.all(names.map(fetchTable_)).then(function (res) {
      var nd = {}; names.forEach(function (n, i) { nd[n] = res[i]; });
      DB_ = nd; lastLoad = Date.now(); JOURNAL_ = []; STORAGE_TRASH_ = [];
    });
  }

  /* ---- tulis jurnal ke database ---- */
  function toDb_(name, rec) { var o = {}; SCHEMA[name].forEach(function (c) { o[dbCol_(name, c[0])] = rec[c[0]]; }); return o; }
  function chunk_(arr, n) { var r = []; for (var i = 0; i < arr.length; i += n) r.push(arr.slice(i, i + n)); return r; }
  function seq_(items, fn) { return items.reduce(function (p, it) { return p.then(function () { return fn(it); }); }, Promise.resolve()); }

  function flush_() {
    var ops = JOURNAL_; JOURNAL_ = [];
    var groups = [];
    ops.forEach(function (o) {
      var g = groups[groups.length - 1];
      if (g && g.op === o.op && g.name === o.name) g.recs.push(o.rec); else groups.push({ op: o.op, name: o.name, recs: [o.rec] });
    });
    return seq_(groups, function (g) {
      var t = TABLE_[g.name];
      if (g.op === 'ins') {
        return seq_(chunk_(g.recs.map(function (r) { return toDb_(g.name, r); }), 500), function (rows) {
          return client().from(t).insert(rows).then(function (r) { if (r.error) throw new Error(r.error.message); });
        });
      }
      if (g.op === 'up') {
        var last = {}, order = [];
        g.recs.forEach(function (r) { var k = keyOf_(g.name, r); if (!(k in last)) order.push(k); last[k] = r; });
        var rows = order.map(function (k) { return toDb_(g.name, last[k]); });
        return seq_(chunk_(rows, 500), function (part) {
          return client().from(t).upsert(part, { onConflict: pkKeys_(g.name).join(',') }).then(function (r) { if (r.error) throw new Error(r.error.message); });
        });
      }
      /* del */
      if (g.name === 'Target') {
        return seq_(g.recs, function (r) { return client().from(t).delete().eq('tahun', r.tahun).eq('bulan', r.bulan).then(function (x) { if (x.error) throw new Error(x.error.message); }); });
      }
      return seq_(chunk_(g.recs.map(function (r) { return r.id; }), 100), function (ids) {
        return client().from(t).delete().in('id', ids).then(function (x) { if (x.error) throw new Error(x.error.message); });
      });
    });
  }

  function dropStorage_() {
    var paths = STORAGE_TRASH_; STORAGE_TRASH_ = [];
    if (!paths.length) return Promise.resolve();
    return client().storage.from('bukti').remove(paths).then(function () { }, function () { }); // sisa file tidak boleh menggagalkan simpan
  }

  /* ---- pintu masuk tunggal: sama seperti api() di Apps Script, tetapi async ---- */
  function jclone(v) { return v === undefined ? null : JSON.parse(JSON.stringify(v)); }
  function run_(action, payload) {
    payload = payload || {};
    var user = userObj();
    if (!profile) return Promise.reject(new Error('Sesi berakhir. Silakan masuk lagi.'));
    if (action === 'init') {
      return (lastLoad ? Promise.resolve() : reloadAll()).then(function () { return jclone(initData_(user)); });
    }
    var h = HANDLERS[action];
    if (!h) return Promise.reject(new Error('Aksi tidak dikenal: ' + action));
    if (!can_(user.role, action, h)) return Promise.reject(new Error('Peran Anda (' + (ROLE_LABEL_[user.role] || user.role) + ') tidak diizinkan melakukan aksi ini.'));
    var isWrite = !!h.admin && !h.ro;
    var wantLog = action === 'backupExport' && !!payload.logAktivitas;
    var need = isWrite || wantLog || !lastLoad || Date.now() - lastLoad > STALE_MS;
    return (need ? reloadAll(wantLog ? ['Log'] : []) : Promise.resolve()).then(function () {
      var res;
      try { res = h.fn(payload, user); }
      catch (e) { var m = e && e.message ? e.message : String(e); return (JOURNAL_.length ? reloadAll() : Promise.resolve()).then(function () { throw new Error(m); }); }
      if (!JOURNAL_.length) { STORAGE_TRASH_ = []; return jclone(res); }
      return flush_().then(function () { lastLoad = Date.now(); return dropStorage_(); }).then(function () { return jclone(res); }, function (e) {
        return reloadAll().then(function () { throw err_(e, 'Gagal menyimpan ke Supabase:'); }, function () { throw err_(e, 'Gagal menyimpan ke Supabase:'); });
      });
    });
  }
  function api(action, payload) {
    var p = queue.then(function () { return run_(action, payload); });
    queue = p.then(function () { }, function () { });
    return p;
  }
  function refresh() { return queue = queue.then(function () { return reloadAll(); }).then(function () { }, function (e) { throw e; }); }

  /* ---- manajemen pengguna (khusus Admin; RLS di database yang menegakkan) ---- */
  function listUsers() {
    if (!profile || profile.role !== 'ADMIN') return Promise.reject(new Error('Hanya Admin yang dapat mengelola pengguna.'));
    return client().from('profiles').select('id,email,nama,role,created_at').order('created_at', { ascending: true }).then(function (r) {
      if (r.error) throw new Error('Gagal membaca daftar pengguna: ' + r.error.message);
      return r.data || [];
    });
  }
  function updateUser(id, role, nama) {
    if (!profile || profile.role !== 'ADMIN') return Promise.reject(new Error('Hanya Admin yang dapat mengelola pengguna.'));
    if (ROLES_.indexOf(role) < 0) return Promise.reject(new Error('Peran tidak dikenal.'));
    nama = String(nama || '').trim();
    if (!nama) return Promise.reject(new Error('Nama tidak boleh kosong.'));
    if (nama.length > 60) return Promise.reject(new Error('Nama maksimal 60 karakter.'));
    return client().from('profiles').update({ role: role, nama: nama }).eq('id', id).then(function (r) {
      if (r.error) throw new Error(/minimal harus ada satu admin/i.test(r.error.message) ? 'Minimal harus ada satu Admin. Jadikan pengguna lain Admin dulu.' : 'Gagal menyimpan: ' + r.error.message);
      if (id === profile.id) { profile.role = role; profile.nama = nama; }
      return true;
    });
  }

  /* ---- Storage ---- */
  function b64ToBlob_(b64, mime) {
    var bin = atob(b64), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }
  function uploadBukti(jenis, mime, b64) {
    jenis = String(jenis || '').toUpperCase();
    if (jenis !== 'QUOT' && jenis !== 'PO') return Promise.reject(new Error('Jenis bukti harus QUOT atau PO.'));
    mime = String(mime || '').toLowerCase();
    if (!/^image\/(jpeg|png|webp)$/.test(mime)) return Promise.reject(new Error('Format foto harus JPG, PNG, atau WEBP.'));
    if (!b64) return Promise.reject(new Error('Foto kosong.'));
    var blob = b64ToBlob_(b64, mime);
    if (!blob.size) return Promise.reject(new Error('Foto kosong.'));
    if (blob.size > BUKTI_MAX_BYTES) return Promise.reject(new Error('Ukuran foto terlalu besar (maksimal 8 MB).'));
    var ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    var path = (jenis === 'PO' ? 'po' : 'quot') + '/' + today_().slice(0, 4) + '/' + Utilities.getUuid().replace(/-/g, '') + '.' + ext;
    return client().storage.from('bukti').upload(path, blob, { contentType: mime, upsert: false }).then(function (r) {
      if (r.error) throw new Error('Unggah foto gagal: ' + r.error.message);
      return path;
    });
  }
  /** Referensi bukti -> URL yang bisa dibuka (path Storage = tautan bertanda tangan 10 menit; https = apa adanya). */
  function buktiUrl(ref) {
    ref = String(ref || '');
    if (/^https:\/\//.test(ref)) return Promise.resolve(ref);
    if (!BUKTI_PATH_RE.test(ref)) return Promise.reject(new Error('Referensi foto tidak valid.'));
    return client().storage.from('bukti').createSignedUrl(ref, 600).then(function (r) {
      if (r.error || !r.data) throw new Error('Foto tidak dapat dibuka: ' + (r.error ? r.error.message : 'tidak ditemukan'));
      return r.data.signedUrl;
    });
  }
  function discardUpload(path) { if (BUKTI_PATH_RE.test(String(path || ''))) return client().storage.from('bukti').remove([path]).then(function () { }, function () { }); return Promise.resolve(); }

  /* ---- impor backup (migrasi dari versi Google Sheets / pemulihan) ---- */
  function parseBackup(obj) {
    if (!obj || typeof obj !== 'object' || !obj.meta || obj.meta.format !== BACKUP_FORMAT) throw new Error('Bukan berkas backup aplikasi ini (meta.format harus "' + BACKUP_FORMAT + '").');
    if (typeof obj.meta.versi !== 'number' || obj.meta.versi > BACKUP_VERSION) throw new Error('Versi backup (' + obj.meta.versi + ') lebih baru dari yang didukung aplikasi ini.');
    if (!obj.data || typeof obj.data !== 'object') throw new Error('Berkas backup tidak memiliki bagian "data".');
    var tables = {}, skipped = 0;
    Object.keys(SCHEMA).forEach(function (n) {
      var rows = obj.data[n];
      if (rows === undefined) return;
      if (!Array.isArray(rows)) throw new Error('Data tab "' + n + '" bukan daftar.');
      if (obj.meta.jumlah && typeof obj.meta.jumlah[n] === 'number' && obj.meta.jumlah[n] !== rows.length) throw new Error('Berkas backup tidak lengkap: tab "' + n + '" seharusnya ' + obj.meta.jumlah[n] + ' baris, tetapi hanya ada ' + rows.length + '.');
      var seen = {}, list = [];
      rows.forEach(function (raw) {
        if (!raw || typeof raw !== 'object') { skipped++; return; }
        var rec = castRec_(n, raw), pks = pkKeys_(n);
        if (pks.length && pks.some(function (k) { return rec[k] === '' || rec[k] === 0; })) { skipped++; return; }
        if (n === 'Log') { list.push(rec); return; }
        var k = keyOf_(n, rec);
        if (k in seen) { list[seen[k]] = rec; skipped++; return; }
        seen[k] = list.length; list.push(rec);
      });
      tables[n] = list;
    });
    if (!Object.keys(tables).length) throw new Error('Berkas backup tidak berisi data yang dikenali.');
    return tables;
  }
  function previewBackup(obj) {
    var tables; try { tables = parseBackup(obj); } catch (e) { return Promise.reject(e); }
    return queue.then(function () { return reloadAll(); }).then(function () {
      return Object.keys(tables).map(function (n) {
        if (n === 'Log') return { tabel: n, file: tables[n].length, ada: 0, baru: tables[n].length, timpa: 0 };
        var have = {}; tbl_(n).forEach(function (r) { have[keyOf_(n, r)] = 1; });
        var timpa = 0; tables[n].forEach(function (r) { if (have[keyOf_(n, r)]) timpa++; });
        return { tabel: n, file: tables[n].length, ada: tbl_(n).length, baru: tables[n].length - timpa, timpa: timpa };
      });
    });
  }
  /** mode: 'gabung' (tambah/timpa baris dengan ID sama, sisanya tetap) atau 'ganti' (data di database dibuat sama persis dengan berkas). */
  function importBackup(obj, mode) {
    var tables; try { tables = parseBackup(obj); } catch (e) { return Promise.reject(e); }
    if (!profile || profile.role !== 'ADMIN') return Promise.reject(new Error('Hanya Admin yang dapat mengimpor data.'));
    var p = queue.then(function () {
      return reloadAll().then(function () {
        var names = Object.keys(tables), summary = [];
        JOURNAL_ = [];
        names.forEach(function (n) {
          if (n === 'Log') { tables[n].forEach(function (r) { JOURNAL_.push({ op: 'ins', name: n, rec: r }); }); summary.push({ tabel: n, jumlah: tables[n].length, hapus: 0 }); return; }
          var keep = {}; tables[n].forEach(function (r) { keep[keyOf_(n, r)] = 1; });
          tables[n].forEach(function (r) { JOURNAL_.push({ op: 'up', name: n, rec: r }); });
          var del = 0;
          if (mode === 'ganti') tbl_(n).slice().forEach(function (r) { if (!keep[keyOf_(n, r)]) { JOURNAL_.push({ op: 'del', name: n, rec: r }); del++; } });
          summary.push({ tabel: n, jumlah: tables[n].length, hapus: del });
        });
        JOURNAL_.push({ op: 'ins', name: 'Log', rec: castRec_('Log', { waktu: now_(), user: userObj().email, aksi: 'IMPOR Backup', detail: (mode === 'ganti' ? 'ganti' : 'gabung') + ': ' + summary.map(function (s) { return s.tabel + '=' + s.jumlah; }).join(', ') }) });
        return flush_().then(function () { return reloadAll(); }).then(function () { return summary; }, function (e) {
          return reloadAll().then(function () { throw err_(e, 'Impor gagal di tengah jalan (data lama masih aman karena baris baru ditulis lebih dulu):'); });
        });
      });
    });
    queue = p.then(function () { }, function () { });
    return p;
  }

  return {
    init: init, client: client, getSession: getSession, signIn: signIn, signOut: signOut, resetPassword: resetPassword, updatePassword: updatePassword,
    onAuth: onAuth, loadProfile: loadProfile, listUsers: listUsers, updateUser: updateUser, me: me, api: api, refresh: refresh, uploadBukti: uploadBukti, buktiUrl: buktiUrl, discardUpload: discardUpload,
    previewBackup: previewBackup, importBackup: importBackup, parseBackup: parseBackup
  };
})();
