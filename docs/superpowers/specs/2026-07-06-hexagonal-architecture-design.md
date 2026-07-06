# Spécification de Conception : Article sur l'Architecture Hexagonale (Français & Anglais)

Ce document définit la structure, le contenu et les exemples de code pour l'article de blog sur l'architecture hexagonale à intégrer sur le site.

## 1. Métadonnées des Fichiers

### Version Française
- **Chemin** : `pages/posts/hexagonal-architecture-fr.md`
- **Titre** : "Maîtriser l'Architecture Hexagonale : Du Spaghetti au Code Propre en PHP"
- **Date** : 2026-07-06
- **Langue** : `fr`
- **Durée** : ~15min
- **Description** : Un guide complet et progressif pour comprendre, implémenter et maîtriser l'architecture hexagonale en PHP à travers un cas pratique de réfactoring.

### Version Anglaise
- **Chemin** : `pages/posts/hexagonal-architecture.md`
- **Titre** : "Mastering Hexagonal Architecture: From Spaghetti to Clean Code in PHP"
- **Date** : 2026-07-06
- **Langue** : `en`
- **Durée** : ~15min
- **Description** : A comprehensive, progressive guide to understanding, implementing, and mastering hexagonal architecture in PHP through a practical refactoring example.

---

## 2. Structure Détaillée de l'Article

### Section 1 : L'Enfer du Code Couplé (Legacy Pain)
- **Objectif** : Montrer le problème réel résolu par l'architecture hexagonale.
- **Contenu** :
  - Analyse d'un contrôleur typique de framework (ex. Symfony/Laravel) réalisant l'inscription d'un utilisateur.
  - Identification des couplages forts : base de données (ORM/Active Record), service de mail tiers (SDK ou service couplé), validation HTTP imbriquée.
  - Explication des limites majeures : tests unitaires impossibles sans DB/SMTP, impossibilité de réutiliser la logique métier dans une commande CLI sans duplication.

### Section 2 : La Théorie sans Jargon (Ports & Adapters)
- **Objectif** : Rendre le concept intuitif en revenant à son origine.
- **Contenu** :
  - Définition d'Alistair Cockburn (1995/2005) : "Permettre à une application d'être également pilotée par des utilisateurs, des programmes, des tests automatisés, et d'être développée et testée de manière isolée de ses dispositifs d'exécution et bases de données éventuels."
  - **Le Cœur (Domaine)** : Le modèle métier et ses invariants.
  - **L'Application (Use Cases)** : L'orchestration des flux métier.
  - **Les Ports (Interfaces)** :
    - *Driving Ports* (Entrée / Primaire) : Ce que l'application expose au monde extérieur (ex. cas d'usage).
    - *Driven Ports* (Sortie / Secondaire) : Ce dont l'application a besoin pour fonctionner (ex. Repository, Mailer).
  - **Les Adaptateurs (Implémentations)** :
    - *Driving Adapters* (Contrôleur HTTP, Commande Console).
    - *Driven Adapters* (Dépôt SQL, Service d'envoi Mailchimp/Sendgrid).
  - Le concept clé : **L'Inversion de Dépendance** (Dependency Inversion Principle - DIP).

### Section 3 : Le Réfactoring PHP Étape par Étape
- **Objectif** : Fournir du code PHP 8.2+ moderne, typé, et robuste.
- **Contenu du code** :
  - **Le Domaine** :
    - `Domain/Entity/User.php` : Classe pure PHP contenant les données de l'utilisateur et validant les invariants (ex. format d'email valide, mot de passe robuste, génération d'ID).
    - `Domain/Exception/InvalidEmailException.php` & `Domain/Exception/WeakPasswordException.php` : Exceptions de domaine pour typier les erreurs métier.
  - **Les Ports (Interfaces)** :
    - `Domain/Repository/UserRepositoryInterface.php` (Driven Port).
    - `Domain/Gateway/MailerInterface.php` (Driven Port).
  - **La Couche Application (Cas d'Usage)** :
    - `Application/UseCase/RegisterUser.php` : Orchestre la création, vérifie l'unicité de l'email via le repository port, sauvegarde l'utilisateur et envoie le mail de bienvenue via le mailer port.
    - `Application/DTO/RegisterUserRequest.php` & `Application/DTO/RegisterUserResponse.php` : Objets de transfert de données pour découpler les contrôleurs de la couche interne.
  - **Les Adaptateurs de Sortie (Infrastructures)** :
    - `Infrastructure/Adapter/Persistence/SqlUserRepository.php` : Implémentation SQL (PDO/Doctrine).
    - `Infrastructure/Adapter/Mailer/SmtpMailer.php` : Implémentation réelle d'envoi de mail.
  - **Les Adaptateurs d'Entrée (Points d'entrée)** :
    - `Infrastructure/Adapter/Http/RegisterUserController.php` : Reçoit la requête HTTP, extrait les données, appelle le Use Case et renvoie du JSON.
    - `Infrastructure/Adapter/Cli/RegisterUserCommand.php` : Commande de console interactive appelant le même Use Case.

### Section 4 : Mise en Pratique : Arborescence et Câblage (Prise en Main)
- **Objectif** : Montrer comment organiser concrètement les fichiers dans un projet.
- **Contenu** :
  - Arborescence recommandée :
    ```text
    src/
    ├── Domain/
    │   ├── Entity/
    │   ├── Exception/
    │   ├── Repository/ (Ports)
    │   └── Gateway/ (Ports)
    ├── Application/
    │   ├── UseCase/
    │   └── DTO/
    └── Infrastructure/
        ├── Adapter/
        │   ├── Http/ (Driving Adapters)
        │   ├── Cli/ (Driving Adapters)
        │   ├── Persistence/ (Driven Adapters)
        │   └── Mailer/ (Driven Adapters)
        └── Share/
    ```
  - Câblage des dépendances dans un framework (ex: Symfony `services.yaml` ou Laravel Service Provider) en utilisant l'injection de dépendances automatique (autowiring).

### Section 5 : Maîtriser l'Architecture Hexagonale (Concepts Avancés)
- **Objectif** : Donner les clés pour passer d'une simple compréhension théorique à une maîtrise industrielle.
- **Contenu** :
  - **Tests Unitaires Ultra-rapides** : Implémenter un `Infrastructure/Adapter/Persistence/InMemoryUserRepository.php` pour tester le Use Case sans mocking complexe. Écrire le test unitaire montrant la rapidité et la clarté.
  - **Isolation stricte avec Deptrac** : Fournir une configuration `deptrac.yaml` pour interdire toute importation de `Infrastructure` dans `Domain` ou `Application` et automatiser la vérification dans la CI.
  - **Hexagone, DDD et CQRS** : Comment ils s'articulent ensemble (le domaine hexagonal est le lieu privilégié du DDD ; CQRS sépare les cas d'usage en Commandes et Requêtes).
  - **Les Pièges et Arbitrages** :
    - Quand ne pas l'utiliser (Applications simples CRUD, scripts jetables).
    - Le coût de la duplication (DTOs vs Entités, conversion de modèles).

---

## 3. Implémentation du Code PHP (Modèle de Référence)

Nous utiliserons des classes PHP typées et explicites. Les exemples de code seront complets et auto-explicatifs dans l'article.
