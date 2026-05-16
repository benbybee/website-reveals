This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Outbound integrations

- **SiteLaunchr** — HMAC-signed POST to `joinsitelaunchr.com/api/builds` for every
  `/sales` submission. See [lib/sitelaunchr.ts](lib/sitelaunchr.ts).
- **Dispatchr** — fire-and-forget observability webhook. Six events
  (`submission.new`, `build.dispatched`, `build.live`, `build.failed`,
  `build.stuck`, `submission.abandoned`) sent to
  `joindispatchr.com/api/webhooks/websitereveals` whenever
  `WEBSITEREVEALS_DISPATCHR_WEBHOOK_URL` + `WEBSITEREVEALS_DISPATCHR_WEBHOOK_SECRET`
  are configured. Helper: [lib/dispatchr-webhook.ts](lib/dispatchr-webhook.ts).
- **Resend** — transactional email (DNS instructions, welcome, status changes).
- **Telegram** — admin alerts on submission + live + build review.

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

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
