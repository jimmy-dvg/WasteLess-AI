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

## Core Paths

- `src/app/page.tsx` - Home screen
- `src/app/scan/page.tsx` - Camera scan and AI processing flow
- `src/app/api/analyze/route.ts` - Gemini vision analysis endpoint
- `src/app/api/pantry/route.ts` - Supabase-backed pantry read/write endpoint
