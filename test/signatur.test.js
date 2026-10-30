import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signaturBerechnen, signaturPruefen } from '../src/signatur.js';

const SECRET = 'test-secret-nur-fuer-unit-tests-0123456789';
const INHALT = Buffer.from('{"action":"opened"}');

test('gültige Signatur wird angenommen (hex, auch mit sha256=-Präfix und Großbuchstaben)', () => {
  const sig = signaturBerechnen(SECRET, INHALT);
  assert.equal(signaturPruefen(SECRET, INHALT, sig), true);
  assert.equal(signaturPruefen(SECRET, INHALT, `sha256=${sig}`), true);
  assert.equal(signaturPruefen(SECRET, INHALT, sig.toUpperCase()), true);
});

test('falsches Secret, veränderter Inhalt oder fehlender Kopf werden abgelehnt', () => {
  const sig = signaturBerechnen(SECRET, INHALT);
  assert.equal(signaturPruefen('anderes-secret-0123456789abcdef', INHALT, sig), false);
  assert.equal(signaturPruefen(SECRET, Buffer.from('{"action":"closed"}'), sig), false);
  assert.equal(signaturPruefen(SECRET, INHALT, undefined), false);
  assert.equal(signaturPruefen(SECRET, INHALT, ''), false);
});

test('kaputte Signaturen werfen nicht, sondern werden abgelehnt', () => {
  assert.equal(signaturPruefen(SECRET, INHALT, 'abc'), false);
  assert.equal(signaturPruefen(SECRET, INHALT, 'z'.repeat(64)), false);
  assert.equal(signaturPruefen(SECRET, INHALT, 'a'.repeat(128)), false);
  assert.equal(signaturPruefen(SECRET, INHALT, ['a', 'b']), false);
  assert.equal(signaturPruefen('', INHALT, signaturBerechnen('', INHALT)), false);
});
