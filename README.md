# Magic Mirror 26

Next.js (App Router) + TypeScript webapp voor een multitenant Magic Mirror platform.

## Huidige status

Het product is functioneel als eerste release:

- Inloggen met e-mail + 6-cijferige code via SMTP
- Multi-tenant op huishoudens (gezin) met rollen `OWNER`/`MEMBER`
- Spiegel koppelen via QR claim-flow (telefoon scant QR op scherm)
- Realtime updates via WebSocket (`/ws`) voor:
  - nieuwe timers
  - modulewijzigingen
  - spiegelinstellingen (contrast, raster, raster-rijen)
- Web push notificaties als timer klaar is (optioneel)
- 1 dashboard app voor mobiel en desktop (responsive navigatie)
- Prisma migraties + SQLite

## Functionaliteit

### Dashboard

- `Spiegels`: overzicht in tegels, beheren per spiegel, scherm koppelen via QR scan
- `Timers`: mobiele timerbediening met presets + live lopende timers
  - optioneel pushmeldingen aan/uit per gebruiker/browser
- `Gezin`: gezinsnaam beheren, leden toevoegen/wijzigen/verwijderen
- `Integraties`: globale (`.env`) en gezinsspecifieke koppelingen
- Avatar-menu: profiel, uitloggen

### Spiegelmodules

- `Klok`
  - 12/24 uur
  - seconden aan/uit
  - datum boven tijd aan/uit
  - schaalbaar lettertype
- `Weer`
  - actuele temperatuur + groot icoon
  - forecast (3/5/7 dagen)
- `Timers`
  - `focus` (fullscreen bij actieve timer) of `list`
  - meerdere timers tegelijk zichtbaar
- `Agenda` (iCloud CalDAV)
  - titel optioneel
  - kalenderfilter
  - dagen vooruit, max zichtbaar, locatie aan/uit
- `Aandacht`
  - vrije items met doeldatum
  - automatisch "dagen tot/geleden"
  - `active` vlag per item
- `Todoist`
  - open taken uit project (of zonder projectfilter)
  - titel optioneel
  - max zichtbaar
  - poll-interval

### Spiegelweergave

- `high contrast` monochroom modus
- uitlijnraster aan/uit
- raster-rijen schakelbaar (12..24)
- timer melding via browser TTS (`nl-NL`)
- timer melding kan ook server-side als MP3 voorbereid worden via `Piper` + `ffmpeg`

## Belangrijke routes

- `/login` inloggen
- `/dashboard` redirect naar `/dashboard/mirrors`
- `/dashboard/mirrors` spiegeloverzicht
- `/dashboard/mirrors/[mirrorId]` spiegel beheren
- `/dashboard/mobile` timerbediening
- `/dashboard/family` gezinsbeheer
- `/dashboard/integrations` integratie-overzicht
- `/dashboard/integrations/[integrationId]` integratie details
- `/dashboard/pair/scan` QR scanner op telefoon
- `/dashboard/pair` afronden van claim-flow
- `/mirror` kiosk entry:
  - met `localStorage mm_mirror_id` -> `/mirror/[mirrorId]`
  - zonder id -> `/mirror/register`
- `/mirror/register` QR tonen en wachten op claim
- `/mirror/[mirrorId]` spiegelweergave
- `/m` compacte timerpagina

## Refresh en cache gedrag

- Weer:
  - server-memory cache
  - huidig weer TTL: `900s` (15 min)
  - forecast TTL: `86400s` (24 uur)
  - mirror client pollt `/api/mirrors/[mirrorId]/weather` elke 60s
  - polling draait alleen na actieve WS subscribe van die spiegel
- iCloud agenda:
  - server-memory cache per huishouden/config
  - TTL: `CALENDAR_CACHE_SECONDS` (min 30, standaard 300)
- Todoist:
  - server-memory cache per huishouden/config
  - TTL: `TODOIST_CACHE_SECONDS` (min 15, vaak 60..3600)
  - mirror client pollt `/api/mirrors/[mirrorId]/todoist` met module `pollSeconds` (10..3600)
  - polling draait alleen na actieve WS subscribe van die spiegel
- Timers:
  - background sweep worker op server (`TIMER_COMPLETION_SWEEP_MS`, standaard 5000ms)
  - zet verlopen timers op `COMPLETED`
  - verstuurt optioneel web push naar de gebruiker die de timer heeft gezet

Opmerking:
- Agenda wordt als snapshot bij page render opgehaald.
- Weather en Todoist worden tijdens runtime actief gepolld.

## Integratiestrategie

- Globaal via `.env`:
  - SMTP
  - OpenWeather API key
  - fallback voor iCloud/Todoist
- Gezinsspecifiek (aanbevolen):
  - iCloud credentials + cache
  - Todoist token/project + cache
  - opgeslagen in DB, secrets encrypted (`INTEGRATIONS_ENCRYPTION_KEY`)

Je kunt integraties kopieren via klembord:

- Export: knop `Kopieer integraties`
- Import: plak JSON op de integratiespagina

Per spiegel kun je ook module/layout instellingen kopieren/importeren:

- Export: knop `Kopieer settings`
- Import: plak JSON op de spiegelbeheer pagina

## Tech stack

- Next.js 16 (App Router)
- React 19 + TypeScript
- Prisma 6 + SQLite
- `ws` WebSocket server (custom `server.ts`)
- Nodemailer (SMTP)
- iCloud CalDAV
- Todoist API v1 (`@doist/todoist-api-typescript`)

## Lokaal starten

1. Installeer dependencies:

```bash
npm install
```

2. Maak `.env`:

```bash
cp .env.example .env
```

Voor web push in productie: genereer VAPID keys en zet ze in `.env`:

```bash
npm run push:vapid
```

Let op: browser push werkt op `https` (of `localhost` in development).

3. Genereer Prisma client:

```bash
npm run prisma:generate
```

4. Draai migraties:

```bash
npm run prisma:migrate
```

5. Start in development:

```bash
npm run dev
```

6. Open:

- http://localhost:3000

## Productie (Docker)

`Dockerfile` bouwt de app en start met:

```bash
npx prisma migrate deploy && npm run start
```

Daarmee worden migraties automatisch toegepast bij container start.

### Standaard compose

```bash
docker compose up --build -d
```

- poort `3000`
- lokale volume mount `./data:/app/data`

### Portainer / eigen server (`docker-compose-dos.yml`)

- gebruikt named volume `app_data` voor persistente SQLite data
- zet minimaal deze env vars in je stack:
  - `APP_URL`
  - `AUTH_CODE_SECRET`
  - `INTEGRATIONS_ENCRYPTION_KEY`
  - SMTP vars (`SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, optioneel auth/tls)
  - `OPENWEATHER_API_KEY`

## Environment variabelen

Zie `.env.example`. Belangrijk:

- `DATABASE_URL` (default lokaal: `file:./dev.db`)
- `APP_URL` (basis URL voor links/QR fallback)
- `AUTH_CODE_SECRET`
- `INTEGRATIONS_ENCRYPTION_KEY`
- `COOKIE_SECURE` (`false` op HTTP, `true` op HTTPS)
- Web push:
  - `WEB_PUSH_VAPID_PUBLIC_KEY`
  - `WEB_PUSH_VAPID_PRIVATE_KEY`
  - `WEB_PUSH_VAPID_SUBJECT`
  - `TIMER_COMPLETION_SWEEP_MS`
- SMTP:
  - `SMTP_HOST`
  - `SMTP_PORT`
  - `SMTP_SECURE`
  - `SMTP_IGNORE_TLS`
  - `SMTP_TLS_REJECT_UNAUTHORIZED`
  - `SMTP_USER`
  - `SMTP_PASS`
  - `SMTP_FROM`
- Integratie defaults/fallback:
  - `OPENWEATHER_API_KEY`
  - `ICLOUD_CALDAV_URL`, `ICLOUD_CALDAV_USERNAME`, `ICLOUD_CALDAV_PASSWORD`
  - `CALENDAR_CACHE_SECONDS`
  - `TODOIST_API_TOKEN`, `TODOIST_PROJECT_ID`, `TODOIST_CACHE_SECONDS`

## Prisma modellen

- `User`
- `Household`
- `HouseholdMember`
- `HouseholdIntegrationSettings`
- `Mirror`
- `MirrorModule`
- `Timer`
- `MirrorPairingCode`
- `MirrorClaimSession`
- `VerificationCode`
- `Session`
- `PushSubscription`

## Troubleshooting

### Todoist `V1_ID_CANNOT_BE_USED` / 400

Project ID is verouderd voor API v1. Gebruik een nieuwe v1 project id.
De app probeert fallback zonder projectfilter zodat taken zichtbaar blijven.

### Todoist 410 op oude endpoints

Gebruik API v1 flows (de app gebruikt `@doist/todoist-api-typescript`).
Deprecated endpoints geven 410.

### Login mail komt niet aan

Controleer SMTP host/poort/tls instellingen.
In development geeft de app debug info terug bij SMTP fouten.

### Spiegel blijft op register/claim hangen

Controleer:

- `APP_URL` klopt op productie domein
- mirror kan `/ws` bereiken
- database persistent is (volume op `/app/data`)
