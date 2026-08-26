import { CURRENT_RELEASE_WINDOW_DAYS, EVIDENCE_STALE_MS } from "./constants.js";
import type { Model, Offer, Snapshot } from "./types.js";

export function recencyCutoffDate(generatedAt: string): string {
  const cutoff = Date.parse(generatedAt) - CURRENT_RELEASE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return new Date(cutoff).toISOString().slice(0, 10);
}

export function isFreshEvidence(fetchedAt: string | undefined, generatedAt: string): boolean {
  if (!fetchedAt) return false;
  const fetched = Date.parse(fetchedAt);
  const generated = Date.parse(generatedAt);
  if (!Number.isFinite(fetched) || !Number.isFinite(generated)) return false;
  return generated - fetched <= EVIDENCE_STALE_MS;
}

export function hasActiveOffer(model: Model): boolean {
  return model.offers.some((offer) => offer.status === "active");
}

export function inCurrentScope(model: Model, generatedAt: string): boolean {
  if (model.identity_confidence === "unresolved") return false;
  if (!hasActiveOffer(model)) return false;
  const release = model.release_date?.slice(0, 10);
  if (!release) {
    const latestOfferEvidence = model.offers
      .filter((offer) => offer.status === "active")
      .flatMap((offer) => offer.evidence.map((item) => item.fetched_at))
      .sort()
      .at(-1);
    return isFreshEvidence(latestOfferEvidence, generatedAt);
  }
  return release >= recencyCutoffDate(generatedAt);
}

export function offerInCurrentScope(model: Model, offer: Offer, generatedAt: string): boolean {
  return inCurrentScope(model, generatedAt) && offer.status === "active";
}
