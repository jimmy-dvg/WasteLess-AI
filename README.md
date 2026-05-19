# Wastless AI

Mobile-first Next.js app for food scanning and waste reduction.

## Requirements

- Node.js 20+
 - Gemini API key
 - (Project uses JWT auth stored in Neon PostgreSQL)

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` in the project root:

```bash
GEMINI_API_KEY=your_key_here
GEMINI_MODELS=gemini-2.5-flash,gemini-2.5-flash-latest,gemini-2.0-flash,gemini-2.0-flash-lite
# DATABASE_URL is required for Neon/Postgres
DATABASE_URL=postgresql://user:pass@your-neon-host/dbname?sslmode=require
```

`GEMINI_MODELS` is optional. If omitted, the app uses the same built-in fallback list above.

3. Start dev server:

```bash
npm run dev
```

4. Open http://localhost:3000

## Scripts

- `npm run dev` - Start local development server
- `npm run build` - Build for production
- `npm run start` - Start production build
- `npm run lint` - Run ESLint
- `npm run db:generate` - Generate Drizzle migrations from the schema
- `npm run db:migrate` - Apply Drizzle migrations
- `npm run db:studio` - Open Drizzle Studio

## Database

The project now includes a Drizzle schema layer that mirrors the current PostgreSQL tables.
It is defined in `src/lib/drizzle-schema.ts` and configured through `drizzle.config.ts`.

The existing SQL files in `sql/` remain committed as reference, but new schema changes should
use Drizzle migrations going forward.

## PWA Support

This project is configured as a Progressive Web App (PWA):

- Web manifest is generated from `src/app/manifest.ts`
- App icons are generated from `src/app/icon.tsx` and `src/app/apple-icon.tsx`
- Service worker is served from `public/sw.js` and registered by `components/PwaRegister.tsx`

To install on mobile:

- Open the site in Chrome/Edge (Android) and choose **Add to Home screen**
- Open the site in Safari (iOS), tap **Share**, then **Add to Home Screen**

For install prompts and offline caching to work correctly, deploy over HTTPS.

## Deploy to Netlify

This repo includes `netlify.toml` with the Netlify build settings for the Next.js app:

```bash
npm run build
```

Netlify should use `.next` as the publish directory. The project also includes `.nvmrc`
to build with Node.js 22.

Before deploying, add these environment variables in Netlify:

- `GEMINI_API_KEY`
- `DATABASE_URL`
- `JWT_SECRET`

Optional model and fallback variables are listed in `.env.example`. Keep `.env.local`
only for local development; Netlify does not read it during hosted builds.

## Core Paths

- `src/app/page.tsx` - Home screen
- `src/app/scan/page.tsx` - Camera scan and AI processing flow
- `src/app/api/analyze/route.ts` - Gemini vision analysis endpoint
-- `src/app/api/pantry/route.ts` - Pantry read/write endpoint (Drizzle + Neon Postgres)
