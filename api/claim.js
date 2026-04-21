// /api/claim.js - Claim TronPick via Browserless (vrai navigateur)
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const { userId, proxy } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'userId manquant' });
  }

  const BROWSERLESS_API_KEY = '2UNOrIFUI3VKtOb3c74a76935a0b4c0ba22bfd1387c6dcbcf';
  const BROWSERLESS_URL = `https://chrome.browserless.io/function?token=${BROWSERLESS_API_KEY}`;

  // Code exécuté dans le cloud
  const code = `
    async ({ page, context }) => {
      const { userId, proxy } = context;
      
      // Récupérer le cookie depuis GitHub
      const fetch = require('node-fetch');
      const configUrl = \`https://raw.githubusercontent.com/Finoana123/Finoana-claim/main/configs/\${userId}.json\`;
      const configRes = await fetch(configUrl);
      if (!configRes.ok) throw new Error('Config introuvable');
      const config = await configRes.json();
      const sessionCookie = config.cookie;
      
      // Injecter le cookie dans le navigateur
      await page.setCookie({
        name: sessionCookie.split('=')[0],
        value: sessionCookie.split('=')[1],
        domain: 'tronpick.io',
        path: '/'
      });
      
      // Configurer le proxy si fourni
      if (proxy && proxy.includes('@')) {
        const parts = proxy.split('://')[1] || proxy;
        const [auth] = parts.split('@');
        const [username, pwd] = auth.split(':');
        await page.authenticate({ username, password: pwd });
      }
      
      try {
        // 1. Aller sur faucet.php
        await page.goto('https://tronpick.io/faucet.php', { waitUntil: 'networkidle2', timeout: 30000 });
        
        // 2. Attendre que la page soit chargée
        await page.waitForTimeout(5000);
        
        // 3. Chercher et cliquer sur le bouton Claim
        const claimSelectors = [
          'button:contains("Claim")',
          'button:contains("CLAIM")',
          'button:contains("Réclamer")',
          '.claim-btn',
          '#claim-button',
          'button.btn-success'
        ];
        
        let clicked = false;
        for (const sel of claimSelectors) {
          try {
            await page.waitForSelector(sel, { timeout: 5000 });
            await page.click(sel);
            clicked = true;
            break;
          } catch (e) {
            continue;
          }
        }
        
        if (!clicked) {
          throw new Error('Bouton Claim introuvable');
        }
        
        // 4. Attendre le résultat
        await page.waitForTimeout(5000);
        
        // 5. Capturer le message
        const resultMsg = await page.evaluate(() => {
          const msg = document.querySelector('.alert, .swal2-title, .toast-message');
          return msg ? msg.innerText : 'Aucun message';
        });
        
        const success = resultMsg.toLowerCase().includes('success') || 
                        resultMsg.toLowerCase().includes('claimed') ||
                        resultMsg.toLowerCase().includes('réussi');
        
        return {
          data: { success, message: resultMsg },
          type: 'application/json'
        };
      } catch (error) {
        return {
          data: { success: false, error: error.message },
          type: 'application/json'
        };
      }
    }
  `;

  try {
    const response = await fetch(BROWSERLESS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: code,
        context: { userId, proxy }
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Erreur HTTP ${response.status}`);

    return res.status(200).json(data.data);

  } catch (error) {
    console.error('Erreur claim:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
