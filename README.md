# Juglog

Application web installable (PWA) pour s'entraîner à la jonglerie et aux flow arts avec la vidéo : clips courts rangés par agrès et par figure, métronome, bibliothèques de figures.

Tout reste sur le téléphone : aucune donnée n'est envoyée sur internet.

## Avancement

- [x] Étape 1 : agrès (traditionnels et perso), figures, fiches, stockage local, sauvegarde des fiches
- [x] Étape 2 : enregistrement par clips d'une minute, minuteur, métronome
- [x] Étape 3 : lecteur d'analyse, extraits, boîte « À trier »
- [ ] Étape 4 : analyse du rythme par le son, détection des chutes
- [ ] Étape 5 : animations siteswap, journal des sessions, sauvegarde complète

## Installation sur Android

1. Ouvrir l'adresse de l'appli dans Chrome.
2. Menu ⋮ → « Ajouter à l'écran d'accueil » (ou « Installer l'application »).

## Technique

HTML, CSS et JavaScript sans dépendance ni étape de compilation. Données dans IndexedDB, fonctionnement hors ligne par service worker.
