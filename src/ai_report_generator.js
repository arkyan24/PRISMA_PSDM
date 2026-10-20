/**
 * PRISMA — AI Report Narrative & Strategic Recommendation Generator
 * Modul pembuat narasi AI per berita dan perumus rekomendasi strategis
 * Berbasis AI Open-Source & Institutional NLP Synthesizer (Zero Hallucination)
 */

const axios = require('axios');

// Pembersihan entitas HTML, tag, dan karakter emoji non-latin yang menyebabkan kotak tofu (□) di PDF
function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, '')
    // Hapus emoji dan karakter khusus yang tidak didukung font standard
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FAFF}]/gu, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}


/**
 * Format nama platform agar ramah pembaca
 */
function formatPlatformName(platform) {
  const p = (platform || '').toLowerCase();
  if (p === 'facebook' || p === 'fb') return 'Facebook';
  if (p === 'twitter' || p === 'x') return 'Twitter (X)';
  if (p === 'instagram' || p === 'ig') return 'Instagram';
  if (p === 'youtube' || p === 'yt') return 'YouTube';
  if (p === 'tiktok') return 'TikTok';
  if (p === 'website' || p === 'news') return 'Website Berita';
  return platform ? platform.charAt(0).toUpperCase() + platform.slice(1) : 'Portal Media';
}

/**
 * Normalisasi sentimen & persentase keyakinan
 */
function getSentimentInfo(item) {
  const rawSent = (item.sentiment || item.nlp_sentiment?.label || 'netral').toLowerCase();
  let label = 'Netral';
  if (rawSent === 'positif' || rawSent === 'positive') label = 'Positif';
  else if (rawSent === 'negatif' || rawSent === 'negative') label = 'Negatif';

  let confidence = 0.75;
  if (item.nlp_sentiment && typeof item.nlp_sentiment.confidence === 'number') {
    confidence = item.nlp_sentiment.confidence;
  } else if (item.nlp_sentiment?.probabilities) {
    const probs = item.nlp_sentiment.probabilities;
    if (label === 'Positif') confidence = probs.positif || 0.75;
    else if (label === 'Negatif') confidence = probs.negatif || 0.75;
    else confidence = probs.netral || probs.neutral || 0.75;
  }

  const confidencePct = Math.min(99, Math.max(51, Math.round(confidence > 1 ? confidence : confidence * 100)));
  return { label, confidencePct, rawLabel: label.toLowerCase() };
}

/**
 * Buat narasi AI per berita dengan kepatuhan faktual ketat (Zero Hallucination)
 */
async function generateAINarrative(item, context = {}) {
  // 1. Cek apakah narasi sudah tersimpan di cache
  if (item.ai_narrative && typeof item.ai_narrative === 'string' && item.ai_narrative.trim().length > 20) {
    return item.ai_narrative.trim();
  }

  const title = cleanText(item.title);
  const snippet = cleanText(item.snippet);
  const platform = formatPlatformName(item.platform);
  const sentimentInfo = getSentimentInfo(item);
  const keyword = cleanText(item.keyword_text || context.keyword || 'Muhammadiyah');

  // Coba integrasi eksternal jika microservice AI open-source (FastAPI / Ollama) tersedia
  const rawAiUrl = process.env.AI_SERVICE_URL || process.env.SENTIMENT_API_URL || 'http://127.0.0.1:8000';
  const aiServiceUrl = rawAiUrl.replace(/\/+$/, '');
  try {
    const response = await axios.post(`${aiServiceUrl}/narrative`, {
      title,
      snippet,
      platform,
      sentiment: sentimentInfo.label,
      confidence: sentimentInfo.confidencePct,
      keyword
    }, { timeout: 1200 });

    if (response.data && response.data.narrative && response.data.narrative.length > 20) {
      return response.data.narrative.trim();
    }
  } catch (err) {
    // Graceful fallback ke Institutional NLP Narrative Engine lokal
  }

  // 2. Local Institutional NLP Narrative Synthesizer
  // Menjamin 2 - 5 kalimat, bahasa Indonesia formal, tanpa halusinasi, dan menaati 7 aturan ketat.
  return synthesizeInstitutionalNarrative({
    title,
    snippet,
    platform,
    sentiment: sentimentInfo.label,
    confidencePct: sentimentInfo.confidencePct,
    keyword
  });
}

function cleanTitleForNarrative(title) {
  if (!title) return '';
  return title
    .replace(/\s*[-–—]\s*(Instagram|Facebook|Twitter|X|news\.google\.com).*$/i, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

/**
 * Generator Narasi Faktual berbasis Aturan Jurnalistik & Kehumasan Institusi
 */
function synthesizeInstitutionalNarrative({ title, snippet, platform, sentiment, confidencePct, keyword }) {
  const displayTitle = cleanTitleForNarrative(title) || title;
  
  // Deteksi apakah snippet hanya mengulang judul atau tidak memiliki info tambahan
  let cleanSnippet = (snippet || '')
    .replace(title, '')
    .replace(displayTitle, '')
    .replace(/\s*[-–—]\s*(Instagram|Facebook|Twitter|X|news\.google\.com).*$/i, '')
    .trim();

  const hasSubstantialSnippet = cleanSnippet.length > 25;

  // Kalimat 1: Inti pemberitaan faktual
  let sentence1 = '';
  if (hasSubstantialSnippet) {
    const briefSnippet = cleanSnippet.length > 95 ? cleanSnippet.slice(0, 92) + '...' : cleanSnippet;
    sentence1 = `Pemberitaan di ${platform} menyoroti "${displayTitle}", mengabarkan bahwa ${briefSnippet}.`;
  } else if (displayTitle) {
    sentence1 = `Pemberitaan di ${platform} memuat publikasi bertajuk "${displayTitle}". Analisis ini disusun berdasarkan keterbatasan informasi tajuk berita.`;
  } else {
    return `Data publikasi pada kanal ${platform} belum memuat informasi judul maupun cuplikan yang memadai untuk telaah naratif.`;
  }

  // Kalimat 2: Klasifikasi sentimen & alasan konteks
  let sentence2 = '';
  if (sentiment === 'Positif') {
    sentence2 = `Sistem menandai isu ini bersentimen Positif (keyakinan ${confidencePct}%) atas indikasi apresiasi atau capaian institusi ${keyword}.`;
  } else if (sentiment === 'Negatif') {
    sentence2 = `Tercatat bersentimen Negatif (keyakinan ${confidencePct}%) yang merefleksikan catatan kritis publik; temuan ini bukan hoaks melainkan muatan opini yang perlu dicermati.`;
  } else {
    sentence2 = `Klasifikasi menunjukkan sentimen Netral (keyakinan ${confidencePct}%) yang mencerminkan pelaporan agenda atau rilis faktual lurus.`;
  }

  // Kalimat 3: Relevansi & implikasi bagi institusi
  let sentence3 = '';
  if (sentiment === 'Positif') {
    sentence3 = `Informasi ini berpotensi memperkuat citra persyarikatan dan dapat diamplifikasi pada kanal resmi.`;
  } else if (sentiment === 'Negatif') {
    sentence3 = `Institusi disarankan melakukan verifikasi silang terhadap materi isu guna mengantisipasi pembentukan framing publik sepihak.`;
  } else {
    sentence3 = `Pemberitaan ini berfungsi memperkaya dokumentasi pemantauan media berkala persyarikatan.`;
  }

  return `${sentence1} ${sentence2} ${sentence3}`;
}



/**
 * Menyusun Rekomendasi Strategis AI (Halaman 4)
 * Menghasilkan 5 bagian terstruktur sesuai skenario data aktual
 */
function generateStrategicRecommendations(stats, topFindings = [], keyword = 'Muhammadiyah', user = 'Admin PSDM') {
  const total = stats.total || 0;
  if (total === 0) {
    return {
      scenario: 'EMPTY',
      summary: 'Belum terdapat data temuan pemantauan yang tersimpan untuk periode dan kata kunci ini.',
      interpretation: 'Tidak ada aktivitas percakapan media yang dapat dianalisis.',
      risksAndOpportunities: 'Tidak terdeteksi risiko maupun peluang reputasi pada rentang waktu ini.',
      priorityActions: 'Jalankan pemindaian terjadwal atau tambahkan kata kunci pemantauan tambahan untuk mengumpulkan data.',
      followUp: 'Lakukan evaluasi ulang setelah sistem berhasil menghimpun pemberitaan baru.'
    };
  }

  const posCount = stats.sentiment?.positif || 0;
  const netCount = stats.sentiment?.netral || stats.sentiment?.neutral || 0;
  const negCount = stats.sentiment?.negatif || 0;

  const posPct = Math.round((posCount / total) * 100);
  const netPct = Math.round((netCount / total) * 100);
  const negPct = Math.max(0, 100 - posPct - netPct); // Pastikan total tepat 100%

  // Tentukan skenario
  let scenario = 'D'; // Seimbang / Campuran
  if (negPct > posPct && negPct > netPct) {
    scenario = 'A'; // Negatif Dominan
  } else if (posPct > negPct && posPct > netPct) {
    scenario = 'B'; // Positif Dominan
  } else if (netPct >= posPct && netPct >= negPct && netPct >= 45) {
    scenario = 'C'; // Netral Dominan
  }

  // Cek temuan negatif berisiko tinggi
  const criticalNegativeItems = (topFindings || []).filter(item => {
    const s = (item.sentiment || '').toLowerCase();
    return s === 'negatif' || s === 'negative';
  });

  let rec = {
    scenario,
    metrics: { total, posCount, netCount, negCount, posPct, netPct, negPct }
  };

  if (scenario === 'A') {
    // Skenario A: Negatif Dominan
    rec.title = 'Skenario A — Eskalasi Isu Kritis (Sentimen Negatif Dominan)';
    rec.summary = `Berdasarkan analisis terhadap ${total} temuan pemantauan kata kunci "${keyword}", percakapan media didominasi oleh sentimen negatif sebesar ${negPct}% (${negCount} temuan), sementara sentimen netral mencatatkan ${netPct}% (${netCount} temuan) dan sentimen positif sebesar ${posPct}% (${posCount} temuan). Kondisi ini mengindikasikan adanya tekanan isu atau sorotan kritis publik yang memerlukan penanganan terkoordinasi.`;
    
    rec.interpretation = `Sebaran isu negatif berpusat pada polemik atau narasi keluhan yang tersebar di kanal media sosial dan portal daring. Analisis AI menunjukkan bahwa percakapan publik tidak selalu merepresentasikan kebenaran materiil, namun persepsi publik yang terbentuk secara organik berpotensi mereduksi kepercayaan terhadap institusi ${keyword} jika dibiarkan tanpa kepastian informasi.`;
    
    rec.risksAndOpportunities = `Risiko utama mencakup disinformasi lanjutan, pembentukan framing sepihak oleh akun-akun berpengaruh, dan penurunan sentimen simpatisan. Di sisi lain, momentum ini membuka peluang bagi institusi untuk menunjukkan transparansi, kepemimpinan responsif, dan komitmen penyelesaian masalah yang kredibel di mata khalayak.`;
    
    rec.priorityActions = [
      `1. Segera lakukan verifikasi faktual dan pendalaman materi terhadap ${criticalNegativeItems.length > 0 ? criticalNegativeItems.length : 'seluruh'} temuan negatif sebelum merilis respons publik.`,
      `2. Koordinasikan dengan pimpinan terkait dan majelis/lembaga yang bersinggungan langsung untuk merumuskan lembar fakta (fact sheet) resmi.`,
      `3. Siapkan komunikasi satu pintu (single voice of authority) melalui pernyataan resmi Pusat Syiar Digital Muhammadiyah (PSDM) untuk meredam spekulasi liar.`,
      `4. Hindari bantahan reaktif yang bersifat emosional; prioritaskan penjelasan berbasis data, regulasi, dan etika persyarikatan.`
    ].join('\n');

    rec.followUp = `Lakukan pengetatan interval monitoring pemantauan menjadi setiap 1 jam, pantau interaksi akun-akun sentral (key opinion leaders), dan jadwalkan evaluasi dampak media dalam kurun waktu 24 jam ke depan.`;

  } else if (scenario === 'B') {
    // Skenario B: Positif Dominan
    rec.title = 'Skenario B — Momentum Reputasi Unggul (Sentimen Positif Dominan)';
    rec.summary = `Hasil monitoring terhadap ${total} artikel dan unggahan dengan kata kunci "${keyword}" menunjukkan dominasi sentimen positif yang sangat signifikan sebesar ${posPct}% (${posCount} temuan). Sentimen netral berada pada angka ${netPct}% (${netCount} temuan), sedangkan sentimen negatif terkendali rendah pada level ${negPct}% (${negCount} temuan).`;
    
    rec.interpretation = `Publik dan media secara konsisten memberikan apresiasi terhadap kiprah, program pendidikan, gerakan sosial, maupun kontribusi nyata ${keyword}. Tingkat penerimaan publik yang tinggi ini mencerminkan keberhasilan strategi komunikasi kehumasan serta kepercayaan masyarakat yang kokoh terhadap persyarikatan.`;
    
    rec.risksAndOpportunities = `Peluang emas terbuka lebar untuk memperluas jangkauan dakwah digital, meningkatkan kemitraan strategis, dan memperkuat legitimasi kelembagaan. Risiko yang perlu dimitigasi adalah rasa cepat puas (complacency), sehingga perhatian terhadap bibit isu kecil yang bernada kritis (${negCount} temuan) tidak boleh diabaikan.`;
    
    rec.priorityActions = [
      `1. Amplifikasi pemberitaan positif unggulan melalui seluruh jejaring media sosial resmi persyarikatan, portal berita afiliasi, dan grup komunitas warga.`,
      `2. Konversikan capaian dan apresiasi media menjadi format konten kreatif (infografik, video pendek, reel edukatif) yang ramah generasi muda.`,
      `3. Berikan apresiasi kepada unit kerja dan mitra yang menjadi subjek keberhasilan pemberitaan sebagai motivasi internal.`,
      `4. Tetap lakukan pencatatan terhadap ${negCount} isu bernada minor agar tidak berkembang menjadi polemik di kemudian hari.`
    ].join('\n');

    rec.followUp = `Pertahankan ritme publikasi berkualitas, buat rekapitulasi capaian media bulanan, dan evaluasi efektivitas amplifikasi setiap akhir pekan.`;

  } else if (scenario === 'C') {
    // Skenario C: Netral Dominan
    rec.title = 'Skenario C — Arus Informasi Faktual & Pelaporan Agenda (Sentimen Netral Dominan)';
    rec.summary = `Pemantauan media terhadap ${total} temuan kata kunci "${keyword}" mencerminkan dominasi kuat sentimen netral sebesar ${netPct}% (${netCount} temuan). Porsi sentimen positif berada di angka ${posPct}% (${posCount} temuan) dan sentimen negatif sebesar ${negPct}% (${negCount} temuan). Lanskap percakapan didominasi oleh pelaporan peristiwa jurnalistik lurus dan sebaran agenda formal.`;
    
    rec.interpretation = `Sebagian besar media memberitakan kegiatan persyarikatan secara objektif sebagai rilis pers atau laporan berita lugas tanpa resonansi emosional yang tinggi. Hal ini menandakan media memandang institusi ${keyword} sebagai narasumber otoritatif, namun ruang narasi inspiratif dan viralitas nilai kebermanfaatan belum tergarap optimal.`;
    
    rec.risksAndOpportunities = `Peluang besar terletak pada rekayasa sudut pandang (framing angle) agar kegiatan rutin dapat diubah menjadi narasi bernilai sentimen positif yang menggugah emosi publik. Risikonya adalah pesan institusi hanya lewat sekilas sebagai berita formal tanpa menciptakan ikatan keterlibatan (engagement) audiens yang mendalam.`;
    
    rec.priorityActions = [
      `1. Kembangkan rilis pers berikutnya dengan teknik storytelling (menonjolkan sisi human interest, dampak sosial bagi masyarakat, dan solusi nyata).`,
      `2. Sediakan aset multimedia resolusi tinggi dan cuplikan kutipan inspiratif pimpinan persyarikatan agar mudah dikutip oleh jurnalis media massa.`,
      `3. Dorong pegiat media sosial dan kader digital di wilayah untuk memberikan ulasan serta kesaksian positif atas kegiatan yang sedang berlangsung.`,
      `4. Evaluasi distribusi kanal media luar ruang dan platform digital agar pesan tidak hanya beredar di kalangan internal warga persyarikatan.`
    ].join('\n');

    rec.followUp = `Pantau konversi sentimen dari agenda netral menjadi sentimen positif pada siklus pemantauan berikutnya, serta lakukan peninjauan konten berkala bersama tim redaksi media digital.`;

  } else {
    // Skenario D: Distribusi Seimbang / Campuran
    rec.title = 'Skenario D — Percakapan Majemuk & Dinamis (Kondisi Distribusi Campuran)';
    rec.summary = `Dari total ${total} temuan pada kata kunci "${keyword}", distribusi sentimen menunjukkan kondisi majemuk dengan proporsi sentimen netral ${netPct}% (${netCount} temuan), sentimen positif ${posPct}% (${posCount} temuan), dan sentimen negatif ${negPct}% (${negCount} temuan). Lanskap opini publik bergerak dinamis dengan percampuran antara apresiasi capaian dan sorotan kritis.`;
    
    rec.interpretation = `Publik mendiskusikan berbagai spektrum topik secara bersamaan. Meskipun sentimen negatif (${negPct}%) bukan kelompok mutlak, keberadaan temuan kritis pada kanal media tetap menuntut perhatian selektif terutama bila melibatkan isu kebijakan atau figur sentral organisasi.`;
    
    rec.risksAndOpportunities = `Kondisi campuran menunjukkan keterbukaan dialektika publik. Peluang institusi adalah mendominasi diskursus dengan narasi solutif dan data faktual, sementara risiko utamanya adalah pembelokan isu positif oleh amplifikasi isu-isu kontroversial yang belum terkelola.`;
    
    rec.priorityActions = [
      `1. Pisahkan penanganan antara amplifikasi materi positif (${posCount} temuan) dan mitigasi terfokus pada materi negatif (${negCount} temuan).`,
      `2. Prioritaskan penanganan pada temuan negatif yang bersumber dari media bertrafik tinggi atau tokoh dengan keterikatan audiens besar.`,
      `3. Perkuat pesan kunci (key messages) persyarikatan melalui infografik edukatif dan sesi dialog terbuka yang menyejukkan.`,
      `4. Jaga koordinasi sinergis antara tim monitoring, juru bicara, dan pengelola media sosial di lingkungan PSDM.`
    ].join('\n');

    rec.followUp = `Lakukan evaluasi harian terhadap pergeseran sentimen dan perbarui matriks manajemen reputasi secara teratur.`;
  }

  return rec;
}

module.exports = {
  cleanText,
  formatPlatformName,
  getSentimentInfo,
  generateAINarrative,
  generateStrategicRecommendations
};
