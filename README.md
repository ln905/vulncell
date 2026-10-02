# VulnCell — Bug Bounty Platform (HackerOne-style)

A full-stack coursework project (ICT3.005 — Web Application Development): a vulnerability disclosure platform where hackers submit reports, staff triage and reward them, and reputation is tracked on a leaderboard.

## Features

- **Authentication & roles** — register/login with bcrypt-hashed passwords and JWT sessions in an httpOnly cookie; Hacker / Admin (STAFF) roles.
- **Report submission** — Markdown reports with code blocks; server-side sanitization (sanitize-html) plus safe client rendering (react-markdown + rehype-sanitize); daily submission quota based on **Signal**.
- **Triage workflow** — an **8-state forward-only state machine** (PENDING → TRIAGED → RESOLVED / …), severity, bounties and a full audit timeline; every action runs in **one database transaction**.
- **Reputation & Signal** — append-only points ledger; lifetime reputation vs 365-day Signal (a negative Signal blocks submissions); leaderboard and profile stats.
- **Discovery** — HackerOne-style search syntax (`severity:HIGH weakness:("Reflected XSS") bounty:>=300`), filters + facets, keyset pagination and SPAM privacy rules.
- **Security & abuse protection** — **3-layer rate limiting** (per-IP, login lock, Signal quota), zod input validation, CORS and `trust proxy` behind nginx.
- **Performance** — denormalized reputation, composite + **GIN trigram** indexes, Redis caching with version-based invalidation, gzip; benchmarked with k6: **leaderboard p95 1263 ms → 47.8 ms (≈ 26×), 3.0 ms with cache**, plus security stress tests (brute-force & spam).

## Tech stack

React (Vite) · Tailwind CSS · TanStack Query · Express · Prisma / PostgreSQL · Redis · Docker (nginx + API + database + cache) · k6

## Quick start — one-command Docker demo

```bash
docker compose -p vulncell-demo -f docker-compose.demo.yml up -d --build
# → http://localhost:8080
```

Demo accounts: `admin`, `reporter1` … `reporter10` — password `password123`.

## Development

```bash
docker compose up -d          # PostgreSQL + Redis only
npm install && npm --prefix backend install && npm --prefix frontend install
cp backend/.env.example backend/.env
cd backend && npx prisma migrate dev && npm run seed && cd ..
npm run dev                   # API :4000 + web :5173
```

## Project structure

```
backend/    Express API · Prisma schema/migrations/seed · smoke tests (63 checks)
frontend/   React SPA (Vite, Tailwind, TanStack Query)
bench/      k6 scenarios + recorded results
docs/       benchmark report · sample reports
```

## Tests & benchmarks

- `npm run smoke` — end-to-end API test suite (63 checks).
- `npm run bench:results` — aggregated k6 results; full numbers in `docs/benchmark-report.md`.

## Note

Coursework project for ICT3.005 (Web Application Development). The code is kept clean and lightly commented for readability — feel free to read and learn from it.
