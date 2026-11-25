# Backend context for the frontend

Everything a frontend needs from the card issuance backend as it stands after Milestone 3. For how the backend works inside, see [architecture.md](architecture.md). To run it, see the [README](../README.md#run).

## 1. What the backend does

Banks (tenants) issue **virtual cards**. Each request runs as a Temporal workflow through these steps: validate, KYC, create card, wait for the processor's confirmation, set limits, activate, and notify. A request can **park for an operator** when KYC needs review, the confirmation is late, or a step keeps failing. Operators approve, reject, retry or cancel it.

Requests can be cancelled until the card is activated. Cards can be **reissued** when lost, stolen, damaged or expired. A **reconciliation** compares the processor's cards with the platform's, nightly or on demand.

Physical and agentic cards aren't built yet. The API refuses them.

## 2. Running the backend for frontend work

```bat
infra\scripts\restart-all.cmd
```

| Service | Address | Frontend use |
|---|---|---|
| API | http://localhost:8080 | Everything the UI does |
| Mock admin | http://localhost:8091/mock-admin | Demo controls only: inject failures, change callback behaviour, list processor cards |
| Temporal Web UI | http://localhost:8233 | Optional deep links, such as `http://localhost:8233/namespaces/default/workflows/{workflowId}` |

## 3. Things to know before calling the API

- **CORS isn't enabled.** The API sends no `Access-Control-Allow-Origin` header, so a browser page on another port (such as a Vite dev server on 5173) can't call it directly. Use the dev server's proxy, which needs no backend change:

  ```js
  // vite.config.js
  export default {
    server: {
      proxy: {
        '/v1': 'http://localhost:8080',
        '/mock-admin': 'http://localhost:8091',
      },
    },
  };
  ```

  The mocks listen on `127.0.0.1` only.
- **There's no login.** Every call except `/v1/hello` and the webhook must send `X-Tenant-Id`, either `bank-a` or `bank-b`. Treat the tenant as a selector in the UI for now.
- **There are no list endpoints.** You can only fetch one request by its key, so the UI must remember the keys it created, in local state or browser storage. There's no API for "all requests" or "all parked requests" yet. Those are planned for Milestone 7.
- **The client chooses the request ID.** The `Idempotency-Key` header *is* the request ID. Generate one per new request, for example `crypto.randomUUID()`. It may be 1 to 64 characters of letters, digits, `_` and `-`. Sending the same key again returns the existing request instead of creating a second.
- **Progress is polled.** There are no websockets or server-sent events. Poll `GET` about once a second until `finished` is `true`.
- **Closed requests disappear after 24 hours,** because Temporal's retention period then deletes them. A `GET` then returns `404`.
- **Never show or accept card numbers.** The API refuses references and reasons that contain a long run of digits.

## 4. Endpoints

Base URL `http://localhost:8080`. Request bodies are JSON with `Content-Type: application/json`. Errors are always `{"code": "SOME_CODE"}`. A `503` also carries `Retry-After: 5`, meaning try again shortly.

### Issue a card

`POST /v1/card-requests`. Headers: `X-Tenant-Id`, `Idempotency-Key` (required).

```json
{
  "cardType": "VIRTUAL",
  "productCode": "VIRTUAL_STANDARD",
  "customerRef": "customer-1",
  "accountRef": "account-1",
  "spendLimitMinor": 50000
}
```

| Field | Rule |
|---|---|
| `cardType` | Only `VIRTUAL` |
| `productCode` | `VIRTUAL_STANDARD` or `VIRTUAL_PREMIUM`. Others are accepted by the API, but the workflow rejects them with `INVALID_PRODUCT` |
| `customerRef`, `accountRef` | 1 to 64 letters, digits, `_` or `-` |
| `spendLimitMinor` | Minor units, so `50000` is 500.00. The workflow rejects values outside 1 to 1,000,000 with `LIMIT_EXCEEDS_POLICY` |

| Reply | Body |
|---|---|
| `201` | `{"requestId": "<key>", "status": "REQUESTED"}` |
| `200` | Same key sent again: the existing request's progress (see section 5) |
| `400` | `UNKNOWN_TENANT`, `INVALID_REQUEST`, `UNSUPPORTED_CARD_TYPE` |
| `503` | `ENGINE_UNAVAILABLE` (Temporal is down) |

Demo customers: a `customerRef` containing `reject` is rejected by KYC, and one containing `review` parks for KYC review.

### Read a request's progress

`GET /v1/card-requests/{requestId}`. Header: `X-Tenant-Id`.

| Reply | Meaning |
|---|---|
| `200` | Progress (section 5) |
| `404 NOT_FOUND` | No such request for this tenant, or it was deleted after retention |
| `503 PROGRESS_UNAVAILABLE` | The worker is down. Keep polling, because the request continues when it returns. |
| `500 WORKFLOW_FAILED` | A backend defect. Shouldn't happen. |

### Operator decision on a parked request

`POST /v1/card-requests/{requestId}/approvals`. Headers: `X-Tenant-Id`, and optionally `Idempotency-Key` (recommended, so a retried click is safe).

```json
{ "action": "APPROVE", "reviewer": "ops-1" }
```

Only offer the actions that fit `pendingReview.kind`:

| `pendingReview.kind` | Meaning | Actions |
|---|---|---|
| `KYC_REVIEW` | KYC couldn't decide | `APPROVE`, `REJECT` |
| `CONFIRMATION_TIMEOUT` | The processor didn't confirm in time. A late confirmation clears it automatically. | `APPROVE`, `REJECT` |
| `RETRIES_EXHAUSTED` | A step kept failing. `pendingReview.step` says which. | `RETRY`, `CANCEL` |

| Reply | Body |
|---|---|
| `200` | `{"kind": "KYC_REVIEW", "action": "APPROVE"}` |
| `400 INVALID_REQUEST` | Missing action, or a bad reviewer or key |
| `404 NOT_FOUND` | No such request |
| `409` | `NO_REVIEW_PENDING` (nothing to decide, or someone else already decided), `ACTION_NOT_ALLOWED` (wrong action for this kind), `ALREADY_FINISHED` |
| `503` | `WORKER_UNAVAILABLE` or `ENGINE_UNAVAILABLE`. The decision may still be applied later. Retry with the same `Idempotency-Key`. |

### Cancel a request

`POST /v1/card-requests/{requestId}/cancel`. Headers: `X-Tenant-Id`, and optionally `Idempotency-Key`. Body optional: `{"reason": "customer-request"}`, up to 200 characters with no card-number-like digits.

| Reply | Body |
|---|---|
| `200` | `{"accepted": true}`. The request ends `CANCELLED` shortly after, and any completed steps are undone |
| `409` | `CANNOT_CANCEL` (card already active, so offer reissue instead), `ALREADY_FINISHED` |
| others | Same as approvals |

### Reissue a card

`POST /v1/cards/{cardId}/reissue`. Headers: `X-Tenant-Id`, `Idempotency-Key` (required, at most 60 characters).

```json
{
  "reason": "STOLEN",
  "productCode": "VIRTUAL_STANDARD",
  "customerRef": "customer-1",
  "accountRef": "account-1",
  "spendLimitMinor": 50000
}
```

`reason` is `LOST`, `STOLEN`, `DAMAGED` or `EXPIRED`. Lost and stolen cards are blocked first. `cardId` is the old card's ID from a progress response's `card.cardId`.

| Reply | Body |
|---|---|
| `201` | `{"requestId": "<key>", "oldCardId": "...", "newCardRequestId": "<key>-new", "status": "REQUESTED"}` |
| `200` | Same key again: the existing reissue's progress |
| `400` | `UNKNOWN_TENANT`, `INVALID_REQUEST` |

Track it with `GET /v1/reissues/{requestId}`, which returns the same progress shape as section 5. Its `card` is the **new** card. The replacement is an ordinary card request, so `GET /v1/card-requests/{newCardRequestId}` shows its detailed steps, and it can park for review like any other request. An unknown old card ends `REJECTED` with `CARD_NOT_FOUND`.

### Reconciliation

| Call | Headers and body | Reply |
|---|---|---|
| `POST /v1/reconciliations` | `X-Tenant-Id`, `Idempotency-Key` (required). Body optional: `{"pageSize": 50}` (1 to 500) | `201 {"runId": "<key>", "status": "RUNNING"}`, or `200 {"runId", "status": "ALREADY_STARTED"}` for a reused key |
| `GET /v1/reconciliations/{runId}` | `X-Tenant-Id` | `200 {"status": "RUNNING"}`, `200 {"status": "COMPLETED", "report": {...}}`, `200 {"status": "FAILED"}`, `404`, or `503 RESULT_UNAVAILABLE` (ask again) |
| `POST /v1/reconciliations/schedule/trigger` | `X-Tenant-Id` | `202 {"scheduleId": "recon-bank-a", "result": "TRIGGERED"}`, or `503 SCHEDULE_UNAVAILABLE` |

A triggered nightly run has a generated ID, so its result can't be fetched through this API. View it in the Temporal Web UI instead.

Report shape:

```json
{
  "tenantId": "bank-a",
  "businessDate": "2026-11-23",
  "processorCards": 12,
  "platformCards": 11,
  "pagesRead": 1,
  "discrepancyCount": 1,
  "discrepancies": [
    { "cardId": "card_ABC...", "type": "UNKNOWN_TO_PLATFORM", "processorStatus": "ACTIVE", "platformStatus": null }
  ]
}
```

`type` is `UNKNOWN_TO_PLATFORM`, `MISSING_AT_PROCESSOR` or `STATUS_MISMATCH`. At most 50 discrepancies are listed, and `discrepancyCount` is the full total.

### Not for the UI

- `POST /v1/webhooks/processor` is for the processor only.
- `POST /v1/hello` is the Milestone 1 sample.

## 5. The progress object

Returned by `GET /v1/card-requests/{id}` and `GET /v1/reissues/{id}`. This is real output:

```json
{
  "status": "ACTIVE",
  "reasonCode": null,
  "card": { "cardId": "card_DKTARDVJLMJEYJGHTQTA", "token": "tok_TJNXYYCDFEESCZGYDQXXBLSK" },
  "steps": [
    { "name": "validateRequest", "state": "DONE", "lastErrorCode": null, "startedAtMillis": 1795533588917, "finishedAtMillis": 1795533588974 },
    { "name": "runKyc", "state": "DONE", "lastErrorCode": null, "startedAtMillis": 1795533588974, "finishedAtMillis": 1795533589028 },
    { "name": "createCard", "state": "DONE", "lastErrorCode": null, "startedAtMillis": 1795533589028, "finishedAtMillis": 1795533589079 },
    { "name": "awaitConfirmation", "state": "DONE", "lastErrorCode": null, "startedAtMillis": 1795533589079, "finishedAtMillis": 1795533589282 },
    { "name": "setLimits", "state": "DONE", "lastErrorCode": null, "startedAtMillis": 1795533589282, "finishedAtMillis": 1795533589328 },
    { "name": "activateCard", "state": "DONE", "lastErrorCode": null, "startedAtMillis": 1795533589328, "finishedAtMillis": 1795533589370 },
    { "name": "sendNotification", "state": "DONE", "lastErrorCode": null, "startedAtMillis": 1795533589370, "finishedAtMillis": 1795533589426 }
  ],
  "pendingReview": null,
  "finished": true
}
```

| Field | Meaning |
|---|---|
| `status` | Current card status (below) |
| `reasonCode` | Why it ended or is waiting, such as `KYC_REJECTED`. `null` when all is well |
| `card` | `null` until the card is created. Show the ID, and never expect a card number |
| `steps` | Every planned step from the start, in order, so you can draw a timeline. Undo steps are appended at the end if a rollback happens |
| `pendingReview` | `null`, or `{"kind", "step", "reasonCode", "sinceMillis"}` when an operator must act |
| `finished` | `true` once the request is final. Stop polling. |

Times are epoch milliseconds. A null in either time means not started or not finished.

If the worker is down but the request had already finished, the API still answers with the final `status`, `reasonCode` and `card`, but `steps` is empty.

### Values

**Card `status`:**

| Value | Meaning | Final? |
|---|---|---|
| `REQUESTED` | Accepted, validating | no |
| `KYC_PASSED` | Identity checks passed | no |
| `CREATED` | Card exists, not yet active | no |
| `UNDER_REVIEW` | Waiting for an operator (`pendingReview` is set), or final with `COMPENSATION_FAILED` or `REPLACEMENT_FAILED` | depends on `finished` |
| `ACTIVE` | Card is usable | yes |
| `REJECTED` | Refused | yes |
| `CANCELLED` | Cancelled | yes |

`BLOCKED`, `PERSONALIZED`, `IN_PRODUCTION`, `SHIPPED` and `DELIVERED` exist in the enum but aren't used by virtual cards. A blocked old card shows as `BLOCKED` only at the processor (mock admin), not in progress.

**Step `name`:**

| Name | Meaning |
|---|---|
| `validateRequest`, `runKyc`, `createCard`, `awaitConfirmation`, `setLimits`, `activateCard`, `sendNotification` | Issuance steps |
| `cancelCard`, `resetLimits`, `deactivateCard` | Undo steps, appended only during a rollback |
| `blockOldCard`, `issueNewCard`, `linkCards` | Reissue steps. `blockOldCard` only for lost or stolen |

**Step `state`:**

| Value | Meaning |
|---|---|
| `PENDING` | Not started |
| `RUNNING` | Running, possibly retrying |
| `WAITING` | Waiting for the processor's confirmation |
| `PARKED` | Waiting for an operator |
| `DONE` | Done |
| `FAILED` | Failed. See `lastErrorCode` |
| `COMPENSATING`, `COMPENSATED` | Undo step running, done |

A failed `sendNotification` doesn't affect the card, which stays `ACTIVE`.

**`reasonCode` values:**

| Code | Meaning |
|---|---|
| `INVALID_REQUEST`, `INVALID_PRODUCT`, `LIMIT_EXCEEDS_POLICY` | Validation failed |
| `KYC_REJECTED` | KYC refused |
| `KYC_NEEDS_REVIEW`, `CONFIRMATION_TIMEOUT`, `RETRIES_EXHAUSTED` | Parked (also in `pendingReview.reasonCode`) |
| `REJECTED_BY_REVIEWER` | An operator rejected it |
| `CANCELLED_BY_REQUEST` | Cancelled through the cancel endpoint |
| `CANCELLED_BY_OPERATOR` | An operator chose `CANCEL` after retries ran out |
| `COMPENSATION_FAILED` | Rollback failed. Needs manual cleanup |
| `REPLACEMENT_FAILED` | Reissue couldn't start the replacement |
| `CARD_NOT_FOUND` | Reissue of an unknown card |
| any other upper-case code | A business refusal from the processor, such as `ACTIVATION_DECLINED` |

**Typical timing:** a normal card is `ACTIVE` within about 1 second. A confirmation timeout parks after 10 seconds. A step that keeps failing parks after about 30 seconds of retries.

## 6. Screens the current API supports

| Screen | Uses |
|---|---|
| Tenant selector | `X-Tenant-Id` (`bank-a`, `bank-b`) |
| New card form | `POST /v1/card-requests` |
| Request detail with step timeline | `GET /v1/card-requests/{id}`, polled |
| Review panel on the detail page | `pendingReview`, `POST .../approvals` |
| Cancel button, until `ACTIVE` | `POST .../cancel` |
| Reissue form on an active card | `POST /v1/cards/{cardId}/reissue`, `GET /v1/reissues/{id}` |
| Reconciliation page | `POST /v1/reconciliations`, `GET /v1/reconciliations/{id}`, schedule trigger |
| Demo controls (development only) | Mock admin: `PUT /mock-admin/failures/{tenant}/{mock}/{operation}`, `PUT /mock-admin/callbacks/{tenant}`, `GET /mock-admin/cards/{tenant}`, `POST /mock-admin/reset`. Bodies are in the [README](../README.md#inject-failures) |

## 7. Backend gaps that affect the frontend

| Gap | Workaround now | Planned |
|---|---|---|
| No CORS | Dev server proxy | Configure when the UI's host is known |
| No list or search endpoints, no operator queue | Remember keys on the client. Find parked requests in the Temporal Web UI with `CardStatus = "UNDER_REVIEW"` | Milestone 7 |
| No authentication or roles | Tenant header only | Before production |
| Polling only | Poll every second | Not planned |
| No OpenAPI spec | This document | Milestone 7 |
| Nightly run results not readable through the API | Temporal Web UI | Not planned yet |
| Retry attempt counts not in progress | Temporal Web UI | Milestone 7 |
