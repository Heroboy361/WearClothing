# 👗 WearClothing – Virtuelle Anprobe

**📲 Live-App:** https://heroboy361.github.io/WearClothing/ (passwortgeschützt)

Eine mobile Web-App (PWA) für iPhone, iPad und Desktop: Körpermaße erfassen, Kleidung aus Online-Shops virtuell am eigenen 3D-Avatar anprobieren, Outfits speichern und Stilberatung erhalten. **Alle Daten bleiben lokal auf deinem Gerät** – es gibt keinen Server und kein Konto.

## ✨ Funktionen

- **🧍 Körperprofil & Kamera-Scan (Beta):** Kamera-Aufnahme mit Silhouetten-Hilfslinie; aus Körpergröße, Körperbau und Foto werden Schulterbreite, Brust-, Taillen- und Hüftumfang, Bein- und Armlänge geschätzt – danach manuell feinjustierbar. Hautton wird automatisch aus dem Foto übernommen. Zusätzlich Haarfarbe, Augenfarbe und Frisur für Avatar und Stilberatung.
- **👕 Kleiderschrank:** Teile per **Shop-Link und/oder Produktbild** hinzufügen (T-Shirts, Pullover, Jacken, Hosen, Shorts, Röcke, Kleider, Schuhe – plus **Uhr ⌚ und Kette 📿**). Die dominante Farbe wird automatisch aus dem Bild erkannt.
- **✨ 3D-Anprobe:** Parametrischer Avatar nach deinen Maßen auf einem modernen, transparenten Showroom-Podest. **360° drehbar** (Finger/Maus), Pinch-Zoom, Auto-Rotation. Kleidung wird als 3D-Layer angezogen, Produktbilder erscheinen als Print auf dem Oberteil.
- **⭐ Outfits & Favoriten:** Looks benennen, speichern, als Favorit markieren und später mit einem Tipp wieder anziehen.
- **💡 Stilberater:** Eigene Stilregeln (3-Farben-Regel, Ton-in-Ton, neutrale Basisfarben, Akzentfarbe, abgestimmte Schmuck-Metalle, Lieblingsfarben). Der **„?“-Button** in der Anprobe liefert eine kurze Analyse (1–3 Sätze) mit Punktzahl – inkl. Abgleich mit deiner Haar- und Augenfarbe und dem Schmuck.

## 📱 Auf dem iPhone installieren

1. Die App muss über **HTTPS** erreichbar sein (z. B. GitHub Pages, s. u.) – die Kamera funktioniert nur über HTTPS.
2. Seite in **Safari** öffnen.
3. **Teilen-Symbol → „Zum Home-Bildschirm hinzufügen“**.
4. Die App startet dann im Vollbild wie eine native App und funktioniert dank Service Worker auch **offline**.

### Veröffentlichen über GitHub Pages

Im Repo ist ein Workflow (`.github/workflows/pages.yml`) enthalten. Einmalig aktivieren:

1. Auf GitHub: **Settings → Pages → Source: „GitHub Actions“** wählen.
2. Den Branch mit der App nach `main` mergen (oder den Workflow manuell starten).
3. Die App ist danach unter `https://<dein-name>.github.io/WearClothing/` erreichbar.

### Lokal ausprobieren

```bash
# im Repo-Ordner (Python ist auf macOS vorinstalliert):
python3 -m http.server 8080
# dann im Browser: http://localhost:8080
```

> Hinweis: Über `http://localhost` funktioniert die Kamera auch ohne HTTPS. Vom iPhone aus brauchst du HTTPS (z. B. GitHub Pages).

## ⚠️ Hinweise & Grenzen

- **LiDAR:** Apple gibt den LiDAR-Sensor nur für native Apps frei, nicht für Web-Apps. Der Scan nutzt daher Kamera + Körpergröße + anthropometrische Proportionen; die Werte sind eine Schätzung und lassen sich manuell präzisieren.
- **Shop-Links:** Bilder direkt von Shop-URLs zu laden scheitert oft an CORS-Beschränkungen der Shops. Am zuverlässigsten: Produktbild speichern und hochladen – der Link wird zusätzlich gespeichert und ist jederzeit antippbar.
- **Speicher:** Profile, Teile, Outfits und Regeln liegen im `localStorage` des Browsers. Website-Daten löschen = App-Daten löschen.

## 🛠 Technik

- Reines HTML/CSS/JavaScript, keine Build-Tools nötig
- [Three.js](https://threejs.org) (lokal in `js/vendor/`, MIT-Lizenz) für den 3D-Avatar
- PWA: `manifest.webmanifest` + Service Worker (`sw.js`) für Offline-Betrieb
- `getUserMedia` für den Kamera-Scan

| Datei | Zweck |
|---|---|
| `index.html` | App-Gerüst, alle 5 Bereiche (Profil, Kleidung, Anprobe, Outfits, Berater) |
| `js/app.js` | Zustand, Speicherung, Navigation, Kleiderschrank & Outfits |
| `js/avatar.js` | Parametrischer 3D-Avatar + Kleidungs-/Schmuck-Meshes |
| `js/scan.js` | Kamera, Foto-Aufnahme, Maßschätzung, Hautton-Erkennung |
| `js/advisor.js` | Farbharmonie-Analyse und Bewertungstexte |
