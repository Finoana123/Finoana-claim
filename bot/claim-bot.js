// bot/claim-bot.js
import { Octokit } from '@octokit/rest';
import * as cheerio from 'cheerio';
import 'dotenv/config';

// ========== CONFIG ==========
const FLARESOLVERR_URL = 'https://flaresolverr-wekb.onrender.com';
const USER_AGENT = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/116 Mobile Safari/537.36';
const PLATFORM = 'TronPick';
const USER_ID = 'user_g5ro565mil';

// 👉 Proxy (tu dis qu'il marche 👍)
const PROXY_URL = 'socks5://Finoana123-US:Finoana123@198.23.239.134:6540';

// GitHub
const GITHUB_TOKEN = process.env.GH_TOKEN;
const REPO_OWNER = process.env.GITHUB_REPO_OWNER;
const REPO_NAME = process.env.GITHUB_REPO_NAME;
const BRANCH = 'main';

const octokit = new Octokit({ auth: GITHUB_TOKEN });

// ========== FLARESOLVERR ==========
async function callFlareSolverr(payload, retries = 3) {
  const finalPayload = {
    ...payload,
    proxy: { url: PROXY_URL }
  };

  for (let i = 0; i < retries; i++) {
    try {
      console.log(`📡 FlareSolverr (${i + 1}/${retries})`);

      const res = await fetch(`${FLARESOLVERR_URL}/v1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalPayload),
        signal: AbortSignal.timeout(180000)
      });

      const text = await res.text();
      if (!text) throw new Error('Réponse vide');

      const data = JSON.parse(text);

      if (data.status !== 'ok') {
        throw new Error(data.message || 'Erreur FlareSolverr');
      }

      return data;

    } catch (err) {
      console.warn(`⚠️ Tentative échouée: ${err.message}`);
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

// ========== GITHUB ==========
async function getFileFromGitHub(path) {
  try {
    const { data } = await octokit.repos.getContent({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path,
      ref: BRANCH
    });

    return Buffer.from(data.content, 'base64').toString('utf8');
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
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
  } catch {}

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

// ========== BOT ==========
async function runClaim() {
  console.log(`🤖 Start claim: ${USER_ID}`);

  try {
    // ===== 1. LOAD CONFIG =====
    const configPath = `configs/${USER_ID}.json`;
    const configContent = await getFileFromGitHub(configPath);

    if (!configContent) throw new Error("Config introuvable");

    const config = JSON.parse(configContent);
    const sessionCookie = config.cookie;

    console.log("🍪 Cookie chargé");

    // ===== 2. LOAD PAGE =====
    const faucetUrl = 'https://tronpick.io/faucet.php';

    const pageData = await callFlareSolverr({
      cmd: 'request.get',
      url: faucetUrl,
      maxTimeout: 120000,
      render: true, // 🔥 IMPORTANT
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html'
      }
    });

    const pageHtml = pageData.solution.response;
    const pageCookies = pageData.solution.cookies || [];

    // ===== DEBUG =====
    if (!pageHtml || pageHtml.length < 1000) {
      throw new Error("HTML invalide (bloqué)");
    }

    if (pageHtml.includes("main-frame-error")) {
      throw new Error("🚫 Bloqué (proxy / cloudflare)");
    }

    console.log("✅ Page OK");

    // ===== SAVE DEBUG =====
    const debugPath = `debug/${USER_ID}_${Date.now()}.json`;
    await saveFileToGitHub(debugPath, JSON.stringify({
      html: pageHtml.substring(0, 5000),
      cookies: pageCookies
    }, null, 2), "debug");

    // ===== 3. PARSE =====
    const $ = cheerio.load(pageHtml);

    let csrfToken =
      $('input[name="csrf_test_name"]').val() ||
      $('meta[name="csrf-token"]').attr('content');

    let hash = $('input[name="hash"]').val();
    let captchaResponse = $('input[name="c_captcha_response"]').val();

    console.log("🔑 Tokens:", {
      csrf: !!csrfToken,
      hash: !!hash,
      captcha: !!captchaResponse
    });

    if (!csrfToken || !hash) {
      throw new Error("Tokens introuvables");
    }

    // ===== 4. COOKIES =====
    const cookieHeader = pageCookies.map(c => `${c.name}=${c.value}`).join('; ');

    // ===== 5. CLAIM =====
    const payload = new URLSearchParams();

    payload.append('action', 'claim_hourly_faucet');
    payload.append('hash', hash);
    payload.append('csrf_test_name', csrfToken);
    payload.append('captcha_type', '3');
    payload.append('c_captcha_response', captchaResponse || '');

    const claimData = await callFlareSolverr({
      cmd: 'request.post',
      url: 'https://tronpick.io/process.php',
      maxTimeout: 120000,
      headers: {
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookieHeader,
        'Referer': faucetUrl,
        'Origin': 'https://tronpick.io',
        'X-Requested-With': 'XMLHttpRequest'
      },
      postData: payload.toString()
    });

    const body = claimData.solution.response;

    console.log("📬 Réponse:", body.substring(0, 200));

    const success =
      body.includes("success") ||
      body.includes("claimed");

    console.log(success ? "✅ CLAIM SUCCESS" : "❌ CLAIM FAILED");

  } catch (err) {
    console.error("❌ ERROR:", err.message);
  }
}

// RUN
runClaim();
