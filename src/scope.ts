import { EVIDENCE_STALE_MS } from "./constants.js";
import type { Evidence, Model, Offer } from "./types.js";

export function hasFreshEvidence(evidence: Evidence[], generatedAt: string): boolean {
  const snapshotTime = Date.parse(generatedAt);
  return evidence.some((item) => {
    const fetchedAt = Date.parse(item.fetched_at);
    return Number.isFinite(fetchedAt) && fetchedAt <= snapshotTime && snapshotTime - fetchedAt <= EVIDENCE_STALE_MS;
  });
}

export function offerInAvailableScope(offer: Offer, generatedAt: string): boolean {
  if (offer.status !== "active") return false;
  if (offer.expires_at && Date.parse(offer.expires_at) <= Date.parse(generatedAt)) return false;
  return hasFreshEvidence(offer.evidence, generatedAt);
}

export function inAvailableScope(model: Model, generatedAt: string): boolean {
  if (model.identity_confidence === "unresolved") return false;
  return model.offers.some((offer) => offerInAvailableScope(offer, generatedAt));
}
