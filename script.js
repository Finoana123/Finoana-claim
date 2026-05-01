const { connect } = require('puppeteer-real-browser');
const fs = require('fs');

const TEST_URL = 'https://bet261.mg/virtual/category/instant-league/8035/matches';

(async () => {
  let browser;
  try {
    console.log('🚀 Lancement du navigateur...');
    const { browser: br, page } = await connect({
      headless: 'new',
      turnstile: true,  // ← active la résolution automatique de Cloudflare Turnstile
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--lang=fr-FR'
      ],
      customHeaders: {
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    browser = br;

    await page.setExtraHTTPHeaders({
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8'
    });
    await page.setViewport({ width: 1366, height: 768 });

    console.log(`🌐 Accès à la page : ${TEST_URL}`);
    await page.goto(TEST_URL, { waitUntil: 'networkidle2', timeout: 90000 });

    // Attendre un peu plus pour que Turnstile soit résolu
    console.log('⏳ Attente de 10 secondes (captcha éventuel)...');
    await new Promise(r => setTimeout(r, 10000));

    // Afficher l'URL réelle après d'éventuelles redirections
    const currentUrl = page.url();
    console.log('📍 URL actuelle :', currentUrl);

    // Titre de la page
    const title = await page.title();
    console.log('📄 Titre de la page :', title);

    // Vérifier si on a été redirigé ou bloqué
    if (currentUrl.includes('challenge') || currentUrl.includes('blocked')) {
      console.log('⚠️ Page de défi Cloudflare détectée, la capture d\'écran montrera le problème.');
    }

    // Capture d'écran
    await page.screenshot({ path: 'screenshot.png', fullPage: true });
    console.log('📸 Capture enregistrée (screenshot.png)');

    // Si l'URL ne contient pas "matches", on a sûrement un souci
    if (!currentUrl.includes('matches')) {
      console.log('❌ L\'accès à la page des matchs a échoué (blocage).');
    } else {
      console.log('✅ La page des matchs est chargée !');
    }

    await browser.close();
    console.log('✅ Script terminé');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur :', error.message);
    if (browser) await browser.close().catch(() => {});
    process.exit(1);
  }
})();
