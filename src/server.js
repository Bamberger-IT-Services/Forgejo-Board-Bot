// HTTP-Server: POST /webhook (nur mit gültiger Signatur) und GET /health.
// Der Webhook antwortet sofort mit 202; die Board-Arbeit läuft danach in der Warteschlange.

import http from 'node:http';
import { signaturPruefen } from './signatur.js';
import { auftraegeFuer } from './ereignis.js';
import { log } from './log.js';

const MAX_INHALT = 1024 * 1024; // Forgejo-Nutzlasten sind deutlich kleiner

function antworten(res, status, daten) {
  const inhalt = JSON.stringify(daten);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(inhalt);
}

function inhaltLesen(req) {
  return new Promise((ok, fehler) => {
    const teile = [];
    let laenge = 0;
    req.on('data', (t) => {
      laenge += t.length;
      if (laenge > MAX_INHALT) {
        fehler(Object.assign(new Error('zu groß'), { status: 413 }));
        req.destroy();
        return;
      }
      teile.push(t);
    });
    req.on('end', () => ok(Buffer.concat(teile)));
    req.on('error', fehler);
  });
}

// zustand: { gesund(): {ok, ...} }, einreihen(auftrag) – kommt aus main.js bzw. den Tests.
export function serverErstellen({ secret, org, einreihen, gesundheit }) {
  return http.createServer(async (req, res) => {
    const pfad = (req.url || '').split('?')[0];
    try {
      if (pfad === '/health' && (req.method === 'GET' || req.method === 'HEAD')) {
        const g = gesundheit();
        return antworten(res, g.ok ? 200 : 503, g);
      }
      if (pfad !== '/webhook') return antworten(res, 404, { fehler: 'nicht gefunden' });
      if (req.method !== 'POST') return antworten(res, 405, { fehler: 'nur POST' });

      const roh = await inhaltLesen(req);
      const signatur = req.headers['x-forgejo-signature'] ?? req.headers['x-gitea-signature'];
      if (!signaturPruefen(secret, roh, signatur)) {
        log.warnung('Webhook abgelehnt: Signatur fehlt oder falsch', { adresse: req.socket.remoteAddress });
        return antworten(res, 401, { fehler: 'Signatur ungültig' });
      }

      const ereignis = String(req.headers['x-forgejo-event'] ?? req.headers['x-gitea-event'] ?? '');
      const lieferung = String(req.headers['x-forgejo-delivery'] ?? req.headers['x-gitea-delivery'] ?? '').slice(0, 64);
      let nutzlast;
      try {
        nutzlast = JSON.parse(roh.toString('utf8'));
      } catch {
        return antworten(res, 400, { fehler: 'kein JSON' });
      }
      const { auftraege, grund } = auftraegeFuer(ereignis, nutzlast, org);
      if (!auftraege.length) {
        log.info('Webhook ohne Board-Auftrag', { ereignis, aktion: nutzlast?.action, grund, lieferung });
        return antworten(res, 202, { auftraege: 0, grund });
      }
      for (const a of auftraege) einreihen({ ...a, lieferung });
      return antworten(res, 202, { auftraege: auftraege.length });
    } catch (err) {
      if (err.status === 413) return antworten(res, 413, { fehler: 'zu groß' });
      log.fehler('Anfrage fehlgeschlagen', { pfad, fehler: err.message });
      if (!res.headersSent) antworten(res, 500, { fehler: 'interner Fehler' });
    }
  });
}
