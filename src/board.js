// Board-Logik: Projekt lesen, Karten zuordnen und verschieben, Abgleich, Selbsttest.
// Gleiche Aufrufe wie die Weboberfläche bzw. forgejo-board.js:
//   POST /{org}/{repo}/issues/projects            issue_ids=<ids>&id=<projekt>   (Issue ins Projekt)
//   POST /{org}/{repo}/projects/{pid}/{sid}/move  {"issues":[{issueID,sorting}]} (Karte in Spalte)
// Alles wird bei jedem Aufruf frisch gelesen; jeder Schritt prüft erst, ob er nötig ist (idempotent).

import { gueltigerName } from './konfig.js';
import { projekteLesen, spaltenLesen } from './html.js';
import { spalteFinden } from './spalten.js';
import { log } from './log.js';

export class Board {
  constructor(forgejo, org) {
    this.forgejo = forgejo;
    this.org = org;
  }

  basis(repo) {
    if (!gueltigerName(repo)) throw new Error(`Ungültiger Repo-Name „${repo}“`);
    return `/${this.org}/${repo}`;
  }

  // Erstes offenes Projekt des Repos mit Spalten und Karten, oder undefined.
  async projektLesen(repo) {
    const basis = this.basis(repo);
    const liste = await this.forgejo.seite(`${basis}/projects?state=open`);
    const projekt = projekteLesen(liste, basis)[0];
    if (!projekt) return undefined;
    const seite = await this.forgejo.seite(`${basis}/projects/${projekt.id}`);
    const spalten = spaltenLesen(seite).map((s) => ({ ...s, url: `${basis}/projects/${projekt.id}/${s.id}` }));
    const ort = new Map();
    for (const s of spalten) for (const k of s.karten) ort.set(k, s);
    return { repo, basis, projekt, spalten, ort };
  }

  async zuordnen(p, ids) {
    if (!ids.length) return;
    await this.forgejo.senden(`${p.basis}/issues/projects`, { form: { issue_ids: ids.join(','), id: p.projekt.id } });
  }

  async verschieben(p, spalte, ids) {
    if (!ids.length) return;
    const issues = ids.map((id, i) => ({ issueID: id, sorting: spalte.karten.length + i }));
    await this.forgejo.senden(`${spalte.url}/move`, { json: { issues } });
    for (const id of ids) {
      const alt = p.ort.get(id);
      if (alt) alt.karten = alt.karten.filter((k) => k !== id);
      spalte.karten.push(id);
      p.ort.set(id, spalte);
    }
  }

  // Ziel einer Karte gemäß Regel; gibt zurück, was geschah (für Log und Tests).
  // regel: 'offen'  – geöffnet/wieder geöffnet: fehlt sie oder steht sie in „Geschlossen“ → Backlog,
  //                   sonst bleibt sie (eine Sitzung hat sie vielleicht schon nach „In progress“ gesetzt)
  //        'fertig' – geschlossen → Geschlossen/Done
  //        'review' – PR geöffnet → Review, nur für offene Issues, die nicht in „Geschlossen“ stehen
  async anwenden(repo, issue, regel, eben = false) {
    const p = await this.projektLesen(repo);
    const kurz = { repo, nummer: issue.number, regel };
    if (!p) {
      log.info('Kein offenes Projekt im Repo – nichts zu tun', kurz);
      return 'kein-projekt';
    }
    const zielSchluessel = regel === 'offen' ? 'backlog' : regel;
    const ziel = spalteFinden(p.spalten, zielSchluessel);
    const fertig = spalteFinden(p.spalten, 'fertig');
    const aktuell = p.ort.get(issue.id);

    if (regel === 'review' && (issue.state === 'closed' || (aktuell && aktuell === fertig))) {
      log.info('Issue ist geschlossen – Review-Spalte übersprungen', kurz);
      return 'unveraendert';
    }
    if (!aktuell) {
      if (eben) throw new Error(`#${issue.number}: nach dem Zuordnen nicht im Projekt „${p.projekt.name}“`);
      await this.zuordnen(p, [issue.id]);
      log.info(`#${issue.number} ins Projekt ${p.projekt.name}`, kurz);
      // Frisch lesen: Forgejo legt die Karte in die Standardspalte.
      return this.anwenden(repo, issue, regel, true);
    }
    if (!ziel) {
      log.warnung(`Spalte „${zielSchluessel}“ gibt es im Projekt nicht – nichts verschoben`, { ...kurz, projekt: p.projekt.name });
      return eben ? 'zugeordnet' : 'spalte-fehlt';
    }
    if (aktuell === ziel) return eben ? 'zugeordnet' : 'unveraendert';
    if (regel === 'offen' && aktuell !== fertig && !eben) return 'unveraendert';
    await this.verschieben(p, ziel, [issue.id]);
    log.info(`#${issue.number} → ${p.projekt.name} › ${ziel.titel}`, kurz);
    return 'verschoben';
  }

  async issuesLesen(repo) {
    return this.forgejo.apiAlle(`/repos/${this.org}/${encodeURIComponent(repo)}/issues?state=all&type=issues`);
  }

  // Wie forgejoBoard.abgleich: fehlende Issues ins Projekt (offene nach Backlog), geschlossene nach
  // „Geschlossen“, wieder geöffnete aus „Geschlossen“ nach Backlog. Andere Spalten bleiben unberührt.
  async abgleichRepo(repo) {
    let p = await this.projektLesen(repo);
    if (!p) return undefined;
    const issues = await this.issuesLesen(repo);
    const fehlend = issues.filter((i) => !p.ort.has(i.id));
    if (fehlend.length) {
      await this.zuordnen(p, fehlend.map((i) => i.id));
      p = await this.projektLesen(repo);
      if (!p) return undefined;
    }
    const fertig = spalteFinden(p.spalten, 'fertig');
    const backlog = spalteFinden(p.spalten, 'backlog');
    const neuOffen = backlog ? fehlend.filter((i) => i.state === 'open' && p.ort.get(i.id) !== backlog) : [];
    const zuFertig = fertig ? issues.filter((i) => i.state === 'closed' && p.ort.get(i.id) !== fertig) : [];
    const wiederOffen = backlog && fertig ? issues.filter((i) => i.state === 'open' && p.ort.get(i.id) === fertig) : [];
    if (backlog) await this.verschieben(p, backlog, [...new Set([...neuOffen, ...wiederOffen].map((i) => i.id))]);
    if (fertig) await this.verschieben(p, fertig, zuFertig.map((i) => i.id));

    const nr = (l) => l.map((i) => i.number);
    const ergebnis = {
      repo,
      projekt: p.projekt.name,
      neuImProjekt: nr(fehlend),
      nachGeschlossen: nr(zuFertig),
      nachBacklog: nr(wiederOffen),
    };
    const hinweise = [];
    if (!fertig) hinweise.push('keine Spalte für Geschlossene');
    if (!backlog) hinweise.push('keine Backlog-Spalte');
    if (hinweise.length) log.warnung(`Abgleich ${repo}: ${hinweise.join('; ')}`, { repo, projekt: p.projekt.name });
    if (fehlend.length || zuFertig.length || wiederOffen.length) log.info(`Abgleich ${repo}: Änderungen`, ergebnis);
    return ergebnis;
  }

  async reposLesen() {
    const repos = await this.forgejo.apiAlle(`/orgs/${this.org}/repos`);
    return repos.filter((r) => !r.archived && r.has_projects !== false && gueltigerName(r.name)).map((r) => r.name);
  }

  async abgleichAlle() {
    const ergebnisse = [];
    let fehler = 0;
    for (const repo of await this.reposLesen()) {
      try {
        const e = await this.abgleichRepo(repo);
        if (e) ergebnisse.push(e);
      } catch (err) {
        fehler++;
        log.fehler(`Abgleich ${repo} fehlgeschlagen`, { repo, fehler: err.message });
      }
    }
    return { repos: ergebnisse.length, fehler };
  }

  // Anmeldung, Projektseite lesen, erwartete Seitenelemente prüfen. Wirft mit klarer Meldung.
  async selbsttest(repoVorgabe) {
    await this.forgejo.anmelden();
    const kandidaten = repoVorgabe ? [repoVorgabe] : await this.reposLesen();
    for (const repo of kandidaten) {
      const p = await this.projektLesen(repo);
      if (!p) continue;
      if (!p.spalten.length) {
        throw new Error(`Projektseite ${repo} › ${p.projekt.name}: keine Spalten erkannt (.project-column) – Markup nach Forgejo-Update geändert?`);
      }
      if (p.spalten.some((s) => !s.titel)) {
        throw new Error(`Projektseite ${repo}: Spaltentitel nicht erkannt (.project-column-title-label) – Markup geändert?`);
      }
      // Kartenzahl im Spaltenkopf gegen erkannte Karten: fällt auf, wenn .issue-card nicht mehr passt.
      const ohneZahl = p.spalten.filter((s) => s.anzahl === undefined).map((s) => s.titel);
      if (ohneZahl.length) {
        throw new Error(`Projektseite ${repo}: Kartenzahl im Spaltenkopf fehlt (${ohneZahl.join(', ')}) – Markup geändert?`);
      }
      const abweichend = p.spalten.filter((s) => s.anzahl !== s.karten.length);
      if (abweichend.length) {
        const s = abweichend[0];
        throw new Error(`Projektseite ${repo} › ${s.titel}: ${s.anzahl} Karten angezeigt, ${s.karten.length} erkannt (.issue-card[data-issue]) – Markup geändert?`);
      }
      const gelesen = p.spalten.reduce((n, s) => n + s.karten.length, 0);
      return { repo, projekt: p.projekt.name, spalten: p.spalten.map((s) => s.titel), karten: gelesen };
    }
    throw new Error(repoVorgabe ? `Im Repo ${repoVorgabe} gibt es kein offenes Projekt` : 'Kein Repo mit offenem Projekt gefunden');
  }
}
