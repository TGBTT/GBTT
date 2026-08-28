# GBTT Apps

Member booking (`/fitness/studioflow`) and trainer admin (`/fitness/classboard`) for Golden Bay Team Training.

## Develop

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env` and set Firebase + Apps Script values (see `docs/secrets-setup.md`).

## Build

```bash
npm run build
```

Production base path: `/app/` (`VITE_APP_BASE`).
