import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { serverErstellen } from '../src/server.js';
import { signaturBerechnen } from '../src/signatur.js';

process.env.BOT_LOG_STILL = '1';

const SECRET = 'test-secret-nur-fuer-unit-tests-0123456789';
const auftraege = [];
let gesund = { ok: true };
const server = serverErstellen({ secret: SECRET, org: 'beispiel-org', einreihen: (a) => auftraege.push(a), gesundheit: () => gesund });
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const basis = `http://127.0.0.1:${server.address().port}`;
after(() => server.close());

const nutzlast = JSON.stringify({ action: 'opened', repository: { name: 'demo', owner: { login: 'beispiel-org' } }, issue: { id: 1, number: 1 } });
const senden = (body, kopf = {}) => fetch(`${basis}/webhook`, { method: 'POST', body, headers: { 'Content-Type': 'application/json', ...kopf } });

test('Webhook ohne oder mit falscher Signatur: 401, kein Auftrag', async () => {
  auftraege.length = 0;
  assert.equal((await senden(nutzlast, { 'X-Forgejo-Event': 'issues' })).status, 401);
  assert.equal((await senden(nutzlast, { 'X-Forgejo-Event': 'issues', 'X-Forgejo-Signature': '0'.repeat(64) })).status, 401);
  const fremd = signaturBerechnen('anderes-secret-0123456789abcdef', nutzlast);
  assert.equal((await senden(nutzlast, { 'X-Forgejo-Event': 'issues', 'X-Forgejo-Signature': fremd })).status, 401);
  assert.equal(auftraege.length, 0);
});

test('Webhook mit gültiger Signatur: 202 und Auftrag (auch mit Gitea-Köpfen)', async () => {
  auftraege.length = 0;
  const sig = signaturBerechnen(SECRET, nutzlast);
  const r = await senden(nutzlast, { 'X-Forgejo-Event': 'issues', 'X-Forgejo-Signature': sig, 'X-Forgejo-Delivery': 'd-1' });
  assert.equal(r.status, 202);
  assert.deepEqual(await r.json(), { auftraege: 1 });
  assert.equal(auftraege[0].regel, 'offen');
  assert.equal(auftraege[0].lieferung, 'd-1');
  assert.equal((await senden(nutzlast, { 'X-Gitea-Event': 'issues', 'X-Gitea-Signature': sig })).status, 202);
  assert.equal(auftraege.length, 2);
});

test('gültige Signatur, aber kein JSON: 400', async () => {
  const roh = 'kein json';
  assert.equal((await senden(roh, { 'X-Forgejo-Event': 'issues', 'X-Forgejo-Signature': signaturBerechnen(SECRET, roh) })).status, 400);
});

test('zu großer Inhalt: 413', async () => {
  const gross = 'x'.repeat(1024 * 1024 + 10);
  const r = await senden(gross, { 'X-Forgejo-Event': 'issues' }).catch(() => ({ status: 413 }));
  assert.equal(r.status, 413);
});

test('nur POST /webhook und GET /health', async () => {
  assert.equal((await fetch(`${basis}/webhook`)).status, 405);
  assert.equal((await fetch(`${basis}/sonstwas`)).status, 404);
});

test('/health: 200 wenn gesund, 503 wenn nicht', async () => {
  gesund = { ok: true };
  assert.equal((await fetch(`${basis}/health`)).status, 200);
  gesund = { ok: false, selbsttest: { fehler: 'Markup geändert' } };
  const r = await fetch(`${basis}/health`);
  assert.equal(r.status, 503);
  assert.equal((await r.json()).selbsttest.fehler, 'Markup geändert');
});
