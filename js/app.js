(function () {
  'use strict';

  /* ---------- state & helpers ---------- */
  var S = { user: null, meta: null, year: 0, month: 0, page: 'dashboard', quotes: [], qf: { status: 'ALL', month: 0, text: '' }, repMonth: 0, charts: [], rt: 0, cust: null, fu: null, fq: { akt: 'ALL', tahap: '', grup: '', text: '', sort: 'grup', dir: 1 }, gq: { sort: '', dir: 1 }, ar: null, af: { st: 'OPEN', kat: '', cust: '', text: '', sort: 'telat', dir: 1 }, ag: { sort: '', dir: 1 }, cf: { akt: 'ALL', grup: '', text: '', sort: 'inv', dir: 1, st: '', base: 0 }, gs: { sort: '', dir: 1 } };
  var SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  var STATUS_LABEL = { 'QUOTATION': 'Quotation', 'PO': 'PO', 'TERJUAL': 'Invoice', 'CARRY OVER': 'Carry Over', 'BATAL': 'Batal' };
  var STATUS_CLS = { 'QUOTATION': 'QUOTATION', 'PO': 'PO', 'TERJUAL': 'TERJUAL', 'CARRY OVER': 'CARRY', 'BATAL': 'BATAL' };

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function isAdmin() { return !!S.user && S.user.role === 'ADMIN'; }
  function canEdit() { return !!S.user && (S.user.role === 'ADMIN' || S.user.role === 'SALES'); }            // data operasional
  function canPlan() { return !!S.user && (S.user.role === 'ADMIN' || S.user.role === 'BRANCH_MANAGER'); }  // target & PIC
  var ROLE_TXT = { ADMIN: 'ADMIN', BRANCH_MANAGER: 'BRANCH MANAGER', SALES: 'SALES', VIEWER: 'VIEWER' };
  function cap(s) { s = String(s).toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); }
  function monthName(m) { return cap(S.meta.months[m - 1]); }
  var nf0 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
  var nf2 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
  var nf1 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });
  function fmt(n) { return nf0.format(Math.round(n || 0)); }
  function rp(n) { return 'Rp ' + fmt(n); }
  function compact(n, prefix) {
    n = n || 0; var a = Math.abs(n), p = prefix === false ? '' : 'Rp ';
    if (a >= 1e9) return p + nf2.format(n / 1e9) + ' M';
    if (a >= 1e6) return p + nf1.format(n / 1e6) + ' jt';
    if (a >= 1e3) return p + nf0.format(n / 1e3) + ' rb';
    return p + nf0.format(n);
  }
  function pct(v, d) { return v == null ? '–' : (v * 100).toLocaleString('id-ID', { maximumFractionDigits: d == null ? 1 : d }) + '%'; }
  function achClass(v) { return v == null ? 'none' : v >= 1 ? 'good' : v >= 0.7 ? 'warn' : 'bad'; }
  function achPill(v) { return '<span class="pill ' + achClass(v) + '">' + pct(v) + '</span>'; }
  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function todayStr() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function parseRp(s) {
    s = String(s == null ? '' : s).replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.');
    var n = parseFloat(s); return isNaN(n) ? 0 : n;
  }
  function stBadge(s) { return '<span class="st st-' + STATUS_CLS[s] + '">' + esc(STATUS_LABEL[s] || s) + '</span>'; }

  /* Semua aksi dijalankan lewat Cloud.api (js/store.js): hitung di browser, simpan ke Supabase. */
  function call(action, payload) {
    return Cloud.api(action, payload).catch(function (e) {
      if (/Sesi berakhir/.test(e.message)) sessionExpired();
      throw e;
    });
  }
  function prefetch() { }
  function toast(msg, isErr) {
    var el = document.createElement('div'); el.className = 'toast' + (isErr ? ' err' : ''); el.textContent = msg;
    $('#toasts').appendChild(el); setTimeout(function () { el.remove(); }, isErr ? 6000 : 3000);
  }
  function killCharts() { S.charts.forEach(function (c) { try { c.destroy(); } catch (e) { } }); S.charts = []; }

  /* ---------- modal ---------- */
  function openModal(o) {
    var root = $('#modalRoot');
    var ov = document.createElement('div'); ov.className = 'overlay';
    ov.innerHTML = '<div class="modal' + (o.wide ? ' wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(o.title) + '">' +
      '<div class="modal-head"><h3>' + esc(o.title) + '</h3><button class="btn ghost sm" data-close aria-label="Tutup">✕</button></div>' +
      '<div class="modal-body">' + o.body + '</div><div class="modal-foot">' + (o.foot || '') + '</div></div>';
    root.appendChild(ov);
    function close() { ov.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(); });
    $$('[data-close]', ov).forEach(function (b) { b.addEventListener('click', close); });
    ov.close = close;
    return ov;
  }

  /* ---------- rupiah input ---------- */
  function rpField(id, label, value, hint) {
    return '<div class="fld"><label for="' + id + '">' + esc(label) + '</label><div class="rp"><span>Rp</span>' +
      '<input type="text" inputmode="decimal" id="' + id + '" data-rp value="' + (value ? esc(nf2.format(value)) : '') + '" autocomplete="off"></div>' +
      '<div class="hint" data-hint-for="' + id + '">' + (hint || '') + '</div></div>';
  }
  function wireRp(scope) {
    $$('[data-rp]', scope).forEach(function (inp) {
      var hint = $('[data-hint-for="' + inp.id + '"]', scope);
      var base = hint ? hint.textContent : '';
      function upd() { if (hint) { var v = parseRp(inp.value); hint.textContent = v ? '= ' + rp(v) : base; } }
      inp.addEventListener('input', upd);
      inp.addEventListener('blur', function () { var v = parseRp(inp.value); inp.value = v ? nf2.format(v) : ''; upd(); });
      inp.addEventListener('focus', function () { inp.select(); });
    });
  }

  /* ---------- boot, login (Supabase Auth) & sesi ---------- */
  var BOUND = false, RECOVERY = false;
  function show(id) { ['boot', 'denied', 'login', 'app'].forEach(function (x) { $('#' + x).hidden = x !== id; }); }
  function bootMsg(m) { $('#bootMsg').textContent = m; show('boot'); }
  function fatal(msg, canLogout) { $('#deniedMsg').textContent = msg; $('#deniedOut').hidden = !canLogout; show('denied'); }

  function boot() {
    $('#deniedOut').addEventListener('click', function () { doLogout(); });
    try {
      if (!window.supabase || !window.supabase.createClient) throw new Error('Pustaka Supabase gagal dimuat. Periksa koneksi internet lalu muat ulang halaman.');
      Cloud.init(window.APP_CONFIG, window.supabase.createClient);
    } catch (e) { return fatal(e.message, false); }
    Cloud.onAuth(function (ev) {
      if (ev === 'PASSWORD_RECOVERY') { RECOVERY = true; newPasswordModal(true); }
      if (ev === 'SIGNED_OUT' && S.user) { S.user = null; showLogin(''); }
    });
    $('#loginForm').addEventListener('submit', function (e) { e.preventDefault(); doLogin(); });
    $('#lgForgot').addEventListener('click', forgotPassword);
    bootMsg('Memeriksa sesi…');
    Cloud.getSession().then(function (s) { if (s) return enter(); showLogin(''); }).catch(function (e) { fatal(e.message, false); });
  }

  function showLogin(msg) {
    show('login'); $('#loginErr').innerHTML = msg ? '<div class="err" style="margin-bottom:10px">' + esc(msg) + '</div>' : '';
    $('#lgPass').value = ''; $('#lgGo').disabled = false;
    setTimeout(function () { ($('#lgEmail').value ? $('#lgPass') : $('#lgEmail')).focus(); }, 30);
  }
  function doLogin() {
    var btn = $('#lgGo'); btn.disabled = true; $('#loginErr').innerHTML = '';
    Cloud.signIn($('#lgEmail').value, $('#lgPass').value).then(enter).catch(function (e) { showLogin(e.message); });
  }
  function forgotPassword() {
    var em = $('#lgEmail').value.trim();
    if (!em) { $('#loginErr').innerHTML = '<div class="err" style="margin-bottom:10px">Isi email Anda dulu, lalu klik "Lupa password?".</div>'; return $('#lgEmail').focus(); }
    Cloud.resetPassword(em).then(function () { $('#loginErr').innerHTML = '<div class="note" style="margin-bottom:10px">Jika email terdaftar, tautan untuk mengatur ulang password sudah dikirim. Periksa kotak masuk Anda.</div>'; })
      .catch(function (e) { $('#loginErr').innerHTML = '<div class="err" style="margin-bottom:10px">' + esc(e.message) + '</div>'; });
  }

  /** Setelah login: baca profil (peran), muat data, tampilkan aplikasi. */
  function enter() {
    bootMsg('Memuat data…');
    return Cloud.loadProfile().then(function (pr) {
      if (pr.role === 'MENUNGGU') return Cloud.signOut().then(function () { showLogin('Akun Anda belum diaktifkan. Hubungi admin agar peran akun Anda diatur.'); });
      return call('init').then(function (meta) {
        S.meta = meta; S.user = { role: pr.role, nama: pr.nama, email: pr.email };
        S.year = meta.currentYear; S.month = meta.currentMonth; S.repMonth = meta.currentMonth; S.page = 'dashboard'; S.setTab = 'target';
        S.quotes = []; S.cust = null; S.fu = null; S.ar = null; S.pf = 0;
        show('app');
        var ys = $('#yearSel');
        ys.innerHTML = meta.years.map(function (y) { return '<option value="' + y + '"' + (y === S.year ? ' selected' : '') + '>' + y + '</option>'; }).join('');
        if (!BOUND) {
          BOUND = true;
          ys.addEventListener('change', function () { S.year = +ys.value; S.month = S.year === S.meta.currentYear ? S.meta.currentMonth : 12; S.repMonth = S.month; render(); });
          $('#btnAuth').addEventListener('click', function () { doLogout(); });
          $('#btnPwd').addEventListener('click', function () { newPasswordModal(false); });
          $('#btnRefresh').addEventListener('click', function () { var b = this; b.disabled = true; Cloud.refresh().then(function () { S.quotes = []; S.cust = null; S.fu = null; S.ar = null; toast('Data dimuat ulang.'); render(); }).catch(function (e) { toast(e.message, true); }).then(function () { b.disabled = false; }); });
          $('#tabs').addEventListener('click', function (e) { var b = e.target.closest('[data-page]'); if (!b) return; S.page = b.dataset.page; buildTabs(); render(); });
          document.addEventListener('click', openBukti);
        }
        updateChrome(); buildTabs(); render();
      });
    }).catch(function (e) {
      if (/Belum masuk/.test(e.message)) return showLogin('');
      fatal(e.message, true);
    });
  }

  function doLogout() {
    Cloud.signOut().then(function () { S.user = null; $('#view').innerHTML = ''; if ($('#login').hidden) showLogin(''); }, function () { S.user = null; if ($('#login').hidden) showLogin(''); });
  }
  function sessionExpired() {
    if (!S.user) return;
    S.user = null; showLogin('Sesi berakhir. Silakan masuk lagi.');
  }

  function updateChrome() {
    $('#userName').textContent = S.user.nama || S.user.email;
    $('#userRole').textContent = ROLE_TXT[S.user.role] || S.user.role;
  }

  function newPasswordModal(fromRecovery) {
    if ($('#npA')) return;
    var body = '<div id="mErr"></div>' + (fromRecovery ? '<div class="note">Buat password baru untuk akun Anda.</div>' : '') +
      '<div class="fld"><label for="npA">Password baru <span class="muted">(minimal 8 karakter)</span></label><input type="password" id="npA" autocomplete="new-password"></div>' +
      '<div class="fld"><label for="npB">Ulangi password baru</label><input type="password" id="npB" autocomplete="new-password"></div>';
    var ov = openModal({ title: fromRecovery ? 'Atur password baru' : 'Ubah password', body: body, foot: '<button class="btn" data-close>Batal</button><button class="btn primary" id="npGo">Simpan</button>' });
    function go() {
      var a = $('#npA', ov).value, b = $('#npB', ov).value;
      if (a !== b) { $('#mErr', ov).innerHTML = '<div class="err">Kedua password tidak sama.</div>'; return; }
      var btn = $('#npGo', ov); btn.disabled = true;
      Cloud.updatePassword(a).then(function () { ov.close(); toast('Password diperbarui.'); if (fromRecovery && !S.user) enter(); })
        .catch(function (e) { $('#mErr', ov).innerHTML = '<div class="err">' + esc(e.message) + '</div>'; btn.disabled = false; });
    }
    $('#npGo', ov).addEventListener('click', go);
    ov.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    setTimeout(function () { $('#npA', ov).focus(); }, 30);
  }

  function pages() {
    var p = [['dashboard', 'Dashboard'], ['target', 'Target & Pencapaian'], ['quotation', 'Quotation'], ['customer', 'Customer'], ['crm', 'CRM Follow Up'], ['ar', 'AR Invoice'], ['laporan', 'Laporan Bulanan']];
    if (canEdit()) p.push(['dataawal', 'Data Awal']);
    if (canPlan()) p.push(['pengaturan', isAdmin() ? 'Pengaturan' : 'Target']);
    return p;
  }
  function buildTabs() {
    $('#tabs').innerHTML = pages().map(function (p) { return '<button class="tab" role="tab" data-page="' + p[0] + '" aria-selected="' + (p[0] === S.page) + '">' + p[1] + '</button>'; }).join('');
  }

  function render() {
    killCharts();
    var token = ++S.rt, v = $('#view');
    v.innerHTML = '<div class="empty"><div class="spinner" style="margin:0 auto 10px"></div>Memuat…</div>';
    var fn = { dashboard: pDashboard, target: pTarget, quotation: pQuotation, customer: pCustomer, crm: pCrm, ar: pAR, laporan: pLaporan, dataawal: pDataAwal, pengaturan: pSettings, backup: pBackup }[S.page];
    fn(token).then(prefetch).catch(function (e) { if (token === S.rt) v.innerHTML = '<div class="err">' + esc(e.message) + '</div>'; });
  }
  function stale(token) { return token !== S.rt; }

  /* ============================================================
   * DASHBOARD
   * ============================================================ */
  function pDashboard(token) {
    return call('dashboard', { year: S.year, month: S.month }).then(function (d) {
      if (stale(token)) return;
      var mn = monthName(S.month), M = d.months[S.month - 1];
      var kpi = '';
      kpi += '<div class="card kpi"><div class="kpi-label">Penjualan ' + esc(mn) + '</div><div class="kpi-value">' + compact(M.sales.total) + '</div>' +
        '<div class="kpi-foot">Parts ' + compact(M.sales.parts) + ' · Bundling ' + compact(M.sales.bundling) + ' · Service ' + compact(M.sales.service) + '</div></div>';
      kpi += '<div class="card kpi"><div class="kpi-label">Penjualan YTD (Jan–' + SHORT[S.month - 1] + ')</div><div class="kpi-value">' + compact(d.ytd.sales) + '</div>' +
        '<div class="kpi-foot">Parts ' + compact(d.ytd.parts) + ' · Bundling ' + compact(d.ytd.bundling) + ' · Service ' + compact(d.ytd.service) + '</div></div>';
      kpi += '<div class="card kpi"><div class="kpi-label">Pipeline terbuka</div><div class="kpi-value">' + compact(d.pipeline.val) + '</div>' +
        '<div class="kpi-foot">' + fmt(d.pipeline.n) + ' quotation belum PO</div></div>';
      kpi += '<div class="card kpi"><div class="kpi-label">Konversi quotation ' + esc(mn) + '</div><div class="kpi-value">' + pct(d.month_sum.winRate, 0) + '</div>' +
        '<div class="kpi-foot">' + fmt(d.month_sum.dn) + ' deal dari ' + fmt(d.month_sum.qn) + ' quotation · PO ' + pct(d.month_sum.poRate, 0) + ' dari nilai quotation</div></div>';

      var monthOpts = S.meta.months.map(function (m, i) { return '<option value="' + (i + 1) + '"' + (i + 1 === S.month ? ' selected' : '') + '>' + cap(m) + '</option>'; }).join('');
      var html = '<div class="page-head"><div><h2>Dashboard ' + S.year + '</h2><p>Pencapaian penjualan parts &amp; service dan progres quotation. Target dan persentase capaian ada di menu <b>Target &amp; Pencapaian</b>.</p></div>' +
        '<label class="sel" style="color:var(--ink-2)"><span>Bulan acuan</span><select id="dashMonth" style="width:auto">' + monthOpts + '</select></label></div>' +
        '<div class="grid g4">' + kpi + '</div>' + arDashCard(d.ar) +
        '<div class="grid g2 section-gap">' +
        '<div class="card card-pad"><h3>Penjualan per bulan</h3><div class="sub">Parts, Bundling, PTS, dan Labour</div><div class="chart-box"><canvas id="ch1" role="img" aria-label="Grafik penjualan per bulan"></canvas></div>' +
        '<div class="legend"><span><i style="background:var(--parts)"></i>Parts</span><span><i style="background:var(--bundling)"></i>Bundling</span><span><i style="background:var(--service)"></i>PTS</span><span><i style="background:var(--labour)"></i>Labour</span></div></div>' +
        '<div class="card card-pad"><h3>Quotation → PO → Penjualan</h3><div class="sub">Nilai quotation yang dibuat, nilai PO dari quotation tersebut, dan realisasi penjualan</div><div class="chart-box"><canvas id="ch2" role="img" aria-label="Grafik funnel quotation, PO, penjualan per bulan"></canvas></div>' +
        '<div class="legend"><span><i style="background:var(--funnel1)"></i>Nilai quotation</span><span><i style="background:var(--funnel2)"></i>Nilai PO</span><span><i style="background:var(--funnel3)"></i>Penjualan</span></div></div></div>' +
        '<div class="card section-gap"><div class="card-pad" style="padding-bottom:6px"><h3>Revenue parts &amp; service ' + S.year + '</h3><div class="sub">Nilai penjualan per kategori per bulan. YTD dihitung Januari s/d ' + esc(mn) + '</div></div>' + revenueTable(d, false) + '</div>' +
        '<div class="card section-gap"><div class="card-pad" style="padding-bottom:6px"><h3>Quotation analysis ' + S.year + '</h3><div class="sub">Quotation dikelompokkan menurut bulan dibuatnya; PO = nilai PO dari quotation yang deal</div></div>' + quotationTable(d) + '</div>' +
        '<div class="card section-gap"><div class="card-pad" style="padding-bottom:6px"><h3>Pipeline terbuka — nilai terbesar</h3><div class="sub">Quotation berstatus Quotation / Carry Over (semua tahun). Umur dihitung dari tanggal quotation.</div></div>' + pipelineTable(d) + '</div>';
      $('#view').innerHTML = html;
      $('#dashMonth').addEventListener('change', function (e) { S.month = +e.target.value; render(); });
      var ab = $('#dashAr'); if (ab) ab.addEventListener('click', function () { openARFor(''); });
      drawCharts(d, false);
    });
  }

  function arDashCard(a) {
    if (!a || (!a.n && !a.asOf)) return '';
    var kpi = function (label, val, foot) { return '<div class="card kpi"><div class="kpi-label">' + label + '</div><div class="kpi-value">' + val + '</div><div class="kpi-foot">' + foot + '</div></div>'; };
    var seg = BUCKETS.map(function (b) { var v = a.buckets[b[0]]; return v && v.val ? '<i class="b-' + b[2] + '" style="width:' + (v.val / a.total * 100) + '%" title="' + esc(b[1]) + ': ' + esc(rp(v.val)) + '"></i>' : ''; }).join('');
    return '<div class="section-gap"><div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px"><div><h3 style="margin:0">Piutang (AR Invoice)</h3><div class="sub">' + (a.asOf ? 'Laporan AR per ' + esc(fmtTgl(a.asOf)) + ' · ' : '') + 'umur dihitung otomatis hari ini</div></div><button class="btn" id="dashAr">Buka AR Invoice</button></div>' +
      '<div class="grid g4">' + kpi('Total piutang', compact(a.total), fmt(a.n) + ' invoice belum lunas') + kpi('Sudah jatuh tempo', compact(a.overdue), fmt(a.nOver) + ' invoice · ' + (a.total ? pct(a.overdue / a.total, 0) : '0%') + ' dari total') +
      kpi('Terlambat > 90 hari', compact(a.over90), a.over90 ? 'perlu eskalasi penagihan' : 'tidak ada') + kpi('Belum jatuh tempo', compact(a.belumJt), 'masih dalam tenggat') + '</div>' +
      (a.total ? '<div class="arstack" role="img" aria-label="Komposisi umur piutang">' + seg + '</div><div class="legend" style="margin-top:6px"><span><i style="background:var(--good)"></i>Belum jatuh tempo</span><span><i style="background:var(--ink-3)"></i>1–30 hari</span><span><i style="background:#d97706"></i>31–90 hari</span><span><i style="background:var(--bad)"></i>&gt; 90 hari</span></div>' : '') + '</div>';
  }

  function revenueTable(d, withTarget) {
    var head = '<tr><th>Keterangan</th>' + SHORT.map(function (m) { return '<th class="num">' + m + '</th>'; }).join('') + '<th class="num">YTD</th></tr>';
    var cats = [['parts', 'Parts'], ['bundling', 'Bundling'], ['pts', 'PTS'], ['labour', 'Labour']];
    function achCell(v, M, i, sales) { return '<td class="num">' + (i + 1 > S.month && !sales ? '–' : achPill(v)) + '</td>'; }
    function block(label, actual, target, ach, ytdActual, ytdTarget, ytdAch, cls) {
      var r = '';
      if (withTarget === 'only') { // halaman Target: hanya target dan % tercapai
        r += '<tr class="grp ' + (cls || '') + '"><td>Target ' + label + '</td>' + d.months.map(function (M) { var t = target(M); return '<td class="num">' + (t ? fmt(t) : '–') + '</td>'; }).join('') + '<td class="num"><b>' + (ytdTarget ? fmt(ytdTarget) : '–') + '</b></td></tr>';
        r += '<tr class="pct"><td class="sub">% tercapai</td>' + d.months.map(function (M, i) { return achCell(ach(M), M, i, actual(M)); }).join('') + '<td class="num">' + achPill(ytdAch) + '</td></tr>';
        return r;
      }
      r += '<tr class="grp ' + (cls || '') + '"><td>' + label + '</td>' + d.months.map(function (M, i) { return '<td class="num">' + fmt(actual(M)) + '</td>'; }).join('') + '<td class="num"><b>' + (ytdActual ? fmt(ytdActual) : '–') + '</b></td></tr>';
      if (!withTarget) return r; // Dashboard: hanya capaian
      r += '<tr class="target"><td class="sub">Target ' + label + '</td>' + d.months.map(function (M) { var t = target(M); return '<td class="num">' + (t ? fmt(t) : '–') + '</td>'; }).join('') + '<td class="num">' + (ytdTarget ? fmt(ytdTarget) : '–') + '</td></tr>';
      r += '<tr class="pct"><td class="sub">% tercapai</td>' + d.months.map(function (M, i) { return achCell(ach(M), M, i, actual(M)); }).join('') + '<td class="num">' + achPill(ytdAch) + '</td></tr>';
      return r;
    }
    var body = cats.map(function (c) {
      var k = c[0];
      return block(c[1], function (M) { return M.sales[k]; }, function (M) { return M.tg[k]; }, function (M) { return M.achc[k]; }, d.ytd[k], d.ytd.tg[k], d.ytd.achc[k]);
    }).join('');
    body += block('TOTAL', function (M) { return M.sales.total; }, function (M) { return M.target; }, function (M) { return M.ach; }, d.ytd.sales, d.ytd.target, d.ytd.ach, 'total');
    return '<div class="tbl-wrap"><table class="t dense sticky-first"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
  }

  function quotationTable(d) {
    var rows = d.months.map(function (M, i) {
      var n = M.qp.n + M.qs.n, v = M.qp.val + M.qs.val, po = M.qp.po + M.qs.po;
      return '<tr><td>' + monthName(i + 1) + '</td><td class="num">' + fmt(M.qp.n) + '</td><td class="num">' + fmt(M.qp.val) + '</td><td class="num">' + fmt(M.qp.dn) + '</td><td class="num">' + fmt(M.qp.po) + '</td>' +
        '<td class="num">' + fmt(M.qs.n) + '</td><td class="num">' + fmt(M.qs.val) + '</td><td class="num">' + fmt(M.qs.dn) + '</td><td class="num">' + fmt(M.qs.po) + '</td>' +
        '<td class="num">' + fmt(v) + '</td><td class="num">' + fmt(po) + '</td><td class="num">' + (v ? pct(po / v) : '–') + '</td></tr>';
    }).join('');
    var T = d.months.reduce(function (a, M) {
      a.pn += M.qp.n; a.pv += M.qp.val; a.pd += M.qp.dn; a.pp += M.qp.po; a.sn += M.qs.n; a.sv += M.qs.val; a.sd += M.qs.dn; a.sp += M.qs.po; return a;
    }, { pn: 0, pv: 0, pd: 0, pp: 0, sn: 0, sv: 0, sd: 0, sp: 0 });
    var tv = T.pv + T.sv, tp = T.pp + T.sp;
    return '<div class="tbl-wrap"><table class="t sticky-first"><thead><tr><th rowspan="2">Bulan</th><th class="group" colspan="4">External parts</th><th class="group" colspan="4">Service</th><th class="group" colspan="3">Total</th></tr>' +
      '<tr><th class="num">Jml</th><th class="num">Nilai</th><th class="num">Deal</th><th class="num">PO</th><th class="num">Jml</th><th class="num">Nilai</th><th class="num">Deal</th><th class="num">PO</th><th class="num">Nilai quot.</th><th class="num">PO</th><th class="num">%</th></tr></thead>' +
      '<tbody>' + rows + '</tbody><tfoot><tr><td>Total</td><td class="num">' + fmt(T.pn) + '</td><td class="num">' + fmt(T.pv) + '</td><td class="num">' + fmt(T.pd) + '</td><td class="num">' + fmt(T.pp) + '</td>' +
      '<td class="num">' + fmt(T.sn) + '</td><td class="num">' + fmt(T.sv) + '</td><td class="num">' + fmt(T.sd) + '</td><td class="num">' + fmt(T.sp) + '</td><td class="num">' + fmt(tv) + '</td><td class="num">' + fmt(tp) + '</td><td class="num">' + (tv ? pct(tp / tv) : '–') + '</td></tr></tfoot></table></div>';
  }

  function pipelineTable(d) {
    var items = d.pipeline.items;
    if (!items.length) return '<div class="empty">Tidak ada quotation terbuka. 🎉</div>';
    var rows = items.map(function (r) {
      var cls = r.umur > 60 ? 'bad' : r.umur > 30 ? 'warn' : 'none';
      return '<tr><td>' + esc(r.customer) + '</td><td>' + esc(r.no_quot || '–') + '</td><td><span class="kat">' + esc(r.kategori) + '</span></td><td class="num">' + fmt(r.nilai_quot) + '</td><td>' + stBadge(r.status) + '</td><td class="num"><span class="pill ' + cls + '">' + r.umur + ' hari</span></td></tr>';
    }).join('');
    return '<div class="tbl-wrap"><table class="t"><thead><tr><th>Customer</th><th>No. Quotation</th><th>Kategori</th><th class="num">Nilai</th><th>Status</th><th class="num">Umur</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      (d.pipeline.n > items.length ? '<div class="card-pad muted">Menampilkan ' + items.length + ' dari ' + d.pipeline.n + ' quotation terbuka. Lihat semuanya di tab Quotation.</div>' : '');
  }

  function drawCharts(d, withTarget) {
    if (!window.Chart) { $$('.chart-box').forEach(function (b) { b.innerHTML = '<div class="empty">Chart.js gagal dimuat (cek koneksi internet).</div>'; }); return; }
    var ink = cssVar('--ink-3'), grid = cssVar('--line');
    Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    Chart.defaults.color = ink;
    var tipFmt = function (c) { return ' ' + c.dataset.label + ': ' + rp(c.parsed.y); };
    var axisY = { grid: { color: grid }, border: { display: false }, ticks: { callback: function (v) { return compact(v, false); } } };
    var common = { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: tipFmt } } } };
    S.charts.push(new Chart($('#ch1'), {
      data: {
        labels: SHORT,
        datasets: [
          { type: 'bar', label: 'Parts', data: d.months.map(function (M) { return M.sales.parts; }), backgroundColor: cssVar('--parts'), stack: 's', borderRadius: 3 },
          { type: 'bar', label: 'Bundling', data: d.months.map(function (M) { return M.sales.bundling; }), backgroundColor: cssVar('--bundling'), stack: 's', borderRadius: 3 },
          { type: 'bar', label: 'PTS', data: d.months.map(function (M) { return M.sales.pts; }), backgroundColor: cssVar('--service'), stack: 's', borderRadius: 3 },
          { type: 'bar', label: 'Labour', data: d.months.map(function (M) { return M.sales.labour; }), backgroundColor: cssVar('--labour'), stack: 's', borderRadius: 3 },
          withTarget && { type: 'line', label: 'Target', data: d.months.map(function (M) { return M.target || null; }), borderColor: cssVar('--target'), borderDash: [6, 4], borderWidth: 2, pointRadius: 2, pointBackgroundColor: cssVar('--target'), spanGaps: true, tension: 0 }
        ].filter(Boolean)
      },
      options: Object.assign({}, common, { scales: { x: { stacked: true, grid: { display: false } }, y: Object.assign({ stacked: true }, axisY) } })
    }));
    if ($('#ch2')) S.charts.push(new Chart($('#ch2'), {
      type: 'bar',
      data: {
        labels: SHORT,
        datasets: [
          { label: 'Nilai quotation', data: d.months.map(function (M) { return M.qp.val + M.qs.val; }), backgroundColor: cssVar('--funnel1'), borderRadius: 3 },
          { label: 'Nilai PO', data: d.months.map(function (M) { return M.qp.po + M.qs.po; }), backgroundColor: cssVar('--funnel2'), borderRadius: 3 },
          { label: 'Penjualan', data: d.months.map(function (M) { return M.sales.total; }), backgroundColor: cssVar('--funnel3'), borderRadius: 3 }
        ]
      },
      options: Object.assign({}, common, { scales: { x: { grid: { display: false } }, y: axisY } })
    }));
  }


  /* ============================================================
   * TARGET & PENCAPAIAN
   * ============================================================ */
  function pTarget(token) {
    return call('dashboard', { year: S.year, month: S.month }).then(function (d) {
      if (stale(token)) return;
      var mn = monthName(S.month), M = d.months[S.month - 1];
      var kpi = function (label, val, foot, ach) {
        return '<div class="card kpi"><div class="kpi-label">' + label + '</div><div class="kpi-value">' + val + '</div>' +
          (ach === undefined ? '' : '<div class="bar ' + achClass(ach) + '"><i style="width:' + Math.min(100, (ach || 0) * 100) + '%"></i></div>') + '<div class="kpi-foot">' + foot + '</div></div>';
      };
      var cards = kpi('Capaian ' + esc(mn), pct(M.ach), 'Target ' + esc(mn) + ' ' + (M.target ? rp(M.target) : '<i>belum diatur</i>'), M.ach) +
        kpi('Capaian YTD (Jan–' + SHORT[S.month - 1] + ')', pct(d.ytd.ach), 'Target YTD ' + (d.ytd.target ? rp(d.ytd.target) : '<i>belum diatur</i>'), d.ytd.ach) +
        kpi('Capaian setahun ' + S.year, pct(d.full.ach), 'Target tahunan ' + (d.full.target ? rp(d.full.target) : '<i>belum diatur</i>'), d.full.ach);
      var monthOpts = S.meta.months.map(function (m, i) { return '<option value="' + (i + 1) + '"' + (i + 1 === S.month ? ' selected' : '') + '>' + cap(m) + '</option>'; }).join('');
      $('#view').innerHTML = '<div class="page-head"><div><h2>Target &amp; pencapaian ' + S.year + '</h2><p>Capaian penjualan terhadap target per kategori, beserta persentase tercapainya.' + (canPlan() ? ' Target diatur di menu ' + (canEdit() ? 'Pengaturan' : 'Target') + '.' : '') + '</p></div>' +
        '<label class="sel" style="color:var(--ink-2)"><span>Bulan acuan</span><select id="tgMonth" style="width:auto">' + monthOpts + '</select></label></div>' +
        '<div class="grid g3">' + cards + '</div>' +
        '<div class="card section-gap"><div class="card-pad" style="padding-bottom:6px"><h3>Capaian, target &amp; % tercapai ' + S.year + '</h3><div class="sub">Capaian penjualan, target, dan % tercapai per kategori per bulan. YTD dihitung Januari s/d ' + esc(mn) + '.</div></div>' + revenueTable(d, true) + '</div>';
      $('#tgMonth').addEventListener('change', function (e) { S.month = +e.target.value; render(); });
    });
  }

  /* ============================================================
   * QUOTATION
   * ============================================================ */
  function pQuotation(token) {
    return Promise.all([call('listQuotations'), call('listAR').catch(function () { return null; })]).then(function (r) {
      if (stale(token)) return;
      S.quotes = r[0]; S.ar = r[1] || S.ar; drawQuotation();
    });
  }

  function arOfQuote(q) { // cocokkan invoice AR dengan quotation lewat No. PO customer + nama customer
    if (!S.ar || !q.no_po) return null;
    var k = String(q.no_po).trim().toUpperCase(), c = arKeyJs(q.customer);
    return S.ar.list.filter(function (r) { return String(r.no_ref || '').trim().toUpperCase() === k && arKeyJs(r.customer) === c; })[0] || null;
  }
  function arBadge(r) {
    if (!r) return '';
    return '<div style="margin-top:3px">' + (r.sisa <= 0 ? '<span class="pill good" title="Invoice ' + esc(r.doc_no) + '">Lunas</span>' :
      '<a href="#" class="lnk" data-arlink="' + esc(r.customer_id) + '"><span class="pill ' + (r.telat > 60 ? 'bad' : r.telat > 0 ? 'warn' : 'none') + '" title="Invoice ' + esc(r.doc_no) + '">Piutang ' + compact(r.sisa) + (r.telat > 0 ? ' · telat ' + r.telat + ' hr' : '') + '</span></a>') + '</div>';
  }
  function filteredQuotes() {
    var f = S.qf, t = f.text.trim().toLowerCase();
    return S.quotes.filter(function (r) {
      var openChip = f.status === 'QUOTATION' || f.status === 'CARRY OVER';
      if (!openChip && +r.tgl.slice(0, 4) !== S.year) return false;
      if (f.status !== 'ALL' && r.status !== f.status) return false;
      if (f.month && +r.tgl.slice(5, 7) !== f.month) return false;
      if (t && (r.customer + ' ' + r.no_quot + ' ' + (r.no_po || '') + ' ' + r.catatan).toLowerCase().indexOf(t) < 0) return false;
      return true;
    }).sort(function (a, b) { return a.tgl < b.tgl ? 1 : a.tgl > b.tgl ? -1 : 0; });
  }

  function custKeyJs(s) { return String(s || '').toUpperCase().replace(/\s+/g, ' ').trim(); }

  function drawQuotation() {
    var yearRows = S.quotes.filter(function (r) { return +r.tgl.slice(0, 4) === S.year; });
    var counts = { ALL: yearRows.length };
    S.meta.status.forEach(function (s) {
      counts[s] = S.quotes.filter(function (r) { return r.status === s && ((s === 'QUOTATION' || s === 'CARRY OVER') || +r.tgl.slice(0, 4) === S.year); }).length;
    });
    var chips = [['ALL', 'Semua']].concat(S.meta.status.map(function (s) { return [s, STATUS_LABEL[s]]; })).map(function (c) {
      return '<button class="chip" data-status="' + c[0] + '" aria-pressed="' + (S.qf.status === c[0]) + '">' + c[1] + '<span class="c">' + (counts[c[0]] || 0) + '</span></button>';
    }).join('');
    var monthOpts = '<option value="0">Semua bulan</option>' + S.meta.months.map(function (m, i) { return '<option value="' + (i + 1) + '"' + (S.qf.month === i + 1 ? ' selected' : '') + '>' + cap(m) + '</option>'; }).join('');
    $('#view').innerHTML = '<div class="page-head"><div><h2>Quotation ' + S.year + '</h2><p>' + (canEdit() ? 'Input quotation per customer, lalu perbarui progresnya sampai invoice.' : 'Pantau progres quotation (hanya lihat).') + '</p></div>' +
      (canEdit() ? '<button class="btn primary" id="btnNew">+ Quotation baru</button>' : '') + '</div>' +
      '<div class="card"><div class="card-pad toolbar row" style="justify-content:space-between"><div class="chips">' + chips + '</div>' +
      '<div class="row"><select id="qMonth" aria-label="Filter bulan">' + monthOpts + '</select><input type="text" id="qText" placeholder="Cari customer / no. quot / no. PO / catatan" value="' + esc(S.qf.text) + '"></div></div>' +
      '<div id="qTable"></div></div>';
    drawQuotationTable();
    $$('.chip').forEach(function (c) { c.addEventListener('click', function () { S.qf.status = c.dataset.status; drawQuotation(); }); });
    $('#qMonth').addEventListener('change', function (e) { S.qf.month = +e.target.value; drawQuotationTable(); });
    $('#qText').addEventListener('input', function (e) { S.qf.text = e.target.value; drawQuotationTable(); });
    var nb = $('#btnNew'); if (nb) nb.addEventListener('click', function () { quotationModal(null); });
  }

  function drawQuotationTable() {
    var rows = filteredQuotes(), admin = canEdit(), td = Date.now();
    var el = $('#qTable');
    if (!rows.length) { el.innerHTML = '<div class="empty">Belum ada quotation untuk filter ini.' + (admin ? ' Klik <b>+ Quotation baru</b> untuk menambahkan.' : '') + '</div>'; return; }
    var tot = rows.reduce(function (a, r) { a.q += r.nilai_quot; a.p += r.nilai_po; a.j += r.nilai_jual; return a; }, { q: 0, p: 0, j: 0 });
    var body = rows.map(function (r) {
      var open = r.status === 'QUOTATION' || r.status === 'CARRY OVER';
      var umur = open ? Math.max(0, Math.round((td - new Date(r.tgl).getTime()) / 86400000)) : null;
      var uc = umur > 60 ? 'bad' : umur > 30 ? 'warn' : 'none';
      var ar = r.status === 'TERJUAL' ? arOfQuote(r) : null;
      return '<tr><td class="num" style="text-align:left">' + esc(r.tgl) + '</td><td>' + esc(r.no_quot || '–') + (r.no_po ? '<div class="muted" style="font-size:12px">PO: ' + esc(r.no_po) + '</div>' : '') + '</td><td>' + esc(r.customer) + (r.catatan ? '<div class="muted" style="font-size:12px">' + esc(r.catatan) + '</div>' : '') + '</td>' +
        '<td><span class="kat">' + esc(r.kategori) + '</span></td><td class="num">' + fmt(r.nilai_quot) + '</td><td>' + stBadge(r.status) + arBadge(ar) + '</td><td>' + buktiCell(r) + '</td>' +
        '<td class="num">' + (open ? '<span class="pill ' + uc + '">' + umur + ' hari</span>' : '') + '</td>' +
        '<td class="num">' + (r.nilai_po ? fmt(r.nilai_po) : '–') + '</td><td class="num">' + (r.nilai_jual ? fmt(r.nilai_jual) : '–') + '</td>' +
        (admin ? '<td><div class="cell-actions">' + (r.status === 'TERJUAL' && S.ar && !ar ? '<button class="btn sm" data-arq="' + esc(r.id) + '" title="Catat invoice ini sebagai piutang di menu AR Invoice">+ Piutang</button>' : '') + '<button class="btn sm" data-edit="' + esc(r.id) + '">Update</button><button class="btn sm danger" data-del="' + esc(r.id) + '" aria-label="Hapus">Hapus</button></div></td>' : '') + '</tr>';
    }).join('');
    el.innerHTML = '<div class="tbl-wrap"><table class="t"><thead><tr><th>Tanggal</th><th>No. Quot</th><th>Customer</th><th>Kat.</th><th class="num">Nilai quotation</th><th>Status</th><th>Bukti</th><th class="num">Umur</th><th class="num">Nilai PO</th><th class="num">Invoice</th>' + (admin ? '<th></th>' : '') + '</tr></thead><tbody>' + body +
      '</tbody><tfoot><tr><td colspan="4">' + fmt(rows.length) + ' quotation</td><td class="num">' + fmt(tot.q) + '</td><td></td><td></td><td></td><td class="num">' + fmt(tot.p) + '</td><td class="num">' + fmt(tot.j) + '</td>' + (admin ? '<td></td>' : '') + '</tr></tfoot></table></div>';
    $$('[data-edit]', el).forEach(function (b) { b.addEventListener('click', function () { quotationModal(S.quotes.filter(function (r) { return r.id === b.dataset.edit; })[0]); }); });
    $$('[data-arlink]', el).forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); openARFor(a.dataset.arlink); }); });
    $$('[data-arq]', el).forEach(function (b) { b.addEventListener('click', function () {
      var q = S.quotes.filter(function (r) { return r.id === b.dataset.arq; })[0], v = q.nilai_jual || q.nilai_po || q.nilai_quot, d = q.tgl_jual || q.tgl_po || q.tgl;
      var go = function () { arModal(null, { customer: q.customer, no_ref: q.no_po, kategori: q.kategori === 'PARTS' || q.kategori === 'BUNDLING' ? 'SPAREPART' : 'SERVICE', nilai: v, tgl: d, keterangan: 'Dari quotation ' + (q.no_quot || q.id) }); };
      if (S.cust) go(); else call('listCustomers', { year: S.year }).then(function (c) { S.cust = c; }).catch(function () { }).then(go);
    }); });
    $$('[data-del]', el).forEach(function (b) {
      b.addEventListener('click', function () {
        var r = S.quotes.filter(function (x) { return x.id === b.dataset.del; })[0];
        if (!window.confirm('Hapus quotation ' + r.customer + ' (' + rp(r.nilai_quot) + ')?\nTindakan ini tidak dapat dibatalkan.')) return;
        call('deleteQuotation', { id: r.id }).then(function () { toast('Quotation dihapus.'); S.quotes = S.quotes.filter(function (x) { return x.id !== r.id; }); drawQuotation(); }).catch(function (e) { toast(e.message, true); });
      });
    });
  }

  /* ---- Bukti foto (quotation & PO): disimpan di Supabase Storage (bucket privat); tabel hanya memuat path-nya ---- */
  function buktiRef(u) { u = String(u || ''); return /^https:\/\//.test(u) || /^(quot|po)\/\d{4}\/[A-Za-z0-9_-]{8,}\.(jpg|png|webp)$/.test(u) ? u : ''; }
  function buktiLink(ref, text, title) { return '<a class="lnk" href="#" data-bukti="' + esc(ref) + '" title="' + esc(title || '') + '">' + text + '</a>'; }
  /** Buka foto bukti: tautan bertanda tangan dibuat saat diklik (berlaku 10 menit), jadi bucket tetap privat. */
  function openBukti(e) {
    var a = e.target.closest ? e.target.closest('[data-bukti]') : null; if (!a) return;
    e.preventDefault();
    var w = window.open('', '_blank'); // dibuka dulu agar tidak diblokir pop-up
    Cloud.buktiUrl(a.getAttribute('data-bukti')).then(function (u) { if (w) { w.opener = null; w.location = u; } else window.location = u; })
      .catch(function (er) { if (w) w.close(); toast(er.message, true); });
  }
  function buktiCell(r) {
    var q = buktiRef(r.bukti_quot), po = buktiRef(r.bukti_po), out = [];
    if (q) out.push(buktiLink(q, 'Quotation', 'Buka foto quotation'));
    if (po) out.push(buktiLink(po, 'PO', 'Buka foto PO'));
    else if ((r.status === 'PO' || r.status === 'TERJUAL') && q) out.push('<span class="muted" title="Foto PO belum diunggah">PO –</span>');
    return out.length ? '<div class="bukti">' + out.join('') + '</div>' : '<span class="muted">–</span>';
  }
  function shrinkImage(file) { // kecilkan foto (maks 1600 px, JPEG) agar unggahan cepat dan hemat ruang penyimpanan
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var max = 1600, sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)), w = Math.max(1, Math.round(img.naturalWidth * sc)), h = Math.max(1, Math.round(img.naturalHeight * sc));
        var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); cx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        cv.toBlob(function (b) {
          if (!b) return reject(new Error('Foto tidak dapat diproses.'));
          var fr = new FileReader(); fr.onload = function () { resolve({ mime: 'image/jpeg', data: String(fr.result).split(',')[1], preview: cv.toDataURL('image/jpeg', 0.5) }); }; fr.onerror = function () { reject(new Error('Foto tidak dapat dibaca.')); }; fr.readAsDataURL(b);
        }, 'image/jpeg', 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Format foto tidak didukung. Gunakan JPG atau PNG.')); };
      img.src = url;
    });
  }
  function photoFieldHtml(key, label, cur) {
    cur = buktiRef(cur);
    return '<div class="fld photo-fld" data-ph="' + key + '"><label>' + label + ' <span class="muted">(bukti, disarankan)</span></label>' +
      '<div class="ph-cur"' + (cur ? '' : ' hidden') + '>' + (cur ? buktiLink(cur, 'Lihat foto tersimpan') : '') + ' <button type="button" class="linkbtn ph-del">Hapus foto</button></div>' +
      '<div class="ph-new" hidden><img alt="Pratinjau foto" class="ph-img"><button type="button" class="linkbtn ph-cancel">Batalkan foto baru</button></div>' +
      '<input type="file" accept="image/*" class="ph-file" aria-label="' + esc(label) + '"><div class="hint muted ph-hint">Pilih foto atau ambil dari kamera HP. Foto otomatis dikecilkan.</div></div>';
  }
  function wirePhoto(ov, key, cur) { // resolve(): Promise<url baru | '' (dihapus) | undefined (tidak berubah)>
    var box = $('[data-ph="' + key + '"]', ov), st = { cur: buktiRef(cur), img: null, removed: false, uploaded: '' };
    var file = $('.ph-file', box), curRow = $('.ph-cur', box), newRow = $('.ph-new', box), hint = $('.ph-hint', box);
    var HINT0 = 'Pilih foto atau ambil dari kamera HP. Foto otomatis dikecilkan.';
    file.addEventListener('change', function () {
      var f = file.files && file.files[0]; if (!f) return;
      hint.textContent = 'Memproses foto…';
      shrinkImage(f).then(function (im) { st.img = im; st.removed = false; $('.ph-img', box).src = im.preview; newRow.hidden = false; curRow.hidden = true; hint.textContent = 'Foto akan diunggah saat Anda klik Simpan.'; })
        .catch(function (e) { file.value = ''; hint.textContent = e.message; });
    });
    $('.ph-cancel', box).addEventListener('click', function () { st.img = null; file.value = ''; newRow.hidden = true; curRow.hidden = !(st.cur && !st.removed); hint.textContent = HINT0; });
    $('.ph-del', box).addEventListener('click', function () { st.removed = true; curRow.hidden = true; hint.textContent = 'Foto tersimpan akan dihapus saat Anda klik Simpan.'; });
    return {
      resolve: function (jenis, label) {
        if (st.img) return Cloud.uploadBukti(jenis, st.img.mime, st.img.data).then(function (path) { st.uploaded = path; return path; });
        return Promise.resolve(st.removed ? '' : undefined);
      },
      changed: function () { return !!st.img; },
      rollback: function () { var p = st.uploaded; st.uploaded = ''; return p ? Cloud.discardUpload(p) : Promise.resolve(); } // simpan gagal: buang foto yang sudah terunggah
    };
  }

  function quotationModal(rec) {
    if (S.cust) return quotationModal2(rec);
    call('listCustomers', { year: S.year }).then(function (d) { S.cust = d; }).catch(function () { }).then(function () { quotationModal2(rec); });
  }
  function quotationModal2(rec) {
    var isNew = !rec;
    if (rec && rec.kategori === 'SERVICE') rec = Object.assign({}, rec, { kategori: 'PTS' }); // data lama
    rec = rec || { kategori: 'PARTS', tgl: todayStr(), status: 'QUOTATION', customer: '', nilai_quot: 0, no_quot: '', catatan: '', nilai_po: 0, nilai_jual: 0, tgl_po: '', tgl_jual: '' };
    var cmap = {}; // daftar customer: master (dengan grup) + nama yang hanya ada di quotation lama
    if (S.cust) S.cust.list.forEach(function (c) { cmap[custKeyJs(c.nama)] = { nama: c.nama, grup: c.grup || '', akt: c.aktivitas }; });
    S.quotes.forEach(function (q) { var k = custKeyJs(q.customer); if (!cmap[k]) cmap[k] = { nama: q.customer, grup: '', akt: '' }; });
    var clist = Object.keys(cmap).map(function (k) { return cmap[k]; }).sort(function (x, y) { return x.nama.localeCompare(y.nama); });
    var gset = {}; clist.forEach(function (c) { if (c.grup) gset[c.grup] = 1; });
    var dl = '<datalist id="grpList2">' + Object.keys(gset).sort().map(function (g) { return '<option value="' + esc(g) + '">'; }).join('') + '</datalist>';
    var kat = '<div class="seg" role="group" aria-label="Kategori">' + S.meta.kategori.map(function (k) { return '<button type="button" data-kat="' + k + '" aria-pressed="' + (rec.kategori === k) + '">' + ({ PARTS: 'Parts', BUNDLING: 'Bundling', PTS: 'PTS', LABOUR: 'Labour' }[k] || k) + '</button>'; }).join('') + '</div>';
    var body = '<div id="mErr"></div>' + dl +
      '<div class="fld cb"><label for="mCust">Customer</label><div class="cb-wrap"><input type="text" id="mCust" value="' + esc(rec.customer) + '" placeholder="Ketik atau pilih customer" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="cbList"><button type="button" class="cb-btn" id="cbBtn" tabindex="-1" aria-label="Tampilkan daftar customer">▾</button><div class="cb-list" id="cbList" role="listbox" hidden></div></div><div class="hint" id="cbInfo"></div></div>' +
      '<div class="fld" id="mGrupWrap" hidden><label for="mGrup">Grup customer baru <span class="muted">(opsional)</span></label><input type="text" id="mGrup" list="grpList2" placeholder="mis. CARGILL, PRIVAT, RETAIL" autocomplete="off"></div>' +
      '<div class="fld"><label>Kategori</label>' + kat + '</div>' +
      '<div class="f2">' + rpField('mNilai', 'Nilai quotation', rec.nilai_quot, 'Ketik angka, mis. 12500000') + '<div class="fld"><label for="mTgl">Tanggal quotation</label><input type="date" id="mTgl" value="' + esc(rec.tgl) + '"></div></div>' +
      '<div class="fld"><label for="mNo">No. quotation <span class="muted">(opsional)</span></label><input type="text" id="mNo" value="' + esc(rec.no_quot) + '"></div>' +
      '<div class="fld"><label for="mCat">Catatan <span class="muted">(opsional)</span></label><textarea id="mCat" rows="2">' + esc(rec.catatan) + '</textarea></div>' +
      photoFieldHtml('quot', 'Foto quotation', rec.bukti_quot);
    if (isNew) {
      body += '<div class="progress-box"><div class="fld"><label>Status awal</label><div class="seg" role="group" aria-label="Status awal"><button type="button" data-st0="QUOTATION" aria-pressed="true">Quotation</button><button type="button" data-st0="PO" aria-pressed="false">Langsung PO (sudah deal)</button></div></div>' +
        '<div id="mPo0" hidden><div class="f2"><div class="fld"><label for="mNoPO0">No. PO dari customer <span class="req">*wajib</span></label><input type="text" id="mNoPO0" autocomplete="off" placeholder="sesuai dokumen PO customer"></div><div class="fld"><label for="mTglPO0">Tanggal PO</label><input type="date" id="mTglPO0" value="' + todayStr() + '"></div></div>' + photoFieldHtml('po', 'Foto PO dari customer', '') + '</div>' +
        '<div class="hint muted" id="mSt0Hint">Quotation baru, menunggu keputusan customer.</div></div>';
    }
    if (!isNew) {
      body += '<div class="progress-box"><div class="fld"><label for="mStatus">Progres / status</label><select id="mStatus">' + S.meta.status.map(function (s) { return '<option value="' + s + '"' + (rec.status === s ? ' selected' : '') + '>' + STATUS_LABEL[s] + '</option>'; }).join('') + '</select></div>' +
        '<div id="mPO"><div class="fld"><label for="mNoPO">No. PO dari customer <span class="req">*wajib</span></label><input type="text" id="mNoPO" value="' + esc(rec.no_po || '') + '" autocomplete="off"></div><div class="f2">' + rpField('mNilaiPO', 'Nilai PO', rec.nilai_po, 'Kosongkan = sama dengan nilai quotation') + '<div class="fld"><label for="mTglPO">Tanggal PO</label><input type="date" id="mTglPO" value="' + esc(rec.tgl_po) + '"></div></div>' + photoFieldHtml('po', 'Foto PO dari customer', rec.bukti_po) + '</div>' +
        '<div id="mJual" class="f2">' + rpField('mNilaiJual', 'Nilai invoice', rec.nilai_jual, 'Kosongkan = sama dengan nilai PO') + '<div class="fld"><label for="mTglJual">Tanggal invoice</label><input type="date" id="mTglJual" value="' + esc(rec.tgl_jual) + '"></div></div>' +
        '<div class="hint muted" id="mStHint"></div></div>';
    }
    var foot = '<button class="btn" data-close>Batal</button>' + (isNew ? '<button class="btn" id="mSaveMore">Simpan &amp; tambah lagi</button>' : '') + '<button class="btn primary" id="mSave">Simpan</button>';
    var ov = openModal({ title: isNew ? 'Quotation baru' : 'Update quotation', body: body, foot: foot });
    wireRp(ov);
    var phQ = wirePhoto(ov, 'quot', rec.bukti_quot), phP = wirePhoto(ov, 'po', rec.bukti_po);
    (function combo() {
      var inp = $('#mCust', ov), list = $('#cbList', ov), info = $('#cbInfo', ov), gw = $('#mGrupWrap', ov), act = -1, shown = [];
      function find(v) { return cmap[custKeyJs(v)]; }
      function updInfo() {
        var v = inp.value.trim(), c = v && find(v);
        if (!v) { info.innerHTML = ''; gw.hidden = true; return; }
        if (c) { info.innerHTML = 'Grup: <b>' + esc(c.grup || 'belum diatur') + '</b>' + (c.akt ? ' · ' + esc(AKT_LABEL[c.akt] || c.akt) : ''); gw.hidden = true; }
        else { info.innerHTML = 'Customer baru — akan ditambahkan ke daftar Customer.'; gw.hidden = false; }
      }
      function draw(all) {
        var t = inp.value.trim().toLowerCase();
        shown = clist.filter(function (c) { return all || !t || (c.nama + ' ' + c.grup).toLowerCase().indexOf(t) >= 0; });
        var more = shown.length > 60; shown = shown.slice(0, 60); act = -1;
        list.innerHTML = shown.length ? shown.map(function (c, i) {
          return '<div class="cb-item" role="option" data-i="' + i + '"><span class="cb-n">' + esc(c.nama) + '</span><span class="cb-g">' + esc(c.grup || '–') + '</span></div>';
        }).join('') + (more ? '<div class="cb-more">Ketik untuk menyaring…</div>' : '') : '<div class="cb-more">Tidak ada yang cocok — nama ini akan dibuat sebagai customer baru.</div>';
        list.hidden = false; inp.setAttribute('aria-expanded', 'true');
      }
      function hide() { list.hidden = true; inp.setAttribute('aria-expanded', 'false'); }
      function pick(i) { var c = shown[i]; if (!c) return; inp.value = c.nama; hide(); updInfo(); }
      function mark() { $$('.cb-item', list).forEach(function (e, i) { e.classList.toggle('on', i === act); if (i === act) e.scrollIntoView({ block: 'nearest' }); }); }
      inp.addEventListener('focus', function () { draw(false); });
      inp.addEventListener('input', function () { draw(false); updInfo(); });
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') { e.preventDefault(); if (list.hidden) draw(false); act = Math.min(shown.length - 1, act + 1); mark(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); act = Math.max(0, act - 1); mark(); }
        else if (e.key === 'Enter' && !list.hidden && act >= 0) { e.preventDefault(); pick(act); }
        else if (e.key === 'Escape' && !list.hidden) { e.stopPropagation(); hide(); }
      });
      list.addEventListener('mousedown', function (e) { e.preventDefault(); var it = e.target.closest('.cb-item'); if (it) pick(+it.dataset.i); });
      $('#cbBtn', ov).addEventListener('click', function () { if (list.hidden) { draw(true); inp.focus(); } else hide(); });
      inp.addEventListener('blur', function () { setTimeout(hide, 120); });
      updInfo();
    })();
    var kategori = rec.kategori;
    $$('[data-kat]', ov).forEach(function (b) { b.addEventListener('click', function () { kategori = b.dataset.kat; $$('[data-kat]', ov).forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); }); });
    var st0 = 'QUOTATION';
    $$('[data-st0]', ov).forEach(function (b) {
      b.addEventListener('click', function () {
        st0 = b.dataset.st0; $$('[data-st0]', ov).forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
        $('#mPo0', ov).hidden = st0 !== 'PO';
        $('#mSt0Hint', ov).textContent = st0 === 'PO' ? 'Customer sudah deal: wajib isi No. PO dari customer. Nilai PO otomatis sama dengan nilai quotation, dan masuk hitungan PO bulan quotation ini. Progres selanjutnya (Invoice) diubah lewat tombol Update.' : 'Quotation baru, menunggu keputusan customer.';
      });
    });
    function syncStatus() {
      if (isNew) return;
      var st = $('#mStatus', ov).value, hints = {
        'QUOTATION': 'Masih menunggu keputusan customer.', 'PO': 'Customer sudah PO, barang/jasa belum ditagihkan.', 'TERJUAL': 'Sudah di-invoice — nilai invoice masuk ke revenue bulan tanggal invoice.',
        'CARRY OVER': 'Belum deal, dibawa ke bulan berikutnya (tetap dihitung sebagai pipeline).', 'BATAL': 'Dibatalkan / tidak jadi.'
      };
      $('#mPO', ov).hidden = !(st === 'PO' || st === 'TERJUAL'); $('#mJual', ov).hidden = st !== 'TERJUAL'; $('#mStHint', ov).textContent = hints[st];
    }
    if (!isNew) { $('#mStatus', ov).addEventListener('change', function () { var st = this.value; if (st === 'PO' || st === 'TERJUAL') { if (!$('#mTglPO', ov).value) $('#mTglPO', ov).value = todayStr(); } if (st === 'TERJUAL' && !$('#mTglJual', ov).value) $('#mTglJual', ov).value = todayStr(); syncStatus(); }); syncStatus(); }

    function collect() {
      var p = { id: rec.id, grup: $('#mGrup', ov).value, customer: $('#mCust', ov).value, kategori: kategori, nilai_quot: parseRp($('#mNilai', ov).value), tgl: $('#mTgl', ov).value, no_quot: $('#mNo', ov).value, catatan: $('#mCat', ov).value, status: 'QUOTATION' };
      if (isNew && st0 === 'PO') { p.status = 'PO'; p.tgl_po = $('#mTglPO0', ov).value || todayStr(); if (p.tgl_po < p.tgl) p.tgl_po = p.tgl; p.nilai_po = p.nilai_quot; p.no_po = $('#mNoPO0', ov).value; }
      if (!isNew) { p.status = $('#mStatus', ov).value; p.no_po = $('#mNoPO', ov).value; p.nilai_po = parseRp($('#mNilaiPO', ov).value); p.tgl_po = $('#mTglPO', ov).value; p.nilai_jual = parseRp($('#mNilaiJual', ov).value); p.tgl_jual = $('#mTglJual', ov).value; }
      return p;
    }
    function dupWarn(p) {
      var msgs = [];
      [['no_quot', 'No. Quotation'], ['no_po', 'No. PO']].forEach(function (f) {
        var v = String(p[f[0]] || '').trim().toLowerCase(); if (!v) return;
        var d = S.quotes.filter(function (q) { return q.id !== p.id && String(q[f[0]] || '').trim().toLowerCase() === v; })[0];
        if (d) msgs.push(f[1] + ' "' + p[f[0]] + '" sudah dipakai pada quotation ' + d.customer + ' (' + d.tgl + ').');
      });
      return msgs.length ? msgs.join('\n') + '\n\nTetap simpan?' : '';
    }
    function save(again) {
      var pd = collect();
      if ((pd.status === 'PO' || pd.status === 'TERJUAL') && !String(pd.no_po || '').trim()) {
        $('#mErr', ov).innerHTML = '<div class="err">No. PO dari customer wajib diisi untuk status PO / Invoice, sesuai dokumen PO asli dari customer.</div>';
        var f = $('#mNoPO0', ov) && !$('#mPo0', ov).hidden ? $('#mNoPO0', ov) : $('#mNoPO', ov); if (f) f.focus(); return;
      }
      var w = dupWarn(pd);
      if (w && !window.confirm(w)) return;
      var btns = $$('.modal-foot .btn', ov); btns.forEach(function (b) { b.disabled = true; });
      var lbl = pd.customer + (pd.no_quot ? ' ' + pd.no_quot : '');
      if (phQ.changed() || phP.changed()) toast('Mengunggah foto…');
      Promise.all([phQ.resolve('QUOT', lbl), phP.resolve('PO', lbl)]).then(function (u) {
        if (u[0] !== undefined) pd.bukti_quot = u[0];
        if (u[1] !== undefined) pd.bukti_po = u[1];
        if (isNew && pd.status === 'QUOTATION') pd.bukti_po = ''; // foto PO hanya dipakai bila langsung PO
        return call('saveQuotation', pd);
      }).then(function (saved) {
        S.cust = null; // master customer bisa bertambah otomatis
        toast(isNew ? (saved.status === 'PO' ? 'Quotation disimpan sebagai PO.' : 'Quotation disimpan.') : 'Quotation diperbarui.');
        var i = S.quotes.map(function (r) { return r.id; }).indexOf(saved.id);
        if (i >= 0) S.quotes[i] = saved; else S.quotes.push(saved);
        ov.close(); drawQuotation();
        if (again) quotationModal(null);
      }).catch(function (e) {
        phQ.rollback(); phP.rollback();
        $('#mErr', ov).innerHTML = '<div class="err">' + esc(e.message) + '</div>'; btns.forEach(function (b) { b.disabled = false; });
      });
    }
    $('#mSave', ov).addEventListener('click', function () { save(false); });
    var sm = $('#mSaveMore', ov); if (sm) sm.addEventListener('click', function () { save(true); });
    setTimeout(function () { $('#mCust', ov).focus(); }, 30);
  }


  /* ============================================================
   * CUSTOMER
   * ============================================================ */
  var SORT_ASC = { nama: 1, g: 1, pic: 1, grup: 1, tahap: 1, next: 1, cust: 1, doc: 1, tgl: 1, jt: 1, kat: 1, target: 1, akt: 1, status: 1 }; // kolom teks: urutan alami A–Z; kolom angka: terbesar dulu
  function sortTh(active, dir, key, label, cls) {
    var on = active === key, asc = SORT_ASC[key] ? dir === 1 : dir === -1;
    return '<th class="' + (cls || '') + '" aria-sort="' + (on ? (asc ? 'ascending' : 'descending') : 'none') + '"><button type="button" class="thsort" data-sk="' + key + '" title="Klik untuk mengurutkan">' + label + ' <span>' + (on ? (asc ? '▲' : '▼') : '↕') + '</span></button></th>';
  }
  function cmpBy(va, vb, dir) { // null selalu di bawah
    if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1;
    return typeof va === 'string' ? va.localeCompare(vb) * dir : (vb - va) * dir;
  }
  var ST_ORDER = ['Naik', 'Baru', 'Beli Lagi', 'Stabil', 'Turun', 'Berhenti Beli', 'Belum Pernah Beli', 'Ada Invoice'];
  /* Potensial revenue = jumlah mesin x Rp 65 juta per unit; dipakai sebagai target untuk menghitung capaian invoice. */
  var POT_PER_UNIT = 65000000;
  function potOf(pop) { return (pop || 0) * POT_PER_UNIT; }
  function potBtn(label, pop, invByYear) {
    var v = potOf(pop);
    return v > 0 ? '<button class="linkbtn" data-pot="' + esc(label) + '" data-pop="' + (pop || 0) + '" data-inv="' + esc(JSON.stringify(invByYear || {})) + '">' + fmt(v) + '</button>' : '–';
  }
  function bindPot(root) {
    $$('[data-pot]', root).forEach(function (b) { b.addEventListener('click', function () {
      var inv = {}; try { inv = JSON.parse(b.dataset.inv); } catch (e) {}
      potModal(b.dataset.pot, +b.dataset.pop, inv);
    }); });
  }
  function potModal(label, pop, inv) {
    var d = S.cust, y = S.year, target = potOf(pop);
    var rows = d.years.map(function (yy) {
      var v = inv[yy] || 0, r = target ? v / target : null, cur = yy === y;
      return '<div class="hbar"><span>' + yy + (yy <= 2025 ? '*' : '') + (cur ? ' ◂' : '') + '</span><div class="hb-track"><i class="' + (r >= 1 ? 'b-good' : r >= 0.5 ? '' : 'b-warn') + '" style="width:' + (v > 0 ? Math.max(3, Math.min(100, Math.round(r * 100))) : 0) + '%"></i></div><b>' + (cur ? '<u>' : '') + (r == null ? '–' : pct(r)) + (cur ? '</u>' : '') + ' <span class="muted">· ' + (v ? rp(v) : '–') + '</span></b></div>';
    }).join('');
    var r = target ? (inv[y] || 0) / target : null;
    var body = '<div class="dl"><div><span>Populasi mesin</span><b>' + fmt(pop) + ' unit</b></div><div><span>Potensial revenue (target)</span><b>' + rp(target) + '</b></div>' +
      '<div><span>Invoice ' + y + (y <= 2025 ? ' (Jan–Okt)' : '') + '</span><b>' + rp(inv[y] || 0) + '</b></div><div><span>Capaian ' + y + '</span><b style="font-size:20px">' + (r == null ? '–' : pct(r)) + '</b></div>' +
      '<div><span>Sisa menuju target</span><b>' + (target > (inv[y] || 0) ? rp(target - (inv[y] || 0)) : 'Target terlampaui') + '</b></div></div>' +
      '<h3 style="font-size:13px">Capaian per tahun</h3>' + rows +
      '<div class="hint muted">Potensial revenue = jumlah mesin × ' + rp(POT_PER_UNIT) + ' per unit, dipakai sebagai target. Capaian = invoice tahun tersebut ÷ potensial revenue. Tahun yang sedang dilihat ditandai ◂. * Invoice 2023–2025 adalah periode Jan–Okt.</div>';
    openModal({ title: 'Potensial revenue — ' + label, body: body, foot: '<button class="btn primary" data-close>Tutup</button>' });
  }
  var AKT_LABEL = { AKTIF: 'Aktif', 'TIDAK AKTIF': 'Tidak aktif', PROSPECT: 'Prospect' };
  var AKT_HELP = { AKTIF: 'Masih bertransaksi / masih ada quotation', 'TIDAK AKTIF': 'Sudah berhenti (churned)', PROSPECT: 'Belum pernah beli' };
  function stCust(s) {
    var cls = { 'Naik': 'good', 'Turun': 'bad', 'Stabil': 'warn', 'Baru': 'good', 'Beli Lagi': 'good', 'Berhenti Beli': 'bad' }[s] || 'none';
    return '<span class="pill ' + cls + '">' + esc(s) + '</span>';
  }
  function pCustomer(token) {
    return Promise.all([call('listCustomers', { year: S.year }), call('listFollowUps')]).then(function (r) {
      if (stale(token)) return;
      S.cust = r[0]; S.fu = r[1]; drawCustomer();
    });
  }
  /* Tahun pembanding growth: pilihan user, default 2025; harus lebih kecil dari tahun yang dilihat. */
  function growthBase() {
    var y = S.year, ys = S.cust.years.filter(function (v) { return v < y; });
    if (!ys.length) return null;
    return ys.indexOf(S.cf.base) >= 0 ? S.cf.base : (ys.indexOf(2025) >= 0 ? 2025 : ys[ys.length - 1]);
  }
  function growthOf(c) {
    var b = growthBase(); if (b == null || !(c.inv[b] > 0)) return null;
    return ((c.inv[S.year] || 0) - c.inv[b]) / c.inv[b];
  }
  function custFiltered() {
    var f = S.cf, t = f.text.trim().toLowerCase(), y = S.year;
    var rows = S.cust.list.filter(function (c) {
      if (f.akt !== 'ALL' && c.aktivitas !== f.akt) return false;
      if (f.grup && c.grup !== f.grup) return false;
      if (f.st && c.status !== f.st) return false;
      if (t && (c.nama + ' ' + c.grup).toLowerCase().indexOf(t) < 0) return false;
      return true;
    });
    var k = f.sort === 'inv' ? 'y' + y : f.sort;
    var val = function (c) {
      if (k === 'nama') return c.nama; if (k === 'akt') return ['AKTIF', 'PROSPECT', 'TIDAK AKTIF'].indexOf(c.aktivitas) + '';
      if (k === 'pop' || k === 'pot') return c.populasi; if (k === 'growth') return growthOf(c); if (k === 'piutang') return c.piutang ? c.piutang.sisa : 0; if (k === 'open') return c.open;
      if (k === 'status') return ST_ORDER.indexOf(c.status) * -1 + 100; // Naik dulu (nilai kecil = di atas bila naik)
      return c.inv[+k.slice(1)] || 0;
    };
    rows.sort(function (a, b) {
      var va = val(a), vb = val(b), r;
      if (k === 'status') r = (ST_ORDER.indexOf(a.status) - ST_ORDER.indexOf(b.status)) * f.dir; else r = cmpBy(va, vb, f.dir);
      return r || (b.inv[y] - a.inv[y]) || a.nama.localeCompare(b.nama);
    });
    return rows;
  }
  function drawCustomer() {
    var d = S.cust, y = S.year, L = d.list, admin = canEdit();
    var tot = function (fn) { return L.reduce(function (a, c) { return a + fn(c); }, 0); };
    var cnt = { ALL: L.length }; ['AKTIF', 'TIDAK AKTIF', 'PROSPECT'].forEach(function (k) { cnt[k] = L.filter(function (c) { return c.aktivitas === k; }).length; });
    var buying = L.filter(function (c) { return c.inv[y] > 0; }).length;
    var kpi = function (label, val, foot) { return '<div class="card kpi"><div class="kpi-label">' + label + '</div><div class="kpi-value">' + val + '</div><div class="kpi-foot">' + foot + '</div></div>'; };
    var prevTot = y > 2023 ? tot(function (c) { return c.inv[y - 1]; }) : null, curTot = tot(function (c) { return c.inv[y]; });
    var kpis = '<div class="grid g4">' +
      kpi('Total customer', fmt(L.length), fmt(cnt.AKTIF) + ' aktif · ' + fmt(cnt['TIDAK AKTIF']) + ' tidak aktif · ' + fmt(cnt.PROSPECT) + ' prospect') +
      kpi('Customer beli ' + y, fmt(buying), 'punya invoice di ' + y + (y <= 2025 ? ' (Jan–Okt)' : '')) +
      kpi('Invoice ' + y + (y <= 2025 ? ' (Jan–Okt)' : y === 2026 ? ' (berjalan)' : ''), compact(curTot, 'Rp '), prevTot == null ? 'tahun pertama data' : (prevTot ? (curTot >= prevTot ? '▲ ' : '▼ ') + pct(Math.abs(curTot / prevTot - 1)) + ' vs ' + (y - 1) : '–')) +
      kpi('Populasi mesin', fmt(tot(function (c) { return c.populasi; })), 'unit aktif di seluruh customer') + '</div>';
    // ringkasan per grup
    var G = {};
    L.forEach(function (c) {
      var g = c.grup || '(Belum diatur)', o = G[g] || (G[g] = { g: g, n: 0, pop: 0, inv: {} });
      o.n++; o.pop += c.populasi; d.years.forEach(function (yy) { o.inv[yy] = (o.inv[yy] || 0) + c.inv[yy]; });
    });
    var groups = Object.keys(G).map(function (k) { return G[k]; });
    function picCell(o, pic) {
      if (o.g === '(Belum diatur)') return '<span class="muted">–</span>';
      if (!canPlan()) return pic ? esc(pic) : '<span class="muted">–</span>';
      return '<button class="linkbtn pic-btn" data-pic="' + esc(o.g) + '" title="Klik untuk mengisi / mengubah PIC">' + (pic ? esc(pic) : '<span class="muted">+ isi PIC</span>') + '</button>';
    }
    function gTableHtml() {
      var gs = S.gs, key = gs.sort || 'y' + y;
      var picOf = function (o) { return o.g === '(Belum diatur)' ? '' : (d.pics || {})[String(o.g).toUpperCase()] || ''; };
      var val = function (o) { if (key === 'g') return o.g; if (key === 'pic') return picOf(o).toLowerCase(); if (key === 'n') return o.n; if (key === 'pop' || key === 'pot') return o.pop; return o.inv[+key.slice(1)] || 0; };
      var sorted = groups.slice().sort(function (a, b) { if (key === 'pic' && !picOf(a) !== !picOf(b)) return picOf(a) ? -1 : 1; /* grup tanpa PIC selalu di bawah */ return cmpBy(val(a), val(b), gs.dir) || (b.inv[y] - a.inv[y]) || a.g.localeCompare(b.g); });
      var gRows = sorted.map(function (o) {
        return '<tr><td><button class="linkbtn" data-grup="' + esc(o.g === '(Belum diatur)' ? '' : o.g) + '">' + esc(o.g) + '</button></td><td>' + picCell(o, picOf(o)) + '</td><td class="num">' + o.n + '</td><td class="num">' + fmt(o.pop) + '</td>' +
          d.years.map(function (yy) { return '<td class="num' + (yy === y ? ' cur' : '') + '">' + (o.inv[yy] ? fmt(o.inv[yy]) : '–') + '</td>'; }).join('') +
          '<td class="num">' + potBtn('Grup ' + o.g, o.pop, o.inv) + '</td>' +
          '<td class="num">' + (curTot ? pct(o.inv[y] / curTot) : '–') + '</td></tr>';
      }).join('');
      var gFoot = '<tr><td>Total</td><td></td><td class="num">' + L.length + '</td><td class="num">' + fmt(tot(function (c) { return c.populasi; })) + '</td>' +
        d.years.map(function (yy) { return '<td class="num">' + fmt(tot(function (c) { return c.inv[yy]; })) + '</td>'; }).join('') +
        '<td class="num">' + (function () { var ti = {}; d.years.forEach(function (yy) { ti[yy] = tot(function (c) { return c.inv[yy]; }); }); return potBtn('Seluruh customer', tot(function (c) { return c.populasi; }), ti); })() + '</td><td class="num">100%</td></tr>';
      var yh = d.years.map(function (yy) { return sortTh(key, gs.dir, 'y' + yy, 'Invoice ' + yy + (yy <= 2025 ? '*' : ''), 'num' + (yy === y ? ' cur' : '')); }).join('');
      return '<table class="t dense"><thead><tr>' + sortTh(key, gs.dir, 'g', 'Grup', '') + sortTh(key, gs.dir, 'pic', 'PIC', '') + sortTh(key, gs.dir, 'n', 'Customer', 'num') + sortTh(key, gs.dir, 'pop', 'Mesin', 'num') + yh +
        sortTh(key, gs.dir, 'pot', 'Potensial revenue', 'num') + sortTh(key, gs.dir, 'y' + y, 'Porsi ' + y, 'num') + '</tr></thead><tbody>' + gRows + '</tbody><tfoot>' + gFoot + '</tfoot></table>';
    }
    function drawGroups() {
      var box = $('#gTable'); box.innerHTML = gTableHtml();
      $$('[data-sk]', box).forEach(function (b) { b.addEventListener('click', function () {
        var kk = b.dataset.sk, cur = S.gs.sort || 'y' + y;
        if (cur === kk) S.gs.dir = -S.gs.dir; else { S.gs.sort = kk; S.gs.dir = 1; }
        drawGroups();
      }); });
      bindPot(box);
      $$('[data-pic]', box).forEach(function (b) { b.addEventListener('click', function () { picModal(b.dataset.pic, (d.pics || {})[b.dataset.pic.toUpperCase()] || ''); }); });
      $$('[data-grup]', box).forEach(function (b) { b.addEventListener('click', function () { S.cf.grup = b.dataset.grup; S.cf.akt = 'ALL'; drawCustomer(); $('#cTable').scrollIntoView({ behavior: 'smooth', block: 'start' }); }); });
    }
    var chips = [['ALL', 'Semua']].concat(['AKTIF', 'TIDAK AKTIF', 'PROSPECT'].map(function (k) { return [k, AKT_LABEL[k]]; })).map(function (c) {
      return '<button class="chip" data-akt="' + c[0] + '" aria-pressed="' + (S.cf.akt === c[0]) + '">' + c[1] + '<span class="c">' + (cnt[c[0]] || 0) + '</span></button>';
    }).join('');
    var grupOpts = '<option value="">Semua grup</option>' + groups.filter(function (o) { return o.g !== '(Belum diatur)'; }).map(function (o) { return '<option' + (S.cf.grup === o.g ? ' selected' : '') + '>' + esc(o.g) + '</option>'; }).join('');
    var sortOpts = [['inv', 'Invoice ' + y + ' terbesar'], ['status', 'Status invoice'], ['nama', 'Nama A–Z'], ['pop', 'Populasi mesin'], ['pot', 'Potensial revenue'], ['growth', 'Growth ' + (growthBase() ? 'vs ' + growthBase() + ' ' : '') + 'tertinggi'], ['piutang', 'Piutang (AR) terbesar']].map(function (o) { return '<option value="' + o[0] + '"' + (S.cf.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('');
    $('#view').innerHTML = '<div class="page-head"><div><h2>Customer ' + y + '</h2><p>' + (admin ? 'Master customer & tren invoice per tahun. Customer baru otomatis masuk dari input quotation.' : 'Data customer dan tren invoice (hanya lihat).') + '</p></div>' +
      (admin ? '<button class="btn primary" id="btnCust">+ Customer baru</button>' : '') + '</div>' + kpis +
      '<div class="card section-gap"><div class="card-pad" style="padding-bottom:6px"><h3>Ringkasan per grup</h3><div class="sub">Klik nama grup untuk menyaring daftar di bawah. Nilai dalam Rupiah.</div></div><div class="tbl-wrap" id="gTable"></div></div>' +
      '<div class="card section-gap"><div class="card-pad toolbar row" style="justify-content:space-between"><div class="chips">' + chips + '</div>' +
      '<div class="row"><select id="cGrup" aria-label="Filter grup">' + grupOpts + '</select><select id="cSt" aria-label="Filter status invoice"><option value="">Semua status</option>' + ST_ORDER.filter(function (s) { return L.some(function (c) { return c.status === s; }); }).map(function (s) { return '<option' + (S.cf.st === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' + (growthBase() ? '<select id="cBase" aria-label="Bandingkan growth dengan tahun">' + S.cust.years.filter(function (v) { return v < y; }).map(function (v) { return '<option value="' + v + '"' + (v === growthBase() ? ' selected' : '') + '>Growth vs ' + v + '</option>'; }).join('') + '</select>' : '') + '<select id="cSort" aria-label="Urutkan">' + sortOpts + '</select><input type="text" id="cText" placeholder="Cari customer / grup" value="' + esc(S.cf.text) + '"></div></div><div id="cTable"></div></div>' +
      '<div class="note section-gap"><b>Cara membaca:</b> * Invoice 2023–2025 adalah periode <b>Jan–Okt</b> (sampai ' + esc(d.cutoff) + '). Invoice 2026 = data awal Jan–Okt <b>ditambah</b> penjualan setelah tanggal itu yang otomatis masuk dari tab Quotation (status <b>Invoice</b>), sehingga angkanya terus bertambah; mulai 2027 invoice dihitung setahun penuh dari Quotation. Status membandingkan invoice ' + y + ' dengan ' + (y - 1) + ' (selisih ±5% = Stabil). Growth = ' + y + ' dibanding tahun pembanding yang dipilih di filter "Growth vs"' + (growthBase() ? ' (saat ini ' + growthBase() + ')' : '') + '.</div>';
    drawGroups();
    drawCustomerTable();
    $$('.chip').forEach(function (c) { c.addEventListener('click', function () { S.cf.akt = c.dataset.akt; drawCustomer(); }); });
    $('#cGrup').addEventListener('change', function (e) { S.cf.grup = e.target.value; drawCustomerTable(); });
    var cb = $('#cBase'); if (cb) cb.addEventListener('change', function (e) { S.cf.base = +e.target.value; drawCustomer(); });
    $('#cSt').addEventListener('change', function (e) { S.cf.st = e.target.value; drawCustomerTable(); });
    $('#cSort').addEventListener('change', function (e) { S.cf.sort = e.target.value; S.cf.dir = 1; drawCustomerTable(); });
    $('#cText').addEventListener('input', function (e) { S.cf.text = e.target.value; drawCustomerTable(); });
    var nb = $('#btnCust'); if (nb) nb.addEventListener('click', function () { customerModal(null); });
  }
  function drawCustomerTable() {
    var rows = custFiltered(), d = S.cust, y = S.year, admin = canEdit(), el = $('#cTable');
    if (!rows.length) { el.innerHTML = '<div class="empty">Tidak ada customer untuk filter ini.</div>'; return; }
    var fuN = {}; (S.fu || []).forEach(function (f) { fuN[f.customer_id] = (fuN[f.customer_id] || 0) + 1; });
    var body = rows.map(function (c, i) {
      return '<tr><td class="num" style="text-align:left">' + (i + 1) + '</td><td><b>' + esc(c.nama) + '</b><div class="muted" style="font-size:12px">' + esc(c.grup || 'Grup belum diatur') + '</div></td>' +
        '<td><span class="kat">' + esc(AKT_LABEL[c.aktivitas] || c.aktivitas) + '</span></td><td class="num">' + (admin ? '<button class="linkbtn" data-mesin="' + esc(c.id) + '" title="Klik untuk update jumlah mesin">' + fmt(c.populasi) + '</button>' : fmt(c.populasi)) + '</td>' +
        d.years.map(function (yy) { return '<td class="num' + (yy === y ? ' cur' : '') + '">' + (c.inv[yy] ? fmt(c.inv[yy]) : '–') + '</td>'; }).join('') +
        '<td class="num">' + potBtn(c.nama, c.populasi, c.inv) + '</td>' +
        '<td class="num">' + (function (g) { return g == null ? '–' : (g > 0 ? '+' : '') + pct(g, 0); })(growthOf(c)) + '</td><td>' + stCust(c.status) + '</td>' +
        '<td class="num">' + (c.piutang && c.piutang.sisa > 0 ? '<button class="linkbtn" data-ap="' + esc(c.id) + '">' + fmt(c.piutang.sisa) + '</button>' + (c.piutang.telat > 0 ? '<div><span class="pill ' + (c.piutang.maxTelat > 60 ? 'bad' : 'warn') + '">telat ' + fmt(c.piutang.maxTelat) + ' hr</span></div>' : '') : '–') + '</td>' +
        '<td><div class="cell-actions"><button class="btn sm" data-fh="' + esc(c.id) + '">Riwayat' + (fuN[c.id] ? ' (' + fuN[c.id] + ')' : '') + '</button>' + (admin ? '<button class="btn sm primary" data-fn="' + esc(c.id) + '">+ Follow up</button>' : '') + '</div></td>' +
        '<td><div class="cell-actions"><button class="btn sm" data-cd="' + esc(c.id) + '">Detail</button>' + (admin ? '<button class="btn sm" data-ce="' + esc(c.id) + '">Ubah</button>' : '') + '</div></td></tr>';
    }).join('');
    var tl = function (fn) { return fmt(rows.reduce(function (a, c) { return a + fn(c); }, 0)); };
    var ck = S.cf.sort === 'inv' ? 'y' + y : S.cf.sort, dr = S.cf.dir;
    el.innerHTML = '<div class="tbl-wrap"><table class="t dense"><thead><tr><th>No</th>' + sortTh(ck, dr, 'nama', 'Customer / grup', '') + sortTh(ck, dr, 'akt', 'Aktivitas', '') + sortTh(ck, dr, 'pop', 'Mesin', 'num') +
      d.years.map(function (yy) { return sortTh(ck, dr, 'y' + yy, yy + (yy <= 2025 ? '*' : ''), 'num' + (yy === y ? ' cur' : '')); }).join('') +
      sortTh(ck, dr, 'pot', 'Potensial revenue', 'num') + sortTh(ck, dr, 'growth', 'Growth' + (growthBase() ? ' vs ' + growthBase() : ''), 'num') + sortTh(ck, dr, 'status', 'Status invoice', '') + sortTh(ck, dr, 'piutang', 'Piutang (AR)', 'num') + '<th>Follow up</th><th></th></tr>' + '</thead><tbody>' + body +
      '</tbody><tfoot><tr><td colspan="3">' + fmt(rows.length) + ' customer</td><td class="num">' + tl(function (c) { return c.populasi; }) + '</td>' +
      d.years.map(function (yy) { return '<td class="num">' + tl(function (c) { return c.inv[yy]; }) + '</td>'; }).join('') + '<td class="num">' + fmt(potOf(rows.reduce(function (a, c) { return a + c.populasi; }, 0))) + '</td><td></td><td></td><td class="num">' + tl(function (c) { return c.piutang ? c.piutang.sisa : 0; }) + '</td><td></td><td></td></tr></tfoot></table></div>';
    $$('[data-sk]', el).forEach(function (b) {
      b.addEventListener('click', function () {
        var kk = b.dataset.sk, cur = S.cf.sort === 'inv' ? 'y' + y : S.cf.sort;
        if (cur === kk) S.cf.dir = -S.cf.dir; else { S.cf.sort = kk; S.cf.dir = 1; }
        var sel = $('#cSort');
        if (sel) { if (!$('option[value="' + S.cf.sort + '"]', sel)) { var o = document.createElement('option'); o.value = S.cf.sort; o.textContent = 'Sesuai kolom yang diklik'; sel.appendChild(o); } sel.value = S.cf.sort; }
        drawCustomerTable();
      });
    });
    $$('[data-fh]', el).forEach(function (b) { b.addEventListener('click', function () { historyModal(b.dataset.fh); }); });
    $$('[data-fn]', el).forEach(function (b) { b.addEventListener('click', function () { followModal(null, b.dataset.fn); }); });
    $$('[data-ap]', el).forEach(function (b) { b.addEventListener('click', function () { openARFor(b.dataset.ap); }); });
    bindPot(el);
    $$('[data-mesin]', el).forEach(function (b) { b.addEventListener('click', function () { mesinModal(byId(b.dataset.mesin)); }); });
    $$('[data-cd]', el).forEach(function (b) { b.addEventListener('click', function () { customerDetail(byId(b.dataset.cd)); }); });
    $$('[data-ce]', el).forEach(function (b) { b.addEventListener('click', function () { customerModal(byId(b.dataset.ce)); }); });
  }
  function byId(id) { return S.cust.list.filter(function (c) { return c.id === id; })[0]; }

  function picModal(grup, cur) {
    var body = '<div id="mErr"></div><div class="dl"><div><span>Grup</span><b>' + esc(grup) + '</b></div></div>' +
      '<div class="fld"><label for="pPic">PIC (penanggung jawab)</label><input type="text" id="pPic" maxlength="80" value="' + esc(cur) + '" placeholder="mis. Budi Santoso" autocomplete="off">' +
      '<div class="hint muted">Berlaku untuk seluruh customer di grup ini. Kosongkan untuk menghapus PIC.</div></div>';
    var ov = openModal({ title: 'PIC grup', body: body, foot: '<button class="btn" data-close>Batal</button><button class="btn primary" id="pSave">Simpan</button>' });
    var inp = $('#pPic', ov);
    var go = function () {
      $$('.modal-foot .btn', ov).forEach(function (b) { b.disabled = true; });
      call('saveGrupPIC', { grup: grup, pic: inp.value }).then(function () { toast('PIC grup ' + grup + ' disimpan.'); ov.close(); render(); }).catch(function (e) {
        $('#mErr', ov).innerHTML = '<div class="err">' + esc(e.message) + '</div>'; $$('.modal-foot .btn', ov).forEach(function (b) { b.disabled = false; });
      });
    };
    $('#pSave', ov).addEventListener('click', go);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    setTimeout(function () { inp.focus(); inp.select(); }, 30);
  }

  function mesinModal(c) {
    var body = '<div id="mErr"></div><div class="dl"><div><span>Customer</span><b>' + esc(c.nama) + '</b></div><div><span>Jumlah mesin saat ini</span><b>' + fmt(c.populasi) + ' unit</b></div></div>' +
      '<div class="fld"><label for="mJml">Jumlah mesin baru (unit)</label><div class="row" style="gap:8px"><button class="btn" type="button" id="mMin" aria-label="Kurangi satu">−</button><input type="text" inputmode="numeric" id="mJml" value="' + (c.populasi || 0) + '" style="text-align:center;max-width:120px"><button class="btn" type="button" id="mPlus" aria-label="Tambah satu">+</button></div>' +
      '<div class="hint muted" id="mPot"></div></div>' +
      '<div class="fld"><label for="mAlasan">Alasan / keterangan <span class="muted">(opsional)</span></label><input type="text" id="mAlasan" placeholder="mis. unit baru dari kunjungan, hasil survei" autocomplete="off"></div>';
    var ov = openModal({ title: 'Update jumlah mesin', body: body, foot: '<button class="btn" data-close>Batal</button><button class="btn primary" id="mSave">Simpan</button>' });
    var inp = $('#mJml', ov), val = function () { var n = parseInt(String(inp.value).replace(/\D/g, ''), 10); return isNaN(n) ? 0 : n; };
    var upd = function () { var n = val(), dlt = n - (c.populasi || 0); $('#mPot', ov).textContent = 'Potensial revenue: ' + rp(potOf(n)) + (dlt ? ' (' + (dlt > 0 ? '+' : '') + dlt + ' unit dari sebelumnya)' : ''); };
    inp.addEventListener('input', upd); upd();
    $('#mMin', ov).addEventListener('click', function () { inp.value = Math.max(0, val() - 1); upd(); });
    $('#mPlus', ov).addEventListener('click', function () { inp.value = val() + 1; upd(); });
    $('#mSave', ov).addEventListener('click', function () {
      $$('.modal-foot .btn', ov).forEach(function (b) { b.disabled = true; });
      call('updateMesin', { id: c.id, populasi: val(), alasan: $('#mAlasan', ov).value }).then(function () { toast('Jumlah mesin ' + c.nama + ' diperbarui.'); ov.close(); render(); }).catch(function (e) {
        $('#mErr', ov).innerHTML = '<div class="err">' + esc(e.message) + '</div>'; $$('.modal-foot .btn', ov).forEach(function (b) { b.disabled = false; });
      });
    });
    setTimeout(function () { inp.focus(); inp.select(); }, 30);
  }

  function customerDetail(c) {
    var d = S.cust, max = Math.max.apply(null, d.years.map(function (y) { return c.inv[y]; }).concat([1]));
    var bars = d.years.map(function (y) {
      return '<div class="hbar"><span>' + y + (y <= 2025 ? '*' : '') + '</span><div class="hb-track"><i style="width:' + Math.round(c.inv[y] / max * 100) + '%"></i></div><b>' + (c.inv[y] ? rp(c.inv[y]) : '–') + '</b></div>';
    }).join('');
    var body = '<div class="dl"><div><span>Grup</span><b>' + esc(c.grup || '–') + '</b></div><div><span>Aktivitas</span><b>' + esc(AKT_LABEL[c.aktivitas]) + '</b></div><div><span>Populasi mesin</span><b>' + fmt(c.populasi) + ' unit</b></div>' +
      '<div><span>Rata-rata beli parts/unit (sejak 2023)</span><b>' + (c.rata_unit ? rp(c.rata_unit) : '–') + '</b></div><div><span>Status invoice ' + S.year + '</span><b>' + stCust(c.status) + '</b></div>' +
      '<div><span>Quotation ' + S.year + '</span><b>' + (c.nq ? fmt(c.nq) + ' · ' + rp(c.vq) : '–') + '</b></div><div><span>Quotation terbuka</span><b>' + (c.open ? rp(c.open) : '–') + '</b></div>' +
      '<div><span>Piutang (AR Invoice)</span><b>' + (c.piutang && c.piutang.sisa > 0 ? rp(c.piutang.sisa) + ' · ' + c.piutang.n + ' invoice' : '–') + '</b></div><div><span>Piutang terlambat</span><b>' + (c.piutang && c.piutang.telat > 0 ? rp(c.piutang.telat) + ' · terlama ' + fmt(c.piutang.maxTelat) + ' hari' : '–') + '</b></div></div>' +
      '<h3 style="font-size:13px">Invoice per tahun</h3>' + bars + '<div class="hint muted">* Periode Jan–Okt. Invoice 2026 = data awal Jan–Okt + penjualan setelah 31 Okt dari tab Quotation.</div>' + (c.catatan ? '<div class="note">' + esc(c.catatan) + '</div>' : '');
    var foot = (canEdit() ? '<button class="btn" id="cdEdit" style="margin-right:auto">Ubah</button>' : '') + (c.piutang && c.piutang.n ? '<button class="btn" id="cdAr">Lihat piutang</button>' : '') + '<button class="btn primary" data-close>Tutup</button>';
    var ov = openModal({ title: c.nama, body: body, foot: foot });
    var e = $('#cdEdit', ov); if (e) e.addEventListener('click', function () { ov.close(); customerModal(c); });
    var ab = $('#cdAr', ov); if (ab) ab.addEventListener('click', function () { ov.close(); openARFor(c.id); });
  }

  function customerModal(rec) {
    var isNew = !rec; rec = rec || { nama: '', grup: '', aktivitas: 'PROSPECT', populasi: 0, rata_unit: 0, catatan: '', hist: {} };
    var groups = {}; S.cust.list.forEach(function (c) { if (c.grup) groups[c.grup] = 1; });
    var dl = '<datalist id="grpList">' + Object.keys(groups).sort().map(function (g) { return '<option value="' + esc(g) + '">'; }).join('') + '</datalist>';
    var HY = [2023, 2024, 2025, 2026];
    var body = '<div id="mErr"></div>' + dl +
      '<div class="fld"><label for="cNama">Nama customer</label><input type="text" id="cNama" value="' + esc(rec.nama) + '" autocomplete="off"></div>' +
      '<div class="f2"><div class="fld"><label for="cGrupI">Grup</label><input type="text" id="cGrupI" list="grpList" value="' + esc(rec.grup) + '" placeholder="mis. CARGILL, PRIVAT, RETAIL" autocomplete="off"></div>' +
      '<div class="fld"><label for="cAkt">Aktivitas</label><select id="cAkt">' + ['AKTIF', 'TIDAK AKTIF', 'PROSPECT'].map(function (k) { return '<option value="' + k + '"' + (rec.aktivitas === k ? ' selected' : '') + '>' + AKT_LABEL[k] + ' — ' + AKT_HELP[k] + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="f2"><div class="fld"><label for="cPop">Populasi mesin (unit aktif)</label><input type="text" inputmode="numeric" id="cPop" value="' + (rec.populasi || 0) + '"></div>' + rpField('cRata', 'Rata-rata beli parts per unit', rec.rata_unit, 'Opsional, angka dari data awal') + '</div>' +
      '<h3 style="font-size:13px">Invoice historis <span class="muted">(angka tahunan; koreksi bila perlu)</span></h3><div class="f2">' +
      HY.map(function (y) { return rpField('cInv' + y, 'Invoice ' + y + ' (Jan–Okt)', rec.hist['inv_' + y] || 0, ''); }).join('') + '</div>' +
      '<div class="hint muted">Penjualan setelah 31 Okt 2026 tidak perlu diisi di sini — otomatis terhitung dari tab Quotation saat statusnya <b>Invoice</b>, selama nama customer sama persis.</div>' +
      '<div class="fld"><label for="cCat">Catatan <span class="muted">(opsional)</span></label><textarea id="cCat" rows="2">' + esc(rec.catatan) + '</textarea></div>';
    var foot = (!isNew ? '<button class="btn danger" id="cDel" style="margin-right:auto">Hapus</button>' : '') + '<button class="btn" data-close>Batal</button><button class="btn primary" id="cSave">Simpan</button>';
    var ov = openModal({ title: isNew ? 'Customer baru' : 'Ubah customer', body: body, foot: foot, wide: true });
    wireRp(ov);
    $('#cSave', ov).addEventListener('click', function () {
      var p = { id: rec.id, nama: $('#cNama', ov).value, grup: $('#cGrupI', ov).value, aktivitas: $('#cAkt', ov).value, populasi: parseRp($('#cPop', ov).value), rata_unit: parseRp($('#cRata', ov).value), catatan: $('#cCat', ov).value };
      HY.forEach(function (y) { p['inv_' + y] = parseRp($('#cInv' + y, ov).value); });
      $$('.modal-foot .btn', ov).forEach(function (b) { b.disabled = true; });
      call('saveCustomer', p).then(function () { toast('Customer disimpan.'); ov.close(); render(); }).catch(function (e) {
        $('#mErr', ov).innerHTML = '<div class="err">' + esc(e.message) + '</div>'; $$('.modal-foot .btn', ov).forEach(function (b) { b.disabled = false; });
      });
    });
    var del = $('#cDel', ov);
    if (del) del.addEventListener('click', function () {
      if (!window.confirm('Hapus customer ' + rec.nama + '?\nQuotation yang sudah ada tidak ikut terhapus. Tindakan ini tidak dapat dibatalkan.')) return;
      call('deleteCustomer', { id: rec.id }).then(function () { toast('Customer dihapus.'); ov.close(); render(); }).catch(function (e) { toast(e.message, true); });
    });
    setTimeout(function () { $('#cNama', ov).focus(); }, 30);
  }


  /* ============================================================
   * AR INVOICE (piutang belum terbayar)
   * ============================================================ */
  var AR_KAT_LABEL = { UNIT: 'Unit', SPAREPART: 'Sparepart', SERVICE: 'Service' };
  var BUCKETS = [['BELUM_JT', 'Belum jatuh tempo', 'good'], ['B1', 'Terlambat 1–30 hari', 'none'], ['B2', 'Terlambat 31–60 hari', 'warn'], ['B3', 'Terlambat 61–90 hari', 'warn'], ['B4', 'Terlambat 91–120 hari', 'bad'], ['B5', 'Terlambat > 120 hari', 'bad']];
  function arKeyJs(s) { return custKeyJs(s).replace(/[.,]/g, ' ').replace(/\b(PT|CV|TBK)\b/g, ' ').replace(/\s+/g, ' ').trim(); }
  function dayNumJs(s) { var p = s.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000; }
  function addDaysJs(s, n) { return new Date((dayNumJs(s) + n) * 86400000).toISOString().slice(0, 10); }
  function arToday() { return (S.ar && S.ar.today) || todayStr(); }
  function loadAR() { return call('listAR').then(function (d) { S.ar = d; return d; }); }
  function gotoPage(p, setup) { S.page = p; if (setup) setup(); buildTabs(); render(); }
  function openARFor(custId) { gotoPage('ar', function () { S.af.cust = custId || ''; S.af.st = 'OPEN'; S.af.text = ''; S.af.kat = ''; }); }
  function arAge(r) {
    if (r.sisa <= 0) return '<span class="pill good">Lunas</span>';
    if (r.telat <= 0) { var d = Math.round(dayNumJs(r.jatuh_tempo) - dayNumJs(arToday())); return '<span class="pill none">' + (d === 0 ? 'Jatuh tempo hari ini' : 'H-' + d) + '</span>'; }
    return '<span class="pill ' + (r.telat > 60 ? 'bad' : 'warn') + '">' + fmt(r.telat) + ' hari</span>';
  }
  function arTarget(r) { return r.target_bayar ? fmtTgl(r.target_bayar) + (r.sisa > 0 && r.target_bayar < arToday() ? ' <span class="pill bad" title="Janji bayar sudah lewat">lewat</span>' : '') : (r.target_ket ? '<span class="muted">' + esc(r.target_ket) + '</span>' : '<span class="muted">–</span>'); }
  function custGrup(id) { var c = S.cust && S.cust.list.filter(function (x) { return x.id === id; })[0]; return c ? c.grup : ''; }

  function pAR(token) {
    return Promise.all([loadAR(), call('listCustomers', { year: S.year }), call('listFollowUps')]).then(function (r) {
      if (stale(token)) return;
      S.cust = r[1]; S.fu = r[2]; drawAR();
    });
  }
  function arSum(list) {
    var s = { n: 0, total: 0, over: 0, nOver: 0, over90: 0, notDue: 0, b: {} };
    BUCKETS.forEach(function (b) { s.b[b[0]] = { n: 0, val: 0 }; });
    list.forEach(function (r) {
      if (r.sisa <= 0) return;
      s.n++; s.total += r.sisa; s.b[r.bucket].n++; s.b[r.bucket].val += r.sisa;
      if (r.telat > 0) { s.over += r.sisa; s.nOver++; if (r.telat > 90) s.over90 += r.sisa; } else s.notDue += r.sisa;
    });
    return s;
  }
  function arRows() {
    var f = S.af, t = f.text.trim().toLowerCase();
    var rows = S.ar.list.filter(function (r) {
      if (f.st === 'OPEN' && r.sisa <= 0) return false;
      if (f.st === 'TELAT' && !(r.telat > 0)) return false;
      if (f.st === 'BELUMJT' && !(r.sisa > 0 && r.telat <= 0)) return false;
      if (f.st === 'LUNAS' && r.sisa > 0) return false;
      if (f.kat && r.kategori !== f.kat) return false;
      if (f.cust && r.customer_id !== f.cust) return false;
      if (t && (r.customer + ' ' + r.doc_no + ' ' + r.no_ref + ' ' + r.keterangan + ' ' + r.target_ket).toLowerCase().indexOf(t) < 0) return false;
      return true;
    });
    var val = { cust: function (r) { return r.customer; }, doc: function (r) { return r.doc_no; }, tgl: function (r) { return r.tgl || null; }, jt: function (r) { return r.jatuh_tempo || null; },
      telat: function (r) { return r.sisa > 0 ? r.telat : null; }, kat: function (r) { return r.kategori; }, sisa: function (r) { return r.sisa; }, target: function (r) { return r.target_bayar || null; } }[f.sort] || function () { return null; };
    rows.sort(function (a, b) { return cmpBy(val(a), val(b), f.dir) || b.telat - a.telat || b.sisa - a.sisa || a.customer.localeCompare(b.customer); });
    return rows;
  }

  function drawAR() {
    var admin = canEdit(), L = S.ar.list, s = arSum(L), f = S.af;
    var kpi = function (label, val, foot) { return '<div class="card kpi"><div class="kpi-label">' + label + '</div><div class="kpi-value">' + val + '</div><div class="kpi-foot">' + foot + '</div></div>'; };
    var asOf = ''; L.forEach(function (r) { var m = /LAPORAN AR (\d{4}-\d{2}-\d{2})/.exec(r.sumber || ''); if (m && m[1] > asOf) asOf = m[1]; });
    var kpis = '<div class="grid g4">' + kpi('Total piutang', compact(s.total), fmt(s.n) + ' invoice belum lunas') +
      kpi('Sudah jatuh tempo', compact(s.over), fmt(s.nOver) + ' invoice · ' + (s.total ? pct(s.over / s.total, 0) : '0%') + ' dari total piutang') +
      kpi('Terlambat > 90 hari', compact(s.over90), s.over90 ? 'perlu eskalasi penagihan' : 'tidak ada') +
      kpi('Belum jatuh tempo', compact(s.notDue), fmt(s.b.BELUM_JT.n) + ' invoice masih dalam tenggat') + '</div>';
    var max = Math.max.apply(null, BUCKETS.map(function (b) { return s.b[b[0]].val; }).concat([1]));
    var bars = BUCKETS.map(function (b) {
      var v = s.b[b[0]];
      return '<div class="hbar arbar"><span>' + b[1] + '</span><div class="hb-track"><i class="b-' + b[2] + '" style="width:' + (v.val > 0 ? Math.max(3, Math.round(v.val / max * 100)) : 0) + '%"></i></div><b>' + (v.val ? rp(v.val) : '–') + (v.n ? ' <span class="muted">· ' + v.n + ' inv</span>' : '') + '</b></div>';
    }).join('');
    var cnt = { OPEN: L.filter(function (r) { return r.sisa > 0; }).length, TELAT: L.filter(function (r) { return r.telat > 0; }).length, BELUMJT: L.filter(function (r) { return r.sisa > 0 && r.telat <= 0; }).length, LUNAS: L.filter(function (r) { return r.sisa <= 0; }).length, ALL: L.length };
    var chips = [['OPEN', 'Belum lunas'], ['TELAT', 'Terlambat'], ['BELUMJT', 'Belum jatuh tempo'], ['LUNAS', 'Lunas'], ['ALL', 'Semua']].map(function (c) {
      return '<button class="chip" data-ast="' + c[0] + '" aria-pressed="' + (f.st === c[0]) + '">' + c[1] + '<span class="c">' + cnt[c[0]] + '</span></button>';
    }).join('');
    var katOpts = '<option value="">Semua kategori</option>' + S.ar.kategori.map(function (k) { return '<option value="' + k + '"' + (f.kat === k ? ' selected' : '') + '>' + AR_KAT_LABEL[k] + '</option>'; }).join('');
    var custChip = f.cust ? '<button class="chip" id="arClearCust" aria-pressed="true" title="Klik untuk menampilkan semua customer">Customer: ' + esc((S.ar.list.filter(function (r) { return r.customer_id === f.cust; })[0] || {}).customer || '—') + ' ✕</button>' : '';
    $('#view').innerHTML = '<div class="page-head"><div><h2>AR Invoice — piutang belum terbayar</h2><p>' + (asOf ? 'Data awal dari laporan AR per <b>' + fmtTgl(asOf) + '</b>. ' : '') + 'Umur keterlambatan dihitung otomatis dari tanggal jatuh tempo (acuan hari ini ' + fmtTgl(arToday()) + ').' + (admin ? '' : ' (hanya lihat)') + '</p></div>' +
      (admin ? '<div class="row"><button class="btn" id="btnArImp">Perbarui dari laporan AR</button><button class="btn primary" id="btnArNew">+ Invoice baru</button></div>' : '') + '</div>' + kpis +
      '<div class="card section-gap"><div class="card-pad"><h3>Umur piutang (aging)</h3><div class="sub">Nilai sisa tagihan menurut keterlambatan dari tanggal jatuh tempo.</div>' + bars + '</div></div>' +
      '<div class="card section-gap"><div class="card-pad" style="padding-bottom:6px"><h3>Ringkasan per customer</h3><div class="sub">Hanya invoice yang belum lunas. Klik nama customer untuk menyaring daftar invoice di bawah.</div></div><div class="tbl-wrap" id="arCust"></div></div>' +
      '<div class="card section-gap"><div class="card-pad toolbar row" style="justify-content:space-between"><div class="chips">' + chips + custChip + '</div>' +
      '<div class="row"><select id="arKat" aria-label="Filter kategori">' + katOpts + '</select><input type="text" id="arText" placeholder="Cari customer / no. invoice / no. PO / catatan" value="' + esc(f.text) + '"></div></div><div id="arTable"></div></div>' +
      '<div class="note section-gap"><b>Cara membaca:</b> <b>Sisa tagihan</b> = nilai invoice dikurangi pembayaran yang sudah dicatat. <b>Umur</b> = jumlah hari lewat jatuh tempo (H-n = belum jatuh tempo). Klik <b>Riwayat</b> untuk melihat pembayaran dan catatan penagihan tiap invoice.' +
      (admin ? ' Tempel laporan AR terbaru lewat <b>Perbarui dari laporan AR</b>: saldo yang berkurang tercatat sebagai pembayaran, invoice yang sudah tidak ada di laporan dianggap lunas.' : '') + '</div>';
    drawArCust(); drawArTable();
    $$('[data-ast]').forEach(function (b) { b.addEventListener('click', function () { S.af.st = b.dataset.ast; drawAR(); }); });
    $('#arKat').addEventListener('change', function (e) { S.af.kat = e.target.value; drawArTable(); });
    $('#arText').addEventListener('input', function (e) { S.af.text = e.target.value; drawArTable(); });
    var cc = $('#arClearCust'); if (cc) cc.addEventListener('click', function () { S.af.cust = ''; drawAR(); });
    var nb = $('#btnArNew'); if (nb) nb.addEventListener('click', function () { arModal(null); });
    var ib = $('#btnArImp'); if (ib) ib.addEventListener('click', arImportModal);
  }

  function drawArCust() {
    var by = {}, gs = S.ag, key = gs.sort || 'total';
    S.ar.list.forEach(function (r) {
      if (r.sisa <= 0) return;
      var o = by[r.customer_id || r.customer] || (by[r.customer_id || r.customer] = { id: r.customer_id, nama: r.customer, n: 0, total: 0, BELUM_JT: 0, B1: 0, B2: 0, B3: 0, o90: 0, max: 0 });
      o.n++; o.total += r.sisa; if (r.bucket === 'B4' || r.bucket === 'B5') o.o90 += r.sisa; else o[r.bucket] += r.sisa; if (r.telat > o.max) o.max = r.telat;
    });
    var list = Object.keys(by).map(function (k) { return by[k]; });
    var el = $('#arCust');
    if (!list.length) { el.innerHTML = '<div class="empty">Tidak ada piutang yang belum lunas. 🎉</div>'; return; }
    var val = function (o) { return key === 'nama' ? o.nama : key === 'grup' ? custGrup(o.id) || '~' : o[key]; };
    list.sort(function (a, b) { return cmpBy(val(a), val(b), gs.dir) || b.total - a.total || a.nama.localeCompare(b.nama); });
    var tot = function (k) { return list.reduce(function (a, o) { return a + o[k]; }, 0); };
    var body = list.map(function (o) {
      return '<tr><td><button class="linkbtn" data-ac="' + esc(o.id || '') + '">' + esc(o.nama) + '</button></td><td>' + esc(custGrup(o.id) || '–') + '</td><td class="num">' + o.n + '</td>' +
        ['BELUM_JT', 'B1', 'B2', 'B3', 'o90'].map(function (k) { return '<td class="num">' + (o[k] ? fmt(o[k]) : '–') + '</td>'; }).join('') + '<td class="num"><b>' + fmt(o.total) + '</b></td><td class="num">' + (o.max ? '<span class="pill ' + (o.max > 60 ? 'bad' : 'warn') + '">' + fmt(o.max) + ' hari</span>' : '–') + '</td></tr>';
    }).join('');
    el.innerHTML = '<table class="t dense"><thead><tr>' + sortTh(key, gs.dir, 'nama', 'Customer', '') + sortTh(key, gs.dir, 'grup', 'Grup', '') + sortTh(key, gs.dir, 'n', 'Invoice', 'num') + sortTh(key, gs.dir, 'BELUM_JT', 'Belum JT', 'num') +
      sortTh(key, gs.dir, 'B1', '1–30 hari', 'num') + sortTh(key, gs.dir, 'B2', '31–60 hari', 'num') + sortTh(key, gs.dir, 'B3', '61–90 hari', 'num') + sortTh(key, gs.dir, 'o90', '> 90 hari', 'num') + sortTh(key, gs.dir, 'total', 'Total piutang', 'num cur') + sortTh(key, gs.dir, 'max', 'Terlama', 'num') +
      '</tr></thead><tbody>' + body + '</tbody><tfoot><tr><td colspan="2">' + list.length + ' customer</td><td class="num">' + tot('n') + '</td>' + ['BELUM_JT', 'B1', 'B2', 'B3', 'o90', 'total'].map(function (k) { return '<td class="num">' + fmt(tot(k)) + '</td>'; }).join('') + '<td></td></tr></tfoot></table>';
    $$('[data-sk]', el).forEach(function (b) { b.addEventListener('click', function () { var kk = b.dataset.sk, cur = S.ag.sort || 'total'; if (cur === kk) S.ag.dir = -S.ag.dir; else { S.ag.sort = kk; S.ag.dir = 1; } drawArCust(); }); });
    $$('[data-ac]', el).forEach(function (b) { b.addEventListener('click', function () { S.af.cust = b.dataset.ac; S.af.st = 'OPEN'; drawAR(); $('#arTable').scrollIntoView({ behavior: 'smooth', block: 'start' }); }); });
  }

  function drawArTable() {
    var rows = arRows(), admin = canEdit(), el = $('#arTable'), f = S.af;
    if (!rows.length) { el.innerHTML = '<div class="empty">Tidak ada invoice untuk filter ini.</div>'; return; }
    var nFu = {}; (S.fu || []).forEach(function (x) { if (x.ar_id) nFu[x.ar_id] = (nFu[x.ar_id] || 0) + 1; });
    var body = rows.map(function (r) {
      var open = r.sisa > 0;
      return '<tr><td><b>' + esc(r.customer) + '</b><div class="muted" style="font-size:12px">' + esc(custGrup(r.customer_id) || 'Grup belum diatur') + '</div></td>' +
        '<td>' + esc(r.doc_no) + (r.no_ref ? '<div class="muted" style="font-size:12px">PO: ' + esc(r.no_ref) + '</div>' : '') + '</td>' +
        '<td>' + fmtTgl(r.tgl) + '</td><td>' + fmtTgl(r.jatuh_tempo) + '</td><td>' + arAge(r) + '</td><td><span class="kat">' + esc(AR_KAT_LABEL[r.kategori] || r.kategori) + '</span></td>' +
        '<td class="num"><b>' + fmt(r.sisa) + '</b>' + (r.bayar > 0 ? '<div class="muted" style="font-size:12px">dari ' + fmt(r.nilai) + '</div>' : '') + '</td>' +
        '<td>' + arTarget(r) + '</td><td class="crm-note">' + (r.keterangan ? esc(r.keterangan.length > 90 ? r.keterangan.slice(0, 90) + '…' : r.keterangan) : '<span class="muted">–</span>') + '</td>' +
        '<td><div class="cell-actions"><button class="btn sm" data-arh="' + esc(r.id) + '">Riwayat' + (nFu[r.id] ? ' (' + nFu[r.id] + ')' : '') + '</button>' +
        (admin && open ? '<button class="btn sm" data-art="' + esc(r.id) + '">Tagih</button><button class="btn sm primary" data-arp="' + esc(r.id) + '">Bayar</button>' : '') + (admin ? '<button class="btn sm" data-are="' + esc(r.id) + '">Ubah</button>' : '') + '</div></td></tr>';
    }).join('');
    var ck = f.sort, dr = f.dir, tot = rows.reduce(function (a, r) { return a + r.sisa; }, 0);
    el.innerHTML = '<div class="tbl-wrap"><table class="t dense"><thead><tr>' + sortTh(ck, dr, 'cust', 'Customer / grup', '') + sortTh(ck, dr, 'doc', 'No. invoice', '') + sortTh(ck, dr, 'tgl', 'Tgl invoice', '') + sortTh(ck, dr, 'jt', 'Jatuh tempo', '') + sortTh(ck, dr, 'telat', 'Umur', '') + sortTh(ck, dr, 'kat', 'Kategori', '') +
      sortTh(ck, dr, 'sisa', 'Sisa tagihan', 'num') + sortTh(ck, dr, 'target', 'Target bayar', '') + '<th>Catatan</th><th></th></tr></thead><tbody>' + body + '</tbody><tfoot><tr><td colspan="6">' + fmt(rows.length) + ' invoice</td><td class="num">' + fmt(tot) + '</td><td colspan="3"></td></tr></tfoot></table></div>';
    $$('[data-sk]', el).forEach(function (b) { b.addEventListener('click', function () { var kk = b.dataset.sk; if (S.af.sort === kk) S.af.dir = -S.af.dir; else { S.af.sort = kk; S.af.dir = 1; } drawArTable(); }); });
    $$('[data-arh]', el).forEach(function (b) { b.addEventListener('click', function () { arHistory(b.dataset.arh); }); });
    $$('[data-art]', el).forEach(function (b) { b.addEventListener('click', function () { collectModal(arById(b.dataset.art), null); }); });
    $$('[data-arp]', el).forEach(function (b) { b.addEventListener('click', function () { payModal(arById(b.dataset.arp)); }); });
    $$('[data-are]', el).forEach(function (b) { b.addEventListener('click', function () { arModal(arById(b.dataset.are)); }); });
  }
  function arById(id) { return S.ar.list.filter(function (r) { return r.id === id; })[0]; }

  /* ---------- riwayat invoice: pembayaran + catatan penagihan ---------- */
  function arHistory(id) {
    var r = arById(id), admin = canEdit();
    var pays = S.ar.pay.filter(function (p) { return p.ar_id === id; }).sort(function (a, b) { return a.tgl < b.tgl ? 1 : a.tgl > b.tgl ? -1 : (a.dibuat < b.dibuat ? 1 : -1); });
    var notes = (S.fu || []).filter(function (x) { return x.ar_id === id; }).sort(function (a, b) { return a.tgl < b.tgl ? 1 : a.tgl > b.tgl ? -1 : (a.dibuat < b.dibuat ? 1 : -1); });
    var dl = '<div class="dl"><div><span>Customer</span><b>' + esc(r.customer) + '</b></div><div><span>Grup</span><b>' + esc(custGrup(r.customer_id) || '–') + '</b></div>' +
      '<div><span>No. invoice</span><b>' + esc(r.doc_no) + '</b></div><div><span>No. PO customer</span><b>' + esc(r.no_ref || '–') + '</b></div>' +
      '<div><span>Tgl invoice → jatuh tempo</span><b>' + fmtTgl(r.tgl) + ' → ' + fmtTgl(r.jatuh_tempo) + '</b></div><div><span>Umur</span><b>' + arAge(r) + '</b></div>' +
      '<div><span>Nilai tagihan</span><b>' + rp(r.nilai) + '</b></div><div><span>Terbayar · Sisa</span><b>' + rp(r.bayar) + ' · ' + rp(r.sisa) + '</b></div>' +
      '<div><span>Target bayar</span><b>' + arTarget(r) + '</b></div><div><span>Kategori · cabang</span><b>' + esc(AR_KAT_LABEL[r.kategori] || r.kategori) + ' · ' + esc(r.cabang || '–') + '</b></div></div>' +
      (r.keterangan ? '<div class="note">' + esc(r.keterangan) + '</div>' : '');
    var payH = pays.length ? pays.map(function (p) {
      return '<div class="fu-item"><div class="fu-head"><b>' + fmtTgl(p.tgl) + '</b> <span class="pill good">' + rp(p.jumlah) + '</span>' + (admin ? '<span class="fu-act"><button class="btn sm danger" data-dp="' + esc(p.id) + '">Batalkan</button></span>' : '') + '</div>' +
        (p.ket ? '<div class="fu-note">' + esc(p.ket) + '</div>' : '') + '<div class="fu-meta muted">Dicatat oleh <b>' + esc(p.oleh) + '</b> · ' + esc(p.dibuat) + '</div></div>';
    }).join('') : '<div class="empty">Belum ada pembayaran tercatat.</div>';
    var noteH = notes.length ? notes.map(function (x) {
      return '<div class="fu-item"><div class="fu-head"><b>' + fmtTgl(x.tgl) + '</b> <span class="muted">· ' + esc(JENIS_LABEL[x.jenis] || x.jenis) + '</span>' +
        (admin ? '<span class="fu-act"><button class="btn sm" data-fe="' + esc(x.id) + '">Ubah</button><button class="btn sm danger" data-fd="' + esc(x.id) + '">Hapus</button></span>' : '') + '</div>' +
        '<div class="fu-note">' + esc(x.catatan).replace(/\n/g, '<br>') + '</div><div class="fu-meta muted">Oleh <b>' + esc(x.oleh) + '</b> · ' + esc(x.dibuat) + (x.next_tgl ? ' · janji bayar ' + fmtTgl(x.next_tgl) : '') + '</div></div>';
    }).join('') : '<div class="empty">Belum ada catatan penagihan.</div>';
    var body = dl + '<h3 style="font-size:13px;margin-top:14px">Pembayaran</h3><div class="fu-list">' + payH + '</div><h3 style="font-size:13px;margin-top:14px">Catatan penagihan</h3><div class="fu-list">' + noteH + '</div>';
    var foot = (admin && r.sisa > 0 ? '<button class="btn" id="ahT" style="margin-right:auto">+ Catat penagihan</button><button class="btn primary" id="ahP">Catat pembayaran</button>' : '') + '<button class="btn" data-close>Tutup</button>';
    var ov = openModal({ title: 'Invoice ' + r.doc_no, body: body, foot: foot, wide: true });
    var t = $('#ahT', ov); if (t) t.addEventListener('click', function () { ov.close(); collectModal(r, null); });
    var p = $('#ahP', ov); if (p) p.addEventListener('click', function () { ov.close(); payModal(r); });
    $$('[data-dp]', ov).forEach(function (b) { b.addEventListener('click', function () {
      if (!window.confirm('Batalkan pencatatan pembayaran ini?\nSisa tagihan akan bertambah kembali.')) return;
      call('deletePay', { id: b.dataset.dp }).then(function () { toast('Pembayaran dibatalkan.'); ov.close(); render(); }).catch(function (e) { toast(e.message, true); });
    }); });
    $$('[data-fe]', ov).forEach(function (b) { b.addEventListener('click', function () { ov.close(); collectModal(r, S.fu.filter(function (x) { return x.id === b.dataset.fe; })[0]); }); });
    $$('[data-fd]', ov).forEach(function (b) { b.addEventListener('click', function () {
      if (!window.confirm('Hapus catatan penagihan ini?\nTindakan ini tidak dapat dibatalkan.')) return;
      call('deleteFollowUp', { id: b.dataset.fd }).then(function () { toast('Catatan dihapus.'); ov.close(); render(); }).catch(function (e) { toast(e.message, true); });
    }); });
  }

  /* ---------- catat pembayaran ---------- */
  function payModal(r) {
    var body = '<div id="mErr"></div><div class="note"><b>' + esc(r.customer) + '</b> · invoice ' + esc(r.doc_no) + '<br>Sisa tagihan <b>' + rp(r.sisa) + '</b> (jatuh tempo ' + fmtTgl(r.jatuh_tempo) + ')</div>' +
      '<div class="f2"><div class="fld"><label for="pTgl">Tanggal pembayaran</label><input type="date" id="pTgl" value="' + esc(todayStr()) + '"></div>' + rpField('pJml', 'Jumlah dibayar', r.sisa, '') + '</div><div class="hint" style="margin:-6px 0 10px"><a href="#" id="pFull">Isi sisa penuh (lunas)</a></div>' +
      '<div class="fld"><label for="pKet">Keterangan <span class="muted">(opsional: bank, no. bukti transfer)</span></label><input type="text" id="pKet" autocomplete="off"></div>' +
      '<div class="hint muted">Dicatat atas nama <b>' + esc(S.user.nama) + '</b>. Pembayaran sebagian diperbolehkan; sisa tagihan menyesuaikan.</div>';
    var ov = openModal({ title: 'Catat pembayaran', body: body, foot: '<button class="btn" data-close>Batal</button><button class="btn primary" id="pSave">Simpan pembayaran</button>' });
    wireRp(ov);
    $('#pFull', ov).addEventListener('click', function (e) { e.preventDefault(); var i = $('#pJml', ov); i.value = nf2.format(r.sisa); i.dispatchEvent(new Event('input')); });
    $('#pSave', ov).addEventListener('click', function () {
      var jml = parseRp($('#pJml', ov).value);
      if (!(jml > 0)) { $('#mErr', ov).innerHTML = '<div class="err">Jumlah pembayaran harus lebih dari 0.</div>'; return; }
      $$('.modal-foot .btn', ov).forEach(function (b) { b.disabled = true; });
      call('payAR', { ar_id: r.id, tgl: $('#pTgl', ov).value, jumlah: jml, ket: $('#pKet', ov).value }).then(function (x) {
        toast(x.sisa === 0 ? 'Invoice ' + r.doc_no + ' lunas.' : 'Pembayaran disimpan. Sisa ' + rp(x.sisa) + '.'); ov.close(); render();
      }).catch(function (e) { $('#mErr', ov).innerHTML = '<div class="err">' + esc(e.message) + '</div>'; $$('.modal-foot .btn', ov).forEach(function (b) { b.disabled = false; }); });
    });
    setTimeout(function () { $('#pJml', ov).focus(); $('#pJml', ov).select(); }, 30);
  }

  /* ---------- catatan penagihan ---------- */
  function collectModal(r, rec) {
    var isNew = !rec; rec = rec || { tgl: todayStr(), jenis: 'TELEPON', catatan: '', next_tgl: r.target_bayar || '' };
    var jenis = '<div class="seg" role="group" aria-label="Jenis kontak">' + S.meta.fuJenis.map(function (k) { return '<button type="button" data-fj="' + k + '" aria-pressed="' + (rec.jenis === k) + '">' + JENIS_LABEL[k] + '</button>'; }).join('') + '</div>';
    var body = '<div id="mErr"></div><div class="note"><b>' + esc(r.customer) + '</b> · invoice ' + esc(r.doc_no) + ' · sisa <b>' + rp(r.sisa) + '</b> · ' + (r.telat > 0 ? 'terlambat ' + fmt(r.telat) + ' hari' : 'belum jatuh tempo') + '</div>' +
      '<div class="f2"><div class="fld"><label for="cTgl">Tanggal penagihan</label><input type="date" id="cTgl" value="' + esc(rec.tgl) + '"></div>' +
      '<div class="fld"><label for="cJanji">Janji bayar <span class="muted">(opsional)</span></label><input type="date" id="cJanji" value="' + esc(rec.next_tgl || '') + '"></div></div>' +
      '<div class="fld"><label>Jenis kontak</label>' + jenis + '</div>' +
      '<div class="fld"><label for="cCat">Hasil penagihan <span class="req">*wajib</span></label><textarea id="cCat" rows="4" placeholder="Siapa yang dihubungi, respons customer, kendala (mis. menunggu proses di finance HO)…">' + esc(rec.catatan) + '</textarea></div>' +
      '<div class="hint muted">Dicatat atas nama <b>' + esc(S.user.nama) + '</b>. Janji bayar otomatis menjadi target bayar invoice ini.</div>';
    var ov = openModal({ title: isNew ? 'Catat penagihan' : 'Ubah catatan penagihan', body: body, foot: '<button class="btn" data-close>Batal</button><button class="btn primary" id="cSave">Simpan</button>' });
    var jn = rec.jenis;
    $$('[data-fj]', ov).forEach(function (b) { b.addEventListener('click', function () { jn = b.dataset.fj; $$('[data-fj]', ov).forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); }); });
    $('#cSave', ov).addEventListener('click', function () {
      var p = { id: rec.id, ar_id: r.id, tgl: $('#cTgl', ov).value, jenis: jn, catatan: $('#cCat', ov).value, target_bayar: $('#cJanji', ov).value };
      if (!p.catatan.trim()) { $('#mErr', ov).innerHTML = '<div class="err">Hasil penagihan wajib diisi.</div>'; $('#cCat', ov).focus(); return; }
      $$('.modal-foot .btn', ov).forEach(function (b) { b.disabled = true; });
      call('saveFollowUp', p).then(function () { toast('Catatan penagihan disimpan.'); ov.close(); render(); }).catch(function (e) {
        $('#mErr', ov).innerHTML = '<div class="err">' + esc(e.message) + '</div>'; $$('.modal-foot .btn', ov).forEach(function (b) { b.disabled = false; });
      });
    });
    setTimeout(function () { $('#cCat', ov).focus(); }, 30);
  }

  /* ---------- tambah / ubah invoice ---------- */
  function arModal(rec, pre) {
    var isNew = !rec; rec = rec || Object.assign({ doc_no: '', customer: '', tgl: todayStr(), jatuh_tempo: '', no_ref: '', kategori: 'SPAREPART', cabang: 'SPT', nilai: 0, target_bayar: '', keterangan: '' }, pre || {});
    var have = S.cust ? S.cust.list : [];
    var gset = {}; have.forEach(function (c) { if (c.grup) gset[c.grup] = 1; });
    var dl = '<datalist id="arCustList">' + have.slice().sort(function (a, b) { return a.nama.localeCompare(b.nama); }).map(function (c) { return '<option value="' + esc(c.nama) + '" label="' + esc(c.grup || '') + '">'; }).join('') + '</datalist>' +
      '<datalist id="arGrpList">' + Object.keys(gset).sort().map(function (g) { return '<option value="' + esc(g) + '">'; }).join('') + '</datalist>';
    var body = '<div id="mErr"></div>' + dl +
      '<div class="f2"><div class="fld"><label for="aDoc">No. invoice <span class="req">*wajib</span></label><input type="text" id="aDoc" value="' + esc(rec.doc_no) + '" autocomplete="off"></div>' +
      '<div class="fld"><label for="aRef">No. PO customer</label><input type="text" id="aRef" value="' + esc(rec.no_ref) + '" autocomplete="off"></div></div>' +
      '<div class="fld"><label for="aCust">Customer</label><input type="text" id="aCust" list="arCustList" value="' + esc(rec.customer) + '" autocomplete="off" placeholder="Pilih dari daftar atau ketik customer baru"><div class="hint" id="aInfo"></div></div>' +
      '<div class="fld" id="aGrpBox" hidden><label for="aGrp">Grup <span class="muted">(customer baru)</span></label><input type="text" id="aGrp" list="arGrpList" autocomplete="off" placeholder="mis. CARGILL, PRIVAT, RETAIL"></div>' +
      '<div class="f2"><div class="fld"><label for="aTgl">Tanggal invoice</label><input type="date" id="aTgl" value="' + esc(rec.tgl) + '"></div>' +
      '<div class="fld"><label for="aJt">Jatuh tempo <span class="muted">(kosong = +30 hari)</span></label><input type="date" id="aJt" value="' + esc(rec.jatuh_tempo) + '"></div></div>' +
      '<div class="f2"><div class="fld"><label for="aKat">Kategori</label><select id="aKat">' + S.ar.kategori.map(function (k) { return '<option value="' + k + '"' + (rec.kategori === k ? ' selected' : '') + '>' + AR_KAT_LABEL[k] + '</option>'; }).join('') + '</select></div>' +
      rpField('aNilai', 'Nilai tagihan', rec.nilai, isNew ? '' : 'Sudah dibayar ' + rp(rec.bayar || 0)) + '</div>' +
      '<div class="f2"><div class="fld"><label for="aTarget">Target bayar <span class="muted">(opsional)</span></label><input type="date" id="aTarget" value="' + esc(rec.target_bayar || '') + '"></div>' +
      '<div class="fld"><label for="aCab">Cabang</label><input type="text" id="aCab" value="' + esc(rec.cabang || 'SPT') + '" autocomplete="off"></div></div>' +
      '<div class="fld"><label for="aKet">Keterangan <span class="muted">(opsional)</span></label><textarea id="aKet" rows="2">' + esc(rec.keterangan || '') + '</textarea></div>';
    var foot = (!isNew ? '<button class="btn danger" id="aDel" style="margin-right:auto">Hapus</button>' : '') + '<button class="btn" data-close>Batal</button><button class="btn primary" id="aSave">Simpan</button>';
    var ov = openModal({ title: isNew ? 'Invoice baru' : 'Ubah invoice', body: body, foot: foot });
    wireRp(ov);
    function pick() {
      var v = arKeyJs($('#aCust', ov).value), c = have.filter(function (x) { return arKeyJs(x.nama) === v; })[0];
      $('#aInfo', ov).innerHTML = c ? 'Grup: <b>' + esc(c.grup || 'belum diatur') + '</b>' : (v ? 'Customer baru — akan ditambahkan ke daftar Customer.' : '');
      $('#aGrpBox', ov).hidden = !(v && !c);
    }
    $('#aCust', ov).addEventListener('input', pick); pick();
    var jtTouched = !!rec.jatuh_tempo;
    $('#aJt', ov).addEventListener('input', function () { jtTouched = true; });
    $('#aTgl', ov).addEventListener('change', function (e) { if (!jtTouched && e.target.value) $('#aJt', ov).value = addDaysJs(e.target.value, 30); });
    if (isNew && !rec.jatuh_tempo && rec.tgl) $('#aJt', ov).value = addDaysJs(rec.tgl, 30);
    $('#aSave', ov).addEventListener('click', function () {
      var p = { id: rec.id, doc_no: $('#aDoc', ov).value, no_ref: $('#aRef', ov).value, customer: $('#aCust', ov).value, grup: $('#aGrp', ov).value, tgl: $('#aTgl', ov).value, jatuh_tempo: $('#aJt', ov).value,
        kategori: $('#aKat', ov).value, nilai: parseRp($('#aNilai', ov).value), target_bayar: $('#aTarget', ov).value, cabang: $('#aCab', ov).value, keterangan: $('#aKet', ov).value, target_ket: rec.target_ket || '' };
      $$('.modal-foot .btn', ov).forEach(function (b) { b.disabled = true; });
      call('saveAR', p).then(function () { toast('Invoice disimpan.'); ov.close(); render(); }).catch(function (e) {
        $('#mErr', ov).innerHTML = '<div class="err">' + esc(e.message) + '</div>'; $$('.modal-foot .btn', ov).forEach(function (b) { b.disabled = false; });
      });
    });
    var del = $('#aDel', ov); if (del) del.addEventListener('click', function () {
      if (!window.confirm('Hapus invoice ' + rec.doc_no + ' beserta riwayat pembayaran dan catatan penagihannya?\nTindakan ini tidak dapat dibatalkan.')) return;
      call('deleteAR', { id: rec.id }).then(function () { toast('Invoice dihapus.'); ov.close(); render(); }).catch(function (e) { toast(e.message, true); });
    });
  }

  /* ---------- perbarui dari laporan AR (tempel dari Excel) ---------- */
  function parseNumId(s) {
    s = String(s == null ? '' : s).replace(/[^\d.,-]/g, ''); if (!s) return 0;
    var hasDot = s.indexOf('.') >= 0, hasCom = s.indexOf(',') >= 0;
    if (hasDot && hasCom) { var dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ','; s = dec === '.' ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.'); }
    else if (hasCom) s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
    else if (hasDot && /^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    var n = parseFloat(s); return isNaN(n) ? 0 : n;
  }
  function parseDateAny(s) {
    s = String(s || '').trim(); var m;
    if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) return m[1] + '-' + m[2] + '-' + m[3];
    if ((m = /^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2}|\d{4})$/.exec(s))) { var y = m[3].length === 2 ? '20' + m[3] : m[3]; return y + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2); }
    return '';
  }
  function parseARPaste(text) {
    var lines = String(text || '').replace(/\r/g, '').split('\n').filter(function (l) { return l.trim() !== ''; });
    if (lines.length < 2) throw new Error('Tempel seluruh isi laporan AR termasuk baris judul kolom (BP Name, Doc. No., Posting Date, …).');
    var norm = function (h) { return String(h).toLowerCase().replace(/[^a-z0-9]/g, ''); };
    var head = lines[0].split('\t').map(norm), ix = function (names) { for (var i = 0; i < names.length; i++) { var k = head.indexOf(names[i]); if (k >= 0) return k; } return -1; };
    var c = { name: ix(['bpname']), doc: ix(['docno']), post: ix(['postingdate']), due: ix(['duedate']), ref: ix(['bprefno']), bal: ix(['balancedue']), ar: ix(['ar']), br: ix(['branch']), ket: ix(['keterangan']), tgt: ix(['tglTargetbayar'.toLowerCase(), 'tgltargetbayar']) };
    var miss = [['BP Name', c.name], ['Doc. No.', c.doc], ['Posting Date', c.post], ['Due Date', c.due], ['Balance Due', c.bal], ['AR', c.ar]].filter(function (x) { return x[1] < 0; }).map(function (x) { return x[0]; });
    if (miss.length) throw new Error('Kolom tidak ditemukan di baris judul: ' + miss.join(', ') + '. Pastikan baris judul ikut tertempel.');
    var rows = [];
    lines.slice(1).forEach(function (l) {
      var v = l.split('\t'), g = function (i) { return i < 0 || i >= v.length ? '' : String(v[i]).trim(); };
      if (!g(c.doc) && !g(c.name)) return;
      var tg = g(c.tgt), td = parseDateAny(tg);
      rows.push({ customer: g(c.name), doc_no: g(c.doc), tgl: parseDateAny(g(c.post)), jatuh_tempo: parseDateAny(g(c.due)), no_ref: g(c.ref), balance: parseNumId(g(c.bal)), kategori: g(c.ar), cabang: g(c.br), keterangan: g(c.ket), target_bayar: td, target_ket: td ? '' : tg });
    });
    if (!rows.length) throw new Error('Tidak ada baris data yang terbaca.');
    return rows;
  }
  function arImportModal() {
    var body = '<div id="mErr"></div><div class="note"><b>Cara:</b> buka laporan AR (Excel) → blok seluruh tabel <b>termasuk baris judul</b> → salin → tempel di kotak ini. Tempel <b>semua</b> invoice yang masih terbuka: yang sudah tidak ada di laporan dianggap <b>lunas</b>, dan saldo yang berkurang dicatat sebagai pembayaran. Anda bisa memeriksa dulu sebelum disimpan.</div>' +
      '<div class="fld"><label for="iTgl">Tanggal laporan AR (per tanggal)</label><input type="date" id="iTgl" value="' + esc(todayStr()) + '"></div>' +
      '<div class="fld"><label for="iTxt">Isi laporan AR</label><textarea id="iTxt" rows="8" placeholder="BP Name&#9;Doc. No.&#9;Posting Date&#9;Due Date&#9;BP Ref. No.&#9;…" style="font-family:monospace;font-size:12px;white-space:pre"></textarea></div><div id="iPrev"></div>';
    var ov = openModal({ title: 'Perbarui dari laporan AR', body: body, foot: '<button class="btn" data-close>Batal</button><button class="btn" id="iCheck">Periksa dulu</button><button class="btn primary" id="iGo" disabled>Terapkan</button>', wide: true });
    var rows = null;
    function busy(b) { $$('.modal-foot .btn', ov).forEach(function (x) { x.disabled = b; }); if (!b) $('#iGo', ov).disabled = !rows; }
    function lst(arr, f, empty) { return arr.length ? '<ul style="margin:4px 0 0 18px;padding:0">' + arr.map(f).join('') + '</ul>' : '<div class="muted">' + empty + '</div>'; }
    $('#iTxt', ov).addEventListener('input', function () { rows = null; $('#iGo', ov).disabled = true; $('#iPrev', ov).innerHTML = ''; });
    $('#iCheck', ov).addEventListener('click', function () {
      $('#mErr', ov).innerHTML = '';
      try { rows = parseARPaste($('#iTxt', ov).value); } catch (e) { rows = null; $('#mErr', ov).innerHTML = '<div class="err">' + esc(e.message) + '</div>'; return; }
      busy(true);
      call('previewAR', { asof: $('#iTgl', ov).value, rows: rows }).then(function (r) {
        $('#iPrev', ov).innerHTML = '<div class="note"><b>Hasil pemeriksaan</b> — ' + fmt(r.n_laporan) + ' invoice di laporan, total ' + rp(r.total_laporan) + '<br>' +
          '<b>' + r.n_baru + '</b> invoice baru · <b>' + r.n_ubah + '</b> berubah · <b>' + r.n_lunas + '</b> dianggap lunas · ' + r.n_sama + ' tidak berubah' + (r.customer_baru.length ? '<br>Customer baru akan ditambahkan: ' + esc(r.customer_baru.join(', ')) : '') + '</div>' +
          (r.n_baru ? '<h3 style="font-size:13px">Invoice baru</h3>' + lst(r.baru, function (x) { return '<li>' + esc(x.doc_no) + ' · ' + esc(x.customer) + ' · ' + rp(x.nilai) + '</li>'; }, '–') : '') +
          (r.n_ubah ? '<h3 style="font-size:13px">Berubah</h3>' + lst(r.ubah, function (x) { return '<li>' + esc(x.doc_no) + ' · ' + esc(x.customer) + (x.info === 'bayar' ? ' · saldo ' + rp(x.dari) + ' → ' + rp(x.ke) + ' (dicatat sebagai pembayaran)' : x.info === 'naik' ? ' · saldo naik ' + rp(x.dari) + ' → ' + rp(x.ke) : ' · data diperbarui') + '</li>'; }, '–') : '') +
          (r.n_lunas ? '<h3 style="font-size:13px">Dianggap lunas (tidak ada di laporan)</h3>' + lst(r.lunas, function (x) { return '<li>' + esc(x.doc_no) + ' · ' + esc(x.customer) + ' · ' + rp(x.sisa) + '</li>'; }, '–') : '') +
          ((r.n_baru > 40 || r.n_ubah > 40 || r.n_lunas > 40) ? '<div class="hint muted">Daftar dipotong 40 baris pertama.</div>' : '');
        busy(false);
      }).catch(function (e) { rows = null; $('#mErr', ov).innerHTML = '<div class="err">' + esc(e.message) + '</div>'; busy(false); });
    });
    $('#iGo', ov).addEventListener('click', function () {
      if (!rows) return; busy(true);
      call('importAR', { asof: $('#iTgl', ov).value, rows: rows }).then(function (r) {
        toast('Laporan AR diterapkan: ' + r.n_baru + ' baru, ' + r.n_ubah + ' berubah, ' + r.n_lunas + ' lunas.'); ov.close(); render();
      }).catch(function (e) { $('#mErr', ov).innerHTML = '<div class="err">' + esc(e.message) + '</div>'; busy(false); });
    });
  }

  /* ============================================================
   * CRM — PROGRES FOLLOW UP
   * ============================================================ */
  var JENIS_LABEL = { TELEPON: 'Telepon', WHATSAPP: 'WhatsApp', KUNJUNGAN: 'Kunjungan', EMAIL: 'Email', LAINNYA: 'Lainnya' };
  var TAHAP_LABEL = { 'BARU DIHUBUNGI': 'Baru dihubungi', PENAWARAN: 'Penawaran', NEGOSIASI: 'Negosiasi', DEAL: 'Deal', 'TIDAK JADI': 'Tidak jadi', PENAGIHAN: 'Penagihan' };
  var TAHAP_CLS = { 'BARU DIHUBUNGI': 'none', PENAWARAN: 'warn', NEGOSIASI: 'warn', DEAL: 'good', 'TIDAK JADI': 'bad', PENAGIHAN: 'warn' };
  function tahapPill(t) { return t ? '<span class="pill ' + (TAHAP_CLS[t] || 'none') + '">' + esc(TAHAP_LABEL[t] || t) + '</span>' : '<span class="muted">Belum ada</span>'; }
  function fmtTgl(s) { return s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '–'; }

  function pCrm(token) {
    return Promise.all([call('listCustomers', { year: S.year }), call('listFollowUps'), call('listAR').catch(function () { return null; })]).then(function (r) {
      if (stale(token)) return;
      S.cust = r[0]; S.fu = r[1]; S.ar = r[2] || S.ar; drawCrm();
    });
  }
  function fuGroup(arr) {
    var m = {};
    arr.slice().sort(function (a, b) { return a.tgl < b.tgl ? 1 : a.tgl > b.tgl ? -1 : (a.dibuat < b.dibuat ? 1 : -1); }).forEach(function (f) { (m[f.customer_id] = m[f.customer_id] || []).push(f); });
    return m;
  }
  function fuByCust() { return fuGroup(S.fu.filter(function (x) { return !x.ar_id; })); } // follow up penjualan (tanpa catatan penagihan)
  function fuAllByCust() { return fuGroup(S.fu); }
  function crmRows() {
    var m = fuByCust(), f = S.fq, t = f.text.trim().toLowerCase(), today = todayStr();
    var rows = S.cust.list.map(function (c) { var h = m[c.id] || []; return { c: c, h: h, last: h[0] || null }; });
    rows = rows.filter(function (x) {
      if (f.akt === 'ADA' && !x.last) return false;
      if (f.akt === 'BELUM' && x.last) return false;
      if (f.tahap && (!x.last || x.last.tahap !== f.tahap)) return false;
      if (f.grup && x.c.grup !== f.grup) return false;
      if (t && (x.c.nama + ' ' + x.c.grup).toLowerCase().indexOf(t) < 0) return false;
      return true;
    });
    var k = f.sort, val = {
      last: function (x) { return x.last ? x.last.tgl : null; }, grup: function (x) { return x.c.grup || '~'; }, nama: function (x) { return x.c.nama; },
      tahap: function (x) { return x.last ? S.meta.fuTahap.indexOf(x.last.tahap) : null; }, next: function (x) { return x.last && x.last.next_tgl ? x.last.next_tgl : null; },
      n: function (x) { return x.h.length; }, piutang: function (x) { return x.c.piutang ? x.c.piutang.sisa : 0; }
    }[k] || function () { return null; };
    var asc = { nama: 1, grup: 1, next: 1, tahap: 1 }[k] ? f.dir === 1 : f.dir === -1;
    rows.sort(function (a, b) {
      var va = val(a), vb = val(b);
      if (va == null && vb == null) return a.c.nama.localeCompare(b.c.nama); if (va == null) return 1; if (vb == null) return -1;
      var d = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
      return (asc ? d : -d) || (a.c.grup || '~').localeCompare(b.c.grup || '~') || a.c.nama.localeCompare(b.c.nama);
    });
    return rows;
  }
  function drawCrm() {
    var admin = canEdit(), m = fuByCust(), f = S.fq;
    var withFu = S.cust.list.filter(function (c) { return m[c.id]; }).length;
    var latestTahap = {}; S.meta.fuTahap.forEach(function (t) { latestTahap[t] = 0; });
    S.cust.list.forEach(function (c) { var h = m[c.id]; if (h) latestTahap[h[0].tahap]++; });
    var kpi = function (label, val, foot) { return '<div class="card kpi"><div class="kpi-label">' + label + '</div><div class="kpi-value">' + val + '</div><div class="kpi-foot">' + foot + '</div></div>'; };
    var thisMonth = todayStr().slice(0, 7), nMonth = S.fu.filter(function (x) { return !x.ar_id && x.tgl.slice(0, 7) === thisMonth; }).length;
    var kpis = '<div class="grid g4">' + kpi('Customer sudah di-follow up', fmt(withFu), 'dari ' + fmt(S.cust.list.length) + ' customer') +
      kpi('Follow up bulan ini', fmt(nMonth), 'catatan pada ' + esc(monthName(+thisMonth.slice(5)) + ' ' + thisMonth.slice(0, 4))) +
      kpi('Sedang proses', fmt(latestTahap.PENAWARAN + latestTahap.NEGOSIASI + latestTahap['BARU DIHUBUNGI']), 'tahap terakhir: baru dihubungi, penawaran, negosiasi') +
      kpi('Deal', fmt(latestTahap.DEAL), fmt(latestTahap['TIDAK JADI']) + ' customer tidak jadi') + '</div>';
    var chips = [['ALL', 'Semua', S.cust.list.length], ['ADA', 'Sudah ada follow up', withFu], ['BELUM', 'Belum pernah', S.cust.list.length - withFu]].map(function (c) {
      return '<button class="chip" data-fa="' + c[0] + '" aria-pressed="' + (f.akt === c[0]) + '">' + c[1] + '<span class="c">' + c[2] + '</span></button>';
    }).join('');
    var tOpts = '<option value="">Semua tahap</option>' + S.meta.fuTahap.map(function (t) { return '<option value="' + t + '"' + (f.tahap === t ? ' selected' : '') + '>' + TAHAP_LABEL[t] + ' (' + latestTahap[t] + ')</option>'; }).join('');
    var G = {}, today = todayStr();
    S.cust.list.forEach(function (c) {
      var g = c.grup || '(Belum diatur)', o = G[g] || (G[g] = { g: g, n: 0, ada: 0, t: {}, last: null, due: 0 }), h = m[c.id];
      o.n++; if (h) { o.ada++; var l = h[0]; o.t[l.tahap] = (o.t[l.tahap] || 0) + 1; if (!o.last || l.tgl > o.last) o.last = l.tgl;
        if (l.next_tgl && l.next_tgl < today && l.tahap !== 'DEAL' && l.tahap !== 'TIDAK JADI') o.due++; }
    });
    var groups = Object.keys(G).map(function (k) { return G[k]; });
    function gcHtml() {
      var gs = S.gq, key = gs.sort || 'ada';
      var val = function (o) { if (key === 'g') return o.g; if (key === 'n') return o.n; if (key === 'ada') return o.ada; if (key === 'belum') return o.n - o.ada; if (key === 'last') return o.last; if (key === 'due') return o.due; return o.t[key.slice(2)] || 0; };
      var sorted = groups.slice().sort(function (a, b) { return cmpBy(val(a), val(b), gs.dir) || (b.ada - a.ada) || a.g.localeCompare(b.g); });
      var rowsH = sorted.map(function (o) {
        return '<tr><td><button class="linkbtn" data-grup="' + esc(o.g === '(Belum diatur)' ? '' : o.g) + '">' + esc(o.g) + '</button></td><td class="num">' + o.n + '</td><td class="num cur">' + (o.ada || '–') + '</td><td class="num">' + (o.n - o.ada) + '</td>' +
          S.meta.fuTahap.map(function (t) { return '<td class="num">' + (o.t[t] || '–') + '</td>'; }).join('') + '<td class="num">' + (o.due ? '<span class="pill bad">' + o.due + '</span>' : '–') + '</td><td>' + (o.last ? fmtTgl(o.last) : '–') + '</td></tr>';
      }).join('');
      var sum = function (fn) { return groups.reduce(function (a, o) { return a + fn(o); }, 0); };
      var foot = '<tr><td>Total</td><td class="num">' + sum(function (o) { return o.n; }) + '</td><td class="num">' + sum(function (o) { return o.ada; }) + '</td><td class="num">' + sum(function (o) { return o.n - o.ada; }) + '</td>' +
        S.meta.fuTahap.map(function (t) { return '<td class="num">' + sum(function (o) { return o.t[t] || 0; }) + '</td>'; }).join('') + '<td class="num">' + sum(function (o) { return o.due; }) + '</td><td></td></tr>';
      return '<table class="t dense"><thead><tr>' + sortTh(key, gs.dir, 'g', 'Grup', '') + sortTh(key, gs.dir, 'n', 'Customer', 'num') + sortTh(key, gs.dir, 'ada', 'Sudah follow up', 'num cur') + sortTh(key, gs.dir, 'belum', 'Belum', 'num') +
        S.meta.fuTahap.map(function (t) { return sortTh(key, gs.dir, 't_' + t, TAHAP_LABEL[t], 'num'); }).join('') + sortTh(key, gs.dir, 'due', 'Terlambat', 'num') + sortTh(key, gs.dir, 'last', 'Kontak terakhir', '') + '</tr></thead><tbody>' + rowsH + '</tbody><tfoot>' + foot + '</tfoot></table>';
    }
    var grupOpts = '<option value="">Semua grup</option>' + groups.filter(function (o) { return o.g !== '(Belum diatur)'; }).sort(function (a, b) { return a.g.localeCompare(b.g); }).map(function (o) { return '<option' + (f.grup === o.g ? ' selected' : '') + '>' + esc(o.g) + '</option>'; }).join('');
    $('#view').innerHTML = '<div class="page-head"><div><h2>CRM — progres follow up</h2><p>' + (admin ? 'Catat hasil follow up ke customer. Setiap catatan menyimpan nama pengisi.' : 'Pantau progres follow up sales ke customer (hanya lihat).') + '</p></div>' +
      (admin ? '<button class="btn primary" id="btnFu">+ Follow up baru</button>' : '') + '</div>' + kpis +
      '<div class="card section-gap"><div class="card-pad" style="padding-bottom:6px"><h3>Ringkasan per grup</h3><div class="sub">Tahap dihitung dari follow up terakhir tiap customer. Klik nama grup untuk menyaring daftar di bawah.</div></div><div class="tbl-wrap" id="gcTable"></div></div>' +
      '<div class="card section-gap"><div class="card-pad toolbar row" style="justify-content:space-between"><div class="chips">' + chips + '</div><div class="row"><select id="fqGrup" aria-label="Filter grup">' + grupOpts + '</select><select id="fqTahap" aria-label="Filter tahap">' + tOpts + '</select><input type="text" id="fqText" placeholder="Cari customer / grup" value="' + esc(f.text) + '"></div></div><div id="crmTable"></div></div>' +
      '<div class="note section-gap"><b>Cara membaca:</b> Tahap dan catatan yang tampil di daftar adalah follow up <b>terbaru</b> tiap customer. Klik <b>Riwayat</b> (atau nama customer) untuk melihat seluruh catatan, termasuk siapa yang mengisinya. Untuk menambah follow up ke customer tertentu, gunakan tombol di menu <b>Customer</b>.</div>';
    function drawGC() {
      var box = $('#gcTable'); box.innerHTML = gcHtml();
      $$('[data-sk]', box).forEach(function (b) { b.addEventListener('click', function () { var kk = b.dataset.sk, cur = S.gq.sort || 'ada'; if (cur === kk) S.gq.dir = -S.gq.dir; else { S.gq.sort = kk; S.gq.dir = 1; } drawGC(); }); });
      $$('[data-grup]', box).forEach(function (b) { b.addEventListener('click', function () { S.fq.grup = b.dataset.grup; S.fq.akt = 'ALL'; drawCrm(); $('#crmTable').scrollIntoView({ behavior: 'smooth', block: 'start' }); }); });
    }
    drawGC(); drawCrmTable();
    $('#fqGrup').addEventListener('change', function (e) { S.fq.grup = e.target.value; drawCrmTable(); });
    $$('[data-fa]').forEach(function (b) { b.addEventListener('click', function () { S.fq.akt = b.dataset.fa; drawCrm(); }); });
    $('#fqTahap').addEventListener('change', function (e) { S.fq.tahap = e.target.value; drawCrmTable(); });
    $('#fqText').addEventListener('input', function (e) { S.fq.text = e.target.value; drawCrmTable(); });
    var nb = $('#btnFu'); if (nb) nb.addEventListener('click', function () { followModal(null, null); });
  }
  function drawCrmTable() {
    var rows = crmRows(), admin = canEdit(), el = $('#crmTable'), f = S.fq;
    if (!rows.length) { el.innerHTML = '<div class="empty">Tidak ada customer untuk filter ini.</div>'; return; }
    var body = rows.map(function (x) {
      var l = x.last, due = l && l.next_tgl, late = due && l.next_tgl < todayStr() && l.tahap !== 'DEAL' && l.tahap !== 'TIDAK JADI';
      return '<tr><td>' + esc(x.c.grup || '–') + '</td><td><a href="#" class="lnk" data-fh="' + esc(x.c.id) + '"><b>' + esc(x.c.nama) + '</b></a></td>' +
        '<td>' + tahapPill(l && l.tahap) + '</td>' +
        '<td>' + (l ? fmtTgl(l.tgl) + '<div class="muted" style="font-size:12px">' + esc(JENIS_LABEL[l.jenis] || l.jenis) + ' · ' + esc(l.oleh) + '</div>' : '<span class="muted">–</span>') + '</td>' +
        '<td class="crm-note">' + (l ? esc(l.catatan.length > 110 ? l.catatan.slice(0, 110) + '…' : l.catatan) : '<span class="muted">–</span>') + '</td>' +
        '<td>' + (due ? '<span class="pill ' + (late ? 'bad' : 'none') + '">' + fmtTgl(l.next_tgl) + '</span>' : '<span class="muted">–</span>') + '</td>' +
        '<td class="num">' + x.h.length + '</td>' +
        '<td class="num">' + (x.c.piutang && x.c.piutang.sisa > 0 ? '<button class="linkbtn" data-ap="' + esc(x.c.id) + '">' + fmt(x.c.piutang.sisa) + '</button>' + (x.c.piutang.telat > 0 ? '<div><span class="pill ' + (x.c.piutang.maxTelat > 60 ? 'bad' : 'warn') + '">telat ' + fmt(x.c.piutang.maxTelat) + ' hr</span></div>' : '') : '–') + '</td>' +
        '<td><div class="cell-actions"><button class="btn sm" data-fh="' + esc(x.c.id) + '">Riwayat</button></div></td></tr>';
    }).join('');
    var dir = f.dir, ck = f.sort;
    el.innerHTML = '<div class="tbl-wrap"><table class="t dense"><thead><tr>' + sortTh(ck, dir, 'grup', 'Grup', '') + sortTh(ck, dir, 'nama', 'Customer', '') + sortTh(ck, dir, 'tahap', 'Tahap terakhir', '') + sortTh(ck, dir, 'last', 'Kontak terakhir', '') +
      '<th>Hasil / catatan terakhir</th>' + sortTh(ck, dir, 'next', 'Follow up berikutnya', '') + sortTh(ck, dir, 'n', 'Jumlah', 'num') + sortTh(ck, dir, 'piutang', 'Piutang (AR)', 'num') + '<th></th></tr></thead><tbody>' + body + '</tbody></table></div>';
    $$('[data-sk]', el).forEach(function (b) { b.addEventListener('click', function () {
      var kk = b.dataset.sk; if (f.sort === kk) f.dir = -f.dir; else { f.sort = kk; f.dir = 1; } drawCrmTable();
    }); });
    $$('[data-fh]', el).forEach(function (b) { b.addEventListener('click', function (e) { e.preventDefault(); historyModal(b.dataset.fh); }); });
    $$('[data-ap]', el).forEach(function (b) { b.addEventListener('click', function () { openARFor(b.dataset.ap); }); });
  }

  function historyModal(cid) {
    var c = byId(cid), h = (fuAllByCust()[cid] || []), admin = canEdit();
    var items = h.length ? h.map(function (x) {
      var inv = x.ar_id && S.ar ? S.ar.list.filter(function (r) { return r.id === x.ar_id; })[0] : null;
      return '<div class="fu-item"><div class="fu-head"><b>' + fmtTgl(x.tgl) + '</b> ' + tahapPill(x.tahap) + (x.ar_id ? ' <span class="muted">invoice ' + esc(inv ? inv.doc_no : '') + '</span>' : '') + ' <span class="muted">· ' + esc(JENIS_LABEL[x.jenis] || x.jenis) + '</span>' +
        (admin ? '<span class="fu-act"><button class="btn sm" data-fe="' + esc(x.id) + '">Ubah</button><button class="btn sm danger" data-fd="' + esc(x.id) + '">Hapus</button></span>' : '') + '</div>' +
        '<div class="fu-note">' + esc(x.catatan).replace(/\n/g, '<br>') + '</div>' +
        '<div class="fu-meta muted">Oleh <b>' + esc(x.oleh) + '</b> · ' + esc(x.dibuat) + (x.diubah_oleh ? ' · diubah ' + esc(x.diubah_oleh) + ' (' + esc(x.diubah) + ')' : '') + (x.next_tgl ? (x.ar_id ? ' · janji bayar ' : ' · follow up berikutnya ') + fmtTgl(x.next_tgl) : '') + '</div></div>';
    }).join('') : '<div class="empty">Belum ada follow up untuk customer ini.</div>';
    var foot = (admin ? '<button class="btn primary" id="fhNew" style="margin-right:auto">+ Follow up baru</button>' : '') + '<button class="btn" data-close>Tutup</button>';
    var ov = openModal({ title: c.nama + (c.grup ? ' — ' + c.grup : ''), body: '<div class="fu-list">' + items + '</div>', foot: foot, wide: true });
    var nb = $('#fhNew', ov); if (nb) nb.addEventListener('click', function () { ov.close(); followModal(null, cid); });
    $$('[data-fe]', ov).forEach(function (b) { b.addEventListener('click', function () {
      var x = S.fu.filter(function (y) { return y.id === b.dataset.fe; })[0]; ov.close();
      if (x.ar_id) (S.ar ? Promise.resolve() : loadAR()).then(function () { var r = arById(x.ar_id); if (r) collectModal(r, x); else toast('Invoice tidak ditemukan.', true); });
      else followModal(x, cid);
    }); });
    $$('[data-fd]', ov).forEach(function (b) { b.addEventListener('click', function () {
      if (!window.confirm('Hapus catatan follow up ini?\nTindakan ini tidak dapat dibatalkan.')) return;
      call('deleteFollowUp', { id: b.dataset.fd }).then(function () { toast('Catatan dihapus.'); ov.close(); render(); }).catch(function (e) { toast(e.message, true); });
    }); });
  }

  function followModal(rec, cid) {
    var isNew = !rec; cid = cid || (rec && rec.customer_id) || '';
    rec = rec || { tgl: todayStr(), jenis: 'TELEPON', tahap: 'BARU DIHUBUNGI', catatan: '', next_tgl: '' };
    var cur = cid ? byId(cid) : null;
    var dl = '<datalist id="fuCust">' + S.cust.list.slice().sort(function (a, b) { return a.nama.localeCompare(b.nama); }).map(function (c) { return '<option value="' + esc(c.nama) + '" label="' + esc(c.grup || '') + '">'; }).join('') + '</datalist>';
    var jenis = '<div class="seg" role="group" aria-label="Jenis kontak">' + S.meta.fuJenis.map(function (k) { return '<button type="button" data-fj="' + k + '" aria-pressed="' + (rec.jenis === k) + '">' + JENIS_LABEL[k] + '</button>'; }).join('') + '</div>';
    var body = '<div id="mErr"></div>' + dl +
      '<div class="fld"><label for="fCust">Customer</label><input type="text" id="fCust" list="fuCust" value="' + esc(cur ? cur.nama : '') + '" placeholder="Pilih customer dari daftar" autocomplete="off"' + (cur && !isNew ? ' disabled' : '') + '><div class="hint" id="fInfo"></div></div>' +
      '<div class="f2"><div class="fld"><label for="fTgl">Tanggal follow up</label><input type="date" id="fTgl" value="' + esc(rec.tgl) + '"></div>' +
      '<div class="fld"><label for="fTahap">Tahap</label><select id="fTahap">' + S.meta.fuTahap.map(function (t) { return '<option value="' + t + '"' + (rec.tahap === t ? ' selected' : '') + '>' + TAHAP_LABEL[t] + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="fld"><label>Jenis kontak</label>' + jenis + '</div>' +
      '<div class="fld"><label for="fCat">Hasil / catatan <span class="req">*wajib</span></label><textarea id="fCat" rows="4" placeholder="Apa yang dibahas, respons customer, kebutuhan, kendala…">' + esc(rec.catatan) + '</textarea></div>' +
      '<div class="fld"><label for="fNext">Follow up berikutnya <span class="muted">(opsional)</span></label><input type="date" id="fNext" value="' + esc(rec.next_tgl) + '"></div>' +
      '<div class="hint muted">Dicatat atas nama <b>' + esc(S.user.nama) + '</b>.</div>';
    var foot = '<button class="btn" data-close>Batal</button><button class="btn primary" id="fSave">Simpan</button>';
    var ov = openModal({ title: isNew ? 'Follow up baru' : 'Ubah follow up', body: body, foot: foot });
    var jn = rec.jenis;
    $$('[data-fj]', ov).forEach(function (b) { b.addEventListener('click', function () { jn = b.dataset.fj; $$('[data-fj]', ov).forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); }); });
    function pickCust() {
      var v = $('#fCust', ov).value.trim().toUpperCase().replace(/\s+/g, ' ');
      var c = S.cust.list.filter(function (x) { return x.nama.toUpperCase().replace(/\s+/g, ' ') === v; })[0];
      $('#fInfo', ov).innerHTML = c ? 'Grup: <b>' + esc(c.grup || 'belum diatur') + '</b> · ' + esc(AKT_LABEL[c.aktivitas] || c.aktivitas) : (v ? 'Pilih nama customer yang ada di daftar.' : '');
      return c;
    }
    $('#fCust', ov).addEventListener('input', pickCust); pickCust();
    $('#fSave', ov).addEventListener('click', function () {
      var c = pickCust(); if (!c) { $('#mErr', ov).innerHTML = '<div class="err">Pilih customer dari daftar yang tersedia.</div>'; return; }
      var p = { id: rec.id, customer_id: c.id, tgl: $('#fTgl', ov).value, jenis: jn, tahap: $('#fTahap', ov).value, catatan: $('#fCat', ov).value, next_tgl: $('#fNext', ov).value };
      if (!p.catatan.trim()) { $('#mErr', ov).innerHTML = '<div class="err">Hasil / catatan follow up wajib diisi.</div>'; $('#fCat', ov).focus(); return; }
      $$('.modal-foot .btn', ov).forEach(function (b) { b.disabled = true; });
      call('saveFollowUp', p).then(function () { toast('Follow up disimpan.'); ov.close(); render(); }).catch(function (e) {
        $('#mErr', ov).innerHTML = '<div class="err">' + esc(e.message) + '</div>'; $$('.modal-foot .btn', ov).forEach(function (b) { b.disabled = false; });
      });
    });
    setTimeout(function () { $((cur ? '#fCat' : '#fCust'), ov).focus(); }, 30);
  }

  /* ============================================================
   * LAPORAN BULANAN
   * ============================================================ */
  function pLaporan(token) {
    return call('report', { year: S.year, month: S.repMonth }).then(function (r) {
      if (stale(token)) return;
      var T = r.total, mn = monthName(r.month).toUpperCase();
      var monthOpts = S.meta.months.map(function (m, i) { return '<option value="' + (i + 1) + '"' + (i + 1 === S.repMonth ? ' selected' : '') + '>' + cap(m) + '</option>'; }).join('');
      var body = r.rows.length ? r.rows.map(function (x) {
        return '<tr><td>' + esc(x.customer) + '</td><td class="num">' + fmt(x.n) + '</td><td class="num">' + fmt(x.qp) + '</td><td class="num">' + fmt(x.qs) + '</td><td class="num">' + fmt(x.pop) + '</td><td class="num">' + fmt(x.pos) + '</td>' +
          '<td class="num">' + fmt(x.sp) + '</td><td class="num">' + fmt(x.ss) + '</td><td class="num">' + fmt(x.carry) + '</td><td class="num">' + fmt(x.batal) + '</td><td class="num">' + fmt(x.open) + '</td><td class="num"><b>' + fmt(x.total) + '</b></td></tr>';
      }).join('') : '<tr><td colspan="12" class="empty">Belum ada data untuk bulan ini.</td></tr>';
      $('#view').innerHTML = '<div class="page-head"><div><h2>Quotation &amp; realisasi penjualan ' + esc(mn) + ' ' + r.year + '</h2><p>Rekap per customer: quotation dibuat bulan ini, PO-nya, dan penjualan yang terealisasi bulan ini.</p></div>' +
        '<div class="row no-print"><select id="repMonth" aria-label="Bulan" style="width:auto">' + monthOpts + '</select><button class="btn" id="btnCsv">Unduh CSV</button><button class="btn" id="btnPrint">Cetak / PDF</button></div></div>' +
        '<div class="grid g4" style="grid-template-columns:repeat(3,minmax(0,1fr))"><div class="card kpi"><div class="kpi-label">Target ' + esc(monthName(r.month)) + '</div><div class="kpi-value">' + (r.target ? compact(r.target) : '–') + '</div></div>' +
        '<div class="card kpi"><div class="kpi-label">Total penjualan</div><div class="kpi-value">' + compact(T.total) + '</div></div>' +
        '<div class="card kpi"><div class="kpi-label">Pencapaian (ACH)</div><div class="kpi-value">' + pct(r.ach) + '</div><div class="bar ' + achClass(r.ach) + '"><i style="width:' + Math.min(100, (r.ach || 0) * 100) + '%"></i></div></div></div>' +
        '<div class="card section-gap"><div class="tbl-wrap"><table class="t sticky-first"><thead><tr><th rowspan="2">Customer</th><th rowspan="2" class="num">Jml quot.</th><th class="group" colspan="2">Quotation</th><th class="group" colspan="2">PO</th><th class="group" colspan="2">Penjualan</th><th rowspan="2" class="num">Carry over</th><th rowspan="2" class="num">Batal</th><th rowspan="2" class="num">Masih open</th><th rowspan="2" class="num">Total penjualan</th></tr>' +
        '<tr><th class="num">Parts ext.</th><th class="num">Service</th><th class="num">Ext. parts</th><th class="num">Service</th><th class="num">Parts</th><th class="num">Service</th></tr></thead><tbody>' + body +
        '</tbody><tfoot><tr><td>TOTAL</td><td class="num">' + fmt(T.n) + '</td><td class="num">' + fmt(T.qp) + '</td><td class="num">' + fmt(T.qs) + '</td><td class="num">' + fmt(T.pop) + '</td><td class="num">' + fmt(T.pos) + '</td><td class="num">' + fmt(T.sp) + '</td><td class="num">' + fmt(T.ss) + '</td><td class="num">' + fmt(T.carry) + '</td><td class="num">' + fmt(T.batal) + '</td><td class="num">' + fmt(T.open) + '</td><td class="num">' + fmt(T.total) + '</td></tr></tfoot></table></div></div>';
      $('#repMonth').addEventListener('change', function (e) { S.repMonth = +e.target.value; render(); });
      $('#btnPrint').addEventListener('click', function () { window.print(); });
      $('#btnCsv').addEventListener('click', function () { downloadCsv(r); });
    });
  }

  function downloadCsv(r) {
    var head = ['Customer', 'Jml Quotation', 'Quotation Parts', 'Quotation Service', 'PO Parts', 'PO Service', 'Penjualan Parts', 'Penjualan Service', 'Carry Over', 'Batal', 'Masih Open', 'Total Penjualan'];
    var q = function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; };
    var lines = [head.map(q).join(',')];
    r.rows.concat([Object.assign({ customer: 'TOTAL' }, r.total)]).forEach(function (x) {
      lines.push([x.customer, x.n, x.qp, x.qs, x.pop, x.pos, x.sp, x.ss, x.carry, x.batal, x.open, x.total].map(q).join(','));
    });
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'laporan-' + r.year + '-' + String(r.month).padStart(2, '0') + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* ============================================================
   * DATA AWAL (ringkasan bulanan)
   * ============================================================ */
  function pDataAwal(token) {
    return call('listRingkasan', { year: S.year }).then(function (list) {
      if (stale(token)) return;
      var by = {}; list.forEach(function (r) { by[r.bulan] = r; });
      var rows = S.meta.months.map(function (m, i) {
        var r = by[i + 1];
        return '<tr><td>' + cap(m) + '</td>' + (r ?
          '<td class="num">' + fmt(r.qp_n + r.qs_n) + '</td><td class="num">' + fmt(r.qp_val + r.qs_val) + '</td><td class="num">' + fmt(r.qp_dn + r.qs_dn) + '</td><td class="num">' + fmt(r.qp_po + r.qs_po) + '</td><td class="num">' + fmt(r.s_parts) + '</td><td class="num">' + fmt(r.s_bundling) + '</td><td class="num">' + fmt(r.s_pts + r.s_labour) + '</td>' :
          '<td colspan="7" class="muted">Belum ada ringkasan</td>') +
          '<td class="cell-actions"><button class="btn sm" data-rk="' + (i + 1) + '">' + (r ? 'Ubah' : 'Isi') + '</button></td></tr>';
      }).join('');
      $('#view').innerHTML = '<div class="page-head"><div><h2>Data awal ' + S.year + '</h2><p>Rekap bulanan tanpa rincian customer — untuk bulan yang sudah berjalan sebelum aplikasi dipakai.</p></div></div>' +
        '<div class="note">Angka di sini <b>ditambahkan</b> ke quotation per-customer pada bulan yang sama. Jika sebuah bulan sudah diinput lengkap per customer, hapus ringkasannya agar tidak terhitung dua kali.</div>' +
        '<div class="card section-gap"><div class="tbl-wrap"><table class="t"><thead><tr><th>Bulan</th><th class="num">Jml quot.</th><th class="num">Nilai quot.</th><th class="num">Jml deal</th><th class="num">PO</th><th class="num">Penjualan parts</th><th class="num">Penjualan bundling</th><th class="num">Penjualan PTS+labour</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
      $$('[data-rk]').forEach(function (b) { b.addEventListener('click', function () { ringkasanModal(+b.dataset.rk, by[+b.dataset.rk]); }); });
    });
  }

  function ringkasanModal(bulan, rec) {
    rec = rec || {};
    var f = function (id, label, key) { return rpField(id, label, rec[key] || 0, ''); };
    var cnt = function (id, label, key) { return '<div class="fld"><label for="' + id + '">' + label + '</label><input type="text" inputmode="numeric" id="' + id + '" value="' + (rec[key] || 0) + '"></div>'; };
    var body = '<div id="mErr"></div><h3 style="font-size:13px">External parts</h3><div class="f2">' + cnt('r_qp_n', 'Jumlah quotation', 'qp_n') + f('r_qp_val', 'Nilai quotation', 'qp_val') + cnt('r_qp_dn', 'Jumlah deal', 'qp_dn') + f('r_qp_po', 'Nilai PO (closed)', 'qp_po') + '</div>' +
      '<h3 style="font-size:13px">Service</h3><div class="f2">' + cnt('r_qs_n', 'Jumlah quotation', 'qs_n') + f('r_qs_val', 'Nilai quotation', 'qs_val') + cnt('r_qs_dn', 'Jumlah deal', 'qs_dn') + f('r_qs_po', 'Nilai PO (closed)', 'qs_po') + '</div>' +
      '<h3 style="font-size:13px">Penjualan (revenue)</h3><div class="f2">' + f('r_s_parts', 'Parts', 's_parts') + f('r_s_bundling', 'Bundling', 's_bundling') + f('r_s_pts', 'PTS', 's_pts') + f('r_s_labour', 'Labour', 's_labour') + '</div>' +
      '<div class="fld"><label for="r_ket">Keterangan</label><input type="text" id="r_ket" value="' + esc(rec.ket || '') + '"></div>';
    var foot = (rec.id ? '<button class="btn danger" id="rDel" style="margin-right:auto">Hapus ringkasan</button>' : '') + '<button class="btn" data-close>Batal</button><button class="btn primary" id="rSave">Simpan</button>';
    var ov = openModal({ title: 'Data awal — ' + monthName(bulan) + ' ' + S.year, body: body, foot: foot, wide: true });
    wireRp(ov);
    $('#rSave', ov).addEventListener('click', function () {
      var p = { tahun: S.year, bulan: bulan, ket: $('#r_ket', ov).value };
      ['qp_n', 'qp_dn', 'qs_n', 'qs_dn'].forEach(function (k) { p[k] = parseRp($('#r_' + k, ov).value); });
      ['qp_val', 'qp_po', 'qs_val', 'qs_po', 's_parts', 's_bundling', 's_pts', 's_labour'].forEach(function (k) { p[k] = parseRp($('#r_' + k, ov).value); });
      call('saveRingkasan', p).then(function () { toast('Ringkasan disimpan.'); ov.close(); render(); }).catch(function (e) { $('#mErr', ov).innerHTML = '<div class="err">' + esc(e.message) + '</div>'; });
    });
    var del = $('#rDel', ov);
    if (del) del.addEventListener('click', function () {
      if (!window.confirm('Hapus ringkasan ' + monthName(bulan) + ' ' + S.year + '?')) return;
      call('deleteRingkasan', { id: rec.id }).then(function () { toast('Ringkasan dihapus.'); ov.close(); render(); }).catch(function (e) { toast(e.message, true); });
    });
  }

  /* ============================================================
   * PENGATURAN (target & pengguna)
   * ============================================================ */
  /* ============================================================
   * BACKUP DATA (admin)
   * ============================================================ */
  var BK_LABEL = { Quotation: 'Quotation', Ringkasan: 'Ringkasan bulanan', Target: 'Target', Customer: 'Customer', FollowUp: 'Follow up & penagihan', AR: 'AR Invoice', ARBayar: 'Pembayaran AR', GrupPIC: 'PIC grup', Log: 'Log aktivitas' };
  function downloadJson(obj, name) {
    var blob = new Blob([JSON.stringify(obj)], { type: 'application/json' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 3000);
  }
  function pBackup(token) {
    return call('backupInfo', {}).then(function (inf) {
      if (stale(token)) return;
      var total = 0, rows = Object.keys(inf.jumlah).map(function (k) { total += inf.jumlah[k]; return '<tr><td>' + esc(BK_LABEL[k] || k) + '</td><td class="num">' + fmt(inf.jumlah[k]) + '</td></tr>'; }).join('');
      $('#view').innerHTML = '<div class="page-head"><div><h2>Backup &amp; Impor Data</h2><p>Cadangkan seluruh data dalam satu file .json, atau masukkan data dari file backup (mis. dari versi Google Sheets).</p></div></div>' +
        '<div class="grid g2">' +
        '<div class="card card-pad"><h3>Unduh backup ke komputer</h3><div class="sub">File .json berisi semua tabel di bawah ini. Simpan di tempat yang aman.</div>' +
        '<div class="tbl-wrap" style="margin-top:10px"><table class="t dense"><thead><tr><th>Data</th><th class="num">Jumlah baris</th></tr></thead><tbody>' + rows + '</tbody><tfoot><tr><td>Total</td><td class="num">' + fmt(total) + '</td></tr></tfoot></table></div>' +
        '<label class="chk" style="display:block;margin:12px 0"><input type="checkbox" id="bkLog"> Sertakan log aktivitas <span class="muted">(ukuran file lebih besar)</span></label>' +
        '<div id="bkErr"></div><button class="btn primary" id="bkDl">Unduh backup (.json)</button></div>' +
        '<div class="card card-pad"><h3>Impor data dari file backup</h3><div class="sub">Pilih file backup (.json) dari menu Backup versi Google Sheets, atau dari backup yang diunduh di sini.</div>' +
        '<div class="fld" style="margin-top:10px"><input type="file" id="imFile" accept=".json,application/json" aria-label="File backup"></div>' +
        '<div id="imBox"></div></div></div>' +
        '<div class="card card-pad section-gap"><h3>Yang perlu diketahui</h3><ul class="notes">' +
        '<li>Data tersimpan di database Supabase Anda. Unduh backup secara berkala (mis. tiap minggu) sebagai cadangan di luar Supabase.</li>' +
        '<li>Foto bukti <b>tidak ikut di dalam file</b>; yang tersimpan hanya path/link-nya. Foto lama dari Google Drive tetap bisa dibuka lewat link-nya selama Anda punya akses; foto baru tersimpan di Supabase Storage.</li>' +
        '<li>Data akun (email, password, peran) tidak ikut dibackup; kelola di dashboard Supabase.</li>' +
        '<li>Backup berisi data bisnis. Perlakukan file ini sebagai dokumen rahasia.</li></ul></div>';
      var errBox = function (m) { $('#bkErr').innerHTML = m ? '<div class="err">' + esc(m) + '</div>' : ''; };
      $('#bkDl').addEventListener('click', function () {
        var btn = this; btn.disabled = true; btn.textContent = 'Menyiapkan…'; errBox('');
        call('backupExport', { logAktivitas: $('#bkLog').checked }).then(function (b) {
          var n = new Date(), z = function (x) { return String(x).padStart(2, '0'); };
          downloadJson(b, 'backup-ipe-' + n.getFullYear() + z(n.getMonth() + 1) + z(n.getDate()) + '-' + z(n.getHours()) + z(n.getMinutes()) + '.json');
          toast('Backup diunduh (' + fmt(Object.keys(b.meta.jumlah).reduce(function (a, k) { return a + b.meta.jumlah[k]; }, 0)) + ' baris).');
        }).catch(function (e) { errBox(e.message); }).then(function () { btn.disabled = false; btn.textContent = 'Unduh backup (.json)'; });
      });
      $('#imFile').addEventListener('change', function () {
        var f = this.files && this.files[0], box = $('#imBox'); box.innerHTML = '';
        if (!f) return;
        if (f.size > 60 * 1024 * 1024) { box.innerHTML = '<div class="err">File terlalu besar (maksimal 60 MB).</div>'; return; }
        var fr = new FileReader();
        fr.onerror = function () { box.innerHTML = '<div class="err">File tidak dapat dibaca.</div>'; };
        fr.onload = function () {
          var obj; try { obj = JSON.parse(String(fr.result)); } catch (e) { box.innerHTML = '<div class="err">Berkas bukan JSON yang valid.</div>'; return; }
          box.innerHTML = '<div class="muted">Memeriksa file…</div>';
          Cloud.previewBackup(obj).then(function (pv) {
            var m = obj.meta || {}, trs = pv.map(function (x) { return '<tr><td>' + esc(BK_LABEL[x.tabel] || x.tabel) + '</td><td class="num">' + fmt(x.file) + '</td><td class="num">' + fmt(x.ada) + '</td><td class="num">' + fmt(x.baru) + '</td><td class="num">' + fmt(x.timpa) + '</td></tr>'; }).join('');
            box.innerHTML = '<div class="note">File dibuat ' + esc(m.dibuat || '–') + (m.dibuat_oleh ? ' oleh ' + esc(m.dibuat_oleh) : '') + '.</div>' +
              '<div class="tbl-wrap"><table class="t dense"><thead><tr><th>Data</th><th class="num">Di file</th><th class="num">Di database</th><th class="num">Baru</th><th class="num">Menimpa</th></tr></thead><tbody>' + trs + '</tbody></table></div>' +
              '<div class="fld" style="margin-top:12px"><label class="chk" style="display:block"><input type="radio" name="imMode" value="gabung" checked> <b>Gabung</b> — tambahkan baris baru, timpa baris ber-ID sama, data lain dibiarkan.</label>' +
              '<label class="chk" style="display:block;margin-top:6px"><input type="radio" name="imMode" value="ganti"> <b>Ganti</b> — database dibuat sama persis dengan file (baris yang tidak ada di file dihapus).</label></div>' +
              '<div id="imErr"></div><button class="btn primary" id="imGo">Impor sekarang</button>';
            $('#imGo').addEventListener('click', function () {
              var mode = ($('input[name="imMode"]:checked') || {}).value || 'gabung', btn = this;
              if (mode === 'ganti' && !window.confirm('Mode GANTI akan menghapus baris di database yang tidak ada di file. Lanjutkan?')) return;
              btn.disabled = true; btn.textContent = 'Mengimpor…'; $('#imErr').innerHTML = '';
              Cloud.importBackup(obj, mode).then(function (sum) {
                S.quotes = []; S.cust = null; S.fu = null; S.ar = null;
                toast('Impor selesai (' + fmt(sum.reduce(function (a, s) { return a + s.jumlah; }, 0)) + ' baris).'); render();
              }).catch(function (e) { $('#imErr').innerHTML = '<div class="err">' + esc(e.message) + '</div>'; btn.disabled = false; btn.textContent = 'Impor sekarang'; });
            });
          }).catch(function (e) { box.innerHTML = '<div class="err">' + esc(e.message) + '</div>'; });
        };
        fr.readAsText(f);
      });
    });
  }

  function pPengaturan(token) {
    return call('getTargets', { year: S.year }).then(function (targets) {
      if (stale(token)) return;
      var K = [['parts', 'Parts'], ['bundling', 'Bundling'], ['pts', 'PTS'], ['labour', 'Labour']];
      function cell(id, v) { return '<div class="rp"><span>Rp</span><input type="text" inputmode="decimal" data-rp id="' + id + '" value="' + (v ? esc(nf2.format(v)) : '') + '" autocomplete="off" aria-label="' + esc(id) + '"></div>'; }
      var rows = targets.map(function (t) {
        return '<tr><td>' + monthName(t.bulan) + '</td>' + K.map(function (k) { return '<td>' + cell('tg_' + t.bulan + '_' + k[0], t[k[0]]) + '</td>'; }).join('') + '<td class="num"><b id="tgT' + t.bulan + '"></b></td></tr>';
      }).join('');
      var fill = '<tr class="fillrow"><td><b>Isi semua bulan</b></td>' + K.map(function (k) { return '<td>' + cell('fill_' + k[0], 0) + '</td>'; }).join('') + '<td><button class="btn sm" id="tgFill" type="button">Terapkan</button></td></tr>';
      $('#view').innerHTML = '<div class="page-head"><div><h2>' + (isAdmin() ? 'Pengaturan' : 'Target') + '</h2><p>Target penjualan per kategori dan per bulan.</p></div></div>' +
        '<div class="card"><div class="card-pad" style="padding-bottom:6px"><h3>Target revenue parts &amp; service ' + S.year + '</h3><div class="sub">Dipakai untuk menghitung % tercapai per kategori dan total di Dashboard. Total target = jumlah semua kategori.</div></div>' +
        '<div class="tbl-wrap"><table class="t tg-table"><thead><tr><th>Bulan</th>' + K.map(function (k) { return '<th>' + k[1] + '</th>'; }).join('') + '<th class="num">Total</th></tr></thead><tbody>' + fill + rows + '</tbody>' +
        '<tfoot><tr><td>Total ' + S.year + '</td>' + K.map(function (k) { return '<td class="num" id="tgS_' + k[0] + '"></td>'; }).join('') + '<td class="num" id="tgS_all"></td></tr></tfoot></table></div>' +
        '<div class="card-pad row" style="justify-content:flex-end"><button class="btn primary" id="tgSave">Simpan target</button></div></div>' +
        '<div class="note section-gap"><b>Catatan:</b> data awal 2026 diambil dari file Reforecasting Budget 2026 Cabang Sampit (Jan–Jun Budget Awal, Jul–Des Budget Proyeksi). Parts = Parts External, Bundling = Parts Bundling, PTS = Parts Through Service. Unit mesin tidak termasuk. Kategori Lain-lain sudah tidak dipakai.</div>' +
        '<div class="note section-gap"><b>Akses:</b> semua pengguna wajib masuk dengan email dan password. <b>Admin</b> dapat input dan mengubah data; <b>Viewer</b> hanya melihat. Akun dan peran dikelola di dashboard Supabase (Authentication &rarr; Users, dan tabel <b>profiles</b>).</div>';
      wireRp($('#view'));
      function val(id) { return parseRp($('#' + id).value); }
      function sum() {
        var all = 0;
        K.forEach(function (k) { var c = 0; for (var m = 1; m <= 12; m++) c += val('tg_' + m + '_' + k[0]); $('#tgS_' + k[0]).textContent = fmt(c); all += c; });
        for (var m = 1; m <= 12; m++) { var t = 0; K.forEach(function (k) { t += val('tg_' + m + '_' + k[0]); }); $('#tgT' + m).textContent = fmt(t); }
        $('#tgS_all').innerHTML = '<b>' + fmt(all) + '</b>';
      }
      $$('.tg-table input').forEach(function (i) { i.addEventListener('input', sum); i.addEventListener('blur', sum); }); sum();
      $('#tgFill').addEventListener('click', function () {
        var any = false;
        K.forEach(function (k) { var v = val('fill_' + k[0]); if (v) { any = true; for (var m = 1; m <= 12; m++) $('#tg_' + m + '_' + k[0]).value = nf2.format(v); } });
        if (!any) return toast('Isi minimal satu kolom pada baris "Isi semua bulan".', true);
        sum();
      });
      $('#tgSave').addEventListener('click', function () {
        var arr = [];
        for (var m = 1; m <= 12; m++) { var o = { bulan: m }; K.forEach(function (k) { o[k[0]] = val('tg_' + m + '_' + k[0]); }); arr.push(o); }
        call('saveTargets', { year: S.year, targets: arr }).then(function () { toast('Target ' + S.year + ' disimpan.'); }).catch(function (e) { toast(e.message, true); });
      });
    });
  }

  /* ============================================================
   * PENGGUNA & PERAN (khusus Admin)
   * ============================================================ */
  var ROLE_INFO = [
    ['ADMIN', 'Admin', 'Akses penuh, termasuk mengatur peran, backup, dan impor data.'],
    ['BRANCH_MANAGER', 'Branch Manager', 'Melihat seluruh operasional; mengubah target dan PIC.'],
    ['SALES', 'Sales', 'Mengubah semua data operasional (quotation, customer, follow up, AR, data awal), kecuali target, PIC, dan pengaturan.'],
    ['VIEWER', 'Viewer', 'Hanya melihat.'],
    ['MENUNGGU', 'Menunggu (nonaktif)', 'Belum bisa melihat data apa pun. Dipakai untuk akun baru atau untuk mencabut akses.']
  ];
  function pPengguna(token) {
    return Cloud.listUsers().then(function (users) {
      if (stale(token)) return;
      var me = Cloud.me() || {}, opts = function (cur) { return ROLE_INFO.map(function (r) { return '<option value="' + r[0] + '"' + (r[0] === cur ? ' selected' : '') + '>' + r[1] + '</option>'; }).join(''); };
      var rows = users.map(function (u) {
        var self = u.id === me.id;
        return '<tr data-uid="' + esc(u.id) + '"><td>' + esc(u.email) + (self ? ' <span class="muted">(Anda)</span>' : '') + '</td>' +
          '<td><input type="text" class="u-nama" maxlength="60" value="' + esc(u.nama) + '" aria-label="Nama ' + esc(u.email) + '"></td>' +
          '<td><select class="u-role" aria-label="Peran ' + esc(u.email) + '">' + opts(u.role) + '</select></td>' +
          '<td class="cell-actions"><button class="btn sm u-save" disabled>Simpan</button></td></tr>';
      }).join('');
      $('#view').innerHTML = '<div class="page-head"><div><h2>Pengguna &amp; peran</h2><p>Atur siapa boleh melakukan apa. Perubahan berlaku setelah pengguna tersebut masuk kembali.</p></div></div>' +
        '<div class="card"><div class="tbl-wrap"><table class="t"><thead><tr><th>Email</th><th>Nama tampil</th><th>Peran</th><th></th></tr></thead><tbody>' + (rows || '<tr><td colspan="4" class="muted">Belum ada pengguna.</td></tr>') + '</tbody></table></div></div>' +
        '<div class="grid g2 section-gap"><div class="card card-pad"><h3>Arti tiap peran</h3><ul class="notes">' + ROLE_INFO.map(function (r) { return '<li><b>' + r[1] + '</b> — ' + esc(r[2]) + '</li>'; }).join('') + '</ul></div>' +
        '<div class="card card-pad"><h3>Menambah pengguna baru</h3><ol class="notes"><li>Buat akun di dashboard Supabase: <b>Authentication → Users → Add user</b> (centang <i>Auto Confirm User</i>).</li>' +
        '<li>Muat ulang halaman ini; akun baru muncul dengan peran <b>Menunggu</b>.</li><li>Pilih peran dan nama tampilnya, lalu klik <b>Simpan</b>.</li></ol>' +
        '<p class="muted" style="margin-top:8px">Akun tidak bisa dibuat dari website ini karena membutuhkan kunci rahasia Supabase yang tidak boleh ada di website.</p></div></div>';
      $$('#view tbody tr[data-uid]').forEach(function (tr) {
        var nm = $('.u-nama', tr), rl = $('.u-role', tr), bt = $('.u-save', tr), o = { nama: nm.value, role: rl.value };
        function dirty() { bt.disabled = nm.value === o.nama && rl.value === o.role; }
        nm.addEventListener('input', dirty); rl.addEventListener('change', dirty);
        bt.addEventListener('click', function () {
          var self = tr.dataset.uid === me.id;
          if (self && rl.value !== 'ADMIN' && !window.confirm('Anda akan menurunkan peran Anda sendiri dan tidak bisa lagi membuka menu ini. Lanjutkan?')) return;
          bt.disabled = true;
          Cloud.updateUser(tr.dataset.uid, rl.value, nm.value).then(function () {
            o = { nama: nm.value.trim(), role: rl.value }; nm.value = o.nama; toast('Peran ' + (nm.value) + ' disimpan.');
            if (self) { S.user.role = rl.value; S.user.nama = o.nama; updateChrome(); S.setTab = 'target'; if (!canPlan()) S.page = 'dashboard'; buildTabs(); render(); }
          }).catch(function (e) { toast(e.message, true); dirty(); });
        });
      });
    });
  }

  /* ---------- Pengaturan: Target (Admin & Branch Manager) | Pengguna | Backup & Impor (khusus Admin) ---------- */
  function pSettings(token) {
    var tabs = [['target', 'Target']];
    if (isAdmin()) tabs.push(['pengguna', 'Pengguna & peran'], ['sinkron', 'Sinkron customer'], ['backup', 'Backup & Impor']);
    var cur = tabs.some(function (t) { return t[0] === S.setTab; }) ? S.setTab : 'target';
    var fn = { target: pPengaturan, pengguna: pPengguna, sinkron: pSyncCust, backup: pBackup }[cur];
    return fn(token).then(function () {
      if (stale(token) || tabs.length < 2) return;
      var bar = '<div class="chips set-tabs" role="tablist" style="margin-bottom:14px">' + tabs.map(function (t) {
        return '<button class="chip" role="tab" data-set="' + t[0] + '" aria-pressed="' + (t[0] === cur) + '">' + t[1] + '</button>';
      }).join('') + '</div>';
      $('#view').insertAdjacentHTML('afterbegin', bar);
      $$('[data-set]', $('#view')).forEach(function (b) { b.addEventListener('click', function () { if (b.dataset.set === cur) return; S.setTab = b.dataset.set; render(); }); });
    });
  }

  /* ---------- Sinkron customer dari file CSV (Nama;Grup) ---------- */
  function pSyncCust(token) {
    $('#view').innerHTML = '<div class="page-head"><div><h2>Sinkron customer dari CSV</h2><p>Samakan daftar customer dan grupnya dengan file CSV berkolom <b>Nama;Grup</b>. Anda melihat pratinjau dulu sebelum ada yang diubah.</p></div></div>' +
      '<div class="card card-pad"><div class="fld"><label for="syFile">File CSV</label><input type="file" id="syFile" accept=".csv,text/csv,text/plain"></div><div id="syBox"></div></div>' +
      '<div class="card card-pad section-gap"><h3>Aturan sinkron</h3><ul class="notes">' +
      '<li><b>Cocok</b> dengan customer yang ada (nama sama, atau hanya beda spasi, tanda baca, atau "PT"/"CV"): grup diperbarui dan nama diseragamkan mengikuti CSV. Nama di Quotation, Follow Up, dan AR ikut diseragamkan supaya riwayat tetap terhubung.</li>' +
      '<li><b>Belum ada</b> di database: ditambahkan sebagai customer baru (aktivitas Prospect, mesin 0).</li>' +
      '<li><b>Tidak ada di CSV</b>: dibiarkan apa adanya (tidak dihapus, tidak diubah).</li>' +
      '<li>PIC grup: bila grup baru belum punya PIC dan customer-nya dulu berasal dari grup yang punya PIC, PIC disalin ke grup baru.</li>' +
      '<li>Invoice per tahun, jumlah mesin, dan catatan customer tidak berubah.</li></ul></div>';
    var box = $('#syBox');
    function list(title, arr, fmtRow, max) {
      if (!arr.length) return '';
      max = max || 300;
      return '<details style="margin-top:8px"><summary><b>' + title + ' (' + fmt(arr.length) + ')</b></summary><div class="tbl-wrap"><table class="t dense"><tbody>' + arr.slice(0, max).map(fmtRow).join('') + '</tbody></table></div>' + (arr.length > max ? '<div class="muted">…dan ' + (arr.length - max) + ' lainnya</div>' : '') + '</details>';
    }
    $('#syFile').addEventListener('change', function () {
      var f = this.files && this.files[0]; box.innerHTML = ''; if (!f) return;
      if (f.size > 2 * 1024 * 1024) { box.innerHTML = '<div class="err">File terlalu besar untuk daftar customer (maksimal 2 MB).</div>'; return; }
      var fr = new FileReader();
      fr.onerror = function () { box.innerHTML = '<div class="err">File tidak dapat dibaca.</div>'; };
      fr.onload = function () {
        var rows = parseCustCsv_(String(fr.result));
        if (!rows.length) { box.innerHTML = '<div class="err">Tidak ada baris customer di file ini. Pastikan kolomnya Nama;Grup.</div>'; return; }
        box.innerHTML = '<div class="muted">Memeriksa ' + rows.length + ' baris…</div>';
        call('previewCustSync', { rows: rows }).then(function (pv) {
          var chg = pv.gantiGrup.length + pv.rename.length + pv.baru.length;
          box.innerHTML = '<div class="chips" style="margin:10px 0"><span class="chip">' + fmt(pv.total) + ' baris CSV</span><span class="chip">' + fmt(pv.sama) + ' sudah sama</span><span class="chip" style="border-color:var(--accent)">' + fmt(pv.gantiGrup.length) + ' grup berubah</span><span class="chip" style="border-color:var(--accent)">' + fmt(pv.rename.length) + ' nama diseragamkan</span><span class="chip" style="border-color:var(--accent)">' + fmt(pv.baru.length) + ' customer baru</span><span class="chip">' + fmt(pv.pic.length) + ' PIC dipindah</span><span class="chip">' + fmt(pv.tidakAda) + ' tidak ada di CSV (dibiarkan)</span></div>' +
            (pv.ambigu.length ? '<div class="err" style="margin-bottom:8px">' + pv.ambigu.length + ' nama dilewati karena cocok dengan lebih dari satu customer: ' + esc(pv.ambigu.map(function (a) { return a.nama + ' (≈ ' + a.kandidat.join(' / ') + ')'; }).join('; ')) + '. Rapikan manual di menu Customer.</div>' : '') +
            (pv.dupCsv.length ? '<div class="note" style="margin-bottom:8px">Baris ganda di CSV diabaikan: ' + esc(pv.dupCsv.join('; ')) + '</div>' : '') +
            (pv.tanpaGrup ? '<div class="note" style="margin-bottom:8px">' + pv.tanpaGrup + ' baris tanpa grup: grup customer-nya tidak diubah.</div>' : '') +
            list('Grup berubah', pv.gantiGrup, function (x) { return '<tr><td>' + esc(x.nama) + '</td><td class="muted">' + esc(x.dari || '–') + '</td><td>→ <b>' + esc(x.ke) + '</b></td></tr>'; }) +
            list('Nama diseragamkan', pv.rename, function (x) { return '<tr><td class="muted">' + esc(x.dari) + '</td><td>→ <b>' + esc(x.ke) + '</b></td></tr>'; }) +
            list('Customer baru', pv.baru, function (x) { return '<tr><td>' + esc(x.nama) + '</td><td>' + esc(x.grup) + '</td></tr>'; }) +
            list('PIC dipindah ke grup baru', pv.pic, function (x) { return '<tr><td>' + esc(x.grup) + '</td><td>' + esc(x.pic) + '</td><td class="muted">dari ' + esc(x.dari) + '</td></tr>'; }) +
            (pv.tidakAda ? '<div class="muted" style="margin-top:8px">Contoh yang tidak ada di CSV: ' + esc(pv.tidakAdaContoh.join('; ')) + (pv.tidakAda > pv.tidakAdaContoh.length ? ' …' : '') + '</div>' : '') +
            '<div id="syErr"></div><p style="margin-top:12px"><button class="btn primary" id="syGo"' + (chg || pv.pic.length ? '' : ' disabled') + '>' + (chg || pv.pic.length ? 'Terapkan perubahan' : 'Tidak ada yang perlu diubah') + '</button></p>';
          var go = $('#syGo'); if (!go) return;
          go.addEventListener('click', function () {
            go.disabled = true; go.textContent = 'Menerapkan…'; $('#syErr').innerHTML = '';
            call('applyCustSync', { rows: rows }).then(function (r) {
              S.quotes = []; S.cust = null; S.fu = null; S.ar = null;
              box.innerHTML = '<div class="note">Selesai: ' + fmt(r.ubah) + ' customer diperbarui, ' + fmt(r.baru) + ' ditambahkan, nama di ' + fmt(r.transaksi) + ' transaksi diseragamkan, ' + fmt(r.pic) + ' PIC dipindah.</div>';
              toast('Sinkron customer selesai.');
            }).catch(function (e) { $('#syErr').innerHTML = '<div class="err">' + esc(e.message) + '</div>'; go.disabled = false; go.textContent = 'Terapkan perubahan'; });
          });
        }).catch(function (e) { box.innerHTML = '<div class="err">' + esc(e.message) + '</div>'; });
      };
      fr.readAsText(f);
    });
    return Promise.resolve();
  }

  boot();
})();
