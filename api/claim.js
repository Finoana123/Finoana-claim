
export default async function handler(req, res) {
  try {
    const TOKEN = process.env.TOKEN;

    if (!TOKEN) {
      return res.status(500).json({ error: "Token manquant" });
    }

    return res.status(200).json({
      success: true,
      message: "Mini bot prêt 🔥",
      token_preview: TOKEN.substring(0, 10) + "..."
    });

  } catch (err) {
    return res.status(500).json({
      error: err.message
    });
  }
}
