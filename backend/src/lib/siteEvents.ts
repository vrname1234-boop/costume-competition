import type { Response } from "express";

/**
 * A tiny in-process broadcast used to tell open pages that the site state has
 * changed, so they can reload instead of polling for a change that happens
 * once or twice a term.
 *
 * Subscribers are the open browser connections held by GET /api/public/events.
 * This is deliberately in-memory: with a single API instance every connection
 * is on this process. If the API is ever run on more than one instance, this
 * needs a shared channel (Postgres LISTEN/NOTIFY) so a switch on one instance
 * reaches the pages held by the others.
 */
export type SiteEvent = "maintenance";

const subscribers = new Set<Response>();

export function addSubscriber(res: Response): void {
  subscribers.add(res);
}

export function removeSubscriber(res: Response): void {
  subscribers.delete(res);
}

export function broadcast(
  event: SiteEvent,
  data: Record<string, unknown>,
): void {
  const payload = JSON.stringify(data);
  for (const res of subscribers) {
    res.write(`event: ${event}\ndata: ${payload}\n\n`);
  }
}

export function subscriberCount(): number {
  return subscribers.size;
}
