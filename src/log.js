// Protokoll als eine JSON-Zeile je Eintrag auf stdout (docker logs).
// Geheimnisse, die beim Start registriert werden, werden vor der Ausgabe ersetzt.

const geheim = new Set();

export function geheimnisRegistrieren(...werte) {
  for (const w of werte) if (typeof w === 'string' && w.length >= 4) geheim.add(w);
}

export function schwaerzen(text) {
  let t = String(text);
  for (const g of geheim) t = t.split(g).join('***');
  return t;
}

function schreiben(stufe, nachricht, daten) {
  if (process.env.BOT_LOG_STILL === '1') return; // nur für die Tests
  const eintrag = { zeit: new Date().toISOString(), stufe, nachricht, ...(daten || {}) };
  const zeile = schwaerzen(JSON.stringify(eintrag));
  (stufe === 'fehler' ? process.stderr : process.stdout).write(`${zeile}\n`);
}

export const log = {
  info: (n, d) => schreiben('info', n, d),
  warnung: (n, d) => schreiben('warnung', n, d),
  fehler: (n, d) => schreiben('fehler', n, d),
};
