# Deploy: Vercel + Neon

Config-only reference. Nothing here has been executed against real Vercel/Neon
infrastructure — this repo has never been deployed. Written so deploy day
needs zero code edits.

## Finding: no `vercel.json` needed

`npx next build` (checked 2026-09-05) is a standard Next.js App Router build —
static `/` and `/demo`, dynamic `/api/*` route handlers, one dynamic page
(`/checkout/[orderId]`). Vercel auto-detects this with zero configuration.
Do not add a `vercel.json` unless a real deploy surfaces a concrete need.

## One-time setup

1. **Neon**: create a project, copy the **pooled** connection string
   (`postgres://...`, the one with `-pooler` in the host — Vercel's
   serverless functions need pooled connections, not the direct one).
2. **Vercel**: import this GitHub repo. Framework preset: Next.js (auto).
   Build command: `next build` (default, no override needed).
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
