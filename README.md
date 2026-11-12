# Jaafar ♥ Audrey — v2

Appli web privée pour un couple à distance (Casablanca ↔ France).
Hébergée gratuitement sur **GitHub Pages**, données sur **Supabase** (offre gratuite).

Lien : https://jaafarelm001.github.io/compleo/

## Ce que fait l'appli

| Espace | Ce que ça fait |
|---|---|
| Connexion | Choix du prénom (Jaafar ou Audrey) + PIN à 6 chiffres. 3 erreurs → pause de 30 s, jamais de blocage définitif. Session gardée sur l'appareil. |
| Accueil | Vos deux heures locales reliées par un arc, compte à rebours des retrouvailles, moods du jour, câlin / bisou / « je pense à toi », question du jour, chiffres du couple. |
| Mood | 20 moods au choix, un par jour et par personne (modifiable dans la journée), note facultative, historique de 14 jours pour les deux. |
| Compliments d'Audrey | Écrits et gérés **uniquement par Audrey** (écrire, règle de déblocage, débloquer, re-sceller, modifier, supprimer, aperçu). Jaafar ne voit que les débloqués, avec cartes qui se retournent et badge de nouveauté. |
| Compliments de Jaafar | Jaafar écrit à Audrey ; **Audrey choisit la règle** : limite (au maximum N par jour, semaine ou mois), objectif (N à atteindre, dépassement permis) ou pause. Appliquée côté serveur. Jaafar peut retirer un compliment pendant 10 minutes. |
| Question du jour | 60 questions en boucle. La réponse de l'autre reste cachée tant qu'on n'a pas répondu. |
| Mots doux, Musique, Capsules, Souvenirs | Petits mots, morceaux YouTube/Spotify/Deezer lisibles dans l'appli, lettres scellées jusqu'à une date, photos privées avec date et lieu. |
| Réglages | Dates (ensemble depuis, retrouvailles, anniversaire), mot d'accueil, notifications, changement de PIN, déconnexion. |

Surprises : animation de bienvenue (1 fois par jour), mode anniversaire et « mois-versaire », double-tap sur un cœur = pluie de cœurs, 7 taps sur le logo = message caché, code Konami = feu d'artifice.

## Règles de déblocage des compliments

| Règle | Quand le compliment s'ouvre |
|---|---|
| Quand je le décide | Bouton « Débloquer maintenant » (ou tout de suite à la création) |
| À une date précise | Automatiquement à la date/heure choisie |
| Un par jour | Le plus ancien de la file chaque jour (fuseau de Jaafar) |
| Selon son mood | Quand Jaafar partage un des moods choisis (1 max par jour) |
| À notre prochaine rencontre | Quand la date des retrouvailles est atteinte (1 par rencontre) |

Le moteur tourne côté serveur toutes les 10 minutes (pg_cron) et à chaque ouverture de l'appli.

## Architecture

- **Front** : HTML/CSS/JS sans étape de build (pas de `base` à configurer). Routes en `#/mood`, `#/compliments`… ; `404.html` redirige les liens sans `#` vers la bonne page.
- **Robustesse** : délais + nouvelles tentatives sur tous les appels, cache local des dernières données, file d'envoi hors-ligne (les envois partent au retour du réseau), service worker (l'appli s'ouvre sans réseau), jamais d'écran blanc.
- **Supabase** : Auth (2 comptes, PIN = mot de passe haché bcrypt), RLS sur toutes les tables, Storage privé pour les photos, Realtime (moods, compliments, câlins… en direct + présence en ligne).
- **Journal d'erreurs** : table `client_logs` (Supabase → Table Editor).
- **Workflows** : `deploy.yml` (publication + vérification du site en ligne), `keepalive.yml` (appel à Supabase tous les 3 jours).

Schéma complet : `supabase/migrations/`.

## Les PIN

Les PIN ne sont **jamais** stockés dans ce dépôt (ni en clair, ni hachés). Chacun peut changer le sien dans Réglages.
En cas d'oubli, un nouveau PIN se définit dans Supabase → SQL Editor :

```sql
update auth.users set encrypted_password = extensions.crypt('NOUVEAU_PIN_6_CHIFFRES', extensions.gen_salt('bf'))
where email = 'audrey.compleo@example.com';   -- ou jaafar.compleo@example.com
```
