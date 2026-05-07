# Wastless AI

Mobile-first Next.js app for food scanning and waste reduction.

## Requirements

- Node.js 20+
- Gemini API key
- Supabase project URL and publishable key

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` in the project root:

```bash
GEMINI_API_KEY=your_key_here
GEMINI_MODELS=gemini-2.5-flash,gemini-2.5-flash-latest,gemini-2.0-flash,gemini-2.0-flash-lite,gemini-1.5-flash-latest,gemini-1.5-flash,gemini-1.5-flash-8b-latest,gemini-1.5-flash-8b
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your_publishable_key_here
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

## Core Paths

- `src/app/page.tsx` - Home screen
- `src/app/scan/page.tsx` - Camera scan and AI processing flow
- `src/app/api/analyze/route.ts` - Gemini vision analysis endpoint
- `src/app/api/pantry/route.ts` - Supabase-backed pantry read/write endpoint
