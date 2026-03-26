import fetch from "node-fetch";
import { HttpsProxyAgent } from "https-proxy-agent";

export default async function handler(req, res) {
  try {
    const COOKIE = process.env.COOKIE;
    const CSRF = process.env.CSRF;
    const PROXY = process.env.PROXY;

    console.log("ENV CHECK:", { COOKIE, CSRF, PROXY });

    if (!COOKIE || !CSRF) {
      return res.status(500).json({
        error: "COOKIE ou CSRF manquant"
      });
    }

    let agent = null;

    if (PROXY) {
      try {
        agent = new HttpsProxyAgent(PROXY);
      } catch (e) {
        return res.status(500).json({
          error: "Proxy invalide",
          detail: e.message
        });
      }
    }

    const response = await fetch("https://tronpick.io/api/claim", {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 10) Chrome/116 Mobile",
        "Content-Type": "application/json",
        "X-CSRF-TOKEN": CSRF,
        "Cookie": COOKIE
      },
      body: JSON.stringify({}),
      agent
    });

    const text = await response.text();

    return res.status(200).json({
      status: response.status,
      result: text
    });

  } catch (err) {
    return res.status(500).json({
      error: "CRASH",
      message: err.message
    });
  }
}
