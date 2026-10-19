# PRISMA — PR Intelligence & Social Media

Sistem monitoring isu, pemberitaan media, dan sentimen publik berbasis **Node.js, Express, Google Search API, Python FastAPI, dan Transformer NLP (IndoBERT)**.

---

## 1. Ikhtisar Arsitektur

Prisma menggabungkan frontend dashboard analitik, automated search scheduler, dan microservice Natural Language Processing berbasis Hugging Face Transformers:

```text
┌────────────────────────────────────────────────────────┐
│                   PRISMA Web Application               │
│         (Node.js + Express + Dashboard UI + Vanilla CSS)│
└──────────────┬───────────────────────────┬─────────────┘
               │                           │
               ▼                           ▼
┌───────────────────────────────┐ ┌────────────────────────────────┐
│      Google Search API        │ │      Prisma Storage Engine     │
│   (Scheduled Web Crawling)    │ │      (data/database.json)      │
└──────────────┬────────────────┘ └────────────────────────────────┘
               │
               ▼
┌────────────────────────────────────────────────────────┐
│         Adapter Sentimen (src/nlp_sentiment.js)        │
│          Bridge Asinkron & Fallback Graceful           │
└──────────────┬───────────────────────────┬─────────────┘
               │ (Primary)                 │ (Fallback jika API offline)
               ▼                           ▼
┌──────────────────────────────┐ ┌───────────────────────────────┐
│  IndoBERT Python Microservice│ │   Heuristic Lexicon Engine    │
│  FastAPI + PyTorch + SmSA    │ │   (Kamus Slang & Leksikon)    │
│  (port 8000)                 │ │   model: 'lexicon-fallback'   │
└──────────────────────────────┘ └───────────────────────────────┘
```

---

## 2. Fitur Utama

- **Analisis Sentimen IndoBERT 3-Kelas**: Mengklasifikasikan teks ke dalam `positif`, `negatif`, atau `netral` menggunakan model transformer fine-tuned [`mdhugol/indonesia-bert-sentiment-classification`](https://huggingface.co/mdhugol/indonesia-bert-sentiment-classification).
- **Pemahaman Konteks & Negasi Kompleks**: Mampu menangani frasa seperti *"tidak buruk"*, *"tidak hanya gagal tetapi merugikan"*, dan *"Presiden membantah tuduhan korupsi"*.
- **Toleransi Kesalahan & Fallback Tanpa Downtime**: Jika layanan IndoBERT sedang offline atau timeout, sistem otomatis beralih ke engine leksikon tanpa menghentikan pemrosesan berita.
- **Probabilitas Softmax & Metrik Skor Terbuka**: Confidence dihitung dari probabilitas model aktual, bukan rekaan jumlah kata.
- **Monitoring Isu Multi-Platform**: Mendukung pemantauan Website Berita, Facebook, Twitter (X), dan Instagram.
- **Clustering & Deduplikasi Berita**: Mengelompokkan berita dan artikel serupa untuk mencegah duplikasi isu.

---

## 3. Prasyarat Sistem

- **Node.js**: v18.0.0 atau lebih baru (disarankan v20+)
- **Python**: v3.10 atau v3.11 (dengan PyTorch dan Transformers)
- **RAM**: Minimal 4 GB (disarankan 8 GB untuk inferensi IndoBERT)

---

## 4. Cara Instalasi & Menjalankan

### Langkah 1: Siapkan Konfigurasi Lingkungan
Salin file `.env.example` ke `.env` dan atur API keys Anda jika ingin menggunakan integrasi Google Search Engine:
```powershell
cp .env.example .env
```

### Langkah 2: Jalankan Layanan IndoBERT (Python)
Buka terminal pertama:
```powershell
# Masuk ke direktori service
cd sentiment_service

# Buat virtual environment (jika belum ada)
python -m venv .venv

# Aktifkan virtual environment
.\.venv\Scripts\Activate.ps1

# Install pustaka
pip install -r requirements.txt

# Jalankan server FastAPI
python app.py
```
Layanan akan aktif di `http://127.0.0.1:8000`.

### Langkah 3: Jalankan Aplikasi Web Prisma (Node.js)
Buka terminal kedua di root project:
```powershell
# Install dependensi Node.js
npm install

# Jalankan server Prisma
npm start
# atau mode development:
npm run dev
```
Aplikasi web dapat diakses melalui browser di: `http://localhost:3000`.

---

## 5. Kredensial Login & Cara Preview Tampilan

### A. Kredensial Akun Administrator Default

Gunakan kredensial berikut untuk masuk ke sistem:

| Field | Nilai Default |
| :--- | :--- |
| **Email / Username** | `psdm.muhammadiyah` |
| **Password** | `@1912kaumanjogja` |

> [!NOTE]
> Akun ini otomatis diinisialisasi oleh sistem saat pertama kali dijalankan. Anda dapat mengganti kata sandi kapan saja melalui menu **Pengaturan (`/settings`)**.

### B. Kredensial Portal Master Owner (Persetujuan & Manajemen Akun)

Untuk mengelola pendaftaran akun baru, masa aktif langganan, dan reset kata sandi:

| Field | Nilai Default |
| :--- | :--- |
| **URL Portal Owner** | `http://localhost:3000/kjkaaf94nf/` |
| **Username Owner** | `owner.syiar` |
| **Password Owner** | `@SyiarOwner2026!` |

---

### C. Langkah-Langkah Preview Tampilan di Browser

1. Pastikan server Node.js dan service IndoBERT telah berjalan sesuai instruksi di Langkah 2 & 3.
2. Buka browser (Chrome, Edge, Firefox, atau Safari) dan akses tautan:
   ```text
   http://localhost:3000/login
   ```
3. Masukkan **Email / Username** dan **Password** di atas, lalu klik **Sign in**. Karakter maskot interaktif di panel kiri akan merespons gerakan kursor dan input Anda.
4. Setelah berhasil masuk, Anda dapat melihat dan menguji pratinjau halaman-halaman berikut:

   * **Dashboard Utama (`http://localhost:3000/dashboard`)**:
     * Visualisasi statistik total monitoring, jumlah temuan, dan distribusi sentimen dalam grafik batang maupun diagram donat.
     * Panel monitoring aktif, filter tanggal (*date range*), dan daftar cuplikan berita terkini dengan persentase keyakinan sentimen.
     * Tombol beralih **Dark Mode / Light Mode** di kanan atas navbar.

   * **Halaman Aktivitas (`http://localhost:3000/results`)**:
     * Daftar temuan pemantauan media yang diklasifikasikan per platform (*Website, Facebook, Twitter/X, Instagram*).
     * Setiap kartu berita menampilkan **badge sentimen** lengkap dengan **persentase tingkat keyakinan** (contoh: `[✓] Positif 86% Keyakinan IndoBERT`, `[-] Netral 75% Keyakinan IndoBERT`).
     * Fitur pengelompokan berita serupa (*clustering & deduplication*) dan filter sentimen interaktif.

   * **Halaman Monitor (`http://localhost:3000/monitor`)**:
     * Tampilan kartu monitor isu digital:
       * **Monitor Aktif**: Kartu warna primer *Primary Purple* (`#4f46cb`).
       * **Monitor Nonaktif**: Kartu warna sekunder *Secondary Coral* lembut (`#fba691`, `opacity: 0.82`).
       * **Elemen Dekoratif**: Lingkaran halus di sudut kanan atas setiap kartu.
     * **Tombol Hapus Monitor (Tong Sampah)**: Dilengkapi dengan pop-up modal konfirmasi interaktif untuk mencegah penghapusan data secara tidak sengaja.

   * **Halaman Pengaturan (`http://localhost:3000/settings`)**:
     * Pengaturan kredensial Google Search API, interval waktu crawling, preferensi sistem, serta pengelolaan kata sandi pengguna.

---

## 6. Menjalankan Pengujian

### A. Pengujian Integrasi Node.js Suite
Memvalidasi kontrak API, penanganan teks kosong, normalisasi slang, fallback saat API mati, health check adapter, dan live batch inference:
```powershell
npm test
```

### B. Pengujian Laporan PDF & Narasi AI
Memvalidasi pembuatan laporan PDF resmi, format tanggal Indonesia, formatting platform, caching narasi AI, dan rekomendasi strategis:
```powershell
npm run test:pdf
```

### C. Benchmark Akurasi Komparatif (IndoBERT vs Leksikon)
Membandingkan kinerja klasifikasi IndoBERT melawan engine lama menggunakan 31 sampel uji teranotasi:
```powershell
.\sentiment_service\.venv\Scripts\python.exe sentiment_service\benchmark.py
```

Hasil benchmark aktual:
- **Akurasi**: IndoBERT **74.19%** vs Leksikon 58.06% (+16.13%)
- **Macro F1-Score**: IndoBERT **0.7311** vs Leksikon 0.5758 (+0.1553)
- **Precision Positif**: IndoBERT **100%** (zero false positive)
- **Recall Netral**: IndoBERT **100%** (laporan berita faktual dikenali sebagai netral secara konsisten)

---

## 7. Struktur File Proyek

```text
PRISMA_PSDM/
├── public/
│   ├── css/style.css            # Styling UI, badge sentimen, tema gelap/terang
│   ├── js/app.js                # Frontend controller, sinkronisasi profil & avatar
│   ├── dashboard.html           # Dasbor analitik & diagram sentimen
│   ├── results.html             # Aktivitas pemantauan & filter sentimen
│   ├── monitor.html             # Manajemen topik, keyword & ekspor PDF AI
│   ├── settings.html            # Pengaturan akun, password, tema & API Google
│   ├── login.html               # Formulir login interaktif & aktivasi password awal
│   ├── register.html            # Formulir permohonan pendaftaran akun pengguna baru
│   └── kjkaaf94nf/              # Portal Master Owner (Privat & Terisolasi)
│       ├── index.html           # Konsol persetujuan user & kontrol langganan
│       └── login.html           # Autentikasi master owner
├── src/
│   ├── auth_vault.js            # Unified Auth Vault, multi-user & approval engine
│   ├── database.js              # Persistence data terisolasi per-tenant pengguna
│   ├── nlp_sentiment.js         # Adapter IndoBERT asinkron & fallback kamus
│   ├── sentiment.js             # Bridge kompatibilitas modul sentimen
│   ├── searcher.js              # Pipeline pencarian web & batch inferensi sentimen
│   ├── scheduler.js             # Jadwal pemantauan otomatis berkala
│   ├── clustering.js            # Algoritma pengelompokan berita serupa
│   ├── pdf_report_builder.js    # Generator laporan PDF profesional 4 halaman
│   └── ai_report_generator.js   # Generator narasi eksekutif & rekomendasi AI
├── sentiment_service/
│   ├── app.py                   # FastAPI REST API untuk IndoBERT
│   ├── model.py                 # PyTorch singleton wrapper & LRU cache
│   ├── benchmark.py             # Script pengujian komparatif metrik
│   ├── nlp_lexicon_reference.py # Baseline kamus leksikon
│   └── requirements.txt         # Dependensi Python
├── tests/
│   ├── sentiment_tests.js       # Suite pengujian otomatis integrasi sentimen
│   └── pdf_report_tests.js      # Suite pengujian otomatis laporan PDF & narasi AI
├── data/                        # [Diabaikan oleh git] Database JSON lokal & tenants
├── server.js                    # Web server Express & API routes
├── package.json
├── .env.example
└── README.md
```
