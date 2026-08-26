# GBTT Apps Script enquiry endpoint

Scaffold for contact form → Google Sheet + email notify. Calendar booking and Firebase client trees are **not** implemented here yet.

## Deploy

1. Create a Google Sheet; ensure a `Submissions` tab (or let the script create headers).
2. Extensions → Apps Script → paste [`Code.gs`](Code.gs).
3. Set `NOTIFY_EMAIL` (default `Tom.GBTT@gmail.com`).
4. Deploy → Web app → Execute as **Me**, access **Anyone**.
5. Put the web app URL in the site env:

```bash
VITE_FORM_ENDPOINT=https://script.google.com/macros/s/YOUR_ID/exec
```

Until that is set, the contact form falls back to `mailto:Tom.GBTT@gmail.com`.
