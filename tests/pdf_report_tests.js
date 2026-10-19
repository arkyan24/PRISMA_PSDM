/**
 * PRISMA — Automated PDF Report & AI Narrative Integration Tests
 */

const assert = require('assert');
const { buildPDFReport, formatIndonesianDate } = require('../src/pdf_report_builder');
const {
  cleanText,
  formatPlatformName,
  getSentimentInfo,
  generateAINarrative,
  generateStrategicRecommendations
} = require('../src/ai_report_generator');
const db = require('../src/database');

async function runTests() {
  console.log('====================================================');
  console.log(' RUNNING PRISMA PDF REPORT & AI NARRATIVE TESTS');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  async function asyncTest(name, fn) {
    try {
      await fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  // 1. Indonesian Date Formatting
  test('Indonesian Date Formatting: Menghasilkan format hari, tanggal bulan tahun', () => {
    const formatted = formatIndonesianDate(new Date('2026-10-19T09:00:00Z'));
    assert(formatted.includes('Oktober 2026'), `Should include Oktober 2026, got: ${formatted}`);
    assert(formatted.includes('Senin') || formatted.includes('Minggu') || formatted.includes('Selasa'), 'Should include Indonesian day name');
  });

  // 2. Clean Text Helper
  test('Clean Text: Membersihkan entitas HTML & spasi ganda', () => {
    const raw = '&quot;Berita Hebat&quot; &amp; &lt;b&gt;Muhammadiyah&lt;/b&gt;&nbsp;&nbsp;Maju';
    const cleaned = cleanText(raw);
    assert.strictEqual(cleaned, '"Berita Hebat" & Muhammadiyah Maju');
  });

  // 3. Platform Name Formatter
  test('Platform Name Formatter: Menstandarkan nama platform media', () => {
    assert.strictEqual(formatPlatformName('facebook'), 'Facebook');
    assert.strictEqual(formatPlatformName('twitter'), 'Twitter (X)');
    assert.strictEqual(formatPlatformName('x'), 'Twitter (X)');
    assert.strictEqual(formatPlatformName('instagram'), 'Instagram');
    assert.strictEqual(formatPlatformName('website'), 'Website Berita');
  });

  // 4. AI Narrative Generation
  await asyncTest('AI Narrative: Menghasilkan narasi 2-5 kalimat bahasa Indonesia formal tanpa halusinasi', async () => {
    const sampleItem = {
      id: 9999,
      title: 'Muhammadiyah Luncurkan Program Beasiswa Pendidikan Unggul',
      snippet: 'Pimpinan Pusat Muhammadiyah resmi membuka pendaftaran beasiswa unggulan untuk mahasiswa berprestasi.',
      platform: 'website',
      sentiment: 'positif',
      keyword_text: 'Muhammadiyah',
      nlp_sentiment: {
        label: 'positif',
        confidence: 0.92
      }
    };

    const narrative = await generateAINarrative(sampleItem);
    assert(typeof narrative === 'string' && narrative.length > 50, 'Narrative should be a non-empty string');
    assert(narrative.includes('Positif'), 'Should mention sentiment context');
    assert(narrative.includes('92%'), 'Should mention actual confidence percentage');
    assert(narrative.includes('Website Berita'), 'Should mention platform');
  });

  // 5. AI Narrative Caching
  await asyncTest('AI Narrative Caching: Menggunakan narasi tersimpan jika sudah tersedia', async () => {
    const cachedItem = {
      id: 9998,
      title: 'Agenda Rutin',
      snippet: 'Rapat koordinasi',
      platform: 'facebook',
      sentiment: 'netral',
      ai_narrative: 'Ini adalah narasi terverifikasi yang tersimpan di cache dan tidak boleh digenerate ulang.'
    };

    const narrative = await generateAINarrative(cachedItem);
    assert.strictEqual(narrative, cachedItem.ai_narrative);
  });

  // 6. Strategic Recommendations 5 Sections
  test('Strategic Recommendations: Menghasilkan 5 bagian terstruktur', () => {
    const mockStats = {
      total: 40,
      sentiment: { positif: 10, netral: 24, negatif: 6 }
    };

    const rec = generateStrategicRecommendations(mockStats, [], 'Muhammadiyah', 'Admin PSDM');
    assert(rec.summary && rec.summary.length > 20, 'Bagian 1: Ringkasan kondisi sentimen harus ada');
    assert(rec.interpretation && rec.interpretation.length > 20, 'Bagian 2: Interpretasi temuan utama harus ada');
    assert(rec.risksAndOpportunities && rec.risksAndOpportunities.length > 20, 'Bagian 3: Risiko dan peluang harus ada');
    assert(rec.priorityActions && rec.priorityActions.length > 20, 'Bagian 4: Rekomendasi tindakan prioritas harus ada');
    assert(rec.followUp && rec.followUp.length > 20, 'Bagian 5: Langkah tindak lanjut harus ada');
    
    // Total persentase harus tepat 100%
    const m = rec.metrics;
    assert.strictEqual(m.posPct + m.netPct + m.negPct, 100, 'Total persentase sentimen harus tepat 100%');
  });

  // 7. Full PDF Report Generation
  await asyncTest('Full PDF Report Generation: Membangun file PDF valid dengan header %PDF', async () => {
    const monitor = db.getMonitor(1);
    const results = db.getResults({ monitor_id: 1, limit: 10 });
    const stats = db.getResultStats(1);

    const pdfBuffer = await buildPDFReport({
      monitor,
      results,
      stats,
      currentUser: 'psdm.muhammadiyah'
    });

    assert(Buffer.isBuffer(pdfBuffer), 'Result must be a buffer');
    assert(pdfBuffer.length > 10000, 'PDF buffer must contain substantial document content');
    const magicHeader = pdfBuffer.slice(0, 4).toString('utf-8');
    assert.strictEqual(magicHeader, '%PDF', 'Must start with %PDF magic bytes');
  });

  // 8. PDF Report Generation with Custom Avatar
  await asyncTest('PDF Report with Avatar: Berhasil menyertakan foto profil kustom & inisial username', async () => {
    const monitor = db.getMonitor(1);
    const results = db.getResults({ monitor_id: 1, limit: 5 });
    const stats = db.getResultStats(1);

    const pdfBufferWithAvatar = await buildPDFReport({
      monitor,
      results,
      stats,
      currentUser: 'ahmad.dahlan',
      userAvatarUrl: '/images/logo.png'
    });

    assert(Buffer.isBuffer(pdfBufferWithAvatar), 'PDF with avatar must be a valid buffer');
    assert(pdfBufferWithAvatar.slice(0, 4).toString('utf-8') === '%PDF', 'Must start with %PDF');
  });

  console.log(`\n====================================================`);
  console.log(` TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log(`====================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
