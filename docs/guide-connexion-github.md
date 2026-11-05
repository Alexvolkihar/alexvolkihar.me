# Guide : activer la connexion GitHub de la Collection genart

Ce guide active le bouton « Add to collection » sur le site en ligne (https://www.alexvolkihar.ovh).
Une fois connecté avec ton compte GitHub, tu ajoutes une œuvre à la collection en un clic : le serveur
fait un commit dans `data/genart-collection.ts` et Vercel redéploie le site en environ une minute.

Personne d'autre que toi ne peut l'utiliser : le serveur vérifie ton identifiant GitHub à chaque requête.
La documentation technique complète est dans [`genart-admin.md`](./genart-admin.md).

> Fais toutes les commandes de ce guide dans **un terminal à part** (une nouvelle fenêtre WSL),
> pas dans Claude Code : les valeurs secrètes ne doivent pas apparaître dans une conversation.

Durée : environ 10 minutes.

---

## Étape 1 : créer l'application OAuth GitHub

Elle sert seulement à vérifier que c'est bien toi qui te connectes. Elle ne donne aucun droit sur tes dépôts.

1. Ouvre https://github.com/settings/developers puis **OAuth Apps** → **New OAuth App**.
2. Remplis :

   | Champ | Valeur |
   |---|---|
   | Application name | `alexvolkihar.ovh genart` |
   | Homepage URL | `https://www.alexvolkihar.ovh` |
   | Authorization callback URL | `https://www.alexvolkihar.ovh/api/auth/callback` |

3. Clique **Register application**.
4. Sur la page qui s'ouvre :
   - copie le **Client ID** (garde l'onglet ouvert) ;
   - clique **Generate a new client secret** et copie le **secret** tout de suite (GitHub ne le réaffiche plus).

## Étape 2 : créer le jeton qui fait les commits

Ce jeton permet au serveur d'écrire dans le dépôt du site, et seulement dans celui-là.

1. Ouvre https://github.com/settings/personal-access-tokens/new (jeton *fine-grained*).
2. Remplis :

   | Champ | Valeur |
   |---|---|
   | Token name | `alexvolkihar.ovh genart collection` |
   | Expiration | 90 jours ou 1 an (note la date quelque part) |
   | Repository access | **Only select repositories** → `Alexvolkihar/alexvolkihar.me` |
   | Permissions → Repository → **Contents** | **Read and write** |

   Ne coche aucune autre permission (« Metadata : Read-only » est ajoutée automatiquement, c'est normal).
3. Clique **Generate token** et copie le jeton (il commence par `github_pat_`).

## Étape 3 : enregistrer les valeurs dans Vercel

Dans ton terminal à part :

```bash
cd ~/projets/alexvolkihar.me
```

### 3a. Les trois valeurs secrètes

Chaque commande te demande la valeur : colle-la puis appuie sur Entrée.

```bash
npx vercel env add GITHUB_CLIENT_ID production
npx vercel env add GITHUB_CLIENT_SECRET production --sensitive
npx vercel env add GITHUB_COMMIT_TOKEN production --sensitive
```

- `GITHUB_CLIENT_ID` : le Client ID de l'étape 1.
- `GITHUB_CLIENT_SECRET` : le client secret de l'étape 1.
- `GITHUB_COMMIT_TOKEN` : le jeton `github_pat_…` de l'étape 2.

### 3b. Les valeurs non secrètes (copier-coller tel quel)

```bash
printf 'Alexvolkihar' | npx vercel env add ALLOWED_GITHUB_LOGIN production
printf '58124256' | npx vercel env add ALLOWED_GITHUB_ID production
printf 'https://www.alexvolkihar.ovh' | npx vercel env add SITE_ORIGIN production
printf 'Alexvolkihar/alexvolkihar.me' | npx vercel env add GITHUB_REPO production
printf 'main' | npx vercel env add GITHUB_BRANCH production
openssl rand -hex 32 | tr -d '\n' | npx vercel env add SESSION_SECRET production --sensitive
```

La dernière ligne génère un secret aléatoire pour signer ta session, sans jamais l'afficher.

### 3c. Vérifier

```bash
npx vercel env ls production
```

Tu dois voir ces 9 variables : `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_COMMIT_TOKEN`,
`ALLOWED_GITHUB_LOGIN`, `ALLOWED_GITHUB_ID`, `SITE_ORIGIN`, `GITHUB_REPO`, `GITHUB_BRANCH`, `SESSION_SECRET`.

> Si une commande dit que la variable existe déjà, ajoute `--force` à la fin pour la remplacer.

## Étape 4 : dire à Claude que c'est fait

Le travail du portfolio (séries genart, collection, connexion GitHub) doit être commité et poussé sur
`main` pour que tout soit en ligne. Préviens Claude : il prépare les commits, pousse, et Vercel
redéploie automatiquement avec les nouvelles variables.

## Étape 5 : tester

1. Ouvre https://www.alexvolkihar.ovh/genart/collection.
2. En bas de page, clique sur le petit **cadenas** → GitHub te demande d'autoriser l'application → accepte.
3. Tu reviens sur le site avec « Signed in as Alexvolkihar ».
4. Ouvre une série (par exemple https://www.alexvolkihar.ovh/genart/strata), clique sur une œuvre,
   puis **Add to collection** : donne-lui un nom, valide.
5. Le lien vers le commit s'affiche. Environ une minute plus tard, l'œuvre apparaît dans la Collection.

Si quelque chose ne marche pas :

| Message | Cause probable |
|---|---|
| Erreur 503 | une des 9 variables manque (refais l'étape 3c) |
| Erreur 403 après la connexion | tu t'es connecté avec un autre compte GitHub |
| « Unknown series » ou erreur 502 | le travail genart n'est pas encore poussé sur `main` (étape 4) |
| Erreur 409 | cette œuvre est déjà dans la collection |

## Entretien

- **Quand le jeton expire** : recrée-le (étape 2) puis
  `npx vercel env add GITHUB_COMMIT_TOKEN production --sensitive --force`, et redéploie.
- **Pour déconnecter toutes les sessions** : régénère le secret de session avec la dernière ligne de
  l'étape 3b en ajoutant `--force`.
- **Pour tout couper** : supprime l'application OAuth sur GitHub et le jeton ; le site continue de
  fonctionner, seul l'ajout à la collection est désactivé.
