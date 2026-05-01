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

// OCR simple (sans prétraitement pour le moment)
async function ocrSpace(buffer) {
  const form = new FormData();
  form.append('apikey', OCR_API_KEY);
  form.append('file', buffer, {
    filename: 'image.png',
    contentType: 'image/png'
  });
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
  if (data.IsErroredOnProcessing) {
    throw new Error(data.ErrorMessage || 'Erreur OCR');
  }
  if (!data.ParsedResults || data.ParsedResults.length === 0) {
    throw new Error('Aucun résultat OCR');
  }
  return data.ParsedResults[0].ParsedText;
}

module.exports = async (req, res) => {
  // 🔁 Toujours renvoyer du JSON, même en cas d'erreur
  const sendError = (message, status = 500) => {
    console.error(message);
    res.status(status).json({ error: message });
  };

  if (req.method !== 'POST') {
    return sendError('Méthode non autorisée', 405);
  }

  try {
    // 1. Récupérer les deux fichiers
    const { oddsBuffer, resultsBuffer } = await parseMultipart(req);

    // 2. Envoyer directement les images à OCR.space (sans sharp pour l'instant)
    const [oddsText, resultsText] = await Promise.all([
      ocrSpace(oddsBuffer).catch(e => ({ error: e.message })),
      ocrSpace(resultsBuffer).catch(e => ({ error: e.message }))
    ]);

    // 3. Renvoyer les textes bruts (ou les erreurs)
    res.status(200).json({
      matches: [],   // pas d'extraction pour le moment
      debug: {
        oddsText: typeof oddsText === 'string' ? oddsText : '',
        resultsText: typeof resultsText === 'string' ? resultsText : '',
        oddsError: typeof oddsText !== 'string' ? oddsText.error : null,
        resultsError: typeof resultsText !== 'string' ? resultsText.error : null
      }
    });
  } catch (error) {
    sendError(error.message || 'Erreur inconnue');
  }
};
