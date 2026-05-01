const { connect } = require('puppeteer-real-browser');
const fs = require('fs');

const TEST_URL = 'https://bet261.mg/virtual/category/instant-league/8035/matches';

(async () => {
  let browser;
  try {
    console.log('🚀 Lancement du navigateur...');
    const { browser: br, page } = await connect({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    browser = br;

    console.log(`🌐 Accès à la page : ${TEST_URL}`);
    await page.goto(TEST_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    console.log('⏳ Attente de 5 secondes...');
    await new Promise(r => setTimeout(r, 5000));

    // Sauvegarder la capture d'écran dans un fichier
    await page.screenshot({ fullPage: true, path: 'screenshot.png' });
    console.log('📸 Capture d\'écran enregistrée sous screenshot.png');

    const title = await page.title();
    console.log('📄 Titre de la page :', title);

    await browser.close();
    console.log('✅ Test réussi');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur :', error.message);
    if (browser) await browser.close().catch(() => {});
    process.exit(1);
  }
})();
