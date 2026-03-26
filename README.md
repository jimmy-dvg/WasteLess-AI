# Wastless AI

Mobile-first Next.js app for food scanning and waste reduction.

## Requirements

- Node.js 20+
- Gemini API key

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` in the project root:

```bash
GEMINI_API_KEY=your_key_here
```

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
