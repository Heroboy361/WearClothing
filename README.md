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

## Persönlicher Shop: Anprobe vor dem Kauf

Die Startseite zeigt alle Teile mit der vorhandenen Anprobe als Titelbild. Auf dem Desktop wechselt Hover zum Produktfoto; auf dem Handy und per Tastatur gibt es den Schalter **An mir / Produkt**. Beim Hover werden nur bereits gespeicherte Bilder angezeigt, keine neuen KI-Aufrufe gestartet. Ohne Anprobe bleibt das Produktfoto sichtbar und der Status wird benannt.

- **Entdecken** zeigt alle Teile. **Mein Kleiderschrank** enthält deinen Besitz; **Wunschliste** enthält Kaufideen. Bestehende Datensätze ohne Sammlungsfeld zählen weiterhin zum Besitz.
- Favoriten sind eine zusätzliche Markierung, unabhängig von Besitz oder Wunschliste. Suche berücksichtigt Name, Marke, Größe, Material, Muster und Tags.
- Die Produktansicht bietet Einzelanprobe, Bildvergleich, Kombination mit anderen Teilen, Original-Shop-Link und „Gekauft · in meinen Schrank“.
- Beim Fotoimport kannst du Sammlung und automatische Anprobe auswählen. Ohne Referenzfoto wird das Teil trotzdem gespeichert. Eine Einzelanprobe lässt sich später über „An mir ansehen“ erzeugen.
- Shop-Links lassen sich ohne Gemini-Schlüssel vormerken; mit hinterlegtem Schlüssel werden Metadaten ergänzt. Ein Produktfoto oder Screenshot kann direkt am Eintrag ergänzt werden. Die App verspricht keine automatische Bildübernahme von Shops, die Browserzugriff blockieren.
- Ein ersetztes Produktfoto entfernt die alte Anprobe, damit die Vorschau nicht das falsche Teil zeigt.
- Exporte enthalten keine API-Schlüssel mehr. Beim Wiederherstellen bleiben die Schlüssel auf dem aktuellen Gerät erhalten; auch Schlüssel aus älteren Backups werden nicht übernommen.

KI-Anproben sind visuelle Vorschauen. Sie messen keine Passform und garantieren weder Größenpassung noch identische Darstellung von Material, Logo oder Schnitt. Fotos und gespeicherte Anproben bleiben lokal; bestehende KI-Aufrufe nutzen weiter die API-Einstellungen der App. Laufende Generierungen brauchen einen geöffneten Tab und eine Internetverbindung.

### Später zu Cloudflare

Dieser Stand bleibt eine statische PWA ohne Build-Abhängigkeiten. `js/shop.js` enthält die Produktdarstellung, `js/catalog.js` die Sammlungs-/Filterregeln; API-Provider bleiben in `js/openai.js` und `js/gemini.js` gekapselt.

`node scripts/package-static.mjs` erstellt ausschließlich öffentliche App-Dateien in `dist/`. Die vorbereitete `cloudflare/wrangler.jsonc` kann diesen Ordner später als [Worker Static Assets](https://developers.cloudflare.com/workers/static-assets/binding/) ausliefern. **In diesem Schritt wird nichts auf Cloudflare angelegt oder veröffentlicht.**

Vor einem Hostingwechsel die bestehende Sicherung exportieren und auf der neuen Adresse importieren: Browserdaten sind an die jeweilige Origin gebunden und wandern nicht automatisch mit. Nach dem Import API-Schlüssel auf dem neuen Gerät/in der neuen Origin erneut eintragen.

Für eine spätere serverseitige KI-Anbindung: authentifizierte Worker-Endpunkte vor die Provider setzen, API-Schlüssel als Worker Secrets verwalten und serverseitige Nutzungsbegrenzung einführen. Die vorbereitete Static-Assets-Konfiguration alleine liefert noch keinen KI-Proxy, keine Konten und keine Gerätesynchronisierung. Hintergrundaufträge sowie optionale Bildsynchronisierung sind ein gesonderter Ausbau.

### Prüfung

`node --test tests/catalog.test.mjs` prüft Sammlungen, Suche, Sortierung, sichere Shop-Links und den schlüsselfreien Export. `node scripts/package-static.mjs` prüft und paketiert die statischen Assets. `node scripts/check-static.mjs` prüft JavaScript-Syntax, Modulimporte, eindeutige HTML-IDs und lokale Assets.
