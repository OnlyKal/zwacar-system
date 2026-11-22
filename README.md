# ZwaCar — Plateforme de location de véhicules

Plateforme de mise en relation entre **entreprises propriétaires de véhicules** et **clients**.

| Application | Dossier | Technologies | Public |
|---|---|---|---|
| API REST | `server/` | Node.js, Express 5, Sequelize (SQLite en dev, MySQL en prod), JWT, node-cron, PDFKit, Nodemailer, Sharp | — |
| Web Admin | `web/` | React 19, Vite, React Router, React Icons, Recharts, Framer Motion | Super Administrateur et entreprises |
| Application mobile | `mobile/` | Flutter 3.35 (Android / iOS) | Clients |

Hiérarchie : **Super Administrateur → Entreprises → Clients**.

---

## 1. Démarrage rapide (développement)

Prérequis : Node.js ≥ 18, Flutter ≥ 3.35.

```bash
# API (port 4100)
cd server
cp .env.example .env          # puis renseigner les secrets (voir § 4)
npm install
npm run seed                  # schéma, super admin, catalogue, données de démo
npm run dev                   # http://localhost:4100/api — documentation : /api/docs

# Web Admin (port 5180, proxy /api → 4100)
cd web
npm install
npm run dev                   # http://localhost:5180

# Application mobile
cd mobile
flutter pub get
flutter run                                           # API de production : https://www.zwacar.space/api
flutter run --dart-define=API_URL=http://10.0.2.2:4100/api      # API locale depuis l'émulateur Android
```

Pour un téléphone physique connecté au même réseau que le serveur local, remplacez `10.0.2.2` par l'adresse IP locale de l'ordinateur qui exécute l'API (ex. `http://192.168.1.20:4100/api`).

`npm run seed -- --reset` réinitialise complètement la base SQLite de développement.

### Comptes de démonstration

| Rôle | Email | Mot de passe |
|---|---|---|
| Super Administrateur | `admin@zwacar.com` | `Admin@12345` |
| Admin entreprise (Prestige Auto Kinshasa) | `admin@prestige-auto.cd` | `Demo@12345` |
| Gestionnaire | `gestion@prestige-auto.cd` | `Demo@12345` |
| Comptable | `compta@prestige-auto.cd` | `Demo@12345` |
| Chauffeur | `chauffeur@prestige-auto.cd` | `Demo@12345` |
| Admin entreprise (Lubumbashi Car Rental) | `admin@lshi-rental.cd` | `Demo@12345` |
| Client (app mobile) | `client@zwacar.com` | `Demo@12345` |

Les photos des véhicules de démonstration sont des illustrations générées par le seed.

---

## 2. Fonctionnalités

### Super Administrateur (Web Admin `/admin`)
- Tableau de bord : entreprises, clients, véhicules actifs/expirés, revenus, crédits vendus/consommés, entreprises les plus actives, évolution des inscriptions, statistiques de publication.
- Entreprises : création (avec administrateur invité par email ou mot de passe défini, crédits offerts), modification, logo, suspension/réactivation (sessions coupées immédiatement), suppression (sauvegarde automatique préalable), ajustement du wallet, notification par email.
- Utilisateurs : tous les comptes (staff et clients), rôles, suspension, invitation, lien de réinitialisation.
- Véhicules : consultation de tous les véhicules, validation/refus (avec remboursement), suspension/réactivation, suppression.
- Catalogue : catégories et caractéristiques.
- Paiements : validation des rechargements, enregistrement de paiements hors ligne, factures et reçus PDF ; historique complet des crédits.
- Rechargement des crédits par **deux moyens uniquement** : **Mobile Money** (FlexPay — M-Pesa, Orange Money, Airtel Money, Afrimoney : crédits ajoutés automatiquement après vérification) ou **Demande de recharge** (validée par le Super Administrateur après réception du paiement).
- **Notifications internes** (cloche de la barre supérieure) : paiement Mobile Money confirmé (crédits ajoutés) et nouvelle demande de recharge à valider.
- Paramètres : identité de la plateforme, tarification (15 USD = 20 crédits, 12 crédits / véhicule / 12 mois — modifiables), validation préalable des véhicules, inscriptions clients, **configuration Gmail SMTP chiffrée avec bouton de test**, notifications administratives, exécution manuelle des tâches planifiées.
- Rapports PDF : financier, consommation des crédits, véhicules, entreprises, activité, statistique (globaux ou par entreprise).
- Journal d’activité et journal des emails.
- Sauvegardes : création, téléchargement, restauration (fichier ou liste), sauvegarde quotidienne automatique.

### Espace entreprise (Web Admin `/company`)
- Tableau de bord : véhicules, solde, dépenses, prochaines expirations, consultations, contacts par canal, véhicules les plus consultés.
- Véhicules : fiche complète, équipements, **4 photos obligatoires + 1 vidéo facultative (20 Mo)**, glisser-déposer, prévisualisation, compression côté navigateur et côté serveur, barre de progression, réordonnancement ; **offre chauffeur** (sans chauffeur / chauffeur en option avec supplément jour-semaine-mois / chauffeur inclus), publication payante, renouvellement automatique activable/désactivable, disponibilité, historique.
- Wallet : solde, rechargement par packs — **Mobile Money** (confirmation sur le téléphone, suivi en direct, crédits immédiats) ou **demande de recharge** —, historique des opérations, factures et reçus PDF.
- Contacts clients (WhatsApp, appels, emails) avec la demande du client (avec/sans chauffeur, durée, estimation) et suivi de traitement.
- Équipe : collaborateurs avec rôles (administrateur, gestionnaire, comptable, agent commercial, chauffeur).
- Profil de l’entreprise, rapports PDF, journal d’activité (administrateur).

### Client (application mobile)
- Accueil : catégories, véhicules populaires, récents.
- Recherche : texte libre, filtres (catégorie, marque, prix, places, transmission, carburant, localisation, équipements, avec/sans chauffeur, disponibilité), tri (prix, popularité, date), pagination infinie.
- Fiche : galerie plein écran, vidéo, caractéristiques, tarifs jour/semaine/mois, conditions, véhicules similaires.
- **Estimation de location** : durée (1 à 365 jours) + interrupteur « Avec chauffeur » ; le total (véhicule + chauffeur) est recalculé par l’API et transmis à l’entreprise lors du contact.
- **Contact direct** : WhatsApp (message pré-rempli), appel téléphonique (ouvre l’application téléphone), email.
- Compte facultatif et gratuit : inscription, connexion, mot de passe oublié, favoris.

---

## 3. Règles métier clés

| Règle | Implémentation |
|---|---|
| 15 USD = 20 crédits ; 1 publication = 12 crédits ; validité 12 mois | `settings.billing` (modifiable dans Paramètres → Tarification) |
| Publication impossible sans 4 photos et champs obligatoires | `vehicle.service.completeness()` (contrôle serveur) + checklist dans le formulaire |
| Renouvellement automatique à échéance | `jobs/scheduler.js` (toutes les heures + au démarrage) → `processExpirations()` |
| Solde insuffisant → désactivation + email | statut `expired`, retrait des résultats publics, email `vehicleExpired` |
| Chauffeur | `none` : location sans chauffeur ; `optional` : le client choisit, supplément ajouté (jour obligatoire, semaine/mois facultatifs) ; `included` : toujours avec chauffeur, compris dans le tarif — `services/pricing.service.js` |
| Estimation | mois (30 j) → semaines → jours ; un reliquat n’est jamais plus cher que la période supérieure ; tarifs manquants déduits (jour = semaine/7 = mois/30) |
| Rappels avant expiration | paliers configurables (30 et 7 jours par défaut) |
| **Aucun double débit** | transaction verrouillée + clé d’idempotence **unique** par opération (`publish:<id>:<n>`, `renewal:<id>:<échéance>`, `topup:<paiement>`, `refund:<transaction>`) |
| Isolation des entreprises | `scopeCompanyId()` / `assertOwnership()` sur toutes les routes ; une ressource d’une autre entreprise renvoie 404 |

---

## 4. Sécurité

- Mots de passe bcrypt (12 tours), politique : 8 caractères, lettre + chiffre ; verrouillage 15 min après 5 échecs ; limitation de débit sur l’authentification et l’API.
- Access token JWT (15 min) en mémoire côté web ; refresh token opaque, **haché en base**, à rotation, cookie `httpOnly` `SameSite=Strict` (web) ; détection de réutilisation → révocation de toutes les sessions.
- RBAC par permissions (`server/src/utils/constants.js`), contrôles systématiques côté serveur ; le frontend ne fait que masquer.
- Validation Joi de toutes les entrées (champs inconnus supprimés), requêtes paramétrées Sequelize (pas d’injection SQL), Helmet, CORS restreint en production.
- Médias : images décodées et ré-encodées en WEBP (métadonnées EXIF/GPS supprimées), vidéos vérifiées par signature binaire, noms aléatoires ; l’immatriculation n’est jamais exposée publiquement.
- Identifiants SMTP **chiffrés AES-256-GCM** (`ENCRYPTION_KEY`), jamais renvoyés par l’API ni journalisés.
- Journalisation des opérations sensibles (`audit_logs`), gestion centralisée des erreurs (messages génériques en production).

Générer les secrets du `.env` :

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # JWT_ACCESS_SECRET / JWT_REFRESH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # ENCRYPTION_KEY (64 caractères hex)
```

> Conservez `ENCRYPTION_KEY` : la changer rend illisible la configuration SMTP enregistrée (il suffit alors de la ressaisir).

---

## 5. Emails (Gmail SMTP)

Web Admin → Paramètres → **Emails (Gmail)** : adresse Gmail, mot de passe d’application (validation en deux étapes requise sur le compte Google), serveur `smtp.gmail.com`, port 587 (TLS) ou 465 (SSL), nom d’expéditeur, adresse de réponse, puis **Tester la connexion SMTP**.

Emails gérés : bienvenue, confirmation de compte, invitation, réinitialisation / changement de mot de passe, publication, validation/refus/suspension, rappels d’expiration, renouvellement, désactivation pour solde insuffisant, demande et confirmation de rechargement (**facture et reçu PDF en pièces jointes**), notifications administratives, suspension d’entreprise. Tant que le SMTP n’est pas activé, les envois sont tracés « non envoyés » dans le journal des emails.

---

## 6. Mise en production

### Déploiement sur www.zwacar.space (VPS 169.58.61.169, `/opt/zwacar`)

Depuis le poste de développement (clé SSH autorisée sur le VPS) :

```bash
./deploy/deploy.sh                          # clé ~/.ssh/id_ed25519_zwacar utilisée automatiquement
./deploy/deploy.sh "Ajout du filtre chauffeur"   # message de commit personnalisé
NO_PUSH=1 ./deploy/deploy.sh                # déployer sans pousser sur GitHub
```

Après un déploiement réussi (site vérifié sur `/api/health`), le script enregistre les modifications et les **pousse sur GitHub** (`OnlyKal/zwacar-system`, branche courante). En cas d’échec du déploiement, rien n’est poussé.

Le script compile le Web Admin, envoie le code dans `/opt/zwacar` (jamais `.env` ni `storage/`), puis exécute `deploy/server-setup.sh` sur le serveur : Node 22, MySQL, Nginx, Certbot et PM2 si absents ; base `zwacar` et utilisateur dédié ; `server/.env` avec secrets aléatoires (créé une seule fois) ; super administrateur `admin@zwacar.space` (mot de passe initial affiché une seule fois) ; HTTPS Let’s Encrypt pour `www.zwacar.space` et `zwacar.space` (redirigé). Relancer le même script met l’application à jour sans toucher aux données. Variables facultatives : `ZWACAR_PORT` (défaut 4100), `ZWACAR_ADMIN_EMAIL`, `ZWACAR_CERT_EMAIL`.

Application mobile : identifiant **`com.zwacar.app`** (Android et iOS) ; la version publiée utilise automatiquement `https://www.zwacar.space/api`.

Prérequis serveur : Node.js ≥ 18 (22 LTS recommandé), MySQL 8 (base `utf8mb4`), Nginx + certificat HTTPS, PM2.
Les fichiers prêts à l’emploi sont dans `deploy/`.

```bash
# 1. Base MySQL
mysql -e "CREATE DATABASE zwacar CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
          CREATE USER 'zwacar'@'localhost' IDENTIFIED BY '…'; GRANT ALL ON zwacar.* TO 'zwacar'@'localhost';"

# 2. Web Admin (compilé puis servi par l'API : un seul domaine)
cd web && npm ci && npm run build

# 3. API
cd ../server && npm ci --omit=dev
cp ../deploy/env.production.example .env      # renseigner secrets, URLs HTTPS, MySQL, SEED_ADMIN_PASSWORD
npm run seed -- --no-demo                     # schéma, super admin, catégories, moyens de paiement (sans démo)
pm2 start ../deploy/ecosystem.config.cjs && pm2 save && pm2 startup

# 4. Nginx : deploy/nginx.conf.example (HTTPS, uploads jusqu'à 150 Mo), puis certbot
```

**Contrôles automatiques au démarrage** : en production, l’API refuse de démarrer si un secret JWT est faible ou réutilisé, si `ENCRYPTION_KEY` est invalide, si `WEB_URL`/`API_URL` ne sont pas en HTTPS (ou pointent vers localhost), si `CORS_ORIGINS` ou le mot de passe MySQL manquent. Le seed refuse le mot de passe administrateur par défaut. Aucune donnée de démonstration n’est créée en production.

**Après le premier lancement (Web Admin → Paramètres)** : identité de la plateforme, Gmail SMTP (puis « Tester »), FlexPay (code marchand, jeton, puis « Tester » ; communiquer l’URL de callback à FlexPay).

**Exploitation**
- Santé : `GET /api/health` (vérifie aussi la base de données) — à brancher sur la supervision.
- Sauvegardes : automatiques chaque nuit à 02:00 (14 conservées) dans `storage/backups` ; sauvegarder aussi `storage/uploads` (photos/vidéos) et le fichier `.env` (**sans `ENCRYPTION_KEY`, la configuration SMTP/FlexPay est illisible**). Les sauvegardes JSON sont portables SQLite ↔ MySQL.
- Une seule instance de l’API (PM2 `instances: 1`) : les tâches planifiées et la limitation de débit sont en mémoire.
- `API_DOCS=true` réactive `/api/docs` si nécessaire.

**Hébergement séparé** (Web Admin sur un CDN, API sur un sous-domaine) : `SERVE_WEB=false`, compiler le web avec `VITE_API_URL=https://api.votredomaine.com/api`, et garder les deux sur le **même domaine parent** (ex. `admin.x.com` / `api.x.com`) — le cookie de session est `SameSite=Strict`.

### Application mobile (publication)

```bash
cd mobile
flutter build appbundle --release   # Google Play  (API : https://www.zwacar.space/api par défaut)
flutter build ipa       --release   # App Store
```
- L’API de production (`https://www.zwacar.space/api`) est intégrée ; `--dart-define=API_URL=…` permet de viser un autre serveur.
- Android : créer une clé de signature (`keytool`) et la déclarer dans `android/app/build.gradle.kts` (aujourd’hui : clé de débogage, refusée par Google Play) ; HTTP non chiffré autorisé seulement en debug/profile.
- iOS : équipe de développement et identifiant `com.zwacar.app` dans Xcode ; seule l’exception « réseau local » subsiste (HTTPS exigé en production).
- Versions : `version: 1.0.0+1` dans `pubspec.yaml` (incrémenter le `+N` à chaque publication).

### Paiement en ligne FlexPay (rechargement des crédits)

Seules les **entreprises** paient (achat de crédits) ; les clients de l’application mobile ne paient rien en ligne.

1. Web Admin → Paramètres → **Paiement FlexPay** : code marchand, jeton d’autorisation (chiffré, jamais renvoyé), URL publique de l’API, puis **Tester la connexion FlexPay** et activer.
2. Communiquer à FlexPay l’URL de callback affichée : `https://api.votredomaine.com/api/payments/webhook/flexpay`.
3. Moyens de paiement : « Mobile Money » (`flexpay_mobile`, proposé aux entreprises uniquement une fois FlexPay configuré) et « Demande de recharge » (`manual`). Aucun autre fournisseur n’est disponible (le fournisseur `sandbox` n’existe que pour les tests automatisés).
4. À chaque paiement Mobile Money confirmé, et à chaque nouvelle demande de recharge, les Super Administrateurs reçoivent une notification dans le Web Admin.

| Étape | Détail |
|---|---|
| Demande | `POST https://backend.flexpay.cd/api/rest/v1/paymentService` (`type: 1`, téléphone `243XXXXXXXXX`, montant, référence `PAY-…`, `callbackUrl`) |
| Confirmation | le payeur valide avec son code PIN ; l’interface vérifie le statut toutes les 4 s |
| Vérification | `GET https://backend.flexpay.cd/api/rest/v1/check/{orderNumber}` — **seule source de vérité** : un callback n’est jamais cru sur parole, le montant et la devise sont contrôlés |
| Crédit | une seule fois (verrou + clé `topup:<paiement>`), facture et reçu PDF envoyés par email |
| Filet de sécurité | tâche toutes les 2 min (callback manqué, serveur non joignable) ; non confirmé après 48 h → échec |

En local, FlexPay ne peut pas joindre `localhost` : la confirmation passe alors par la vérification automatique.

### Ajouter un fournisseur de paiement
Implémenter `initiate()` (et éventuellement `handleWebhook()`) dans `server/src/services/payment/providers.js`, l’enregistrer dans `registry`, puis créer le moyen de paiement correspondant dans le Web Admin. Le webhook est exposé sur `POST /api/payments/webhook/<provider>`.

---

## 7. Tests et qualité

```bash
cd server && npm test     # 24 tests : RBAC, isolation, publication, anti double débit concurrent, chauffeur et tarification, FlexPay, notifications,
                          # renouvellement/expiration, paiements, SMTP chiffré, PDF, sauvegarde/restauration
cd web && npm run build
cd mobile && flutter analyze && flutter test
```

---

### Logo

Le logo (un « Z » dont la barre supérieure est un véhicule) a une source unique : `server/src/assets/logo.js`. Après modification, `cd server && npm run brand` régénère le favicon et les logos du Web Admin, le logo des emails et les icônes de l’application iOS / Android. Les PDF le dessinent directement en vectoriel ; l’application Flutter utilise le même tracé (`mobile/lib/widgets/logo.dart`).

## 8. Structure

```
server/src
  config/        configuration, connexion base
  models/        modèles Sequelize et associations
  middleware/    authentification, RBAC/isolation, validation, erreurs, upload
  services/      wallet (grand livre), véhicules, paiements, emails, PDF, médias, stats, sauvegardes
  modules/       routes REST par domaine
  jobs/          tâches planifiées
  scripts/       sync, seed, exécution manuelle des tâches
  docs/          spécification OpenAPI (servie sur /api/docs)
web/src
  api/ context/ hooks/ components/ pages/{auth,admin,company,shared}
mobile/lib
  config.dart theme.dart models.dart services/ widgets/ screens/
```
SSH_KEY=~/.ssh/id_ed25519_zwacar ./deploy/deploy.sh