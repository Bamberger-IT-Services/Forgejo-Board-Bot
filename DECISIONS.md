# Entscheidungen

Nummern werden fortlaufend vergeben und nie neu. Eine abgelöste Entscheidung bleibt stehen und
verweist auf die neue.

## ADR-0001 · Node.js ohne Abhängigkeiten, HTML ohne Bibliothek lesen

- **Datum:** 30.10.2026 · **Status:** angenommen
- **Ausgangslage:** Ein kleiner Dienst, der Webhooks annimmt, ein paar Seiten von Forgejo liest
  und zwei Formular-Aufrufe schickt. Jede Abhängigkeit muss gepflegt und geprüft werden.
- **Möglichkeiten:** (a) Node.js mit Standardbibliothek; (b) Python mit Standardbibliothek;
  (c) Node.js mit HTML-Parser (z. B. cheerio).
- **Abwägung:** Node.js hat `fetch`, `crypto`, `http` und einen Testläufer eingebaut und ist nah
  am bestehenden Browser-Skript `forgejo-board.js` (gleiche Logik, gleiche Stichworte). Ein
  HTML-Parser wäre robuster, gesucht werden aber nur drei stabile Merkmale
  (`.project-column[data-id]`, `.project-column-title-label`, `.issue-card[data-issue]`).
- **Folgen:** Kein `npm install`, kleines Image. Markup-Änderungen nach Forgejo-Updates fängt der
  Selbsttest (Kartenzahl im Spaltenkopf gegen erkannte Karten) ab und meldet sie in `/health`.

## ADR-0002 · Board über die Weboberfläche mit eigenem Konto

- **Datum:** 30.10.2026 · **Status:** angenommen
- **Ausgangslage:** Forgejo 17 hat keine API für Projekt-Boards.
- **Möglichkeiten:** (a) Weboberfläche mit Sitzungs-Cookie eines eigenen Kontos;
  (b) direkt in die Datenbank schreiben; (c) weiter nur das Browser-Skript.
- **Abwägung:** (b) umgeht Rechte und Ereignisse von Forgejo und bricht bei Schemaänderungen
  still. (a) nutzt genau die Aufrufe, die Forgejo selbst nutzt, mit den Rechten eines normalen
  Kontos.
- **Folgen:** Eigenes Konto mit Schreibrecht über ein Team, ohne Administratorrecht, ohne
  Zwei-Faktor-Anmeldung (Formular-Anmeldung). Zugangsdaten nur in `.env`. Lesen über die API
  (Basic-Auth oder optional Token). Läuft die Sitzung ab, meldet sich der Bot neu an.

## ADR-0003 · Regeln: Sitzungen haben Vorrang vor „geöffnet“

- **Datum:** 30.10.2026 · **Status:** angenommen
- **Ausgangslage:** Webhooks kommen asynchron. Eine Sitzung kann ein Issue anlegen und sofort
  nach „In progress“ setzen, bevor der Webhook „geöffnet“ verarbeitet ist.
- **Entscheidung:** „Geöffnet“ und „wieder geöffnet“ verschieben nur Karten, die nicht im
  Projekt stehen oder in „Geschlossen“ stehen, nach Backlog. Karten in anderen Spalten bleiben.
  „Geschlossen“ verschiebt immer. „PR geöffnet“ verschiebt nur offene Issues, und nur wenn es
  eine Review-Spalte gibt. Der Abgleich verhält sich wie `forgejoBoard.abgleich`, legt fehlende
  offene Issues zusätzlich nach Backlog.
- **Folgen:** Alle Aufträge laufen nacheinander durch eine Warteschlange; jeder Schritt prüft
  erst, ob er nötig ist (idempotent).

## ADR-0004 · Kein Entwicklerdashboard, Doku in README

- **Datum:** 30.10.2026 · **Status:** angenommen
- **Ausgangslage:** Anweisung 00 sieht ein Entwicklerdashboard vor, Anweisung 06 ein Doku-Gerüst
  mit Handbuch und eigenen Dateien für Einrichtung und Update.
- **Entscheidung:** Für einen Dienst ohne Oberfläche reichen `DECISIONS.md` und eine README mit
  Einrichtung, Betrieb, Update und Fehlerfall. Aufgaben stehen wie überall als Issues.
