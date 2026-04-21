// /api/autologin.js
import * as cheerio from 'cheerio';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée, utilisez POST' });
  }

  const { email, password, platform, proxy } = req.body;

  if (!email || !password || !platform) {
    return res.status(400).json({ error: 'Champs manquants : email, password, platform' });
  }

  const FLARESOLVERR_URL = 'https://flaresolverr-wekb.onrender.com';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  // Fonction pour appeler FlareSolverr avec retry
  async function callFlareSolverr(payload, retries = 2) {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(`${FLARESOLVERR_URL}/v1`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (data.status !== 'ok') throw new Error(`FlareSolverr: ${data.message || 'unknown'}`);
        return data;
      } catch (err) {
        console.warn(`⚠️ Tentative ${i + 1}/${retries} échouée: ${err.message}`);
        if (i === retries - 1) throw err;
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  try {
    let sessionCookie = null;

    if (platform === 'TronPick') {
      console.log('🚀 Début autologin TronPick avec extraction CSRF');

      // 1. Récupérer la page de login via FlareSolverr
      const flarePayload = {
        cmd: 'request.get',
        url: 'https://tronpick.io/login',
        maxTimeout: 120000
      };
      if (proxy) {
        flarePayload.proxy = { url: proxy };
      }

      const flareData = await callFlareSolverr(flarePayload);
      const flareCookies = flareData.solution.cookies;
      const cookieString = flareCookies.map(c => `${c.name}=${c.value}`).join('; ');
      const pageHtml = flareData.solution.response;
      console.log(`📄 Page login chargée (${pageHtml.length} octets)`);

      // 2. Extraire le token CSRF avec cheerio
      const $ = cheerio.load(pageHtml);
      let csrfToken = $('meta[name="csrf-token"]').attr('content') ||
                      $('meta[name="csrf_token"]').attr('content') ||
                      $('input[name="_token"]').val() ||
                      $('input[name="csrf_token"]').val() ||
                      $('input[name="csrf-token"]').val() ||
                      $('input[name="__RequestVerificationToken"]').val();
      
      if (csrfToken) {
        console.log(`🔑 Token CSRF trouvé: ${csrfToken.substring(0, 20)}...`);
      } else {
        console.log('ℹ️ Aucun token CSRF détecté dans la page');
      }

      // 3. Déterminer l'URL de soumission du formulaire
      const formAction = $('form').attr('action');
      const loginUrl = formAction 
        ? new URL(formAction, 'https://tronpick.io').href 
        : 'https://tronpick.io/login';
      console.log(`🎯 URL de login: ${loginUrl}`);

      // 4. Déterminer la méthode (POST/GET) et le type de contenu
      const formMethod = ($('form').attr('method') || 'POST').toUpperCase();
      const enctype = $('form').attr('enctype') || 'application/x-www-form-urlencoded';
      
      // 5. Construire le payload selon l'enctype
      let payload, headersContentType;
      const basePayload = {
        email: email,
        password: password,
        remember: 'on'
      };
      if (csrfToken) {
        basePayload._token = csrfToken;
      }

      if (enctype.includes('json') || loginUrl.includes('/api')) {
        payload = JSON.stringify(basePayload);
        headersContentType = 'application/json';
      } else {
        // application/x-www-form-urlencoded
        payload = Object.keys(basePayload)
          .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(basePayload[key])}`)
          .join('&');
        headersContentType = 'application/x-www-form-urlencoded';
      }

      console.log(`📤 Envoi ${formMethod} vers ${loginUrl} (${headersContentType})`);

      // 6. Envoyer la requête de connexion
      const loginRes = await fetch(loginUrl, {
        method: formMethod,
        headers: {
          'Content-Type': headersContentType,
          'Cookie': cookieString,
          'User-Agent': USER_AGENT,
          'Referer': 'https://tronpick.io/login',
          'Origin': 'https://tronpick.io',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Upgrade-Insecure-Requests': '1'
        },
        body: payload,
        redirect: 'manual'
      });

      console.log(`📬 Réponse login: ${loginRes.status} ${loginRes.statusText}`);

      // 7. Extraire le cookie de session depuis les headers ou la réponse
      const setCookieHeader = loginRes.headers.get('set-cookie');
      if (setCookieHeader) {
        console.log('🍪 Set-Cookie présent');
        const patterns = [
          /(tronpick_session=[^;]+)/i,
          /(session=[^;]+)/i,
          /(laravel_session=[^;]+)/i,
          /(PHPSESSID=[^;]+)/i,
          /(sid=[^;]+)/i,
          /(auth=[^;]+)/i
        ];
        for (const pattern of patterns) {
          const match = setCookieHeader.match(pattern);
          if (match) {
            sessionCookie = match[1];
            break;
          }
        }
        if (!sessionCookie) {
          sessionCookie = setCookieHeader.split(';')[0];
        }
        console.log(`✅ Cookie extrait: ${sessionCookie.substring(0, 30)}...`);
      }

      // Fallback : si la réponse est une redirection (302) et qu'on a un cookie de session
      if (!sessionCookie && loginRes.status === 302) {
        // Parfois le cookie est défini dans la réponse de redirection
        const location = loginRes.headers.get('location');
        console.log(`↪️ Redirection vers: ${location}`);
        // On peut considérer que le cookie de session est déjà dans les cookies de FlareSolverr
        // Récupérons tous les cookies actuels
        const allCookies = flareCookies.map(c => `${c.name}=${c.value}`).join('; ');
        sessionCookie = allCookies;
      }

      if (!sessionCookie) {
        // Dernier recours : regarder si un token est renvoyé dans le corps
        const responseText = await loginRes.text();
        const tokenMatch = responseText.match(/"token":"([^"]+)"/) || 
                          responseText.match(/"access_token":"([^"]+)"/) ||
                          responseText.match(/token=([^&]+)/);
        if (tokenMatch) {
          sessionCookie = `token=${tokenMatch[1]}`;
          console.log('🍪 Token extrait du corps de réponse');
        }
      }

      if (!sessionCookie) {
        throw new Error('Aucun cookie de session trouvé dans la réponse');
      }

    } else {
      return res.status(400).json({ error: `Plateforme "${platform}" non supportée` });
    }

    console.log('✅ Autologin terminé avec succès');
    return res.status(200).json({ success: true, cookie: sessionCookie });

  } catch (error) {
    console.error('❌ Erreur autologin:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
