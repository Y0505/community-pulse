# Contributing to CommunityPulse

Thank you for your interest in contributing to CommunityPulse! This document provides guidelines for contributing to the project.

## Getting Started

1. **Fork** the repository on GitHub.
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/Y0505/community-pulse.git
   cd community-pulse
   ```
3. **Install** dependencies:
   ```bash
   npm install
   ```
4. **Create a branch** for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Setup

### Prerequisites

- Node.js 20 or later
- npm
- A Discord bot token (from the [Discord Developer Portal](https://discord.com/developers/applications))
- A Google Gemini API key (from [AI Studio](https://aistudio.google.com/apikey))

### Environment Variables

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

### Running the Bot

```bash
npm run dev            # Start with tsx (hot reload)
npm run build          # Compile TypeScript
npm start              # Run compiled output
npm run deploy:commands  # Register slash commands
npm run check          # Type-check without emitting
npm run lint           # ESLint
npm run format         # Prettier
```

## Code Style

- **TypeScript** in strict mode.
- **ESLint** and **Prettier** are configured. Run `npm run lint` and `npm run format` before submitting.
- Use `const` and `let` — no `var`.
- Prefer explicit interfaces over anonymous types.
- Keep command files thin — business logic belongs in `src/services/`.

## Submitting Changes

1. Ensure your code passes type checking, linting, and builds cleanly:
   ```bash
   npm run check && npm run build && npm run lint
   ```
2. Commit your changes with a clear message describing what changed and why.
3. Push your branch and open a **Pull Request** against `main`.

### Pull Request Guidelines

- Describe what the PR does and why.
- Reference any related issues.
- Keep PRs focused — one logical change per PR.
- Include screenshots or logs if the change affects user-facing behavior.

## Reporting Issues

- Use GitHub Issues for bug reports and feature requests.
- For security vulnerabilities, please see [SECURITY.md](SECURITY.md).

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold its standards.

## License

By contributing to CommunityPulse, you agree that your contributions will be licensed under the [MIT License](LICENSE).

Third-party dependencies remain subject to their respective licenses.
