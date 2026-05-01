from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from paddleocr import PaddleOCR
import numpy as np
import cv2
import re
import io
from PIL import Image

app = FastAPI()

# Autoriser les requêtes depuis votre site Vercel
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialiser PaddleOCR (français + anglais)
ocr = PaddleOCR(use_angle_cls=True, lang='fr')

def clean_name(name: str) -> str:
    """Nettoie un nom d'équipe."""
    # Supprimer tout sauf lettres, espaces, apostrophes, tirets
    name = re.sub(r'[^A-Za-z À-ÿ\'-]', ' ', name).strip()
    # Tokeniser et filtrer les mots courts
    tokens = [t for t in name.split() if len(t) >= 2]
    # Garder seulement ceux commençant par une majuscule
    tokens = [t for t in tokens if t[0].isupper()]
    return ' '.join(tokens) if tokens else ''

def extract_odds_results(results: list) -> list:
    """
    results est une liste de listes: [[bbox, (text, confidence)], ...]
    On retourne une liste de lignes de texte dans l'ordre vertical.
    """
    # Trier par coordonnée Y du centre du bloc
    sorted_results = sorted(results, key=lambda x: x[0][0][1])  # bbox[0][1] est le Y du coin supérieur gauche
    lines = [line[1][0] for line in sorted_results]
    return lines

@app.post("/api/extract")
async def extract(
    oddsImage: UploadFile = File(...),
    resultsImage: UploadFile = File(...)
):
    try:
        # Lire les deux images
        odds_bytes = await oddsImage.read()
        results_bytes = await resultsImage.read()

        # Convertir en images PIL
        odds_img = Image.open(io.BytesIO(odds_bytes)).convert('RGB')
        results_img = Image.open(io.BytesIO(results_bytes)).convert('RGB')

        # Redimensionner pour améliorer l'OCR (optionnel)
        odds_img = odds_img.resize((odds_img.width * 2, odds_img.height * 2), Image.LANCZOS)
        results_img = results_img.resize((results_img.width * 2, results_img.height * 2), Image.LANCZOS)

        # Convertir en numpy array pour PaddleOCR
        odds_arr = np.array(odds_img)
        results_arr = np.array(results_img)

        # Lancer OCR sur les deux images
        odds_result = ocr.ocr(odds_arr, cls=True)
        results_result = ocr.ocr(results_arr, cls=True)

        # Extraire les listes de textes
        odds_lines = extract_odds_results(odds_result[0]) if odds_result[0] else []
        results_lines = extract_odds_results(results_result[0]) if results_result[0] else []

        # --------------------- Parser vos données (cotes) ---------------------
        matches = []
        # Rechercher les paires d'équipes suivies de cotes
        i = 0
        while i < len(odds_lines) - 1:
            # Détecter une ligne de cotes (contient au moins deux nombres décimaux)
            cote_match = re.findall(r'\d+[.,]\d+', odds_lines[i])
            if len(cote_match) >= 2:
                # Chercher les deux équipes juste au-dessus
                team1 = ''
                team2 = ''
                for j in range(i-1, -1, -1):
                    candidate = clean_name(odds_lines[j])
                    if candidate:
                        if not team1:
                            team1 = candidate
                        elif not team2:
                            team2 = candidate
                            break
                if team1 and team2:
                    # S'assurer que team1 est l'équipe du haut (Y plus petit)
                    # (on les prend dans l'ordre de lecture : team1 puis team2)
                    home_odd = cote_match[0].replace(',', '.')
                    away_odd = cote_match[-1].replace(',', '.')
                    draw_odd = cote_match[1].replace(',', '.') if len(cote_match) >= 3 else None
                    matches.append({
                        'team1': team1,
                        'team2': team2,
                        'homeOdd': home_odd,
                        'drawOdd': draw_odd,
                        'awayOdd': away_odd
                    })
                i += 1
                continue
            i += 1

        # --------------------- Parser les résultats ---------------------
        results_dict = {}
        for line in results_lines:
            # Exemple: "DR Congo (1:0丨Benin" ou "Zimbabwe (1:1] Egypt"
            m = re.search(r'([A-Za-z\s\'-]+?)\s*[\[\(]\s*(\d+)\s*[-:]\s*(\d+)\s*[\]\)]?\s*([A-Za-z\s\'-]*)', line)
            if m:
                team1 = clean_name(m.group(1))
                score = f"{m.group(2)}-{m.group(3)}"
                team2 = clean_name(m.group(4)) if m.group(4) else ''
                if team1:
                    results_dict[team1.lower().replace('-', ' ')] = score
                    if team2:
                        results_dict[team2.lower().replace('-', ' ')] = score

        # --------------------- Fusion ---------------------
        for m in matches:
            t1 = m['team1'].lower().replace('-', ' ')
            t2 = m['team2'].lower().replace('-', ' ')
            m['result'] = results_dict.get(t1, results_dict.get(t2, '–'))
            h = float(m['homeOdd']) if m['homeOdd'] else None
            d = float(m['drawOdd']) if m['drawOdd'] else None
            a = float(m['awayOdd']) if m['awayOdd'] else None
            if h is not None and a is not None:
                m['sum12'] = round(h + a, 2)
                m['sum1N2'] = round(h + d + a, 2) if d is not None else '–'
                m['mean'] = round((h + d + a) / 3, 2) if d is not None else '–'
            else:
                m['sum12'] = m['sum1N2'] = m['mean'] = '–'

        return {"matches": matches, "debug": {"odds_lines": odds_lines, "results_lines": results_lines}}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
