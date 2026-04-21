// bot/claim-bot.js
import { Octokit } from '@octokit/rest';
import * as cheerio from 'cheerio';
import 'dotenv/config';

// ========== CONFIGURATION ==========
const FLARESOLVERR_URL = 'https://flaresolverr-wekb.onrender.com';
const USER_AGENT = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36';
const PLATFORM = 'TronPick';
const USER_ID = 'user_g5ro565mil'; // À adapter
const PROXY_URL = 'socks5://Finoana123-US:Finoana123@198.23.239.134:6540';

const GITHUB_TOKEN = process.env.GH_TOKEN;
const REPO_OWNER = process.env.GITHUB_REPO_OWNER;
const REPO_NAME = process.env.GITHUB_REPO_NAME;
const BRANCH = 'main';

const octokit = new Octokit({ auth: GITHUB_TOKEN });

// ========== FLARESOLVERR ==========
async function callFlareSolverr(payload, retries = 5) {
  try { await fetch(FLARESOLVERR_URL, { signal: AbortSignal.timeout(10000) }); } catch {}
  const payloadWithProxy = { ...payload, proxy: { url: PROXY_URL } };

  for (let i = 0; i < retries; i++) {
    try {
      console.log(`📡 Appel FlareSolverr (tentative ${i + 1}/${retries})`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000);
      const response = await fetch(`${FLARESOLVERR_URL}/v1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadWithProxy),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      if (!text) throw new Error('Réponse vide');
      const data = JSON.parse(text);
      if (data.status !== 'ok') throw new Error(data.message || 'Status non-ok');
      return data;
    } catch (err) {
      console.warn(`⚠️ Tentative ${i + 1} échouée: ${err.message}`);
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 10000 * (i + 1)));
    }
  }
}

// ========== GITHUB HELPERS ==========
async function getFileFromGitHub(path) {
  try {
    const { data } = await octokit.repos.getContent({ owner: REPO_OWNER, repo: REPO_NAME, path, ref: BRANCH });
    return Buffer.from(data.content, 'base64').toString('utf8');
  } catch (e) { if (e.status === 404) return null; throw e; }
}

async function saveFileToGitHub(path, content, message) {
  const contentBase64 = Buffer.from(content).toString('base64');
  let sha;
  try {
    const { data } = await octokit.repos.getContent({ owner: REPO_OWNER, repo: REPO_NAME, path, ref: BRANCH });
    sha = data.sha;
  } catch (e) {}
  await octokit.repos.createOrUpdateFileContents({
    owner: REPO_OWNER, repo: REPO_NAME, path, message, content: contentBase64, branch: BRANCH, sha
  });
}

// ========== EXTRACTION AMÉLIORÉE AVEC LOGS ==========
function extractClaimData(html, cookies) {
  console.log('🔍 Début extraction des données de claim...');
  
  // Afficher tous les cookies reçus
  console.log('🍪 Cookies reçus de FlareSolverr:');
  cookies.forEach((c, i) => console.log(`   ${i+1}. ${c.name}=${c.value.substring(0,30)}...`));
  
  // Afficher début du HTML
  console.log('📄 Début HTML faucet.php:');
  console.log(html.substring(0, 800));
  
  const $ = cheerio.load(html);
  
  // Token CSRF : d'abord depuis les cookies
  let csrfToken = cookies?.find(c => c.name === 'csrf_cookie_name')?.value;
  if (!csrfToken) {
    csrfToken = $('input[name="csrf_test_name"]').val() ||
                $('input[name="_token"]').val() ||
                $('input[name="csrf_token"]').val() ||
                $('input[name="csrf-token"]').val() ||
                $('meta[name="csrf-token"]').attr('content');
  }
  
  // Hash et captcha
  let hash = $('input[name="hash"]').val();
  let captchaResponse = $('input[name="c_captcha_response"]').val();
  
  // Recherche élargie dans les scripts
  if (!hash || !captchaResponse) {
    const scripts = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi)?.join(' ') || '';
    if (!hash) {
      const m = scripts.match(/hash\s*[=:]\s*['"]([^'"]+)['"]/);
      if (m) hash = m[1];
    }
    if (!captchaResponse) {
      const m = scripts.match(/c_captcha_response\s*[=:]\s*['"]([^'"]+)['"]/);
      if (m) captchaResponse = m[1];
    }
  }
  
  console.log(`🔑 Résultat extraction -> csrfToken: ${csrfToken ? 'trouvé' : 'MANQUANT'}, hash: ${hash ? 'trouvé' : 'MANQUANT'}, captchaResponse: ${captchaResponse ? 'trouvé' : 'MANQUANT'}`);
  
  return { csrfToken, hash, captchaResponse };
}

// ========== FONCTION PRINCIPALE ==========
async function runClaim() {
  console.log(`🤖 Démarrage claim pour ${USER_ID}`);
  try {
    const configPath = `configs/${USER_ID}.json`;
    const configContent = await getFileFromGitHub(configPath);
    if (!configContent) throw new Error(`Config non trouvée`);
    const config = JSON.parse(configContent);
    const sessionCookie = config.cookie;
    console.log(`🍪 Session chargée: ${sessionCookie.substring(0, 30)}...`);
    
    const faucetUrl = 'https://tronpick.io/faucet.php';
    console.log(`🌐 Chargement ${faucetUrl}`);
    
    const pagePayload = {
      cmd: 'request.get',
      url: faucetUrl,
      maxTimeout: 120000,
      headers: {
        'Cookie': sessionCookie,
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    };
    
    const pageData = await callFlareSolverr(pagePayload);
    const pageHtml = pageData.solution.response;
    const pageCookies = pageData.solution.cookies;
    
    const allCookies = pageCookies.map(c => `${c.name}=${c.value}`).join('; ');
    const combinedCookie = allCookies ? `${allCookies}; ${sessionCookie}` : sessionCookie;
    
    const { csrfToken, hash, captchaResponse } = extractClaimData(pageHtml, pageCookies);
    
    if (!csrfToken) throw new Error('Token CSRF introuvable');
    if (!hash) throw new Error('Hash introuvable');
    if (!captchaResponse) throw new Error('c_captcha_response introuvable');
    
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
    
    const claimUrl = 'https://tronpick.io/process.php';
    console.log(`📤 Envoi claim vers ${claimUrl}`);
    
    const claimResData = await callFlareSolverr({
      cmd: 'request.post',
      url: claimUrl,
      maxTimeout: 120000,
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
    
    const success = claimResponseBody.includes('success') || claimResponseBody.includes('claimed') || (claimStatus === 200 && claimResponseBody.length < 200);
    
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
