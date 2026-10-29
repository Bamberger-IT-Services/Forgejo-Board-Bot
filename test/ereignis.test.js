import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auftraegeFuer, verweiseLesen } from '../src/ereignis.js';

const ORG = 'beispiel-org';
const repo = { name: 'demo', owner: { login: ORG } };
const issue = (action, extra = {}) => ({ action, repository: repo, issue: { id: 501, number: 5, ...extra } });

test('Issue geöffnet / wieder geöffnet → Backlog-Regel, geschlossen → fertig', () => {
  assert.deepEqual(auftraegeFuer('issues', issue('opened'), ORG).auftraege,
    [{ repo: 'demo', nummer: 5, regel: 'offen', issue: { id: 501, number: 5, state: 'open' } }]);
  assert.equal(auftraegeFuer('issues', issue('reopened'), ORG).auftraege[0].regel, 'offen');
  assert.deepEqual(auftraegeFuer('issues', issue('closed'), ORG).auftraege[0],
    { repo: 'demo', nummer: 5, regel: 'fertig', issue: { id: 501, number: 5, state: 'closed' } });
});

test('andere Issue-Aktionen, PR-Issues und fremde Organisationen werden ignoriert', () => {
  assert.equal(auftraegeFuer('issues', issue('edited'), ORG).auftraege.length, 0);
  assert.equal(auftraegeFuer('issues', issue('label_updated'), ORG).auftraege.length, 0);
  assert.equal(auftraegeFuer('issues', issue('opened', { pull_request: {} }), ORG).auftraege.length, 0);
  const fremd = { ...issue('opened'), repository: { name: 'demo', owner: { login: 'andere-org' } } };
  assert.equal(auftraegeFuer('issues', fremd, ORG).grund, 'fremde Organisation');
  assert.equal(auftraegeFuer('push', { repository: repo }, ORG).auftraege.length, 0);
  assert.equal(auftraegeFuer('issues', {}, ORG).auftraege.length, 0);
  const boese = { ...issue('opened'), repository: { name: '../x', owner: { login: ORG } } };
  assert.equal(auftraegeFuer('issues', boese, ORG).auftraege.length, 0);
});

test('Organisation ohne Rücksicht auf Groß-/Kleinschreibung', () => {
  const r = { ...issue('opened'), repository: { name: 'demo', owner: { login: 'Beispiel-Org' } } };
  assert.equal(auftraegeFuer('issues', r, ORG).auftraege.length, 1);
});

test('PR geöffnet mit „Closes #n“ → Review-Auftrag je Issue', () => {
  const pr = (body, action = 'opened', title = 'Neue Funktion') =>
    ({ action, repository: repo, pull_request: { number: 9, title, body } });
  assert.deepEqual(auftraegeFuer('pull_request', pr('Closes #3\n\nFixes #4, resolves #3'), ORG).auftraege,
    [{ repo: 'demo', nummer: 3, regel: 'review' }, { repo: 'demo', nummer: 4, regel: 'review' }]);
  assert.equal(auftraegeFuer('pull_request', pr('Siehe #3'), ORG).auftraege.length, 0);
  assert.equal(auftraegeFuer('pull_request', pr('Closes #3', 'synchronized'), ORG).auftraege.length, 0);
  assert.equal(auftraegeFuer('pull_request', pr(null, 'opened', 'Fix #8 Absturz'), ORG).auftraege[0].nummer, 8);
});

test('Verweise: Schlüsselwörter, volle Namen und Adressen; fremde Repos nicht', () => {
  const v = (t) => verweiseLesen(t, ORG, 'demo');
  assert.deepEqual(v('closes #1 CLOSED #2 Close #3 fixed #4 fix: #5 Resolved #6'), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(v('Closes beispiel-org/demo#7'), [7]);
  assert.deepEqual(v('Closes https://forgejo.example/beispiel-org/demo/issues/8'), [8]);
  assert.deepEqual(v('Closes andere-org/demo#9 und fixes beispiel-org/anderes#10'), []);
  assert.deepEqual(v('Disclosed #11, prefix#12, #13 closes'), []);
  assert.deepEqual(v('Closes #0'), []);
});
