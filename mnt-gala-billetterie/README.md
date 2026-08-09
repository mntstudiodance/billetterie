# Billetterie — Gala MNT Studio Dance

Application web pour le choix des places sur plan pour le gala des 5 et 6 juin 2027
au Théâtre de Sénart (Lieusaint). Les places sont achetées sur Assoconnect ; ce site
sert uniquement à choisir son siège précis à partir du numéro de transaction, puis à
émettre le billet PDF (avec QR code).

## Comment ça marche

Il y a **deux représentations indépendantes** : samedi 5 juin et dimanche 6 juin 2027.
Chacune a son propre plan de salle, ses propres places, et ses propres transactions.

1. **Toi (admin)** choisis une date dans l'onglet *Plan de salle*, configures les
   catégories (ex : Balcon Gauche Haut, Orchestre Centre Bas…), leurs rangées et
   leur nombre de sièges, puis cliques sur *Générer les places manquantes* pour créer
   chaque siège dans la base. Le bouton *Copier le plan de l'autre date* permet de ne
   dessiner la salle qu'une fois. Tu peux à tout moment retirer un siège précis d'une
   rangée (ex : pour une place PMR) via le champ "Sièges à retirer" (numéros séparés
   par des virgules).

   Deux fichiers `plan-samedi.json` et `plan-dimanche.json` sont fournis à la racine
   du projet : ils reconstituent la structure du vrai plan du Théâtre de Sénart
   (les 6 blocs, les lettres de rangées Q à Y en haut et A à P en bas). Utilise le
   bouton *Importer un plan (.json)* dans l'onglet Plan de salle pour les charger
   directement, un par date. **Les effectifs de sièges par rangée sont des
   estimations** — je n'ai pas pu compter chaque siège individuellement avec une
   précision totale sur l'image (grille très dense). Vérifie et ajuste les nombres
   directement dans le tableau de chaque rangée avant de cliquer sur *Générer les
   places* — c'est rapide, un chiffre à corriger par rangée si besoin.
2. Après chaque vente sur Assoconnect, tu ajoutes une **transaction** dans l'onglet
   *Transactions* (en sélectionnant la bonne date en haut) : le numéro de transaction,
   la catégorie achetée, le nombre de places. Tu envoies ensuite au client le lien
   `https://<ton-site>.netlify.app/samedi/r/<numéro-de-transaction>` ou
   `.../dimanche/r/<numéro-de-transaction>` selon la date achetée.
3. **Le client** arrive sur la page d'accueil, choisit sa date (deux boutons), saisit
   son numéro de transaction (ou arrive directement dessus via le lien), voit le plan
   de la salle de cette date, choisit ses places disponibles dans sa catégorie, valide,
   et télécharge son billet PDF (un par place, avec QR code).
4. Une fois choisies, les places passent immédiatement à "prises" pour tout le monde
   (mise à jour en temps réel), donc deux personnes ne peuvent jamais choisir la même
   place — la validation se fait dans une transaction Firestore qui vérifie la
   disponibilité au dernier moment.

## Mise en route

### 1. Firebase

Tu peux réutiliser le **même projet Firebase** que l'application de gestion du studio,
ou en créer un nouveau dédié au gala (recommandé pour garder les deux projets bien
séparés).

1. Dans la [console Firebase](https://console.firebase.google.com), active **Firestore
   Database** et **Authentication** (méthode "Email/Password").
2. Crée un compte admin dans Authentication > Users (c'est cet email/mot de passe qui
   servira à se connecter sur `/admin`).
3. Copie `.env.example` vers `.env` et remplis les valeurs depuis Paramètres du projet
   > Vos applications > Config SDK.
4. Déploie les règles de sécurité fournies dans `firestore.rules` (Firestore >
   Règles, ou `firebase deploy --only firestore:rules` si tu utilises la CLI).

> ⚠️ Les règles fournies sont un bon compromis pour un évènement ponctuel, mais elles
> autorisent certaines écritures publiques encadrées (passer un siège de "disponible"
> à "vendu"). Pour un usage à plus grande échelle ou plus sensible, l'idéal serait de
> déplacer la validation de réservation dans une Cloud Function. Teste les règles dans
> l'onglet "Règles > Playground" de la console Firebase avant l'ouverture de la
> billetterie.

### 2. Installation locale

```bash
npm install
npm run dev
```

### 3. Déploiement sur Netlify

Comme pour l'appli de gestion du studio :

1. Pousse ce dossier sur un repo Git (GitHub/GitLab).
2. Sur Netlify : *Add new site > Import an existing project*.
3. Renseigne le **répertoire racine** si besoin (root directory), commande de build
   `npm run build`, dossier de publication `dist` (déjà défini dans `netlify.toml`).
4. Ajoute les variables d'environnement `VITE_FIREBASE_*` dans Netlify (Site settings >
   Environment variables) avec les mêmes valeurs que ton `.env`.
5. Déploie. Le site sera accessible sur `https://<nom>.netlify.app`, avec
   l'administration sur `/admin`.

## Modèle de données Firestore

- **`venueConfig/samedi`** et **`venueConfig/dimanche`** — un document par date :
  nom de l'évènement, lieu, et la liste des catégories (`sections`), chacune avec ses
  rangées (`rows`, avec un éventuel tableau `removed` listant les numéros de sièges
  retirés) et son nombre de sièges.
- **`seats/{sectionId}-{rangée}{numéro}`** — un document par siège :
  `{ eventId, sectionId, sectionName, row, number, status: "available"|"sold", transactionId }`.
- **`bookings/{eventId}__{numéroDeTransaction}`** — une réservation par vente
  Assoconnect : `{ eventId, transactionNumber, category, seatCount, status: "pending"|"completed", seatIds: [], createdAt, completedAt }`.

> ⚠️ Les pages qui filtrent les transactions par date (`where eventId == ...` +
> tri par date de création) demanderont à Firestore de créer un **index composite**
> la première fois qu'elles tournent. Si tu vois une erreur "The query requires an
> index" dans la console du navigateur, clique simplement sur le lien fourni dans
> l'erreur : Firestore le crée en un clic (ça prend 1 à 2 minutes).

## Pistes d'amélioration futures

- Une application de **scan des QR codes** à l'entrée du théâtre (à faire séparément,
  ou en ajoutant une page `/admin/scan` avec une lib comme `html5-qrcode`) pour valider
  les billets le jour J.
- Envoi automatique du lien de billetterie par email dès l'ajout d'une transaction
  (en réutilisant le mécanisme FormSubmit déjà en place sur l'appli studio).
- Déplacer la logique de validation de réservation dans une Cloud Function pour une
  sécurité renforcée si le volume de billets devient important.
