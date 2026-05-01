const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const fs = require('fs');

const TEST_URL = 'https://bet261.mg/virtual/category/instant-league/8035/matches';

(async () => {
  let browser;
  try {
    console.log('🚀 Lancement du navigateur furtif...');
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--lang=fr-FR'
      ]
    });
    const page = await browser.newPage();

    // User-agent réaliste (déjà inclus par le plugin, mais on double)
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1366, height: 768 });
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8'
    });

    console.log(`🌐 Accès à la page : ${TEST_URL}`);
    await page.goto(TEST_URL, { waitUntil: 'networkidle2', timeout: 90000 });

    // Attendre un peu
    console.log('⏳ Attente de 10 secondes...');
    await new Promise(r => setTimeout(r, 10000));

    const currentUrl = page.url();
    console.log('📍 URL actuelle :', currentUrl);
    const title = await page.title();
    console.log('📄 Titre :', title);

    // Vérifier le contenu
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (bodyText.includes('Access forbidden') || bodyText.includes('Forbidden')) {
      console.log('❌ Blocage toujours présent. L\'IP GitHub est probablement blacklistée.');
    } else if (currentUrl.includes('matches')) {
      console.log('✅ La page des matchs est chargée !');
    }

    // Capture d'écran
    await page.screenshot({ path: 'screenshot.png', fullPage: true });
    console.log('📸 Capture enregistrée (screenshot.png)');

    await browser.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur :', error.message);
    if (browser) await browser.close().catch(() => {});
    process.exit(1);
  }
})();
