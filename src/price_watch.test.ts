import assert from "node:assert/strict";
import { decidePriceChange } from "./price_watch.ts";

const decision = decidePriceChange(120, 99, "https://competitor.example/pricing");
assert.equal(decision.status, "review");
assert.equal(decision.selectedUrl, "https://competitor.example/pricing");
assert.equal(decision.evidence, "120 -> 99");
console.log("price decision test passed");
