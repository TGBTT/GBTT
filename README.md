# Golden Bay Team Training (GBTT)

React website for Tom’s group fitness classes at Rec Park Centre, Tākaka — plus **Member booking** and **Trainer admin** apps.

**Fit for Life** · `#FITFORLIFE`

## Develop

```bash
npm install
npm run icons
npm run dev
```

Member & trainer apps:

```bash
cd apps
npm install
npm run dev
```

## Build

```bash
npm run build:all
```

Production site: `https://gbtt.co.nz` (custom domain via `public/CNAME`).

## Contact backend

See [`google-apps-script/README.md`](google-apps-script/README.md). Set `VITE_FORM_ENDPOINT` when the web app is deployed.

## Docs

- [`docs/secrets-setup.md`](docs/secrets-setup.md) — Firebase, GitHub Secrets, Apps Script handoff
- [`docs/integrations.md`](docs/integrations.md) — Firebase + Calendar integration
- [`docs/feature-roadmap.md`](docs/feature-roadmap.md)
