/**
 * LOGIKA BISNIS - After Sales Tracker (Mitra IPE Sampit)
 * Dibangun otomatis dari versi Apps Script (tools/build_server.py), lalu dijalankan di browser
 * di atas tabel memori (lihat js/store.js). Jangan menyimpan rahasia apa pun di berkas ini.
 */
/**
 * AFTER SALES TRACKER
 * Web app untuk tracking quotation & target penjualan sparepart/service.
 * Database: Google Sheets (tab: Quotation, Ringkasan, Target, Customer, Log).
 *
 * Alur: Admin input quotation per customer -> update progres (PO -> Terjual / Carry Over / Batal)
 *       -> dashboard & laporan terhitung otomatis. Manager hanya memantau (read-only).
 */

var APP_NAME = 'Mitra IPE Sampit - After Sales Tracker';
var TZ = 'Asia/Jakarta';
var MONTHS = ['JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI', 'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'];
var KATEGORI = ['PARTS', 'BUNDLING', 'PTS', 'LABOUR']; // PARTS + BUNDLING = grup parts; PTS + LABOUR = grup SERVICE. Nilai lama 'SERVICE' dibaca sebagai PTS.
function isPartsGroup_(k) { return k === 'PARTS' || k === 'BUNDLING'; }
var STATUS = ['QUOTATION', 'PO', 'TERJUAL', 'CARRY OVER', 'BATAL'];

/** Skema tabel: [key, header, tipe]  tipe: s=teks, n=angka, d=tanggal (yyyy-MM-dd) */
var SCHEMA = {
  Quotation: [
    ['id', 'ID', 's'], ['tgl', 'Tgl Quotation', 'd'], ['no_quot', 'No Quotation', 's'], ['no_po', 'No PO Customer', 's'], ['customer', 'Customer', 's'],
    ['kategori', 'Kategori', 'u'], ['nilai_quot', 'Nilai Quotation', 'n'], ['status', 'Status', 'u'],
    ['tgl_po', 'Tgl PO', 'd'], ['nilai_po', 'Nilai PO', 'n'], ['tgl_jual', 'Tgl Penjualan', 'd'], ['nilai_jual', 'Nilai Penjualan', 'n'],
    ['catatan', 'Catatan', 's'], ['created_by', 'Dibuat Oleh', 's'], ['created_at', 'Dibuat Pada', 's'],
    ['updated_by', 'Diubah Oleh', 's'], ['updated_at', 'Diubah Pada', 's'],
    ['bukti_quot', 'Bukti Quotation (link foto)', 's'], ['bukti_po', 'Bukti PO (link foto)', 's']
  ],
  Ringkasan: [
    ['id', 'ID', 's'], ['tahun', 'Tahun', 'n'], ['bulan', 'Bulan', 'n'],
    ['qp_n', 'Jml Quot Parts', 'n'], ['qp_val', 'Nilai Quot Parts', 'n'], ['qp_dn', 'Jml Deal Parts', 'n'], ['qp_po', 'PO Parts', 'n'],
    ['qs_n', 'Jml Quot Service', 'n'], ['qs_val', 'Nilai Quot Service', 'n'], ['qs_dn', 'Jml Deal Service', 'n'], ['qs_po', 'PO Service', 'n'],
    ['s_parts', 'Penjualan Parts', 'n'], ['s_bundling', 'Penjualan Bundling', 'n'], ['s_pts', 'Penjualan PTS', 'n'], ['s_labour', 'Penjualan Labour', 'n'], ['s_lain', 'Penjualan Lain-lain', 'n'],
    ['ket', 'Keterangan', 's']
  ],
  Target: [['tahun', 'Tahun', 'n'], ['bulan', 'Bulan', 'n'], ['t_parts', 'Target Parts', 'n'], ['t_bundling', 'Target Bundling', 'n'], ['t_pts', 'Target PTS', 'n'], ['t_labour', 'Target Labour', 'n'], ['t_lain', 'Target Lain-lain', 'n'], ['ket', 'Keterangan', 's']],
  Customer: [
    ['id', 'ID', 's'], ['nama', 'Nama Customer', 's'], ['grup', 'Grup', 's'], ['aktivitas', 'Aktivitas', 'u'],
    ['populasi', 'Populasi Mesin', 'n'], ['rata_unit', 'Rata-rata Beli Parts per Unit', 'n'],
    ['inv_2023', 'Invoice 2023 (Jan-Okt)', 'n'], ['inv_2024', 'Invoice 2024 (Jan-Okt)', 'n'], ['inv_2025', 'Invoice 2025 (Jan-Okt)', 'n'], ['inv_2026', 'Invoice 2026 (Jan-Okt)', 'n'],
    ['catatan', 'Catatan', 's'], ['updated_by', 'Diubah Oleh', 's'], ['updated_at', 'Diubah Pada', 's']
  ],
  FollowUp: [
    ['id', 'ID', 's'], ['tgl', 'Tanggal Follow Up', 'd'], ['customer_id', 'ID Customer', 's'], ['customer', 'Customer', 's'],
    ['jenis', 'Jenis Kontak', 'u'], ['tahap', 'Tahap', 'u'], ['catatan', 'Hasil / Catatan', 's'], ['next_tgl', 'Follow Up Berikutnya', 'd'],
    ['oleh', 'Diinput Oleh', 's'], ['dibuat', 'Dibuat Pada', 's'], ['diubah_oleh', 'Diubah Oleh', 's'], ['diubah', 'Diubah Pada', 's'],
    ['ar_id', 'ID Piutang (penagihan)', 's']
  ],
  AR: [
    ['id', 'ID', 's'], ['doc_no', 'No Invoice', 's'], ['customer_id', 'ID Customer', 's'], ['customer', 'Customer', 's'],
    ['tgl', 'Tgl Invoice', 'd'], ['jatuh_tempo', 'Jatuh Tempo', 'd'], ['no_ref', 'No PO Customer', 's'], ['kategori', 'Kategori', 'u'], ['cabang', 'Cabang', 's'],
    ['nilai', 'Nilai Tagihan', 'n'], ['bayar', 'Terbayar', 'n'], ['target_bayar', 'Target Bayar', 'd'], ['target_ket', 'Keterangan Target', 's'],
    ['keterangan', 'Keterangan', 's'], ['sumber', 'Sumber', 's'], ['dibuat_oleh', 'Dibuat Oleh', 's'], ['dibuat', 'Dibuat Pada', 's'],
    ['diubah_oleh', 'Diubah Oleh', 's'], ['diubah', 'Diubah Pada', 's']
  ],
  ARBayar: [['id', 'ID', 's'], ['ar_id', 'ID Invoice', 's'], ['tgl', 'Tgl Bayar', 'd'], ['jumlah', 'Jumlah', 'n'], ['ket', 'Keterangan', 's'], ['oleh', 'Dicatat Oleh', 's'], ['dibuat', 'Dibuat Pada', 's']],
  GrupPIC: [['id', 'ID', 's'], ['grup', 'Grup', 'u'], ['pic', 'PIC', 's'], ['updated_by', 'Diubah Oleh', 's'], ['updated_at', 'Diubah Pada', 's']],
  Log: [['waktu', 'Waktu', 's'], ['user', 'User', 's'], ['aksi', 'Aksi', 's'], ['detail', 'Detail', 's']]
};

/* ============================================================
 * ENTRY POINT
 * ============================================================ */







var HANDLERS = {
  dashboard: { fn: function (p) { return dashboard_(num_(p.year), num_(p.month)); } },
  listQuotations: { fn: function () { return readAll_('Quotation'); } },
  report: { fn: function (p) { return report_(num_(p.year), num_(p.month)); } },
  getTargets: { fn: function (p) { return getTargets_(num_(p.year)); } },
  saveQuotation: { admin: true, fn: function (p, u) { return saveQuotation_(p, u); } },
  deleteQuotation: { admin: true, fn: function (p, u) { return deleteQuotation_(p, u); } },
  listRingkasan: { admin: true, fn: function (p) { return readAll_('Ringkasan').filter(function (r) { return !p.year || r.tahun === num_(p.year); }); } },
  saveRingkasan: { admin: true, fn: function (p, u) { return saveRingkasan_(p, u); } },
  deleteRingkasan: { admin: true, fn: function (p, u) { return deleteById_('Ringkasan', p.id, u); } },
  listCustomers: { fn: function (p) { return customers_(num_(p.year)); } },
  saveCustomer: { admin: true, fn: function (p, u) { return saveCustomer_(p, u); } },
  listFollowUps: { fn: function () { return readAll_('FollowUp'); } },
  saveFollowUp: { admin: true, fn: function (p, u) { return saveFollowUp_(p, u); } },
  deleteFollowUp: { admin: true, fn: function (p, u) { return deleteById_('FollowUp', p.id, u); } },
  updateMesin: { admin: true, fn: function (p, u) { return updateMesin_(p, u); } },
  backupExport: { admin: true, ro: true, fn: function (p, u) { return buildBackup_(u, !!p.logAktivitas); } },
  saveGrupPIC: { admin: true, fn: function (p, u) { return saveGrupPIC_(p, u); } },
  deleteCustomer: { admin: true, fn: function (p, u) { return deleteById_('Customer', p.id, u); } },
  saveTargets: { admin: true, fn: function (p, u) { return saveTargets_(p, u); } },
  listAR: { fn: function () { return listAR_(); } },
  cekQuotAR: { admin: true, ro: true, fn: function (p) { return cekQuotAR_(p); } },
  saveAR: { admin: true, fn: function (p, u) { return saveAR_(p, u); } },
  deleteAR: { admin: true, fn: function (p, u) { return deleteAR_(p, u); } },
  payAR: { admin: true, fn: function (p, u) { return payAR_(p, u); } },
  deletePay: { admin: true, fn: function (p, u) { return deletePay_(p, u); } },
  previewAR: { admin: true, fn: function (p, u) { return applyARReport_(p.rows, String(p.asof || ''), u, true); } },
  importAR: { admin: true, fn: function (p, u) { return applyARReport_(p.rows, String(p.asof || ''), u, false); } }
};

/* ============================================================
 * AUTH
 * Semua orang yang membuka link = VIEWER (hanya lihat, tanpa login).
 * Admin masuk dengan PIN (disimpan di Script Properties "ADMIN_PIN", hanya terbaca pemilik script).
 * Setelah PIN benar, browser menerima token acak yang berlaku 6 jam; token dicek di setiap aksi tulis.
 * ============================================================ */








/* ============================================================
 * DATABASE LAYER (Google Sheets)
 * ============================================================ */













function num_(v) { var n = Number(v); return isNaN(n) ? 0 : n; }


/* ============================================================
 * QUOTATION (input per customer)
 * ============================================================ */

function validDate_(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  var p = s.split('-').map(Number), d = new Date(p[0], p[1] - 1, p[2]);
  return d.getFullYear() === p[0] && d.getMonth() === p[1] - 1 && d.getDate() === p[2];
}

function normalizeQuotation_(p) {
  var r = {};
  r.customer = String(p.customer || '').trim();
  if (!r.customer) throw new Error('Nama customer wajib diisi.');
  r.kategori = String(p.kategori || '').toUpperCase();
  if (r.kategori === 'SERVICE') r.kategori = 'PTS';
  if (KATEGORI.indexOf(r.kategori) < 0) throw new Error('Kategori harus PARTS, BUNDLING, PTS, atau LABOUR.');
  r.nilai_quot = num_(p.nilai_quot);
  if (!(r.nilai_quot > 0)) throw new Error('Nilai quotation harus lebih dari 0.');
  r.tgl = String(p.tgl || today_());
  if (!validDate_(r.tgl)) throw new Error('Tanggal quotation tidak valid.');
  r.no_quot = String(p.no_quot || '').trim();
  r.catatan = String(p.catatan || '').trim();
  r.status = String(p.status || 'QUOTATION').toUpperCase();
  if (STATUS.indexOf(r.status) < 0) throw new Error('Status tidak valid.');

  var tPo = String(p.tgl_po || ''), tJ = String(p.tgl_jual || '');
  if (tPo && !validDate_(tPo)) throw new Error('Tanggal PO tidak valid.');
  if (tJ && !validDate_(tJ)) throw new Error('Tanggal penjualan tidak valid.');
  r.tgl_po = ''; r.nilai_po = 0; r.tgl_jual = ''; r.nilai_jual = 0; r.no_po = '';

  if (r.status === 'PO' || r.status === 'TERJUAL') {
    r.no_po = String(p.no_po || '').trim();
    if (!r.no_po) throw new Error('No. PO dari customer wajib diisi untuk status PO / Invoice (bukti PO asli dari customer).');
    r.nilai_po = num_(p.nilai_po) > 0 ? num_(p.nilai_po) : r.nilai_quot;
    r.tgl_po = tPo || tJ || today_();
  }
  if (r.status === 'TERJUAL') {
    r.nilai_jual = num_(p.nilai_jual) > 0 ? num_(p.nilai_jual) : r.nilai_po;
    r.tgl_jual = tJ || today_();
    if (r.tgl_po > r.tgl_jual) r.tgl_po = r.tgl_jual;
  }
  return r;
}

/* ============================================================
 * BUKTI FOTO (quotation & PO)
 * Foto diunggah ke folder Google Drive milik pemilik script; di sheet hanya disimpan link-nya.
 * Link diset "siapa saja yang punya link boleh melihat" supaya pengguna mode lihat bisa membukanya.
 * ============================================================ */






function deleteQuotation_(p, user) {
  var old = readAll_('Quotation').filter(function (r) { return r.id === p.id; })[0];
  var res = deleteById_('Quotation', p.id, user);
  if (old) { trashBukti_(old.bukti_quot); trashBukti_(old.bukti_po); }
  return res;
}

function saveQuotation_(p, user) {
  var rec = normalizeQuotation_(p);
  var newQ = p.bukti_quot === undefined ? undefined : cleanBukti_(p.bukti_quot), newP = p.bukti_po === undefined ? undefined : cleanBukti_(p.bukti_po);
  return withLock_(function () {
    requireCols_('Quotation', ['bukti_quot', 'bukti_po']);
    if (p.id) {
      var old = readAll_('Quotation').filter(function (r) { return r.id === p.id; })[0];
      if (!old) throw new Error('Data tidak ditemukan (mungkin sudah dihapus).');
      rec.id = old.id; rec.created_by = old.created_by; rec.created_at = old.created_at;
      rec.updated_by = user.email; rec.updated_at = now_();
      rec.bukti_quot = newQ === undefined ? (old.bukti_quot || '') : newQ; // tidak dikirim = pertahankan yang lama
      rec.bukti_po = newP === undefined ? (old.bukti_po || '') : newP;
      updateRow_('Quotation', old._row, rec);
      verifyCols_('Quotation', old._row, rec, ['bukti_quot', 'bukti_po']);
      if (old.bukti_quot && old.bukti_quot !== rec.bukti_quot) trashBukti_(old.bukti_quot);
      if (old.bukti_po && old.bukti_po !== rec.bukti_po) trashBukti_(old.bukti_po);
      log_(user, 'UBAH Quotation', rec.id + ' | ' + rec.customer + ' | ' + rec.status);
    } else {
      rec.id = newId_('Q');
      rec.created_by = user.email; rec.created_at = now_(); rec.updated_by = ''; rec.updated_at = '';
      rec.bukti_quot = newQ || ''; rec.bukti_po = newP || '';
      appendRow_('Quotation', rec);
      verifyCols_('Quotation', sheet_('Quotation').getLastRow(), rec, ['bukti_quot', 'bukti_po']);
      log_(user, 'TAMBAH Quotation', rec.id + ' | ' + rec.customer + ' | ' + rec.nilai_quot);
    }
    try { ensureCustomer_(rec, user, p.grup); } catch (e) { /* tab Customer belum ada: abaikan */ }
    return rec;
  });
}

/* ============================================================
 * CUSTOMER (master + tren invoice per tahun)
 * Invoice 2023-2026 = angka historis periode Jan-Okt di tab Customer.
 * Setelah 31 Okt 2026, invoice dihitung otomatis dari tab Quotation (status TERJUAL, per tanggal penjualan).
 * ============================================================ */

var CUST_CUTOFF = '2026-10-31';
var CUST_HIST_YEARS = [2023, 2024, 2025, 2026];
var AKTIVITAS = ['AKTIF', 'TIDAK AKTIF', 'PROSPECT'];

function custKey_(s) { return String(s || '').toUpperCase().replace(/\s+/g, ' ').trim(); }

function ensureCustomer_(q, user, grup) { // customer baru dari form Quotation otomatis masuk master
  var key = custKey_(q.customer), all = readAll_('Customer');
  var c = all.filter(function (x) { return custKey_(x.nama) === key; })[0];
  if (!c) {
    appendRow_('Customer', { id: newId_('C'), nama: q.customer, grup: String(grup || '').trim().toUpperCase(), aktivitas: q.status === 'TERJUAL' ? 'AKTIF' : 'PROSPECT', populasi: 0, rata_unit: 0, inv_2023: 0, inv_2024: 0, inv_2025: 0, inv_2026: 0, catatan: 'Ditambahkan otomatis dari input quotation', updated_by: user.email, updated_at: now_() });
    log_(user, 'TAMBAH Customer', q.customer + ' (otomatis)');
  } else if (q.status === 'TERJUAL' && c.aktivitas !== 'AKTIF') {
    c.aktivitas = 'AKTIF'; updateRow_('Customer', c._row, c);
  } else if ((q.status === 'QUOTATION' || q.status === 'CARRY OVER') && c.aktivitas === 'TIDAK AKTIF') {
    c.aktivitas = 'PROSPECT'; updateRow_('Customer', c._row, c); // ada penawaran baru tapi belum jadi: kembali jadi prospect
  }
}

function saveCustomer_(p, user) {
  var nama = String(p.nama || '').trim();
  if (!nama) throw new Error('Nama customer wajib diisi.');
  var rec = {
    nama: nama, grup: String(p.grup || '').trim().toUpperCase(), aktivitas: AKTIVITAS.indexOf(p.aktivitas) >= 0 ? p.aktivitas : 'PROSPECT',
    populasi: Math.max(0, Math.round(num_(p.populasi))), rata_unit: Math.max(0, num_(p.rata_unit)), catatan: String(p.catatan || '').trim(),
    updated_by: user.email, updated_at: now_()
  };
  CUST_HIST_YEARS.forEach(function (y) { rec['inv_' + y] = Math.max(0, num_(p['inv_' + y])); });
  return withLock_(function () {
    var all = readAll_('Customer'), key = custKey_(nama);
    var dup = all.filter(function (x) { return custKey_(x.nama) === key && x.id !== p.id; })[0];
    if (dup) throw new Error('Customer "' + dup.nama + '" sudah ada. Gunakan tombol Ubah pada data tersebut.');
    if (p.id) {
      var old = all.filter(function (x) { return x.id === p.id; })[0];
      if (!old) throw new Error('Data tidak ditemukan (mungkin sudah dihapus).');
      rec.id = old.id; updateRow_('Customer', old._row, rec);
      log_(user, 'UBAH Customer', rec.nama);
    } else {
      rec.id = newId_('C'); appendRow_('Customer', rec);
      log_(user, 'TAMBAH Customer', rec.nama);
    }
    return rec;
  });
}

/* Ubah jumlah mesin (populasi) satu customer saja, tanpa menyentuh data lain. Perubahan dicatat di Log. */
function updateMesin_(p, user) {
  var n = Number(p.populasi);
  if (p.populasi === '' || p.populasi == null || isNaN(n) || n < 0 || n > 100000) throw new Error('Jumlah mesin harus berupa angka 0 atau lebih.');
  n = Math.round(n);
  return withLock_(function () {
    var c = readAll_('Customer').filter(function (x) { return x.id === p.id; })[0];
    if (!c) throw new Error('Customer tidak ditemukan (mungkin sudah dihapus).');
    var lama = Math.round(num_(c.populasi));
    if (lama !== n) {
      var rec = {}; Object.keys(c).forEach(function (k) { rec[k] = c[k]; }); // updateRow_ menulis semua kolom: bawa seluruh data lama
      rec.populasi = n; rec.updated_by = user.email; rec.updated_at = now_();
      updateRow_('Customer', c._row, rec);
      log_(user, 'UBAH Mesin', c.nama + ': ' + lama + ' → ' + n + ' unit' + (p.alasan ? ' (' + String(p.alasan).trim().slice(0, 200) + ')' : ''));
    }
    return { id: c.id, populasi: n, lama: lama };
  });
}

/* ============================================================
 * CRM: PROGRES FOLLOW UP PER CUSTOMER
 * Setiap catatan menyimpan siapa pengisinya (nama saat masuk) dan kapan.
 * ============================================================ */

var FU_JENIS = ['TELEPON', 'WHATSAPP', 'KUNJUNGAN', 'EMAIL', 'LAINNYA'];
var FU_TAHAP = ['BARU DIHUBUNGI', 'PENAWARAN', 'NEGOSIASI', 'DEAL', 'TIDAK JADI'];

var FU_PENAGIHAN = 'PENAGIHAN'; // catatan penagihan piutang (terhubung ke invoice di menu AR Invoice)

function saveFollowUp_(p, user) {
  var rec = {
    tgl: String(p.tgl || today_()), jenis: String(p.jenis || '').toUpperCase(), tahap: String(p.tahap || '').toUpperCase(),
    catatan: String(p.catatan || '').trim(), next_tgl: String(p.next_tgl || '')
  };
  if (!validDate_(rec.tgl)) throw new Error('Tanggal follow up tidak valid.');
  if (FU_JENIS.indexOf(rec.jenis) < 0) throw new Error('Jenis kontak tidak valid.');
  if (!rec.catatan) throw new Error('Hasil / catatan follow up wajib diisi.');
  if (rec.next_tgl && !validDate_(rec.next_tgl)) throw new Error('Tanggal follow up berikutnya tidak valid.');
  var janji = String(p.target_bayar || '');
  if (janji && !validDate_(janji)) throw new Error('Tanggal janji bayar tidak valid.');
  return withLock_(function () {
    var old = p.id ? readAll_('FollowUp').filter(function (r) { return r.id === p.id; })[0] : null;
    if (p.id && !old) throw new Error('Data tidak ditemukan (mungkin sudah dihapus).');
    var arId = old ? old.ar_id : String(p.ar_id || ''), ar = null;
    if (arId) {
      ar = readAR_().filter(function (r) { return r.id === arId; })[0];
      if (!ar) throw new Error('Invoice tidak ditemukan (mungkin sudah dihapus).');
      rec.tahap = FU_PENAGIHAN; rec.ar_id = arId; p.customer_id = ar.customer_id;
    } else if (FU_TAHAP.indexOf(rec.tahap) < 0) throw new Error('Tahap tidak valid.');
    var cust = readAll_('Customer').filter(function (c) { return c.id === p.customer_id; })[0];
    if (!cust) throw new Error('Customer tidak ditemukan. Pilih customer dari daftar.');
    rec.customer_id = cust.id; rec.customer = cust.nama;
    if (ar && janji) { rec.next_tgl = janji; if (ar.target_bayar !== janji) { ar.target_bayar = janji; ar.diubah_oleh = user.email; ar.diubah = now_(); updateRow_('AR', ar._row, ar); } }
    if (old) {
      rec.id = old.id; rec.oleh = old.oleh; rec.dibuat = old.dibuat; rec.diubah_oleh = user.email; rec.diubah = now_();
      updateRow_('FollowUp', old._row, rec);
      log_(user, 'UBAH FollowUp', rec.customer + ' | ' + rec.tahap);
    } else {
      rec.id = newId_('F'); rec.oleh = user.email; rec.dibuat = now_(); rec.diubah_oleh = ''; rec.diubah = '';
      appendRow_('FollowUp', rec);
      log_(user, 'TAMBAH FollowUp', rec.customer + ' | ' + rec.tahap + (ar ? ' | invoice ' + ar.doc_no : ''));
    }
    return rec;
  });
}

/* ============================================================
 * AR INVOICE (piutang: invoice yang belum terbayar)
 * Tab "AR"      = satu baris per invoice (nilai tagihan, terbayar, jatuh tempo, target bayar).
 * Tab "ARBayar" = riwayat pembayaran (bisa dicicil). Sisa & umur keterlambatan DIHITUNG otomatis dari tanggal hari ini.
 * Laporan AR dari SAP (daftar invoice yang masih terbuka) bisa ditempel lagi kapan saja:
 * saldo yang berkurang dicatat sebagai pembayaran, invoice yang hilang dari laporan dianggap lunas.
 * ============================================================ */

var AR_KAT = ['UNIT', 'SPAREPART', 'SERVICE'];

/** Kunci nama untuk mencocokkan nama customer antar-sumber: abaikan tanda baca dan PT/CV/TBK. */
function arKey_(s) { return custKey_(s).replace(/[.,]/g, ' ').replace(/\b(PT|CV|TBK)\b/g, ' ').replace(/\s+/g, ' ').trim(); }
function readAR_() { try { return readAll_('AR'); } catch (e) { return []; } }
function readARBayar_() { try { return readAll_('ARBayar'); } catch (e) { return []; } }
function dayNum_(s) { var p = String(s).split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000; }
function addDays_(s, n) { return new Date((dayNum_(s) + n) * 86400000).toISOString().slice(0, 10); }
function r2_(n) { return Math.round(n * 100) / 100; }

/** Tambahkan sisa, hari terlambat, bucket umur, dan status ke satu baris AR. */
function arEnrich_(r, today) {
  var o = {}; Object.keys(r).forEach(function (k) { o[k] = r[k]; });
  var sisa = r2_(r.nilai - r.bayar);
  if (sisa < 0.5) sisa = 0;
  var telat = sisa > 0 && r.jatuh_tempo && today > r.jatuh_tempo ? Math.round(dayNum_(today) - dayNum_(r.jatuh_tempo)) : 0;
  o.sisa = sisa; o.telat = telat;
  o.bucket = sisa === 0 ? 'LUNAS' : telat <= 0 ? 'BELUM_JT' : telat <= 30 ? 'B1' : telat <= 60 ? 'B2' : telat <= 90 ? 'B3' : telat <= 120 ? 'B4' : 'B5';
  o.status = sisa === 0 ? 'LUNAS' : r.bayar > 0 ? 'SEBAGIAN' : 'BELUM';
  return o;
}

function arList_() { var t = today_(); return readAR_().map(function (r) { return arEnrich_(r, t); }); }

function arSummary_(list) {
  var s = { n: 0, total: 0, overdue: 0, nOver: 0, over90: 0, belumJt: 0, asOf: '', buckets: {} }, asof = '';
  ['BELUM_JT', 'B1', 'B2', 'B3', 'B4', 'B5'].forEach(function (b) { s.buckets[b] = { n: 0, val: 0 }; });
  list.forEach(function (r) {
    var m = /LAPORAN AR (\d{4}-\d{2}-\d{2})/.exec(r.sumber || ''); if (m && m[1] > asof) asof = m[1];
    if (r.sisa <= 0) return;
    s.n++; s.total += r.sisa; s.buckets[r.bucket].n++; s.buckets[r.bucket].val += r.sisa;
    if (r.telat > 0) { s.overdue += r.sisa; s.nOver++; if (r.telat > 90) s.over90 += r.sisa; } else s.belumJt += r.sisa;
  });
  s.asOf = asof; s.total = r2_(s.total); s.overdue = r2_(s.overdue); s.over90 = r2_(s.over90); s.belumJt = r2_(s.belumJt);
  return s;
}

function listAR_() { return { today: today_(), list: arList_(), pay: readARBayar_(), kategori: AR_KAT }; }


function arFindCustomer_(name, custs) {
  var k = custKey_(name), k2 = arKey_(name);
  return custs.filter(function (c) { return custKey_(c.nama) === k; })[0] || custs.filter(function (c) { return arKey_(c.nama) === k2; })[0] || null;
}
function newCustomerFromAR_(name, grup, user) {
  return { id: newId_('C'), nama: name, grup: String(grup || '').trim().toUpperCase(), aktivitas: 'AKTIF', populasi: 0, rata_unit: 0, inv_2023: 0, inv_2024: 0, inv_2025: 0, inv_2026: 0, catatan: 'Ditambahkan otomatis dari data piutang (AR)', updated_by: user.email, updated_at: now_() };
}

/* ---- Penautan invoice AR -> Quotation (lewat No. PO customer + nama customer; tanpa kolom baru) ----
 * Penanda di catatan quotation:
 *   QINV_MARK  = nilai penjualan quotation ini mengikuti total invoice AR (diperbarui otomatis).
 *   QINV_AUTO  = baris quotation dibuat otomatis dari invoice (dihapus lagi bila semua invoicenya dihapus).
 * Kategori AR -> Quotation: SPAREPART = PARTS, SERVICE = PTS. UNIT tidak masuk Quotation. */
var QINV_MARK = '[mengikuti invoice AR]';
var QINV_AUTO = 'Dibuat otomatis dari invoice AR';
function poKey_(s) { return String(s || '').replace(/\s+/g, '').toUpperCase(); }
function arQuotKat_(k) { return k === 'SPAREPART' ? 'PARTS' : k === 'SERVICE' ? 'PTS' : ''; }
function findQuotForAR_(noPo, customer, quotes) {
  var k = poKey_(noPo), c = arKey_(customer);
  if (!k) return null;
  return (quotes || readAll_('Quotation')).filter(function (q) { return poKey_(q.no_po) === k && arKey_(q.customer) === c; })[0] || null;
}
function invoicesForPO_(noPo, customer, ars) {
  var k = poKey_(noPo), c = arKey_(customer);
  if (!k) return [];
  return (ars || readAR_()).filter(function (r) { return poKey_(r.no_ref) === k && arKey_(r.customer) === c && arQuotKat_(r.kategori); });
}
/** Samakan baris Quotation dengan invoice AR yang memakai No. PO yang sama. Mengembalikan 'DIBUAT' | 'TERJUAL' | 'DIPERBARUI' | 'DIHAPUS' | 'DIKEMBALIKAN' | ''. */
function syncQuotFromAR_(noPo, customer, user, opt) {
  if (!poKey_(noPo)) return '';
  var quotes = readAll_('Quotation'), q = findQuotForAR_(noPo, customer, quotes), invs = invoicesForPO_(noPo, customer);
  var created = false;
  if (!q) {
    if (!(opt && opt.buat) || !invs.length) return '';
    var first = invs.slice().sort(function (a, b) { return a.tgl < b.tgl ? -1 : 1; })[0];
    q = { id: newId_('Q'), tgl: first.tgl, no_quot: '', no_po: String(noPo).trim(), customer: first.customer, kategori: arQuotKat_(first.kategori), nilai_quot: first.nilai, status: 'TERJUAL',
      tgl_po: first.tgl, nilai_po: first.nilai, tgl_jual: first.tgl, nilai_jual: first.nilai, catatan: QINV_AUTO + ' ' + first.doc_no + ' ' + QINV_MARK,
      created_by: user.email, created_at: now_(), updated_by: '', updated_at: '', bukti_quot: '', bukti_po: '' };
    appendRow_('Quotation', q); created = true;
    q = findQuotForAR_(noPo, customer) || q; // baca ulang agar punya nomor baris
    log_(user, 'TAMBAH Quotation', q.id + ' | ' + q.customer + ' | ' + q.nilai_quot + ' (otomatis dari invoice ' + first.doc_no + ')');
  }
  var managed = String(q.catatan || '').indexOf(QINV_MARK) >= 0, auto = String(q.catatan || '').indexOf(QINV_AUTO) === 0;
  if (!invs.length) {
    if (!managed) return '';
    if (auto) { sheet_('Quotation').deleteRow(q._row); log_(user, 'HAPUS Quotation', q.id + ' | ' + q.customer + ' (invoice terkait dihapus)'); return 'DIHAPUS'; }
    q.status = 'PO'; q.tgl_jual = ''; q.nilai_jual = 0; q.catatan = String(q.catatan || '').replace(QINV_MARK, '').replace(/\s+$/, '');
    q.updated_by = user.email; q.updated_at = now_(); updateRow_('Quotation', q._row, q);
    log_(user, 'UBAH Quotation', q.id + ' | ' + q.customer + ' | kembali ke PO (invoice terkait dihapus)');
    return 'DIKEMBALIKAN';
  }
  if (!managed && q.status === 'TERJUAL') return ''; // sudah diisi manual: biarkan, jangan dihitung dua kali
  if (q.status !== 'PO' && q.status !== 'TERJUAL') return '';
  var total = 0, maxTgl = '', minTgl = '9999-12-31';
  invs.forEach(function (r) { total += r.nilai; if (r.tgl > maxTgl) maxTgl = r.tgl; if (r.tgl < minTgl) minTgl = r.tgl; });
  total = r2_(total);
  var wasSold = q.status === 'TERJUAL';
  if (!created && wasSold && managed && q.nilai_jual === total && q.tgl_jual === maxTgl && (!auto || (q.nilai_quot === total && q.nilai_po === total))) return '';
  q.status = 'TERJUAL'; q.nilai_jual = total; q.tgl_jual = maxTgl;
  if (!q.tgl_po || q.tgl_po > q.tgl_jual) q.tgl_po = q.tgl_jual;
  if (!(q.nilai_po > 0)) q.nilai_po = total;
  if (auto) { q.nilai_quot = total; q.nilai_po = total; q.tgl = minTgl; q.tgl_po = minTgl; }
  if (!managed && !created) q.catatan = (String(q.catatan || '') + ' ' + QINV_MARK).replace(/^\s+/, '');
  if (!created) { q.updated_by = user.email; q.updated_at = now_(); }
  updateRow_('Quotation', q._row, q);
  if (!created) log_(user, 'UBAH Quotation', q.id + ' | ' + q.customer + ' | TERJUAL dari invoice AR');
  try { ensureCustomer_({ customer: q.customer, status: 'TERJUAL' }, user, ''); } catch (e) { }
  return created ? 'DIBUAT' : wasSold ? 'DIPERBARUI' : 'TERJUAL';
}
/** Pemeriksaan sebelum simpan invoice: apakah No. PO belum ada di Quotation (perlu konfirmasi membuat baris)? */
function cekQuotAR_(p) {
  var noPo = String(p.no_ref || '').trim(), kat = String(p.kategori || '').toUpperCase(), cust = String(p.customer || '').trim();
  if (!noPo || !cust || !arQuotKat_(kat)) return { perlu: false, ada: false };
  var q = findQuotForAR_(noPo, cust);
  return { perlu: !q, ada: !!q, status: q ? q.status : '', kategori: arQuotKat_(kat) };
}

function saveAR_(p, user) {
  var rec = {};
  rec.doc_no = String(p.doc_no || '').trim();
  if (!rec.doc_no) throw new Error('No. invoice wajib diisi.');
  rec.customer = String(p.customer || '').trim();
  if (!rec.customer) throw new Error('Nama customer wajib diisi.');
  rec.tgl = String(p.tgl || today_());
  if (!validDate_(rec.tgl)) throw new Error('Tanggal invoice tidak valid.');
  rec.jatuh_tempo = String(p.jatuh_tempo || '') || addDays_(rec.tgl, 30);
  if (!validDate_(rec.jatuh_tempo)) throw new Error('Tanggal jatuh tempo tidak valid.');
  if (rec.jatuh_tempo < rec.tgl) throw new Error('Jatuh tempo tidak boleh sebelum tanggal invoice.');
  rec.no_ref = String(p.no_ref || '').trim();
  rec.kategori = String(p.kategori || '').toUpperCase();
  if (AR_KAT.indexOf(rec.kategori) < 0) throw new Error('Kategori harus UNIT, SPAREPART, atau SERVICE.');
  rec.cabang = String(p.cabang || 'SPT').trim().toUpperCase();
  rec.nilai = r2_(num_(p.nilai));
  if (!(rec.nilai > 0)) throw new Error('Nilai tagihan harus lebih dari 0.');
  rec.target_bayar = String(p.target_bayar || '');
  if (rec.target_bayar && !validDate_(rec.target_bayar)) throw new Error('Tanggal target bayar tidak valid.');
  rec.target_ket = String(p.target_ket || '').trim();
  rec.keterangan = String(p.keterangan || '').trim();
  return withLock_(function () {
    var all = readAR_(), custs = readAll_('Customer');
    var dup = all.filter(function (r) { return r.doc_no === rec.doc_no && r.id !== p.id; })[0];
    if (dup) throw new Error('Invoice No. ' + rec.doc_no + ' sudah tercatat (' + dup.customer + '). Gunakan tombol Ubah pada data tersebut.');
    var c = arFindCustomer_(rec.customer, custs);
    if (!c) { c = newCustomerFromAR_(rec.customer, p.grup, user); appendRow_('Customer', c); log_(user, 'TAMBAH Customer', c.nama + ' (otomatis dari AR)'); }
    rec.customer_id = c.id; rec.customer = c.nama;
    var oldRef = null, quotInfo = '';
    if (p.id) {
      var old = all.filter(function (r) { return r.id === p.id; })[0];
      if (!old) throw new Error('Data tidak ditemukan (mungkin sudah dihapus).');
      if (rec.nilai < old.bayar - 0.5) throw new Error('Nilai tagihan tidak boleh lebih kecil dari yang sudah dibayar (Rp ' + old.bayar + ').');
      rec.id = old.id; rec.bayar = old.bayar; rec.sumber = old.sumber; rec.dibuat_oleh = old.dibuat_oleh; rec.dibuat = old.dibuat;
      rec.diubah_oleh = user.email; rec.diubah = now_();
      updateRow_('AR', old._row, rec);
      log_(user, 'UBAH AR', rec.doc_no + ' | ' + rec.customer);
      oldRef = old;
    } else {
      rec.id = newId_('A'); rec.bayar = 0; rec.sumber = 'MANUAL'; rec.dibuat_oleh = user.email; rec.dibuat = now_(); rec.diubah_oleh = ''; rec.diubah = '';
      appendRow_('AR', rec);
      log_(user, 'TAMBAH AR', rec.doc_no + ' | ' + rec.customer + ' | ' + rec.nilai);
    }
    try {
      if (oldRef && (poKey_(oldRef.no_ref) !== poKey_(rec.no_ref) || arKey_(oldRef.customer) !== arKey_(rec.customer))) syncQuotFromAR_(oldRef.no_ref, oldRef.customer, user);
      quotInfo = syncQuotFromAR_(rec.no_ref, rec.customer, user, { buat: p.quot_aksi === 'BUAT' });
    } catch (e) { quotInfo = ''; /* tab Quotation tidak terbaca: invoice tetap tersimpan */ }
    var out = arEnrich_(rec, today_()); out.quot_info = quotInfo;
    return out;
  });
}

function deleteAR_(p, user) {
  return withLock_(function () {
    var rec = readAR_().filter(function (r) { return r.id === p.id; })[0];
    if (!rec) throw new Error('Data tidak ditemukan (mungkin sudah dihapus).');
    var sh = sheet_('AR');
    readARBayar_().filter(function (b) { return b.ar_id === rec.id; }).map(function (b) { return b._row; }).sort(function (a, b) { return b - a; }).forEach(function (r) { sheet_('ARBayar').deleteRow(r); });
    readAll_('FollowUp').filter(function (f) { return f.ar_id === rec.id; }).map(function (f) { return f._row; }).sort(function (a, b) { return b - a; }).forEach(function (r) { sheet_('FollowUp').deleteRow(r); });
    sh.deleteRow(rec._row);
    log_(user, 'HAPUS AR', rec.doc_no + ' | ' + rec.customer);
    var qi = '';
    try { qi = syncQuotFromAR_(rec.no_ref, rec.customer, user); } catch (e) { }
    return { id: rec.id, quot_info: qi };
  });
}

function payAR_(p, user) {
  var tgl = String(p.tgl || today_()), jml = r2_(num_(p.jumlah));
  if (!validDate_(tgl)) throw new Error('Tanggal pembayaran tidak valid.');
  if (!(jml > 0)) throw new Error('Jumlah pembayaran harus lebih dari 0.');
  return withLock_(function () {
    var ar = readAR_().filter(function (r) { return r.id === p.ar_id; })[0];
    if (!ar) throw new Error('Invoice tidak ditemukan (mungkin sudah dihapus).');
    var sisa = r2_(ar.nilai - ar.bayar);
    if (jml > sisa + 0.5) throw new Error('Pembayaran (Rp ' + jml + ') melebihi sisa tagihan (Rp ' + sisa + ').');
    ar.bayar = jml >= sisa - 0.5 ? ar.nilai : r2_(ar.bayar + jml);
    ar.diubah_oleh = user.email; ar.diubah = now_();
    updateRow_('AR', ar._row, ar);
    appendRow_('ARBayar', { id: newId_('B'), ar_id: ar.id, tgl: tgl, jumlah: jml, ket: String(p.ket || '').trim(), oleh: user.email, dibuat: now_() });
    log_(user, 'BAYAR AR', ar.doc_no + ' | ' + ar.customer + ' | ' + jml);
    return arEnrich_(ar, today_());
  });
}

function deletePay_(p, user) {
  return withLock_(function () {
    var b = readARBayar_().filter(function (x) { return x.id === p.id; })[0];
    if (!b) throw new Error('Data pembayaran tidak ditemukan.');
    var ar = readAR_().filter(function (r) { return r.id === b.ar_id; })[0];
    if (ar) { ar.bayar = Math.max(0, r2_(ar.bayar - b.jumlah)); ar.diubah_oleh = user.email; ar.diubah = now_(); updateRow_('AR', ar._row, ar); }
    sheet_('ARBayar').deleteRow(b._row);
    log_(user, 'BATAL BAYAR AR', (ar ? ar.doc_no : b.ar_id) + ' | ' + b.jumlah);
    return { id: b.id };
  });
}

/** Samakan data AR dengan laporan AR (daftar invoice yang masih terbuka per tanggal asOf).
 *  dry=true hanya menghitung rencana perubahan (pratinjau), tanpa menulis. */
function applyARReport_(rows, asOf, user, dry) {
  if (!validDate_(String(asOf || ''))) throw new Error('Tanggal laporan AR tidak valid.');
  if (!rows || !rows.length) throw new Error('Laporan AR kosong.');
  var seen = {}, clean = [];
  rows.forEach(function (r, i) {
    var o = {
      doc_no: String(r.doc_no || '').trim(), customer: String(r.customer || '').trim(), tgl: String(r.tgl || ''), jatuh_tempo: String(r.jatuh_tempo || ''),
      no_ref: String(r.no_ref || '').trim(), kategori: String(r.kategori || '').trim().toUpperCase(), cabang: String(r.cabang || '').trim().toUpperCase(),
      balance: r2_(num_(r.balance)), keterangan: String(r.keterangan || '').trim(), target_bayar: String(r.target_bayar || '').trim(), target_ket: String(r.target_ket || '').trim()
    };
    if (!o.doc_no && !o.customer && !o.balance) return;
    var at = 'Baris ' + (i + 1) + (o.doc_no ? ' (' + o.doc_no + ')' : '') + ': ';
    if (!o.doc_no) throw new Error(at + 'No. invoice (Doc. No.) kosong.');
    if (!o.customer) throw new Error(at + 'nama customer (BP Name) kosong.');
    if (seen[o.doc_no]) throw new Error('No. invoice ' + o.doc_no + ' muncul lebih dari sekali di laporan.');
    if (!validDate_(o.tgl)) throw new Error(at + 'tanggal posting tidak valid.');
    if (!validDate_(o.jatuh_tempo)) throw new Error(at + 'tanggal jatuh tempo (Due Date) tidak valid.');
    if (AR_KAT.indexOf(o.kategori) < 0) throw new Error(at + 'kolom AR harus UNIT, SPAREPART, atau SERVICE.');
    if (o.target_bayar && !validDate_(o.target_bayar)) { o.target_ket = o.target_ket || o.target_bayar; o.target_bayar = ''; }
    if (o.keterangan.toUpperCase() === 'CURRENT') o.keterangan = '';
    if (!(o.balance > 0)) return; // saldo 0 = sudah lunas, dianggap tidak ada di laporan
    seen[o.doc_no] = 1; clean.push(o);
  });
  if (!clean.length) throw new Error('Tidak ada baris dengan saldo > 0 di laporan.');
  var src = 'LAPORAN AR ' + asOf, totalLaporan = 0;
  return withLock_(function () {
    var existing = readAR_(), byDoc = {}, custs = readAll_('Customer'), newCusts = {}, plan = { add: [], upd: [], close: [], same: 0 }, pays = [];
    existing.forEach(function (r) { byDoc[r.doc_no] = r; });
    function custOf(name) {
      var c = arFindCustomer_(name, custs.concat(Object.keys(newCusts).map(function (k) { return newCusts[k]; })));
      if (!c) { c = newCustomerFromAR_(name, '', user); newCusts[arKey_(name)] = c; }
      return c;
    }
    clean.forEach(function (o) {
      totalLaporan += o.balance;
      var c = custOf(o.customer), ex = byDoc[o.doc_no];
      if (!ex) {
        plan.add.push({ id: newId_('A'), doc_no: o.doc_no, customer_id: c.id, customer: c.nama, tgl: o.tgl, jatuh_tempo: o.jatuh_tempo, no_ref: o.no_ref, kategori: o.kategori, cabang: o.cabang || 'SPT',
          nilai: o.balance, bayar: 0, target_bayar: o.target_bayar, target_ket: o.target_ket, keterangan: o.keterangan, sumber: src, dibuat_oleh: user.email, dibuat: now_(), diubah_oleh: '', diubah: '' });
        return;
      }
      var nx = {}; Object.keys(ex).forEach(function (k) { nx[k] = ex[k]; });
      var changed = false, set = function (k, v) { if (v !== '' && v !== nx[k]) { nx[k] = v; changed = true; } };
      set('customer_id', c.id); set('customer', c.nama); set('tgl', o.tgl); set('jatuh_tempo', o.jatuh_tempo); set('no_ref', o.no_ref); set('kategori', o.kategori); set('cabang', o.cabang);
      set('keterangan', o.keterangan); set('target_bayar', o.target_bayar); set('target_ket', o.target_ket);
      var sisa = r2_(ex.nilai - ex.bayar), info = '';
      if (o.balance < sisa - 0.5) { var d = r2_(sisa - o.balance); nx.bayar = r2_(ex.bayar + d); pays.push({ ar: ex, jumlah: d, ket: 'Selisih saldo pada laporan AR ' + asOf }); changed = true; info = 'bayar'; }
      else if (o.balance > sisa + 0.5) { nx.nilai = r2_(ex.nilai + (o.balance - sisa)); changed = true; info = 'naik'; }
      if (changed) { nx.sumber = src; nx.diubah_oleh = user.email; nx.diubah = now_(); plan.upd.push({ old: ex, nx: nx, info: info, saldo: o.balance }); } else plan.same++;
    });
    existing.forEach(function (ex) {
      var sisa = r2_(ex.nilai - ex.bayar);
      if (sisa >= 0.5 && !seen[ex.doc_no] && ex.tgl <= asOf && /^LAPORAN AR/.test(ex.sumber || '')) { // invoice input manual tidak ikut ditutup otomatis
        var nx = {}; Object.keys(ex).forEach(function (k) { nx[k] = ex[k]; });
        nx.bayar = ex.nilai; nx.sumber = src; nx.diubah_oleh = user.email; nx.diubah = now_();
        pays.push({ ar: ex, jumlah: sisa, ket: 'Tidak ada lagi di laporan AR ' + asOf + ' (dianggap lunas)' });
        plan.close.push({ old: ex, nx: nx, sisa: sisa });
      }
    });
    var newCustList = Object.keys(newCusts).map(function (k) { return newCusts[k]; });
    if (!dry) {
      appendRows_('Customer', newCustList);
      appendRows_('AR', plan.add);
      plan.upd.concat(plan.close).forEach(function (u) { updateRow_('AR', u.old._row, u.nx); });
      appendRows_('ARBayar', pays.map(function (p) { return { id: newId_('B'), ar_id: p.ar.id, tgl: asOf, jumlah: p.jumlah, ket: p.ket, oleh: user.email, dibuat: now_() }; }));
      log_(user, 'IMPOR AR', asOf + ' | baru ' + plan.add.length + ', ubah ' + plan.upd.length + ', lunas otomatis ' + plan.close.length);
    }
    var short = function (a, f) { return a.slice(0, 40).map(f); };
    return {
      dry: !!dry, asOf: asOf, n_laporan: clean.length, total_laporan: r2_(totalLaporan),
      n_baru: plan.add.length, n_ubah: plan.upd.length, n_lunas: plan.close.length, n_sama: plan.same,
      baru: short(plan.add, function (r) { return { doc_no: r.doc_no, customer: r.customer, nilai: r.nilai }; }),
      ubah: short(plan.upd, function (u) { return { doc_no: u.old.doc_no, customer: u.nx.customer, info: u.info, dari: r2_(u.old.nilai - u.old.bayar), ke: u.saldo }; }),
      lunas: short(plan.close, function (u) { return { doc_no: u.old.doc_no, customer: u.old.customer, sisa: u.sisa }; }),
      customer_baru: newCustList.map(function (c) { return c.nama; })
    };
  });
}

/** Daftar customer + invoice per tahun + status/growth terhitung untuk tahun terpilih.
 *  Angka historis 2023-2026 adalah periode Jan-Okt (sama-sama s.d. 31 Okt) agar bisa dibandingkan apple-to-apple.
 *  Penjualan Terjual setelah 31 Okt 2026 dipisah sebagai "late" (Nov-Des 2026): tidak mengubah perbandingan Jan-Okt,
 *  tetapi ikut dihitung sebagai bagian 2026 saat melihat tahun 2027 dst. Tahun >= 2027 = setahun penuh dari tab Quotation. */
/* ============================================================
 * BACKUP DATA
 * Format JSON yang berdiri sendiri (tidak bergantung pada posisi kolom Sheets) supaya mudah diimpor
 * ke sistem lain, misalnya website baru. Dokumentasi format: BACKUP_FORMAT.md
 * ============================================================ */

var BACKUP_FORMAT = 'ipe-aftersales-backup', BACKUP_VERSION = 1, BACKUP_KEEP = 30;

function buildBackup_(user, incLog) {
  var data = {}, jumlah = {}, skema = {};
  Object.keys(SCHEMA).forEach(function (n) {
    if (n === 'Log' && !incLog) return;
    var rows = [];
    try { rows = readAll_(n); } catch (e) { rows = []; } // tab belum dibuat = kosong
    data[n] = rows.map(function (r) { var o = {}; Object.keys(r).forEach(function (k) { if (k !== '_row') o[k] = r[k]; }); return o; });
    jumlah[n] = data[n].length;
    skema[n] = SCHEMA[n].map(function (c) { return { key: c[0], header: c[1], tipe: c[2] === 'n' ? 'angka' : c[2] === 'd' ? 'tanggal (yyyy-MM-dd)' : c[2] === 'u' ? 'teks (huruf besar)' : 'teks' }; });
  });
  return {
    meta: { format: BACKUP_FORMAT, versi: BACKUP_VERSION, aplikasi: APP_NAME, dibuat: Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ssXXX"), zona_waktu: TZ, dibuat_oleh: user && user.email || '', jumlah: jumlah, termasuk_log: !!incLog },
    skema: skema,
    data: data
  };
}








/* ---- PIC per grup customer (diisi admin) ---- */
function readGrupPIC_() { try { return readAll_('GrupPIC'); } catch (e) { return []; } }
function picMap_() { var m = {}; readGrupPIC_().forEach(function (r) { if (r.grup && r.pic) m[r.grup] = r.pic; }); return m; }


function saveGrupPIC_(p, user) {
  var grup = String(p.grup == null ? '' : p.grup).trim().toUpperCase(), pic = String(p.pic == null ? '' : p.pic).trim();
  if (!grup) throw new Error('Grup belum diatur untuk customer ini. Isi grup di data customer terlebih dahulu.');
  if (pic.length > 80) throw new Error('Nama PIC maksimal 80 karakter.');
  return withLock_(function () {
    ensureTab_('GrupPIC');
    var old = readAll_('GrupPIC').filter(function (r) { return r.grup === grup; })[0], oldPic = old ? old.pic : '';
    if (old) updateRow_('GrupPIC', old._row, { id: old.id, grup: grup, pic: pic, updated_by: user.email, updated_at: now_() });
    else if (pic) appendRow_('GrupPIC', { id: newId_('P'), grup: grup, pic: pic, updated_by: user.email, updated_at: now_() });
    if (oldPic !== pic) log_(user, 'UBAH PIC Grup', grup + ': ' + (oldPic || '-') + ' → ' + (pic || '-'));
    return { grup: grup, pic: pic };
  });
}

function customers_(year) {
  var quotes = readAll_('Quotation'), by = {};
  quotes.forEach(function (q) {
    var k = custKey_(q.customer), o = by[k] || (by[k] = { inv: {}, nq: 0, vq: 0, open: 0 });
    if (q.status === 'TERJUAL') {
      var d = q.tgl_jual || q.tgl_po || q.tgl;
      if (d && d > CUST_CUTOFF) { var y = +d.slice(0, 4); o.inv[y] = (o.inv[y] || 0) + q.nilai_jual; }
    }
    if (q.status === 'QUOTATION' || q.status === 'CARRY OVER') o.open += q.nilai_quot;
    if (q.tgl && +q.tgl.slice(0, 4) === year && q.status !== 'BATAL') { o.nq++; o.vq += q.nilai_quot; }
  });
  var arBy = {};
  arList_().forEach(function (r) {
    if (r.sisa <= 0) return;
    var k = r.customer_id || 'K:' + arKey_(r.customer), o = arBy[k] || (arBy[k] = { sisa: 0, telat: 0, n: 0, maxTelat: 0 });
    o.n++; o.sisa += r.sisa; if (r.telat > 0) { o.telat += r.sisa; if (r.telat > o.maxTelat) o.maxTelat = r.telat; }
  });
  var cy = new Date().getFullYear(), maxY = Math.max(2026, year, cy), years = [];
  for (var y = 2023; y <= maxY; y++) years.push(y);
  return {
    years: years, cutoff: CUST_CUTOFF, pics: picMap_(),
    list: readAll_('Customer').map(function (c) {
      var q = by[custKey_(c.nama)] || { inv: {}, nq: 0, vq: 0, open: 0 }, inv = {};
      years.forEach(function (y) {
        inv[y] = y <= 2025 ? (c['inv_' + y] || 0) : y === 2026 ? (c.inv_2026 || 0) + (q.inv[2026] || 0) : // 2026 = data awal Jan-Okt + penjualan setelah 31 Okt dari Quotation
           (q.inv[y] || 0);
      });
      var cur = inv[year] || 0, prev = year > 2023 ? (inv[year - 1] || 0) : null, earlier = 0;
      years.forEach(function (y) { if (y < year) earlier += inv[y]; });
      var st;
      if (year <= 2023) st = cur > 0 ? 'Ada Invoice' : 'Belum Pernah Beli';
      else if (cur === 0) st = earlier > 0 ? 'Berhenti Beli' : 'Belum Pernah Beli';
      else if (year === 2026 && !(c.inv_2026 > 0)) st = earlier > 0 ? 'Beli Lagi' : 'Baru'; // tidak ada invoice Jan-Okt, baru beli sesudah 31 Okt
      else if (earlier === 0) st = 'Baru';
      else st = cur > prev * 1.05 ? 'Naik' : cur < prev * 0.95 ? 'Turun' : 'Stabil'; // selisih dalam ±5% = Stabil
      return {
        id: c.id, nama: c.nama, grup: c.grup, aktivitas: c.aktivitas, populasi: c.populasi, rata_unit: c.rata_unit, catatan: c.catatan,
        hist: { inv_2023: c.inv_2023, inv_2024: c.inv_2024, inv_2025: c.inv_2025, inv_2026: c.inv_2026 },
        inv: inv, status: st, growth: year > 2023 && inv[2023] > 0 ? (cur - inv[2023]) / inv[2023] : null,
        late: 0, nq: q.nq, vq: q.vq, open: q.open,
        piutang: arBy[c.id] || arBy['K:' + arKey_(c.nama)] || { sisa: 0, telat: 0, n: 0, maxTelat: 0 }
      };
    })
  };
}

/* ============================================================
 * RINGKASAN BULANAN (data awal / rekap tanpa rincian customer)
 * ============================================================ */

function saveRingkasan_(p, user) {
  var y = num_(p.tahun), m = num_(p.bulan);
  if (y < 2000 || y > 2100) throw new Error('Tahun tidak valid.');
  if (m < 1 || m > 12) throw new Error('Bulan tidak valid.');
  var rec = { id: 'R' + y + '-' + (m < 10 ? '0' + m : m), tahun: y, bulan: m, ket: String(p.ket || '').trim() };
  ['qp_n', 'qp_val', 'qp_dn', 'qp_po', 'qs_n', 'qs_val', 'qs_dn', 'qs_po', 's_parts', 's_bundling', 's_pts', 's_labour'].forEach(function (k) {
    rec[k] = Math.max(0, num_(p[k]));
  });
  return withLock_(function () {
    var old = readAll_('Ringkasan').filter(function (r) { return r.tahun === y && r.bulan === m; })[0];
    if (old) updateRow_('Ringkasan', old._row, rec); else appendRow_('Ringkasan', rec);
    log_(user, (old ? 'UBAH' : 'TAMBAH') + ' Ringkasan', rec.id);
    return rec;
  });
}

/* ============================================================
 * TARGET
 * ============================================================ */

var TARGET_KEYS = ['parts', 'bundling', 'pts', 'labour']; // 'Lain-lain' sudah dihapus dari aplikasi (kolom lama di Sheets diabaikan)

/** Target per kategori per bulan untuk satu tahun. total = jumlah semua kategori. */
function getTargets_(year) {
  var out = [];
  for (var m = 1; m <= 12; m++) out.push({ bulan: m, parts: 0, bundling: 0, pts: 0, labour: 0, total: 0, ket: '' });
  readAll_('Target').forEach(function (t) {
    if (t.tahun === year && t.bulan >= 1 && t.bulan <= 12) {
      var o = out[t.bulan - 1];
      o.parts = t.t_parts; o.bundling = t.t_bundling; o.pts = t.t_pts; o.labour = t.t_labour; o.ket = t.ket;
    }
  });
  out.forEach(function (o) { o.total = o.parts + o.bundling + o.pts + o.labour; });
  return out;
}

function saveTargets_(p, user) {
  var year = num_(p.year);
  if (year < 2000 || year > 2100) throw new Error('Tahun tidak valid.');
  var items = p.targets || [];
  return withLock_(function () {
    var sh = sheet_('Target');
    readAll_('Target').filter(function (t) { return t.tahun === year; }).map(function (t) { return t._row; })
      .sort(function (a, b) { return b - a; }).forEach(function (r) { sh.deleteRow(r); });
    items.forEach(function (it) {
      var m = num_(it.bulan);
      if (m < 1 || m > 12) return;
      appendRow_('Target', {
        tahun: year, bulan: m, t_parts: Math.max(0, num_(it.parts)), t_bundling: Math.max(0, num_(it.bundling)), t_pts: Math.max(0, num_(it.pts)),
        t_labour: Math.max(0, num_(it.labour)), t_lain: 0, ket: String(it.ket || '')
      });
    });
    log_(user, 'SIMPAN Target', String(year));
    return getTargets_(year);
  });
}





/* ============================================================
 * AGREGASI: DASHBOARD
 * ============================================================ */

function ymOf_(s) { // tanggal rusak (mis. bulan 13 hasil ketik manual di Sheet) diabaikan, tidak boleh merusak seluruh laporan
  if (!s) return null;
  var y = +s.slice(0, 4), m = +s.slice(5, 7);
  return y >= 1900 && m >= 1 && m <= 12 ? { y: y, m: m } : null;
}
function isDeal_(r) { return r.status === 'PO' || r.status === 'TERJUAL'; }
function salesDate_(r) { return r.tgl_jual || r.tgl_po || r.tgl; }

function emptyMonth_(m) {
  return {
    bulan: m, target: 0, tg: { parts: 0, bundling: 0, pts: 0, labour: 0 }, achc: { parts: null, bundling: null, pts: null, labour: null },
    qp: { n: 0, val: 0, dn: 0, po: 0 }, qs: { n: 0, val: 0, dn: 0, po: 0 },
    sales: { parts: 0, bundling: 0, pts: 0, labour: 0, service: 0, total: 0 },
    open: { n: 0, val: 0 }, carry: { n: 0, val: 0 }, batal: { n: 0, val: 0 },
    ach: null
  };
}

/** Gabungkan transaksi per-customer + ringkasan bulanan menjadi 12 bulan. */
function aggregateMonths_(year, quotes, ringkasan, targets) {
  var months = [];
  for (var i = 1; i <= 12; i++) months.push(emptyMonth_(i));

  quotes.forEach(function (r) {
    var d = ymOf_(r.tgl);
    if (d && d.y === year) {
      var M = months[d.m - 1], g = isPartsGroup_(r.kategori) ? M.qp : M.qs;
      g.n++; g.val += r.nilai_quot;
      if (isDeal_(r)) { g.dn++; g.po += r.nilai_po; }
      if (r.status === 'QUOTATION') { M.open.n++; M.open.val += r.nilai_quot; }
      if (r.status === 'CARRY OVER') { M.carry.n++; M.carry.val += r.nilai_quot; }
      if (r.status === 'BATAL') { M.batal.n++; M.batal.val += r.nilai_quot; }
    }
    if (r.status === 'TERJUAL') {
      var s = ymOf_(salesDate_(r));
      if (s && s.y === year) {
        var S = months[s.m - 1].sales;
        if (r.kategori === 'PARTS') S.parts += r.nilai_jual;
        else if (r.kategori === 'BUNDLING') S.bundling += r.nilai_jual;
        else if (r.kategori === 'LABOUR') S.labour += r.nilai_jual;
        else S.pts += r.nilai_jual; // PTS & data lama 'SERVICE'
      }
    }
  });

  ringkasan.forEach(function (r) {
    if (r.tahun !== year || r.bulan < 1 || r.bulan > 12) return;
    var M = months[r.bulan - 1];
    M.qp.n += r.qp_n; M.qp.val += r.qp_val; M.qp.dn += r.qp_dn; M.qp.po += r.qp_po;
    M.qs.n += r.qs_n; M.qs.val += r.qs_val; M.qs.dn += r.qs_dn; M.qs.po += r.qs_po;
    M.sales.parts += r.s_parts; M.sales.bundling += r.s_bundling; M.sales.pts += r.s_pts; M.sales.labour += r.s_labour;
  });

  targets.forEach(function (t) {
    if (t.tahun !== year || t.bulan < 1 || t.bulan > 12) return;
    var tg = months[t.bulan - 1].tg;
    tg.parts += t.t_parts; tg.bundling += t.t_bundling; tg.pts += t.t_pts; tg.labour += t.t_labour;
  });

  months.forEach(function (M) {
    M.sales.service = M.sales.pts + M.sales.labour;
    M.sales.total = M.sales.parts + M.sales.bundling + M.sales.service;
    M.target = M.tg.parts + M.tg.bundling + M.tg.pts + M.tg.labour;
    M.ach = M.target > 0 ? M.sales.total / M.target : null;
    TARGET_KEYS.forEach(function (k) { M.achc[k] = M.tg[k] > 0 ? M.sales[k] / M.tg[k] : null; });
  });
  return months;
}

function sumMonths_(months, from, to) {
  var t = { target: 0, tg: { parts: 0, bundling: 0, pts: 0, labour: 0 }, achc: {}, sales: 0, parts: 0, bundling: 0, pts: 0, labour: 0, service: 0, qn: 0, qval: 0, dn: 0, po: 0 };
  for (var i = from - 1; i < to; i++) {
    var M = months[i];
    t.target += M.target; TARGET_KEYS.forEach(function (k) { t.tg[k] += M.tg[k]; }); t.sales += M.sales.total; t.parts += M.sales.parts; t.bundling += M.sales.bundling; t.pts += M.sales.pts; t.labour += M.sales.labour; t.service += M.sales.service;
    t.qn += M.qp.n + M.qs.n; t.qval += M.qp.val + M.qs.val; t.dn += M.qp.dn + M.qs.dn; t.po += M.qp.po + M.qs.po;
  }
  t.ach = t.target > 0 ? t.sales / t.target : null;
  TARGET_KEYS.forEach(function (k) { t.achc[k] = t.tg[k] > 0 ? t[k] / t.tg[k] : null; });
  t.winRate = t.qn > 0 ? t.dn / t.qn : null;
  t.poRate = t.qval > 0 ? t.po / t.qval : null;
  return t;
}

function dashboard_(year, month) {
  var quotes = readAll_('Quotation');
  var months = aggregateMonths_(year, quotes, readAll_('Ringkasan'), readAll_('Target'));
  month = month >= 1 && month <= 12 ? month : (new Date().getMonth() + 1);

  // Pipeline terbuka (semua tahun): quotation yang belum PO / belum dibatalkan
  var td = today_(), tdMs = new Date(td).getTime();
  var pipeline = quotes.filter(function (r) { return r.status === 'QUOTATION' || r.status === 'CARRY OVER'; })
    .map(function (r) {
      return {
        id: r.id, tgl: r.tgl, no_quot: r.no_quot, customer: r.customer, kategori: r.kategori, nilai_quot: r.nilai_quot, status: r.status,
        umur: r.tgl ? Math.max(0, Math.round((tdMs - new Date(r.tgl).getTime()) / 86400000)) || 0 : 0
      };
    })
    .sort(function (a, b) { return b.nilai_quot - a.nilai_quot; });
  var pipeVal = pipeline.reduce(function (a, r) { return a + r.nilai_quot; }, 0);

  var mm = sumMonths_(months, month, month), ytd = sumMonths_(months, 1, month);
  var sisa = Math.max(0, months[month - 1].target - months[month - 1].sales.total);
  return {
    year: year, month: month, months: months, month_sum: mm, ytd: ytd, full: sumMonths_(months, 1, 12),
    sisa_target_bulan: sisa, ar: arSummary_(arList_()),
    pipeline: { n: pipeline.length, val: pipeVal, coverage: sisa > 0 ? pipeVal / sisa : null, items: pipeline.slice(0, 15) }
  };
}

/* ============================================================
 * AGREGASI: LAPORAN BULANAN (format Sheet3: per customer)
 * ============================================================ */

function report_(year, month) {
  if (month < 1 || month > 12) throw new Error('Bulan tidak valid.');
  var quotes = readAll_('Quotation'), by = {};
  function row(c) {
    return by[c] || (by[c] = { customer: c, n: 0, qp: 0, qs: 0, pop: 0, pos: 0, sp: 0, ss: 0, carry: 0, batal: 0, open: 0 });
  }
  quotes.forEach(function (r) {
    var d = ymOf_(r.tgl);
    if (d && d.y === year && d.m === month) {
      var o = row(r.customer);
      o.n++;
      if (isPartsGroup_(r.kategori)) o.qp += r.nilai_quot; else o.qs += r.nilai_quot;
      if (isDeal_(r)) { if (isPartsGroup_(r.kategori)) o.pop += r.nilai_po; else o.pos += r.nilai_po; }
      if (r.status === 'CARRY OVER') o.carry += r.nilai_quot;
      if (r.status === 'BATAL') o.batal += r.nilai_quot;
      if (r.status === 'QUOTATION') o.open += r.nilai_quot;
    }
    if (r.status === 'TERJUAL') {
      var s = ymOf_(salesDate_(r));
      if (s && s.y === year && s.m === month) {
        var o2 = row(r.customer);
        if (isPartsGroup_(r.kategori)) o2.sp += r.nilai_jual; else o2.ss += r.nilai_jual;
      }
    }
  });
  var rows = Object.keys(by).sort().map(function (k) { by[k].total = by[k].sp + by[k].ss; return by[k]; });

  var rk = readAll_('Ringkasan').filter(function (r) { return r.tahun === year && r.bulan === month; })[0];
  var summary = null;
  if (rk) {
    summary = {
      customer: '(Ringkasan data awal)', n: rk.qp_n + rk.qs_n, qp: rk.qp_val, qs: rk.qs_val, pop: rk.qp_po, pos: rk.qs_po,
      sp: rk.s_parts + rk.s_bundling, ss: rk.s_pts + rk.s_labour, carry: 0, batal: 0, open: 0
    };
    summary.total = summary.sp + summary.ss;
  }
  var all = (summary ? [summary] : []).concat(rows);
  var tot = { n: 0, qp: 0, qs: 0, pop: 0, pos: 0, sp: 0, ss: 0, carry: 0, batal: 0, open: 0, total: 0 };
  all.forEach(function (r) { Object.keys(tot).forEach(function (k) { tot[k] += r[k]; }); });
  var tg = getTargets_(year)[month - 1].total;
  return { year: year, month: month, target: tg, rows: all, total: tot, ach: tg > 0 ? tot.total / tg : null };
}

/* ============================================================
 * SETUP (jalankan sekali dari editor Apps Script)
 * ============================================================ */





/** Jumlah baris per tabel (untuk halaman Backup). */
function backupInfo_() {
  var jumlah = {};
  Object.keys(SCHEMA).forEach(function (n) { if (n === 'Log') return; jumlah[n] = readAll_(n).length; });
  return { jumlah: jumlah };
}
HANDLERS.backupInfo = { admin: true, ro: true, fn: function () { return backupInfo_(); } };
