// Einstieg: Konfiguration lesen, Selbsttest, Server starten, Abgleich beim Start und dann regelmäßig.

import { konfigLesen } from './konfig.js';
import { log, geheimnisRegistrieren } from './log.js';
import { Forgejo } from './forgejo.js';
import { Board } from './board.js';
import { Bot } from './bot.js';
import { serverErstellen } from './server.js';

let konfig;
try {
  konfig = konfigLesen();
} catch (err) {
  log.fehler(err.message);
  process.exit(2);
}
geheimnisRegistrieren(konfig.passwort, konfig.secret, konfig.token);

const forgejo = new Forgejo(konfig);
const board = new Board(forgejo, konfig.org);
const bot = new Bot(board, { selbsttestRepo: konfig.selbsttestRepo });

const server = serverErstellen({
  secret: konfig.secret,
  org: konfig.org,
  einreihen: (a) => { bot.auftrag(a); },
  gesundheit: () => bot.gesundheit(),
});

server.listen(konfig.port, () => {
  log.info('Board-Bot gestartet', { port: konfig.port, abgleichMinuten: konfig.abgleichMinuten });
});

// Selbsttest und Abgleich: beim Start und dann im Takt. Der Selbsttest läuft vor jedem Abgleich mit,
// damit /health ein Forgejo-Update bemerkt, ohne dass der Bot neu startet.
async function runde() {
  if (await bot.selbsttest()) await bot.abgleich();
}
runde();
if (konfig.abgleichMinuten > 0) setInterval(runde, konfig.abgleichMinuten * 60_000).unref();

const beenden = (signal) => {
  log.info(`Beende (${signal})`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGTERM', () => beenden('SIGTERM'));
process.on('SIGINT', () => beenden('SIGINT'));
