# Billetterie — Gala MNT Studio Dance

Application web pour le choix des places sur plan pour le gala des 5 et 6 juin 2027
au Théâtre de Sénart (Lieusaint). Les places sont achetées sur Assoconnect ; ce site
sert uniquement à choisir son siège précis à partir du numéro de transaction, puis à
émettre le billet PDF (avec QR code).

## Comment ça marche

Il y a **deux représentations indépendantes** : samedi 5 juin et dimanche 6 juin 2027.
Chacune a son propre plan de salle, ses propres places, et ses propres transactions.

1. **Toi (admin)** choisis une date dans l'onglet *Plan de salle*, configures les
   catégories (ex : Balcon Gauche Haut, Orchestre Centre Bas…), puis pour chaque
   rangée, tu saisis **toi-même la liste exacte des numéros de sièges, dans l'ordre
   gauche → droite** (ex : `12,10,8,6,4,2,1,3,5,7,9,11` pour une rangée qui part du
   centre avec les pairs à gauche et les impairs à droite). Deux boutons t'aident à
   remplir rapidement : *Suite 1,2,3…* (numérotation classique) et *Pair/impair
   depuis le centre* (te demande combien de sièges de chaque côté et génère la
   liste). Tu peux ensuite retoucher n'importe quel numéro à la main, ou simplement
   ne pas inclure un numéro dans la liste pour retirer ce siège (ex : place PMR).
   Une fois les rangées prêtes, clique sur *Générer les places manquantes* pour
   créer chaque siège dans la base. Le bouton *Copier le plan de l'autre date*
   permet de ne dessiner la salle qu'une fois.

   Deux fichiers `plan-samedi.json` et `plan-dimanche.json` sont fournis à la racine
   du projet, reconstitués à partir de la fiche technique officielle du Théâtre de
   Sénart (plan de masse) :
   - 3 blocs de balcon (Gauche/Centre/Droit, rangées Q à Y), avec une numérotation
     d'exemple partant du centre (pairs/impairs) — **à vérifier/corriger**.
   - 4 paliers d'orchestre empilés du plus proche de la scène au fond de salle
     (Rangs avant : A-D, Corbeille avant : E-J, Corbeille arrière : K-N, Fond de
     salle : O-W), séparés par les allées de circulation visibles sur le plan
     technique. **Les rangées sont définies mais volontairement vides de numéros**
     — à toi de les saisir toi-même rangée par rangée (voir les boutons *Suite
     1,2,3…* et *Pair/impair depuis le centre* pour aller plus vite).

   Utilise le bouton *Importer un plan (.json)* dans l'onglet Plan de salle pour les
   charger directement, un par date. Les noms, couleurs et prix de chaque palier sont
   des exemples : adapte-les à ta grille tarifaire réelle.
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
5. Si tu dois corriger une erreur, l'onglet **Transactions** propose deux actions
   sur chaque ligne :
   - **Réinitialiser** (transactions avec billets déjà émis) : libère les places
     attribuées et repasse la transaction en attente — la personne peut alors
     resélectionner ses places depuis le même lien, comme si elle n'avait rien
     choisi.
   - **Supprimer** : supprime la transaction. Si des billets avaient déjà été émis,
     les places associées sont automatiquement libérées avant la suppression.
6. L'onglet **Bloquer des places** te permet de réserver manuellement des sièges
   en dehors du circuit de vente (invitations, presse, techniciens…) : clique sur
   une place disponible du plan pour la bloquer (avec une note optionnelle), elle
   n'apparaîtra alors plus disponible pour les spectateurs. Reclique dessus pour
   la débloquer.

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

### 2. Envoi des billets par email (optionnel)

Sur la page de confirmation, le client peut saisir son email pour recevoir aussi ses
billets par ce biais, en plus du téléchargement direct. Ça passe par
[EmailJS](https://www.emailjs.com/), qui permet d'envoyer un email directement depuis
le navigateur, sans serveur ni backend à héberger.

1. Crée un compte gratuit sur [emailjs.com](https://www.emailjs.com/).
2. **Add an email service** : connecte ta boîte mail (Gmail, Outlook…) — c'est elle
   qui apparaîtra comme expéditeur.
3. **Email Templates > Create new template**. Dans l'éditeur, ajoute les variables
   dont on a besoin, par exemple :
   ```
   Bonjour,

   Voici vos billets pour {{event_name}} ({{event_dates}}) au {{venue_name}}.
   Places : {{seats_summary}}
   Numéro de transaction : {{transaction_id}}

   À bientôt !
   ```
   Champ "To email" du template : `{{to_email}}`.
4. Toujours dans l'éditeur du template, onglet **Attachments** : ajoute une pièce
   jointe de type **Variable Attachment**, avec comme nom de paramètre
   `pdf_attachment` (c'est exactement le nom que le code envoie), un nom de fichier
   du type `billets-gala-mnt.pdf`, et le type de contenu `PDF`.
5. Récupère les 3 identifiants dont l'app a besoin :
   - **Service ID** (page du service ajouté à l'étape 2)
   - **Template ID** (page du template créé à l'étape 3)
   - **Public Key** (clique sur ton nom en haut à droite du tableau de bord EmailJS)
6. Renseigne-les dans `.env` (`VITE_EMAILJS_SERVICE_ID`, `VITE_EMAILJS_TEMPLATE_ID`,
   `VITE_EMAILJS_PUBLIC_KEY`) et dans les variables d'environnement Netlify.

Si ces 3 variables ne sont pas renseignées, le champ email n'apparaît tout simplement
pas sur la page de confirmation — le téléchargement direct du PDF continue de
fonctionner normalement, avec ou sans cette config.

> ⚠️ **Limite de taille importante** : le plan gratuit d'EmailJS limite les pièces
> jointes dynamiques à **50 Ko**, ce qui est probablement trop juste pour ce PDF (les
> logos et QR codes embarqués font déjà plus que ça à eux seuls, avant même de compter
> les pages supplémentaires si plusieurs places sont achetées). Il te faudra très
> probablement au moins le plan payant **Personal** d'EmailJS (limite à 500 Ko) pour
> que l'envoi fonctionne de façon fiable, surtout pour les transactions à plusieurs
> places. Fais un test avec une vraie transaction avant l'ouverture de la billetterie.

### 3. Installation locale

```bash
npm install
npm run dev
```

### 4. Déploiement sur Netlify

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
- **`seats/{eventId}__{sectionId}-{rangée}{numéro}`** — un document par siège,
  préfixé par la date pour qu'un même nom de bloc sur les deux jours ne crée jamais
  de collision : `{ eventId, sectionId, sectionName, row, number, status: "available"|"sold"|"blocked", transactionId, checkedIn, checkedInAt, blockedNote }`.
- **`bookings/{eventId}__{numéroDeTransaction}`** — une réservation par vente
  Assoconnect : `{ eventId, transactionNumber, category, seatCount, status: "pending"|"completed", seatIds: [], createdAt, completedAt }`.

> ⚠️ Si tu avais déjà généré des places avant cette mise à jour, leurs identifiants
> ont changé (ils incluent maintenant la date). Supprime la collection `seats`
> existante dans la console Firebase et régénère-la depuis l'admin pour repartir
> sur une base propre.

## Contrôle des billets le soir du gala

Une page dédiée, **sans connexion admin**, pour scanner les billets à l'entrée :

```
https://<ton-site>.netlify.app/controle
```

Ouvre cette URL sur le téléphone ou la tablette de la personne au contrôle d'accès.
Elle demande l'autorisation d'utiliser la caméra, scanne le QR code de chaque billet,
et affiche :
- **en vert** : billet valide, la place vient d'être marquée comme contrôlée ;
- **en rouge** : billet déjà scanné (avec l'heure du premier passage), billet
  introuvable, ou billet invalide.

Si la caméra ne fonctionne pas (pas d'autorisation, pas de connexion réseau pour
charger la page une première fois), un champ de saisie manuelle permet de recopier
la **référence affichée sous le QR code** de chaque billet.

## Pistes d'amélioration futures

- Envoi automatique du lien de billetterie par email dès l'ajout d'une transaction
  (en réutilisant le mécanisme FormSubmit déjà en place sur l'appli studio).
- Déplacer la logique de validation de réservation dans une Cloud Function pour une
  sécurité renforcée si le volume de billets devient important.
- Un tableau de bord "entrées en direct" (nombre de billets déjà scannés vs total)
  dans l'admin, en s'appuyant sur le champ `checkedIn` déjà présent sur chaque siège.

## Plan de salle Canvas (v2)

`src/components/SeatPlan.jsx` dessine maintenant le plan en Canvas (zoom au pincement/molette, déplacement, minimap, fiche du siège en bas d'écran). Il lit toujours la configuration de l'admin (blocs, position gridColumn/gridRow, rangées, numérotation manuelle) — rien à ressaisir. Les dimensions (espacement, courbure) se règlent en tête de `src/utils/venueLayout.js`.

Nouvelle dépendance : `framer-motion` (→ `npm install`).
