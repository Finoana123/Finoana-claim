export default async function handler(req, res) {
  try {
    const COOKIE = process.env.COOKIE;
    const CSRF = process.env.CSRF;

    if (!COOKIE || !CSRF) {
      return res.status(500).json({
        error: "COOKIE ou CSRF manquant"
      });
    }

    const headers = {
      "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/116 Mobile Safari/537.36",
      "Accept": "application/json, text/plain, */*",
      "Content-Type": "application/json",

      // 🔥 très important
      "X-CSRF-TOKEN": CSRF,

      "Origin": "https://tronpick.io",
      "Referer": "https://tronpick.io/dashboard",

      // 🔑 session réelle
      "Cookie": COOKIE
    };

    const response = await fetch("https://tronpick.io/api/claim", {
      method: "POST",
      headers,
      body: JSON.stringify({})
    });

    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    return res.status(200).json({
      success: true,
      status: response.status,
      result: data
    });

  } catch (err) {
    return res.status(500).json({
      error: err.message
    });
  }
}
