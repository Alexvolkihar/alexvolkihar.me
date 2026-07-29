---
draft: true
title: "Automating the SDLC: Lessons from My Master's Thesis"
date: 2025-11-26T00:00:00Z
lang: en
duration: 10min
description: A technical and personal review of automating the software development lifecycle with GitLab CI, Docker Swarm, and SonarQube.
---

> [Version Française](/posts/devops-automation-thesis-fr) | [日本語版](/posts/devops-automation-thesis-ja)

In modern software development, delivery speed and technical code quality are often perceived as two opposing forces. On one side, the business demands features faster and faster; on the other, operational stability requires rigor and multiple safeguards. 

To address this tension, I conducted my research as part of my preparation for the **Manageur de Solutions Digitales et Data (MS2D)** master's degree at **ENI École**. Supported by my company mentor at the Rennes agency of my company (an IT services company), I planned and implemented a global automation strategy around a central question: 

> "What software solutions can automate the various stages of a software development lifecycle to improve team productivity?"

Here is the retrospective of this technical, organizational, and human adventure.

---

## 1. The Current State: Diagnosing Friction (The Audit)

Before rushing headfirst into writing scripts, we had to analyze our existing processes. To carry out this diagnosis objectively, we implemented an audit methodology structured around two pillars:
*   **Developer surveys**: We regularly sent questionnaires and conducted individual interviews to map the team's feedback regarding repetitive manual work ("toil") and to precisely identify daily pain points.
*   **Value Stream Mapping (VSM)**: We modeled the complete path of a code change, from the initial commit on the development workstation to its actual release in production. This exercise allowed us to measure processing times, wait times, and operational bottlenecks that slowed down our delivery flow:

*   **The "it works on my machine" effect**: Without rigorous environment standardization, each developer configured their local machine manually. Subtle version discrepancies (Node.js, Java runtimes, or system libraries) led to surprise errors during deployment.
*   **Manual and anxiety-inducing deployments**: Releasing to staging or production relied on multi-page paper runbooks. We had to transfer packages via FTP/SCP, stop services manually, run SQL scripts by hand, and restart everything—often late at night. Skipping a single step meant the release failed.
*   **Delayed feedback loop**: Without systematic test execution, regressions or code quality issues were only discovered during the QA phase, or worse, directly in production by our users. Fixing a bug weeks after it was introduced proved to be extremely costly and time-consuming.
*   **Pronounced Dev/Ops silos**: Developers would "throw" their releases over the wall to system administrators, who had to manage the infrastructure in isolation without any real visibility into the application code.

---

## 2. The Benchmark: Making the Right Technology Choices

To resolve these pain points, I conducted a comparative study to select the toolchain best suited to our company's constraints and team skills. To do this, we defined a rigorous evaluation matrix based on several key criteria:
*   **Licensing costs**: Prioritizing open-source solutions or tools integrated at no extra cost into our existing software to avoid increasing recurring expenses.
*   **Operational and maintenance effort**: Choosing solutions that are easy to administer and update daily to avoid overloading our operations teams.
*   **Vendor lock-in**: Ensuring that tools and environments rely on open technologies to preserve our freedom to migrate in the future.
*   **Learning curve**: Evaluating the complexity of adoption for our agency's developers to guarantee quick onboarding.
*   **Adaptability to existing tech stacks**: Ensuring smooth compatibility and integration with our current environments (Java/Spring Boot, Vue.js).

```mermaid
graph TD
    A[Source Code: GitLab] --> B[CI/CD: GitLab CI]
    B --> C[Quality & Security: SonarQube]
    B --> D[Staging Orchestration: Docker Swarm]
    D --> E[Monitoring & Logs: Prometheus + Grafana / ELK]
```

### CI/CD: The Choice of Native Integration with GitLab CI
Although Jenkins is the industry veteran and GitHub Actions is highly popular, we prioritized **GitLab CI**. Since our company already hosted its source code on an on-premises GitLab instance, GitLab CI was a natural fit:
*   No third-party tools to manage or secure (significantly reducing the maintenance overhead compared to a Jenkins server).
*   Pipelines declared as YAML files (`.gitlab-ci.yml`) versioned directly alongside the application code (*Pipeline-as-Code*).
*   A unified user interface linking commits, branches, merge requests, and build status together.

### Orchestration: Why Docker Swarm instead of Kubernetes?
**Kubernetes (K8s)** has become the industry standard for container orchestration, but it introduces immense operational complexity and infrastructure costs for mid-sized teams working on internal projects. 

I chose to adopt **Docker Swarm** for the following reasons:
*   **Gentle learning curve**: Swarm uses the same declarative syntax as Docker Compose, a tool our developers were already familiar with.
*   **Lightweight and cost-effective**: Swarm runs directly on the standard Docker engine without requiring a dedicated cluster of machines to manage the control plane.
*   **Sufficient feature set**: Swarm natively handles multi-node clustering, service discovery, load balancing, and rolling updates (progressive deployments with zero downtime).

### Quality and Observability: SonarQube and the Prometheus/Grafana Duo
For code quality and security, **SonarQube** was integrated to provide immediate feedback on technical debt, security vulnerabilities, and test coverage.

On the production side, observability was structured around **Prometheus** (collecting application and system metrics via dedicated exporters) and **Grafana** (for real-time visualization and alerting on Slack/Teams). Logs were centralized using the **ELK** suite (Elasticsearch, Logstash, Kibana).

---

## 3. The Pilot Project: Event (our internal event-planning application) in the Field

To validate this architecture, we ran an experiment on **Event (our internal event-planning application)**, a representative internal application consisting of a **Vue.js** frontend, a **Spring Boot (Java)** backend, and a **PostgreSQL** database. The effort focused on the complete migration of the "User Account Management" module.

> [!NOTE]
> During this 2-week pilot sprint, management agreed to a temporary feature freeze, allowing the team to focus exclusively on DevOps engineering and pipeline setup.

Here is how we solved the main technical challenges encountered under real-world conditions:

### Challenge 1: Slow Pipeline Runs (from 20 min to 8 min)
During initial runs, the pipeline took nearly 20 minutes to complete, mostly due to systematically downloading Maven dependencies and rebuilding Docker layers from scratch. 
*   **Solution**: We configured the GitLab Runner to cache the `.m2/repository` directory and enabled Docker Layer Caching. Finally, we parallelized the execution of backend unit tests and the Vue.js frontend build.

Here is the corresponding snippet of our pipeline configuration in the `.gitlab-ci.yml` file:

```yaml
stages:
  - 🤞 test
  - 📦 build

test-backend:
  stage: 🤞 test
  image: maven:3.9-eclipse-temurin-21
  script:
    - cd back && ./mvnw $MAVEN_CLI_OPTS clean test
  cache:
    key:
      files:
        - back/pom.xml
    paths:
      - .m2/repository
    policy: pull

test-frontend:
  stage: 🤞 test
  image: node:22.11
  script:
    - cd front && npm ci && npm run coverage
  cache:
    key:
      files:
        - front/package-lock.json
    paths:
      - front/node_modules/
    policy: pull
```

Overall build times dropped to **8 minutes**, making the feedback loop pleasant and efficient for the team.

### Challenge 2: Flaky UI Tests
End-to-end (E2E) tests on the Vue.js frontend failed randomly due to browser rendering latencies, without any actual bugs in the code.
*   **Solution**: We banned fixed wait times (e.g., `sleep 2000`) and replaced them with explicit synchronizations (dynamic `waitFor` statements in Cypress and Playwright). Additionally, we implemented an automatic retry system (configured to 1 retry upon failure) to filter out false negatives in the CI.

### Challenge 3: Service Startup Order and Database Connection Failures
During initial deployments of our container stack, the Spring Boot application container started faster than the database engine. The application attempted to connect immediately to a database that was not yet operational, resulting in fatal connection failures and container crashes.
*   **Solution**: We resolved this sequencing issue by implementing a `healthcheck` block on the database using the `mysqladmin ping` command. On the web application side, we configured the `depends_on` directive with the `service_healthy` condition to delay the backend startup until the database is fully operational.

Here is the corresponding snippet from our `docker-compose.yml` file:

```yaml
services:
  db:
    image: mysql:9.2.0
    restart: unless-stopped
    environment:
      MYSQL_DATABASE: app_db
      MYSQL_USER: app_user
      MYSQL_PASSWORD: app_pwd
      MYSQL_ROOT_PASSWORD: app_root_pwd
    ports:
      - "3306:3306"
    volumes:
      - db_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5

  app:
    build:
      context: ./back
      dockerfile: Dockerfile
    ports:
      - "8080:8080"
    environment:
      SPRING_DATASOURCE_URL: "jdbc:mysql://db:3306/app_db?createDatabaseIfNotExist=true&useSSL=false&serverTimezone=UTC&allowPublicKeyRetrieval=true"
      SPRING_DATASOURCE_USERNAME: app_user
      SPRING_DATASOURCE_PASSWORD: app_pwd
      SPRING_DATASOURCE_DRIVER_CLASS_NAME: "com.mysql.cj.jdbc.Driver"
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped
```

### Challenge 4: Database Schema Drift
The staging database schema frequently drifted from the developers' local schemas, causing application crashes during deployments.
*   **Solution**: We integrated **Flyway** into our backend build and execution process. Schema changes are now written as versioned SQL files (e.g., `V1__init.sql`, `V2__add_user_roles.sql`) placed in `src/main/resources/db/migration`. On startup, Flyway compares these files with the internal metadata table (`flyway_schema_history`) and automatically applies missing scripts in sequential order. If an inconsistency or undocumented change is detected, the backend container refuses to start and the deployment pipeline fails, ensuring that no code version runs with an incompatible database structure.

### Challenge 5: Under-dimensioned Infrastructure
Prometheus quickly triggered swap usage alerts on the staging VM, causing highly unstable API response times.
*   **Solution**: Analyzing memory usage graphs in Grafana revealed that the Spring Boot application and the database instance were tightly constrained, saturating the VM's 2 GB of allocated RAM. The RAM was upgraded to **4 GB**, which immediately stabilized performance and resolved the slowdowns.

---

## 4. The Results: Proof in the Numbers (DORA & Quality)

The results gathered after several sprints of running the pilot module speak for themselves. They concretely demonstrate the impact of automation on our process efficiency and deliverable quality:

| Metric | Before | After | Impact |
| :--- | :---: | :---: | :---: |
| **Lead Time** (Commit-to-production cycle time) | ~3 days | **< 24 hours** | Cycles divided by 3 |
| **Deployment Frequency** (Merges / day) | ~0.4 (2 per week) | **2.0 (per day)** | Continuous integration adopted |
| **Test Coverage** (Backend Spring Boot) | 55% | **70%** | Strengthened safety net |
| **Technical Debt** (SonarQube) | Baseline | **-15%** | Proactive refactoring |
| **Deployment Success Rate** | Unpredictable | **100% (over 7 deployments)** | Reliable procedures |

These indicators align directly with the key metrics defined by **DORA** (DevOps Research and Assessment). We proved that it is possible to speed up the delivery rate while dramatically increasing the quality and stability of the application.

---

## 5. Future Trends: Where Do We Go From Here?

Rolling out this strategy across all our company's teams is currently underway on a 9-to-12-month roadmap. Looking further ahead, exciting opportunities lie before us:

1.  **Platform Engineering & Self-Service**: Our goal is to build an Internal Developer Platform (IDP) or implement *ChatOps* commands (via Slack or Teams). This will allow developers to provision ephemeral test environments or trigger a test run with a single click, without needing to master the underlying Docker or Terraform plumbing.
2.  **Advanced DevSecOps**: We plan to shift security further left (*Shift-Left*) by integrating automated vulnerability scans on third-party Docker images using Harbor, Software Composition Analysis (SCA), and Infrastructure as Code (IaC) scanning on our Terraform scripts to prevent exposing vulnerable resources.
3.  **NoOps & Auto-Remediation**: Connecting our Prometheus monitoring system to our Docker Swarm or Kubernetes orchestrator to trigger automated actions. For example, if a high load is detected, the system could automatically deploy additional instances (*auto-scaling*) or restart a failing container (*auto-healing*) without human intervention.
4.  **Automated Dependency Updates**: To reduce the risk of security vulnerabilities and technical debt associated with outdated libraries, we are deploying **Renovate Bot**. This bot continuously analyzes our dependency files (`pom.xml` for Java/Maven and `package.json` for Vue.js/npm) and automatically opens integration requests (Merge Requests). To prevent notification spam, updates are automatically grouped by ecosystem using custom rules.

Here is an example of our `renovate.json` configuration:

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended"],
  "dependencyDashboard": true,
  "timezone": "Europe/Paris",
  "baseBranches": ["develop"],
  "packageRules": [
    {
      "includePaths": ["back/**"],
      "matchManagers": ["maven"],
      "groupName": "javaDependencies",
      "assignees": ["@dev.lead"],
      "separateMinorPatch": true
    },
    {
      "includePaths": ["front/**"],
      "matchManagers": ["npm"],
      "groupName": "javascriptDependencies",
      "assignees": ["@dev.lead"],
      "separateMinorPatch": true
    }
  ]
}
```

---

## Conclusion

This thesis work has demonstrated that automation is far more than a set of trendy tools: it is a genuine driver of economic and human performance for the company. By freeing engineers from manual, repetitive, and anxiety-inducing tasks, we allow them to refocus on their core expertise: designing and developing value for our clients. 

The path toward DevOps is a journey of continuous improvement where a collaborative culture and learning through experience matter just as much as the technologies chosen.

---
*Many thanks to the director of our agency, to my company mentor, and the entire pedagogical team at ENI École for their support throughout the writing of this thesis.*
