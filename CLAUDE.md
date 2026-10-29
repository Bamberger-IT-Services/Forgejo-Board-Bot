# CLAUDE.md – Forgejo-Board-Bot

Es gelten die gemeinsamen Anweisungen im Repo `Public` der Organisation, Ordner `anweisungen/`
(lokal `../Public/anweisungen`, 00–09, Vorlagen). Kurz: Deutsch und „du“; Entscheidungen per
Auswahlfrage, eine je Nachricht; Aufgaben als Issues in diesem Repo (Anweisung 08); Branches
`develop` (Standard) / `main` / `feature/<nr>-…` / `fix/<nr>-…` / `release/X.Y.Z`; Merge nach
`develop` per PR selbst (mit `forgejo-merge.sh` aus den lokalen Werkzeugen), nach `main` nur mit
Freigabe. Forgejo-Adresse, Konten und Zugänge stehen nicht hier (öffentliches Repo), sondern in
der lokalen Umgebung der Sitzung.

## Was der Bot tut

Pflegt Projekt-Boards in Forgejo serverseitig, weil Forgejo dafür keine API hat: Webhook der
Organisation (Issues, Pull Requests) plus regelmäßiger Abgleich. Ablauf und Regeln: `README.md`
› Funktionsweise. Er ersetzt das Browser-Skript `forgejo-board.js` aus `Public/anweisungen/werkzeuge`
im Normalfall; das Skript bleibt der Ersatz, wenn `/health` rot ist, und für „In progress“.
Beide nutzen dieselben Stichworte für Spalten (`src/spalten.js` ↔ `STICHWORTE` im Skript) –
ändert sich eins, das andere mitziehen.

## Modellwahl (Anweisung 09)

- `routine` (Haiku): Labels, Issues, CI-Protokolle, Tippfehler, `CHANGELOG.md`.
- `umsetzer` (Sonnet): Issues mit klaren Akzeptanzkriterien in `src/`, Tests, Doku.
- `architekt` (Opus): Signaturprüfung (`src/signatur.js`, `src/server.js`), Anmeldung und Sitzung
  (`src/forgejo.js`), Geheimnisse und `.env`, `Dockerfile`/`docker-compose.yml`, Anpassung an ein
  neues Forgejo-Markup (`src/html.js`), Review größerer PRs vor dem Merge.

## Projektregeln

- **Öffentliches Repository:** keine echten Adressen, Rechner-, Konto-, Organisations- oder
  Personennamen, keine Zugangsdaten – auch nicht in Tests, Beispielen, Doku, Bildern, Logs.
  Platzhalter: `https://forgejo.example`, `beispiel-org`, `board-bot`, Adressen aus `192.0.2.0/24`.
  **Vor jedem Commit:** `gitleaks git --redact` (bzw. `gitleaks dir .`) und
  `git grep -nE '192\.168|10\.[0-9]+\.[0-9]+\.[0-9]+'` sowie eine Suche nach den internen Namen
  (Instanz, Organisation, Konten, Personen).
- Alle Einstellungen nur aus Umgebungsvariablen (`.env` auf dem Server); im Repo nur `.env.beispiel`.
- **Keine npm-Abhängigkeiten** (ADR-0001). Node.js ≥ 22, Tests mit `node:test`.
- Der Bot bleibt allgemein: keine festen Spalten- oder Projektnummern, keine Annahmen über eine
  bestimmte Instanz.
- CI läuft auf `ubuntu-latest`, nie auf einem Runner mit Zugang zum internen Netz.

## Abweichungen von den Anweisungen

| Anweisung | Abweichung | Beleg |
|---|---|---|
| 02 Stack (Next.js, Postgres) | Node.js ohne Abhängigkeiten, kein Speicher | ADR-0001 |
| 00 Entwicklerdashboard | kein `entwickler-dashboard/`; Entscheidungen in `DECISIONS.md` | ADR-0004 |
| 06 Doku-Gerüst (`docs/handbuch`, `docs/EINRICHTUNG.md`, `docs/UPDATE.md`) | alles in `README.md` (Einrichtung, Betrieb, Update, Fehlerfall) | ADR-0004 |

## Arbeiten

```bash
node --test test/*.test.js        # alle Tests, ohne Netz (nachgebautes Forgejo in test/attrappe.js)
docker build -t forgejo-board-bot:test .
set -a; . ./.env; set +a; node src/main.js   # lokal gegen eine Instanz (.env nie committen, nie ausgeben)
```

Aufbau: `src/main.js` (Start) → `bot.js` (Warteschlange, Takt, /health) → `board.js` (Regeln) →
`forgejo.js` (Anmeldung, Web, API) und `html.js` (Markup lesen); `server.js` (Webhook),
`ereignis.js` (Ereignis → Auftrag), `signatur.js`, `spalten.js`, `konfig.js`, `log.js`.
