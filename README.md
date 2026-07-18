# WearClothing – Wardrobe

**Live-App:** https://heroboy361.github.io/WearClothing/ (passwortgeschützt)

Eine mobile Web-App (PWA) für iPhone, iPad und Desktop im Stil von [tandpfun/wardrobe](https://github.com/tandpfun/wardrobe): Kleidungsfotos importieren, per KI automatisch freistellen, an dir selbst als editorial Model-Foto sehen und komplette Looks stylen. **Alles läuft clientseitig** – kein Server, kein Konto, deine Daten bleiben auf dem Gerät.

## Ablauf

1. **Einrichten:** In den Einstellungen (Zahnrad) den OpenAI-API-Schlüssel eintragen und ein Ganzkörper-Referenzfoto von dir hochladen.
2. **Importieren:** Foto eines Kleidungsstücks oder eines kompletten Outfits per Drag & Drop, Einfügen oder über das Plus-Tray unten links hinzufügen.
3. **Pipeline:** Die KI erkennt jedes Teil (Kategorie, Farbe, Name, Details), du prüfst den Zuschnitt, sie erzeugt einen sauberen **Freisteller** (transparenter Katalog-Look) und ein **Model-Foto**, auf dem du das Teil trägst.
4. **Kleiderschrank:** Alle Teile als Galerie, nach Kategorie filterbar. Tippen öffnet den Editor (Name, Kategorie, Farben per Bild-Sampling, Detail-Tags) mit dem Model-Foto als Hero.
5. **Looks:** Mehrere Teile auswählen → die KI zieht dir das komplette Outfit auf dem Referenzfoto an. Stil-Check bewertet die Auswahl vorab nach deinen Farbregeln; Looks lassen sich speichern und favorisieren.

## Funktionen gegenüber dem Original

- Läuft **komplett im Browser** (das Original nutzt einen lokalen Node-Server) – dadurch als PWA auf iOS/iPad installierbar.
- **Dark Mode** (Hell/Dunkel, umschaltbar im Header oder in den Einstellungen; folgt anfangs dem System).
- **Deutsch & Englisch**, umschaltbar per DE/EN-Button im Header.
- **OpenAI-Nutzungslimit**: max. KI-Bilder pro Tag einstellbar (Standard 40); jede Freisteller-, Model- oder Look-Generierung zählt, bei Erreichen pausiert die App bis zum nächsten Tag.
- **Mehrfach-Foto-Import** direkt aus der Galerie: mehrere Fotos auf einmal auswählen (die OS-Foto-Berechtigung wird über den nativen Auswahldialog abgefragt); jedes Foto wird automatisch nach Kleidungsstücken analysiert.
- **Passwort-Sperrbildschirm** schützt die App.
- **Shop-Link-Import** (optional, per Gemini): Produktseite auslesen und Teil mit Name, Farbe, Größe und Marke anlegen.
- **Stilberater** mit Farbregeln (3-Farben-Regel, Ton-in-Ton, neutrale Basis, Metall-Abstimmung, Lieblingsfarben).

> Standard-Modelle: `gpt-image-1` (Bilder) und `gpt-4o` (Analyse) – beide real bei OpenAI verfügbar. In den Einstellungen änderbar.

## Einrichtung (einmalig)

1. App öffnen, mit Passwort entsperren.
2. **Zahnrad → OpenAI-API-Schlüssel** von [platform.openai.com/api-keys](https://platform.openai.com/api-keys) eintragen (nötig für Import, Freisteller, Model-Fotos; kostenpflichtig nach Verbrauch).
3. **Referenzfoto** (Ganzkörper) hochladen.
4. Optional: **Gemini-Schlüssel** von [aistudio.google.com/apikey](https://aistudio.google.com/apikey) für den Shop-Link-Import.

## Auf dem iPhone/iPad installieren

Seite in **Safari** öffnen → **Teilen → „Zum Home-Bildschirm hinzufügen“**. Startet dann im Vollbild wie eine native App.

## Datenschutz

- Kleiderschrank, Looks und Einstellungen liegen lokal (localStorage + IndexedDB für Bilder). Kein App-Server, kein Konto.
- Fotos werden nur beim Generieren an OpenAI (Bilder) bzw. Gemini (Shop-Links) übertragen. Die API-Schlüssel bleiben auf dem Gerät.
- Der Passwort-Sperrbildschirm hält Fremde fern, ist aber keine Verschlüsselung.

## Technik

- Reines HTML/CSS/JavaScript (ES-Module), keine Build-Tools. Design und Aufbau portiert aus tandpfun/wardrobe (MIT), Schriftart Instrument Sans (OFL, lokal gebündelt).
- **OpenAI**: `gpt-image-2` (Freisteller & Model-Fotos via `/images/edits`), Vision-Modell (`/responses` mit JSON-Schema) für die Teile-Erkennung. Chroma-Key-Freistellung per Canvas.
- **PWA**: Manifest + Service Worker; die Oberfläche funktioniert offline, die KI-Generierung braucht Internet.

| Datei | Zweck |
|---|---|
| `index.html` | App-Gerüst (Galerie, Viewer, Import-Popover, Looks, Einstellungen) |
| `js/app.js` | Zustand, Galerie, Item-Viewer, Import-Pipeline, Looks, Einstellungen |
| `js/openai.js` | OpenAI-Aufrufe, Prompts und Chroma-Key-Freistellung (Port aus Wardrobe) |
| `js/gemini.js` | Shop-Link-Analyse (optional) |
| `js/db.js` | Bildablage in IndexedDB |
| `js/advisor.js` | Farbharmonie-Analyse / Stil-Check |
| `js/icons.js` | SVG-Icon-Set · `js/lock.js` | Passwort-Sperrbildschirm |

## Deployment

Jeder Merge nach `main` veröffentlicht die App über `.github/workflows/pages.yml` automatisch auf den `gh-pages`-Branch, den GitHub Pages ausliefert.
