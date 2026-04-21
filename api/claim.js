// /api/claim.js - Claim TronPick via FlareSolverr (indépendant)
import * as cheerio from 'cheerio';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const { userId, proxy } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'userId manquant' });
  }

  const FLARESOLVERR_URL = 'https://flaresolverr-wekb.onrender.com';
  const USER_AGENT = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36';

  // Fonction robuste pour appeler FlareSolverr
  async function callFlareSolverr(payload, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000);

        const response = await fetch(`${FLARESOLVERR_URL}/v1`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`HTTP ${response.status}: ${text.substring(0, 100)}`);
        }

        const data = await response.json();
        if (data.status !== 'ok') throw new Error(data.message || 'FlareSolverr failed');
        return data;
      } catch (err) {
        if (i === retries - 1) throw err;
        await new Promise(r => setTimeout(r, 5000 * (i + 1)));
      }
    }
  }

  try {
    // 1. Récupérer le cookie de session depuis GitHub
    const configUrl = `https://raw.githubusercontent.com/Finoana123/Finoana-claim/main/configs/${userId}.json`;
    const configRes = await fetch(configUrl);
    if (!configRes.ok) throw new Error(`Config introuvable pour ${userId}`);
    const config = await configRes.json();
    const sessionCookie = config.cookie;
    console.log(`🍪 Cookie chargé: ${sessionCookie.substring(0, 30)}...`);

    // 2. Charger faucet.php (avec proxy)
    const faucetUrl = 'https://tronpick.io/faucet.php';
    console.log(`🌐 Chargement ${faucetUrl}`);

    const faucetPayload = {
      cmd: 'request.get',
      url: faucetUrl,
      maxTimeout: 60000,
      headers: {
        'Cookie': sessionCookie,
        'User-Agent': USER_AGENT
      }
    };
    if (proxy && proxy.trim() !== '') {
      faucetPayload.proxy = { url: proxy };
    }

    const faucetData = await callFlareSolverr(faucetPayload);
    const pageHtml = faucetData.solution.response;
    const pageCookies = faucetData.solution.cookies;

    // Fusionner les cookies
    const allCookies = pageCookies.map(c => `${c.name}=${c.value}`).join('; ');
    const combinedCookie = allCookies ? `${allCookies}; ${sessionCookie}` : sessionCookie;

    // 3. Pause de 20 secondes pour imiter un humain
    console.log('⏳ Pause de 20 secondes...');
    await new Promise(r => setTimeout(r, 20000));

    // 4. Extraire les données de claim
    const $ = cheerio.load(pageHtml);
    let csrfToken = pageCookies?.find(c => c.name === 'csrf_cookie_name')?.value ||
                    $('input[name="csrf_test_name"]').val();
    const hash = $('input[name="hash"]').val();
    const captchaResponse = $('input[name="c_captcha_response"]').val();

    if (!csrfToken || !hash || !captchaResponse) {
      throw new Error('Données de claim manquantes dans la page');
    }

    // 5. Construire le payload
    const claimPayload = new URLSearchParams();
    claimPayload.append('action', 'claim_hourly_faucet');
    claimPayload.append('hash', hash);
    claimPayload.append('captcha_type', '3');
    claimPayload.append('c_captcha_response', captchaResponse);
    claimPayload.append('csrf_test_name', csrfToken);
    claimPayload.append('g-recaptcha-response', '');
    claimPayload.append('_iconcaptcha-token', '');
    claimPayload.append('ic-rq', '');
    claimPayload.append('ic-wid', '');
    claimPayload.append('ic-cid', '');
    claimPayload.append('ic-hp', '');
    claimPayload.append('h-captcha-response', '');
    claimPayload.append('pcaptcha_token', '');
    claimPayload.append('ft', '');

    // 6. Envoyer la requête claim
    console.log('📤 Envoi du claim...');
    const claimResData = await callFlareSolverr({
      cmd: 'request.post',
      url: 'https://tronpick.io/process.php',
      maxTimeout: 60000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Cookie': combinedCookie,
        'User-Agent': USER_AGENT,
        'Referer': faucetUrl,
        'Origin': 'https://tronpick.io'
      },
      postData: claimPayload.toString()
    });

    const responseBody = claimResData.solution.response;
    const success = responseBody.includes('success') || responseBody.includes('claimed');

    // 7. Sauvegarder le résultat dans un fichier log (optionnel)
    //    (on peut l'écrire dans GitHub via l'API, mais pour simplifier on le retourne)

    return res.status(200).json({
      success,
      message: responseBody.substring(0, 200)
    });

  } catch (error) {
    console.error('❌ Erreur claim:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
