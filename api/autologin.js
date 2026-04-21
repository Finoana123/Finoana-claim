// /api/autologin.js - Login via FlareSolverr (fonctionnel)
import * as cheerio from 'cheerio';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const { email, password, platform, proxy, userId } = req.body;
  if (!email || !password || !platform || !userId) {
    return res.status(400).json({ error: 'Champs manquants' });
  }

  const FLARESOLVERR_URL = 'https://flaresolverr-wekb.onrender.com';
  const USER_AGENT = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36';

  async function callFlareSolverr(payload, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(`${FLARESOLVERR_URL}/v1`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (data.status !== 'ok') throw new Error(data.message || 'FlareSolverr failed');
        return data;
      } catch (err) {
        if (i === retries - 1) throw err;
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }

  try {
    // 1. Charger la page de login via FlareSolverr (avec proxy)
    const loginPageUrl = 'https://tronpick.io/login';
    const flarePayload = {
      cmd: 'request.get',
      url: loginPageUrl,
      maxTimeout: 120000
    };
    if (proxy) {
      flarePayload.proxy = { url: proxy };
    }

    const flareData = await callFlareSolverr(flarePayload);
    const flareCookies = flareData.solution.cookies;
    const cookieString = flareCookies.map(c => `${c.name}=${c.value}`).join('; ');
    const pageHtml = flareData.solution.response;

    // 2. Extraire le token CSRF
    const $ = cheerio.load(pageHtml);
    let csrfToken = $('meta[name="csrf-token"]').attr('content') ||
                    $('input[name="_token"]').val() ||
                    $('input[name="csrf_token"]').val();

    const formAction = $('form').attr('action');
    const loginUrl = formAction ? new URL(formAction, loginPageUrl).href : loginPageUrl;

    // 3. Construire le payload de connexion
    const loginPayload = new URLSearchParams();
    loginPayload.append('email', email);
    loginPayload.append('password', password);
    loginPayload.append('remember', '1');
    if (csrfToken) loginPayload.append('_token', csrfToken);

    // 4. Envoyer la requête de login
    const loginResData = await callFlareSolverr({
      cmd: 'request.post',
      url: loginUrl,
      maxTimeout: 120000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookieString,
        'User-Agent': USER_AGENT,
        'Referer': loginPageUrl,
        'Origin': 'https://tronpick.io'
      },
      postData: loginPayload.toString()
    });

    // 5. Extraire le cookie de session
    const setCookieHeader = loginResData.solution.headers['set-cookie'];
    let sessionCookie = null;
    if (setCookieHeader) {
      const match = setCookieHeader.match(/(tronpick_session=[^;]+)/i) ||
                    setCookieHeader.match(/(session=[^;]+)/i) ||
                    setCookieHeader.match(/(laravel_session=[^;]+)/i);
      if (match) sessionCookie = match[1];
      else sessionCookie = setCookieHeader.split(';')[0];
    }

    if (!sessionCookie) {
      throw new Error('Aucun cookie de session trouvé');
    }

    return res.status(200).json({
      success: true,
      cookie: sessionCookie
    });

  } catch (error) {
    console.error('Erreur autologin:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
