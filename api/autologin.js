// /api/autologin.js
export default async function handler(req, res) {
  // 1. Vérifier la méthode HTTP
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée, utilisez POST' });
  }

  // 2. Récupérer les données du corps de la requête
  const { email, password, platform, proxy } = req.body;

  // 3. Valider les champs obligatoires
  if (!email || !password || !platform) {
    return res.status(400).json({ error: 'Champs manquants : email, password, platform' });
  }

  // 4. URL de ton FlareSolverr sur Render
  const FLARESOLVERR_URL = 'https://flaresolverr-wekb.onrender.com';

  // 5. Configuration des headers HTTP réalistes
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  try {
    let sessionCookie = null;

    // 6. Logique par plateforme
    if (platform === 'TronPick') {
      // --- Étape 6.1 : Contourner Cloudflare avec FlareSolverr ---
      console.log('🔐 Demande à FlareSolverr de charger la page de login...');
      
      const flarePayload = {
        cmd: 'request.get',
        url: 'https://tronpick.io/login',
        maxTimeout: 60000,
        // Optionnel : si tu as un proxy, tu peux l'ajouter ici plus tard
      };

      // Ajout du proxy si fourni (format attendu par FlareSolverr : http://user:pass@host:port)
      if (proxy) {
        flarePayload.proxy = { url: proxy };
      }

      const flareRes = await fetch(`${FLARESOLVERR_URL}/v1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(flarePayload)
      });

      const flareData = await flareRes.json();
      
      if (!flareRes.ok) {
        throw new Error(`FlareSolverr erreur HTTP ${flareRes.status}`);
      }
      if (flareData.status !== 'ok') {
        throw new Error(`FlareSolverr échec : ${flareData.message || 'défi non résolu'}`);
      }

      console.log('✅ Page de login chargée, cookies Cloudflare obtenus.');

      // 6.2 Extraire les cookies de session fournis par FlareSolverr
      const flareCookies = flareData.solution.cookies;
      const cookieString = flareCookies.map(c => `${c.name}=${c.value}`).join('; ');

      // 6.3 Préparer la requête de connexion (valeurs à adapter après inspection réelle)
      // Pour le moment, on utilise des valeurs probables pour TronPick.
      // Si cela ne fonctionne pas, il faudra ajuster loginUrl et payload.
      const loginUrl = 'https://tronpick.io/api/login';
      const payload = {
        email: email,
        password: password,
        remember: true
      };

      console.log('🔑 Tentative de connexion à TronPick...');

      // 6.4 Envoyer la requête de connexion avec les cookies Cloudflare
      const loginRes = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': cookieString,
          'User-Agent': userAgent,
          'Referer': 'https://tronpick.io/login',
          'Origin': 'https://tronpick.io',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'fr,fr-FR;q=0.9,en;q=0.8'
        },
        body: JSON.stringify(payload),
        redirect: 'manual' // Ne pas suivre automatiquement les redirections
      });

      console.log(`📡 Réponse login : ${loginRes.status}`);

      // 6.5 Extraire le cookie de session
      // D'abord essayer depuis l'en-tête 'set-cookie'
      const setCookieHeader = loginRes.headers.get('set-cookie');
      if (setCookieHeader) {
        // Chercher un cookie nommé 'tronpick_session', 'session', 'token', etc.
        const patterns = [
          /(tronpick_session=[^;]+)/i,
          /(session=[^;]+)/i,
          /(laravel_session=[^;]+)/i, // au cas où ce serait Laravel
          /(PHPSESSID=[^;]+)/i
        ];
        for (const pattern of patterns) {
          const match = setCookieHeader.match(pattern);
          if (match) {
            sessionCookie = match[1];
            break;
          }
        }
        // Si aucun pattern ne correspond, on prend le premier cookie
        if (!sessionCookie) {
          sessionCookie = setCookieHeader.split(';')[0];
        }
        console.log('🍪 Cookie extrait de Set-Cookie');
      }

      // Si pas de cookie dans les headers, regarder dans le corps JSON
      if (!sessionCookie) {
        try {
          const loginData = await loginRes.json();
          if (loginData.token || loginData.access_token || loginData.session) {
            const tokenValue = loginData.token || loginData.access_token || loginData.session;
            sessionCookie = `token=${tokenValue}`;
            console.log('🍪 Cookie extrait du corps JSON');
          }
        } catch (e) {
          // Le corps n'est pas du JSON, on ignore
        }
      }

      // Si toujours pas de cookie, erreur
      if (!sessionCookie) {
        throw new Error('Aucun cookie de session trouvé dans la réponse');
      }

      console.log('✅ Cookie de session obtenu avec succès.');

    } else {
      // Plateforme non prise en charge
      return res.status(400).json({ error: `Plateforme "${platform}" non supportée pour le moment.` });
    }

    // 7. Renvoyer le cookie au frontend
    return res.status(200).json({
      success: true,
      cookie: sessionCookie
    });

  } catch (error) {
    console.error('❌ Erreur dans autologin.js:', error.message);
    return res.status(500).json({
      error: error.message || 'Erreur interne du serveur'
    });
  }
}
