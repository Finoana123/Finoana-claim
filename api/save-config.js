// /api/save-config.js
export default async function handler(req, res) {
  // Accepter uniquement les requêtes POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  // Récupérer les données envoyées par le frontend
  const { userId, platform, cookie, proxy, timer } = req.body;

  // Vérifier que les champs obligatoires sont présents
  if (!userId || !platform || !cookie) {
    return res.status(400).json({ error: 'Champs manquants : userId, platform, cookie' });
  }

  // Récupérer les variables d'environnement
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const REPO = process.env.GITHUB_REPO;
  const BRANCH = process.env.GITHUB_BRANCH || 'main';

  // Si les variables ne sont pas définies, erreur
  if (!GITHUB_TOKEN || !REPO) {
    return res.status(500).json({ error: 'Configuration serveur manquante' });
  }

  // Chemin du fichier dans le dépôt : configs/UID.json
  const filePath = `configs/${userId}.json`;

  try {
    // 1. Essayer de récupérer le fichier existant pour obtenir son SHA (nécessaire pour mise à jour)
    let sha = null;
    const getUrl = `https://api.github.com/repos/${REPO}/contents/${filePath}?ref=${BRANCH}`;
    const getResponse = await fetch(getUrl, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
      },
    });

    if (getResponse.ok) {
      const data = await getResponse.json();
      sha = data.sha; // Le fichier existe déjà
    }

    // 2. Préparer le contenu à sauvegarder
    const config = {
      platform,
      cookie,
      proxy: proxy || null,
      timer: timer || 60,
      updatedAt: new Date().toISOString(),
    };

    // Convertir en base64 (exigé par l'API GitHub)
    const contentBase64 = Buffer.from(JSON.stringify(config, null, 2)).toString('base64');

    // 3. Envoyer la requête PUT pour créer ou mettre à jour le fichier
    const putUrl = `https://api.github.com/repos/${REPO}/contents/${filePath}`;
    const body = {
      message: `Mise à jour configuration pour ${userId}`,
      content: contentBase64,
      branch: BRANCH,
    };
    if (sha) {
      body.sha = sha;
    }

    const putResponse = await fetch(putUrl, {
      method: 'PUT',
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!putResponse.ok) {
      const errorData = await putResponse.json();
      throw new Error(errorData.message || 'Erreur GitHub');
    }

    // Succès
    res.status(200).json({ success: true, path: filePath });
  } catch (error) {
    console.error('Erreur API save-config:', error);
    res.status(500).json({ error: error.message });
  }
}
