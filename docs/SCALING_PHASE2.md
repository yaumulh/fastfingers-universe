# Fast-fingers Universe - Scaling Phase 2

This phase makes the app safer for high traffic by enabling shared rate limiting, shared API cache, and Redis-backed Socket.io adapter.

## What is included

- Shared rate limiter (Redis when `REDIS_URL` exists, in-memory fallback).
- Shared API response cache with TTL (Redis when `REDIS_URL` exists).
- Socket.io Redis adapter (optional, auto-enabled when `REDIS_URL` exists).
- PostgreSQL-ready Prisma schema (`prisma/schema.postgres.prisma`).

## 1) Install dependencies

```bash
npm install
```

Added packages:
- `ioredis`
- `@socket.io/redis-adapter`

## 2) Environment setup

Copy `.env.example` to `.env` and fill:

- `DATABASE_URL` (PostgreSQL in production)
- `REDIS_URL`
- `NEXT_PUBLIC_APP_URL`

## 3) PostgreSQL migration (recommended for production)

Use PostgreSQL schema file:

```bash
npm run db:generate:pg
npm run db:push:pg
```

## 4) Run app

Web app:
```bash
npm run dev
```

Socket server:
```bash
npm run socket:dev
```

If `REDIS_URL` is set and reachable, socket logs:
- `Socket Redis adapter enabled.`

If not set, socket logs:
- `Socket Redis adapter disabled (REDIS_URL not set).`

## 5) Important note for multi-instance Socket scaling

Redis adapter syncs socket events across instances, but room state is still in-process memory (`rooms` map in `socket-server/server.js`).

For true horizontal realtime scaling, Phase 3 should move room state to Redis/DB (or a dedicated realtime state service).

## 6) Recommended infra baseline for 10k+ users

- Web: 2+ stateless instances behind load balancer.
- Socket: 2+ instances behind load balancer with sticky sessions.
- Redis: managed (single primary at minimum; HA recommended).
- DB: managed PostgreSQL with connection pooling.
- Observability: metrics + logs + alerts (p95 latency, error rate, socket count).
