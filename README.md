# AXIOM — Cloudflare-only starter

This project uses Cloudflare Workers for the app/API, D1 for accounts and messages, and Durable Objects for live channel updates. It has **no Supabase dependency** and does not ask users for email.

## Included and working in this starter
- Username + password registration and login
- Password hashing and secure session cookies
- Create channels
- Persistent channel messages in D1
- Live channel updates using WebSockets and Durable Objects

## Not included yet
Direct messages, friends/friend requests, voice/video calls, uploads, admin moderation, password recovery, and production-grade abuse controls are not implemented in this starter. In particular, it does **not** yet provide real user-to-user voice/video calls.

## Deploy to Cloudflare

1. Install **Node.js LTS** on your computer.
2. Create a Cloudflare **D1 database** named `axiom-db` in the Cloudflare dashboard. Copy its database ID.
3. In this project, open `wrangler.toml` and replace `REPLACE_WITH_YOUR_D1_DATABASE_ID` with the database ID you copied. Keep the quotes around the ID.
4. Open a terminal in this project folder and run these commands one at a time:

```bash
npm install
npx wrangler login
npx wrangler d1 migrations apply axiom-db --remote
npm run deploy
```

5. Wrangler will print a `workers.dev` address. Open it to use AXIOM.

**Important:** Deploy this as a **Worker with assets**, not as a Pages-only static site. The API, D1 database and Durable Object need the Worker runtime.
