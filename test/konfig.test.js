import { test } from 'node:test';
import assert from 'node:assert/strict';
import { konfigLesen } from '../src/konfig.js';
import { geheimnisRegistrieren, schwaerzen } from '../src/log.js';

const gut = {
  FORGEJO_URL: 'https://forgejo.example/',
  FORGEJO_ORG: 'beispiel-org',
  BOT_BENUTZER: 'board-bot',
  BOT_PASSWORT: 'platzhalter-passwort',
  WEBHOOK_SECRET: 'platzhalter-'.repeat(3),
};

test('vollständige Konfiguration mit Vorgaben', () => {
  const k = konfigLesen(gut);
  assert.equal(k.url, 'https://forgejo.example');
  assert.equal(k.port, 8080);
  assert.equal(k.abgleichMinuten, 15);
  assert.equal(k.token, undefined);
});

test('fehlende oder ungültige Werte: Start bricht mit Liste ab, ohne Geheimnisse zu nennen', () => {
  assert.throws(() => konfigLesen({}), /FORGEJO_URL fehlt.*FORGEJO_ORG fehlt.*BOT_PASSWORT fehlt.*WEBHOOK_SECRET fehlt/);
  assert.throws(() => konfigLesen({ ...gut, WEBHOOK_SECRET: 'kurz' }), (e) => /zu kurz/.test(e.message) && !e.message.includes('kurz"'));
  assert.throws(() => konfigLesen({ ...gut, FORGEJO_URL: 'forgejo.example' }), /http/);
  assert.throws(() => konfigLesen({ ...gut, FORGEJO_ORG: '../x' }), /ungültige Zeichen/);
  assert.throws(() => konfigLesen({ ...gut, ABGLEICH_MINUTEN: 'oft' }), /ABGLEICH_MINUTEN/);
});

test('Protokoll schwärzt registrierte Geheimnisse', () => {
  geheimnisRegistrieren('platzhalter-passwort');
  assert.equal(schwaerzen('Fehler mit platzhalter-passwort drin'), 'Fehler mit *** drin');
});
