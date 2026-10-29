// Einstellungen ausschließlich aus Umgebungsvariablen (.env auf dem Server, nie im Repo).
// Fehlt etwas oder ist es ungültig, startet der Bot nicht.

const NAME = /^(?!\.{1,2}$)[A-Za-z0-9._-]+$/;

export function konfigLesen(env = process.env) {
  const fehler = [];
  const pflicht = (schluessel) => {
    const wert = (env[schluessel] ?? '').trim();
    if (!wert) fehler.push(`${schluessel} fehlt`);
    return wert;
  };

  const url = pflicht('FORGEJO_URL').replace(/\/+$/, '');
  if (url && !/^https?:\/\/[^/\s]+(\/[^\s]*)?$/.test(url)) fehler.push('FORGEJO_URL muss mit http:// oder https:// beginnen');

  const org = pflicht('FORGEJO_ORG');
  if (org && !NAME.test(org)) fehler.push('FORGEJO_ORG enthält ungültige Zeichen');

  const benutzer = pflicht('BOT_BENUTZER');
  const passwort = env.BOT_PASSWORT ?? '';
  if (!passwort) fehler.push('BOT_PASSWORT fehlt');

  const secret = env.WEBHOOK_SECRET ?? '';
  if (!secret) fehler.push('WEBHOOK_SECRET fehlt');
  else if (secret.length < 24) fehler.push('WEBHOOK_SECRET ist zu kurz (mindestens 24 Zeichen)');

  const zahl = (schluessel, vorgabe, min, max) => {
    const roh = (env[schluessel] ?? '').trim();
    if (!roh) return vorgabe;
    const n = Number(roh);
    if (!Number.isInteger(n) || n < min || n > max) {
      fehler.push(`${schluessel} muss eine ganze Zahl von ${min} bis ${max} sein`);
      return vorgabe;
    }
    return n;
  };

  const konfig = {
    url,
    org,
    benutzer,
    passwort,
    secret,
    // Optional: API-Token des Bot-Kontos zum Lesen. Ohne Token liest der Bot mit Benutzername und Passwort.
    token: (env.BOT_TOKEN ?? '').trim() || undefined,
    port: zahl('PORT', 8080, 1, 65535),
    abgleichMinuten: zahl('ABGLEICH_MINUTEN', 15, 0, 1440),
    // Optional: Repo für den Selbsttest; sonst das erste Repo mit offenem Projekt.
    selbsttestRepo: (env.SELBSTTEST_REPO ?? '').trim() || undefined,
  };
  if (konfig.selbsttestRepo && !NAME.test(konfig.selbsttestRepo)) fehler.push('SELBSTTEST_REPO enthält ungültige Zeichen');

  if (fehler.length) throw new Error(`Konfiguration unvollständig: ${fehler.join('; ')}`);
  return konfig;
}

export const gueltigerName = (n) => NAME.test(String(n ?? ''));
