# Sherlo – Example CI Workflows Guidelines

This document defines **hard guidelines and conventions** for all example CI workflows presented in Sherlo documentation.

The primary goal of these examples is **clarity and immediate understanding**.
Each workflow must be readable in isolation, without requiring the user to cross-reference other examples or infer missing context.

---

## 1. Scope and assumptions

### 1.1 Supported CI platform

- Only **GitHub Actions** is supported and documented
- No GitLab, Bitbucket, CircleCI or others

### 1.2 Repository visibility

- All examples assume a **public repository**
- No enterprise-only features
- No private runners or self-hosted infrastructure

---

## 2. General philosophy

### 2.1 Examples over abstractions

- Examples should be concrete, explicit and verbose
- Avoid “magic” steps, hidden assumptions or clever shortcuts

### 2.2 One example = one mental model

Each workflow example is treated as:

- The **only** workflow the user is reading
- The **first** CI workflow they see in Sherlo docs

Because of that:

- Comments and explanations **must be repeated**
- Authentication, tooling and assumptions must be reintroduced every time

---

## 3. Naming conventions (hard rules)

### 3.1 Workflow name (GitHub Actions `name:`)

#### Test workflows

Hard convention: `Sherlo Test - <Method>`

Examples:

- `Sherlo Test - Standard`
- `Sherlo Test - EAS Update`
- `Sherlo Test - EAS Cloud Build`

#### Build workflows

- **Must NOT include “Sherlo” in the name**
- Name should clearly communicate:
  - That this workflow builds the app
  - Target platform (simulators)
  - Build type (development / preview)

Examples:

- `Build App - Development Simulators`
- `Build App - Preview Simulators`

---

### 3.2 Workflow file names

#### Test workflows

sherlo-test-standard.yml
sherlo-test-eas-update.yml
sherlo-test-eas-cloud-build.yml

#### Build workflows

- No `sherlo` prefix
- Clear and descriptive

Examples:

build-development-simulators.yml
build-preview-simulators.yml

---

### 3.3 Artifact names (EAS Update only)

Artifact names should:

- **Not include "sherlo"** (same rule as build workflows)
- Be clear and descriptive

Examples:

- `native-dev-builds`
- `native-preview-builds`

---

### 3.4 Build output paths and formats

All build outputs should be placed in the `builds/` directory:

- Android: `builds/android.apk`
- iOS: `builds/ios.tar.gz`

Note: Sherlo CLI accepts iOS builds in `.tar.gz` format directly (no need to extract)

---

## 4. Structure and readability

### 4.1 Comments

- Comments are **required** for:
  - EAS authentication
  - Build profiles
  - Artifact usage
  - Sherlo-specific steps
- Comments must be written as **full sentences**
- Comments must **not end with a period** (applies to all comments in YAML files)

### 4.2 Comment repetition (very important)

Even if the same concept appears in multiple workflows:

- Repeat the explanation
- Repeat links to documentation
- Repeat information about tokens and authentication

Every workflow must be understandable **on its own**

---

## 5. Language and tone

### 5.1 Style

- Clear, technical, neutral
- No marketing language
- No recommendations or “best choice” wording

### 5.2 Emojis

- Emojis are allowed **only if they improve readability**
- Use them sparingly
- Never use emojis inside YAML keys or values

Example usage:

- Section headers
- High-level comments

---

## 6. Build vs test responsibility separation

### 6.1 Method-specific approach

Separation depends on the testing method:

- **Standard method**: Build and test in the **same workflow**
  - Always requires fresh native builds
  - No artifact reuse needed
- **EAS Update method**: Build and test in **separate workflows**
  - Native builds only when code changes
  - Uses artifact-based communication

### 6.2 Artifact-based communication (EAS Update only)

For EAS Update method only:

- Build workflows:
  - Build the app using EAS Build
  - Upload resulting binaries as **GitHub Actions artifacts**
- Test workflows:
  - Download previously uploaded artifacts
  - Use them as inputs for Sherlo

---

## 7. Method-specific rules

### 7.1 Standard method

- Always requires a fresh native build
- No conditional logic
- No caching
- No skipping builds

Implication:

- Build is always part of the flow
- No artifact reuse logic needed

---

### 7.2 EAS Update method

This is the **only** method where conditional builds are demonstrated.

Rules:

- Native builds are required **only when native code changes**
- OTA updates are used otherwise

What we want the user to easily infer:

- Standard method = build every time
- EAS Update = build only when necessary

Constraints:

- No complex logic
- No matrices
- No advanced GitHub Actions features

If a conditional is shown:

- It must be simple
- It must be explained in comments
- It must not require prior CI knowledge

---

### 7.3 EAS Cloud Build method

- Build happens inside the Sherlo test workflow
- Still must be explicit
- Still must explain EAS authentication and profiles

---

## 8. Referencing documentation

### 8.1 Mandatory doc links

Whenever a workflow uses:

- EAS Build
- EAS Update
- Sherlo CLI
- Authentication tokens

A comment must include a direct link to:

- Relevant Sherlo documentation page

### 8.2 Links in comments only

- Documentation links should live in comments
- Do not embed links in step names

---

## 9. YAML examples in documentation

### 9.1 Included snippets

- Documentation **must include real YAML fragments**
- Snippets must be copy-pasteable

### 9.2 Do / Don’t sections

Each method section should include:

- A short **Do** list
- A short **Don’t** list

Examples:

- Do: Use artifacts to reuse native builds
- Don’t: Rebuild native apps on every OTA update

---

## 10. Simplicity above all

### 10.1 No advanced CI concepts

Do not use:

- Reusable workflows
- Composite actions
- Custom actions
- Complex caching strategies

### 10.2 The “zero thinking” rule

A user should be able to:

- Copy the example
- Paste it into `.github/workflows`
- Understand what happens without reverse-engineering anything

If something requires explanation:

- Add a comment
- Prefer verbosity over elegance

---

## 11. Summary

These workflows are not meant to be:

- Optimized
- Clever
- Production-perfect

They are meant to be:

- Obvious
- Predictable
- Educational
- Self-contained

If there is ever a trade-off:
**Choose clarity over correctness**
