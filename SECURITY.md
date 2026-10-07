# Security policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 1.0.x   | Yes       |

## Reporting a vulnerability

This is a capstone / portfolio repository, not production infrastructure.

If you discover a security issue:

1. **Do not** open a public GitHub issue for sensitive findings.
2. Email the maintainers via GitHub profile contact for [@3bdulah](https://github.com/3bdulah), or open a private security advisory on this repository (**Security → Advisories → New draft**).

We will acknowledge reports within 7 days.

## Scope notes

- Do not commit `.env`, Supabase service-role keys, or Groq API keys.
- The bundled YOLO weights (`packages/cv-pipeline/models/best.pt`) are model artifacts only — treat uploaded replacement weights as untrusted.
- CARLA and SUMO are local simulation dependencies; do not expose unauthenticated backend instances to the public internet without a reverse proxy and auth.
