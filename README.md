# WasteLess AI

Mobile-first Progressive Web App for reducing household food waste. WasteLess AI helps users scan food with AI vision, save pantry items, track storage zones, and generate recipes from ingredients they already have.

Live demo: https://wasteless-ai-jimmy-dvg.netlify.app

## Features

- AI food recognition from uploaded or captured food photos
- Pantry inventory saved per authenticated user
- JWT auth backed by Neon Postgres
- Recipe suggestions from available ingredients
- Shopping list and mobile-first pantry views
- PWA manifest, app icons, and service worker registration
- Bottom navigation and touch-friendly mobile UI

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- lucide-react
- Neon Postgres
- Drizzle ORM
- Google Gemini API
- Netlify deployment

## Getting Started

Install dependencies:

```bash
npm install
```

Create `.env.local` in the project root:

```bash
GEMINI_API_KEY=your_gemini_api_key_here
DATABASE_URL=postgresql://user:password@your-neon-host/neondb?sslmode=require
JWT_SECRET=replace_with_a_long_random_secret
```

Optional model overrides are documented in `.env.example`.

Run the development server:

```bash
npm run dev
```

Open http://localhost:3000.

## Scripts

- `npm run dev` - Start the local Next.js dev server
- `npm run build` - Build for production
- `npm run start` - Start the production build locally
- `npm run lint` - Run ESLint
- `npm run db:generate` - Generate Drizzle migrations
- `npm run db:migrate` - Apply Drizzle migrations
- `npm run db:studio` - Open Drizzle Studio

## Environment Variables

Required:

- `GEMINI_API_KEY` - Gemini API key used by image analysis and recipe routes
- `DATABASE_URL` - Neon Postgres connection string
- `JWT_SECRET` - long random secret used to sign auth tokens

Optional:

- `GEMINI_MODELS`
- `ANALYZE_GEMINI_MODELS`
- `RECIPE_GEMINI_MODELS`
- `RECIPE_ASSISTANT_GEMINI_MODELS`
- `ALLOW_QUOTA_FALLBACK`

Do not commit `.env.local`. Use `.env.example` as the public template.

## Database

The Drizzle schema lives in `src/lib/drizzle-schema.ts`, with migrations in `drizzle/`.

After setting `DATABASE_URL`, run:

```bash
npm run db:migrate
```

The SQL files in `sql/` are kept as reference for earlier schema changes.

## Deployment

This repo includes `netlify.toml` and `.nvmrc` for Netlify:

- Build command: `npm run build`
- Publish directory: `.next`
- Node version: `22`

Set these variables in Netlify before deploying:

- `GEMINI_API_KEY`
- `DATABASE_URL`
- `JWT_SECRET`
- Optional model variables from `.env.example`

Use a Git-connected Netlify deploy or the Netlify Next.js runtime. Do not deploy this app as a plain static drag-and-drop upload, because the Next.js API routes need the generated Netlify server function.

If `/api/auth` returns a 404 HTML page or the login form shows `Unexpected token '<'`, the active Netlify deploy is missing the Next.js server function. Redeploy from source with the Next.js runtime, or restore a deploy that includes `___netlify-server-handler`.

## Project Structure

- `src/app/page.tsx` - Home screen
- `src/app/login/page.tsx` - Login and registration UI
- `src/app/scan/page.tsx` - Camera scan and AI analysis flow
- `src/app/inventory/page.tsx` - Pantry inventory
- `src/app/recipes/page.tsx` - Recipe generation and browsing
- `src/app/api/auth/route.ts` - Auth endpoint
- `src/app/api/analyze/route.ts` - Gemini vision endpoint
- `src/app/api/pantry/route.ts` - Pantry read/write endpoint
- `components/BottomNav.tsx` - Mobile bottom navigation
- `components/PwaRegister.tsx` - Service worker registration

## PWA

The app includes:

- Manifest from `src/app/manifest.ts`
- App icons from `src/app/icon.tsx` and `src/app/apple-icon.tsx`
- Service worker from `public/sw.js`

Deploy over HTTPS for install prompts and offline caching to work correctly.
