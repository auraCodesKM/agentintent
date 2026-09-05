# Deploy: Vercel + Neon

Config-only reference. Nothing here has been executed against real Vercel/Neon
infrastructure — this repo has never been deployed. Written so deploy day
needs zero code edits.

## Finding: no `vercel.json` needed

`npx next build` (checked 2026-09-05) is a standard Next.js App Router build —
static `/` and `/demo`, dynamic `/api/*` route handlers, one dynamic page
(`/checkout/[orderId]`). Vercel auto-detects this with zero configuration.
Do not add a `vercel.json` unless a real deploy surfaces a concrete need.

## WARNING: never run the SQLite migrations against Neon

`prisma/migrations/` is **SQLite-dialect** (generated against `prisma/schema.prisma`,
provider `sqlite`). `npm run db:migrate` (`prisma migrate deploy`) applies exactly
those migrations and is **sqlite-dev-only** — it will fail, or worse, silently
produce wrong DDL, if pointed at a Postgres `DATABASE_URL`. Neon always uses
`npm run db:push-pg` (`prisma db push --schema prisma/schema.postgresql.prisma`),
which pushes the current schema shape directly with no migration history. Do not
"fix" this by trying to run `db:migrate` against Neon — that is the wrong tool
for this database, not a missing step.

## One-time setup

1. **Neon**: create a project, copy the **pooled** connection string
   (`postgres://...`, the one with `-pooler` in the host — Vercel's
   serverless functions need pooled connections, not the direct one).
2. **Vercel**: import this GitHub repo. Framework preset: Next.js (auto).
   **Build Command must be set explicitly to `npm run build:vercel`** — override
   the Vercel dashboard default (`next build` / `npm run build`). This runs
   `prisma generate --schema=prisma/schema.postgresql.prisma` before `next
   build`, so the deployed Prisma client is generated against the **Postgres**
   schema. Without this override, Vercel falls back to Prisma's own
   `postinstall`, which reads the default `prisma/schema.prisma` (provider
   `sqlite`) — the deployed app would then run a SQLite client against a
   `postgres://` `DATABASE_URL` and fail at runtime, after a green build. The
   plain `npm run build` script is untouched and still `next build` alone, for
   local SQLite development.
3. **Environment variables** (Vercel project settings → Environment Variables,
   set for Production — and Preview if you want preview deploys to work):

   | Var | Value |
   | --- | --- |
   | `GEMINI_API_KEY` | same key as local `.env` |
   | `GEMINI_MODEL` | `gemini-3.5-flash-lite` |
   | `GEMINI_FALLBACK_MODEL` | `gemini-3.1-flash-lite` |
   | `GOOGLE_GENAI_USE_VERTEXAI` | `false` |
   | `RAZORPAY_KEY_ID` | `rzp_test_...` (test mode) |
   | `RAZORPAY_KEY_SECRET` | test mode secret |
   | `RAZORPAY_WEBHOOK_SECRET` | set after step 5 below |
   | `NEXT_PUBLIC_RAZORPAY_KEY_ID` | same value as `RAZORPAY_KEY_ID` |
   | `DATABASE_URL` | the Neon **pooled** connection string |
   | `WEBHOOK_FORCE_FAIL` | `false` |

4. **Push the schema to Neon** (one-time, from a machine with the Neon
   `DATABASE_URL` in its env — do NOT run `db:migrate`, the checked-in
   migrations are sqlite-dialect and will fail against Postgres):
   ```bash
   DATABASE_URL="<neon-pooled-url>" npm run db:push-pg
   DATABASE_URL="<neon-pooled-url>" npm run seed
   ```
   `db:push-pg` runs `prisma db push --schema prisma/schema.postgresql.prisma`
   — it pushes the current model shape directly, no migration history. If the
   schema ever changes, run `npm run db:gen-pg` first (regenerates
   `schema.postgresql.prisma` from `schema.prisma`) and commit both files,
   then re-run `db:push-pg` against Neon.
5. **Deploy**, then register the webhook in the Razorpay Dashboard
   (Test Mode → Webhooks) pointing at:
   ```
   https://<your-app>.vercel.app/api/webhooks/razorpay
   ```
   events: `payment.captured`, `payment.failed`, `order.paid`. Copy the
   webhook secret Razorpay shows you into `RAZORPAY_WEBHOOK_SECRET` in
   Vercel and redeploy (env var changes need a redeploy to take effect).

## Post-deploy smoke check

```bash
npx tsx scripts/webhook_route_smoke.ts https://<your-app>.vercel.app
```
Expects: bad signature → 400, valid → 200, duplicate → 200 (no-op).

## Local dev is untouched

`sqlite` + `file:./dev.db` via `npm run seed` / `npx prisma migrate dev`
remains the local flow (`prisma/schema.prisma`, unaffected by any of the
above). `prisma/schema.postgresql.prisma` is a derived, checked-in file used
only for the Neon push — never hand-edit it, never run dev against it.

**Caveat if you run `npm run build:vercel` locally (not required, but if you
do):** `prisma generate` always writes to the same `./node_modules/@prisma/client`
regardless of which schema it read, so running it against the Postgres schema
overwrites the client your local sqlite dev/tests were using — `npm test` will
fail afterward with Postgres-shaped Prisma errors against the sqlite `dev.db`.
This is harmless on real Vercel (an isolated build environment, never shared
with your machine) but if it happens locally, restore the sqlite client with:
```bash
npx prisma generate --schema=prisma/schema.prisma
```
then re-run tests.
