# PRISMA IndoBERT Sentiment Service

Layanan REST API microservice berbasis **Python, FastAPI, PyTorch, dan Hugging Face Transformers** untuk analisis sentimen Bahasa Indonesia berkualitas tinggi pada sistem pemantauan opini publik dan PRISMA (PR Intelligence & Social Media).

---

## 1. Arsitektur & Model Machine Learning

- **Model Utama**: [`mdhugol/indonesia-bert-sentiment-classification`](https://huggingface.co/mdhugol/indonesia-bert-sentiment-classification)
- **Model Dasar**: IndoBenchmark IndoBERT-base-p1 (`indobenchmark/indobert-base-p1`)
- **Dataset Fine-Tuning**: IndoNLU SmSA (Indonesian Sentiment Analysis Dataset)
- **Klasifikasi 3 Kelas**:
  - `LABEL_0` $\rightarrow$ `positif`
  - `LABEL_1` $\rightarrow$ `netral`
  - `LABEL_2` $\rightarrow$ `negatif`
- **Output Kontrak**:
  - `label`: `"positif"` | `"negatif"` | `"netral"`
  - `confidence`: Probabilitas tertinggi dari distribusi Softmax ($0.0 - 1.0$)
  - `score`: Nilai skalar polaritas bertanda: $P(\text{positif}) - P(\text{negatif}) \in [-1.0, 1.0]$
  - `probabilities`: Distribusi probabilitas Softmax untuk semua kelas (`positif`, `netral`, `neutral`, `negatif`)
  - `model`: Identitas model aktual yang digunakan
  - `status`: `"success"` | `"empty_input"` | `"error"`

---

## 2. Struktur Direktori

```text
sentiment_service/
├── app.py                      # FastAPI server & route handlers (/predict, /predict_batch, /health)
├── model.py                    # Singleton classifier wrapper, LRU cache, batching, PyTorch inference
├── nlp_lexicon_reference.py     # Engine referensi kamus lama (untuk baseline pengujian akurasi)
├── benchmark.py                # Skrip evaluasi komparasi akurasi IndoBERT vs Kamus Leksikon
├── requirements.txt            # Dependensi Python
└── README.md                   # Dokumentasi teknis layanan
```

---

## 3. Instalasi & Menjalankan Layanan

### Prasyarat
- Python 3.10+ (disarankan Python 3.10 - 3.12)
- Koneksi internet pada pemuatan awal untuk mengunduh bobot model dari Hugging Face (~497 MB, otomatis disimpan di cache lokal)

### Langkah-Langkah:
```powershell
# 1. Masuk ke folder service
cd "d:\MAGANG PSDM\sentiment_service"

# 2. Buat Python Virtual Environment (jika belum ada)
python -m venv .venv

# 3. Aktifkan Virtual Environment
.\.venv\Scripts\Activate.ps1
# (atau source .venv/bin/activate untuk Linux/macOS)

# 4. Install dependensi
pip install -r requirements.txt

# 5. Jalankan Service FastAPI
python app.py
```
Service akan berjalan secara default di `http://127.0.0.1:8000`.

---

## 4. Endpoint API

### `GET /health`
Mengecek status kesiapan model dan informasi runtime.
```json
{
  "status": "healthy",
  "ready": true,
  "model": "mdhugol/indonesia-bert-sentiment-classification",
  "version": "1.0.0",
  "device": "cpu"
}
```

### `POST /predict`
Inferensi teks tunggal:
```bash
curl -X POST http://127.0.0.1:8000/predict \
  -H "Content-Type: application/json" \
  -d '{"text": "Program beasiswa ini sangat membantu mahasiswa kurang mampu."}'
```
Response:
```json
{
  "label": "positif",
  "score": 0.9412,
  "confidence": 0.9458,
  "probabilities": {
    "positif": 0.9458,
    "netral": 0.0496,
    "neutral": 0.0496,
    "negatif": 0.0046
  },
  "model": "mdhugol/indonesia-bert-sentiment-classification",
  "version": "1.0.0",
  "status": "success",
  "device": "cpu",
  "elapsed_ms": 34.2
}
```

### `POST /predict_batch`
Inferensi banyak teks secara efisien dalam satu forward pass PyTorch:
```bash
curl -X POST http://127.0.0.1:8000/predict_batch \
  -H "Content-Type: application/json" \
  -d '{"texts": ["Pelayanan sangat memuaskan", "Sistem sering bermasalah", "Rapat dimulai jam 9"]}'
```

---

## 5. Menjalankan Pengujian & Benchmark

Untuk menguji performa klasifikasi IndoBERT melawan kamus leksikon sebelumnya:

```powershell
.\.venv\Scripts\python.exe sentiment_service\benchmark.py
```

Skrip ini akan mengevaluasi 31 dataset uji Bahasa Indonesia dalam 8 skenario linguistik (negasi kompleks, kritik kebijakan, fakta berita netral, sarkasme, slang, dll.) dan menampilkan tabel metrik:
- **Akurasi keseluruhan**
- **Precision, Recall, dan F1-Score per kelas**
- **Macro F1-Score**
- **Confusion Matrix**
- **Rata-rata waktu inferensi per sampel**
