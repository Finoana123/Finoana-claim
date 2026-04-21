// /api/autologin.js - Login TronPick via Browserless (endpoint /function)
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const { email, password, platform, proxy, userId } = req.body;
  if (!email || !password || !platform || !userId) {
    return res.status(400).json({ error: 'Champs manquants : email, password, platform, userId' });
  }

  // ✅ Ta clé API Browserless
  const BROWSERLESS_API_KEY = '2UNOrIFUI3VKtOb3c74a76935a0b4c0ba22bfd1387c6dcbcf';
  const BROWSERLESS_URL = `https://chrome.browserless.io/function?token=${BROWSERLESS_API_KEY}`;

  // 🧠 Code Puppeteer à exécuter (format module.exports pour Browserless)
  const code = `
    module.exports = async ({ page, context }) => {
      const { email, password, proxy } = context;
      
      // Configuration du proxy
      if (proxy && proxy.includes('@')) {
        const parts = proxy.split('://')[1] || proxy;
        const [auth] = parts.split('@');
        const [username, pwd] = auth.split(':');
        await page.authenticate({ username, password: pwd });
      }

      try {
        // 1. Se rendre sur la page de login
        await page.goto('https://tronpick.io/login', { waitUntil: 'networkidle2', timeout: 30000 });
        
        // 2. Remplir le formulaire de connexion
        await page.waitForSelector('input[name="email"]', { timeout: 10000 });
        await page.type('input[name="email"]', email);
        await page.type('input[name="password"]', password);
        
        // 3. Soumettre le formulaire
        await Promise.all([
          page.click('button[type="submit"]'),
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 })
        ]);
        
        // 4. Attendre la stabilisation de la session
        await page.waitForTimeout(5000);
        
        // 5. Récupérer le cookie de session
        const cookies = await page.cookies();
        const sessionCookie = cookies.find(c => 
          c.name.includes('session') || 
          c.name.includes('tronpick') || 
          c.name.includes('user')
        );
        
        if (!sessionCookie) {
          throw new Error('Cookie de session introuvable');
        }
        
        // 6. Retourner le cookie (format attendu par Browserless)
        return {
          data: { success: true, cookie: \`\${sessionCookie.name}=\${sessionCookie.value}\` },
          type: 'application/json'
        };
      } catch (error) {
        return {
          data: { success: false, error: error.message },
          type: 'application/json'
        };
      }
    };
  `;

  // 📤 Corps de la requête pour l'endpoint /function
  const payload = {
    code: code,
    context: { email, password, proxy }
  };

  try {
    const response = await fetch(BROWSERLESS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || `Erreur HTTP ${response.status}`);
    }

    // Les données sont dans data.data (car on a utilisé le format { data, type })
    return res.status(200).json(data.data);

  } catch (error) {
    console.error('Erreur autologin:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
