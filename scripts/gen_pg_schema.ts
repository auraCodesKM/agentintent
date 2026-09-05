// Derives prisma/schema.postgresql.prisma from prisma/schema.prisma by swapping
// ONLY the datasource provider. Single source of truth — never hand-edit the
// generated file. Approved variant of the Neon deploy proposal (HANDOFF.md).
import { readFileSync, writeFileSync } from "node:fs"

const src = readFileSync("prisma/schema.prisma", "utf8")

if (!/provider\s*=\s*"sqlite"/.test(src)) {
  console.error("expected sqlite provider in prisma/schema.prisma — aborting")
  process.exit(1)
}

const out = src.replace(/provider\s*=\s*"sqlite"/, 'provider = "postgresql"')
const header =
  "// GENERATED FILE — do not edit. Derived from schema.prisma by scripts/gen_pg_schema.ts\n" +
  "// Regenerate: npm run db:gen-pg\n\n"

writeFileSync("prisma/schema.postgresql.prisma", header + out)
console.log("written: prisma/schema.postgresql.prisma (provider=postgresql)")
console.log("deploy usage: prisma db push --schema prisma/schema.postgresql.prisma")
console.log("(never `prisma migrate deploy` against Neon — prisma/migrations/ is sqlite-dialect)")
