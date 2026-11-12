# ClearLedger Frontend

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
   - Set `VITE_API_BASE_URL` (e.g. `https://api.example.com`) when deploying independently across origins. If using a separate origin, the backend must enable CORS with `credentials: true` and an explicit origin allowlist.

3. Start the development server:
   ```bash
   npm run dev
   ```

## Scripts

- `npm run dev` — Start Vite dev server on `http://localhost:5173`
- `npm run build` — Run `tsc -b` typechecking and production `vite build`
- `npm run lint` — Run `oxlint`
- `npm run preview` — Preview the production bundle locally
