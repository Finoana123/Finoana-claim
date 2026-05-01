const { connect } = require('puppeteer-real-browser');

const phone = process.env.PHONE;
const password = process.env.PASSWORD;

if (!phone || !password) {
  console.error('❌ Téléphone et mot de passe requis');
  process.exit(1);
}

(async () => {
  let browser;
  try {
    // Lancement du navigateur (headless = invisible)
    const { browser: br, page } = await connect({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    browser = br;

    // --- 1. CONNEXION ---
    console.log('🌐 Accès à la page de connexion...');
    await page.goto('https://www.bet261.mg/login', { waitUntil: 'networkidle2', timeout: 60000 });

    // Remplir le champ téléphone (on essaie plusieurs sélecteurs possibles)
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

    // Effacer et écrire le téléphone
    await page.click(phoneField);
    await page.evaluate((sel, val) => {
      const el = document.querySelector(sel);
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, phoneField, phone);

    // Remplir le mot de passe
    const passwordField = 'input[type="password"]';
    await page.waitForSelector(passwordField, { timeout: 10000 });
    await page.click(passwordField);
    await page.evaluate((val) => {
      const el = document.querySelector('input[type="password"]');
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, password);

    await new Promise(r => setTimeout(r, 1000));

    // Cliquer sur le bouton de connexion
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

    // Attendre la redirection
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 3000));

    if (page.url().includes('login')) {
      throw new Error('Échec de connexion (vérifiez vos identifiants)');
    }
    console.log('✅ Connecté');

    // --- 2. NAVIGATION VERS LE MATCH VIRTUEL ---
    // ⚠️ Remplacez "Virtual Sports" par le texte EXACT présent sur le site
    const virtualText = 'Virtual Sports';
    console.log(`🔍 Recherche du menu "${virtualText}"...`);
    const virtualBtn = await page.evaluateHandle((text) => {
      return [...document.querySelectorAll('*')].find(el => el.textContent.trim() === text);
    }, virtualText);
    const vBtn = virtualBtn.asElement();
    if (!vBtn) throw new Error(`Bouton "${virtualText}" introuvable`);
    await vBtn.click();
    await new Promise(r => setTimeout(r, 3000));

    // ⚠️ Remplacez "English League" par le texte exact
    const leagueText = 'English League';
    console.log(`🔍 Recherche de "${leagueText}"...`);
    const leagueBtn = await page.evaluateHandle((text) => {
      return [...document.querySelectorAll('*')].find(el => el.textContent.trim() === text);
    }, leagueText);
    const lBtn = leagueBtn.asElement();
    if (!lBtn) throw new Error(`Lien "${leagueText}" introuvable`);
    await lBtn.click();
    await new Promise(r => setTimeout(r, 3000));

    // --- 3. EXTRAIRE LES COTES ---
    // ⚠️ Remplacez '.odd-value' par la classe CSS qui entoure chaque cote (ex: '.odds__number')
    const oddsSelector = '.odd-value';
    console.log(`🔍 Attente des cotes (sélecteur "${oddsSelector}")...`);
    try {
      await page.waitForSelector(oddsSelector, { timeout: 10000 });
    } catch (e) {
      throw new Error(`Aucun élément trouvé avec le sélecteur "${oddsSelector}"`);
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

    if (!odds) throw new Error('Impossible de récupérer les cotes (vérifiez le sélecteur CSS)');

    console.log('📊 COTES RÉCUPÉRÉES :');
    console.log(`   1  : ${odds.home}`);
    console.log(`   N  : ${odds.draw}`);
    console.log(`   2  : ${odds.away}`);

    await browser.close();
    console.log('✅ Terminé avec succès');
    process.exit(0);

  } catch (error) {
    console.error('❌ Erreur :', error.message);
    if (browser) await browser.close().catch(() => {});
    process.exit(1);
  }
})();
