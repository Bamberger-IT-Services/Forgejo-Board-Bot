# Änderungen

## 0.1.0 – 31.10.2026

Erstes Release. Live geprüft mit Forgejo 17.0.1: Issue anlegen → Backlog, PR mit
`Closes #n` → To review, schließen → Geschlossen, wieder öffnen → Backlog; Abgleich über drei
Repos idempotent.

### Neu
- Webhook für Issues (geöffnet, geschlossen, wieder geöffnet) und Pull Requests (geöffnet) mit
  HMAC-Prüfung.
- Abgleich aller Repos der Organisation im Takt, idempotent.
- Anmeldung als eigenes Bot-Konto über die Weboberfläche, Neuanmeldung bei abgelaufener Sitzung.
- Selbsttest beim Start und vor jedem Abgleich, Ergebnis unter `/health`.
- Dockerfile, docker-compose.yml, `.env.beispiel`, Tests und CI.
