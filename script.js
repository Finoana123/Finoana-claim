const { connect } = require('puppeteer-real-browser');

// URL de test (tu pourras aussi tester l'autre avec les résultats)
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

    // Prendre une capture d'écran (elle sera sauvegardée dans les logs)
    const screenshot = await page.screenshot({ fullPage: true });
    console.log('📸 Capture d\'écran prise (taille : ' + screenshot.length + ' octets).');
    // Pour la voir, on va l'enregistrer en tant qu'artefact (expliqué plus bas)

    // Afficher le titre de la page
    const title = await page.title();
    console.log('📄 Titre de la page :', title);

    await browser.close();
    console.log('✅ Test réussi : la page s\'affiche correctement.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur :', error.message);
    if (browser) await browser.close().catch(() => {});
    process.exit(1);
  }
})();
