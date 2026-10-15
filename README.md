# PRISMA — PR Intelligence & Social Media Analytics

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

## 5. Menjalankan Pengujian

### A. Pengujian Integrasi Node.js Suite
Memvalidasi kontrak API, penanganan teks kosong, normalisasi slang, fallback saat API mati, health check adapter, dan live batch inference:
```powershell
npm test
```

### B. Benchmark Akurasi Komparatif (IndoBERT vs Leksikon)
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

## 6. Struktur File Proyek

```text
MAGANG PSDM/
├── public/
│   ├── css/style.css            # Styling UI, badge sentimen, model pill
│   ├── js/app.js                # Frontend controller & visualisasi badge
│   ├── dashboard.html           # Dashboard analitik & diagram sentimen
│   ├── results.html             # Daftar hasil pemantauan & filter
│   ├── monitor.html             # Manajemen topik & kata kunci
│   └── settings.html            # Konfigurasi sistem
├── src/
│   ├── nlp_sentiment.js         # Adapter IndoBERT asinkron & fallback kamus
│   ├── sentiment.js             # Entrypoint publik modul analisis sentimen
│   ├── database.js              # Persistence data & normalisasi netral/neutral
│   ├── searcher.js              # Pipeline pencarian & batch inferensi sentimen
│   ├── scheduler.js             # Jadwal pemantauan otomatis berkala
│   └── clustering.js            # Algoritma pengelompokan berita serupa
├── sentiment_service/
│   ├── app.py                   # FastAPI REST API untuk IndoBERT
│   ├── model.py                 # PyTorch singleton wrapper & LRU cache
│   ├── benchmark.py             # Script pengujian komparatif metrik
│   ├── nlp_lexicon_reference.py # Baseline kamus leksikon
│   └── requirements.txt         # Dependensi Python
├── tests/
│   └── sentiment_tests.js       # Suite pengujian otomatis integrasi (10/10 PASS)
├── data/
│   └── database.json            # Database lokal Prisma
├── server.js                    # Web server Express & API routes
├── package.json
└── README.md
```
