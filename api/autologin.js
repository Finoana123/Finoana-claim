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

  // Fonction utilitaire pour appeler FlareSolverr avec retry (réveil du service)
  async function callFlareSolverr(payload, retries = 2) {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(`${FLARESOLVERR_URL}/v1`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        if (data.status !== 'ok') {
          throw new Error(`FlareSolverr status: ${data.message || 'unknown'}`);
        }
        return data;
      } catch (err) {
        console.warn(`⚠️ Tentative ${i + 1}/${retries} échouée: ${err.message}`);
        if (i === retries - 1) throw err;
        // Attendre 5 secondes avant de réessayer (temps de réveil)
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  try {
    let sessionCookie = null;

    if (platform === 'TronPick') {
      console.log('🚀 Début autologin TronPick');

      // 1. Obtenir les cookies Cloudflare via FlareSolverr
      console.log('📡 Appel FlareSolverr pour https://tronpick.io/login');
      const flarePayload = {
        cmd: 'request.get',
        url: 'https://tronpick.io/login',
        maxTimeout: 120000
      };
      if (proxy) {
        flarePayload.proxy = { url: proxy };
      }

      const flareData = await callFlareSolverr(flarePayload);
      console.log('✅ Page login récupérée avec succès');

      const flareCookies = flareData.solution.cookies;
      const cookieString = flareCookies.map(c => `${c.name}=${c.value}`).join('; ');
      console.log(`🍪 Cookies Cloudflare: ${flareCookies.length} cookie(s)`);

      // 2. Effectuer la connexion
      // ⚠️ Ces valeurs sont des suppositions. Si 404 ou 400, on adaptera après inspection.
      const loginUrl = 'https://tronpick.io/api/login';
      const payload = {
        email: email,
        password: password,
        remember: true
      };

      console.log(`🔑 Envoi requête POST vers ${loginUrl}`);
      const loginRes = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': cookieString,
          'User-Agent': USER_AGENT,
          'Referer': 'https://tronpick.io/login',
          'Origin': 'https://tronpick.io',
          'Accept': 'application/json, text/plain, */*'
        },
        body: JSON.stringify(payload),
        redirect: 'manual'
      });

      console.log(`📬 Réponse login: ${loginRes.status} ${loginRes.statusText}`);

      // 3. Extraire le cookie de session
      const setCookieHeader = loginRes.headers.get('set-cookie');
      if (setCookieHeader) {
        console.log('🔎 Set-Cookie header présent');
        // Recherche par patterns connus
        const patterns = [
          /(tronpick_session=[^;]+)/i,
          /(session=[^;]+)/i,
          /(laravel_session=[^;]+)/i,
          /(PHPSESSID=[^;]+)/i
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
        console.log(`🍪 Cookie extrait: ${sessionCookie ? sessionCookie.substring(0, 30) + '...' : 'aucun'}`);
      }

      // Fallback : cookie dans le corps de la réponse (token)
      if (!sessionCookie) {
        try {
          const clone = loginRes.clone();
          const loginData = await clone.json();
          if (loginData.token || loginData.access_token || loginData.session) {
            const tokenVal = loginData.token || loginData.access_token || loginData.session;
            sessionCookie = `token=${tokenVal}`;
            console.log('🍪 Cookie extrait du corps JSON');
          }
        } catch (e) {
          console.log('ℹ️ Corps de réponse non JSON');
        }
      }

      if (!sessionCookie) {
        // Log de débogage : afficher les headers complets (sans données sensibles)
        const headersList = [];
        loginRes.headers.forEach((val, key) => headersList.push(`${key}: ${val}`));
        console.log('📋 Headers reçus:', headersList);
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
