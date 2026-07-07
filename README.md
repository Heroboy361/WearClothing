# WearClothing – Virtuelle Anprobe

**Live-App:** https://heroboy361.github.io/WearClothing/ (passwortgeschützt)

Eine mobile Web-App (PWA) für iPhone, iPad und Desktop: eigenes Foto hochladen, Kleidung aus Online-Shops **fotorealistisch per Bild-KI anprobieren**, Outfits speichern und Stilberatung erhalten.

## Funktionen

- **Meine Fotos:** Ganzkörperfoto (+ optional Gesichtsfoto) hochladen – die KI orientiert sich daran und erhält Identität, Pose, Proportionen und Hintergrund.
- **Kleiderschrank:** Teile per **Shop-Link und/oder Produktbild** hinzufügen (Oberteile, Hosen, Röcke, Kleider, Schuhe, Uhr, Kette). Kategorie, Farbe und Name werden **automatisch erkannt**.
- **KI-Anprobe:** Ausgewählte Teile werden fotorealistisch in dein Foto editiert. Pro Slot (Oberteil, Jacke, Hose, Schuhe, Uhr, Kette) wählbar: **Behalten / Ausziehen / Wechseln**. Automatik-Modus: die KI entscheidet anhand deiner Stilregeln, was getauscht wird. Ergebnis kann als neues Ausgangsfoto übernommen werden.
- **Outfits & Favoriten:** Looks inkl. generiertem Bild speichern, favorisieren, wieder ansehen.
- **Stilberater:** Eigene Farbregeln (3-Farben-Regel, Ton-in-Ton, neutrale Basisfarben, Metall-Abgleich, Lieblingsfarben) plus Kurz-Analyse der aktuellen Auswahl über den Frage-Button.

## Einrichtung (einmalig)

1. App öffnen und mit dem Passwort entsperren.
2. **Profil → Bild-KI einrichten:** kostenlosen Google-KI-Schlüssel auf [aistudio.google.com/apikey](https://aistudio.google.com/apikey) erstellen und in der App einfügen (wird nur lokal auf dem Gerät gespeichert).
3. **Profil → Meine Fotos:** Ganzkörperfoto hochladen.

## Auf dem iPhone installieren

1. Seite in **Safari** öffnen.
2. **Teilen → „Zum Home-Bildschirm hinzufügen“** – die App startet dann im Vollbild wie eine native App.

## Datenschutz

- Fotos, Kleiderschrank, Outfits, Regeln und der API-Schlüssel liegen ausschließlich **lokal im Browser** (localStorage). Es gibt keinen App-Server und kein Konto.
- Beim Tippen auf „Anprobieren“ werden das Nutzerfoto und die gewählten Kleidungsbilder **direkt an die Google-Gemini-API** übertragen, um das Ergebnisbild zu erzeugen. Sonst verlässt nichts das Gerät.
- Der Passwort-Sperrbildschirm hält Fremde von der App fern, ist aber keine Verschlüsselung.

## Technik

- Reines HTML/CSS/JavaScript, keine Build-Tools; Design im transparenten Glas-Stil mit eigenem SVG-Icon-Set
- Bildgenerierung: Google Gemini (Modell `gemini-2.5-flash-image`), Aufruf direkt aus dem Browser mit dem Schlüssel des Nutzers
- PWA: `manifest.webmanifest` + Service Worker (`sw.js`), App-Oberfläche funktioniert offline (die KI-Generierung braucht Internet)

| Datei | Zweck |
|---|---|
| `index.html` | App-Gerüst, alle 5 Bereiche (Profil, Kleidung, Anprobe, Outfits, Berater) |
| `js/app.js` | Zustand, Speicherung, Navigation, Kleiderschrank, Anprobe-Ablauf, Outfits |
| `js/tryon.js` | Prompt-Aufbau und Aufruf der Gemini-Bild-KI |
| `js/detect.js` | Automatische Erkennung von Kategorie/Farbe/Name aus Link und Bild |
| `js/advisor.js` | Farbharmonie-Analyse und Bewertungstexte |
| `js/icons.js` | SVG-Icon-Set |
| `js/lock.js` | Passwort-Sperrbildschirm |

## Deployment

Jeder Merge nach `main` veröffentlicht die App automatisch über den Workflow `.github/workflows/pages.yml` auf den `gh-pages`-Branch, den GitHub Pages ausliefert.
