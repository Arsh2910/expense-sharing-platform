# SplitCircle Frontend

Web client for the Expense Sharing Platform built with React, TypeScript, Vite, Tailwind CSS, TanStack Query, React Router, and React Hook Form + Zod.

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables (optional in local dev):
   ```bash
   cp .env.example .env
   ```
   - Leave `VITE_API_BASE_URL` empty in local development to use the built-in Vite proxy (`/api` and `/health` -> `http://localhost:5000`). This keeps `HttpOnly` authentication cookies same-origin during development.
   - The Vercel build uses relative `/api` URLs and forwards them to Render. For a separate-host build, an explicit `VITE_API_BASE_URL` requires credentialed CORS and browsers that allow the API cookies. See [Vercel configuration](../docs/deployment.md#vercel-configuration).

3. Start the development server:
   ```bash
   npm run dev
   ```

## Scripts

- `npm run dev` — Start Vite dev server on `http://localhost:5173`
- `npm run build` — Run `tsc -b` typechecking and production `vite build`
- `npm run lint` — Run `oxlint`
- `npm run preview` — Serve the built frontend at `http://127.0.0.1:5183`. Keep the local API running on port 5000 and build with an empty `VITE_API_BASE_URL`.
