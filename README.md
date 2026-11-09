This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Database migrations

This project has no automated migration runner. Each file under
`supabase/migrations/` must be applied by hand in the Supabase SQL
editor, in filename order, **before** deploying the matching application
code — code that references a column, table, or constraint value a
migration hasn't been run for will fail at runtime (not at build time,
since nothing here is statically checked against the live database
schema).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Meta Ads reports

Per-client Meta Ads reports (client page → Meta Ads reports) read live from the
Meta Marketing API and export to PDF.

1. In the BYC Meta Business Manager create a **system user** with `ads_read`
   on the clients' ad accounts and generate its access token.
2. Set `META_ACCESS_TOKEN` in `.env.local` and in Vercel (Preview and
   Production). The token is only read in server code.
3. Apply `supabase/migrations/0019_meta_reports.sql` in the Supabase SQL editor.
4. On a client page, add the client's ad account ID (`act_…`), then create a
   report. Press **Refresh** to fetch data; reports only change when Refresh
   is pressed. **Export PDF** opens the print dialog — choose "Save as PDF".

Unit tests for the report logic: `npm test`.

## Notifications

A bell in the top bar shows unread in-app notifications; `/notifications` lists them.

1. Apply `supabase/migrations/0020_notifications.sql` in the Supabase SQL editor.
2. Notifications are created by server actions for: task assigned, added as support,
   blocked, completed and commented; leave submitted (to the manager, or HR if none),
   approved and rejected. Nobody is notified about their own action.
3. Rows can only be created by server code (service role); users can read and mark
   only their own. Email through Zoho Mail is planned and can read the same rows.
