const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

module.exports = async (req, res) => {
  // Accepter seulement les requêtes POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const { phone, password } = req.body;
  if (!phone || !password) {
    return res.status(400).json({ error: 'Téléphone et mot de passe requis' });
  }

  let browser;
  try {
    // 1. Lancer un navigateur invisible (headless)
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    // ---------- CONNEXION ----------
    console.log('🌐 Aller sur la page de connexion...');
    await page.goto('https://www.bet261.mg/login', { waitUntil: 'networkidle2', timeout: 30000 });

    // Remplir le champ téléphone
    // Essayons plusieurs sélecteurs possibles pour le champ téléphone
    const phoneSelectors = [
      'input[name="phone"]',
      'input[type="tel"]',
      'input#phone',
      'input[placeholder*="tél"]'
    ];
    let phoneField = null;
    for (const sel of phoneSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 5000 });
        phoneField = sel;
        break;
      } catch (e) {}
    }
    if (!phoneField) throw new Error('Champ téléphone introuvable');

    // Effacer et écrire le numéro de téléphone
    await page.click(phoneField);
    await page.evaluate((sel, val) => {
      const el = document.querySelector(sel);
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, phoneField, phone);

    // Champ mot de passe
    const passwordField = 'input[type="password"]';
    await page.waitForSelector(passwordField, { timeout: 10000 });
    await page.click(passwordField);
    await page.evaluate((val) => {
      const el = document.querySelector('input[type="password"]');
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, password);

    // Petit délai pour que le site réagisse
    await page.waitForTimeout(1000);

    // Cliquer sur le bouton "Se connecter"
    const loginClicked = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('button, a, input[type="submit"]')];
      const loginBtn = buttons.find(el => {
        const text = (el.textContent || el.value || '').trim().toLowerCase();
        return text === 'se connecter' || text === 'connexion' || text === 'login';
      });
      if (loginBtn) { loginBtn.click(); return true; }
      return false;
    });
    if (!loginClicked) throw new Error('Bouton de connexion introuvable');

    // Attendre la redirection après connexion
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(3000);

    // Vérifier si on est toujours sur la page login
    if (page.url().includes('login')) {
      throw new Error('Échec de connexion (identifiants incorrects ?)');
    }
    console.log('✅ Connecté');

    // ---------- NAVIGATION VERS LE MATCH VIRTUEL ----------
    // On va cliquer sur "Virtual Sports" (ou texte équivalent)
    // Adaptez le texte entre guillemets ci-dessous selon ce que vous avez vu sur le site
    const virtualText = 'Virtual Sports';  // <-- MODIFIEZ ICI si nécessaire
    const virtualBtn = await page.evaluateHandle((text) => {
      return [...document.querySelectorAll('*')].find(el => el.textContent.trim() === text);
    }, virtualText);
    const vBtn = virtualBtn.asElement();
    if (!vBtn) throw new Error(`Bouton "${virtualText}" introuvable`);
    await vBtn.click();
    await page.waitForTimeout(3000);

    // Cliquer sur "English League"
    const leagueText = 'English League';  // <-- MODIFIEZ SI BESOIN (ex: "English League")
    const leagueBtn = await page.evaluateHandle((text) => {
      return [...document.querySelectorAll('*')].find(el => el.textContent.trim() === text);
    }, leagueText);
    const lBtn = leagueBtn.asElement();
    if (!lBtn) throw new Error(`Lien "${leagueText}" introuvable`);
    await lBtn.click();
    await page.waitForTimeout(3000);

    // ---------- EXTRAIRE LES COTES ----------
    // Ici, il faut connaître la classe CSS qui entoure les cotes.
    // Inspectez la page Bet261 → English League, et notez la classe commune aux cotes.
    // Exemple : '.odd-value', '.event-odd', '.odds-number', etc.
    const oddsSelector = '.odd-value';  // <-- MODIFIEZ avec la classe que vous avez trouvée
    try {
      await page.waitForSelector(oddsSelector, { timeout: 10000 });
    } catch (e) {
      throw new Error(`Cotes introuvables avec le sélecteur "${oddsSelector}"`);
    }

    const odds = await page.evaluate((selector) => {
      const nodes = document.querySelectorAll(selector);
      if (nodes.length >= 3) {
        return {
          home: nodes[0].textContent.trim(),
          draw: nodes[1].textContent.trim(),
          away: nodes[2].textContent.trim()
        };
      }
      return null;
    }, oddsSelector);

    if (!odds) throw new Error('Pas assez de cotes trouvées');

    console.log('📊 Cotes :', odds);

    // Fermer le navigateur
    await browser.close();

    // Renvoyer les cotes à la page HTML
    return res.status(200).json({ message: 'Cotes récupérées avec succès', odds });

  } catch (error) {
    if (browser) await browser.close().catch(() => {});
    console.error('❌ Erreur :', error.message);
    return res.status(500).json({ error: error.message });
  }
};
