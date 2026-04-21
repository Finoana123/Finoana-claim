// bot/claim-bot.js
import { Octokit } from '@octokit/rest';
import * as cheerio from 'cheerio';
import 'dotenv/config';

// ========== CONFIGURATION ==========
const FLARESOLVERR_URL = 'https://flaresolverr-wekb.onrender.com';
const USER_AGENT = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36';
const PLATFORM = 'TronPick';
const USER_ID = 'user_g5ro565mil'; // ⚠️ Remplace par le vrai userId si différent

// GitHub Config (fourni par GitHub Actions)
const GITHUB_TOKEN = process.env.GH_TOKEN;
const REPO_OWNER = process.env.GITHUB_REPO_OWNER;
const REPO_NAME = process.env.GITHUB_REPO_NAME;
const BRANCH = 'main';

const octokit = new Octokit({ auth: GITHUB_TOKEN });

// ========== FONCTIONS UTILITAIRES ==========
async function callFlareSolverr(payload, retries = 2) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${FLARESOLVERR_URL}/v1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (data.status !== 'ok') throw new Error(data.message || 'FlareSolverr failed');
      return data;
    } catch (err) {
      console.warn(`⚠️ Tentative ${i+1}/${retries} FlareSolverr: ${err.message}`);
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

async function getFileFromGitHub(path) {
  try {
    const { data } = await octokit.repos.getContent({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path,
      ref: BRANCH
    });
    return Buffer.from(data.content, 'base64').toString('utf8');
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

async function saveFileToGitHub(path, content, message) {
  const contentBase64 = Buffer.from(content).toString('base64');
  let sha;
  try {
    const { data } = await octokit.repos.getContent({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path,
      ref: BRANCH
    });
    sha = data.sha;
  } catch (error) {}
  
  await octokit.repos.createOrUpdateFileContents({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    path,
    message,
    content: contentBase64,
    branch: BRANCH,
    sha
  });
}

// ========== EXTRACTION DES DONNÉES ==========
function extractClaimData(html, cookies) {
  const $ = cheerio.load(html);
  
  // 1. Token CSRF (priorité au cookie, puis input)
  let csrfToken = cookies?.find(c => c.name === 'csrf_cookie_name')?.value;
  if (!csrfToken) {
    csrfToken = $('input[name="csrf_test_name"]').val() ||
                $('meta[name="csrf-token"]').attr('content');
  }
  
  // 2. Hash (input caché)
  const hash = $('input[name="hash"]').val();
  
  // 3. c_captcha_response (input caché)
  const captchaResponse = $('input[name="c_captcha_response"]').val();
  
  // 4. Fallback : chercher dans les variables JS globales
  if (!hash || !captchaResponse) {
    const scriptContent = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi)?.join(' ') || '';
    if (!hash) {
      const hashMatch = scriptContent.match(/hash\s*[=:]\s*['"]([^'"]+)['"]/);
      if (hashMatch) hash = hashMatch[1];
    }
    if (!captchaResponse) {
      const capMatch = scriptContent.match(/c_captcha_response\s*[=:]\s*['"]([^'"]+)['"]/);
      if (capMatch) captchaResponse = capMatch[1];
    }
  }
  
  return { csrfToken, hash, captchaResponse };
}

// ========== FONCTION PRINCIPALE ==========
async function runClaim() {
  console.log(`🤖 Démarrage du claim pour ${USER_ID} sur ${PLATFORM}`);
  
  try {
    // 1. Récupérer le cookie de session sauvegardé
    const configPath = `configs/${USER_ID}.json`;
    const configContent = await getFileFromGitHub(configPath);
    if (!configContent) throw new Error(`Config non trouvée pour ${USER_ID}`);
    const config = JSON.parse(configContent);
    const sessionCookie = config.cookie;
    console.log(`🍪 Session chargée: ${sessionCookie.substring(0, 30)}...`);
    
    // 2. Charger la page faucet.php via FlareSolverr
    const faucetUrl = 'https://tronpick.io/faucet.php';
    console.log(`🌐 Chargement de ${faucetUrl}`);
    
    const pagePayload = {
      cmd: 'request.get',
      url: faucetUrl,
      maxTimeout: 60000,
      headers: {
        'Cookie': sessionCookie,
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    };
    
    const pageData = await callFlareSolverr(pagePayload);
    const pageHtml = pageData.solution.response;
    const pageCookies = pageData.solution.cookies;
    
    // Fusion des cookies : ceux de la page + notre cookie de session
    const allCookies = pageCookies.map(c => `${c.name}=${c.value}`).join('; ');
    const combinedCookie = allCookies ? `${allCookies}; ${sessionCookie}` : sessionCookie;
    
    // 3. Extraire les données nécessaires
    const { csrfToken, hash, captchaResponse } = extractClaimData(pageHtml, pageCookies);
    
    if (!csrfToken) throw new Error('Token CSRF introuvable');
    if (!hash) throw new Error('Hash introuvable');
    if (!captchaResponse) throw new Error('c_captcha_response introuvable');
    
    console.log(`🔑 CSRF: ${csrfToken.substring(0, 20)}...`);
    console.log(`🔖 Hash: ${hash}`);
    console.log(`🤖 Captcha: ${captchaResponse.substring(0, 30)}...`);
    
    // 4. Construire le payload (identique à ta capture)
    const payload = new URLSearchParams();
    payload.append('action', 'claim_hourly_faucet');
    payload.append('hash', hash);
    payload.append('captcha_type', '3');
    payload.append('g-recaptcha-response', '');
    payload.append('_iconcaptcha-token', '');
    payload.append('ic-rq', '');
    payload.append('ic-wid', '');
    payload.append('ic-cid', '');
    payload.append('ic-hp', '');
    payload.append('h-captcha-response', '');
    payload.append('c_captcha_response', captchaResponse);
    payload.append('pcaptcha_token', '');
    payload.append('ft', '');
    payload.append('csrf_test_name', csrfToken);
    
    // 5. Envoyer la requête de claim
    const claimUrl = 'https://tronpick.io/process.php';
    console.log(`📤 Envoi claim vers ${claimUrl}`);
    
    const claimResData = await callFlareSolverr({
      cmd: 'request.post',
      url: claimUrl,
      maxTimeout: 60000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': USER_AGENT,
        'Referer': faucetUrl,
        'Origin': 'https://tronpick.io',
        'Cookie': combinedCookie,
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': '*/*'
      },
      postData: payload.toString()
    });
    
    const claimStatus = claimResData.solution.status;
    const claimResponseBody = claimResData.solution.response;
    console.log(`📬 Réponse (${claimStatus}): ${claimResponseBody.substring(0, 300)}`);
    
    // 6. Déterminer le succès (ajuster selon le message de réponse)
    const success = claimResponseBody.includes('success') ||
                    claimResponseBody.includes('claimed') ||
                    claimResponseBody.includes('received') ||
                    (claimStatus === 200 && claimResponseBody.length < 200);
    
    // 7. Sauvegarder le log
    const logEntry = {
      timestamp: new Date().toISOString(),
      success,
      status: claimStatus,
      responsePreview: claimResponseBody.substring(0, 500)
    };
    
    const today = new Date().toISOString().split('T')[0];
    const logPath = `logs/${USER_ID}_${today}.json`;
    
    let logArray = [];
    const existingLog = await getFileFromGitHub(logPath);
    if (existingLog) logArray = JSON.parse(existingLog);
    logArray.push(logEntry);
    
    await saveFileToGitHub(logPath, JSON.stringify(logArray, null, 2), `🤖 Claim log for ${USER_ID}`);
    
    console.log(`✅ Claim ${success ? 'réussi' : 'échoué'}, log enregistré.`);
    
  } catch (error) {
    console.error('❌ Erreur bot:', error.message);
    process.exit(1);
  }
}

runClaim();
