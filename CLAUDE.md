# Catatan untuk Claude

## Setelah mengubah file JavaScript di `js/`
`index.html` hanya memuat `js/app.min.js` (hasil build), bukan file di `js/` secara langsung.
Perubahan di `js/*.js` TIDAK tampil di aplikasi sebelum build dijalankan ulang:

```
npm install      # bila node_modules belum ada (sesi baru)
npm run build    # menulis js/app.min.js + js/app.min.js.map
npm test         # tes logika SPP + cek hasil build sesuai sumber
```

Commit `js/app.min.js` dan `js/app.min.js.map` bersama perubahan sumbernya.
Jangan edit `js/app.min.js` secara langsung. File JS baru: daftarkan di `FILES` pada `scripts/build.js`.
