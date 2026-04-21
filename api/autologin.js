// /api/autologin.js
import * as cheerio from 'cheerio';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée, utilisez POST' });
  }

  const { email, password, platform, proxy, userId } = req.body;

  if (!email || !password || !platform || !userId) {
    return res.status(400).json({ error: 'Champs manquants : email, password, platform, userId' });
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
    // ========== 1. LOGIN ==========
    const loginPageUrl = 'https://tronpick.io/login';
    const flarePayload = {
      cmd: 'request.get',
      url: loginPageUrl,
      maxTimeout: 120000
    };
    if (proxy) flarePayload.proxy = { url: proxy };

    const flareData = await callFlareSolverr(flarePayload);
    const flareCookies = flareData.solution.cookies;
    const cookieString = flareCookies.map(c => `${c.name}=${c.value}`).join('; ');
    const pageHtml = flareData.solution.response;

    const $ = cheerio.load(pageHtml);
    let csrfToken = $('meta[name="csrf-token"]').attr('content') ||
                    $('input[name="_token"]').val() ||
                    $('input[name="csrf_token"]').val();

    const formAction = $('form').attr('action');
    const loginUrl = formAction ? new URL(formAction, loginPageUrl).href : loginPageUrl;

    const loginPayload = new URLSearchParams();
    loginPayload.append('email', email);
    loginPayload.append('password', password);
    loginPayload.append('remember', '1');
    if (csrfToken) loginPayload.append('_token', csrfToken);

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

    const setCookieHeader = loginResData.solution.headers['set-cookie'];
    let sessionCookie = null;
    if (setCookieHeader) {
      const match = setCookieHeader.match(/(tronpick_session=[^;]+)/i) ||
                    setCookieHeader.match(/(session=[^;]+)/i) ||
                    setCookieHeader.match(/(laravel_session=[^;]+)/i);
      if (match) sessionCookie = match[1];
      else sessionCookie = setCookieHeader.split(';')[0];
    }
    if (!sessionCookie) throw new Error('Aucun cookie de session après login');

    console.log(`✅ Login OK`);

    // ========== PAUSE DE 20 SECONDES ==========
    console.log('⏳ Pause de 20 secondes avant le claim...');
    await new Promise(resolve => setTimeout(resolve, 20000));

    // ========== 2. CLAIM ==========
    let claimResult = { success: false, message: 'Non tenté' };

    try {
      const faucetPayload = {
        cmd: 'request.get',
        url: 'https://tronpick.io/faucet.php',
        maxTimeout: 120000,
        headers: {
          'Cookie': `${cookieString}; ${sessionCookie}`,
          'User-Agent': USER_AGENT
        }
      };
      if (proxy) faucetPayload.proxy = { url: proxy };

      const faucetData = await callFlareSolverr(faucetPayload);
      const faucetHtml = faucetData.solution.response;
      const faucetCookies = faucetData.solution.cookies;

      const $f = cheerio.load(faucetHtml);
      const hash = $f('input[name="hash"]').val();
      const captchaResponse = $f('input[name="c_captcha_response"]').val();
      const claimCsrf = faucetCookies?.find(c => c.name === 'csrf_cookie_name')?.value ||
                        $f('input[name="csrf_test_name"]').val();

      if (hash && captchaResponse && claimCsrf) {
        const claimPayload = new URLSearchParams();
        claimPayload.append('action', 'claim_hourly_faucet');
        claimPayload.append('hash', hash);
        claimPayload.append('captcha_type', '3');
        claimPayload.append('c_captcha_response', captchaResponse);
        claimPayload.append('csrf_test_name', claimCsrf);
        claimPayload.append('g-recaptcha-response', '');
        claimPayload.append('_iconcaptcha-token', '');
        claimPayload.append('ic-rq', '');
        claimPayload.append('ic-wid', '');
        claimPayload.append('ic-cid', '');
        claimPayload.append('ic-hp', '');
        claimPayload.append('h-captcha-response', '');
        claimPayload.append('pcaptcha_token', '');
        claimPayload.append('ft', '');

        const claimResData = await callFlareSolverr({
          cmd: 'request.post',
          url: 'https://tronpick.io/process.php',
          maxTimeout: 120000,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'Cookie': `${cookieString}; ${sessionCookie}`,
            'User-Agent': USER_AGENT,
            'Referer': 'https://tronpick.io/faucet.php',
            'Origin': 'https://tronpick.io'
          },
          postData: claimPayload.toString()
        });

        const body = claimResData.solution.response;
        claimResult.success = body.includes('success') || body.includes('claimed');
        claimResult.message = body.substring(0, 200);
        console.log(`🎁 Claim ${claimResult.success ? 'réussi' : 'échoué'}`);
      } else {
        claimResult.message = 'Impossible d’extraire les données de claim (hash, captcha, csrf)';
      }
    } catch (claimError) {
      claimResult.message = claimError.message;
      console.error('❌ Erreur claim:', claimError.message);
    }

    return res.status(200).json({
      success: true,
      cookie: sessionCookie,
      claim: claimResult
    });

  } catch (error) {
    console.error('Erreur:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
