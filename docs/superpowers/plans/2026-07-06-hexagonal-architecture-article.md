# Hexagonal Architecture Article Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a comprehensive, progressive article on Hexagonal Architecture in both French and English with advanced PHP 8.2+ code examples, integrating it seamlessly into the personal blog.

**Architecture:** We will create two static markdown files under the `pages/posts/` directory. The files will use frontmatter metadata matching the blog's format (`title`, `date`, `lang`, `duration`, `description`) and use standard markdown. The articles will progression-based (easy to complex) using a refactoring case study.

**Tech Stack:** Markdown, PHP 8.2+ (for code snippets), git.

---

### Task 1: French Article - Introduction, Theory and Legacy Code

**Files:**
- Create: `pages/posts/hexagonal-architecture-fr.md`

- [ ] **Step 1: Create the file with frontmatter metadata**
  Create the file `pages/posts/hexagonal-architecture-fr.md` with:
  ```yaml
  ---
  title: "Maîtriser l'Architecture Hexagonale : Du Spaghetti au Code Propre en PHP"
  date: 2026-07-06T00:00:00Z
  lang: fr
  duration: 15min
  description: Un guide complet et progressif pour comprendre, implémenter et maîtriser l'architecture hexagonale en PHP à travers un cas pratique de réfactoring.
  ---
  ```
- [ ] **Step 2: Write Section 1: Le Constat de départ – Le Code Couplé (Legacy Pain)**
  Flesh out a detailed legacy code example of a PHP Controller performing validation, ORM insertion, and direct SMTP mailing. Explain why it is fragile, untestable, and violates SOLID.
- [ ] **Step 3: Write Section 2: Qu'est-ce que l'Architecture Hexagonale ? (Ports & Adapters)**
  Explain the concepts of Domain, Application Use Case, Ports (Driving vs Driven), and Adapters. Detail the Dependency Inversion Principle.
- [ ] **Step 4: Verify formatting**
  Verify the Markdown syntax and that the file opens correctly.
- [ ] **Step 5: Commit**
  ```bash
  git add pages/posts/hexagonal-architecture-fr.md
  git commit -m "feat(blog): add french hexagonal architecture article draft"
  ```

---

### Task 2: French Article - Complete PHP Refactoring Code Examples

**Files:**
- Modify: `pages/posts/hexagonal-architecture-fr.md`

- [ ] **Step 1: Write the Domain layer section with code**
  Write code snippets for:
  - `Domain/Entity/User.php` (pure PHP entity containing invariant rules like email format validation and password strength).
  - `Domain/Exception/InvalidEmailException.php` and `Domain/Exception/WeakPasswordException.php`.
- [ ] **Step 2: Write the Ports layer section with code**
  Write code snippets for:
  - `Domain/Repository/UserRepositoryInterface.php` (driven port).
  - `Domain/Gateway/MailerInterface.php` (driven port).
- [ ] **Step 3: Write the Application layer section with code**
  Write code snippets for:
  - `Application/DTO/RegisterUserRequest.php` and `Application/DTO/RegisterUserResponse.php`.
  - `Application/UseCase/RegisterUser.php` (use case orchestrating logic).
- [ ] **Step 4: Write the Infrastructure layer (Adapters) section with code**
  Write code snippets for:
  - `Infrastructure/Adapter/Persistence/SqlUserRepository.php` (using PDO).
  - `Infrastructure/Adapter/Mailer/SmtpMailer.php` (concrete mailer).
  - `Infrastructure/Adapter/Http/RegisterUserController.php` (HTTP endpoint).
  - `Infrastructure/Adapter/Cli/RegisterUserCommand.php` (CLI entry point).
- [ ] **Step 5: Verify syntax of code blocks**
  Check that all PHP brackets, types, and variables are consistent and properly written.
- [ ] **Step 6: Commit**
  ```bash
  git add pages/posts/hexagonal-architecture-fr.md
  git commit -m "feat(blog): add PHP refactoring code to french hexagonal architecture article"
  ```

---

### Task 3: French Article - Advanced Mastering & Setup Sections

**Files:**
- Modify: `pages/posts/hexagonal-architecture-fr.md`

- [ ] **Step 1: Write Section 4: Mise en Pratique : Arborescence et Câblage**
  Draw the complete folder hierarchy for Hexagonal Architecture in PHP, and provide example configuration (e.g., Symfony container binding `UserRepositoryInterface` to `SqlUserRepository`).
- [ ] **Step 2: Write Section 5: Maîtriser l'Architecture Hexagonale (Concepts Avancés)**
  - Testing Strategy: Write code for `Infrastructure/Adapter/Persistence/InMemoryUserRepository.php` and a PHPUnit test showing how to test the use case in-memory in milliseconds without mocks.
  - Deptrac integration: Explain `deptrac.yaml` rules to enforce layer boundaries.
  - Discussion on CQRS, DDD, and Trade-offs (when NOT to use it).
- [ ] **Step 3: Verify the full French article**
  Review the complete french article and make sure it flows logically and is fully "étoffé" (fleshed out).
- [ ] **Step 4: Commit**
  ```bash
  git add pages/posts/hexagonal-architecture-fr.md
  git commit -m "feat(blog): complete french hexagonal architecture article"
  ```

---

### Task 4: English Article Creation and Translation

**Files:**
- Create: `pages/posts/hexagonal-architecture.md`

- [ ] **Step 1: Create the file with English frontmatter**
  Create `pages/posts/hexagonal-architecture.md` with English frontmatter linking back to the French version.
- [ ] **Step 2: Translate Section 1 and Section 2**
  Translate the introduction, coupled code explanation, and core theory into polished technical English.
- [ ] **Step 3: Translate Section 3 (Refactoring & PHP Code)**
  Translate code explanations and keep the code snippets (code is universal but comments/descriptions should be in English).
- [ ] **Step 4: Translate Section 4 and Section 5**
  Translate directory structures, configuration, testing strategy, in-memory repository tests, deptrac configuration, and trade-offs.
- [ ] **Step 5: Verify the English article**
  Perform a thorough review of the English translation to ensure technical accuracy and natural phrasing.
- [ ] **Step 6: Commit**
  ```bash
  git add pages/posts/hexagonal-architecture.md
  git commit -m "feat(blog): complete english hexagonal architecture article"
  ```
