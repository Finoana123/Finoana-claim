// /api/autologin.js
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
        if (data.status !== 'ok') throw new Error(`FlareSolverr status: ${data.message || 'unknown'}`);
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
    const debugInfo = {};

    if (platform === 'TronPick') {
      console.log('🚀 Début autologin TronPick');

      // Étape 1 : Obtenir la page de login via FlareSolverr
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
      debugInfo.flareCookiesCount = flareCookies.length;
      console.log(`🍪 Cookies Cloudflare: ${flareCookies.length}`);

      // Étape 2 : Essayer plusieurs combinaisons d'URL et payload (les plus courantes)
      const loginAttempts = [
        {
          url: 'https://tronpick.io/login',
          payload: { email, password, remember: true },
          headers: { 'Content-Type': 'application/json' }
        },
        {
          url: 'https://tronpick.io/api/login',
          payload: { email, password, remember: true },
          headers: { 'Content-Type': 'application/json' }
        },
        {
          url: 'https://tronpick.io/login',
          payload: `email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}&remember=1`,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        },
        {
          url: 'https://tronpick.io/api/auth/login',
          payload: { email, password },
          headers: { 'Content-Type': 'application/json' }
        }
      ];

      let loginRes;
      let successAttempt = null;

      for (const attempt of loginAttempts) {
        try {
          console.log(`🔑 Essai POST ${attempt.url} (${attempt.headers['Content-Type']})`);
          const res = await fetch(attempt.url, {
            method: 'POST',
            headers: {
              ...attempt.headers,
              'Cookie': cookieString,
              'User-Agent': USER_AGENT,
              'Referer': 'https://tronpick.io/login',
              'Origin': 'https://tronpick.io',
              'Accept': 'application/json, text/plain, */*'
            },
            body: typeof attempt.payload === 'string' ? attempt.payload : JSON.stringify(attempt.payload),
            redirect: 'manual'
          });
          debugInfo.loginStatus = res.status;
          debugInfo.loginUrl = attempt.url;
          console.log(`📬 Réponse login: ${res.status} ${res.statusText}`);

          // Vérifier si on a un cookie
          const setCookie = res.headers.get('set-cookie');
          if (setCookie) {
            loginRes = res;
            successAttempt = attempt;
            console.log(`✅ Set-Cookie trouvé pour ${attempt.url}`);
            break;
          }
          // Sinon, on continue
        } catch (e) {
          console.warn(`❌ Échec pour ${attempt.url}: ${e.message}`);
        }
      }

      if (!loginRes || !successAttempt) {
        throw new Error(`Aucune des ${loginAttempts.length} tentatives n'a retourné de cookie. Status: ${debugInfo.loginStatus || 'inconnu'}`);
      }

      // Extraire le cookie
      const setCookieHeader = loginRes.headers.get('set-cookie');
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

      if (!sessionCookie) {
        // Dernier espoir : regarder dans le corps
        const bodyText = await loginRes.text();
        debugInfo.responseBody = bodyText.substring(0, 200);
        const tokenMatch = bodyText.match(/"token":"([^"]+)"/) || bodyText.match(/"access_token":"([^"]+)"/);
        if (tokenMatch) {
          sessionCookie = `token=${tokenMatch[1]}`;
        } else {
          throw new Error('Aucun cookie ou token trouvé dans la réponse');
        }
      }

      console.log(`🍪 Cookie final: ${sessionCookie.substring(0, 40)}...`);

    } else {
      return res.status(400).json({ error: `Plateforme "${platform}" non supportée` });
    }

    return res.status(200).json({ success: true, cookie: sessionCookie, debug: debugInfo });

  } catch (error) {
    console.error('❌ Erreur autologin:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
