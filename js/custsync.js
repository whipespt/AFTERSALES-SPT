/**
 * SINKRON CUSTOMER DARI FILE CSV (Nama;Grup)
 * - Customer yang cocok (nama sama, atau hanya beda spasi / "PT" / "CV" / tanda baca): grup diperbarui, nama diseragamkan
 *   mengikuti CSV, dan nama di Quotation / Follow Up / AR ikut diseragamkan agar riwayatnya tetap terhubung.
 * - Customer di CSV yang belum ada: ditambahkan (aktivitas PROSPECT).
 * - Customer yang tidak ada di CSV: dibiarkan apa adanya.
 * - PIC grup: bila grup baru belum punya PIC dan customer-customernya sebelumnya berasal dari grup ber-PIC yang sama, PIC ikut dipindah.
 */
var SYNC_PROPAGATE_ = [['Quotation', 'customer'], ['FollowUp', 'customer'], ['AR', 'customer']];
ADMIN_ONLY_ACTIONS_.previewCustSync = 1; ADMIN_ONLY_ACTIONS_.applyCustSync = 1;

/** Pembaca CSV (pemisah ; , atau tab; tanda kutip ganda; BOM). Mengembalikan baris-baris berisi sel. */
function parseCsv_(text) {
  text = String(text == null ? '' : text).replace(/^﻿/, '');
  var head = text.split(/\r?\n/)[0] || '', cnt = { ';': head.split(';').length, ',': head.split(',').length, '\t': head.split('\t').length };
  var d = ';'; if (cnt[','] > cnt[d]) d = ','; if (cnt['\t'] > cnt[d]) d = '\t';
  var rows = [], row = [], cell = '', q = false, i = 0, c;
  for (; i < text.length; i++) {
    c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"' && cell === '') q = true;
    else if (c === d) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; rows.push(row); row = []; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ''; }); });
}
/** CSV -> [{nama, grup}]; baris pertama dianggap judul bila memuat kata "nama"/"customer". */
function parseCustCsv_(text) {
  var rows = parseCsv_(text), ni = 0, gi = 1;
  if (rows.length && rows[0].some(function (x) { return /^(nama|customer|nama customer)$/i.test(String(x).trim()); })) {
    var h = rows.shift().map(function (x) { return String(x).trim().toLowerCase(); });
    ni = Math.max(h.indexOf('nama'), h.indexOf('customer'), h.indexOf('nama customer'));
    gi = Math.max(h.indexOf('grup'), h.indexOf('group'));
    if (ni < 0) ni = 0; if (gi < 0) gi = 1;
  }
  return rows.map(function (r) { return { nama: String(r[ni] == null ? '' : r[ni]).replace(/\s+/g, ' ').trim(), grup: String(r[gi] == null ? '' : r[gi]).replace(/\s+/g, ' ').trim() }; })
    .filter(function (r) { return r.nama; });
}
function cKey_(s) { return arKey_(s).replace(/[^A-Z0-9]/g, ''); } // abaikan spasi, tanda baca, PT/CV/TBK

function planCustSync_(rows) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('Daftar customer kosong.');
  if (rows.length > 5000) throw new Error('Daftar terlalu panjang (maksimal 5000 baris).');
  var cust = readAll_('Customer'), ex = {}, lo = {}, seen = {};
  cust.forEach(function (c) { (ex[custKey_(c.nama)] = ex[custKey_(c.nama)] || []).push(c); (lo[cKey_(c.nama)] = lo[cKey_(c.nama)] || []).push(c); });
  var P = { total: 0, sama: 0, gantiGrup: [], rename: [], baru: [], ambigu: [], dupCsv: [], tanpaGrup: 0, pic: [], items: [], diCsv: {} };
  rows.forEach(function (r) {
    var nama = String(r.nama || '').replace(/\s+/g, ' ').trim(), grup = String(r.grup || '').replace(/\s+/g, ' ').trim().toUpperCase(), lk = cKey_(nama);
    if (!nama || !lk) return;
    if (nama.length > 200 || grup.length > 100) throw new Error('Nama/grup terlalu panjang: ' + nama.slice(0, 40));
    P.total++;
    if (seen[lk]) { P.dupCsv.push(nama); return; } seen[lk] = 1;
    if (!grup) P.tanpaGrup++;
    var cands = ex[custKey_(nama)] || lo[lk] || [];
    if (cands.length > 1) { P.ambigu.push({ nama: nama, kandidat: cands.map(function (c) { return c.nama; }) }); return; }
    if (cands.length === 0) { P.baru.push({ nama: nama, grup: grup }); P.items.push({ aksi: 'baru', nama: nama, grup: grup }); return; }
    var c = cands[0], item = { aksi: 'cocok', id: c.id, lama: c.nama, nama: nama, grupLama: String(c.grup || '').toUpperCase(), grup: grup || String(c.grup || '').toUpperCase() };
    P.diCsv[c.id] = 1; P.items.push(item);
    var ch = false;
    if (c.nama !== nama) { P.rename.push({ dari: c.nama, ke: nama }); ch = true; }
    if (grup && String(c.grup || '').toUpperCase() !== grup) { P.gantiGrup.push({ nama: nama, dari: String(c.grup || '').toUpperCase(), ke: grup }); ch = true; }
    if (!ch) P.sama++;
  });
  // PIC: grup baru tanpa PIC mewarisi PIC grup lama bila tidak ada yang bertentangan
  var pics = picMap_(), cand = {};
  P.items.forEach(function (it) {
    if (it.aksi !== 'cocok' || !it.grup || pics[it.grup] || !it.grupLama || it.grupLama === it.grup) return;
    var o = cand[it.grup] || (cand[it.grup] = { set: {}, dari: {} });
    if (pics[it.grupLama]) { o.set[pics[it.grupLama]] = 1; o.dari[it.grupLama] = 1; }
  });
  Object.keys(cand).forEach(function (g) { var ks = Object.keys(cand[g].set); if (ks.length === 1) P.pic.push({ grup: g, pic: ks[0], dari: Object.keys(cand[g].dari).join(', ') }); });
  P.tidakAda = cust.filter(function (c) { return !P.diCsv[c.id]; }).map(function (c) { return c.nama; });
  return P;
}
function previewCustSync_(p) {
  var P = planCustSync_(p.rows);
  return { total: P.total, sama: P.sama, gantiGrup: P.gantiGrup, rename: P.rename, baru: P.baru, ambigu: P.ambigu, dupCsv: P.dupCsv, tanpaGrup: P.tanpaGrup, pic: P.pic, tidakAda: P.tidakAda.length, tidakAdaContoh: P.tidakAda.slice(0, 12) };
}
function applyCustSync_(p, user) {
  return withLock_(function () {
    var P = planCustSync_(p.rows), now = now_(), nUbah = 0, nBaru = 0, nProp = 0, renames = [];
    var byId = {}; readAll_('Customer').forEach(function (c) { byId[c.id] = c; });
    P.items.forEach(function (it) {
      if (it.aksi === 'baru') {
        appendRow_('Customer', { id: newId_('C'), nama: it.nama, grup: it.grup, aktivitas: 'PROSPECT', populasi: 0, rata_unit: 0, catatan: 'Ditambahkan dari daftar customer (CSV)', updated_by: user.email, updated_at: now });
        nBaru++; return;
      }
      var c = byId[it.id], rec = {}; Object.keys(c).forEach(function (k) { rec[k] = c[k]; });
      var chName = c.nama !== it.nama, chGrup = it.grup && String(c.grup || '').toUpperCase() !== it.grup;
      if (!chName && !chGrup) return;
      rec.nama = it.nama; rec.grup = it.grup; rec.updated_by = user.email; rec.updated_at = now;
      updateRow_('Customer', c._row, rec); nUbah++;
      if (chName) renames.push({ id: c.id, lama: c.nama, baru: it.nama });
    });
    if (renames.length) {
      var byKey = {}, byIdn = {}; renames.forEach(function (r) { byKey[cKey_(r.lama)] = r.baru; byIdn[r.id] = r.baru; });
      SYNC_PROPAGATE_.forEach(function (tc) {
        readAll_(tc[0]).forEach(function (row) {
          var nm = (row.customer_id && byIdn[row.customer_id]) || byKey[cKey_(row.customer)];
          if (!nm || row.customer === nm) return;
          var rec = {}; Object.keys(row).forEach(function (k) { rec[k] = row[k]; }); rec.customer = nm;
          updateRow_(tc[0], row._row, rec); nProp++;
        });
      });
    }
    P.pic.forEach(function (x) { saveGrupPIC_({ grup: x.grup, pic: x.pic }, user); });
    log_(user, 'SINKRON Customer (CSV)', 'baris=' + P.total + ', ubah=' + nUbah + ', baru=' + nBaru + ', nama diseragamkan di transaksi=' + nProp + ', PIC dipindah=' + P.pic.length);
    return { total: P.total, ubah: nUbah, baru: nBaru, transaksi: nProp, pic: P.pic.length, sama: P.sama };
  });
}
HANDLERS.previewCustSync = { admin: true, ro: true, fn: previewCustSync_ };
HANDLERS.applyCustSync = { admin: true, fn: applyCustSync_ };
