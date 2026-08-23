# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in CommunityPulse, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please contact the maintainer directly via GitHub: [Y0505](https://github.com/Y0505)

When reporting, please include:

- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (optional)

You should receive a response within 7 days.

## Scope

This security policy applies to the CommunityPulse application code in this repository. It does not cover:

- Third-party dependencies (report those to their maintainers)
- Discord API vulnerabilities (report those to Discord)
- Google Gemini API vulnerabilities (report those to Google)
- Your own deployment configuration

## Security Practices

CommunityPulse follows these security practices:

### Secrets Management

- **Never** hardcode API keys, tokens, or credentials.
- Environment variables are validated at startup.
- Secrets are never logged.
- `.env` files are gitignored.
- `.env.example` contains only placeholders.

### Input Validation

- All AI responses are validated before use.
- Malformed AI output is rejected safely.
- User input is never directly passed to AI prompts without sanitization.

### Permission Enforcement

- Administrative commands require Discord `Manage Server` permission.
- Permissions are checked at both the Discord API level and application level.
- The bot only accesses channels it has explicit permission to read.

### Error Handling

- Internal errors never expose tokens, API keys, or stack traces to users.
- AI failures degrade gracefully — the bot continues operating for non-AI commands.
- Discord API errors are caught and logged without crashing the bot.

### AI Safety

- AI-generated content is never sent automatically to community members.
- Suggested answers from AI are visible to administrators only.
- The bot never autonomously communicates with users based on AI output.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.0.x   | ✅        |

## Dependency Security

Dependencies are managed through npm and can be audited with:

```bash
npm audit
```

If you find a vulnerability in a dependency, please report it following the process above.
