# Juglog

Application web installable (PWA) pour s'entraîner à la jonglerie et aux flow arts avec la vidéo. Trois menus :

- **Entraînement** : ouvre directement l'enregistreur (clips enchaînés, métronome intégré à la vidéo). À l'arrêt, la liste des clips à trier s'affiche.
- **Journal** : les agrès et leurs dossiers (arborescence libre). On analyse un clip (ralenti, image par image, boucle A-B, extraits, comparaison) puis on le range ; plusieurs clips peuvent aller dans le même dossier.
- **Ressources** : des liens pour apprendre, agrès par agrès.

Tout reste sur le téléphone : aucune donnée n'est envoyée sur internet.

## Installation sur Android

1. Ouvrir l'adresse de l'appli dans Chrome.
2. Menu ⋮ → « Ajouter à l'écran d'accueil » (ou « Installer l'application »).

## Technique

HTML, CSS et JavaScript sans dépendance ni étape de compilation. Données dans IndexedDB, fonctionnement hors ligne par service worker.
