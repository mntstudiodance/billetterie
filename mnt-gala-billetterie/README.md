# Billetterie — Gala MNT Studio Dance

Application web pour le choix des places sur plan pour le gala des 5 et 6 juin 2027
au Théâtre de Sénart (Lieusaint). Les places sont achetées sur Assoconnect ; ce site
sert uniquement à choisir son siège précis à partir du numéro de transaction, puis à
émettre le billet PDF (avec QR code).

## Comment ça marche

1. **Toi (admin)** configures le plan de salle (catégories, rangées, nombre de sièges
   par rangée) dans l'onglet *Plan de salle*, puis cliques sur *Générer les places
   manquantes* pour créer chaque siège dans la base.
2. Après chaque vente sur Assoconnect, tu ajoutes une **transaction** dans l'onglet
   *Transactions* : le numéro de transaction, la catégorie achetée, le nombre de
   places. Tu envoies ensuite au client le lien
   `https://<ton-site>.netlify.app/r/<numéro-de-transaction>`.
3. **Le client** ouvre le lien (ou saisit son numéro sur la page d'accueil), voit le
   plan de la salle, choisit ses places disponibles dans sa catégorie, valide, et
   télécharge son billet PDF (un par place, avec QR code).
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

- **`venueConfig/main`** — un seul document : nom de l'évènement, dates, lieu, et la
  liste des catégories (`sections`), chacune avec ses rangées et son nombre de sièges.
- **`seats/{sectionId}-{rangée}{numéro}`** — un document par siège :
  `{ sectionId, sectionName, row, number, status: "available"|"sold", transactionId }`.
- **`bookings/{numéroDeTransaction}`** — une réservation par vente Assoconnect :
  `{ category, seatCount, status: "pending"|"completed", seatIds: [], createdAt, completedAt }`.

## Pistes d'amélioration futures

- Une application de **scan des QR codes** à l'entrée du théâtre (à faire séparément,
  ou en ajoutant une page `/admin/scan` avec une lib comme `html5-qrcode`) pour valider
  les billets le jour J.
- Envoi automatique du lien de billetterie par email dès l'ajout d'une transaction
  (en réutilisant le mécanisme FormSubmit déjà en place sur l'appli studio).
- Déplacer la logique de validation de réservation dans une Cloud Function pour une
  sécurité renforcée si le volume de billets devient important.
