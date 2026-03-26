import fetch from "node-fetch";
import HttpsProxyAgent from "https-proxy-agent";

export default async function handler(req, res) {
  try {
    const COOKIE = process.env.COOKIE;
    const CSRF = process.env.CSRF;
    const PROXY = process.env.PROXY;

    if (!COOKIE || !CSRF || !PROXY) {
      return res.status(500).json({
        error: "COOKIE / CSRF / PROXY manquant"
      });
    }

    const agent = new HttpsProxyAgent(PROXY);

    const headers = {
      "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/116 Mobile Safari/537.36",
      "Accept": "application/json, text/plain, */*",
      "Content-Type": "application/json",
      "X-CSRF-TOKEN": CSRF,
      "Origin": "https://tronpick.io",
      "Referer": "https://tronpick.io/dashboard",
      "Cookie": COOKIE
    };

    const response = await fetch("https://tronpick.io/api/claim", {
      method: "POST",
      headers,
      body: JSON.stringify({}),
      agent
    });

    const text = await response.text();

    return res.json({
      status: response.status,
      result: text
    });

  } catch (err) {
    return res.status(500).json({
      error: err.message
    });
  }
}
