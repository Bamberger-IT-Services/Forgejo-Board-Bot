# Forgejo-Board-Bot

Pflegt die Projekt-Boards einer Forgejo-Organisation automatisch. Forgejo (Stand 17.x) hat keine
API für Projekte und verschiebt Karten nicht selbst; der Bot erledigt das serverseitig über
dieselben Aufrufe wie die Weboberfläche.

**Stand:** Version 0.1.0 · 31.10.2026 · getestet mit Forgejo 17.0.1

- Ein **Webhook der Organisation** meldet neue, geschlossene und wieder geöffnete Issues sowie
  neue Pull Requests; der Bot verschiebt die Karte sofort.
- Ein **Abgleich aller Repos** (Vorgabe alle 15 Minuten) zieht nach, was ein Webhook verpasst hat.
- Ein **Selbsttest** beim Start und vor jedem Abgleich prüft Anmeldung und Seitenaufbau;
  das Ergebnis steht unter `/health`.
- Node.js ohne npm-Abhängigkeiten, ein kleiner Container.

## Funktionsweise

| Ereignis | Wirkung im ersten offenen Projekt des Repos |
|---|---|
| Issue geöffnet | Karte ins Projekt, Spalte **Backlog**. Steht sie schon in einer anderen Spalte (z. B. „In progress“), bleibt sie dort. |
| Issue geschlossen | Spalte **Geschlossen/Done** |
| Issue wieder geöffnet | aus Geschlossen/Done zurück nach **Backlog** |
| Pull Request geöffnet mit `Closes #n`, `Fixes #n`, `Resolves #n` (auch `Org/Repo#n` oder die volle Adresse) | Issue n nach **Review**, falls es die Spalte gibt und das Issue offen ist |
| Abgleich (Takt) | fehlende Issues ins Projekt (offene nach Backlog), geschlossene nach Geschlossen/Done, offene aus Geschlossen/Done nach Backlog |

**„In progress“** und **„To do“** setzt der Bot nie – das bleibt bei den Menschen bzw. Sitzungen.

**Spalten** findet der Bot über Stichworte (Groß-/Kleinschreibung egal, erst exakter Titel, dann
„enthält“), nie über feste Nummern:

| Zweck | Stichworte |
|---|---|
| Backlog | `backlog` |
| To do | `to do`, `todo`, `offen` |
| In progress | `in progress`, `in arbeit`, `arbeit` |
| Review | `to review`, `review`, `prüfung` |
| Geschlossen | `geschlossen`, `done`, `erledigt`, `fertig` |

Fehlt die Zielspalte, verschiebt der Bot nichts und schreibt eine Warnung ins Protokoll.
Hat ein Repo mehrere offene Projekte, pflegt er das erste der Projektliste. Ein Issue steht in
Forgejo in höchstens einem Projekt: Issues, die schon in einem anderen offenen oder geschlossenen
Projekt des Repos stehen, lässt der Bot dort (anders als `forgejoBoard.abgleich`). Repos ohne
offenes Projekt, archivierte Repos und Repos mit abgeschalteten Projekten übergeht er.

Bei jedem Webhook liest der Bot den aktuellen Zustand des Issues neu; ein verspätetes
„geschlossen“ verschiebt also kein inzwischen wieder geöffnetes Issue. Ist der Selbsttest rot,
schreibt der Bot nichts.

Alles Schreibende läuft nacheinander durch eine Warteschlange, und jeder Schritt prüft erst, ob
er nötig ist. Der Bot darf also beliebig oft laufen (idempotent). Hintergrund der Regeln:
[`DECISIONS.md`](DECISIONS.md).

## Schnellstart lokal

```bash
node --test test/*.test.js          # Tests ohne Netz, < 1 s
cp .env.beispiel .env               # Platzhalter ersetzen, .env nie committen
set -a; . ./.env; set +a
node src/main.js                    # dann: curl -s localhost:8080/health
```

Voraussetzung: Node.js 22 oder neuer. Für den Betrieb siehe Einrichtung.

## Einrichtung

Benötigt: einen Docker-Host, von dem aus Forgejo den Bot und der Bot Forgejo erreicht.

### 1. Konto für den Bot

1. In Forgejo ein eigenes Konto anlegen, z. B. `board-bot`, mit langem Zufallspasswort.
   **Kein** Administrator, **keine** Zwei-Faktor-Anmeldung (die Anmeldung läuft über das
   normale Formular).
2. In der Organisation ein Team anlegen, z. B. „Board-Bot“, mit Zugriff auf **alle Repositories**
   und **Schreibrecht** auf Issues und Projekte (Code lesen genügt). Das Bot-Konto aufnehmen.
3. Optional: Als Bot-Konto ein API-Token erzeugen (Einstellungen › Anwendungen) mit den
   Bereichen `read:organization`, `read:issue`, `read:repository`, und als `BOT_TOKEN` eintragen.
   Ohne Token liest der Bot die API mit Benutzername und Passwort.

### 2. Bot starten

```bash
git clone <adresse-dieses-repos> forgejo-board-bot
cd forgejo-board-bot
cp .env.beispiel .env
chmod 600 .env
openssl rand -hex 32                # Ergebnis als WEBHOOK_SECRET in .env eintragen
nano .env                           # FORGEJO_URL, FORGEJO_ORG, BOT_BENUTZER, BOT_PASSWORT, BOT_BINDUNG …
docker compose up -d --build
docker compose logs -f              # „Selbsttest bestanden“, dann „Abgleich fertig“
curl -s http://<BOT_BINDUNG>:<BOT_PORT>/health
```

`BOT_BINDUNG` ist die Adresse des Docker-Hosts, über die Forgejo den Bot erreicht. Läuft
Forgejo als Container im selben Docker-Netz, kann der Webhook auch direkt auf
`http://forgejo-board-bot:8080/webhook` zeigen (dann den Bot in das Netz von Forgejo hängen).

### 3. Webhook in der Organisation

Organisation › Einstellungen › Webhooks › Webhook hinzufügen › **Forgejo**:

| Feld | Wert |
|---|---|
| Ziel-URL | `http://<BOT_BINDUNG>:<BOT_PORT>/webhook` |
| HTTP-Methode | `POST` |
| POST-Content-Type | `application/json` |
| Geheimnis | derselbe Wert wie `WEBHOOK_SECRET` in `.env` |
| Auslösen bei | Benutzerdefinierte Ereignisse: **Issues** und **Pull Requests** |
| Branch-Filter | `*` |
| Aktiv | ja |

Danach „Test-Zustellung“: Der Bot antwortet mit 202 („kein Board-Auftrag“ ist dabei richtig).

Meldet Forgejo, die Adresse sei nicht erlaubt: Forgejo schickt Webhooks standardmäßig nur an
externe Adressen. In der `app.ini` von Forgejo unter `[webhook]` den Bot erlauben, z. B.
`ALLOWED_HOST_LIST = external, 192.0.2.10` (Adresse des Bots) oder `private`, dann Forgejo neu
starten.

## Betrieb

- **Zustand:** `GET /health` → 200 und `"ok": true`, sonst 503 mit der Meldung des Selbsttests
  (Einzelheiten im Protokoll). Der Container hat
  einen Healthcheck darauf (`docker ps` zeigt `healthy`).
- **Protokoll:** `docker compose logs --since 1h`. Eine JSON-Zeile je Eintrag; Passwort, Token
  und Secret werden vor der Ausgabe geschwärzt.
- **Abgleich von Hand:** `docker compose restart` – beim Start laufen Selbsttest und Abgleich.
- Der Bot hält keinen Zustand auf der Platte; der Container ist schreibgeschützt.

| Einstellung | Bedeutung | Vorgabe |
|---|---|---|
| `FORGEJO_URL` | Adresse der Instanz | – (Pflicht) |
| `FORGEJO_ORG` | Organisation | – (Pflicht) |
| `BOT_BENUTZER`, `BOT_PASSWORT` | Bot-Konto | – (Pflicht) |
| `BOT_TOKEN` | API-Token des Bot-Kontos zum Lesen | leer |
| `WEBHOOK_SECRET` | Secret des Webhooks, ≥ 24 Zeichen | – (Pflicht) |
| `ABGLEICH_MINUTEN` | Takt des Abgleichs, `0` = aus | `15` |
| `SELBSTTEST_REPO` | Repo für den Selbsttest | erstes Repo mit offenem Projekt |
| `BOT_BINDUNG`, `BOT_PORT` | Adresse und Port auf dem Host (nur Compose) | `127.0.0.1`, `8080` |

## Update

**Bot:** Der Server läuft auf einem Release-Tag (`vX.Y.Z`), nicht auf einem Branch.

```bash
cd forgejo-board-bot
git fetch --tags
git checkout vX.Y.Z                 # neues Release, z. B. v0.1.0
docker compose up -d --build
docker compose logs --since 5m      # „Selbsttest bestanden“
```

Rückweg: `git checkout <vorheriges-tag>` und erneut `docker compose up -d --build`. Die `.env`
bleibt dabei unberührt; ein Release, das neue Einstellungen braucht, sagt es im `CHANGELOG.md`.

**Forgejo:** Nach jedem Forgejo-Update `/health` prüfen. Der Selbsttest merkt, wenn sich die
Anmeldung oder der Aufbau der Projektseite geändert hat (z. B. „3 Karten angezeigt, 0 erkannt“).

## Fehlerfall

| Meldung in `/health` bzw. im Protokoll | Ursache | Abhilfe |
|---|---|---|
| `Anmeldung abgelehnt` | Passwort falsch, Konto gesperrt oder mit Zwei-Faktor | Konto prüfen, `.env` anpassen, `docker compose up -d` |
| `Anmeldeseite: Formularfelder … nicht gefunden` | Forgejo-Update hat das Formular geändert | Issue anlegen; bis zur Anpassung das Browser-Skript nutzen |
| `keine Spalten erkannt`, `Spaltentitel nicht erkannt`, `… angezeigt, … erkannt` | Forgejo-Update hat die Projektseite geändert | wie oben; Anpassung in `src/html.js` |
| `Kein Repo mit offenem Projekt gefunden` | noch kein Projekt in der Organisation | Projekt anlegen oder `SELBSTTEST_REPO` setzen |
| `… HTTP 403/404` beim Verschieben | Bot-Konto ohne Schreibrecht auf das Repo | Team-Rechte prüfen (alle Repos, Schreiben) |
| `Webhook abgelehnt: Signatur fehlt oder falsch` | Secret im Webhook und in `.env` verschieden, oder fremder Aufruf | Secret angleichen |
| Webhook kommt nie an | Adresse nicht erreichbar oder von Forgejo gesperrt | Einrichtung › 3 (`ALLOWED_HOST_LIST`), Firewall |

Ist `/health` rot, verschiebt der Bot nichts Verlässliches mehr. Ersatz bis zur Behebung ist das
Browser-Skript `forgejo-board.js` (gemeinsame Anweisungen der Organisation, Anweisung 08 ›
Projekt-Board). Verpasste Änderungen holt der nächste Abgleich nach, sobald der Bot wieder grün ist.

## Sicherheit

- Jeder Webhook wird über die HMAC-SHA256-Signatur (`X-Forgejo-Signature`) mit dem Secret
  geprüft; ohne gültige Signatur antwortet der Bot mit 401 und tut nichts.
- Ereignisse fremder Organisationen werden ignoriert, Repo-Namen geprüft.
- Zugangsdaten nur aus Umgebungsvariablen; nie im Repo, nie im Protokoll.
- Container ohne Root, schreibgeschützt, ohne Linux-Capabilities, mit Speicher- und
  Prozessgrenze. Der Port ist nur an die angegebene Adresse gebunden.

## Entwicklung

Regeln für Beiträge und Aufbau des Codes: [`CLAUDE.md`](CLAUDE.md). Die CI prüft nur PRs aus
diesem Repo; PRs aus Forks laufen dort nicht, weil Forgejo-Runner selbst gehostet sind. Änderungen:
[`CHANGELOG.md`](CHANGELOG.md).
