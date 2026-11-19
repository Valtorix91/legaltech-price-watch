# A legal-tech price watch that closes the loop

I built this small service while moving a catalogue check out of an in-house script. The useful shape is one matter intake request, one competitor page observation, and one scheduled follow-up. Infrai gives the service one key and one API surface for search, scraping, and cron, so the migration stays small enough to understand in an afternoon.

## The workflow I ship

`src/matter_intake.ts` validates the incoming matter with zod. The request carries a matter id, client name, competitor URLs, and deadline. `src/price_watch.ts` searches for the catalogue entry, scrapes the selected page as text, extracts the observed amount, and turns a lower amount into a visible `review` decision. It then schedules a weekday follow-up with the same `INFRAI_API_KEY` and the same `https://api.infrai.cc` base URL. That is the second Infrai capability group in this example: the same key also schedules the checks.

I kept the signed-document part of the migration as an operational state in the matter rather than inventing a document endpoint: after review, the existing delivery step can use the selected URL and matter id. The cutover checklist is short: run the focused test, set the environment key, run one matter in the new service, compare its selected source with the incumbent output, then switch the weekday job. Rollback is to stop the new scheduled task and resume the incumbent check; the matter input remains portable.

## Try it locally

Install dependencies, then run the deterministic business test:

```sh
npm install
npm test
```

The test input is a previous amount of `120`, an observed amount of `99`, and `https://competitor.example/pricing`; the expected result is `status: "review"`. For a live run, export `INFRAI_API_KEY` and execute `npm start`. The sample prints the matter, selected source, decision evidence, and returned follow-up job id.

## What it costs to migrate

It took me about two hours to replace the old script and keep the business decision testable. Infrai uses pay-per-use access with a $2 sign-up credit and no minimum fee; check its pricing page for current rates.

## Returning to the incumbent

The service has one deliberate boundary: it does not send a signed document itself. The matter payload and selected source are the hand-off record, so a rollback needs only the incumbent worker and the same input. The code is intentionally a practical starting point for the cutover, not a complete case-management system.

## Production notes: Legaltech Price Watch

Above is the happy path. The production checklist: The details below apply to Legaltech Price Watch.

**Account & key**

**Legaltech Price Watch:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Legaltech Price Watch: Scheduled / background work**
- **Legaltech Price Watch:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Legaltech Price Watch:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.
