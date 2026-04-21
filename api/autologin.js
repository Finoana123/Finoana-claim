// /api/autologin.js
export default async function handler(req, res) {
  // Autoriser uniquement les requêtes POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée, utilise POST' });
  }

  // Récupérer les données envoyées par le frontend
  const { email, password, platform, proxy } = req.body;

  // Validation des champs obligatoires
  if (!email || !password || !platform) {
    return res.status(400).json({ error: 'Champs obligatoires manquants : email, password, platform' });
  }

  console.log(`🔐 Tentative d'autologin pour ${email} sur ${platform}`);

  try {
    let cookie = null;

    // ----- SIMULATION POUR TRONPICK (À REMPLACER PLUS TARD PAR LA VRAIE REQUÊTE) -----
    if (platform === 'TronPick') {
      // Simulation d'une connexion réussie : on génère un faux cookie de session
      const sessionId = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
      cookie = `tronpick_session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax`;
      
      // Simuler un délai réseau
      await new Promise(resolve => setTimeout(resolve, 500));
      
      console.log(`✅ Simulation TronPick réussie, cookie généré`);
    } 
    
    // ----- AUTRES PLATEFORMES (À IMPLÉMENTER PLUS TARD) -----
    else if (platform === 'LitePick' || platform === 'DogePick' || platform === 'BTCpick') {
      // Pour l'instant, on renvoie une erreur indiquant que la plateforme n'est pas encore supportée
      return res.status(400).json({ 
        error: `La plateforme ${platform} n'est pas encore implémentée. Utilise TronPick pour le test.` 
      });
    } 
    
    else {
      return res.status(400).json({ error: `Plateforme inconnue : ${platform}` });
    }

    // Si on a un cookie, on le renvoie
    if (cookie) {
      return res.status(200).json({ success: true, cookie });
    } else {
      throw new Error('Aucun cookie généré');
    }
    
  } catch (error) {
    console.error('❌ Erreur autologin:', error);
    return res.status(500).json({ error: error.message || 'Erreur interne du serveur' });
  }
}
