/**
 * MANDIBA – Backend toko (Google Apps Script, gratis)
 * Pesanan -> Google Sheet, email ke pembeli, status pesanan, produk/harga/stok dari Sheet,
 * ulasan terverifikasi, ongkir, voucher, dan ringkasan penjualan.
 *
 * CARA PASANG (pasang dari DALAM Google Sheet: menu Ekstensi > Apps Script)
 * 1. Hapus semua kode bawaan (termasuk "function myFunction"), tempel seluruh file ini, simpan.
 * 2. Deploy > Manage deployments > ikon pensil > Version: "New version" > Deploy.
 *    (Pertama kali: Deploy > New deployment > Web app > Execute as: Me > Who has access: Anyone.)
 * 3. Salin Web app URL (berakhiran /exec) ke  const NOTIFY={endpoint:"..."}  di index.html / mandiba-editorial.html.
 * 4. Muat ulang Google Sheet. Klik menu MANDIBA > "1. Siapkan kolom, tab & dropdown" (sekali saja).
 *
 * TAB DI GOOGLE SHEET (dibuat otomatis oleh langkah 4)
 * - Sheet pertama  : daftar pesanan (otomatis terisi). Ubah "Status pesanan" lewat dropdown.
 * - Produk         : id, nama, deskripsi, harga, warna, warna habis, aktif, foto depan, foto belakang.
 *                    Ubah harga atau isi "warna habis" (pisahkan koma, contoh: Biru). Aktif=TIDAK menyembunyikan produk.
 * - Ongkir         : wilayah, tarif (isi sendiri). Kosong = form tidak menampilkan pilihan wilayah.
 * - Voucher        : kode, jenis (persen / nominal), nilai, min belanja, berlaku sampai, kuota, aktif (YA/TIDAK).
 * - Ulasan         : ulasan dari pembeli. Ubah kolom Status menjadi "Disetujui" agar tampil di halaman.
 * - Ringkasan      : dibuat lewat menu MANDIBA > "3. Buat/Perbarui ringkasan".
 *
 * Batas Gmail gratis: sekitar 100 email per hari. Email dikirim dari akun Google yang memasang skrip ini.
 */
const OWNER_EMAIL = "mandibaofficial@gmail.com";   // salinan pesanan untuk kamu ("" = tidak kirim)
const STORE_NAME = "MANDIBA";
const WA_NUMBER = "+62 831-5260-2056";
const PAYMENT_TEXT = "";   // contoh: "Transfer ke BCA 1234567890 a.n. Nama Pemilik. Kirim bukti bayar lewat WhatsApp."  ("" = tidak dicantumkan di email)
const COL = { status: 10, resi: 11, notified: 12, voucher: 13, diskon: 14, wilayah: 15, ongkir: 16, bayar: 17 };
const TAB = { produk: "Produk", ongkir: "Ongkir", voucher: "Voucher", ulasan: "Ulasan", ringkasan: "Ringkasan" };
const STATUS = ["Diproses", "Dikemas", "Dikirim", "Selesai", "Dibatalkan"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NCOL = 17;

/* ================= PESANAN (POST dari website) ================= */
function doPost(e) {
  try {
    const o = JSON.parse(e.postData.contents);
    const email = String(o.email || "").trim();
    if (!EMAIL_RE.test(email) || !o.orderId || !Array.isArray(o.items) || !o.items.length || o.items.length > 10) return out({ ok: false, error: "data tidak valid" });

    const id = String(o.orderId).slice(0, 30), name = String(o.name || "").slice(0, 80);
    const pm = priceMap();   // harga dari tab Produk menimpa harga kiriman browser
    const items = o.items.map(i => {
      const nm = String(i.name).slice(0, 60), cp = Number(i.price) || 0;
      return { name: nm, color: String(i.color).slice(0, 30), qty: Math.min(99, Math.max(1, Number(i.qty) || 1)), price: pm[nm.toLowerCase()] != null ? pm[nm.toLowerCase()] : cp };
    });
    const total = items.reduce((a, i) => a + i.price * i.qty, 0);
    const v = o.voucher ? cekVoucher(String(o.voucher), total) : null;
    const diskon = v && v.ok ? v.diskon : 0, kode = v && v.ok ? String(o.voucher).trim().toUpperCase() : "";
    const ong = ongkirFor(o.wilayah), bayar = Math.max(0, total - diskon) + ong.tarif;
    const rp = n => "Rp" + n.toLocaleString("id-ID");
    const row = (a, b, strong) => `<tr><td style="padding:6px 0">${strong ? "<b>" + a + "</b>" : a}</td><td style="text-align:right">${strong ? "<b>" + b + "</b>" : b}</td></tr>`;
    const lines = items.map(i => row(`${esc(i.name)} (${esc(i.color)}) × ${i.qty}`, i.price ? rp(i.price * i.qty) : "-")).join("")
      + (diskon ? row(`Diskon (${esc(kode)})`, "-" + rp(diskon)) : "")
      + (ong.ada ? row(`Ongkir (${esc(ong.wilayah)})`, rp(ong.tarif)) : "")
      + row(ong.ada ? "Total bayar" : "Total produk", total ? rp(bayar) : "-", true);
    const html = wrapMail("Pesananmu sedang diproses",
      `<p>Halo ${esc(name)}, terima kasih sudah memesan di ${STORE_NAME}. Pesananmu <b>${esc(id)}</b> sudah kami terima dan sedang diproses.</p>
      <table style="width:100%;border-top:1px solid #e6d7cc;border-bottom:1px solid #e6d7cc;border-collapse:collapse">${lines}</table>
      <p style="font-size:13px;color:#66555a">${ong.ada ? "" : "Belum termasuk ongkos kirim. "}Kami akan menghubungimu lewat WhatsApp untuk konfirmasi ${ong.ada ? "pembayaran" : "ongkir dan pembayaran"}.</p>
      ${PAYMENT_TEXT ? `<p><b>Pembayaran:</b> ${esc(PAYMENT_TEXT)}</p>` : ""}
      <p><b>Alamat:</b> ${esc(String(o.address || "").slice(0, 300))}</p>${o.gift ? `<p><b>Kartu ucapan:</b> ${esc(String(o.gift).slice(0, 140))}</p>` : ""}
      <p style="font-size:13px;color:#66555a">Simpan nomor pesanan ini untuk mengecek status di halaman MANDIBA.</p>`);

    const cache = CacheService.getScriptCache(), key = "m_" + email.toLowerCase();
    const throttled = !!cache.get(key);
    if (!throttled) cache.put(key, "1", 60);   // jeda 60 detik per email: pesanan tetap dicatat, email tidak diulang

    let sh = null, rowNo = 0;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) {
      sh = ss.getSheets()[0];
      const lock = LockService.getScriptLock(); lock.waitLock(10000);
      try {
        sh.appendRow([new Date(), id, safe(name), email, safe(String(o.address || "")),
          safe(String(o.note || "") + (o.gift ? " | Kartu: " + String(o.gift).slice(0, 140) : "")),
          items.map(i => `${i.name} (${i.color}) x${i.qty}`).join("; "), total, "mengirim email...", "Diproses", "", "",
          kode, diskon, ong.ada ? ong.wilayah : "", ong.tarif, bayar]);
        rowNo = sh.getLastRow();
      } finally { lock.releaseLock(); }
    }
    let status = "email dilewati (jeda 60 detik)";
    if (!throttled) {
      try {
        MailApp.sendEmail({ to: email, subject: `Pesanan ${id} sedang diproses – ${STORE_NAME}`, htmlBody: html, name: STORE_NAME });
        if (OWNER_EMAIL) MailApp.sendEmail({ to: OWNER_EMAIL, subject: `Pesanan baru ${id}`, htmlBody: `<p>${esc(name)} (${esc(email)})</p>${html}`, name: STORE_NAME + " Order" });
        status = "email terkirim";
        if (sh) sh.getRange(rowNo, COL.notified).setValue("Diproses");
      } catch (err) { status = "email GAGAL: " + String(err).slice(0, 80); }
    }
    if (sh) sh.getRange(rowNo, 9).setValue(status);
    return out({ ok: true, status: status, bayar: bayar });
  } catch (err) { return out({ ok: false, error: String(err) }); }
}

/* ================= API untuk halaman (GET, format JSONP) ================= */
function doGet(e) {
  const p = (e && e.parameter) || {}, cb = /^[A-Za-z0-9_]{1,40}$/.test(p.callback || "") ? p.callback : "";
  const send = o => cb ? ContentService.createTextOutput(cb + "(" + JSON.stringify(o) + ")").setMimeType(ContentService.MimeType.JAVASCRIPT) : out(o);
  try {
    switch (p.action) {
      case "status": return send(apiStatus(p));
      case "produk": return send(apiProduk());
      case "ulasan_list": return send(apiUlasanList());
      case "ulasan": return send(apiUlasanKirim(p));
      case "ongkir": return send({ ok: true, ongkir: apiOngkir() });
      case "muat": { const pr = apiProduk(); return send({ ok: true, produk: pr.produk, terjual: pr.terjual, voucher: pr.voucher, ulasan: apiUlasanList().ulasan, ongkir: apiOngkir() }); }   // satu permintaan untuk semua data halaman
      case "voucher": if (!hit("v_all", 60, 60)) return send({ ok: false, error: "terlalu_sering" });   // pembatas: cegah menebak kode voucher
        return send(cekVoucher(String(p.kode || ""), Number(p.total) || 0));
      default: return send({ ok: false, error: "aksi tidak dikenal" });
    }
  } catch (err) { return send({ ok: false, error: "gagal" }); }
}
function hit(key, max, sec) {
  const c = CacheService.getScriptCache(), n = Number(c.get(key) || 0);
  if (n >= max) return false;
  c.put(key, String(n + 1), sec); return true;
}
function findOrder(id, email) {
  const ss = SpreadsheetApp.getActiveSpreadsheet(); if (!ss) return null;
  const vals = ss.getSheets()[0].getDataRange().getValues();
  for (let i = 0; i < vals.length; i++) {
    const r = vals[i];
    if (String(r[1]).toUpperCase() === id && String(r[3]).toLowerCase() === email) return { row: r, n: i + 1 };
  }
  return null;
}
function apiStatus(p) {
  const id = String(p.id || "").trim().toUpperCase(), email = String(p.email || "").trim().toLowerCase();
  if (!id || !EMAIL_RE.test(email)) return { ok: false, error: "data kurang" };
  if (!hit("s_" + email, 10, 600)) return { ok: false, error: "terlalu sering" };   // maks 10 cek per 10 menit per email
  const f = findOrder(id, email);
  return f ? { ok: true, status: String(f.row[COL.status - 1] || "Diproses"), resi: String(f.row[COL.resi - 1] || "") } : { ok: false, error: "tidak ditemukan" };
}

/* ---------- produk, harga, stok, terjual ---------- */
function parseItems(s) {
  return String(s || "").split("; ").map(t => { const m = /^(.*) \((.*)\) x(\d+)$/.exec(t.trim()); return m ? { name: m[1], color: m[2], qty: Number(m[3]) } : null; }).filter(Boolean);
}
function apiProduk() {
  const cache = CacheService.getScriptCache(), hitc = cache.get("produk_json");
  if (hitc) return JSON.parse(hitc);
  const list = readTab(TAB.produk).filter(r => String(r.id || "").trim()).map(r => ({
    id: String(r.id).trim(), nama: String(r.nama || ""), deskripsi: String(r.deskripsi || ""), harga: r.harga === "" ? "" : Number(r.harga),
    warna: String(r.warna || ""), habis: String(r["warna habis"] || "").split(",").map(x => x.trim()).filter(Boolean),
    aktif: String(r.aktif || "YA").toUpperCase() === "TIDAK" ? "TIDAK" : "YA", foto1: String(r["foto depan"] || ""), foto2: String(r["foto belakang"] || "")
  }));
  const terjual = {}, ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) lastRows(ss.getSheets()[0]).forEach(r => {
    if (String(r[COL.status - 1]) === "Selesai") parseItems(r[6]).forEach(i => terjual[i.name] = (terjual[i.name] || 0) + i.qty);
  });
  const res = { ok: true, produk: list, terjual: terjual, voucher: readTab(TAB.voucher).some(v => String(v.aktif).toUpperCase() === "YA") };
  cache.put("produk_json", JSON.stringify(res), 60);
  return res;
}
function priceMap() {
  const m = {};
  readTab(TAB.produk).forEach(r => { if (r.nama && r.harga !== "" && !isNaN(Number(r.harga))) m[String(r.nama).toLowerCase()] = Number(r.harga); });
  return m;
}

/* ---------- ulasan terverifikasi ---------- */
function apiUlasanList() {
  const rows = readTab(TAB.ulasan).filter(r => String(r.status) === "Disetujui");
  return { ok: true, ulasan: rows.slice(-20).reverse().map(r => ({ n: String(r["nama tampil"]), r: Number(r.bintang) || 5, p: String(r.produk), t: String(r.ulasan) })) };
}
function apiUlasanKirim(p) {
  const id = String(p.id || "").trim().toUpperCase(), email = String(p.email || "").trim().toLowerCase();
  const bintang = Math.round(Number(p.bintang)), teks = String(p.teks || "").trim(), nama = String(p.nama || "").trim().slice(0, 30);
  if (!id || !EMAIL_RE.test(email) || !(bintang >= 1 && bintang <= 5) || teks.length < 10 || teks.length > 300) return { ok: false, error: "data_tidak_valid" };
  if (!hit("u_" + email, 3, 600)) return { ok: false, error: "terlalu_sering" };
  const f = findOrder(id, email);
  if (!f) return { ok: false, error: "tidak_ditemukan" };
  if (String(f.row[COL.status - 1]) !== "Selesai") return { ok: false, error: "belum_selesai" };
  const ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(TAB.ulasan);
  if (!sh) return { ok: false, error: "gagal" };
  if (readTab(TAB.ulasan).some(r => String(r["no. pesanan"]).toUpperCase() === id)) return { ok: false, error: "sudah_ulas" };
  const pn = parseItems(f.row[6]).map(i => i.name).filter((x, i, a) => a.indexOf(x) === i).join(", ");
  const nm = String(f.row[2] || "");
  const tampil = nama || (nm ? nm[0].toLowerCase() + "****" + nm[nm.length - 1].toLowerCase() : "pembeli");
  sh.appendRow([new Date(), id, safe(tampil), pn, bintang, safe(teks), "Menunggu"]);
  return { ok: true };
}

/* ---------- voucher & ongkir ---------- */
function apiOngkir() {
  return readTab(TAB.ongkir).filter(r => r.wilayah && String(r.tarif) !== "" && Number(r.tarif) >= 0).map(r => ({ w: String(r.wilayah), t: Number(r.tarif) }));
}
function cekVoucher(kodeRaw, total) {
  const kode = String(kodeRaw).trim().toUpperCase();
  if (!kode) return { ok: false, error: "tidak_ditemukan" };
  const v = readTab(TAB.voucher).find(r => String(r.kode).trim().toUpperCase() === kode);
  if (!v) return { ok: false, error: "tidak_ditemukan" };
  if (String(v.aktif).toUpperCase() !== "YA") return { ok: false, error: "tidak_aktif" };
  if (v["berlaku sampai"]) {
    const d = v["berlaku sampai"] instanceof Date ? v["berlaku sampai"] : new Date(v["berlaku sampai"]);
    if (!isNaN(d) && new Date().getTime() > d.getTime() + 86400000) return { ok: false, error: "kadaluarsa" };
  }
  if (Number(v["min belanja"]) > total) return { ok: false, error: "min_belanja", min: Number(v["min belanja"]) };
  if (Number(v.kuota) > 0) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const pakai = ss ? lastRows(ss.getSheets()[0]).filter(r => String(r[COL.voucher - 1]).toUpperCase() === kode && String(r[COL.status - 1]) !== "Dibatalkan").length : 0;
    if (pakai >= Number(v.kuota)) return { ok: false, error: "kuota_habis" };
  }
  const nilai = Number(v.nilai) || 0;
  const diskon = String(v.jenis).toLowerCase() === "persen" ? Math.floor(total * Math.min(nilai, 100) / 100) : Math.min(nilai, total);
  return diskon > 0 ? { ok: true, diskon: diskon } : { ok: false, error: "tidak_ditemukan" };
}
function ongkirFor(w) {
  const name = String(w || "").trim().toLowerCase();
  if (!name) return { ada: false, wilayah: "", tarif: 0 };
  const r = readTab(TAB.ongkir).find(x => String(x.wilayah).trim().toLowerCase() === name);
  return r ? { ada: true, wilayah: String(r.wilayah), tarif: Number(r.tarif) || 0 } : { ada: false, wilayah: "", tarif: 0 };
}

/* ================= MENU DI GOOGLE SHEET ================= */
function onOpen() {
  SpreadsheetApp.getUi().createMenu("MANDIBA")
    .addItem("1. Siapkan kolom, tab & dropdown", "siapkanSheet")
    .addItem("2. Kirim email status (yang berubah)", "kirimEmailStatus")
    .addItem("3. Buat/Perbarui ringkasan", "buatRingkasan").addToUi();
}
function ensureTab(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");
  sh.setFrozenRows(1);
  return sh;
}
function siapkanSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheets()[0];
  sh.getRange(1, 1, 1, NCOL).setValues([["Waktu", "No. Pesanan", "Nama", "Email", "Alamat", "Catatan", "Produk", "Total produk", "Status email", "Status pesanan", "No. resi / kurir", "Terakhir diberi tahu", "Kode voucher", "Diskon", "Wilayah", "Ongkir", "Total bayar"]]).setFontWeight("bold");
  sh.setFrozenRows(1);
  const rule = list => SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).build();
  sh.getRange(2, COL.status, Math.max(sh.getMaxRows() - 1, 1), 1).setDataValidation(rule(STATUS));
  const pr = ss.getSheetByName(TAB.produk);
  const p2 = ensureTab(ss, TAB.produk, ["ID", "Nama", "Deskripsi", "Harga", "Warna", "Warna habis", "Aktif", "Foto depan", "Foto belakang"]);
  if (!pr) p2.getRange(2, 1, 3, 9).setValues([
    ["pompom", "Cermin Pita Pompom", "Bingkai merah muda dengan pita mutiara. Bagian belakang berbulu pompom hitam dengan pita besar.", 10000, "Hitam–Pink", "", "YA", "", ""],
    ["bunga", "Bunga Mekar", "Bunga rajut berputik putih dengan benang sari kuning. Bagian belakang cermin mini dengan pita manik mutiara.", 10000, "Merah Muda", "", "YA", "", ""],
    ["matahari", "Bunga Matahari", "Cermin berbingkai kelopak rajut dengan pita mutiara. Bagian belakang berbentuk bunga utuh dengan pusat bermutiara.", 10000, "Kuning,Biru", "", "YA", "", ""]]);
  ensureTab(ss, TAB.ongkir, ["Wilayah", "Tarif"]);
  ensureTab(ss, TAB.voucher, ["Kode", "Jenis", "Nilai", "Min belanja", "Berlaku sampai", "Kuota", "Aktif"]);
  const u = ensureTab(ss, TAB.ulasan, ["Waktu", "No. Pesanan", "Nama tampil", "Produk", "Bintang", "Ulasan", "Status"]);
  u.getRange(2, 7, Math.max(u.getMaxRows() - 1, 1), 1).setDataValidation(rule(["Menunggu", "Disetujui", "Ditolak"]));
  SpreadsheetApp.getUi().alert("Siap. Tab Produk, Ongkir, Voucher, dan Ulasan sudah dibuat. Isi tab Ongkir dan Voucher sendiri bila diperlukan. Ubah 'Status pesanan' lewat dropdown, lalu pakai menu MANDIBA.");
}
function kirimEmailStatus() {
  const ui = SpreadsheetApp.getUi(), sh = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0], last = sh.getLastRow();
  if (last < 2) { ui.alert("Belum ada pesanan."); return; }
  const data = sh.getRange(2, 1, last - 1, NCOL).getValues();
  let sent = 0, skipped = 0;
  data.forEach((r, i) => {
    const st = String(r[COL.status - 1] || "").trim(), done = String(r[COL.notified - 1] || "").trim(), email = String(r[3]).trim();
    if (!st || st === done || !EMAIL_RE.test(email)) return;
    if (STATUS.indexOf(st) < 0 || MailApp.getRemainingDailyQuota() < 1) { skipped++; return; }
    try {
      MailApp.sendEmail({ to: email, subject: `Pesanan ${r[1]}: ${st} – ${STORE_NAME}`, htmlBody: statusMail(st, String(r[1]), String(r[2]), String(r[COL.resi - 1] || "")), name: STORE_NAME });
      sh.getRange(i + 2, COL.notified).setValue(st); sent++;
    } catch (err) { skipped++; }
  });
  ui.alert(`Email status terkirim: ${sent}. Dilewati atau gagal: ${skipped}.`);
}
function statusMail(st, id, name, resi) {
  const msg = {
    "Diproses": "Pesananmu sedang diproses.",
    "Dikemas": "Pesananmu sedang dikemas dan segera dikirim.",
    "Dikirim": "Pesananmu sudah dikirim." + (resi ? ` Nomor resi / kurir: <b>${esc(resi)}</b>.` : ""),
    "Selesai": "Pesananmu sudah selesai. Terima kasih sudah berbelanja! Kamu bisa menulis ulasan di halaman MANDIBA dengan nomor pesanan ini.",
    "Dibatalkan": "Pesananmu dibatalkan. Kalau ini keliru, hubungi kami lewat WhatsApp."
  }[st];
  return wrapMail("Status pesanan: " + st, `<p>Halo ${esc(name)},</p><p>${msg}</p><p>Nomor pesanan: <b>${esc(id)}</b></p>`);
}

/* ================= RINGKASAN ================= */
function buatRingkasan() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), data = lastRows(ss.getSheets()[0]);
  let rs = ss.getSheetByName(TAB.ringkasan); if (!rs) rs = ss.insertSheet(TAB.ringkasan); rs.clear();
  let selesai = 0, batal = 0, omzet = 0; const hari = {}, prod = {};
  data.forEach(r => {
    const st = String(r[COL.status - 1] || "Diproses");
    if (st === "Dibatalkan") { batal++; return; }
    if (st === "Selesai") selesai++;
    omzet += Number(r[COL.bayar - 1]) || Number(r[7]) || 0;
    const d = Utilities.formatDate(new Date(r[0]), Session.getScriptTimeZone(), "yyyy-MM-dd");
    hari[d] = (hari[d] || 0) + 1;
    parseItems(r[6]).forEach(i => prod[i.name] = (prod[i.name] || 0) + i.qty);
  });
  const hariRows = Object.keys(hari).sort().slice(-14).map(k => [k, hari[k]]);
  const prodRows = Object.keys(prod).sort((a, b) => prod[b] - prod[a]).map(k => [k, prod[k]]);
  const top = [["Ringkasan MANDIBA", ""], ["Diperbarui", new Date()], ["", ""], ["Total pesanan (tanpa batal)", data.length - batal], ["Pesanan selesai", selesai], ["Pesanan dibatalkan", batal], ["Omzet (tanpa batal)", omzet], ["Produk terlaris", prodRows.length ? prodRows[0][0] : "-"]];
  rs.getRange(1, 1, top.length, 2).setValues(top);
  rs.getRange(1, 1).setFontWeight("bold").setFontSize(14);
  rs.getRange(10, 1, 1, 2).setValues([["Tanggal", "Jumlah pesanan"]]).setFontWeight("bold");
  if (hariRows.length) rs.getRange(11, 1, hariRows.length, 2).setValues(hariRows);
  rs.getRange(10, 4, 1, 2).setValues([["Produk", "Jumlah terjual"]]).setFontWeight("bold");
  if (prodRows.length) rs.getRange(11, 4, prodRows.length, 2).setValues(prodRows);
  try {
    if (hariRows.length) rs.insertChart(rs.newChart().setChartType(Charts.ChartType.COLUMN).addRange(rs.getRange(10, 1, hariRows.length + 1, 2)).setPosition(2, 7, 0, 0).setOption("title", "Pesanan per hari").build());
    if (prodRows.length) rs.insertChart(rs.newChart().setChartType(Charts.ChartType.BAR).addRange(rs.getRange(10, 4, prodRows.length + 1, 2)).setPosition(20, 7, 0, 0).setOption("title", "Produk terjual").build());
  } catch (err) { /* grafik opsional */ }
  SpreadsheetApp.getUi().alert("Ringkasan diperbarui di tab 'Ringkasan'.");
}

/* ================= ALAT BANTU ================= */
function readTab(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss ? ss.getSheetByName(name) : null;
  if (!sh || sh.getLastRow() < 2) return [];
  const v = sh.getDataRange().getValues(), h = v[0].map(x => String(x).trim().toLowerCase());
  return v.slice(1).map(r => { const o = {}; h.forEach((k, i) => o[k] = r[i]); return o; });
}
function lastRows(sh) { const n = sh.getLastRow(); return n < 2 ? [] : sh.getRange(2, 1, n - 1, NCOL).getValues(); }
function wrapMail(title, body) {
  return `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#2a1d20"><h2 style="color:#8f2f4a;margin-bottom:4px">${title}</h2>${body}
    <p style="font-size:13px;color:#66555a">Ada pertanyaan? Balas lewat WhatsApp ${WA_NUMBER}.</p></div>`;
}
function safe(t) { return /^[=+\-@]/.test(String(t)) ? "'" + t : t; }   // cegah isi sel dibaca sebagai rumus
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/** TES MANUAL: pilih "tesPesanan" di menu atas editor, klik Run. Satu baris contoh muncul di Sheet dan satu email contoh masuk ke OWNER_EMAIL. */
function tesPesanan() {
  const r = doPost({ postData: { contents: JSON.stringify({
    orderId: "MDB-TES-0001", name: "Tes Pembeli", email: OWNER_EMAIL || Session.getActiveUser().getEmail(),
    address: "Jl. Contoh No. 1, Tuban", note: "ini hanya tes", gift: "",
    items: [{ name: "Bunga Mekar", color: "Merah Muda", qty: 1, price: 10000 }]
  }) } });
  Logger.log(r.getContent());
}
