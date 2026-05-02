const fetch = require('node-fetch');
const FormData = require('form-data');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

    const form = new FormData();
    form.append('apikey', process.env.OCR_SPACE_API_KEY);
    form.append('file', buffer, { filename: 'image.png', contentType: 'image/png' });
    form.append('language', 'fre');  // français
    form.append('OCREngine', 2);

    const ocrRes = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });
    const data = await ocrRes.json();
    const text = data.ParsedResults?.[0]?.ParsedText || '';
    return res.json({ text });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
