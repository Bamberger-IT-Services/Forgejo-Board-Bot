// Prüft die HMAC-SHA256-Signatur eines Forgejo-Webhooks.
// Forgejo schickt sie hexadezimal in X-Forgejo-Signature (ältere Fassungen: X-Gitea-Signature)
// und berechnet sie über den unveränderten Rohinhalt der Anfrage.

import { createHmac, timingSafeEqual } from 'node:crypto';

export function signaturBerechnen(secret, rohinhalt) {
  return createHmac('sha256', secret).update(rohinhalt).digest('hex');
}

export function signaturPruefen(secret, rohinhalt, kopf) {
  if (!secret || typeof kopf !== 'string') return false;
  const erhalten = kopf.trim().toLowerCase().replace(/^sha256=/, '');
  if (!/^[0-9a-f]{64}$/.test(erhalten)) return false;
  const erwartet = Buffer.from(signaturBerechnen(secret, rohinhalt), 'hex');
  return timingSafeEqual(erwartet, Buffer.from(erhalten, 'hex'));
}
