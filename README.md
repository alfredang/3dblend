# 3DBlend — AI‑generated, 3D‑printable models from a chat

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js) ![React](https://img.shields.io/badge/React-19-61dafb?logo=react) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql) ![Prisma](https://img.shields.io/badge/Prisma-6-2d3748?logo=prisma) ![DeepSeek](https://img.shields.io/badge/LLM-DeepSeek%20V4.1%20Flash-4b5cff) ![Manifold](https://img.shields.io/badge/Geometry-Manifold%20(WASM)-19d3c5) ![Docker](https://img.shields.io/badge/Deploy-Coolify%20%2F%20Docker-2496ed?logo=docker)

Describe an object in the chat, get back a **watertight, printable STL** plus a **Blender Python script** that rebuilds it with native primitives and booleans. Preview it in 3D, refine it in conversation, publish it to a gallery with likes and social sharing, and download it. Credit‑based plans: Free (10 credits), Starter (100/month), Pro (1000/month); a new model costs 5 credits, each edit 1 (Free = one model plus five edits, text only).

Inspired by Meshy AI and Tripo AI, built for Blender users and FDM printers.

## Live Demo

**https://3dblend.tertiaryinfotech.com** — hosted on Hostinger via Coolify. Every push to `main` is deployed automatically through a GitHub webhook.

![3DBlend — home screen](screenshot.png)

## Features

- **Chat‑to‑STL studio** — large multi‑line composer (Enter for a new line, ⌘/Ctrl+Enter to send) with streaming status while the agent designs, builds, checks, repairs and optimises the model; every version is kept and switchable.
- **Edit mode (Tinkercad‑style)** — in the studio, "Edit shapes" lets you drop boxes, cylinders, spheres, cones, rings and wedges onto the current model, move/rotate/scale them with gizmos or numeric fields, mark each as solid or hole, and apply: the shapes are merged into the model's spec and rebuilt by the exact kernel as a new version (free, no credits). Solids are trimmed at the bed plane; the result stays parametric so the agent can keep editing it.
- **Modify existing models** (Starter/Pro) — upload an STL or 3MF and it becomes `{op:"mesh"}` in the agent's spec: a watertight base solid (via Manifold) the agent can cut, extend, scale or move; upload a 3DBlend Blender script and its embedded spec is restored for further editing.
- **Reference images and PDFs** (Starter/Pro) — attach a photo, sketch or drawing with the **+** button; DeepSeek V4.1 Flash sees the image (PDFs are rendered server‑side and their text extracted) and reproduces the silhouette, proportions and labelled dimensions as a printable solid.
- **Brief enrichment** — short requests are first expanded by the agent into a precise design brief (explicit dimensions, fits, features, bed orientation); the assumptions it made are shown to the user and the brief is stored with the model.
- **Print optimisation pass** — when a build passes but carries warnings (overhangs, thin walls, flat ceilings, loose pieces) the harness asks the agent for a print‑friendlier version and keeps whichever scores better.
- **Native agent harness** (`src/agent/`) — DeepSeek V4.1 Flash emits a tiny JSON CSG language; a deterministic kernel builds it; printability checks feed errors back for automatic repair. Runs from the CLI too.
- **Exact geometry** — [Manifold](https://github.com/elalish/manifold) (WASM) booleans always produce watertight 2‑manifolds. Models are auto‑seated on the bed (min Z = 0, centred).
- **Printer‑aware DFM checks** — pick a printer (generic, Bambu Lab A1 mini / A1 / P1S / X1C, Prusa, Ender, large format), nozzle and material (PLA, PETG, ABS, TPU). The agent designs for that bed and nozzle, and the report covers build‑volume fit, bed contact, overhangs, flat ceilings/bridges, a **ray‑cast local wall‑thickness map** (BVH sampling, corner‑artefact filtered), shell count, a recommended layer height, material‑specific tips, and filament/time estimates.
- **3MF export** — on‑demand `.3mf` (units, indexed mesh, metadata) for Bambu Studio, PrusaSlicer and Cura, derived from the stored STL and cached.
- **Blender‑friendly export** — a `.blender.py` per model that recreates the design with `bmesh` primitives, EXACT booleans, arrays and mirrors, in millimetres, sitting on the build plate.
- **3D viewer** — React Three Fiber, orbit/zoom, auto‑rotate, grid and contact shadows.
- **FAQ and contact footer** — credits per generation, formats, printers, licensing; contact details come from `src/lib/site.ts`.
- **Light and dark themes** — toggle in the navbar, remembered per browser, defaults to the OS preference; the viewer background and grid follow the theme.
- **Gallery & social** — auto‑rotating 3D cards, publish/unpublish, thumbs‑up, view & download counters, share to X / Facebook / LinkedIn / WhatsApp / Reddit, copy link, Web Share API, *Remix in studio*.
- **Verified, spam‑resistant sign‑up** — every new account must click an emailed verification link before logging in (24 h token, resend, admin override); sign‑up is protected by invisible Cloudflare Turnstile (interaction‑only mode), a honeypot field and per‑IP rate limits. Verification requires SMTP; Turnstile keys live in Admin → Integrations.
- **Accounts & credits** — email/password auth (Auth.js), atomic credit deduction, refunds on failure, monthly top‑ups; the navbar **Dashboard** button opens the account page (or the admin backend for admins).
- **HitPay subscriptions** — Starter/Pro checkout on HitPay's hosted page (cards, PayNow and more); activation is verified against HitPay's API, every charge auto‑generates a numbered invoice (PDF download from the account page) and resets credits; users can cancel anytime and keep access until the paid period ends; a daily reconciliation keeps subscriptions in sync even if a webhook is missed.
- **Remix attribution** — remixing a gallery model records the original (`remixOfId`) and a "Title by Author" snapshot that every later version inherits; shown on the share page, in the studio, on gallery cards and inside the 3MF metadata (CC BY 4.0).
- **Visibility by plan** — Free‑plan models are always public in the gallery; Starter and Pro models are private until the owner publishes them (`defaultVisibility` / `canMakePrivate` in `src/lib/plans.ts`).
- **Admin backend** — `/admin` (users flagged `isAdmin`): overview KPIs, all users with search and pagination (plan, credit top‑ups, grant/revoke admin), every subscription and invoice (sync, cancel, PDF), gallery moderation (feature, hide, delete), and an **Integrations** tab: DeepSeek API, HitPay keys, SMTP, each with a test button, plus editable transactional email templates (welcome, subscription activated, invoice with PDF, cancellation). Settings saved there override the environment and secrets are encrypted at rest.
- **Sample content** — seven featured models (one built from a deliberately detailed brief as a prompting example) (phone stand, honeycomb pencil cup, planter, headphone hook, spur gear, twisted vase) are built by the real kernel on first run.

## Architecture

```
┌────────────┐   SSE    ┌──────────────────────┐    OpenAI-compatible    ┌───────────────────┐
│  Next.js   │ ◄──────► │  /api/chat (harness) │ ──────────────────────► │ DeepSeek V4.1     │
│  App Router│          │  validate → build →   │ ◄────── JSON spec ───── │ Flash             │
│  R3F viewer│          │  check → repair loop  │                         └───────────────────┘
└─────┬──────┘          └──────────┬───────────┘
      │ Prisma                     │ Manifold (WASM)  →  binary STL + Blender .py
      ▼                            ▼
┌────────────┐          ┌──────────────────────┐
│ PostgreSQL │          │  STORAGE_DIR volume   │
└────────────┘          └──────────────────────┘
```

### The agent harness

```
user idea (+ image / PDF, printer, nozzle, material)
      │
      ▼
   LLM ─► { message, spec } ─► zod validation ─► Manifold build ─► DFM checks ─► OK? ──► optimise pass ─► STL / 3MF / .py
    ▲                                 │                 │              │                 (kept only if the
    └──────── repair prompt with the exact errors ◄─────┴──────────────┘                  print score improves)
                                                                 (max 4 attempts)
```

The model never touches geometry directly. It writes a declarative **spec** in a ~20‑op CSG DSL (`cube`, `cylinder`, `sphere`, `cone`, `torus`, `roundedBox`, `extrude`, `revolve`, `union`, `difference`, `intersection`, `hull`, `translate`, `rotate`, `scale`, `mirror`, `repeat`, `radial`, `ref`/`parts`). The harness owns every side effect, which keeps generation deterministic, cheap (one LLM call per attempt, ~3 s), replayable, and safe to expose publicly.

Key files:

| File | Purpose |
| --- | --- |
| `src/agent/spec.ts` | DSL schema (zod) and semantic validation (refs, cycles, size limits) |
| `src/agent/kernel.ts` | Manifold builder → positions/indices, volume, bbox, genus, shells |
| `src/agent/checks.ts` | DFM analysis: fit, overhangs, bridges, thin walls, layer height, material tips |
| `src/agent/thickness.ts` | Local wall‑thickness map via BVH ray casting (three-mesh-bvh) |
| `src/lib/printers.ts` | Printer / nozzle / material presets |
| `src/components/PrintSetup.tsx` | Printer / nozzle / material selector (persisted per browser) |
| `src/app/api/messages/[id]/image` | Serves a message's reference image (owner only) |
| `src/agent/stl.ts` | Binary STL writer + parser |
| `src/agent/threemf.ts` | 3MF (zip + XML) writer |
| `src/agent/blender.ts` | Spec → self‑contained `bpy` script |
| `src/agent/llm.ts` | DeepSeek client (OpenAI SDK, non‑thinking mode, JSON output) |
| `src/agent/harness.ts` | The generate → validate → build → check → repair → optimise loop (text + image input) |
| `src/lib/editor.ts` / `src/components/ShapeEditor.tsx` | Manual shape editor model and the 3D edit‑mode UI (TransformControls gizmos) |
| `src/lib/security.ts` | Turnstile verification, honeypot, in‑memory rate limiter |
| `src/lib/verification.ts` | Email verification tokens and sending |
| `src/lib/settings.ts` | DB‑backed integration settings with env fallback and AES‑GCM‑encrypted secrets |
| `src/lib/email.ts` | SMTP sending (nodemailer) and editable `{{variable}}` templates |
| `src/lib/attachments.ts` | Attachments: images, PDF text + first‑page render, STL/3MF import, Blender‑script spec recovery |
| `src/agent/meshio.ts` | STL (ASCII/binary) and 3MF parsers, spec extraction from exported Blender scripts |
| `src/agent/prompts.ts` | System prompt with the DSL reference and FDM design rules |
| `scripts/agent-cli.ts` | `npm run agent -- "a hex pencil cup"` → `out/*.stl`, `*.blender.py`, `*.spec.json` |

> **Why non‑thinking mode?** DeepSeek V4.x in thinking mode spends its entire token budget reasoning about geometry and returns empty content for anything non‑trivial. The harness supplies the verification loop instead, and direct mode answers in ~3 s. Set `DEEPSEEK_THINKING=1` to opt back in.

## Quick start (local)

```bash
git clone https://github.com/alfredang/3dblend.git && cd 3dblend
npm install
cp .env.example .env            # fill DEEPSEEK_API_KEY, DATABASE_URL, AUTH_SECRET
docker run -d --name 3dblend-pg -e POSTGRES_USER=blend -e POSTGRES_PASSWORD=blend -e POSTGRES_DB=blend -p 5544:5432 postgres:16-alpine
npm run db:push                 # create tables
npm run db:seed                 # demo users + 6 featured models (optional; also happens on first page view)
npm run dev                     # http://localhost:3000
```

Demo login: `demo@3dblend.app` / `demo1234` (Pro plan, 1000 credits). With `SEED_ADMIN_PASSWORD` / `SEED_TEST_PASSWORD` set, `admin@3dblend.app` and `test@3dblend.app` are also available (passwords from the env).

Try the harness without the web app:

```bash
npm run agent -- "a desk phone stand for a 75mm wide phone, angled 65 degrees, with a cable slot"
# → out/phone-stand.stl, out/phone-stand.blender.py, out/phone-stand.spec.json
```

## Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | ✅ | DeepSeek API key |
| `DEEPSEEK_BASE_URL` | | default `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | | default `deepseek-flash` (= DeepSeek‑V4.1‑Flash) |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `AUTH_SECRET` | ✅ | `openssl rand -base64 32` |
| `NEXT_PUBLIC_APP_URL` / `NEXTAUTH_URL` | ✅ | public URL (share links, HitPay redirect and webhook URLs, email links) |
| `STORAGE_DIR` | | where STL / .py files live (`/data/storage` in Docker, mount a volume) |
| `HITPAY_API_KEY`, `HITPAY_SALT`, `HITPAY_WEBHOOK_SALT`, `HITPAY_SANDBOX`, `HITPAY_CURRENCY` | | enable paid upgrades via HitPay recurring billing (sandbox with `HITPAY_SANDBOX=1`); without a key the UI shows “Coming soon” |
| `CRON_SECRET` | | protects `GET /api/cron/reset-credits` (monthly top‑ups) |
| `SEED_ON_BOOT` | | `0` disables auto‑seeding of sample models |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `REQUIRE_EMAIL_VERIFICATION` | | sign‑up bot protection and verification toggle (also editable in Admin → Integrations) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_NAME`, `SMTP_FROM_EMAIL`, `SMTP_REPLY_TO` | | transactional email; all of these (and the AI / HitPay keys) can instead be set in Admin → Integrations |
| `SEED_ADMIN_PASSWORD`, `SEED_TEST_PASSWORD` | | when set, `admin@3dblend.app` (admin, Pro) and `test@3dblend.app` (Free) are created/updated on boot |

## Deploy on Hostinger with Coolify (CI/CD)

The production instance was created through the Coolify API; the same steps work from the UI:

1. **New Resource → Public Repository**, URL `https://github.com/alfredang/3dblend`, branch `main`, build pack **Docker Compose**, compose file `/docker-compose.yml`. Coolify builds the multi‑stage `Dockerfile` (Next.js standalone output) and brings up the bundled PostgreSQL 16 service with persistent `pgdata` and `storage` volumes.
2. Set the environment variables above in the resource's *Environment* tab (`POSTGRES_PASSWORD`, `DEEPSEEK_API_KEY`, `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`). Coolify pre‑creates the keys from the compose file.
3. Domain for the `web` service: `https://3dblend.tertiaryinfotech.com:3000` (the `:3000` tells the Traefik proxy which container port to route to; the service is not published on the host). Coolify provisions TLS.
4. **CI/CD webhook**: in the GitHub repo, *Settings → Webhooks → Add*, payload URL `https://<coolify-host>/webhooks/source/github/events/manual`, content type `application/json`, secret = the application's *Manual webhook secret* (Coolify → app → Webhooks), event *push*. With *Auto Deploy* enabled, every push to `main` redeploys. Manual trigger: `POST /api/v1/deploy?uuid=<app-uuid>` with a Coolify API token.
5. On every boot the entrypoint runs `prisma db push` so the schema is always in sync; sample models are seeded on the first page view.
6. Optional: a Coolify *Scheduled Task* that runs daily:
   `curl -fsS -H "x-cron-secret: $CRON_SECRET" https://3dblend.tertiaryinfotech.com/api/cron/reset-credits`
7. SMTP for transactional email can be set in Admin → Integrations (or via the `SMTP_*` variables); use the test buttons there to verify DeepSeek, HitPay and SMTP after deploying.

Local run of the same stack: `docker compose -f docker-compose.yml -f docker-compose.local.yml up --build` (the override publishes port 3000).

Health check: `GET /api/health`.

## API overview

| Route | Method | Description |
| --- | --- | --- |
| `/api/register` | POST | create account (10 free credits); Turnstile + honeypot + rate limit; sends the verification email |
| `/api/auth/verify`, `/api/auth/resend` | GET / POST | consume a verification link / resend it |
| `/api/auth/*` | | Auth.js credentials provider |
| `/api/projects` | GET / POST | list / create chat projects |
| `/api/chat` | POST (SSE) | run the agent for a project with `{ message, setup, attachment? }`; events `status`, `message`, `model`, `credits`, `error` |
| `/api/messages/:id/image`, `/api/messages/:id/attachment` | GET | reference image / original upload for a chat message (owner only) |
| `/api/models/:id/stl` | GET | binary STL (`?download=1` counts a download) |
| `/api/models/:id/3mf` | GET | 3MF package (`?download=1` counts a download) |
| `/api/models/:id/blender` | GET | Blender Python script |
| `/api/models/:id/like` | POST | toggle thumbs‑up |
| `/api/models/:id/publish` | POST | toggle gallery visibility, edit title/description |
| `/api/models/:id/remix` | POST | copy a public model into a new project of yours |
| `/api/models/:id/edit` | POST | manual shape edit: merge `{ shapes[] }` into the spec, rebuild, save as a new version |
| `/api/billing/checkout` | POST | create a HitPay recurring billing for `STARTER` / `PRO`, returns the hosted checkout URL |
| `/api/billing/return` | GET | HitPay redirect target; re-verifies the subscription with HitPay's API |
| `/api/billing/webhook` | POST | HitPay callbacks (event webhooks with `Hitpay-Signature`, or legacy `hmac` form callbacks) |
| `/api/billing/cancel`, `/api/billing/sync` | POST | cancel at HitPay / re-check status |
| `/api/invoices/:id/pdf` | GET | invoice PDF (owner or admin) |
| `/api/admin/users`, `/api/admin/models`, `/api/admin/subscriptions` | PATCH/DELETE | admin actions |
| `/api/admin/settings`, `/api/admin/settings/test`, `/api/admin/email-templates`, `/api/admin/email-templates/test` | GET/PUT/POST | integrations and email templates |
| `/api/cron/reset-credits` | GET | monthly credit top‑up (secret header) |
| `/api/health` | GET | DB connectivity |

## Data model

`User` (plan, credits, isAdmin) → `Subscription` (HitPay recurring billing, status lifecycle) → `Invoice` (numbered, one per charge); `User` → `Project` → `Message` (role, content, optional `modelId`, optional reference `imagePath` / `attachmentPath` / extracted `attachmentText`) and `Model` (spec JSON, stats JSON, `stlPath`, `blenderPath`, `isPublic`, `featured`, counters) with `Like` (user × model) and `CreditTransaction` (audit log).

## Tech stack

Next.js 16 (App Router, standalone output) · React 19 · TypeScript · Tailwind CSS 4 · Prisma 6 + PostgreSQL 16 · Auth.js v5 · OpenAI SDK → DeepSeek V4.1 Flash (text + vision) · manifold‑3d (WASM) · three.js / @react‑three/fiber / drei · three‑mesh‑bvh · pdfjs‑dist + @napi‑rs/canvas · pdf‑lib · fflate · HitPay · Docker / Coolify.

## Acknowledgements

- [Manifold](https://github.com/elalish/manifold) — the exact mesh boolean kernel that makes watertight output possible.
- [Blender](https://www.blender.org/) — the `.blender.py` exporter targets Blender 3.6+.
- [Meshy AI](https://www.meshy.ai/) and [Tripo AI](https://www.tripo3d.ai/) — product inspiration for the studio / gallery experience.
- [DeepSeek](https://www.deepseek.com/) — V4.1 Flash powers the design agent.

## License

MIT © Alfred Ang. Gallery models are shared by their authors under CC BY 4.0 unless stated otherwise.
