/**
 * PRISMA — High-Fidelity Institutional PDF Report Builder
 * Menghasilkan Dokumen PDF 4 Bagian Utama dengan Tipografi DM Sans & Desain Minimalis Presisi
 */

const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const {
  cleanText,
  formatPlatformName,
  getSentimentInfo,
  generateAINarrative,
  generateStrategicRecommendations
} = require('./ai_report_generator');

const FONT_REGULAR = path.join(__dirname, '..', 'public', 'fonts', 'DMSans-Regular.woff');
const FONT_MEDIUM = path.join(__dirname, '..', 'public', 'fonts', 'DMSans-Medium.woff');
const FONT_SEMIBOLD = path.join(__dirname, '..', 'public', 'fonts', 'DMSans-SemiBold.woff');
const FONT_BOLD = path.join(__dirname, '..', 'public', 'fonts', 'DMSans-Bold.woff');
const LOGO_PATH = path.join(__dirname, '..', 'public', 'images', 'logo.png');

/**
 * Format tanggal dalam Bahasa Indonesia (e.g. "Senin, 19 Oktober 2026")
 */
function formatIndonesianDate(dateInput) {
  const date = dateInput ? new Date(dateInput) : new Date();
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  const dayName = days[date.getDay()];
  const dayNum = date.getDate();
  const monthName = months[date.getMonth()];
  const year = date.getFullYear();

  return `${dayName}, ${dayNum} ${monthName} ${year}`;
}

/**
 * Helper untuk menggambar panah oranye vektor (───►)
 */
function drawOrangeArrow(doc, startX, startY, endX, endY) {
  const arrowColor = '#f97316'; // Vivid Orange
  const headLength = 10;
  const headWidth = 5;

  doc.save();
  doc.strokeColor(arrowColor).lineWidth(3);
  doc.moveTo(startX, startY).lineTo(endX - headLength, endY).stroke();

  // Kepala panah (segitiga)
  doc.fillColor(arrowColor);
  doc.polygon(
    [endX, endY],
    [endX - headLength, endY - headWidth],
    [endX - headLength, endY + headWidth]
  ).fill();
  doc.restore();
}

/**
 * Helper untuk menentukan path file gambar avatar pengguna di server
 */
function resolveAvatarFilePath(username, userAvatarUrl) {
  if (userAvatarUrl) {
    const cleanUrl = userAvatarUrl.split('?')[0];
    const candidatePath = path.join(__dirname, '..', 'public', cleanUrl.replace(/^\//, ''));
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }
  if (username) {
    const safeUsername = username.replace(/[^a-zA-Z0-9_-]/g, '_');
    const exts = ['png', 'jpg', 'jpeg'];
    for (const ext of exts) {
      const p = path.join(__dirname, '..', 'public', 'images', 'avatars', `avatar_${safeUsername}.${ext}`);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

/**
 * Render avatar profil (foto kustom atau inisial squircle logo Pengaturan)
 */
function renderSquircleAvatar(doc, x, y, size, letter, imagePath) {
  doc.save();
  const radius = Math.round(size * 0.28);

  if (imagePath && fs.existsSync(imagePath)) {
    try {
      doc.roundedRect(x, y, size, size, radius).clip();
      doc.image(imagePath, x, y, {
        width: size,
        height: size,
        fit: [size, size],
        align: 'center',
        valign: 'center'
      });
      doc.restore();
      doc.save();
      doc.roundedRect(x, y, size, size, radius)
         .lineWidth(1.5)
         .strokeColor('#4f46cb')
         .stroke();
      doc.restore();
      return;
    } catch (e) {
      // Fallback to letter
    }
  }

  // DEFAULT: Menyesuaikan logo halaman pengaturan (squircle ungu dengan aksen oranye dan huruf inisial username)
  doc.roundedRect(x, y, size, size, radius)
     .fillColor('#4f46cb')
     .fill();

  doc.roundedRect(x, y, size, size, radius)
     .lineWidth(1.5)
     .strokeColor('#F9896B')
     .stroke();

  const fontSize = Math.round(size * 0.5);
  doc.font('DMSans-Bold')
     .fontSize(fontSize)
     .fillColor('#ffffff')
     .text(letter || 'P', x, y + Math.round(size * 0.22), {
       width: size,
       align: 'center'
     });

  doc.restore();
}

/**
 * Membangun Dokumen PDF Lengkap
 */
async function buildPDFReport({
  monitor,
  results = [],
  stats,
  currentUser = 'psdm.muhammadiyah',
  userAvatarUrl = null
}) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        bufferPages: true,
        autoFirstPage: false
      });

      const buffers = [];
      doc.on('data', b => buffers.push(b));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', err => reject(err));

      // 1. Daftarkan Font DM Sans
      doc.registerFont('DMSans-Regular', FONT_REGULAR);
      doc.registerFont('DMSans-Medium', FONT_MEDIUM);
      doc.registerFont('DMSans-SemiBold', FONT_SEMIBOLD);
      doc.registerFont('DMSans-Bold', FONT_BOLD);

      const keyword = monitor ? monitor.keyword : 'Muhammadiyah';
      const monitorName = monitor ? monitor.name : 'Pantauan Sosial Media';
      const todayFormatted = formatIndonesianDate(new Date());
      const userAvatarFilePath = resolveAvatarFilePath(currentUser, userAvatarUrl);

      // 2. Siapkan Narasi AI untuk setiap temuan
      const processedResults = [];
      const narrativesToSave = [];
      for (let i = 0; i < results.length; i++) {
        const item = results[i];
        const narrative = await generateAINarrative(item, { keyword });
        item.ai_narrative = narrative; // update cache in memory
        processedResults.push({
          ...item,
          ai_narrative: narrative
        });
        if (item.id) {
          narrativesToSave.push({ id: item.id, ai_narrative: narrative });
        }
      }

      if (narrativesToSave.length > 0) {
        try {
          const db = require('./database');
          db.updateResultNarrativesBatch(narrativesToSave);
        } catch (dbErr) {
          console.warn('[PDF Report] Failed to persist narratives:', dbErr.message);
        }
      }

      // Siapkan rekomendasi strategis
      const recommendations = generateStrategicRecommendations(stats, processedResults, keyword, currentUser);


      // ══════════════════════════════════════════════════════
      // HALAMAN 1 — SAMPUL LAPORAN
      // ══════════════════════════════════════════════════════
      doc.addPage();
      renderCoverPage(doc, {
        keyword,
        monitorName,
        todayFormatted,
        currentUser,
        userAvatarFilePath,
        totalFindings: processedResults.length
      });

      // ══════════════════════════════════════════════════════
      // HALAMAN 2 — TEMUAN HASIL PANTAUAN (Tabel 5 Kolom)
      // ══════════════════════════════════════════════════════
      doc.addPage();
      const findingsStartPageIndex = doc.bufferedPageRange().count - 1;
      renderFindingsSection(doc, processedResults, keyword);

      // ══════════════════════════════════════════════════════
      // HALAMAN 3 — ANALISIS UMUM SENTIMEN
      // ══════════════════════════════════════════════════════
      doc.addPage();
      renderSentimentAnalysisPage(doc, stats, processedResults);

      // ══════════════════════════════════════════════════════
      // HALAMAN 4 — REKOMENDASI STRATEGIS
      // ══════════════════════════════════════════════════════
      doc.addPage();
      renderStrategicRecommendationsPage(doc, recommendations, {
        keyword,
        todayFormatted,
        currentUser
      });

      // ══════════════════════════════════════════════════════
      // PASS 2: RENDER RUNNING HEADER & FOOTER PADA SELURUH HALAMAN
      // ══════════════════════════════════════════════════════
      const totalPages = doc.bufferedPageRange().count;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);
        if (i > 0) {
          // Render header hanya untuk halaman selain sampul
          renderRunningHeader(doc, currentUser, todayFormatted, userAvatarFilePath);
        }
        // Render running footer di seluruh halaman
        renderRunningFooter(doc, i + 1, totalPages);
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// ──────────────────────────────────────────────────────────────
// KOMPONEN: Running Header
// ──────────────────────────────────────────────────────────────
function renderRunningHeader(doc, currentUser, todayFormatted, userAvatarFilePath) {
  doc.save();
  const startX = 40;
  const startY = 22;
  const contentWidth = 515;

  // Profil Avatar / Squircle Logo di kiri (Halaman 2, 3, 4)
  const headerAvatarSize = 24;
  const initialLetter = (currentUser || 'P').charAt(0).toUpperCase();
  renderSquircleAvatar(doc, startX, startY + 2, headerAvatarSize, initialLetter, userAvatarFilePath);

  // Teks Identitas Pengguna & Institusi
  const textX = startX + 34;
  doc.font('DMSans-Bold').fontSize(10.5).fillColor('#1e1b4b')
     .text('PSDM MUHAMMADIYAH', textX, startY);
  
  doc.font('DMSans-Regular').fontSize(7.5).fillColor('#64748b')
     .text(`Akun: ${currentUser}  •  Pusat Syiar Digital Muhammadiyah`, textX, startY + 13);

  // Kanan atas: Judul Modul
  doc.font('DMSans-SemiBold').fontSize(8).fillColor('#6366f1')
     .text('LAPORAN PANTAUAN MEDIA', startX, startY + 3, {
       width: contentWidth,
       align: 'right'
     });

  doc.font('DMSans-Regular').fontSize(7.5).fillColor('#94a3b8')
     .text(todayFormatted, startX, startY + 14, {
       width: contentWidth,
       align: 'right'
     });

  // Garis aksen ungu tipis (border bawah header)
  doc.strokeColor('#6366f1').lineWidth(1.2)
     .moveTo(startX, startY + 28)
     .lineTo(startX + contentWidth, startY + 28)
     .stroke();

  doc.restore();
}

// ──────────────────────────────────────────────────────────────
// KOMPONEN: Running Footer
// ──────────────────────────────────────────────────────────────
function renderRunningFooter(doc, currentPage, totalPages) {
  doc.save();
  const startX = 40;
  const y = 806;
  const contentWidth = 515;

  // Garis pemisah tipis
  doc.strokeColor('#e2e8f0').lineWidth(0.8)
     .moveTo(startX, y)
     .lineTo(startX + contentWidth, y)
     .stroke();

  // Label kiri
  doc.font('DMSans-Regular').fontSize(7.5).fillColor('#94a3b8')
     .text('PRISMA (PR Intelligence & Social Media) • Dokumen Resmi PSDM Muhammadiyah', startX, y + 6);

  // Nomor halaman kanan
  doc.font('DMSans-Medium').fontSize(7.5).fillColor('#64748b')
     .text(`Halaman ${currentPage} dari ${totalPages}`, startX, y + 6, {
       width: contentWidth,
       align: 'right'
     });

  doc.restore();
}

// ──────────────────────────────────────────────────────────────
// HALAMAN 1: Sampul Laporan
// ──────────────────────────────────────────────────────────────
function renderCoverPage(doc, data) {
  doc.save();
  const startX = 40;
  const contentWidth = 515;

  // Profil Avatar / Logo Terpusat di bagian atas (Halaman 1)
  const avatarSize = 64;
  const avatarX = startX + (contentWidth - avatarSize) / 2;
  const avatarY = 68;
  const initialLetter = (data.currentUser || 'P').charAt(0).toUpperCase();

  renderSquircleAvatar(doc, avatarX, avatarY, avatarSize, initialLetter, data.userAvatarFilePath);

  // Nama Institusi
  doc.font('DMSans-Bold').fontSize(11).fillColor('#4338ca')
     .text('PUSAT SYIAR DIGITAL MUHAMMADIYAH', startX, 148, {
       width: contentWidth,
       align: 'center',
       characterSpacing: 1.2
     });

  doc.font('DMSans-Medium').fontSize(8.5).fillColor('#64748b')
     .text('PRISMA — PR Intelligence & Social Media', startX, 164, {
       width: contentWidth,
       align: 'center'
     });

  // Garis aksen tengah
  doc.strokeColor('#6366f1').lineWidth(2)
     .moveTo(startX + 180, 185)
     .lineTo(startX + contentWidth - 180, 185)
     .stroke();

  // Kategori Pill
  const pillY = 240;
  doc.roundedRect(startX + (contentWidth - 260) / 2, pillY, 260, 24, 12)
     .fillAndStroke('#e0e7ff', '#c7d2fe');
  doc.font('DMSans-Bold').fontSize(8.5).fillColor('#3730a3')
     .text('DOKUMEN INTELIJEN MEDIA & SENTIMEN PUBLIK', startX, pillY + 7, {
       width: contentWidth,
       align: 'center',
       characterSpacing: 0.8
     });

  // Judul Utama Laporan
  doc.font('DMSans-Bold').fontSize(25).fillColor('#0f172a')
     .text('LAPORAN HASIL PANTAUAN\nSOSIAL MEDIA', startX, 285, {
       width: contentWidth,
       align: 'center',
       lineGap: 4
     });

  // Subjudul
  doc.font('DMSans-Regular').fontSize(11).fillColor('#475569')
     .text('Analisis Sentimen Berbasis AI & Ringkasan Isu Terkini', startX, 360, {
       width: contentWidth,
       align: 'center'
     });

  // Kotak Informasi Sampul (Formal Information Card)
  const boxY = 420;
  const boxHeight = 220;
  doc.roundedRect(startX, boxY, contentWidth, boxHeight, 8)
     .fillAndStroke('#f8fafc', '#e2e8f0');

  // Garis aksen kiri kotak
  doc.roundedRect(startX, boxY, 4, boxHeight, 2)
     .fill('#6366f1');

  // Isi Informasi Metadata
  let infoY = boxY + 24;
  const labelX = startX + 24;
  const valueX = startX + 185;
  const rowGap = 34;

  const rows = [
    { label: 'Keyword Pemantauan', val: data.keyword },
    { label: 'Target / Nama Monitor', val: data.monitorName },
    { label: 'Hari / Tanggal Ekspor', val: data.todayFormatted },
    { label: 'Identitas Akun Pengunduh', val: `${data.currentUser} (Pengguna Terverifikasi)` },
    { label: 'Total Temuan Teranalisis', val: `${data.totalFindings} Data Berita & Postingan` }
  ];

  rows.forEach((r, idx) => {
    doc.font('DMSans-Medium').fontSize(10).fillColor('#64748b')
       .text(r.label, labelX, infoY + (idx * rowGap));

    doc.font('DMSans-Bold').fontSize(10).fillColor('#1e1b4b')
       .text(`:  ${r.val}`, valueX, infoY + (idx * rowGap), {
         width: contentWidth - 200
       });
  });

  // Catatan kaki sampul
  doc.font('DMSans-Regular').fontSize(8.5).fillColor('#94a3b8')
     .text('Laporan ini disusun secara otomatis oleh PRISMA dengan pengayaan analisis kecerdasan buatan (AI) berbasis temuan pemantauan aktual.', startX, 730, {
       width: contentWidth,
       align: 'center',
       lineGap: 3
     });

  doc.restore();
}

// ──────────────────────────────────────────────────────────────
// HALAMAN 2: Temuan Hasil Pantauan (Tabel 5 Kolom)
// ──────────────────────────────────────────────────────────────
function renderFindingsSection(doc, items, keyword) {
  const startX = 40;
  const contentWidth = 515;
  let currentY = 66; // Dibawah running header (y: 50)

  // Judul Bagian
  doc.font('DMSans-Bold').fontSize(15).fillColor('#0f172a')
     .text('TEMUAN HASIL PANTAUAN', startX, currentY);
  currentY += 18;

  doc.font('DMSans-Regular').fontSize(8.5).fillColor('#64748b')
     .text(`Daftar komprehensif berita dan percakapan media sosial yang dihimpun pada pemantauan kata kunci "${keyword}".`, startX, currentY);
  currentY += 18;

  // Definisi Lebar Kolom (Total: 515)
  // No: 22 | Platform: 52 | Berita: 156 | Sentimen: 78 | Keterangan: 207
  const cols = {
    no: { x: startX, w: 22 },
    platform: { x: startX + 22, w: 52 },
    berita: { x: startX + 74, w: 156 },
    sentimen: { x: startX + 230, w: 78 },
    keterangan: { x: startX + 308, w: 207 }
  };

  const maxY = 775; // Batas bawah halaman sebelum trigger page break

  // Fungsi menggambar Header Tabel
  function drawTableHeader(y) {
    doc.save();
    doc.rect(startX, y, contentWidth, 20).fill('#f1f5f9');
    doc.strokeColor('#cbd5e1').lineWidth(0.8)
       .rect(startX, y, contentWidth, 20).stroke();

    doc.font('DMSans-Bold').fontSize(7.5).fillColor('#1e293b');
    doc.text('No.', cols.no.x + 2, y + 5, { width: cols.no.w - 4, align: 'center' });
    doc.text('Platform', cols.platform.x + 4, y + 5, { width: cols.platform.w - 8, align: 'left' });
    doc.text('Berita & Tautan', cols.berita.x + 4, y + 5, { width: cols.berita.w - 8, align: 'left' });
    doc.text('Sentimen', cols.sentimen.x + 2, y + 5, { width: cols.sentimen.w - 4, align: 'center' });
    doc.text('Keterangan (Narasi AI)', cols.keterangan.x + 4, y + 5, { width: cols.keterangan.w - 8, align: 'left' });
    doc.restore();
    return y + 20;
  }

  currentY = drawTableHeader(currentY);

  if (!items || items.length === 0) {
    doc.font('DMSans-Regular').fontSize(9).fillColor('#64748b')
       .text('Belum ada temuan berita atau konten media yang tersimpan pada monitor ini.', startX + 10, currentY + 16, {
         width: contentWidth - 20,
         align: 'center'
       });
    return;
  }

  // Parameter tipografi baris tabel yang presisi dan tersinkronisasi
  const TITLE_FONT = 'DMSans-Bold';
  const TITLE_SIZE = 7.2;
  const TITLE_LINE_GAP = 1.2;

  const LINK_FONT = 'DMSans-Medium';
  const LINK_SIZE = 6.8;
  const LINK_HEIGHT = 10;
  const LINK_TOP = 4;

  const NARASI_FONT = 'DMSans-Regular';
  const NARASI_SIZE = 6.8;
  const NARASI_LINE_GAP = 1.3;

  const PADDING_TOP = 7;
  const PADDING_BOTTOM = 7;

  // Render Setiap Baris
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const sentimentInfo = getSentimentInfo(item);
    const platform = formatPlatformName(item.platform);
    const title = cleanText(item.title) || 'Judul berita tidak tersedia';
    const narrative = cleanText(item.ai_narrative) || 'Analisis narasi AI belum tersedia.';

    // 1. Hitung tinggi kolom berita secara presisi
    const titleH = doc.font(TITLE_FONT).fontSize(TITLE_SIZE).heightOfString(title, {
      width: cols.berita.w - 8,
      lineGap: TITLE_LINE_GAP
    });
    const colBeritaH = titleH + (item.link ? (LINK_TOP + LINK_HEIGHT) : 0);

    // 2. Hitung tinggi kolom narasi secara presisi
    const narasiH = doc.font(NARASI_FONT).fontSize(NARASI_SIZE).heightOfString(narrative, {
      width: cols.keterangan.w - 8,
      lineGap: NARASI_LINE_GAP
    });

    // 3. Tinggi total baris dihitung dari elemen tertinggi ditambah padding
    const contentH = Math.max(colBeritaH, narasiH, 30);
    const rowHeight = contentH + PADDING_TOP + PADDING_BOTTOM;

    // Cek apakah baris muat di halaman saat ini
    if (currentY + rowHeight > maxY) {
      doc.addPage();
      currentY = 66; // Mengakomodasi running header di y: 22 s/d 50
      currentY = drawTableHeader(currentY);
    }

    // Gambar zebra background & border baris
    const isEven = i % 2 === 0;
    doc.save();
    if (!isEven) {
      doc.rect(startX, currentY, contentWidth, rowHeight).fill('#fbfcfd');
    }
    doc.strokeColor('#e2e8f0').lineWidth(0.6)
       .rect(startX, currentY, contentWidth, rowHeight).stroke();

    const cellY = currentY + PADDING_TOP;

    // 1. Kolom No
    doc.font('DMSans-Medium').fontSize(7.5).fillColor('#64748b')
       .text(`${i + 1}`, cols.no.x + 2, cellY, {
         width: cols.no.w - 4,
         align: 'center'
       });

    // 2. Kolom Platform
    doc.font('DMSans-SemiBold').fontSize(7.2).fillColor('#334155')
       .text(platform, cols.platform.x + 4, cellY, {
         width: cols.platform.w - 8,
         align: 'left'
       });

    // 3. Kolom Berita + Link Sumber
    doc.font(TITLE_FONT).fontSize(TITLE_SIZE).fillColor('#0f172a')
       .text(title, cols.berita.x + 4, cellY, {
         width: cols.berita.w - 8,
         lineGap: TITLE_LINE_GAP
       });

    if (item.link) {
      const linkY = cellY + titleH + LINK_TOP;
      doc.font(LINK_FONT).fontSize(LINK_SIZE).fillColor('#4f46e5')
         .text('Buka Sumber Berita ↗', cols.berita.x + 4, linkY, {
           width: cols.berita.w - 8,
           underline: true,
           link: item.link
         });
    }

    // 4. Kolom Sentimen (Badge + Confidence)
    const badgeY = cellY;
    let badgeBg = '#f1f5f9';
    let badgeBorder = '#cbd5e1';
    let badgeText = '#334155';

    if (sentimentInfo.label === 'Positif') {
      badgeBg = '#ecfdf5';
      badgeBorder = '#a7f3d0';
      badgeText = '#047857';
    } else if (sentimentInfo.label === 'Negatif') {
      badgeBg = '#fef2f2';
      badgeBorder = '#fecaca';
      badgeText = '#b91c1c';
    }

    doc.roundedRect(cols.sentimen.x + 4, badgeY, cols.sentimen.w - 8, 15, 4)
       .fillAndStroke(badgeBg, badgeBorder);

    doc.font('DMSans-Bold').fontSize(7.2).fillColor(badgeText)
       .text(sentimentInfo.label, cols.sentimen.x + 4, badgeY + 3.5, {
         width: cols.sentimen.w - 8,
         align: 'center'
       });

    doc.font('DMSans-Regular').fontSize(6.5).fillColor('#64748b')
       .text(`Keyakinan ${sentimentInfo.confidencePct}%`, cols.sentimen.x + 2, badgeY + 18, {
         width: cols.sentimen.w - 4,
         align: 'center'
       });

    // 5. Kolom Keterangan (Narasi AI)
    doc.font(NARASI_FONT).fontSize(NARASI_SIZE).fillColor('#334155')
       .text(narrative, cols.keterangan.x + 4, cellY, {
         width: cols.keterangan.w - 8,
         lineGap: NARASI_LINE_GAP,
         align: 'left'
       });

    doc.restore();
    currentY += rowHeight;
  }
}


// ──────────────────────────────────────────────────────────────
// HALAMAN 3: Analisis Umum Sentimen (Sesuai Referensi Visual)
// ──────────────────────────────────────────────────────────────
function renderSentimentAnalysisPage(doc, stats, items = []) {
  doc.save();
  const startX = 40;
  const contentWidth = 515;
  const topY = 75;

  // Judul Utama Tebal & Besar
  doc.font('DMSans-Bold').fontSize(22).fillColor('#0f172a')
     .text('ANALISIS UMUM SENTIMEN', startX, topY);

  doc.font('DMSans-Regular').fontSize(10).fillColor('#64748b')
     .text('Proporsi Distribusi Sentimen dari Keseluruhan Temuan Pemantauan Media & Percakapan Publik', startX, topY + 28);

  // Perhitungan Persentase Aktual
  const total = items.length;
  let posCount = 0;
  let netCount = 0;
  let negCount = 0;

  items.forEach(it => {
    const s = getSentimentInfo(it).label;
    if (s === 'Positif') posCount++;
    else if (s === 'Negatif') negCount++;
    else netCount++;
  });

  const posPct = total > 0 ? Math.round((posCount / total) * 100) : 0;
  const netPct = total > 0 ? Math.round((netCount / total) * 100) : 0;
  const negPct = total > 0 ? Math.max(0, 100 - posPct - netPct) : 0;

  // Tiga Kategori Utama dengan Panah Oranye & Angka Besar
  // Posisi Y awal untuk ketiga blok
  const startBlockY = topY + 80;
  const blockGap = 90;

  const categories = [
    {
      name: 'Sentimen Positif',
      count: posCount,
      pct: posPct,
      color: '#10b981', // Emerald
      desc: 'Narasi apresiatif, prestasi, kemaslahatan, dan capaian program institusi'
    },
    {
      name: 'Sentimen Netral',
      count: netCount,
      pct: netPct,
      color: '#64748b', // Slate
      desc: 'Pelaporan berita faktual, liputan agenda rutin, dan rilis resmi informatif'
    },
    {
      name: 'Sentimen Negatif',
      count: negCount,
      pct: negPct,
      color: '#ef4444', // Red
      desc: 'Sorotan kritis, polemik, keluhan publik, atau isu yang memerlukan tindak lanjut'
    }
  ];

  categories.forEach((cat, idx) => {
    const y = startBlockY + (idx * blockGap);

    // Wadah baris kategori
    doc.roundedRect(startX, y - 10, contentWidth, 75, 8)
       .fillAndStroke('#ffffff', '#f1f5f9');

    // Label Kiri
    doc.font('DMSans-Bold').fontSize(16).fillColor('#0f172a')
       .text(cat.name, startX + 16, y + 6);

    doc.font('DMSans-Regular').fontSize(8.5).fillColor('#64748b')
       .text(`${cat.count} dari total ${total} temuan (${cat.pct}%)`, startX + 16, y + 27);

    doc.font('DMSans-Regular').fontSize(7.5).fillColor('#94a3b8')
       .text(cat.desc, startX + 16, y + 40, { width: 175 });

    // Garis Panah Oranye di Tengah (startX + 210 s/d startX + 370)
    const arrowStartX = startX + 205;
    const arrowEndX = startX + 380;
    const arrowY = y + 25;
    drawOrangeArrow(doc, arrowStartX, arrowY, arrowEndX, arrowY);

    // Angka Persentase Besar di Kanan
    doc.font('DMSans-Bold').fontSize(36).fillColor(cat.color)
       .text(`${cat.pct}%`, startX + 400, y + 6, {
         width: 100,
         align: 'right'
       });
  });

  // Kotak Ringkasan & Transparansi Metodologi (Bawah)
  const summaryBoxY = startBlockY + (3 * blockGap) + 15;
  doc.roundedRect(startX, summaryBoxY, contentWidth, 185, 8)
     .fillAndStroke('#f8fafc', '#e2e8f0');

  doc.font('DMSans-Bold').fontSize(11).fillColor('#1e1b4b')
     .text('CATATAN STATISTIK & METODOLOGI PERHITUNGAN', startX + 18, summaryBoxY + 16);

  const notes = [
    `•  Total Sampel Pemantauan: ${total} konten berita dan percakapan media sosial yang diproses secara dinamis.`,
    `•  Perhitungan Persentase: Menggunakan rumus matematis aktual (Jumlah Temuan per Kategori / Total Seluruh Temuan) × 100%, menghasilkan total agregat 100% secara akurat.`,
    `•  Pemisahan Metrik: Persentase sebaran sentimen di atas mengukur proporsi volume temuan, terpisah dari skor persentase keyakinan (confidence) model NLP pada masing-masing berita.`,
    `•  Distribusi Dominan: Didominasi oleh kategori ${posPct >= netPct && posPct >= negPct ? 'Sentimen Positif' : (netPct >= posPct && netPct >= negPct ? 'Sentimen Netral' : 'Sentimen Negatif')} (${Math.max(posPct, netPct, negPct)}%).`,
    `•  Validitas Data: Analisis ini dihimpun secara real-time dari database Prisma dan bebas dari rekayasa angka statis.`
  ];

  let noteY = summaryBoxY + 38;
  notes.forEach(nt => {
    doc.font('DMSans-Regular').fontSize(8.5).fillColor('#334155')
       .text(nt, startX + 18, noteY, { width: contentWidth - 36, lineGap: 3 });
    noteY += 25;
  });

  doc.restore();
}

// ──────────────────────────────────────────────────────────────
// HALAMAN 4: Rekomendasi Strategis (Sesuai 5 Poin Wajib)
// ──────────────────────────────────────────────────────────────
function renderStrategicRecommendationsPage(doc, rec, context) {
  doc.save();
  const startX = 40;
  const contentWidth = 515;
  let currentY = 75;

  // Judul Utama
  doc.font('DMSans-Bold').fontSize(20).fillColor('#0f172a')
     .text('REKOMENDASI STRATEGIS', startX, currentY);
  currentY += 26;

  doc.font('DMSans-Regular').fontSize(9.5).fillColor('#64748b')
     .text('Panduan Aksi Berdasarkan Pola Sentimen dan Dampak Percakapan Publik Terhadap Institusi', startX, currentY);
  currentY += 20;

  // Scenario Pill
  doc.roundedRect(startX, currentY, contentWidth, 24, 6)
     .fillAndStroke('#eff6ff', '#bfdbfe');
  doc.font('DMSans-Bold').fontSize(8.5).fillColor('#1d4ed8')
     .text(rec.title || 'Skenario Strategis Komunikasi Publik', startX + 12, currentY + 7);
  currentY += 32;

  // 5 Format Penyajian Rekomendasi
  const sections = [
    {
      num: '1',
      title: 'Ringkasan Kondisi Sentimen',
      content: rec.summary
    },
    {
      num: '2',
      title: 'Interpretasi Temuan Utama',
      content: rec.interpretation
    },
    {
      num: '3',
      title: 'Risiko dan Peluang yang Perlu Diperhatikan',
      content: rec.risksAndOpportunities
    },
    {
      num: '4',
      title: 'Rekomendasi Tindakan Prioritas',
      content: rec.priorityActions
    },
    {
      num: '5',
      title: 'Langkah Tindak Lanjut dan Pemantauan',
      content: rec.followUp
    }
  ];

  sections.forEach(sec => {
    doc.font('DMSans-Bold').fontSize(9.5).fillColor('#1e1b4b')
       .text(`${sec.num}. ${sec.title}`, startX, currentY);
    currentY += 13;

    doc.font('DMSans-Regular').fontSize(8.2).fillColor('#334155')
       .text(sec.content, startX + 12, currentY, {
         width: contentWidth - 16,
         lineGap: 2.5
       });

    const textHeight = doc.heightOfString(sec.content, {
      width: contentWidth - 16,
      lineGap: 2.5
    });
    currentY += textHeight + 10;
  });

  // Blok Pengesahan Tim Analis / Kehumasan di Kanan Bawah
  const signY = 710;
  doc.font('DMSans-Regular').fontSize(8).fillColor('#64748b')
     .text(`Yogyakarta, ${context.todayFormatted}`, startX + 310, signY, { width: 195, align: 'right' });

  doc.font('DMSans-Bold').fontSize(8.5).fillColor('#1e1b4b')
     .text('Pusat Syiar Digital Muhammadiyah (PSDM)', startX + 310, signY + 12, { width: 195, align: 'right' });

  doc.font('DMSans-Regular').fontSize(7.5).fillColor('#94a3b8')
     .text(`Analis: ${context.currentUser}`, startX + 310, signY + 24, { width: 195, align: 'right' });

  doc.restore();
}

module.exports = {
  buildPDFReport,
  formatIndonesianDate
};
