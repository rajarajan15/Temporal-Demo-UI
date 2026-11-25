# Card Issuance Console

Web UI for the card issuance backend in `../Temporal`. It issues virtual cards, shows each request's workflow steps live, handles operator reviews, cancellations and reissues, runs reconciliations, and drives the mock services for demos.

The API contract is in [frontend-context.md](frontend-context.md).

## Run

1. Start the backend from the backend repo: `infra\scripts\restart-all.cmd` (or `start-all.cmd` if it's already built).
2. Start the UI:

   ```bash
   npm install
   npm run dev
   ```

3. Open http://localhost:5173.

The backend sends no CORS headers, so the Vite dev server proxies `/v1` to `:8080` and `/mock-admin` to `:8091` (see [vite.config.ts](vite.config.ts)). `npm run build` followed by `npm run preview` uses the same proxy.

To change the Temporal Web UI links, copy `.env.example` to `.env.local` and edit it.

## Screens

| Route | Screen |
|---|---|
| `/:tenant` | Home: decisions waiting, recent requests, and a getting-started checklist |
| `/:tenant/new` | Issue a card: choose the outcome (Approved, Needs review, Rejected, Over the limit), check the summary, and issue |
| `/:tenant/requests` | All requests from this browser, filtered by needs decision, in progress or finished, plus Open by ID |
| `/:tenant/requests/:id` | A plain-language status banner (with Approve/Reject buttons when a decision is needed), live progress, cancel and reissue |
| `/:tenant/reissues/:id` | Reissue progress, plus the status of the replacement card request |
| `/:tenant/reconciliation` | Start an on-demand run, trigger the nightly schedule, list past runs |
| `/:tenant/reconciliation/:runId` | Report with counts and a discrepancy table you can filter |
| `/:tenant/demo` | Simulator: one-click failure scenarios, custom rules, callback modes, processor cards, reset |

The tenant (`bank-a` or `bank-b`, shown as "Bank") is part of the URL, so a link always uses the bank that owns the request.

## In-app guide

- **Guided tour.** It starts on the first visit and walks through the main areas in 12 steps, spotlighting each one. A shorter tour explains the request page the first time one opens. Replay either from the guide.
- **Guide panel.** Open it with the **Guide** button or the <kbd>?</kbd> key. It holds the tours, the getting-started checklist, how-to topics (the one for the current page opens first) with "Try it" links, and a glossary of statuses.
- **Technical details switch.** Request pages start in plain language. Turn the switch on to see step codes, timings, error codes, IDs and Temporal links. The setting is remembered.

Tours are defined in [src/guide/tours.ts](src/guide/tours.ts). Elements are targeted with `data-tour="..."` attributes.

## How it deals with backend gaps

- **No list endpoints.** Every key the UI creates or opens is saved in `localStorage` and refreshed in the background. Requests created elsewhere can be opened by ID, and the Requests page links to the Temporal search for parked requests.
- **Polling only.** Detail pages poll every second until `finished`. They keep polling through 503s and while the backend is unreachable, honouring `Retry-After`, and pause while the tab is hidden.
- **Idempotency.** New requests, reissues and reconciliations get a `crypto.randomUUID()` key. After a 503 or a network error, the same key is kept so that a retry can't create a duplicate. Review and cancel retries after a 503 also reuse their key.
- **Card numbers.** Client-side validation uses the same digit-run rules as the backend's `ApiResponses.java`.

## Tests

```bash
npm test            # unit tests (Vitest): parsing, validation, scenarios, status wording, simulator bookkeeping
npm run test:e2e    # end-to-end scenarios through the UI, against the real backend
npm run test:e2e -- cancel-request reissue-and-guard   # run only some scenarios
```

The end-to-end suite needs the backend and `npm run dev` running. It drives the installed Chrome through `puppeteer-core`; set `CHROME_PATH` if Chrome is elsewhere, and `HEADED=1` to watch it. It resets the mocks before each scenario and saves a screenshot of each final state to `e2e/screenshots/`. It covers the tours, the normal path, KYC review (approve and reject), KYC rejection, over-limit, confirmation timeout, retries exhausted (retry and cancel), activation declined with rollback, failed rollback (manual cleanup), cancellation, reissue and the double-reissue guard, Bank B, simulator state, and reconciliation. A full run takes about 3 minutes, mostly waiting for the backend's 30-second retry window.

## Notes on backend behaviour

- **Request IDs.** The backend applies its card-number guard to `Idempotency-Key` too. About 2% of random UUIDs contain 13 or more dash-separated digits and are rejected as `INVALID_REQUEST`, so `newKey()` draws again until the key is safe. (`frontend-context.md` suggests plain `crypto.randomUUID()`, which hits this.)
- **Double reissue.** The backend issues a second replacement if a card is reissued twice with different keys. The UI hides Reissue on cards it knows were already reissued and points to the replacement instead.
- **Simulator state.** The mock admin can't report which rules are on, so the UI remembers what it switched on, prunes "N calls" rules using the call counters, and shows a banner on every page while anything is on. A rule is switched off by setting it with `times: 0`.
- **Interrupted steps.** A cancelled or rejected request can leave a step in `WAITING` or `RUNNING`. The UI shows these as "Stopped" once the request has finished.

## Project layout

```
src/
  api/        client.ts (fetch wrapper, ApiError, validation patterns), types.ts
  lib/        store (localStorage), simulator state, usePoll / useProgress, describe, labels, scenarios
  components/ StepTimeline, ReviewPanel, CancelPanel, ReissuePanel, CardFields, shared UI
  guide/      tour engine, tour steps, guide panel, checklist
  pages/      one file per route
e2e/          end-to-end scenarios (npm run test:e2e)
```
