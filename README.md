# Mitra IPE Sampit — After Sales Tracker (versi GitHub Pages + Supabase)

Website statis (tanpa server sendiri) untuk memantau quotation, target, customer, CRM, dan piutang (AR).

- **Hosting:** GitHub Pages (gratis).
- **Database, login, dan penyimpanan foto:** Supabase (gratis).
- **Login:** setiap pengguna punya email + password sendiri. **Semua wajib login** — tanpa login tidak ada data yang terlihat.
- **Peran:** `ADMIN` (akses penuh), `BRANCH_MANAGER` (melihat semua, mengubah target dan PIC), `SALES` (mengubah semua data operasional kecuali target, PIC, dan pengaturan), `VIEWER` (hanya melihat). Admin mengatur peran langsung di web lewat menu **Pengguna**.
- **Foto bukti quotation/PO:** disimpan di Supabase Storage (bucket **privat**), dibuka lewat tautan sementara.

Isi folder yang diunggah ke GitHub:

```
index.html          halaman utama
css/styles.css      tampilan
js/config.js        <-- satu-satunya berkas yang perlu Anda isi (URL + kunci anon Supabase)
js/server.js        logika hitung (sama dengan versi Google Sheets)
js/store.js         koneksi Supabase, login, penyimpanan, impor backup
js/app.js           antarmuka
img/logo.png
supabase/schema.sql skrip database (dijalankan sekali di Supabase)
BACKUP_FORMAT.md    penjelasan format file backup
```

---

## Langkah pemasangan (sekitar 20 menit)

### 1. Buat proyek Supabase
1. Daftar/masuk di <https://supabase.com> → **New project**. Pilih region terdekat (mis. *Southeast Asia / Singapore*) dan catat password database (tidak dipakai aplikasi).
2. Tunggu proyek selesai dibuat.

### 2. Buat tabel, aturan keamanan, dan bucket foto
1. Menu **SQL Editor → New query**.
2. Buka berkas `supabase/schema.sql`, salin **seluruh isinya**, tempel, lalu klik **Run**. Hasil harus "Success". Aman dijalankan ulang.

Skrip ini membuat tabel data, tabel `profiles` (peran pengguna), aturan **Row Level Security** (semua pengguna aktif boleh membaca, penulisan sesuai peran), dan bucket privat `bukti`.

### 3. Atur login
1. **Authentication → Sign In / Providers → Email**:
   - **Matikan "Allow new users to sign up"** (penting, supaya orang luar tidak bisa mendaftar sendiri).
   - "Confirm email" boleh dibiarkan; untuk akun yang Anda buat sendiri (langkah 4) pilih *Auto Confirm User*.
2. **Authentication → URL Configuration**:
   - **Site URL** = alamat website Anda nanti, mis. `https://NAMAANDA.github.io/NAMA-REPO/` (agar tautan "Lupa password" kembali ke website ini). Bisa diisi setelah langkah 6.

### 4. Buat akun pengguna
1. **Authentication → Users → Add user → Create new user**: isi email dan password, centang **Auto Confirm User**.
2. **Pengguna pertama yang dibuat otomatis menjadi ADMIN.** Buat akun Anda sendiri lebih dulu.
3. Untuk pengguna lain: buat akunnya dengan cara yang sama di Supabase, lalu **atur peran di website**: login sebagai Admin → menu **Pengguna** → pilih peran dan nama tampil → **Simpan**. Akun baru berstatus `MENUNGGU` (belum bisa melihat apa pun) sampai peran diatur.

| Peran | Melihat data | Quotation, customer, follow up, AR, data awal, foto | Target dan PIC | Pengguna, backup, impor |
|---|---|---|---|---|
| Admin | ✅ | ✅ | ✅ | ✅ |
| Branch Manager | ✅ | – | ✅ | – |
| Sales | ✅ | ✅ | – | – |
| Viewer | ✅ | – | – | – |
| Menunggu | – | – | – | – |

4. Mencabut akses: ubah peran menjadi **Menunggu** di menu Pengguna, atau hapus pengguna di **Authentication → Users**. Sistem menolak menurunkan atau menghapus Admin terakhir.
5. Menambah pengguna tetap dilakukan di dashboard Supabase (website tidak boleh menyimpan kunci rahasia untuk membuat akun). Perubahan peran berlaku setelah pengguna masuk kembali.

> **Sudah memasang versi sebelumnya?** Jalankan ulang seluruh `supabase/schema.sql` di SQL Editor (aman, data tidak berubah). Skrip ini menambah peran baru dan aturan keamanannya; akun `VIEWER` dan `ADMIN` yang ada tetap seperti semula.

### 5. Isi `js/config.js`
Di Supabase buka **Project Settings → API**, lalu salin:
- **Project URL** → `SUPABASE_URL`
- **anon public key** → `SUPABASE_ANON_KEY`

> ⚠️ Pakai kunci **anon / public**. **Jangan pernah** memakai kunci `service_role` di website atau mengunggahnya ke GitHub. Kunci anon memang dirancang terlihat publik; yang melindungi data adalah login + aturan RLS di database.

### 6. Unggah ke GitHub dan aktifkan GitHub Pages
1. Buat repository baru di GitHub (mis. `after-sales-ipe`). Unggah **isi folder ini** (semua berkas dan folder di atas, termasuk `js/config.js` yang sudah diisi) lewat *Add file → Upload files*.
2. **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / folder `/ (root)` → Save**.
3. Tunggu 1–2 menit; alamat website tampil di halaman Pages. Isi alamat itu sebagai **Site URL** (langkah 3.2).

Repository gratis di GitHub Pages harus *public*; itu aman karena isinya hanya kode dan kunci anon, **bukan data**. Data ada di Supabase dan hanya terbaca setelah login.

### 7. Pindahkan data dari versi Google Sheets
1. Di versi lama (Apps Script): menu **Backup → Unduh backup (.json)** (centang log aktivitas bila ingin ikut).
2. Di website baru: login sebagai ADMIN → menu **Backup → Impor data dari file backup** → pilih file → periksa pratinjau → pilih **Ganti** (database kosong dibuat sama dengan file) → **Impor sekarang**.
3. Cek Dashboard, Quotation, Customer, dan AR Invoice. Angkanya harus sama dengan versi lama.

**Foto lama di Google Drive:** yang ikut pindah hanya *link*-nya. Link tersebut tetap bisa dibuka selama Anda masih punya akses ke file di Drive (jangan hapus folder "Bukti Quotation & PO"). Foto baru disimpan di Supabase Storage. Memindahkan foto lama secara massal ke Supabase tidak dilakukan otomatis (butuh akses Drive).

---

## Catatan penting

- **Keamanan ditegakkan di database, bukan di tampilan.** Walaupun seseorang mengutak-atik kode di browser, VIEWER tetap ditolak saat menulis (RLS), dan orang tanpa login tidak bisa membaca apa pun. Foto bukti ada di bucket privat; tautan foto berlaku 10 menit dan hanya dibuat untuk pengguna yang sudah login.
- **Perhitungan berjalan di browser.** Aplikasi memuat tabel dari Supabase, menghitung dashboard di perangkat Anda, dan menulis perubahan kembali. Untuk data sebesar ini (ribuan baris) terasa cepat. Sebelum setiap penyimpanan, data terbaru dimuat ulang, sehingga dua admin yang bekerja bergantian tidak saling menimpa baris yang berbeda. Jika dua admin mengubah **baris yang sama** pada saat yang sama, yang menyimpan terakhir yang menang. Tombol **↻** di pojok kanan atas memuat ulang data.
- **Backup:** unduh file backup secara berkala (mis. mingguan) dari menu **Backup** dan simpan di luar Supabase. Proyek Supabase gratis **dijeda otomatis jika tidak dipakai ±1 minggu**; buka dashboard Supabase dan klik *Restore* bila itu terjadi (data tidak hilang).
- **Ganti password:** tombol **Ubah password** di pojok kanan atas. **Lupa password:** tautan di halaman login mengirim email pengaturan ulang (pastikan Site URL sudah benar).
- **"Belum diaktifkan":** peran akun masih `MENUNGGU`; Admin mengaturnya di menu **Pengguna**.
- **"Konfigurasi Supabase belum diisi":** `js/config.js` masih berisi tulisan `ISI_...`.
- **Tampilan lama setelah pembaruan:** tekan Ctrl+F5 (muat ulang tanpa cache).

## Untuk pengembang
Logika bisnis (`js/server.js`) dan antarmuka (`js/app.js`) dihasilkan dari versi Apps Script oleh `tools/build.sh`; `supabase/schema.sql` dihasilkan dari skema yang sama (`tools/gen_schema.js`) sehingga tabel dan kode selalu sinkron. Nama tabel Postgres: `quotation, ringkasan, target, customer, followup, ar, ar_bayar, grup_pic, log_aktivitas, profiles`.
