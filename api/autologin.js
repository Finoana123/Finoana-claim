// /api/autologin.js - Login TronPick via Browserless (avec logs)
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const { email, password, platform, proxy, userId } = req.body;
  if (!email || !password || !platform || !userId) {
    return res.status(400).json({ error: 'Champs manquants : email, password, platform, userId' });
  }

  const BROWSERLESS_API_KEY = '2UNOrIFUI3VKtOb3c74a76935a0b4c0ba22bfd1387c6dcbcf';
  const BROWSERLESS_URL = `https://chrome.browserless.io/puppeteer?token=${BROWSERLESS_API_KEY}`;

  // Construction du script avec échappement correct des variables
  const safeEmail = email.replace(/'/g, "\\'");
  const safePassword = password.replace(/'/g, "\\'");
  const safeProxy = proxy ? proxy.replace(/'/g, "\\'") : '';

  const script = `
    (async () => {
      const puppeteer = require('puppeteer-core');
      
      const launchOptions = {
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      };
      
      const proxy = '${safeProxy}';
      if (proxy) {
        launchOptions.args.push(\`--proxy-server=\${proxy}\`);
      }

      const browser = await puppeteer.launch(launchOptions);
      const page = await browser.newPage();

      if (proxy && proxy.includes('@')) {
        const parts = proxy.split('://')[1] || proxy;
        const [auth] = parts.split('@');
        const [username, pwd] = auth.split(':');
        await page.authenticate({ username, password: pwd });
      }

      try {
        await page.goto('https://tronpick.io/login', { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForSelector('input[name="email"]', { timeout: 10000 });
        await page.type('input[name="email"]', '${safeEmail}');
        await page.type('input[name="password"]', '${safePassword}');
        
        await Promise.all([
          page.click('button[type="submit"]'),
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 })
        ]);
        
        await page.waitForTimeout(5000);
        
        const cookies = await page.cookies();
        const sessionCookie = cookies.find(c => 
          c.name.includes('session') || 
          c.name.includes('tronpick') || 
          c.name.includes('user')
        );
        
        await browser.close();
        
        if (!sessionCookie) {
          throw new Error('Cookie de session introuvable');
        }
        
        return JSON.stringify({
          success: true,
          cookie: \`\${sessionCookie.name}=\${sessionCookie.value}\`
        });
      } catch (error) {
        await browser.close();
        return JSON.stringify({ success: false, error: error.message });
      }
    })();
  `;

  try {
    console.log('🚀 Envoi du script à Browserless...');
    
    const response = await fetch(BROWSERLESS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/javascript' },
      body: script
    });

    const text = await response.text();
    console.log('📬 Statut HTTP:', response.status);
    console.log('📄 Réponse brute (500 premiers caractères):', text.substring(0, 500));

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      // Si ce n'est pas du JSON, on renvoie l'erreur avec la réponse brute pour diagnostic
      console.error('❌ Réponse non-JSON reçue');
      return res.status(500).json({ 
        error: 'Browserless a renvoyé une réponse non-JSON', 
        rawResponse: text.substring(0, 300) 
      });
    }

    if (!response.ok) {
      throw new Error(data.error || `Erreur HTTP ${response.status}`);
    }

    return res.status(200).json(data);

  } catch (error) {
    console.error('❌ Erreur autologin:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
