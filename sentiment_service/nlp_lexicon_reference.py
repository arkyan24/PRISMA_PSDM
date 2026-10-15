"""
Reference implementation of the previous Lexicon / Dictionary engine
Used for exact baseline comparison in benchmark.py.
"""

import re

SLANG_DICTIONARY = {
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
}

INTENSIFIERS = {
    'sangat': 1.8, 'amat': 1.6, 'sungguh': 1.5, 'benar': 1.4, 'bener': 1.4,
    'teramat': 1.8, 'luar biasa': 2.0, 'paling': 1.8, 'terlalu': 1.5,
    'makin': 1.3, 'semakin': 1.3, 'begitu': 1.3, 'betul': 1.4, 'mutlak': 1.7
}

NEGATIONS = {'tidak', 'bukan', 'belum', 'jangan', 'tanpa', 'kurang', 'tiada', 'nihil', 'jarang'}

SENTIMENT_WEIGHTS = {
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
}

def tokenize_and_normalize(text: str):
    if not text:
        return []
    clean = re.sub(r'<[^>]*>', ' ', text)
    clean = re.sub(r'https?://\S+', ' ', clean)
    clean = re.sub(r'@[a-zA-Z0-9_.]+', ' ', clean)
    clean = re.sub(r'#[a-zA-Z0-9_]+', ' ', clean)
    clean = clean.lower()
    clean = re.sub(r'[^\w\s-]', ' ', clean)
    clean = re.sub(r'\s+', ' ', clean).strip()

    raw_tokens = [t for t in clean.split() if t]
    normalized_tokens = []
    for token in raw_tokens:
        sub = token.strip('-')
        norm = SLANG_DICTIONARY.get(sub, sub)
        if ' ' in norm:
            normalized_tokens.extend(norm.split())
        else:
            normalized_tokens.append(norm)
    return normalized_tokens

def analyze_sentiment_lexicon(text: str) -> str:
    tokens = tokenize_and_normalize(text)
    if not tokens:
        return 'netral'

    total_score = 0.0
    negation_active = 0
    current_multiplier = 1.0

    for word in tokens:
        if word in NEGATIONS:
            negation_active = 3
            continue
        if word in INTENSIFIERS:
            current_multiplier = INTENSIFIERS[word]
            continue
        if word in SENTIMENT_WEIGHTS:
            weight = SENTIMENT_WEIGHTS[word] * current_multiplier
            if negation_active > 0:
                weight = -weight * 0.85
            total_score += weight
            current_multiplier = 1.0
        if negation_active > 0:
            negation_active -= 1

    threshold = 0.5
    if total_score > threshold:
        return 'positif'
    elif total_score < -threshold:
        return 'negatif'
    else:
        return 'netral'
