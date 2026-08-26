# GBTT Apps Script web endpoint

Contact enquiries and member activation emails. Calendar booking and Firebase client trees are **not** implemented here yet.

## Deploy

1. Create a Google Sheet (tabs `Submissions` and `Activations` are created automatically).
2. Extensions → Apps Script → paste [`Code.gs`](Code.gs).
3. Set `NOTIFY_EMAIL` (default `Tom.GBTT@gmail.com`).
4. Project settings → **Script properties** → add `ACTIVATION_KEY` (same value as site env `VITE_ACTIVATION_KEY`).
5. Deploy → Web app → Execute as **Me**, access **Anyone**.
6. Put the web app URL in env for marketing site and sim-demos:

```bash
VITE_FORM_ENDPOINT=https://script.google.com/macros/s/YOUR_ID/exec
VITE_ACTIVATION_KEY=your-secret-key
```

Until the endpoint is set, the contact form falls back to `mailto:` and member signup shows the demo activation key in the UI.

## Actions

| action | Purpose |
|--------|---------|
| `enquiry` | Contact form → sheet + email Tom |
| `activation` | New member signup → email user the activation key + log row |
