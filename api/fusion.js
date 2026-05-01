const sharp = require('sharp');
const fetch = require('node-fetch');
const FormData = require('form-data');
const busboy = require('busboy');

const OCR_API_KEY = process.env.OCR_SPACE_API_KEY;

// Parser multipart avec busboy
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const files = {};
    const bb = busboy({ headers: req.headers });
    bb.on('file', (fieldname, file) => {
      const chunks = [];
      file.on('data', (chunk) => chunks.push(chunk));
      file.on('end', () => {
        files[fieldname] = Buffer.concat(chunks);
      });
    });
    bb.on('finish', () => {
      if (!files.oddsImage || !files.resultsImage) {
        reject(new Error('Deux images sont requises (oddsImage, resultsImage)'));
      } else {
        resolve({ oddsBuffer: files.oddsImage, resultsBuffer: files.resultsImage });
      }
    });
    bb.on('error', reject);
    req.pipe(bb);
  });
}

// Prétraitement
async function preprocessImage(buffer) {
  return await sharp(buffer)
    .resize(1200)
    .grayscale()
    .normalize()
    .sharpen()
    .threshold(128)
    .png()
    .toBuffer();
}

// OCR
async function ocrSpace(buffer) {
  const form = new FormData();
  form.append('apikey', OCR_API_KEY);
  form.append('file', buffer, { filename: 'image.png', contentType: 'image/png' });
  form.append('language', 'eng');
  form.append('isOverlayRequired', 'false');
  form.append('scale', 'true');
  form.append('OCREngine', '2');

  const res = await fetch('https://api.ocr.space/Parse/Image', {
    method: 'POST',
    body: form,
    headers: form.getHeaders()
  });
  const data = await res.json();
  if (data.IsErroredOnProcessing || !data.ParsedResults || !data.ParsedResults.length) {
    throw new Error(data.ErrorMessage || 'OCR failed');
  }
  return data.ParsedResults[0].ParsedText;
}

// Nettoyage des noms
const STOP_WORDS = new Set(['se', 'connecter', 'inscrire', 's\'inscrire', 'menu', 'virtuel', 'mes', 'paris']);
function cleanName(str) {
  let name = str.replace(/[^A-Za-z '-]/g, ' ').trim();
  let tokens = name.split(/\s+/).filter(w => w.length >= 2 && !STOP_WORDS.has(w.toLowerCase()));
  if (tokens.length === 0) return '';
  tokens = tokens.map(t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
  return tokens.join(' ');
}

const normalize = s => s.toLowerCase().replace(/[^a-z]/g, '');

// Extraction des cotes
function extractOdds(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const matches = [];
  const numberLines = [];
  lines.forEach((line, idx) => {
    const nums = line.match(/\d+[.,]\d+/g);
    if (nums) numberLines.push({ idx, nums: nums.map(n => n.replace(',', '.')) });
  });

  const groups = [];
  for (const item of numberLines) {
    if (groups.length === 0 || item.idx - groups[groups.length-1].at(-1).idx > 2) {
      groups.push([item]);
    } else {
      groups[groups.length-1].push(item);
    }
  }

  for (const group of groups) {
    const allOdds = group.flatMap(g => g.nums);
    const odds = allOdds.slice(0, 3);
    if (odds.length < 2) continue;

    const firstIdx = group[0].idx;
    const teamLines = [];
    for (let j = firstIdx - 1; j >= 0 && teamLines.length < 2; j--) {
      const line = lines[j];
      if (/^\d+[.,]\d+$/.test(line) || cleanName(line) === '') continue;
      teamLines.unshift(cleanName(line));
    }

    if (teamLines.length >= 2) {
      const homeOdd = odds[0];
      const drawOdd = odds.length === 3 ? odds[1] : null;
      const awayOdd = odds.length === 3 ? odds[2] : odds[1];
      matches.push({
        team1: teamLines[0],
        team2: teamLines[1],
        homeOdd,
        drawOdd,
        awayOdd
      });
    }
  }
  return matches;
}

// Extraction des résultats
function extractResults(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const results = {};
  const pattern1 = /([A-Za-z .'-]+?)\s*[\[\(]\s*(\d+)\s*[-:]\s*(\d+)\s*[\]\)]\s+([A-Za-z .'-]+)/;
  const pattern2 = /([A-Za-z .'-]+?)\s+(\d+)\s*[-:]\s*(\d+)\s+([A-Za-z .'-]+)/;

  for (const line of lines) {
    let m = line.match(pattern1) || line.match(pattern2);
    if (m) {
      const team1 = cleanName(m[1]);
      const score = `${m[2]}-${m[3]}`;
      const team2 = cleanName(m[4]);
      if (team1 && team2) {
        results[normalize(team1)] = score;
        results[normalize(team2)] = score;
      }
    }
  }
  return results;
}

// Handler principal
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const { oddsBuffer, resultsBuffer } = await parseMultipart(req);

    // Prétraiter
    const [oddsProcessed, resultsProcessed] = await Promise.all([
      preprocessImage(oddsBuffer),
      preprocessImage(resultsBuffer)
    ]);

    // OCR
    const [oddsText, resultsText] = await Promise.all([
      ocrSpace(oddsProcessed),
      ocrSpace(resultsProcessed)
    ]);

    // Extraire
    const matches = extractOdds(oddsText);
    const results = extractResults(resultsText);

    // Fusion et calculs
    matches.forEach(m => {
      const key1 = normalize(m.team1);
      const key2 = normalize(m.team2);
      m.result = results[key1] || results[key2] || '–';
      const h = parseFloat(m.homeOdd);
      const d = parseFloat(m.drawOdd);
      const a = parseFloat(m.awayOdd);
      if (!isNaN(h) && !isNaN(d) && !isNaN(a)) {
        m.sum12 = (h + a).toFixed(2);
        m.sum1N2 = (h + d + a).toFixed(2);
        m.mean = ((h + d + a) / 3).toFixed(2);
      } else if (!isNaN(h) && !isNaN(a)) {
        m.sum12 = (h + a).toFixed(2);
        m.sum1N2 = '–';
        m.mean = '–';
      } else {
        m.sum12 = '–'; m.sum1N2 = '–'; m.mean = '–';
      }
    });

    // Réponse avec debug
    res.status(200).json({
      matches,
      debug: {
        oddsText,
        resultsText,
        oddsMatchCount: matches.length,
        resultsCount: Object.keys(results).length
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
};
