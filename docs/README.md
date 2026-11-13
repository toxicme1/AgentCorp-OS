# AdForge Local

AdForge is a native Node.js local app for managing product campaigns, AI provider settings, compliance checks, and ad generation. It uses JSON files under `data/` and writes generated SVG ads and copy to `output/`. It does not use n8n, a database, authentication, Redis, or cloud hosting.

## Requirements and startup

- Node.js 20+
- Optional AI provider keys in `.env`

```sh
cp .env.example .env
npm start
```

The server listens on `http://localhost:3000`. To run tests use `npm test`. No third-party npm packages are required.

## First campaign

Create a product, then a campaign for its returned product ID, then start the campaign:

```sh
curl -sS -X POST http://localhost:3000/adforge/product \
  -H 'Content-Type: application/json' \
  -d '{"title":"Wireless Earbuds","price":49.99,"description":"Wireless earbuds with charging case","targetPlatforms":["Instagram"],"languages":["English"]}'
```

Create/start a campaign with the product ID returned above:

```sh
curl -sS -X POST http://localhost:3000/adforge/campaign \
  -H 'Content-Type: application/json' \
  -d '{"productId":"<product-id>","name":"Holiday launch"}'

curl -sS -X POST http://localhost:3000/adforge/campaign/<campaign-id>/start
```

Generated files are stored in `output/<campaign-id>/<product-id>/images/` and `copy/`. Campaign results and metadata are available from the API.

## API routes

- `GET /health`, `GET /adforge/status`
- `GET /adforge/providers`, `POST /adforge/providers/:id/test`, `GET /adforge/models?provider=<id>`
- `GET /adforge/agents`, `PATCH /adforge/agents/:id/model`
- `GET /adforge/products`, `POST /adforge/product`, `POST /adforge/products/import`
- `GET /adforge/campaigns`, `POST /adforge/campaign`, `POST /adforge/campaign/:id/start`
- `GET /adforge/ads`, `/adforge/assets`, `/adforge/effects`, `/adforge/platforms`
- `GET /adforge/research/:productId`, `GET /adforge/files/<output-relative-path>`
- `POST /adforge/approval`, `POST /adforge/approval/:id/approve`, `POST /adforge/approval/:id/reject`
- `PATCH /adforge/settings/languages`, `PATCH /adforge/settings/providers`
- `POST /adforge/ai/chat`

## AI providers

Set keys for the providers you have enabled in `.env`. Keys are read from the process environment and are never saved to JSON. Routes are available to inspect providers/models, test connectivity, and assign a provider/model to an agent. The ad pipeline itself has a deterministic offline mode and does not send seller data to any provider unless an AI request is explicitly made through the router.

## Data and safety

The app creates the JSON data files on first start. The campaign renderer produces 50 ad variants per product and language using deterministic offline copy templates, and renders SVGs for selected platform presets. Offline localization currently supports English, Spanish, French, Swahili, and Arabic. The `data/` and `output/` contents are ignored by Git. This is a local development MVP; the HTTP API is unauthenticated and should only be exposed on a trusted local machine.
