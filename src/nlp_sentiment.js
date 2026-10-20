/**
 * Indonesian NLP Sentiment Analysis Engine & IndoBERT Bridge
 * PRISMA — PR Intelligence & Social Media
 *
 * Integrates state-of-the-art Transformer-based Indonesian Sentiment Analysis (IndoBERT)
 * via Python microservice, with a robust lexical rule-based fallback system.
 */

const axios = require('axios');

// ─── Environment Configuration ────────────────────────────────
function getSentimentApiUrl() {
  const rawUrl = process.env.SENTIMENT_API_URL || 'http://127.0.0.1:8000';
  return rawUrl.replace(/\/+$/, '');
}
function getSentimentTimeout() {
  return parseInt(process.env.SENTIMENT_TIMEOUT_MS || '5000', 10);
}
const DEFAULT_MODEL_NAME = 'mdhugol/indonesia-bert-sentiment-classification';

// ─── Kamus Normalisasi Slang / Singkatan Bahasa Indonesia ─────
const SLANG_DICTIONARY = {
  // Singkatan umum medsos
  'bgt': 'sangat', 'bgtt': 'sangat', 'bgtlah': 'sangat',
  'bgtu': 'begitu', 'bngt': 'sangat',
  'gak': 'tidak', 'gk': 'tidak', 'ga': 'tidak', 'nggak': 'tidak', 'kagak': 'tidak', 'g': 'tidak',
  'bkn': 'bukan', 'tdk': 'tidak', 'tak': 'tidak', 'blm': 'belum', 'lom': 'belum',
  'aja': 'saja', 'aj': 'saja', 'doang': 'hanya',
  'dgn': 'dengan', 'dg': 'dengan', 'sdh': 'sudah', 'udh': 'sudah', 'dah': 'sudah',
  'tp': 'tetapi', 'tpi': 'tetapi', 'kalo': 'kalau', 'kl': 'kalau', 'klo': 'kalau',
  'yg': 'yang', 'yng': 'yang', 'dr': 'dari', 'd': 'di', 'pd': 'pada',
  'krn': 'karena', 'krna': 'karena', 'bcoz': 'karena', 'karna': 'karena',
  'utk': 'untuk', 'untk': 'untuk', 'skrg': 'sekarang', 'skrng': 'sekarang',
  'gmn': 'bagaimana', 'gmana': 'bagaimana', 'bgmn': 'bagaimana',
  'knp': 'kenapa', 'knpa': 'kenapa',
  'sy': 'saya', 'gw': 'saya', 'gue': 'saya', 'aku': 'saya',
  'lu': 'kamu', 'lo': 'kamu', 'elu': 'kamu', 'km': 'kamu', 'kmu': 'kamu',

  // Bahasa gaul / kata emosi medsos
  'mantap': 'bagus', 'mantul': 'sangat bagus', 'keren': 'bagus', 'top': 'terbaik',
  'juara': 'terbaik', 'jos': 'bagus', 'asik': 'menyenangkan', 'asyik': 'menyenangkan',
  'kece': 'bagus', 'ciamik': 'bagus', 'oke': 'bagus', 'ok': 'bagus', 'sip': 'bagus',
  'baper': 'emosional', 'pansos': 'panjat sosial', 'nyinyir': 'mencibir',
  'zonk': 'sangat mengecewakan', 'parah': 'sangat buruk', 'anjir': 'buruk',
  'kacau': 'rusak', 'ambyar': 'hancur', 'bobrok': 'sangat buruk',
  'lebay': 'berlebihan', 'alay': 'norak', 'hoax': 'berita palsu', 'hoaks': 'berita palsu',
  'lelet': 'sangat lambat', 'lemot': 'lambat', 'lemottt': 'lambat',
  'gercep': 'cepat tanggap', 'solutif': 'memberikan solusi',
  'terbaek': 'terbaik', 'rekomen': 'rekomendasi', 'recommended': 'rekomendasi'
};

// ─── Kata Penguat (Intensifiers / Boosters) ───────────────────
const INTENSIFIERS = new Map([
  ['sangat', 1.8], ['amat', 1.6], ['sungguh', 1.5], ['benar', 1.4], ['bener', 1.4],
  ['teramat', 1.8], ['luar biasa', 2.0], ['paling', 1.8], ['terlalu', 1.5],
  ['makin', 1.3], ['semakin', 1.3], ['begitu', 1.3], ['betul', 1.4], ['mutlak', 1.7]
]);

// ─── Kata Negasi (Negation Words) ─────────────────────────────
const NEGATIONS = new Set([
  'tidak', 'bukan', 'belum', 'jangan', 'tanpa', 'kurang', 'tiada', 'nihil', 'jarang'
]);

// ─── Leksikon Sentimen Berbobot (Fallback / Baseline) ──────────
const SENTIMENT_WEIGHTS = {
  // Positif (nilai +1.0 s/d +2.5)
  'unggul': 2.0, 'prestasi': 2.0, 'membanggakan': 2.2, 'sukses': 2.0, 'berhasil': 1.8,
  'maju': 1.5, 'kemajuan': 1.6, 'berkembang': 1.4, 'hebat': 1.8, 'apresiasi': 1.8,
  'penghargaan': 1.9, 'terbaik': 2.2, 'solusi': 1.7, 'berkah': 2.0, 'amanah': 2.0,
  'mencerahkan': 1.8, 'berkemajuan': 2.0, 'peduli': 1.6, 'solidaritas': 1.7,
  'kolaborasi': 1.5, 'sinergi': 1.5, 'bantuan': 1.5, 'membantu': 1.5, 'amal': 1.8,
  'kebaikan': 1.7, 'damai': 1.8, 'sejahtera': 1.8, 'positif': 1.6, 'didukung': 1.4,
  'mendukung': 1.4, 'percaya': 1.5, 'kepercayaan': 1.6, 'bangga': 1.8, 'terpercaya': 1.9,
  'resmi': 1.1, 'berkualitas': 1.8, 'bermanfaat': 1.8, 'juara': 2.0, 'menang': 1.7,
  'puas': 1.6, 'memuaskan': 1.7, 'antusias': 1.6, 'antusiasme': 1.6, 'lulus': 1.4,
  'peningkatan': 1.5, 'meningkat': 1.4, 'tumbuh': 1.3, 'inovatif': 1.8, 'inovasi': 1.7,
  'terobosan': 1.9, 'keren': 1.5, 'bagus': 1.4, 'baik': 1.3, 'syukur': 1.7, 'bersyukur': 1.8,

  // Negatif (nilai -1.0 s/d -2.5)
  'korupsi': -2.5, 'skandal': -2.3, 'kriminal': -2.3, 'kejahatan': -2.2, 'penipuan': -2.3,
  'menipu': -2.2, 'korban': -1.8, 'tewas': -2.2, 'meninggal': -1.6, 'celaka': -1.8,
  'kecelakaan': -1.7, 'bencana': -2.0, 'banjir': -1.8, 'gempa': -1.8, 'rusak': -1.8,
  'hancur': -2.2, 'kebakaran': -1.9, 'kebohongan': -2.0, 'palsu': -2.0, 'fitnah': -2.4,
  'hoaks': -2.0, 'isu': -0.8, 'kontroversi': -1.7, 'polemik': -1.6, 'debat': -0.9,
  'kritik': -1.3, 'mengkritik': -1.4, 'kecam': -2.0, 'mengecam': -2.1, 'protes': -1.7,
  'demo': -1.5, 'demonstrasi': -1.4, 'menolak': -1.6, 'penolakan': -1.7, 'kecewa': -1.9,
  'kekecewaan': -1.9, 'marah': -1.8, 'gaduh': -1.6, 'ricuh': -2.1, 'rusuh': -2.3,
  'bentrok': -2.2, 'konflik': -1.9, 'ancaman': -1.8, 'terancam': -1.7, 'gagal': -1.8,
  'kegagalan': -1.9, 'rugi': -1.7, 'kerugian': -1.8, 'turun': -1.2, 'merosot': -1.6,
  'lambat': -1.3, 'lelet': -1.6, 'buruk': -1.7, 'jelek': -1.6, 'parah': -2.0,
  'sulit': -1.2, 'susah': -1.2, 'masalah': -1.5, 'permasalahan': -1.4, 'krisis': -2.1,
  'keluhan': -1.4, 'mengeluh': -1.5, 'diskriminasi': -2.2, 'pelecehan': -2.4
};

/**
 * Membersihkan dan menormalisasi token teks untuk sistem fallback leksikon
 */
function tokenizeAndNormalize(text) {
  if (!text) return [];

  const clean = text
    .replace(/<[^>]*>/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/@[\w.]+/g, ' ')
    .replace(/#[\w_]+/g, ' ')
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const rawTokens = clean.split(' ').filter(t => t.length > 0);

  const normalizedTokens = rawTokens.map(token => {
    const sub = token.replace(/^-+|-+$/g, '');
    return SLANG_DICTIONARY[sub] || sub;
  });

  const flattenedTokens = [];
  for (const t of normalizedTokens) {
    if (t.includes(' ')) {
      flattenedTokens.push(...t.split(' '));
    } else {
      flattenedTokens.push(t);
    }
  }

  return flattenedTokens;
}

/**
 * Analisis sentimen berbasis aturan leksikon (Fallback bila IndoBERT API tidak tersedia)
 */
function analyzeSentimentNLP(text) {
  if (!text || typeof text !== 'string' || !text.trim()) {
    return {
      label: 'netral',
      score: 0.0,
      confidence: 0.5,
      probabilities: { positif: 0.25, netral: 0.5, neutral: 0.5, negatif: 0.25 },
      model: 'lexicon-fallback',
      status: 'fallback',
      method: 'rule-based',
      hits: 0
    };
  }

  const tokens = tokenizeAndNormalize(text);
  if (tokens.length === 0) {
    return {
      label: 'netral',
      score: 0.0,
      confidence: 0.5,
      probabilities: { positif: 0.25, netral: 0.5, neutral: 0.5, negatif: 0.25 },
      model: 'lexicon-fallback',
      status: 'fallback',
      method: 'rule-based',
      hits: 0
    };
  }

  let totalScore = 0;
  let sentimentHits = 0;
  let posCount = 0;
  let negCount = 0;

  let negationActive = 0;
  let currentMultiplier = 1.0;

  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i];

    if (NEGATIONS.has(word)) {
      negationActive = 3;
      continue;
    }

    if (INTENSIFIERS.has(word)) {
      currentMultiplier = INTENSIFIERS.get(word);
      continue;
    }

    if (SENTIMENT_WEIGHTS.hasOwnProperty(word)) {
      let weight = SENTIMENT_WEIGHTS[word] * currentMultiplier;

      if (negationActive > 0) {
        weight = -weight * 0.85;
      }

      totalScore += weight;
      sentimentHits++;

      if (weight > 0) posCount++;
      if (weight < 0) negCount++;

      currentMultiplier = 1.0;
    }

    if (negationActive > 0) {
      negationActive--;
    }
  }

  let label = 'netral';
  let confidence = 0.65;
  const threshold = 0.5;

  if (totalScore > threshold) {
    label = 'positif';
    confidence = Math.min(0.95, 0.70 + Math.min(posCount * 0.06, 0.25));
  } else if (totalScore < -threshold) {
    label = 'negatif';
    confidence = Math.min(0.95, 0.70 + Math.min(negCount * 0.06, 0.25));
  } else {
    label = 'netral';
    confidence = (posCount > 0 && negCount > 0) ? 0.60 : 0.75;
  }

  // Menghitung probabilitas aproksimasi leksikon
  const posProb = label === 'positif' ? confidence : (1 - confidence) / 2;
  const negProb = label === 'negatif' ? confidence : (1 - confidence) / 2;
  const neuProb = label === 'netral' ? confidence : (1 - confidence) / 2;
  const sumProb = posProb + negProb + neuProb;

  return {
    label,
    score: parseFloat((totalScore / 5.0).toFixed(2)),
    confidence: parseFloat(confidence.toFixed(2)),
    probabilities: {
      positif: parseFloat((posProb / sumProb).toFixed(4)),
      netral: parseFloat((neuProb / sumProb).toFixed(4)),
      neutral: parseFloat((neuProb / sumProb).toFixed(4)),
      negatif: parseFloat((negProb / sumProb).toFixed(4))
    },
    model: 'lexicon-fallback',
    status: 'fallback',
    method: 'rule-based',
    hits: sentimentHits
  };
}

/**
 * Format sentimen ringkas sinkron (string: 'positif' | 'negatif' | 'netral')
 */
function analyzeSentiment(text) {
  const res = analyzeSentimentNLP(text);
  return res.label;
}

/**
 * Analisis sentimen asinkron menggunakan model IndoBERT Transformer via Python REST API
 * Dilengkapi fallback otomatis ke leksikon jika service Python tidak aktif.
 */
async function analyzeSentimentNLPAsync(text) {
  if (!text || typeof text !== 'string' || !text.trim()) {
    return analyzeSentimentNLP(text);
  }

  const apiUrl = getSentimentApiUrl();
  const timeoutMs = getSentimentTimeout();

  try {
    const res = await axios.post(`${apiUrl}/predict`, {
      text: text
    }, {
      timeout: timeoutMs,
      headers: { 'Content-Type': 'application/json' }
    });

    if (res.data && res.data.label) {
      // Normalisasi label agar konsisten
      let label = res.data.label.toLowerCase();
      if (label === 'positive') label = 'positif';
      if (label === 'negative') label = 'negatif';
      if (label === 'neutral') label = 'netral';

      return {
        label,
        score: typeof res.data.score === 'number' ? res.data.score : 0,
        confidence: typeof res.data.confidence === 'number' ? res.data.confidence : 0.5,
        probabilities: res.data.probabilities || { positif: 0, netral: 0, neutral: 0, negatif: 0 },
        model: res.data.model || DEFAULT_MODEL_NAME,
        version: res.data.version || '1.0.0',
        status: res.data.status || 'success',
        device: res.data.device || 'unknown',
        elapsed_ms: typeof res.data.elapsed_ms === 'number' ? res.data.elapsed_ms : null
      };
    }
  } catch (err) {
    // Log kegagalan koneksi/inferensi sekali tanpa memblokir aplikasi
    console.warn(`[IndoBERT Adapter] Service API di ${apiUrl} tidak dapat diakses (${err.message}). Menggunakan fallback leksikon.`);
  }

  // Fallback transparan jika API gagal
  const fallbackRes = analyzeSentimentNLP(text);
  fallbackRes.fallback_reason = 'IndoBERT service offline or timeout';
  return fallbackRes;
}

/**
 * Analisis sentimen asinkron mengembalikan string label ('positif' | 'negatif' | 'netral')
 */
async function analyzeSentimentAsync(text) {
  const res = await analyzeSentimentNLPAsync(text);
  return res.label;
}

/**
 * Batch inference untuk banyak teks sekaligus menggunakan IndoBERT
 */
async function analyzeSentimentBatchAsync(texts) {
  if (!Array.isArray(texts) || texts.length === 0) return [];

  const apiUrl = getSentimentApiUrl();
  const timeoutMs = getSentimentTimeout();

  try {
    const res = await axios.post(`${apiUrl}/predict_batch`, {
      texts: texts
    }, {
      timeout: Math.max(timeoutMs * 2, 10000),
      headers: { 'Content-Type': 'application/json' }
    });

    if (Array.isArray(res.data) && res.data.length === texts.length) {
      return res.data.map(item => {
        let label = (item.label || 'netral').toLowerCase();
        if (label === 'positive') label = 'positif';
        if (label === 'negative') label = 'negatif';
        if (label === 'neutral') label = 'netral';

        return {
          label,
          score: item.score,
          confidence: item.confidence,
          probabilities: item.probabilities,
          model: item.model || DEFAULT_MODEL_NAME,
          version: item.version || '1.0.0',
          status: item.status || 'success',
          device: item.device || 'unknown',
          elapsed_ms: typeof item.elapsed_ms === 'number' ? item.elapsed_ms : null
        };
      });
    }
  } catch (err) {
    console.warn(`[IndoBERT Batch Adapter] Batch API error (${err.message}). Menggunakan fallback leksikon.`);
  }

  // Fallback berurutan jika batch API gagal
  return texts.map(t => {
    const fb = analyzeSentimentNLP(t);
    fb.fallback_reason = 'IndoBERT batch service offline';
    return fb;
  });
}

/**
 * Cek kesehatan service IndoBERT
 */
async function checkIndoBERTHealth() {
  const apiUrl = getSentimentApiUrl();
  try {
    const res = await axios.get(`${apiUrl}/health`, { timeout: 2000 });
    return res.data;
  } catch (err) {
    return {
      status: 'offline',
      ready: false,
      error: err.message
    };
  }
}

module.exports = {
  analyzeSentiment,
  analyzeSentimentNLP,
  analyzeSentimentAsync,
  analyzeSentimentNLPAsync,
  analyzeSentimentBatchAsync,
  checkIndoBERTHealth,
  tokenizeAndNormalize,
  SLANG_DICTIONARY,
  INTENSIFIERS,
  NEGATIONS,
  SENTIMENT_WEIGHTS
};
