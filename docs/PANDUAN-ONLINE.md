# Panduan: MANDIBA online, QR, dan pengaturan toko

Isi folder ini siap diunggah apa adanya:
`index.html` (halaman), `manifest.webmanifest` + `sw.js` + `icon-192.png` + `icon-512.png` (aplikasi HP),
`og-image.jpg` (gambar pratinjau link), `notifikasi-email.gs` (backend Google Sheet).

## 1. Online gratis dengan GitHub Pages (±10 menit)
1. Buat akun di github.com, klik **New repository**, beri nama `mandiba`, pilih **Public**, klik **Create**.
2. Klik **uploading an existing file**, seret SEMUA berkas kecuali `PANDUAN-ONLINE.md` dan `notifikasi-email.gs`, lalu **Commit changes**.
3. Buka **Settings > Pages**. Di "Branch" pilih `main` dan folder `/ (root)`, klik **Save**.
4. Tunggu 1–3 menit. Alamatnya: `https://NAMA-GITHUB-ANDA.github.io/mandiba/`

(Alternatif: Netlify. Buka app.netlify.com/drop, seret folder ini, selesai.)

## 2. Setelah online: isi pratinjau link (WhatsApp / Instagram)
Di `index.html` cari komentar `Setelah halaman online, tambahkan` di bagian `<head>`, lalu tambahkan dua baris ini
(ganti dengan alamat Anda, harus diawali https://):
```html
<meta property="og:image" content="https://NAMA-GITHUB-ANDA.github.io/mandiba/og-image.jpg">
<meta property="og:url" content="https://NAMA-GITHUB-ANDA.github.io/mandiba/">
```
Unggah ulang `index.html`. Cek hasilnya di https://www.opengraph.xyz (tempel alamat Anda).
Catatan: WhatsApp menyimpan pratinjau lama beberapa jam; kirim link ke diri sendiri untuk mencoba.

## 3. Kode QR
Buka sebuah pembuat QR gratis (misalnya qr-code-generator.com atau qrcode-monkey.com), tempel alamat halaman Anda,
unduh PNG/SVG, lalu cetak untuk poster, kemasan, atau tempel di bio Instagram.
Pakai alamat final, bukan alamat sementara, supaya QR tidak perlu dicetak ulang.

## 4. Pasang sebagai aplikasi di HP
Buka alamat halaman di Chrome (Android): menu titik tiga > **Tambahkan ke layar utama** / **Instal aplikasi**.
Di iPhone (Safari): tombol Bagikan > **Tambah ke Layar Utama**. Ikon kucing MANDIBA akan muncul.
Ini hanya bekerja lewat alamat https (setelah online), tidak lewat file di laptop.

## 5. Statistik pengunjung (opsional)
Di `index.html` cari `const ANALYTICS=` lalu isi salah satu:
- Google Analytics 4: `ga:"G-XXXXXXXXXX"` (ID Pengukuran dari analytics.google.com > Admin > Data streams).
- Cloudflare Web Analytics: `cloudflare:"TOKEN-32-KARAKTER"` (dari dash.cloudflare.com > Web Analytics).
Halaman otomatis mencatat kunjungan, klik tombol WhatsApp, dan pesanan (purchase). Kebijakan Privasi otomatis menambahkan satu poin.

## 6. Info pembayaran di struk
Cari `const PAYMENT=` lalu isi, contoh:
```js
const PAYMENT={banks:[{nama:"BCA",rek:"1234567890",an:"Nama Pemilik"}],qris:"qris.png",batasJam:24};
```
Untuk QRIS, simpan gambarnya (mis. `qris.png`) di folder yang sama dan tulis namanya. Isi juga `PAYMENT_TEXT` di `notifikasi-email.gs`
bila ingin info pembayaran masuk ke email. Kosongkan semuanya bila belum ada.

## 7. Mengelola toko dari Google Sheet
Setelah skrip dipasang dan menu MANDIBA > "1. Siapkan kolom, tab & dropdown" dijalankan, Sheet punya tab:
- **Produk**: ubah harga, deskripsi, isi "Warna habis" (contoh `Biru`), Aktif=TIDAK untuk menyembunyikan. Produk baru perlu
  alamat foto depan dan belakang (https) dan kolom Warna.
- **Ongkir**: isi `Wilayah` dan `Tarif`. Bila terisi, pembeli wajib memilih wilayah dan ongkir masuk total.
- **Voucher**: `Kode`, `Jenis` (persen / nominal), `Nilai`, `Min belanja`, `Berlaku sampai`, `Kuota`, `Aktif` (YA/TIDAK).
- **Ulasan**: ulasan pembeli masuk dengan Status "Menunggu". Ubah menjadi **Disetujui** agar tampil di halaman.
- **Ringkasan**: menu MANDIBA > "3. Buat/Perbarui ringkasan".
Perubahan di tab Produk tampil di halaman dalam ±1 menit.

## 8. Mengubah skrip nanti
Deploy > Manage deployments > ikon pensil > Version: New version > Deploy. URL tetap sama.
