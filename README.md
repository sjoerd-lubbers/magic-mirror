# Magic Mirror 26

Next.js (App Router) + TypeScript basis voor een multitenant Magic Mirror platform.

## Wat zit er in de MVP

- E-mail + code login (`/login`) via SMTP
- Multi-tenant model op huishoudens/gezin
- Rollen: `OWNER`, `MEMBER`, plus `PLATFORM_ADMIN` op userniveau
- Spiegel bootflow op `/mirror`: automatisch naar registratie of gekoppelde mirror
- Spiegel koppelen via telefoonflow: QR op spiegel, registratie op telefoon, spiegel schakelt vanzelf door
- Spiegelmodules configureerbaar vanuit dashboard:
  - Klok: 12/24 uur, seconden aan/uit, grootte
  - Weer: huidig weer + meerdaagse forecast (3/5/7 dagen)
  - Timers: max zichtbare timers + weergave modus (`focus` = alleen timer fullscreen)
  - Agenda: iCloud CalDAV (kalenderfilter, dagen vooruit, max zichtbaar, locatie aan/uit)
  - Aandacht: eigen lijst met tellers (dagen sinds/tot)
  - Todoist: open taken uit project (project id, max zichtbaar, poll interval)
  - Layout: positie (`x`,`y`) en afmeting (`w`,`h`) per module
- Light mobiele webapp voor timers (`/m`)
  - Preset knoppen (3, 6, 10, 15, 20, 25, 30, 40, 50, 60 min)
  - Lopende timers live zichtbaar
- Mirror view (`/mirror/[mirrorId]`) met browser TTS bij timer voltooiing
- Realtime timer updates via WebSocket (`/ws`)
- Weercache: huidig weer 15 minuten, forecast 24 uur
- Agendacache: iCloud snapshot standaard 300 seconden
- Prisma schema + migratiebasis met SQLite

## Tech stack

- Next.js 16 (App Router)
- TypeScript
- Prisma + SQLite
- WebSocket via `ws`
- Nodemailer
- iCloud CalDAV (agenda)
- Todoist API (`@doist/todoist-api-typescript`)

## Snel starten (lokaal)

1. Dependencies installeren:

```bash
npm install
```

2. Environment aanmaken:

```bash
cp .env.example .env
```

3. Prisma client genereren:

```bash
npm run prisma:generate
```

4. Migraties draaien:

```bash
npm run prisma:migrate -- --name init
```

5. App starten:

```bash
npm run dev
```

6. Open:
- App: http://localhost:3000

## Todoist troubleshooting

- Zet minimaal `TODOIST_API_TOKEN` in `.env`.
- Voor projectfilter werkt `TODOIST_PROJECT_ID` (en ook de compatibele alias `TODOIST_RECIPES_PROJECT_ID`).
- Krijg je `V1_ID_CANNOT_BE_USED` (error 557), dan is je project-id verouderd voor API v1.
- Tijdelijke fallback: de app toont dan open taken zonder projectfilter.

## SMTP op hosting

- Stel minimaal `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` in.
- Voor externe providers: zet `SMTP_IGNORE_TLS=false`.
- Gebruik `SMTP_SECURE=true` voor implicit TLS (meestal poort 465), anders `false` voor STARTTLS (meestal 587).

## Cookies op hosting

- Draai je zonder HTTPS (alleen `http://`), zet dan `COOKIE_SECURE=false` in `.env`.
- Met HTTPS kun je `COOKIE_SECURE=true` gebruiken.

## Docker (eigen server)

```bash
docker compose up --build
```

Services:
- App: http://localhost:3000

## Belangrijke routes

- `/login`: inloggen met e-mail + code
- `/dashboard`: gezins- en spiegelbeheer
- `/dashboard/pair`: telefoon-pair pagina (claim-flow + legacy fallback)
- `/mirror`: kiosk-entry (redirect naar `/mirror/register` of `/mirror/[mirrorId]`)
- `/mirror/register`: spiegel-koppelpunt met QR en automatische activatie
- `/mirror/[mirrorId]`: spiegelweergave
- `/m`: lichte mobiele timerpagina

## Prisma modeloverzicht

- `User`
- `Household`
- `HouseholdMember`
- `Mirror`
- `MirrorModule`
- `Timer`
- `MirrorPairingCode`
- `MirrorClaimSession`
- `VerificationCode`
- `Session`

## Bekende MVP-beperkingen

- Geen hardening voor publieke mirror URLs (geen device secret token nog)
- Nog geen uitnodigingsflow voor extra gezinsleden
- Timer completion wordt client-side afgehandeld op de mirror (TTS)
- Platform admin UI nog niet uitgewerkt

## Volgende logische stap

1. Invite-flow voor gezinsleden (e-mail invite + roltoekenning)
2. Mirror device auth token toevoegen
3. Timer status terugschrijven (`COMPLETED`) + historie
4. Admin paneel voor tenant beheer
5. Migratiepad naar Postgres voorbereiden
