# Änderungen

## [Unveröffentlicht]

### Neu
- Webhook für Issues (geöffnet, geschlossen, wieder geöffnet) und Pull Requests (geöffnet) mit
  HMAC-Prüfung.
- Abgleich aller Repos der Organisation im Takt, idempotent.
- Anmeldung als eigenes Bot-Konto über die Weboberfläche, Neuanmeldung bei abgelaufener Sitzung.
- Selbsttest beim Start und vor jedem Abgleich, Ergebnis unter `/health`.
- Dockerfile, docker-compose.yml, `.env.beispiel`, Tests und CI.
