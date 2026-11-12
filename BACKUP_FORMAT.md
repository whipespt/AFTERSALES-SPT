# Format File Backup — Mitra IPE Sampit After Sales Tracker

File backup berupa satu berkas **JSON** (UTF-8). Setiap baris data memakai **nama field tetap** (bukan urutan kolom Google Sheets), sehingga bisa dibaca program mana pun.

## Struktur umum

```json
{
  "meta":  { "format": "ipe-aftersales-backup", "versi": 1, "aplikasi": "...", "dibuat": "2026-11-12T15:05:00+07:00",
             "zona_waktu": "Asia/Jakarta", "dibuat_oleh": "nama admin", "jumlah": { "Customer": 162, "AR": 111, "...": 0 }, "termasuk_log": false },
  "skema": { "Customer": [ { "key": "id", "header": "ID", "tipe": "teks" }, "..." ] },
  "data":  { "Customer": [ { "id": "C0001", "nama": "..." }, "..." ], "AR": [ "..." ] }
}
```

- `meta.format` dan `meta.versi` dipakai importer untuk memastikan berkas yang benar. Jika `versi` lebih baru dari yang dikenali importer, tolak dengan pesan jelas.
- `meta.jumlah` = jumlah baris per tab; importer sebaiknya mencocokkan dengan panjang array di `data` sebagai pemeriksaan kelengkapan.
- `skema` menjelaskan tiap field (key, nama kolom di Sheets, tipe) dan selalu sesuai dengan isi `data`.

## Tipe nilai

| tipe | arti |
|---|---|
| teks | string, boleh kosong `""` |
| teks (huruf besar) | string yang selalu huruf besar dan sudah di-trim (mis. kategori customer, nama grup) |
| angka | number (rupiah/jumlah), tidak pernah `null`; kosong = `0` |
| tanggal (yyyy-MM-dd) | string `"2026-11-09"`, kosong = `""` |

## Tab dan field

### Quotation  (0 baris pada contoh)

Satu baris per quotation. Terhubung ke Customer lewat nama (`customer`), ke AR Invoice lewat `no_po` = `AR.no_ref`.

| field | kolom di Sheets | tipe |
|---|---|---|
| `id` | ID | teks |
| `tgl` | Tgl Quotation | tanggal (yyyy-MM-dd) |
| `no_quot` | No Quotation | teks |
| `no_po` | No PO Customer | teks |
| `customer` | Customer | teks |
| `kategori` | Kategori | teks (huruf besar) |
| `nilai_quot` | Nilai Quotation | angka |
| `status` | Status | teks (huruf besar) |
| `tgl_po` | Tgl PO | tanggal (yyyy-MM-dd) |
| `nilai_po` | Nilai PO | angka |
| `tgl_jual` | Tgl Penjualan | tanggal (yyyy-MM-dd) |
| `nilai_jual` | Nilai Penjualan | angka |
| `catatan` | Catatan | teks |
| `created_by` | Dibuat Oleh | teks |
| `created_at` | Dibuat Pada | teks |
| `updated_by` | Diubah Oleh | teks |
| `updated_at` | Diubah Pada | teks |
| `bukti_quot` | Bukti Quotation (link foto) | teks |
| `bukti_po` | Bukti PO (link foto) | teks |

### Ringkasan  (10 baris pada contoh)

Ringkasan penjualan bulanan data awal (sebelum pencatatan per quotation).

| field | kolom di Sheets | tipe |
|---|---|---|
| `id` | ID | teks |
| `tahun` | Tahun | angka |
| `bulan` | Bulan | angka |
| `qp_n` | Jml Quot Parts | angka |
| `qp_val` | Nilai Quot Parts | angka |
| `qp_dn` | Jml Deal Parts | angka |
| `qp_po` | PO Parts | angka |
| `qs_n` | Jml Quot Service | angka |
| `qs_val` | Nilai Quot Service | angka |
| `qs_dn` | Jml Deal Service | angka |
| `qs_po` | PO Service | angka |
| `s_parts` | Penjualan Parts | angka |
| `s_bundling` | Penjualan Bundling | angka |
| `s_pts` | Penjualan PTS | angka |
| `s_labour` | Penjualan Labour | angka |
| `s_lain` | Penjualan Lain-lain | angka |
| `ket` | Keterangan | teks |

### Target  (12 baris pada contoh)

Target penjualan per bulan dan kategori. Kunci: `tahun` + `bulan`.

| field | kolom di Sheets | tipe |
|---|---|---|
| `tahun` | Tahun | angka |
| `bulan` | Bulan | angka |
| `t_parts` | Target Parts | angka |
| `t_bundling` | Target Bundling | angka |
| `t_pts` | Target PTS | angka |
| `t_labour` | Target Labour | angka |
| `t_lain` | Target Lain-lain | angka |
| `ket` | Keterangan | teks |

### Customer  (162 baris pada contoh)

Master customer: grup, status, populasi mesin, invoice historis per tahun.

| field | kolom di Sheets | tipe |
|---|---|---|
| `id` | ID | teks |
| `nama` | Nama Customer | teks |
| `grup` | Grup | teks |
| `aktivitas` | Aktivitas | teks (huruf besar) |
| `populasi` | Populasi Mesin | angka |
| `rata_unit` | Rata-rata Beli Parts per Unit | angka |
| `inv_2023` | Invoice 2023 (Jan-Okt) | angka |
| `inv_2024` | Invoice 2024 (Jan-Okt) | angka |
| `inv_2025` | Invoice 2025 (Jan-Okt) | angka |
| `inv_2026` | Invoice 2026 (Jan-Okt) | angka |
| `catatan` | Catatan | teks |
| `updated_by` | Diubah Oleh | teks |
| `updated_at` | Diubah Pada | teks |

### FollowUp  (0 baris pada contoh)

Catatan follow up dan penagihan. `customer_id` -> Customer.id; `ar_id` -> AR.id (kosong bila bukan penagihan).

| field | kolom di Sheets | tipe |
|---|---|---|
| `id` | ID | teks |
| `tgl` | Tanggal Follow Up | tanggal (yyyy-MM-dd) |
| `customer_id` | ID Customer | teks |
| `customer` | Customer | teks |
| `jenis` | Jenis Kontak | teks (huruf besar) |
| `tahap` | Tahap | teks (huruf besar) |
| `catatan` | Hasil / Catatan | teks |
| `next_tgl` | Follow Up Berikutnya | tanggal (yyyy-MM-dd) |
| `oleh` | Diinput Oleh | teks |
| `dibuat` | Dibuat Pada | teks |
| `diubah_oleh` | Diubah Oleh | teks |
| `diubah` | Diubah Pada | teks |
| `ar_id` | ID Piutang (penagihan) | teks |

### AR  (111 baris pada contoh)

Satu baris per invoice piutang. `customer_id` -> Customer.id. Sisa, umur, dan status terlambat tidak disimpan: dihitung dari `nilai` - total pembayaran dan `jatuh_tempo`.

| field | kolom di Sheets | tipe |
|---|---|---|
| `id` | ID | teks |
| `doc_no` | No Invoice | teks |
| `customer_id` | ID Customer | teks |
| `customer` | Customer | teks |
| `tgl` | Tgl Invoice | tanggal (yyyy-MM-dd) |
| `jatuh_tempo` | Jatuh Tempo | tanggal (yyyy-MM-dd) |
| `no_ref` | No PO Customer | teks |
| `kategori` | Kategori | teks (huruf besar) |
| `cabang` | Cabang | teks |
| `nilai` | Nilai Tagihan | angka |
| `bayar` | Terbayar | angka |
| `target_bayar` | Target Bayar | tanggal (yyyy-MM-dd) |
| `target_ket` | Keterangan Target | teks |
| `keterangan` | Keterangan | teks |
| `sumber` | Sumber | teks |
| `dibuat_oleh` | Dibuat Oleh | teks |
| `dibuat` | Dibuat Pada | teks |
| `diubah_oleh` | Diubah Oleh | teks |
| `diubah` | Diubah Pada | teks |

### ARBayar  (0 baris pada contoh)

Riwayat pembayaran invoice. `ar_id` -> AR.id.

| field | kolom di Sheets | tipe |
|---|---|---|
| `id` | ID | teks |
| `ar_id` | ID Invoice | teks |
| `tgl` | Tgl Bayar | tanggal (yyyy-MM-dd) |
| `jumlah` | Jumlah | angka |
| `ket` | Keterangan | teks |
| `oleh` | Dicatat Oleh | teks |
| `dibuat` | Dibuat Pada | teks |

### GrupPIC  (0 baris pada contoh)

PIC (penanggung jawab) per grup customer. Kunci: `grup`.

| field | kolom di Sheets | tipe |
|---|---|---|
| `id` | ID | teks |
| `grup` | Grup | teks (huruf besar) |
| `pic` | PIC | teks |
| `updated_by` | Diubah Oleh | teks |
| `updated_at` | Diubah Pada | teks |

### Log  (2 baris pada contoh)

Log aktivitas (hanya ada bila backup dibuat dengan opsi log).

| field | kolom di Sheets | tipe |
|---|---|---|
| `waktu` | Waktu | teks |
| `user` | User | teks |
| `aksi` | Aksi | teks |
| `detail` | Detail | teks |

## Hubungan antar data

- `Customer.id` ← `FollowUp.customer_id`, `AR.customer_id`
- `AR.id` ← `ARBayar.ar_id`, `FollowUp.ar_id`
- `Quotation.customer` ↔ `Customer.nama` (dicocokkan lewat nama; abaikan titik, koma, dan awalan PT/CV)
- `Quotation.no_po` ↔ `AR.no_ref` (nomor PO customer; beberapa invoice bisa memakai PO yang sama)
- `Customer.grup` ↔ `GrupPIC.grup`

## Hal yang perlu diperhatikan saat mengimpor

1. **Foto bukti** (`Quotation.bukti_quot`, `Quotation.bukti_po`) hanya berisi link Google Drive. Berkas fotonya tidak ada di dalam backup. Link tetap berfungsi selama file di Drive tidak dihapus dan pengaturan "siapa saja yang punya link" masih aktif.
2. **Tanggal** disimpan sebagai teks `yyyy-MM-dd` pada zona Asia/Jakarta. Jangan mengonversinya lewat zona waktu lain.
3. **ID** (`id`) harus dipertahankan apa adanya, karena dipakai sebagai kunci hubungan antar tab.
4. **Nilai turunan tidak disimpan**: sisa piutang, umur piutang, status terlambat, total per grup, capaian target. Hitung ulang di sistem baru.
5. PIN admin dan sesi login **tidak** termasuk dalam backup.
6. Backup berisi data bisnis; simpan sebagai dokumen rahasia.

## Contoh membaca (JavaScript)

```js
const fs = require('fs');
const b = JSON.parse(fs.readFileSync('backup-ipe-20261112-1505.json', 'utf8'));
if (b.meta.format !== 'ipe-aftersales-backup') throw new Error('Bukan file backup IPE');
if (b.meta.versi > 1) throw new Error('Versi backup lebih baru dari importer');
for (const [tab, n] of Object.entries(b.meta.jumlah)) {
  if (b.data[tab].length !== n) throw new Error('Jumlah baris ' + tab + ' tidak cocok');
}
console.log(b.data.Customer.length, 'customer,', b.data.AR.length, 'invoice');
```
