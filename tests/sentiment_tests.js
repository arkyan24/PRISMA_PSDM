/**
 * Automated Test Suite for Prisma Sentiment Engine
 * Verifies 3-class classification, contract integrity, fallback mechanism, and batch inference.
 */

const assert = require('assert');
const {
  analyzeSentiment,
  analyzeSentimentNLP,
  analyzeSentimentAsync,
  analyzeSentimentNLPAsync,
  analyzeSentimentBatchAsync,
  checkIndoBERTHealth,
  tokenizeAndNormalize
} = require('../src/nlp_sentiment');

async function runTests() {
  console.log('====================================================');
  console.log(' RUNNING PRISMA SENTIMENT SUITE INTEGRATION TESTS');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (e) {
      console.error(`  [FAIL] ${name}: ${e.message}`);
      failed++;
    }
  }

  async function testAsync(name, fn) {
    try {
      await fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (e) {
      console.error(`  [FAIL] ${name}: ${e.message}`);
      failed++;
    }
  }

  // ─── Test 1: Kontrak Keluaran Leksikon Fallback ───────────
  test('Fallback Contract: Struktur objek lengkap dan nilai ternormalisasi', () => {
    const res = analyzeSentimentNLP('Prestasi membanggakan diraih oleh mahasiswa.');
    assert.strictEqual(typeof res.label, 'string');
    assert.ok(['positif', 'negatif', 'netral', 'neutral'].includes(res.label));
    assert.strictEqual(typeof res.score, 'number');
    assert.strictEqual(typeof res.confidence, 'number');
    assert.ok(res.confidence >= 0 && res.confidence <= 1.0);
    assert.strictEqual(typeof res.probabilities, 'object');
    assert.strictEqual(res.model, 'lexicon-fallback');
    assert.strictEqual(res.status, 'fallback');
    
    // Probabilitas harus berada dalam rentang [0, 1]
    const p = res.probabilities;
    assert.ok(p.positif >= 0 && p.positif <= 1);
    assert.ok(p.negatif >= 0 && p.negatif <= 1);
    assert.ok(p.netral >= 0 && p.netral <= 1);
  });

  // ─── Test 2: Input Kosong / Null / Invalid ────────────────
  test('Penanganan Teks Kosong: Menghasilkan label netral tanpa error', () => {
    const res1 = analyzeSentimentNLP('');
    assert.strictEqual(res1.label, 'netral');
    assert.strictEqual(res1.score, 0);
    assert.strictEqual(res1.confidence, 0.5);

    const res2 = analyzeSentimentNLP(null);
    assert.strictEqual(res2.label, 'netral');

    const res3 = analyzeSentimentNLP('     ');
    assert.strictEqual(res3.label, 'netral');
  });

  // ─── Test 3: Kompatibilitas analyzeSentiment (String) ─────
  test('Kompatibilitas Mundur: analyzeSentiment(text) mengembalikan string label', () => {
    const lbl = analyzeSentiment('Korupsi dan kolusi sangat merusak bangsa');
    assert.strictEqual(lbl, 'negatif');
  });

  // ─── Test 4: Tokenisasi dan Slang Dictionary ──────────────
  test('Normalisasi Slang: Mengubah singkatan gaul menjadi kata standar', () => {
    const tokens = tokenizeAndNormalize('pelayanan gak bgt dan lelet parah');
    assert.ok(tokens.includes('tidak'));
    assert.ok(tokens.includes('sangat'));
    assert.ok(tokens.includes('lambat'));
  });

  // ─── Test 5: Fallback Transparan Saat API Offline ─────────
  await testAsync('Fallback Otomatis: analyzeSentimentNLPAsync bekerja mulus saat API offline', async () => {
    // Port 59999 sengaja offline untuk menguji fallback
    process.env.SENTIMENT_API_URL = 'http://127.0.0.1:59999';
    const res = await analyzeSentimentNLPAsync('Program bantuan sosial berjalan sangat sukses dan transparan.');
    assert.ok(res);
    assert.strictEqual(res.label, 'positif');
    assert.strictEqual(res.status, 'fallback');
    assert.strictEqual(res.model, 'lexicon-fallback');
    assert.ok(res.fallback_reason.includes('offline') || res.fallback_reason.includes('unavailable'));
    // Kembalikan ke URL default
    process.env.SENTIMENT_API_URL = 'http://127.0.0.1:8000';
  });

  // ─── Test 6: Batch Fallback Graceful Handling ─────────────
  await testAsync('Batch Fallback: analyzeSentimentBatchAsync menangani array saat offline', async () => {
    process.env.SENTIMENT_API_URL = 'http://127.0.0.1:59999';
    const texts = [
      'Prestasi gemilang universitas',
      'Skandal suap terbongkar',
      'Rapat kerja dijadwalkan besok'
    ];
    const results = await analyzeSentimentBatchAsync(texts);
    assert.strictEqual(results.length, 3);
    assert.strictEqual(results[0].label, 'positif');
    assert.strictEqual(results[1].label, 'negatif');
    assert.strictEqual(results[2].label, 'netral');
    process.env.SENTIMENT_API_URL = 'http://127.0.0.1:8000';
  });

  // ─── Test 7: Cek Status Kesehatan Layanan ─────────────────
  await testAsync('Health Check Adapter: Melaporkan status offline/online dengan benar', async () => {
    process.env.SENTIMENT_API_URL = 'http://127.0.0.1:59999';
    const healthOffline = await checkIndoBERTHealth();
    assert.strictEqual(healthOffline.status, 'offline');
    assert.strictEqual(healthOffline.ready, false);

    // Sekarang uji endpoint nyata di port 8000
    process.env.SENTIMENT_API_URL = 'http://127.0.0.1:8000';
    const healthOnline = await checkIndoBERTHealth();
    if (healthOnline.status === 'offline') {
      console.log('         [INFO] Port 8000 offline -> fallback mode terverifikasi aktif.');
      assert.strictEqual(healthOnline.ready, false);
    } else {
      assert.strictEqual(healthOnline.status, 'healthy');
      assert.strictEqual(healthOnline.ready, true);
      assert.ok(healthOnline.model.includes('indonesia-bert-sentiment-classification'));
    }
  });

  // ─── Test 8: IndoBERT Single Prediction / Fallback ──────────
  await testAsync('IndoBERT Single Inference: Prediksi teks nyata dengan probabilitas valid', async () => {
    process.env.SENTIMENT_API_URL = 'http://127.0.0.1:8000';
    const text = 'Alhamdulillah program riset mahasiswa Muhammadiyah berhasil meraih prestasi terbaik di kompetisi internasional.';
    const res = await analyzeSentimentNLPAsync(text);
    
    assert.strictEqual(res.label, 'positif');
    assert.ok(res.confidence > 0.5, 'Keyakinan harus > 0.5');

    // Cek konsistensi probabilitas
    const p = res.probabilities;
    assert.ok(p.positif > p.negatif, 'Probabilitas positif harus lebih tinggi dari negatif');
    assert.ok(p.positif > 0.4, 'Probabilitas positif harus dominan');
    console.log(`         Hasil -> Model: ${res.model}, Label: ${res.label}, Conf: ${(res.confidence * 100).toFixed(1)}%`);
  });

  // ─── Test 9: IndoBERT Batch Prediction / Fallback ───────────
  await testAsync('IndoBERT Batch Inference: Memproses multi-teks secara efisien', async () => {
    process.env.SENTIMENT_API_URL = 'http://127.0.0.1:8000';
    const batchTexts = [
      'Peningkatan kualitas pendidikan dan beasiswa disambut sangat antusias oleh para santri.',
      'Kasus korupsi dana hibah sangat merugikan dan mengecewakan seluruh elemen masyarakat.',
      'Rapat pleno pengurus wilayah dijadwalkan berlangsung hari Sabtu mendatang di aula.'
    ];

    const results = await analyzeSentimentBatchAsync(batchTexts);
    assert.strictEqual(results.length, 3);
    assert.strictEqual(results[0].label, 'positif');
    assert.strictEqual(results[1].label, 'negatif');
    assert.strictEqual(results[2].label, 'netral');
  });

  // ─── Test 10: Uji Negasi & Konteks Kompleks ───────────────
  await testAsync('Contextual Negation: Penanganan negasi "tidak buruk"', async () => {
    process.env.SENTIMENT_API_URL = 'http://127.0.0.1:8000';
    const res = await analyzeSentimentNLPAsync('Performa kerja panitia sebetulnya tidak buruk sama sekali.');
    assert.ok(['positif', 'netral'].includes(res.label), 'Kalimat "tidak buruk" harus diprediksi positif atau netral');
  });

  console.log('\n====================================================');
  console.log(` TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
