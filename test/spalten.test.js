import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spalteFinden } from '../src/spalten.js';
import { spaltenLesen, projekteLesen, csrfLesen } from '../src/html.js';
import { projektSeite, projektListe } from './attrappe.js';

const s = (...titel) => titel.map((t, i) => ({ id: String(i + 1), titel: t, karten: [] }));

test('Spalten über Stichworte, Groß-/Kleinschreibung egal', () => {
  const spalten = s('Backlog', 'To do', 'In progress', 'To review', 'Done');
  assert.equal(spalteFinden(spalten, 'backlog').titel, 'Backlog');
  assert.equal(spalteFinden(spalten, 'todo').titel, 'To do');
  assert.equal(spalteFinden(spalten, 'arbeit').titel, 'In progress');
  assert.equal(spalteFinden(spalten, 'review').titel, 'To review');
  assert.equal(spalteFinden(spalten, 'fertig').titel, 'Done');
  assert.equal(spalteFinden(s('BACKLOG'), 'backlog').titel, 'BACKLOG');
});

test('deutsche Spaltennamen', () => {
  const spalten = s('Backlog', 'Offen', 'In Arbeit', 'Prüfung', 'Geschlossen');
  assert.equal(spalteFinden(spalten, 'todo').titel, 'Offen');
  assert.equal(spalteFinden(spalten, 'arbeit').titel, 'In Arbeit');
  assert.equal(spalteFinden(spalten, 'review').titel, 'Prüfung');
  assert.equal(spalteFinden(spalten, 'fertig').titel, 'Geschlossen');
});

test('exakter Titel geht vor „enthält“', () => {
  const spalten = s('Review-Rückstand', 'Review');
  assert.equal(spalteFinden(spalten, 'review').titel, 'Review');
});

test('fehlende Spalte ergibt undefined, unbekannter Schlüssel wirft', () => {
  assert.equal(spalteFinden(s('Backlog', 'Geschlossen'), 'review'), undefined);
  assert.throws(() => spalteFinden([], 'irgendwas'));
});

test('Projektseite: Spalten, Titel, Kartenzahl und Karten werden erkannt', () => {
  const html = projektSeite('/beispiel-org/demo', { id: '3' }, [
    { id: '1', titel: 'Backlog', karten: [101, 102] },
    { id: '2', titel: 'In progress & mehr', karten: [] },
    { id: '3', titel: 'Geschlossen', karten: [103] },
  ]);
  const spalten = spaltenLesen(html);
  assert.deepEqual(spalten.map((x) => [x.id, x.titel, x.anzahl, x.karten]), [
    ['1', 'Backlog', 2, [101, 102]],
    ['2', 'In progress & mehr', 0, []],
    ['3', 'Geschlossen', 1, [103]],
  ]);
});

test('Projektliste: nur Links auf Projekte dieses Repos, in Reihenfolge', () => {
  const html = projektListe('/beispiel-org/demo', [{ id: '4', name: 'Roadmap' }, { id: '2', name: 'Alt' }])
    + '<a href="/beispiel-org/anderes/projects/9">Fremd</a>';
  assert.deepEqual(projekteLesen(html, '/beispiel-org/demo'), [{ id: '4', name: 'Roadmap' }, { id: '2', name: 'Alt' }]);
  assert.deepEqual(projekteLesen('<p>keine</p>', '/beispiel-org/demo'), []);
});

test('CSRF-Feld wird gelesen, wenn vorhanden', () => {
  assert.equal(csrfLesen('<input type="hidden" name="_csrf" value="abc123">'), 'abc123');
  assert.equal(csrfLesen('<form></form>'), undefined);
});
