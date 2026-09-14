# family-plan

Private family planning tool. Phase 1a: five electronic worksheets that each
person fills out and submits, stored in Railway PostgreSQL.

- `api/` Fastify + Drizzle, deploys to Railway.
- `web/` Next.js App Router, deploys to Vercel.

Phase 1a deliberately has no login, no dashboard, no email reminders and no
chore integration. Those are later phases.

Each person opens their own private link, `https://<domain>/f/<token>`.
