# PromptForge — AI Image Generation Studio

## Overview
PromptForge is a Midjourney-like AI image generation platform where users can create images from text prompts, reroll generations, create variations (subtle/strong), and upscale results. Uses OpenAI's gpt-image-1 model via Replit AI Integrations. Includes Explore, Organize, Personalize, and Moodboards features.

## Recent Changes
- 2026-02-11: Initial build — full-stack app with real AI image generation
- 2026-02-11: Added Replit Auth (OIDC) with landing page for logged-out users
- 2026-02-11: Added Midjourney-inspired features: Explore, Organize, Personalize, Moodboards
- 2026-02-12: Removed Gallery from Create page; removed Style Creator feature
- Navigation sidebar with all sections: Create, Explore, Organize, Personalize, Moodboards
- Database: jobs, images, image_likes, collections, collection_items, presets, moodboards, moodboard_refs tables

## Architecture
- **Frontend**: React + Vite + TailwindCSS + shadcn/ui
  - Navigation sidebar in App.tsx
  - Pages: studio.tsx (Create), edit.tsx (Edit), explore.tsx (Explore), organize.tsx (Organize), personalize.tsx (Personalize), moodboards-page.tsx (Moodboards), subscription.tsx (Subscription)
  - Landing page for unauthenticated users
- **Backend**: Express API server on port 5000
  - Auth: Replit OIDC (Google, GitHub, Apple, email/password)
  - Generation: POST /api/jobs, GET /api/jobs, reroll, vary, upscale, edit (inpainting via image ID or direct upload/URL)
  - Explore: GET /api/explore, POST /api/images/:id/like, POST /api/images/:id/share
  - Organize: CRUD /api/collections, /api/my-images
  - Presets: CRUD /api/presets
  - Moodboards: CRUD /api/moodboards, /api/moodboards/:id/refs

- **Database**: PostgreSQL via Drizzle ORM
- **AI**: OpenAI gpt-image-1 via Replit AI Integrations (no API key needed)
- **Key files**: `client/src/pages/studio.tsx`, `server/routes.ts`, `server/storage.ts`, `shared/schema.ts`

## User Preferences
- Dark "future glass" aesthetic with Space Grotesk + Inter fonts
- Real AI generation (no mock data)
- Midjourney-inspired feature set
