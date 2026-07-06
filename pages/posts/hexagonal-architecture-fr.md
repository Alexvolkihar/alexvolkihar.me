---
title: "Maîtriser l'Architecture Hexagonale : Du Spaghetti au Code Propre en PHP"
date: 2026-07-06T00:00:00Z
lang: fr
duration: 15min
description: Un guide complet et progressif pour comprendre, implémenter et maîtriser l'architecture hexagonale en PHP à travers un cas pratique de réfactoring.
---

> [English Version](/posts/hexagonal-architecture)

L'architecture logicielle est souvent reléguée au second plan lors des phases initiales d'un projet. On privilégie la vitesse de livraison, l'utilisation de frameworks tout-en-un, et le développement rapide de fonctionnalités. Cependant, à mesure que l'application grandit, les coûts de maintenance s'envolent, les régressions se multiplient, et le code métier se retrouve inextricablement couplé aux détails techniques comme la base de données, les bibliothèques tierces, ou le framework lui-même.

C'est ici qu'intervient **l'Architecture Hexagonale** (également connue sous le nom de *Ports & Adapters*). Théorisée par Alistair Cockburn en 2005, elle propose de structurer l'application de manière à isoler la logique métier des détails d'infrastructure.

Dans cet article, nous allons comprendre pourquoi l'architecture traditionnelle pose problème, explorer en détail les concepts de l'architecture hexagonale, et voir comment elle résout les limites des approches couplées classiques.

---

## 1. Le Constat de départ – Le Code Couplé (Legacy Pain)

Pour comprendre l'intérêt de l'architecture hexagonale, analysons un exemple typique de code hérité ("legacy"). Imaginons un contrôleur PHP classique gérant l'inscription d'un utilisateur au sein d'une application web.

Voici le genre de code que l'on retrouve fréquemment dans de nombreux projets :

```php
<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

class RegistrationController extends Controller
{
    public function register(Request $request)
    {
        // 1. Validation HTTP directe
        $request->validate([
            'username' => 'required|string|max:255|unique:users',
            'email' => 'required|email|max:255|unique:users',
            'password' => 'required|string|min:8',
        ]);

        // 2. Logique métier + Persistance (Eloquent ORM couplé)
        $user = new User();
        $user->username = $request->input('username');
        $user->email = $request->input('email');
        $user->password = password_hash($request->input('password'), PASSWORD_BCRYPT);
        $user->save(); // Couplage direct à la base de données MySQL via Active Record

        // 3. Notification par Email (Envoi direct via SMTP avec PHPMailer)
        $mail = new PHPMailer(true);
        try {
            // Configuration SMTP hardcodée ou via variables d'environnement directes
            $mail->isSMTP();
            $mail->Host       = env('MAIL_HOST', 'smtp.mailtrap.io');
            $mail->SMTPAuth   = true;
            $mail->Username   = env('MAIL_USERNAME');
            $mail->Password   = env('MAIL_PASSWORD');
            $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
            $mail->Port       = env('MAIL_PORT', 587);

            $mail->setFrom('no-reply@notre-application.com', 'Mon App');
            $mail->addAddress($user->email, $user->username);

            $mail->isHTML(true);
            $mail->Subject = 'Bienvenue sur notre application !';
            $mail->Body    = "<h1>Bonjour {$user->username} !</h1><p>Merci de vous être inscrit.</p>";

            $mail->send();
        } catch (Exception $e) {
            // En cas d'erreur d'envoi d'email, la réponse HTTP est compromise
            return response()->json(['error' => "Impossible d'envoyer l'email : {$mail->ErrorInfo}"], 500);
        }

        // 4. Réponse HTTP
        return response()->json([
            'message' => 'Utilisateur créé avec succès !',
            'user' => [
                'id' => $user->id,
                'username' => $user->username,
                'email' => $user->email,
            ]
        ], 201);
    }
}
```

### Pourquoi ce code est fragile et problématique ?

À première vue, ce contrôleur fonctionne parfaitement. Il remplit son rôle : il valide les entrées, enregistre en base de données, envoie un email de bienvenue et renvoie une réponse JSON. 

Pourtant, d'un point de vue architectural, c'est une bombe à retardement. Voici pourquoi :

#### 1. Violation flagrante des principes SOLID
- **SRP (Single Responsibility Principle)** : La classe `RegistrationController` a beaucoup trop de responsabilités. Elle s'occupe de la sérialisation/désérialisation HTTP, de la validation des données d'entrée, de l'implémentation de la logique métier (le hachage du mot de passe), de l'accès à la base de données (Eloquent `save()`), de l'envoi de courriels (configuration SMTP et PHPMailer), et du formatage de la réponse. Si l'une de ces étapes change, nous devons modifier ce contrôleur.
- **OCP (Open/Closed Principle)** : Si demain nous souhaitons passer de PHPMailer (SMTP) à un service d'API tiers comme Mailgun, Brevo ou AWS SES, nous devons ouvrir cette classe et modifier son code interne. Il en va de même si nous souhaitons modifier le type de stockage (par exemple, appeler un microservice de gestion des identités).
- **DIP (Dependency Inversion Principle)** : La logique de haut niveau (l'inscription d'un utilisateur) dépend directement de détails de bas niveau : l'ORM Eloquent pour MySQL et la bibliothèque PHPMailer pour le transport SMTP. Le code métier est l'esclave des technologies choisies.

#### 2. Un code impossible à tester unitairement (Untestable Code)
Pour tester la logique de création d'un utilisateur, vous êtes obligé de configurer et d'exécuter :
- Une véritable base de données (ou utiliser des mocks complexes de Laravel qui interceptent les requêtes Eloquent).
- Un serveur SMTP réel ou un outil comme Mailtrap pour intercepter l'envoi d'email de PHPMailer, ou encore mocker de manière agressive les objets globaux de PHPMailer.

Il est impossible de tester uniquement la logique métier en isolation dans un test unitaire pur qui s'exécute en quelques millisecondes. Les tests deviennent lents, fragiles et complexes à écrire.

#### 3. Dépendance totale au Framework (Vendor Lock-in)
Le code métier est intimement lié à Laravel (classes `Request`, `Response`, ORM Eloquent, helpers comme `env()`). Si vous décidez demain de migrer votre projet vers Symfony ou de déplacer cette logique spécifique dans un CLI ou un script asynchrone, vous devrez réécrire la quasi-totalité du code car la logique métier est soudée au framework.

---

## 2. Qu'est-ce que l'Architecture Hexagonale ? (Ports & Adapters)

L'objectif de l'Architecture Hexagonale est simple : **isoler le code métier** de toutes ces contraintes externes. L'application doit être considérée comme un système fermé et autonome, le "Cœur Applicatif", qui communique avec l'extérieur uniquement via des contrats bien définis.

### Les 4 Piliers de l'Hexagone

Dans cette architecture, nous divisons notre projet en plusieurs couches distinctes, structurées autour du Domaine et de l'Application :

```mermaid
graph TD
    %% Styling
    classDef domain fill:#efa9f9,stroke:#333,stroke-width:2px;
    classDef application fill:#a9cbf9,stroke:#333,stroke-width:2px;
    classDef adapter fill:#a9f9bf,stroke:#333,stroke-width:2px;
    classDef port fill:#f9efa9,stroke:#333,stroke-dasharray: 5 5,stroke-width:2px;

    subgraph Hexagon ["Cœur Applicatif (Hexagone)"]
        subgraph DomainLayer ["Couche Domaine"]
            DomainModel["Entités & Logique Métier"]
        end
        subgraph AppLayer ["Couche Application"]
            UseCase["Cas d'Utilisation (Use Cases)"]
            InPort["Ports Entrants (Inbound Ports)"]
            OutPort["Ports Sortants (Outbound Ports)"]
        end
    end

    subgraph Infrastructure ["Infrastructure (Détails Techniques)"]
        HTTPController["Adaptateur Entrant (Contrôleur HTTP)"]
        ConsoleCLI["Adaptateur Entrant (Commande CLI)"]
        Database["Adaptateur Sortant (Doctrine / Eloquent Repository)"]
        EmailService["Adaptateur Sortant (SMTP / Brevo Mailer)"]
    end

    %% Flux d'exécution et dépendances
    HTTPController -->|Appelle| InPort
    ConsoleCLI -->|Appelle| InPort
    UseCase -.->|Implémente| InPort
    UseCase -->|Manipule| DomainModel
    UseCase -->|Appelle| OutPort
    Database -.->|Implémente| OutPort
    EmailService -.->|Implémente| OutPort

    class DomainModel domain;
    class UseCase application;
    class InPort,OutPort port;
    class HTTPController,ConsoleCLI,Database,EmailService adapter;
```

#### 1. Le Domaine (Domain)
C'est le cœur de l'hexagone. Il contient les **Entités**, les **Value Objects** et les **Domain Services**.
- Il définit la logique métier pure (par exemple : un utilisateur doit avoir un email valide, son mot de passe doit respecter certains critères, etc.).
- Il n'a **aucune dépendance externe**. Il ne connaît ni le framework, ni la base de données, ni PHPMailer, ni même le protocole HTTP. C'est du code PHP natif pur (Plain Old PHP Objects - POPO).

#### 2. L'Application (Cas d'Utilisation / Use Cases)
Cette couche orchestre le flux de contrôle. Elle contient les **Use Cases** (ou services d'application).
- Un Use Case représente une action utilisateur ou système (par exemple : `RegisterUser`).
- Il récupère les requêtes du monde extérieur, coordonne les entités du Domaine, et utilise des interfaces abstraites (les Ports) pour interagir avec l'extérieur (sauvegarder en base de données, envoyer un email).

#### 3. Les Ports
Les Ports sont les frontières de notre hexagone. Ce sont des **interfaces** (au sens PHP `interface`) qui définissent comment le cœur applicatif interagit avec le monde extérieur. On distingue deux types de ports :
- **Les Ports Entrants (Inbound / Driving Ports)** : Ils définissent comment l'extérieur peut déclencher une action dans le cœur. C'est le point d'entrée de notre hexagone. (Exemple : Une interface `RegisterUserInterface`).
- **Les Ports Sortants (Outbound / Driven Ports)** : Ils définissent ce dont le cœur applicatif a besoin pour accomplir sa tâche, sans spécifier comment cela sera fait. (Exemple : `UserRepositoryInterface` pour stocker l'utilisateur, `MailerInterface` pour envoyer le mail).

#### 4. Les Adaptateurs (Adapters)
Les Adaptateurs se situent en dehors de l'hexagone (dans la couche Infrastructure). Ils représentent l'implémentation concrète de nos interactions avec le monde extérieur. Ils traduisent les technologies techniques en appels compréhensibles par les ports, et vice versa :
- **Les Adaptateurs Entrants (Driving Adapters)** : Ils prennent un stimulus du monde extérieur et le convertissent en un appel à un Port Entrant. Exemples : Un contrôleur HTTP Laravel, une commande de console CLI Symfony, un consommateur de messages RabbitMQ.
- **Les Adaptateurs Sortants (Driven Adapters)** : Ils implémentent les interfaces des Ports Sortants pour réaliser l'action technique. Exemples : `EloquentUserRepository` (qui implémente `UserRepositoryInterface`), `BrevoMailer` (qui implémente `MailerInterface`), ou encore `InMemoryUserRepository` (utilisé spécifiquement pour les tests unitaires).

---

### Le Secret : Le Principe d'Inversion de Dépendance (DIP)

Le point de bascule fondamental pour comprendre l'architecture hexagonale réside dans l'utilisation du **Principe d'Inversion de Dépendance**. 

Dans une architecture traditionnelle en couches, la couche supérieure dépend de la couche inférieure :
`Contrôleur -> Service -> Base de Données (ORM)`

Ici, la couche Infrastructure dépend des interfaces (les Ports) définies à l'intérieur du Cœur Applicatif. Ainsi, **le flux d'exécution et la direction des dépendances sont découplés** :
- **À l'exécution (Runtime)** : Le contrôleur HTTP appelle l'application (Use Case), qui à son tour appelle l'adaptateur de base de données. Le flux va de gauche à droite.
- **À la compilation (Compile-time / Code)** : L'adaptateur de base de données (dans l'Infrastructure) dépend de l'interface `UserRepositoryInterface` (définie dans l'Application). La dépendance pointe vers l'intérieur.

> [!IMPORTANT]
> C'est l'inversion de dépendance qui garantit la protection du métier. Le Domaine et l'Application définissent les contrats dont ils ont besoin. L'Infrastructure s'y plie en les implémentant. C'est l'extérieur qui dépend de l'intérieur, jamais l'inverse.

Dans cet article, nous allons mettre en pratique ces concepts en refactorisant notre contrôleur spaghetti en une architecture propre, modulaire et 100% testable.

---

## 3. La Pratique : Le Cœur Applicatif (Domaine & Ports)

Pour cette refactorisation, nous allons structurer notre projet de manière à séparer clairement chaque couche de notre hexagone. Commençons par le cœur : le Domaine et ses frontières (les Ports).

### Le Domaine : Isolation absolue de la logique métier

Le Domaine est le centre névralgique de notre application. Il ne contient que du code PHP natif pur (Plain Old PHP Objects), libre de toute dépendance vis-à-vis d'un framework ou d'une base de données. Il garantit que les règles et invariants métier sont toujours respectés.

#### 1. Les Exceptions Métier (Invariants)

Nous commençons par définir des exceptions spécifiques qui modélisent des erreurs fonctionnelles liées aux règles métier.

```php
<?php

namespace App\Domain\Exception;

class InvalidEmailException extends \DomainException
{
    public function __construct(string $email)
    {
        parent::__construct(sprintf('L\'adresse email "%s" n\'est pas valide.', $email));
    }
}
```

```php
<?php

namespace App\Domain\Exception;

class WeakPasswordException extends \DomainException
{
    public function __construct()
    {
        parent::__construct('Le mot de passe est trop faible. Il doit contenir au moins 8 caractères.');
    }
}
```

#### 2. L'Entité Métier `User`

Cette entité encapsule les invariants de notre concept d'utilisateur : validation de la validité de l'email, de la force du mot de passe, et le hachage sécurisé du mot de passe.

```php
<?php

namespace App\Domain\Entity;

use App\Domain\Exception\InvalidEmailException;
use App\Domain\Exception\WeakPasswordException;

class User
{
    private string $id;
    private string $username;
    private string $email;
    private string $passwordHash;

    public function __construct(
        string $id,
        string $username,
        string $email,
        string $plainPassword
    ) {
        $this->id = $id;

        if (empty(trim($username))) {
            throw new \DomainException("Le nom d'utilisateur ne peut pas être vide.");
        }
        $this->username = $username;

        $this->setEmail($email);
        $this->setPassword($plainPassword);
    }

    public function getId(): string
    {
        return $this->id;
    }

    public function getUsername(): string
    {
        return $this->username;
    }

    public function getEmail(): string
    {
        return $this->email;
    }

    public function getPasswordHash(): string
    {
        return $this->passwordHash;
    }

    private function setEmail(string $email): void
    {
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidEmailException($email);
        }
        $this->email = $email;
    }

    private function setPassword(string $plainPassword): void
    {
        if (strlen($plainPassword) < 8) {
            throw new WeakPasswordException();
        }
        
        // Le hachage du mot de passe est une règle de sécurité métier essentielle.
        $this->passwordHash = password_hash($plainPassword, PASSWORD_BCRYPT);
    }
}
```

---

### Les Ports : Définir les frontières

Les ports sont les contrats (interfaces) définissant comment l'Hexagone communique avec l'extérieur. Le Domaine ou les Use Cases déclarent ces besoins, sans savoir comment ils seront implémentés.

#### 1. Le Port du Dépôt : `UserRepositoryInterface` (Outbound Port)

Ce port définit les besoins de notre hexagone pour la persistance et la recherche des utilisateurs.

```php
<?php

namespace App\Domain\Repository;

use App\Domain\Entity\User;

interface UserRepositoryInterface
{
    public function save(User $user): void;
    public function findByEmail(string $email): ?User;
    public function existsByUsername(string $username): bool;
}
```

#### 2. Le Port de Notification : `MailerInterface` (Outbound Port)

Ce port définit la capacité de notifier l'utilisateur lors de son inscription.

```php
<?php

namespace App\Domain\Gateway;

use App\Domain\Entity\User;

interface MailerInterface
{
    public function sendWelcomeEmail(User $user): void;
}
```

---

## 4. La Couche Application (Cas d'Utilisation & DTOs)

La couche Application coordonne l'exécution des scénarios d'utilisation. Elle dépend uniquement du Domaine et des interfaces (les Ports).

### Les Data Transfer Objects (DTO)

Les DTOs permettent de faire circuler les données de manière structurée et immutable sans coupler l'application aux requêtes HTTP ou aux types natifs du framework.

#### 1. Le DTO de Requête : `RegisterUserRequest`

```php
<?php

namespace App\Application\DTO;

readonly class RegisterUserRequest
{
    public function __construct(
        public string $username,
        public string $email,
        public string $password
    ) {}
}
```

#### 2. Le DTO de Réponse : `RegisterUserResponse`

```php
<?php

namespace App\Application\DTO;

use App\Domain\Entity\User;

readonly class RegisterUserResponse
{
    public function __construct(
        public string $id,
        public string $username,
        public string $email
    ) {}

    public static function fromEntity(User $user): self
    {
        return new self(
            $user->getId(),
            $user->getUsername(),
            $user->getEmail()
        );
    }
}
```

### Le Service d'Application (Use Case) : `RegisterUser`

Voici la classe qui orchestre la création de l'utilisateur. Remarquez l'injection de dépendances via le constructeur des ports `UserRepositoryInterface` et `MailerInterface`.

```php
<?php

namespace App\Application\UseCase;

use App\Application\DTO\RegisterUserRequest;
use App\Application\DTO\RegisterUserResponse;
use App\Domain\Entity\User;
use App\Domain\Repository\UserRepositoryInterface;
use App\Domain\Gateway\MailerInterface;

class RegisterUser
{
    public function __construct(
        private UserRepositoryInterface $userRepository,
        private MailerInterface $mailer
    ) {}

    public function execute(RegisterUserRequest $request): RegisterUserResponse
    {
        // 1. Validation des règles d'unicité (qui nécessitent le port UserRepository)
        if ($this->userRepository->existsByUsername($request->username)) {
            throw new \DomainException("Ce nom d'utilisateur est déjà utilisé.");
        }

        if ($this->userRepository->findByEmail($request->email) !== null) {
            throw new \DomainException("Cette adresse email est déjà enregistrée.");
        }

        // 2. Génération d'un identifiant unique (UUID-like)
        $id = bin2hex(random_bytes(16));

        // 3. Création de l'entité de Domaine (valide implicitement les invariants)
        $user = new User(
            $id,
            $request->username,
            $request->email,
            $request->password
        );

        // 4. Persistance via le Port
        $this->userRepository->save($user);

        // 5. Envoi du mail de bienvenue via le Port
        $this->mailer->sendWelcomeEmail($user);

        // 6. Retour du DTO de réponse
        return RegisterUserResponse::fromEntity($user);
    }
}
```

> [!NOTE]
> **Sécurité transactionnelle et effets de bord :** Dans cet exemple simplifié, l'envoi d'email est fait directement à la suite de l'enregistrement en base de données. En production, si l'envoi d'email échoue (panne du serveur SMTP), le cas d'utilisation échouera et renverra une erreur, alors que l'utilisateur aura potentiellement déjà été enregistré en base de données. Pour garantir la cohérence transactionnelle, on utilise généralement des **Événements de Domaine** (Domain Events) combinés au pattern **Outbox** pour déléguer l'envoi d'email de manière asynchrone et fiable.

---

## 5. La Couche Infrastructure (Les Adaptateurs)

L'Infrastructure contient l'implémentation concrète de nos interfaces (les adaptateurs sortants) ainsi que les mécanismes de déclenchement (les adaptateurs entrants).

### Les Adaptateurs Sortants (Outbound Adapters)

Ces classes implémentent les ports sortants en manipulant des détails techniques spécifiques (SQL, SMTP).

#### 1. Persistance SQL : `SqlUserRepository` (via PDO)

```php
<?php

namespace App\Infrastructure\Adapter\Persistence;

use App\Domain\Entity\User;
use App\Domain\Repository\UserRepositoryInterface;
use PDO;

class SqlUserRepository implements UserRepositoryInterface
{
    public function __construct(private PDO $pdo)
    {}

    public function save(User $user): void
    {
        $stmt = $this->pdo->prepare('
            INSERT INTO users (id, username, email, password_hash)
            VALUES (:id, :username, :email, :password_hash)
        ');

        $stmt->execute([
            'id' => $user->getId(),
            'username' => $user->getUsername(),
            'email' => $user->getEmail(),
            'password_hash' => $user->getPasswordHash(),
        ]);
    }

    public function findByEmail(string $email): ?User
    {
        $stmt = $this->pdo->prepare('SELECT * FROM users WHERE email = :email LIMIT 1');
        $stmt->execute(['email' => $email]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            return null;
        }

        return $this->reconstituteEntity($row);
    }

    public function existsByUsername(string $username): bool
    {
        $stmt = $this->pdo->prepare('SELECT COUNT(*) FROM users WHERE username = :username');
        $stmt->execute(['username' => $username]);
        return (int) $stmt->fetchColumn() > 0;
    }

    /**
     * Reconstitue une entité User à partir des données de la base de données.
     * Cette méthode permet de contourner le hachage et la validation du mot de passe en clair.
     */
    private function reconstituteEntity(array $row): User
    {
        $reflection = new \ReflectionClass(User::class);
        $user = $reflection->newInstanceWithoutConstructor();

        $properties = [
            'id' => $row['id'],
            'username' => $row['username'],
            'email' => $row['email'],
            'passwordHash' => $row['password_hash'],
        ];

        foreach ($properties as $name => $value) {
            $property = $reflection->getProperty($name);
            $property->setAccessible(true);
            $property->setValue($user, $value);
        }

        return $user;
    }
}
```

#### 2. Envoi de Mail : `SmtpMailer` (via Symfony Mailer)

```php
<?php

namespace App\Infrastructure\Adapter\Mailer;

use App\Domain\Entity\User;
use App\Domain\Gateway\MailerInterface;
use Symfony\Component\Mailer\MailerInterface as SymfonyMailerInterface;
use Symfony\Component\Mime\Email;

class SmtpMailer implements MailerInterface
{
    public function __construct(private SymfonyMailerInterface $symfonyMailer)
    {}

    public function sendWelcomeEmail(User $user): void
    {
        $email = (new Email())
            ->from('no-reply@notre-application.com')
            ->to($user->getEmail())
            ->subject('Bienvenue sur notre application !')
            ->html(sprintf(
                '<h1>Bonjour %s !</h1><p>Merci de vous être inscrit.</p>',
                htmlspecialchars($user->getUsername(), ENT_QUOTES, 'UTF-8')
            ));

        $this->symfonyMailer->send($email);
    }
}
```

---

### Les Adaptateurs Entrants (Inbound Adapters)

Ces classes capturent un stimulus de l'extérieur, valident le format de la requête et invoquent notre cas d'utilisation.

#### 1. Le Contrôleur HTTP : `RegisterUserController`

Ce contrôleur reçoit une requête HTTP, la décode, instancie le DTO et lance l'exécution. En cas de `DomainException`, il renvoie une erreur `422 Unprocessable Entity` avec le message adéquat.

```php
<?php

namespace App\Infrastructure\Adapter\Http;

use App\Application\DTO\RegisterUserRequest;
use App\Application\UseCase\RegisterUser;
use Nyholm\Psr7\Response;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

class RegisterUserController
{
    public function __construct(private RegisterUser $registerUserUseCase)
    {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $body = json_decode((string) $request->getBody(), true) ?? [];

        // 1. Validation de la requête HTTP
        if (empty($body['username']) || empty($body['email']) || empty($body['password'])) {
            return new Response(400, ['Content-Type' => 'application/json'], json_encode([
                'error' => 'Les champs username, email et password sont obligatoires.'
            ]));
        }

        try {
            // 2. Création du DTO
            $useCaseRequest = new RegisterUserRequest(
                username: $body['username'],
                email: $body['email'],
                password: $body['password']
            );

            // 3. Appel du cas d'utilisation
            $response = $this->registerUserUseCase->execute($useCaseRequest);

            // 4. Réponse de succès
            return new Response(201, ['Content-Type' => 'application/json'], json_encode([
                'message' => 'Utilisateur créé avec succès !',
                'user' => [
                    'id' => $response->id,
                    'username' => $response->username,
                    'email' => $response->email,
                ]
            ]));
        } catch (\DomainException $e) {
            // Les exceptions du domaine sont traduites en code statut HTTP 422
            return new Response(422, ['Content-Type' => 'application/json'], json_encode([
                'error' => $e->getMessage()
            ]));
        } catch (\Throwable $e) {
            // Les exceptions techniques imprévues sont cachées (HTTP 500)
            return new Response(500, ['Content-Type' => 'application/json'], json_encode([
                'error' => 'Une erreur interne est survenue.'
            ]));
        }
    }
}
```

#### 2. La Commande de Console CLI : `RegisterUserCommand`

Nous pouvons sans problème brancher un second canal d'entrée (le CLI) sur le même scénario applicatif. Le code métier reste totalement inchangé, démontrant ainsi la flexibilité de notre découplage.

```php
<?php

namespace App\Infrastructure\Adapter\Cli;

use App\Application\DTO\RegisterUserRequest;
use App\Application\UseCase\RegisterUser;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

#[AsCommand(name: 'app:register-user', description: 'Enregistre un nouvel utilisateur.')]
class RegisterUserCommand extends Command
{
    public function __construct(private RegisterUser $registerUserUseCase)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this
            ->addArgument('username', InputArgument::REQUIRED, 'Le nom d\'utilisateur')
            ->addArgument('email', InputArgument::REQUIRED, 'L\'adresse email')
            ->addArgument('password', InputArgument::REQUIRED, 'Le mot de passe');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);

        $username = $input->getArgument('username');
        $email = $input->getArgument('email');
        $password = $input->getArgument('password');

        try {
            $useCaseRequest = new RegisterUserRequest($username, $email, $password);
            $response = $this->registerUserUseCase->execute($useCaseRequest);

            $io->success(sprintf(
                'Utilisateur créé avec succès ! ID : %s, Nom : %s, Email : %s',
                $response->id,
                $response->username,
                $response->email
            ));

            return Command::SUCCESS;
        } catch (\DomainException $e) {
            $io->error($e->getMessage());
            return Command::FAILURE;
        } catch (\Throwable $e) {
            $io->error('Une erreur inattendue est survenue : ' . $e->getMessage());
            return Command::INVALID;
        }
    }
}
```

---

## 6. Conclusion et Comparatif

En isolant le cœur de l'application (le Domaine et les Use Cases) des détails techniques via des interfaces (les Ports), nous avons obtenu :
1. **Un code hautement testable** : Nous pouvons désormais écrire des tests unitaires très rapides en mockant simplement `UserRepositoryInterface` et `MailerInterface`, ou en fournissant une implémentation `InMemoryUserRepository` ultra-simple.
2. **Une indépendance technologique** : Changer d'ORM (Eloquent vers Doctrine) ou de service d'email (SMTP vers Mailgun) ne demande aucune modification du code métier dans `RegisterUser` ou `User`. Seuls de nouveaux adaptateurs doivent être écrits dans la couche Infrastructure.
3. **Une flexibilité accrue** : HTTP et CLI partagent exactement le même contrôleur de scénario applicatif.

L'Architecture Hexagonale demande plus de fichiers et une rigueur supérieure de découplage au départ, mais elle garantit la pérennité de votre logique métier face à l'obsolescence et à l'évolution des infrastructures technologiques.

