# Jaafar ♥ Audrey — compteur d'amour

Appli web pour compter les compliments de Jaafar (avec un quota qui se remet à zéro selon la durée choisie par Audrey) et nos clashs (compteur permanent). Frontend sur GitHub Pages, backend sur Supabase.

## Architecture

```
Téléphone de Jaafar ─┐                       ┌─ Supabase ─────────────────────────┐
                     ├─ GitHub Pages (site) ─┤  API : fonctions Postgres (RPC)    │
Téléphone d'Audrey ──┘   index.html, app.js  │  Base : schéma "private" (caché)   │
                                             │  Temps réel : canal de diffusion   │
                                             └────────────────────────────────────┘
```

- **Base de données** : deux tables dans un schéma `private` que l'API publique ne peut pas lire.
  - `private.couple` : le code du couple et le PIN d'Audrey (hachés en bcrypt), la durée de la période et le quota.
  - `private.events` : chaque compliment ou clash, avec son auteur, son texte et sa date.
- **API** : tout passe par 6 fonctions côté serveur, et chacune vérifie le code du couple.

  | Fonction | Rôle | Qui |
  |---|---|---|
  | `get_state` | lire les compteurs, les règles et le journal ; fait tourner la période si elle est finie | tous les deux |
  | `add_event` | ajouter un compliment ou un clash | tous les deux |
  | `delete_event` | supprimer une entrée : libre pendant 5 min (annulation), ensuite PIN d'Audrey | tous les deux / Audrey |
  | `verify_pin` | vérifier le PIN d'Audrey | Audrey |
  | `update_settings` | changer la durée et le quota | Audrey (PIN) |
  | `reset_quota` | remettre le quota à zéro tout de suite | Audrey (PIN) |

- **Règles garanties par le serveur** (pas seulement par l'interface) : seul le PIN permet de changer le quota, le compteur de clashs n'a aucune fonction de remise à zéro, et un anti-spam limite à 30 ajouts par minute.
- **Temps réel** : quand l'un ajoute quelque chose, l'autre téléphone se met à jour aussitôt. Si le temps réel coupe, l'appli se resynchronise toute seule toutes les 15 secondes.

## Fichiers

```
index.html            page de l'appli
styles.css            thème romantique, responsive
app.js                logique : appels API, animations, compte à rebours
config.js             URL + clé publique Supabase
manifest.webmanifest  installation sur l'écran d'accueil
icon.svg, icon-512.png, apple-touch-icon.png
supabase/
  migrations/20261111000000_init.sql   tables + API + sécurité
  setup.sql                            code du couple + PIN d'Audrey
.github/workflows/deploy.yml           déploiement automatique sur GitHub Pages
```

## Installation

### 1. Supabase (5 min)

1. Crée un projet sur https://supabase.com (gratuit).
2. **SQL Editor** → colle tout le contenu de `supabase/migrations/20261111000000_init.sql` → **Run**.
3. Ouvre `supabase/setup.sql`, remplace le code du couple et le PIN d'Audrey, colle-le dans le SQL Editor → **Run**.
   - Code du couple : au moins 6 caractères, une petite phrase à vous.
   - PIN d'Audrey : 4 à 8 chiffres. C'est elle qui doit le choisir.
4. **Project Settings → API** : copie la **Project URL** et la clé **anon / publishable**. Ne prends jamais la clé `service_role` ou `secret`.

### 2. GitHub (5 min)

1. Crée un dépôt (ex. `love-counter`) et envoie-y tous les fichiers de ce dossier, y compris `.github/`.
2. Choisis **une** des deux façons de donner les clés :
   - **Simple** : colle l'URL et la clé anon dans `config.js`.
   - **Propre** : laisse `config.js` tel quel et ajoute deux secrets dans **Settings → Secrets and variables → Actions** : `SUPABASE_URL` et `SUPABASE_ANON_KEY`. Le déploiement génère `config.js` tout seul.
3. **Settings → Pages** → Source : **GitHub Actions**.
4. Chaque `push` sur `main` déploie l'appli. L'adresse s'affiche dans l'onglet **Actions** : `https://TON-PSEUDO.github.io/love-counter/`.

### 3. Sur vos téléphones

1. Ouvrez le lien et tapez le code du couple (une seule fois par téléphone).
2. Choisissez « Jaafar » ou « Audrey ». Audrey tape aussi son PIN.
3. **Ajouter à l'écran d'accueil** (Safari : bouton Partager ; Chrome : menu ⋮) pour l'avoir comme une vraie appli, avec son icône.

## Mode démo

Sans clés dans `config.js`, l'appli marche en mode démo : les données restent sur l'appareil et le PIN d'Audrey est `1234`. C'est pratique pour tester le design.

## Entretien

- **Changer le code ou le PIN** : relance `supabase/setup.sql` avec les nouvelles valeurs. Les téléphones redemanderont le code.
- **Voir les données** : Supabase → **Table Editor** → schéma `private`.
- **Pause du projet gratuit** : Supabase met en pause un projet gratuit inactif pendant longtemps. Il suffit de le relancer depuis le tableau de bord.

## Sécurité, en bref

La clé anon est visible dans le site, et c'est normal. Elle ne permet que d'appeler les 6 fonctions, et chacune exige le code du couple. Le code et le PIN sont stockés hachés, et chaque mauvais essai est ralenti. Pour une appli à deux, c'est largement suffisant ; gardez simplement le code pour vous.
