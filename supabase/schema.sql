-- ============================================================
-- After Sales Tracker - Mitra IPE Sampit : skema Supabase
-- Jalankan SELURUH berkas ini sekali di Supabase -> SQL Editor -> New query -> Run.
-- Aman dijalankan ulang (idempotent). Dibuat otomatis oleh tools/gen_schema.js.
-- ============================================================

-- ---------- 1. Profil pengguna & peran ----------
-- Akun dibuat di Authentication -> Users (dashboard Supabase). Peran diatur di tabel profiles:
--   ADMIN    = boleh melihat dan mengubah semua data
--   VIEWER   = hanya melihat
--   MENUNGGU = akun baru yang belum diaktifkan (tidak bisa melihat data apa pun)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  nama text not null default '',
  role text not null default 'MENUNGGU' check (role in ('ADMIN','VIEWER','MENUNGGU')),
  created_at timestamptz not null default now()
);

-- Pengguna PERTAMA yang dibuat otomatis menjadi ADMIN; pengguna berikutnya MENUNGGU sampai diubah di tabel profiles.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, nama, role)
  values (
    new.id, coalesce(new.email, ''),
    coalesce(nullif(new.raw_user_meta_data->>'nama', ''), split_part(coalesce(new.email, ''), '@', 1)),
    case when exists (select 1 from public.profiles) then 'MENUNGGU' else 'ADMIN' end
  ) on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Untuk akun yang SUDAH ada sebelum skrip ini dijalankan: buat profilnya (yang tertua jadi ADMIN).
insert into public.profiles (id, email, nama, role)
select u.id, coalesce(u.email, ''), split_part(coalesce(u.email, ''), '@', 1),
       case when u.id = (select id from auth.users order by created_at asc limit 1)
             and not exists (select 1 from public.profiles) then 'ADMIN' else 'MENUNGGU' end
from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'ADMIN');
$$;
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('ADMIN','VIEWER'));
$$;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.is_member() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_member() to authenticated;

alter table public.profiles enable row level security;
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
-- Tidak ada policy insert/update/delete: peran hanya bisa diubah dari dashboard Supabase (Table Editor / SQL Editor).
revoke all on table public.profiles from anon;
revoke insert, update, delete on table public.profiles from authenticated;

-- ---------- 2. Tabel data ----------
create table if not exists public.quotation (
  id text not null default '',
  tgl text not null default '',
  no_quot text not null default '',
  no_po text not null default '',
  customer text not null default '',
  kategori text not null default '',
  nilai_quot numeric(20,2) not null default 0,
  status text not null default '',
  tgl_po text not null default '',
  nilai_po numeric(20,2) not null default 0,
  tgl_jual text not null default '',
  nilai_jual numeric(20,2) not null default 0,
  catatan text not null default '',
  created_by text not null default '',
  created_at text not null default '',
  updated_by text not null default '',
  updated_at text not null default '',
  bukti_quot text not null default '',
  bukti_po text not null default '',
  seq bigint generated always as identity,
  primary key (id)
);
create unique index if not exists quotation_seq_idx on public.quotation (seq);
create table if not exists public.ringkasan (
  id text not null default '',
  tahun numeric(20,2) not null default 0,
  bulan numeric(20,2) not null default 0,
  qp_n numeric(20,2) not null default 0,
  qp_val numeric(20,2) not null default 0,
  qp_dn numeric(20,2) not null default 0,
  qp_po numeric(20,2) not null default 0,
  qs_n numeric(20,2) not null default 0,
  qs_val numeric(20,2) not null default 0,
  qs_dn numeric(20,2) not null default 0,
  qs_po numeric(20,2) not null default 0,
  s_parts numeric(20,2) not null default 0,
  s_bundling numeric(20,2) not null default 0,
  s_pts numeric(20,2) not null default 0,
  s_labour numeric(20,2) not null default 0,
  s_lain numeric(20,2) not null default 0,
  ket text not null default '',
  seq bigint generated always as identity,
  primary key (id)
);
create unique index if not exists ringkasan_seq_idx on public.ringkasan (seq);
create table if not exists public.target (
  tahun numeric(20,2) not null default 0,
  bulan numeric(20,2) not null default 0,
  t_parts numeric(20,2) not null default 0,
  t_bundling numeric(20,2) not null default 0,
  t_pts numeric(20,2) not null default 0,
  t_labour numeric(20,2) not null default 0,
  t_lain numeric(20,2) not null default 0,
  ket text not null default '',
  seq bigint generated always as identity,
  primary key (tahun, bulan)
);
create unique index if not exists target_seq_idx on public.target (seq);
create table if not exists public.customer (
  id text not null default '',
  nama text not null default '',
  grup text not null default '',
  aktivitas text not null default '',
  populasi numeric(20,2) not null default 0,
  rata_unit numeric(20,2) not null default 0,
  inv_2023 numeric(20,2) not null default 0,
  inv_2024 numeric(20,2) not null default 0,
  inv_2025 numeric(20,2) not null default 0,
  inv_2026 numeric(20,2) not null default 0,
  catatan text not null default '',
  updated_by text not null default '',
  updated_at text not null default '',
  seq bigint generated always as identity,
  primary key (id)
);
create unique index if not exists customer_seq_idx on public.customer (seq);
create table if not exists public.followup (
  id text not null default '',
  tgl text not null default '',
  customer_id text not null default '',
  customer text not null default '',
  jenis text not null default '',
  tahap text not null default '',
  catatan text not null default '',
  next_tgl text not null default '',
  oleh text not null default '',
  dibuat text not null default '',
  diubah_oleh text not null default '',
  diubah text not null default '',
  ar_id text not null default '',
  seq bigint generated always as identity,
  primary key (id)
);
create unique index if not exists followup_seq_idx on public.followup (seq);
create table if not exists public.ar (
  id text not null default '',
  doc_no text not null default '',
  customer_id text not null default '',
  customer text not null default '',
  tgl text not null default '',
  jatuh_tempo text not null default '',
  no_ref text not null default '',
  kategori text not null default '',
  cabang text not null default '',
  nilai numeric(20,2) not null default 0,
  bayar numeric(20,2) not null default 0,
  target_bayar text not null default '',
  target_ket text not null default '',
  keterangan text not null default '',
  sumber text not null default '',
  dibuat_oleh text not null default '',
  dibuat text not null default '',
  diubah_oleh text not null default '',
  diubah text not null default '',
  seq bigint generated always as identity,
  primary key (id)
);
create unique index if not exists ar_seq_idx on public.ar (seq);
create table if not exists public.ar_bayar (
  id text not null default '',
  ar_id text not null default '',
  tgl text not null default '',
  jumlah numeric(20,2) not null default 0,
  ket text not null default '',
  oleh text not null default '',
  dibuat text not null default '',
  seq bigint generated always as identity,
  primary key (id)
);
create unique index if not exists ar_bayar_seq_idx on public.ar_bayar (seq);
create table if not exists public.grup_pic (
  id text not null default '',
  grup text not null default '',
  pic text not null default '',
  updated_by text not null default '',
  updated_at text not null default '',
  seq bigint generated always as identity,
  primary key (id)
);
create unique index if not exists grup_pic_seq_idx on public.grup_pic (seq);
create table if not exists public.log_aktivitas (
  waktu text not null default '',
  pengguna text not null default '',
  aksi text not null default '',
  detail text not null default '',
  seq bigint generated always as identity
);
create unique index if not exists log_aktivitas_seq_idx on public.log_aktivitas (seq);

-- ---------- 3. Row Level Security: semua pengguna aktif boleh membaca, hanya ADMIN yang boleh menulis ----------
alter table public.quotation enable row level security;
revoke all on table public.quotation from anon;
drop policy if exists quotation_read on public.quotation;
create policy quotation_read on public.quotation for select to authenticated using (public.is_member());
drop policy if exists quotation_ins on public.quotation;
create policy quotation_ins on public.quotation for insert to authenticated with check (public.is_admin());
drop policy if exists quotation_upd on public.quotation;
create policy quotation_upd on public.quotation for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists quotation_del on public.quotation;
create policy quotation_del on public.quotation for delete to authenticated using (public.is_admin());
alter table public.ringkasan enable row level security;
revoke all on table public.ringkasan from anon;
drop policy if exists ringkasan_read on public.ringkasan;
create policy ringkasan_read on public.ringkasan for select to authenticated using (public.is_member());
drop policy if exists ringkasan_ins on public.ringkasan;
create policy ringkasan_ins on public.ringkasan for insert to authenticated with check (public.is_admin());
drop policy if exists ringkasan_upd on public.ringkasan;
create policy ringkasan_upd on public.ringkasan for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists ringkasan_del on public.ringkasan;
create policy ringkasan_del on public.ringkasan for delete to authenticated using (public.is_admin());
alter table public.target enable row level security;
revoke all on table public.target from anon;
drop policy if exists target_read on public.target;
create policy target_read on public.target for select to authenticated using (public.is_member());
drop policy if exists target_ins on public.target;
create policy target_ins on public.target for insert to authenticated with check (public.is_admin());
drop policy if exists target_upd on public.target;
create policy target_upd on public.target for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists target_del on public.target;
create policy target_del on public.target for delete to authenticated using (public.is_admin());
alter table public.customer enable row level security;
revoke all on table public.customer from anon;
drop policy if exists customer_read on public.customer;
create policy customer_read on public.customer for select to authenticated using (public.is_member());
drop policy if exists customer_ins on public.customer;
create policy customer_ins on public.customer for insert to authenticated with check (public.is_admin());
drop policy if exists customer_upd on public.customer;
create policy customer_upd on public.customer for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists customer_del on public.customer;
create policy customer_del on public.customer for delete to authenticated using (public.is_admin());
alter table public.followup enable row level security;
revoke all on table public.followup from anon;
drop policy if exists followup_read on public.followup;
create policy followup_read on public.followup for select to authenticated using (public.is_member());
drop policy if exists followup_ins on public.followup;
create policy followup_ins on public.followup for insert to authenticated with check (public.is_admin());
drop policy if exists followup_upd on public.followup;
create policy followup_upd on public.followup for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists followup_del on public.followup;
create policy followup_del on public.followup for delete to authenticated using (public.is_admin());
alter table public.ar enable row level security;
revoke all on table public.ar from anon;
drop policy if exists ar_read on public.ar;
create policy ar_read on public.ar for select to authenticated using (public.is_member());
drop policy if exists ar_ins on public.ar;
create policy ar_ins on public.ar for insert to authenticated with check (public.is_admin());
drop policy if exists ar_upd on public.ar;
create policy ar_upd on public.ar for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists ar_del on public.ar;
create policy ar_del on public.ar for delete to authenticated using (public.is_admin());
alter table public.ar_bayar enable row level security;
revoke all on table public.ar_bayar from anon;
drop policy if exists ar_bayar_read on public.ar_bayar;
create policy ar_bayar_read on public.ar_bayar for select to authenticated using (public.is_member());
drop policy if exists ar_bayar_ins on public.ar_bayar;
create policy ar_bayar_ins on public.ar_bayar for insert to authenticated with check (public.is_admin());
drop policy if exists ar_bayar_upd on public.ar_bayar;
create policy ar_bayar_upd on public.ar_bayar for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists ar_bayar_del on public.ar_bayar;
create policy ar_bayar_del on public.ar_bayar for delete to authenticated using (public.is_admin());
alter table public.grup_pic enable row level security;
revoke all on table public.grup_pic from anon;
drop policy if exists grup_pic_read on public.grup_pic;
create policy grup_pic_read on public.grup_pic for select to authenticated using (public.is_member());
drop policy if exists grup_pic_ins on public.grup_pic;
create policy grup_pic_ins on public.grup_pic for insert to authenticated with check (public.is_admin());
drop policy if exists grup_pic_upd on public.grup_pic;
create policy grup_pic_upd on public.grup_pic for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists grup_pic_del on public.grup_pic;
create policy grup_pic_del on public.grup_pic for delete to authenticated using (public.is_admin());
alter table public.log_aktivitas enable row level security;
revoke all on table public.log_aktivitas from anon;
drop policy if exists log_aktivitas_admin_all on public.log_aktivitas;
create policy log_aktivitas_admin_all on public.log_aktivitas for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- 4. Storage: bucket PRIVAT untuk foto bukti quotation & PO ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bukti', 'bukti', false, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 8388608, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists bukti_read on storage.objects;
create policy bukti_read on storage.objects for select to authenticated using (bucket_id = 'bukti' and public.is_member());
drop policy if exists bukti_ins on storage.objects;
create policy bukti_ins on storage.objects for insert to authenticated with check (bucket_id = 'bukti' and public.is_admin());
drop policy if exists bukti_upd on storage.objects;
create policy bukti_upd on storage.objects for update to authenticated using (bucket_id = 'bukti' and public.is_admin()) with check (bucket_id = 'bukti' and public.is_admin());
drop policy if exists bukti_del on storage.objects;
create policy bukti_del on storage.objects for delete to authenticated using (bucket_id = 'bukti' and public.is_admin());

-- Selesai. Langkah berikutnya: buat pengguna di Authentication -> Users (lihat README.md).
