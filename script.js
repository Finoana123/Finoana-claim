const { connect } = require('puppeteer-real-browser');
const fs = require('fs');

const TEST_URL = 'https://bet261.mg/virtual/category/instant-league/8035/matches';

(async () => {
  let browser;
  try {
    console.log('🚀 Lancement du navigateur...');
    const { browser: br, page } = await connect({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled', // cache l'automatisation
        '--lang=fr-FR'
      ],
      // Ajouter des en-têtes HTTP réalistes
      customHeaders: {
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    browser = br;

    // Définir la langue et la taille de l'écran
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8'
    });
    await page.setViewport({ width: 1366, height: 768 });

    console.log(`🌐 Accès à la page : ${TEST_URL}`);
    await page.goto(TEST_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    console.log('⏳ Attente de 5 secondes...');
    await new Promise(r => setTimeout(r, 5000));

    // Vérifier si on est toujours sur la bonne page
    const currentUrl = page.url();
    console.log('📍 URL actuelle :', currentUrl);
    const title = await page.title();
    console.log('📄 Titre de la page :', title);

    // Prendre une capture d'écran
    await page.screenshot({ path: 'screenshot.png', fullPage: true });
    console.log('📸 Capture enregistrée (screenshot.png)');

    // Si l'URL ne contient pas "matches", il y a peut-être eu une redirection
    if (!currentUrl.includes('matches')) {
      console.log('⚠️ Redirection détectée, la page a peut-être été bloquée (capture disponible).');
    } else {
      console.log('✅ La page semble chargée normalement.');
    }

    await browser.close();
    console.log('✅ Test terminé');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur :', error.message);
    if (browser) await browser.close().catch(() => {});
    process.exit(1);
  }
})();
