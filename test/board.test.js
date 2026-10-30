// Ereignis → Aktion gegen das nachgebaute Forgejo: was landet in welcher Spalte?

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { attrappe, standardRepo, karten, URL_, ORG } from './attrappe.js';
import { Forgejo } from '../src/forgejo.js';
import { Board } from '../src/board.js';
import { Bot } from '../src/bot.js';

process.env.BOT_LOG_STILL = '1';

function aufbau(repos, optionen = {}) {
  const a = attrappe({ repos, ...optionen });
  const forgejo = new Forgejo({ url: URL_, benutzer: 'bot', passwort: 'testpasswort' }, a.abrufen);
  const board = new Board(forgejo, ORG);
  return { a, board, bot: new Bot(board) };
}

const offen = (number) => ({ id: 1000 + number, number, state: 'open' });
const zu = (number) => ({ id: 1000 + number, number, state: 'closed' });

let repo;
beforeEach(() => { repo = standardRepo({ issues: [offen(1), offen(2), zu(3)] }); });

test('neues Issue: ins Projekt und nach Backlog, auch wenn die Standardspalte eine andere ist', async () => {
  const { board } = aufbau({ demo: repo }, { standardspalte: 1 });
  assert.equal(await board.anwenden('demo', offen(1), 'offen'), 'verschoben');
  assert.deepEqual(karten(repo).Backlog, [1001]);
  assert.deepEqual(karten(repo)['To do'], []);
});

test('geöffnet: Karte, die eine Sitzung schon nach „In progress“ gesetzt hat, bleibt dort', async () => {
  repo.projekte[0].spalten[2].karten.push(1001);
  const { board } = aufbau({ demo: repo });
  assert.equal(await board.anwenden('demo', offen(1), 'offen'), 'unveraendert');
  assert.deepEqual(karten(repo)['In progress'], [1001]);
});

test('wieder geöffnet: aus „Geschlossen“ zurück nach Backlog', async () => {
  repo.projekte[0].spalten[4].karten.push(1001);
  const { board } = aufbau({ demo: repo });
  assert.equal(await board.anwenden('demo', offen(1), 'offen'), 'verschoben');
  assert.deepEqual(karten(repo).Backlog, [1001]);
  assert.deepEqual(karten(repo).Geschlossen, []);
});

test('geschlossen: nach „Geschlossen“; zweiter Aufruf ändert nichts (idempotent)', async () => {
  repo.projekte[0].spalten[2].karten.push(1003);
  const { a, board } = aufbau({ demo: repo });
  assert.equal(await board.anwenden('demo', zu(3), 'fertig'), 'verschoben');
  assert.deepEqual(karten(repo).Geschlossen, [1003]);
  const vorher = a.zustand.anfragen.filter((x) => x.startsWith('POST') && !x.includes('/user/login')).length;
  assert.equal(await board.anwenden('demo', zu(3), 'fertig'), 'unveraendert');
  const nachher = a.zustand.anfragen.filter((x) => x.startsWith('POST') && !x.includes('/user/login')).length;
  assert.equal(nachher, vorher);
});

test('PR geöffnet: Issue nach Review; ohne Review-Spalte bleibt es stehen', async () => {
  repo.projekte[0].spalten[2].karten.push(1002);
  const { board } = aufbau({ demo: repo });
  assert.equal(await board.anwenden('demo', offen(2), 'review'), 'verschoben');
  assert.deepEqual(karten(repo)['To review'], [1002]);

  const ohne = standardRepo({ review: false, issues: [offen(2)] });
  ohne.projekte[0].spalten[2].karten.push(1002);
  const b2 = aufbau({ demo: ohne }).board;
  assert.equal(await b2.anwenden('demo', offen(2), 'review'), 'spalte-fehlt');
  assert.deepEqual(karten(ohne)['In progress'], [1002]);
});

test('PR geöffnet für ein geschlossenes Issue: keine Review-Spalte', async () => {
  repo.projekte[0].spalten[4].karten.push(1003);
  const { board } = aufbau({ demo: repo });
  assert.equal(await board.anwenden('demo', zu(3), 'review'), 'unveraendert');
  assert.deepEqual(karten(repo).Geschlossen, [1003]);
});

test('Repo ohne offenes Projekt: nichts zu tun', async () => {
  const { board } = aufbau({ demo: { projekte: [], issues: [offen(1)] } });
  assert.equal(await board.anwenden('demo', offen(1), 'offen'), 'kein-projekt');
});

test('Webhook-Auftrag mit PR-Verweis liest das Issue nach und überspringt PRs', async () => {
  repo.issues.push({ id: 1009, number: 9, state: 'open', pull_request: {} });
  const { bot } = aufbau({ demo: repo });
  assert.equal(await bot.selbsttest(), true);
  assert.equal(await bot.auftrag({ repo: 'demo', nummer: 2, regel: 'review' }), 'verschoben');
  assert.deepEqual(karten(repo)['To review'], [1002]);
  // „Closes #9“, aber #9 ist selbst ein PR: nicht anfassen. Unbekannte Nummer: Fehler im Log, kein Absturz.
  assert.equal(await bot.auftrag({ repo: 'demo', nummer: 9, regel: 'review' }), 'unveraendert');
  assert.equal(await bot.auftrag({ repo: 'demo', nummer: 404, regel: 'review' }), 'fehler');
  assert.equal(bot.gesundheit().auftraege.fehlgeschlagen, 1);
});

test('Abgleich: fehlende ins Projekt, geschlossene nach „Geschlossen“, wieder geöffnete nach Backlog', async () => {
  repo.issues.push(offen(4), offen(5));
  repo.projekte[0].spalten[4].karten.push(1004); // offen, steht aber in Geschlossen
  repo.projekte[0].spalten[2].karten.push(1005); // in Arbeit, bleibt dort
  const { board } = aufbau({ demo: repo }, { standardspalte: 1 });
  const e = await board.abgleichRepo('demo');
  assert.deepEqual(e.neuImProjekt, [1, 2, 3]);
  assert.deepEqual(e.nachGeschlossen, [3]);
  assert.deepEqual(e.nachBacklog, [4]);
  assert.deepEqual(karten(repo), {
    Backlog: [1001, 1002, 1004],
    'To do': [],
    'In progress': [1005],
    'To review': [],
    Geschlossen: [1003],
  });
  // Zweiter Lauf: keine Änderung, keine schreibenden Aufrufe.
  const e2 = await board.abgleichRepo('demo');
  assert.deepEqual([e2.neuImProjekt, e2.nachGeschlossen, e2.nachBacklog], [[], [], []]);
});

test('Abgleich aller Repos überspringt Repos ohne Projekt und zählt Fehler', async () => {
  const { board } = aufbau({ demo: repo, leer: { projekte: [], issues: [] } });
  assert.deepEqual(await board.abgleichAlle(), { repos: 1, fehler: 0 });
});

test('Sitzung abgelaufen: Bot meldet sich neu an und führt den Aufruf aus', async () => {
  const { a, board } = aufbau({ demo: repo });
  await board.anwenden('demo', offen(1), 'offen');
  a.zustand.sitzungAblaufen = true;
  assert.equal(await board.anwenden('demo', zu(3), 'fertig'), 'verschoben');
  assert.equal(a.zustand.anmeldungen, 2);
});

test('falsches Passwort: klare Meldung, kein Passwort in der Meldung', async () => {
  const a = attrappe({ repos: { demo: repo } });
  const f = new Forgejo({ url: URL_, benutzer: 'bot', passwort: 'falsch-geheim' }, a.abrufen);
  await assert.rejects(f.anmelden(), (err) => /Anmeldung abgelehnt/.test(err.message) && !err.message.includes('falsch-geheim'));
});

test('Selbsttest: besteht bei passendem Markup, schlägt bei geändertem Markup klar fehl', async () => {
  const { a, board } = aufbau({ demo: repo });
  const e = await board.selbsttest();
  assert.equal(e.repo, 'demo');
  assert.deepEqual(e.spalten, ['Backlog', 'To do', 'In progress', 'To review', 'Geschlossen']);

  // Forgejo-Update simulieren: Karten heißen anders.
  repo.projekte[0].spalten[0].karten.push(1001);
  const alt = a.abrufen;
  const geaendert = async (u, i) => {
    const r = await alt(u, i);
    if (!/\/projects\/\d+$/.test(new URL(u).pathname)) return r;
    const html = (await r.text()).replaceAll('issue-card ', 'board-card ');
    return new Response(html, { status: 200 });
  };
  const b2 = new Board(new Forgejo({ url: URL_, benutzer: 'bot', passwort: 'testpasswort' }, geaendert), ORG);
  await assert.rejects(b2.selbsttest(), /1 Karten angezeigt, 0 erkannt/);
});

test('Bot: /health rot nach fehlgeschlagenem Selbsttest, grün danach', async () => {
  const { bot } = aufbau({ demo: repo });
  assert.equal(bot.gesundheit().ok, false);
  assert.equal(await bot.selbsttest(), true);
  await bot.abgleich();
  const g = bot.gesundheit();
  assert.equal(g.ok, true);
  assert.equal(g.abgleich.repos, 1);
});

test('verspätetes „geschlossen“ für ein inzwischen wieder geöffnetes Issue: Zustand frisch, Karte nach Backlog', async () => {
  repo.projekte[0].spalten[4].karten.push(1001);
  const { bot } = aufbau({ demo: repo });
  await bot.selbsttest();
  assert.equal(await bot.auftrag({ repo: 'demo', nummer: 1, regel: 'fertig' }), 'verschoben');
  assert.deepEqual(karten(repo).Backlog, [1001]);
});

test('Selbsttest rot: Webhook-Aufträge schreiben nichts', async () => {
  const { a, bot } = aufbau({ demo: repo });
  assert.equal(await bot.auftrag({ repo: 'demo', nummer: 1, regel: 'offen' }), 'uebersprungen');
  assert.equal(a.zustand.anfragen.length, 0);
});

test('Issues in einem anderen (auch geschlossenen) Projekt werden nicht umgehängt', async () => {
  repo.projekte.push({ id: '3', name: 'Alt', geschlossen: true, spalten: [{ id: '31', titel: 'Done', karten: [1003] }] });
  repo.projekte.push({ id: '5', name: 'Zweites', spalten: [{ id: '51', titel: 'Backlog', karten: [1002] }] });
  const { board } = aufbau({ demo: repo });
  assert.equal(await board.anwenden('demo', zu(3), 'fertig'), 'anderes-projekt');
  const e = await board.abgleichRepo('demo');
  assert.deepEqual(e.neuImProjekt, [1]);
  assert.deepEqual(repo.projekte[1].spalten[0].karten, [1003]);
  assert.deepEqual(repo.projekte[2].spalten[0].karten, [1002]);
});
