/**
 * Content Clustering & Deduplication Engine
 * Detects near-duplicate or similar news/posts discussing the same event.
 * Groups them into clusters, designates a primary representative article,
 * and boosts engagement for stories covered by multiple media outlets.
 */

// Stopwords Bahasa Indonesia yang diabaikan saat membandingkan kesamaan konten
const INDONESIAN_STOPWORDS = new Set([
  'yang', 'di', 'ke', 'dari', 'pada', 'dalam', 'untuk', 'dengan', 'dan', 'atau',
  'ini', 'itu', 'adalah', 'yaitu', 'yakni', 'sebagai', 'oleh', 'karena', 'maka',
  'telah', 'sudah', 'sedang', 'akan', 'bisa', 'dapat', 'harus', 'ada', 'tidak',
  'juga', 'hanya', 'antara', 'para', 'namun', 'tetapi', 'seperti', 'terhadap',
  'tentang', 'atas', 'bawah', 'secara', 'hingga', 'sampai', 'saat', 'ketika',
  'lalu', 'kemudian', 'bila', 'jika', 'agar', 'supaya', 'masih', 'serta', 'pun',
  'bukan', 'facebook', 'twitter', 'instagram', 'com', 'id', 'net', 'co'
]);

/**
 * Ekstraksi token kata bermakna (keywords) dari judul dan snippet
 */
function extractFeatureTokens(text) {
  if (!text) return [];
  const clean = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = clean.split(' ').filter(w => w.length > 2 && !INDONESIAN_STOPWORDS.has(w));
  return words;
}

/**
 * Menghasilkan set n-gram (bi-gram) untuk mendeteksi kesamaan frasa spesifik
 */
function getBigrams(tokens) {
  const bigrams = new Set();
  for (let i = 0; i < tokens.length - 1; i++) {
    bigrams.add(`${tokens[i]}_${tokens[i + 1]}`);
  }
  return bigrams;
}

/**
 * Menghitung skor kemiripan (0.0 - 1.0) antara 2 artikel
 * Menggabungkan Jaccard word token similarity dan bigram phrase similarity
 */
function calculateSimilarity(itemA, itemB) {
  // Jika link sama persis
  if (itemA.link && itemB.link && itemA.link === itemB.link) return 1.0;

  // Fokus utama perbandingan ada pada judul (75%) dan snippet (25%)
  const tokensA = extractFeatureTokens(itemA.title);
  const tokensB = extractFeatureTokens(itemB.title);

  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);

  // 1. Jaccard Word Similarity
  let intersectionWord = 0;
  for (const t of setA) {
    if (setB.has(t)) intersectionWord++;
  }
  const unionWord = new Set([...tokensA, ...tokensB]).size;
  const wordSim = unionWord > 0 ? (intersectionWord / unionWord) : 0;

  // 2. Bigram Phrase Similarity (frasa berurutan)
  const bigramsA = getBigrams(tokensA);
  const bigramsB = getBigrams(tokensB);
  let intersectionBigram = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersectionBigram++;
  }
  const unionBigram = new Set([...bigramsA, ...bigramsB]).size;
  const bigramSim = unionBigram > 0 ? (intersectionBigram / unionBigram) : 0;

  // Gabungkan skor berbobot
  const titleSimilarity = (wordSim * 0.6) + (bigramSim * 0.4);

  // Periksa overlap kata penting jika judul panjang
  const minMatch = Math.min(tokensA.length, tokensB.length);
  if (minMatch >= 4 && (intersectionWord / minMatch) >= 0.65) {
    return Math.max(titleSimilarity, 0.68);
  }

  return titleSimilarity;
}

/**
 * Mengelompokkan daftar artikel ke dalam klaster serupa dan menentukan berita utama
 * @param {Array<Object>} results - Daftar artikel dari database
 * @param {number} threshold - Batas kemiripan (default 0.40)
 * @returns {Array<Object>} Daftar artikel yang sudah diperkaya dengan cluster_id, is_representative, similar_articles, dan engagement boost
 */
function clusterAndDeduplicate(results, threshold = 0.40) {
  if (!Array.isArray(results) || results.length === 0) return [];

  const items = results.map(r => ({ ...r }));
  const visited = new Set();
  const clusters = [];

  for (let i = 0; i < items.length; i++) {
    if (visited.has(i)) continue;

    const currentCluster = [items[i]];
    visited.add(i);

    for (let j = i + 1; j < items.length; j++) {
      if (visited.has(j)) continue;

      const sim = calculateSimilarity(items[i], items[j]);
      if (sim >= threshold) {
        currentCluster.push(items[j]);
        visited.add(j);
      }
    }

    clusters.push(currentCluster);
  }

  // Proses masing-masing klaster
  const processedResults = [];

  clusters.forEach((cluster, clusterIndex) => {
    const clusterId = `cluster_${clusterIndex + 1}`;

    // Pilih artikel representatif terbaik (yang snippet-nya paling lengkap atau tanggal paling awal)
    cluster.sort((a, b) => {
      const lenA = (a.snippet || '').length + (a.title || '').length;
      const lenB = (b.snippet || '').length + (b.title || '').length;
      return lenB - lenA;
    });

    const primary = cluster[0];
    const similarVariants = cluster.slice(1);

    // Informasi deduplikasi dan klaster artikel representatif
    primary.cluster_id = clusterId;
    primary.is_representative = true;
    primary.similar_sources_count = similarVariants.length;
    primary.similar_articles = similarVariants.map(v => ({
      id: v.id,
      title: v.title,
      link: v.link,
      platform: v.platform,
      display_link: v.display_link,
      scanned_at: v.scanned_at
    }));

    processedResults.push(primary);

    // Tandai varian lainnya sebagai non-representatif
    similarVariants.forEach(variant => {
      variant.cluster_id = clusterId;
      variant.is_representative = false;
      variant.similar_sources_count = 0;
      variant.parent_id = primary.id;
      processedResults.push(variant);
    });
  });

  return processedResults;
}

module.exports = {
  calculateSimilarity,
  clusterAndDeduplicate,
  extractFeatureTokens
};
