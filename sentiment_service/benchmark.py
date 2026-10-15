"""
Prisma Sentiment Analysis Benchmark & Evaluation Suite
Compares IndoBERT Transformer Model against Baseline Lexicon Rule Engine.

Evaluates on challenging Indonesian sentences across:
- Positive sentences
- Negative sentences
- Neutral / factual reports
- Complex negations ("tidak buruk", "bukan berarti gagal", etc.)
- Policy criticism vs praise
- Mixed opinions & sarcasm
- Public issues / political news
"""

import time
import json
from typing import List, Dict, Any
from sklearn.metrics import accuracy_score, precision_recall_fscore_support, confusion_matrix

from model import IndoBERTSentimentClassifier

# Comprehensive benchmark dataset with ground truth labels: 'positif', 'negatif', 'netral'
BENCHMARK_DATASET = [
    # ── 1. Positif Jelas ──────────────────────────────
    {"text": "Prestasi luar biasa diraih oleh tim robotik universitas yang berhasil memenangkan kejuaraan dunia.", "expected": "positif", "category": "Positif Standar"},
    {"text": "Pemerintah memberikan beasiswa penuh untuk mahasiswa berprestasi dari keluarga prasejahtera.", "expected": "positif", "category": "Positif Kebijakan"},
    {"text": "Pelayanan di rumah sakit ini sangat memuaskan, ramah, dan cepat tanggap.", "expected": "positif", "category": "Positif Layanan"},
    {"text": "Program pemberdayaan UMKM Muhammadiyah dinilai sangat solutif dan membawa kemajuan ekonomi umat.", "expected": "positif", "category": "Positif Isu Publik"},
    {"text": "Alhamdulillah fasilitas publik baru ini sangat bagus, bersih, dan nyaman digunakan.", "expected": "positif", "category": "Positif Fasilitas"},

    # ── 2. Negatif Jelas ──────────────────────────────
    {"text": "Skandal korupsi proyek infrastruktur tersebut sangat merugikan rakyat dan mencoreng integritas lembaga.", "expected": "negatif", "category": "Negatif Korupsi"},
    {"text": "Pelayanan publik di kantor ini sangat lambat, mengecewakan, dan petugasnya tidak ramah.", "expected": "negatif", "category": "Negatif Layanan"},
    {"text": "Warga mengecam keras pembuangan limbah beracun yang merusak ekosistem sungai.", "expected": "negatif", "category": "Negatif Lingkungan"},
    {"text": "Kebijakan tersebut dinilai sangat bobrok, tidak solutif, dan justru menyengsarakan masyarakat kecil.", "expected": "negatif", "category": "Negatif Kritik"},
    {"text": "Terjadi kecurangan masif dalam seleksi penerimaan pegawai baru yang memicu kemarahan publik.", "expected": "negatif", "category": "Negatif Skandal"},

    # ── 3. Netral / Fakta Objektif Tanpa Opini ────────
    {"text": "Rapat kerja tahunan organisasi akan diselenggarakan pada hari Sabtu di gedung pertemuan utama.", "expected": "netral", "category": "Netral Pengumuman"},
    {"text": "Badan Meteorologi memprediksi hujan dengan intensitas sedang hingga lebat di wilayah pesisir.", "expected": "netral", "category": "Netral Cuaca"},
    {"text": "Menteri Keuangan menandatangani nota kesepahaman bilateral mengenai pertukaran informasi perpajakan.", "expected": "netral", "category": "Netral Berita Resmi"},
    {"text": "Sidang lanjutan kasus tersebut dijadwalkan kembali pekan depan dengan agenda mendengarkan saksi ahli.", "expected": "netral", "category": "Netral Berita Hukum"},
    {"text": "Pemerintah kota mengumumkan jadwal rekayasa lalu lintas selama perbaikan jalan berlangsung.", "expected": "netral", "category": "Netral Informasi Publik"},

    # ── 4. Negasi Kompleks (Ujian Utama Context-Awareness) ──
    {"text": "Hasil kerja tim selama tiga bulan terakhir ini sebetulnya tidak buruk sama sekali.", "expected": "positif", "category": "Negasi Positif (tidak buruk)"},
    {"text": "Kritik publik bukan berarti seluruh program pemerintah ini telah gagal.", "expected": "positif", "category": "Negasi Kompleks (bukan berarti gagal)"},
    {"text": "Saya tidak mengatakan bahwa kebijakan baru ini berhasil mencapai target yang diinginkan.", "expected": "netral", "category": "Negasi Ambigu"},
    {"text": "Proyek tersebut tidak hanya gagal, tetapi juga sangat merugikan keuangan daerah.", "expected": "negatif", "category": "Negasi Penguat (tidak hanya gagal)"},
    {"text": "Laporan keuangan menunjukkan bahwa perusahaan tidak mengalami kerugian seperti yang diisukan.", "expected": "positif", "category": "Negasi Faktual (tidak rugi)"},

    # ── 5. Berita Kejadian Negatif Faktual (Non-Opini) ──
    {"text": "Banjir melanda tiga kecamatan akibat luapan sungai setelah hujan deras selama lima jam.", "expected": "netral", "category": "Fakta Kejadian Negatif"},
    {"text": "Kecelakaan beruntun melibatkan tiga kendaraan di tol Cipularang, polisi masih melakukan evakuasi.", "expected": "netral", "category": "Fakta Bencana/Kecelakaan"},
    {"text": "Gempa berkekuatan 5,2 magnitudo mengguncang wilayah pesisir barat tanpa potensi tsunami.", "expected": "netral", "category": "Fakta Gempa"},

    # ── 6. Kritik Kebijakan & Isu Publik ──────────────
    {"text": "Masyarakat menuntut transparansi alokasi anggaran dan meminta audit independen segera dilakukan.", "expected": "negatif", "category": "Kritik Kebijakan"},
    {"text": "Pengamat menilai regulasi ketenagakerjaan yang baru belum menjawab kebutuhan perlindungan buruh.", "expected": "negatif", "category": "Kritik Regulasi"},
    {"text": "Dialog antara warga dan perwakilan dinas terkait berjalan kondusif serta menghasilkan kesepakatan damai.", "expected": "positif", "category": "Resolusi Isu Publik"},

    # ── 7. Sarkasme & Bahasa Gaul Medsos ──────────────
    {"text": "Hebat sekali ya, jalan baru diaspal dua minggu lalu sekarang sudah bolong-bolong lagi.", "expected": "negatif", "category": "Sarkasme Halus"},
    {"text": "Wah mantul bgt dah pelayanannya gercep parah, baru semenit transfer barang lgsg dikirim!", "expected": "positif", "category": "Slang Medsos Positif"},
    {"text": "Zonk parah beli di toko ini, barangnya lelet bgt datengnya dan pas dicek barangnya rusak.", "expected": "negatif", "category": "Slang Medsos Negatif"},

    # ── 8. Kalimat Panjang & Campuran ─────────────────
    {"text": "Meskipun sempat menghadapi berbagai kendala regulasi dan tantangan ekonomi global yang cukup berat, perusahaan berhasil mencatatkan rekor laba tertinggi dalam sejarahnya.", "expected": "positif", "category": "Kalimat Campuran (Akhir Positif)"},
    {"text": "Awalnya acara peresmian berlangsung sangat megah dan penuh antusiasme, namun berakhir ricuh karena panitia tidak siap mengantisipasi lonjakan massa.", "expected": "negatif", "category": "Kalimat Campuran (Akhir Negatif)"}
]


def run_lexicon_baseline(text: str) -> str:
    """
    Simulates the original Node.js lexicon rule-based sentiment classification
    for exact apples-to-apples comparison on the exact same dataset.
    """
    from nlp_lexicon_reference import analyze_sentiment_lexicon
    return analyze_sentiment_lexicon(text)


def evaluate_system():
    print("=" * 70)
    print(" PRISMA NLP SENTIMENT EVALUATION BENCHMARK")
    print(" Comparing IndoBERT Transformer vs. Lexicon Baseline")
    print("=" * 70)
    print(f"Total Test Cases: {len(BENCHMARK_DATASET)}\n")

    # 1. Initialize IndoBERT
    start_init = time.time()
    classifier = IndoBERTSentimentClassifier.get_instance()
    init_duration = time.time() - start_init
    print(f"IndoBERT Loaded ({classifier.device}) in {init_duration:.2f}s\n")

    # 2. Run IndoBERT Inference
    indobert_preds = []
    indobert_times = []
    lexicon_preds = []
    ground_truths = [item["expected"] for item in BENCHMARK_DATASET]

    print("Running evaluations...")
    for idx, sample in enumerate(BENCHMARK_DATASET):
        text = sample["text"]

        # IndoBERT
        t0 = time.time()
        res_indobert = classifier.predict(text)
        t_el = (time.time() - t0) * 1000
        indobert_times.append(t_el)
        indobert_preds.append(res_indobert["label"])

        # Lexicon Baseline
        res_lex = run_lexicon_baseline(text)
        lexicon_preds.append(res_lex)

    classes = ["positif", "netral", "negatif"]

    # 3. Compute Metrics for Lexicon
    acc_lex = accuracy_score(ground_truths, lexicon_preds)
    p_lex, r_lex, f1_lex, _ = precision_recall_fscore_support(ground_truths, lexicon_preds, labels=classes, zero_division=0)
    macro_f1_lex = sum(f1_lex) / len(f1_lex)
    cm_lex = confusion_matrix(ground_truths, lexicon_preds, labels=classes)

    # 4. Compute Metrics for IndoBERT
    acc_bert = accuracy_score(ground_truths, indobert_preds)
    p_bert, r_bert, f1_bert, _ = precision_recall_fscore_support(ground_truths, indobert_preds, labels=classes, zero_division=0)
    macro_f1_bert = sum(f1_bert) / len(f1_bert)
    cm_bert = confusion_matrix(ground_truths, indobert_preds, labels=classes)

    avg_indobert_time = sum(indobert_times) / len(indobert_times)

    # 5. Display Comparison Results
    print("\n" + "=" * 70)
    print(" BENCHMARK RESULTS SUMMARY")
    print("=" * 70)
    print(f"{'Metric':<25} | {'Lexicon (Lama)':<18} | {'IndoBERT (Baru)':<18}")
    print("-" * 70)
    print(f"{'Overall Accuracy':<25} | {acc_lex * 100:>16.1f}% | {acc_bert * 100:>16.1f}%")
    print(f"{'Macro F1-Score':<25} | {macro_f1_lex:>17.4f} | {macro_f1_bert:>17.4f}")
    print(f"{'Precision (Positif)':<25} | {p_lex[0]:>17.4f} | {p_bert[0]:>17.4f}")
    print(f"{'Recall (Positif)':<25} | {r_lex[0]:>17.4f} | {r_bert[0]:>17.4f}")
    print(f"{'F1-Score (Positif)':<25} | {f1_lex[0]:>17.4f} | {f1_bert[0]:>17.4f}")
    print(f"{'Precision (Netral)':<25} | {p_lex[1]:>17.4f} | {p_bert[1]:>17.4f}")
    print(f"{'Recall (Netral)':<25} | {r_lex[1]:>17.4f} | {r_bert[1]:>17.4f}")
    print(f"{'F1-Score (Netral)':<25} | {f1_lex[1]:>17.4f} | {f1_bert[1]:>17.4f}")
    print(f"{'Precision (Negatif)':<25} | {p_lex[2]:>17.4f} | {p_bert[2]:>17.4f}")
    print(f"{'Recall (Negatif)':<25} | {r_lex[2]:>17.4f} | {r_bert[2]:>17.4f}")
    print(f"{'F1-Score (Negatif)':<25} | {f1_lex[2]:>17.4f} | {f1_bert[2]:>17.4f}")
    print(f"{'Avg Inference Time':<25} | {'< 1.0 ms':>17} | {f'{avg_indobert_time:.1f} ms':>17}")
    print("-" * 70)

    print("\nConfusion Matrix — IndoBERT (Rows: True, Cols: Pred [Pos, Neu, Neg]):")
    print(cm_bert)

    print("\nConfusion Matrix — Lexicon Baseline:")
    print(cm_lex)

    # 6. Detailed Error Analysis
    print("\n" + "=" * 70)
    print(" SAMPLE-BY-SAMPLE QUALITATIVE COMPARISON")
    print("=" * 70)
    for idx, sample in enumerate(BENCHMARK_DATASET):
        gt = sample["expected"]
        pb = indobert_preds[idx]
        pl = lexicon_preds[idx]
        mark_b = "[OK]" if pb == gt else "[X]"
        mark_l = "[OK]" if pl == gt else "[X]"
        print(f"[{idx+1:02d}] {sample['category']}")
        print(f"     Teks: \"{sample['text']}\"")
        print(f"     Ground Truth: {gt.upper()} | IndoBERT: {pb.upper()} {mark_b} | Lexicon: {pl.upper()} {mark_l}")
        print()

    # Save results as JSON artifact for auditability
    benchmark_output = {
        "dataset_size": len(BENCHMARK_DATASET),
        "device": str(classifier.device),
        "model": classifier.model_name,
        "lexicon": {
            "accuracy": round(float(acc_lex), 4),
            "macro_f1": round(float(macro_f1_lex), 4),
            "precision": [round(float(x), 4) for x in p_lex],
            "recall": [round(float(x), 4) for x in r_lex],
            "f1": [round(float(x), 4) for x in f1_lex],
            "confusion_matrix": cm_lex.tolist()
        },
        "indobert": {
            "accuracy": round(float(acc_bert), 4),
            "macro_f1": round(float(macro_f1_bert), 4),
            "precision": [round(float(x), 4) for x in p_bert],
            "recall": [round(float(x), 4) for x in r_bert],
            "f1": [round(float(x), 4) for x in f1_bert],
            "confusion_matrix": cm_bert.tolist(),
            "avg_inference_ms": round(float(avg_indobert_time), 2)
        }
    }

    with open("benchmark_results.json", "w", encoding="utf-8") as f:
        json.dump(benchmark_output, f, indent=2)

    print("Benchmark complete. Results saved to benchmark_results.json")


if __name__ == "__main__":
    evaluate_system()
