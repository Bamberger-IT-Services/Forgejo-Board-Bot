// Ablauf: Warteschlange für Board-Aufträge, regelmäßiger Abgleich, Selbsttest und Zustand für /health.
// Alles Schreibende läuft nacheinander durch eine Warteschlange, damit sich Webhook und Abgleich
// nicht gegenseitig die Karten verschieben.

import { log } from './log.js';

export class Bot {
  constructor(board, { selbsttestRepo } = {}) {
    this.board = board;
    this.selbsttestRepo = selbsttestRepo;
    this.kette = Promise.resolve();
    this.wartend = 0;
    this.zustand = {
      selbsttest: { ok: false, zeit: undefined, fehler: 'noch nicht gelaufen' },
      abgleich: { zeit: undefined, ok: undefined, repos: 0, fehler: 0 },
      auftraege: { erledigt: 0, fehlgeschlagen: 0 },
    };
  }

  einreihen(arbeit) {
    this.wartend++;
    const lauf = this.kette.then(arbeit).finally(() => { this.wartend--; });
    this.kette = lauf.catch(() => {});
    return lauf;
  }

  // Ein Auftrag aus dem Webhook. Fehlt das Issue (PR-Verweis), wird es per API nachgelesen.
  auftrag(a) {
    return this.einreihen(async () => {
      const kurz = { repo: a.repo, nummer: a.nummer, regel: a.regel, lieferung: a.lieferung };
      try {
        let issue = a.issue;
        if (!issue) {
          const roh = await this.board.forgejo.api(`/repos/${this.board.org}/${encodeURIComponent(a.repo)}/issues/${a.nummer}`);
          if (roh.pull_request) {
            log.info('Verweis zeigt auf einen PR, nicht auf ein Issue – übersprungen', kurz);
            return 'unveraendert';
          }
          issue = { id: roh.id, number: roh.number, state: roh.state };
        }
        const ergebnis = await this.board.anwenden(a.repo, issue, a.regel);
        this.zustand.auftraege.erledigt++;
        return ergebnis;
      } catch (err) {
        this.zustand.auftraege.fehlgeschlagen++;
        log.fehler('Auftrag fehlgeschlagen – der nächste Abgleich zieht nach', { ...kurz, fehler: err.message });
        return 'fehler';
      }
    });
  }

  selbsttest() {
    return this.einreihen(async () => {
      try {
        const e = await this.board.selbsttest(this.selbsttestRepo);
        this.zustand.selbsttest = { ok: true, zeit: new Date().toISOString(), ...e };
        log.info('Selbsttest bestanden', e);
      } catch (err) {
        this.zustand.selbsttest = { ok: false, zeit: new Date().toISOString(), fehler: err.message };
        log.fehler('SELBSTTEST FEHLGESCHLAGEN – Board-Pflege per Bot unsicher, Ersatz: Browser-Skript forgejo-board.js', { fehler: err.message });
      }
      return this.zustand.selbsttest.ok;
    });
  }

  abgleich() {
    return this.einreihen(async () => {
      const beginn = Date.now();
      try {
        const e = await this.board.abgleichAlle();
        this.zustand.abgleich = { zeit: new Date().toISOString(), ok: e.fehler === 0, ...e, dauerMs: Date.now() - beginn };
        log.info('Abgleich fertig', this.zustand.abgleich);
      } catch (err) {
        this.zustand.abgleich = { zeit: new Date().toISOString(), ok: false, repos: 0, fehler: 1, meldung: err.message };
        log.fehler('Abgleich fehlgeschlagen', { fehler: err.message });
      }
    });
  }

  // Für /health: rot, wenn der Selbsttest fehlschlägt oder der letzte Abgleich Fehler hatte.
  gesundheit() {
    const { selbsttest, abgleich, auftraege } = this.zustand;
    const ok = selbsttest.ok && abgleich.ok !== false;
    return { ok, selbsttest, abgleich, auftraege, warteschlange: this.wartend };
  }
}
