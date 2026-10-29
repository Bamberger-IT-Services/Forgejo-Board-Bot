// Zugriff auf Forgejo: Weboberfläche mit Sitzungs-Cookie (für das Board), API zum Lesen.
// Die Anmeldung läuft über das normale Formular /user/login. Läuft die Sitzung ab, meldet sich
// der Bot beim nächsten schreibenden Aufruf neu an und versucht es genau einmal erneut.

import { csrfLesen } from './html.js';

const ZEITLIMIT_MS = 20_000;

export class ForgejoFehler extends Error {
  constructor(nachricht, status) {
    super(nachricht);
    this.status = status;
  }
}

export class Forgejo {
  constructor({ url, benutzer, passwort, token }, abrufen = fetch) {
    this.url = url;
    this.benutzer = benutzer;
    this.passwort = passwort;
    this.token = token;
    this.abrufen = abrufen;
    this.cookies = new Map();
    this.angemeldet = false;
  }

  cookieKopf() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  cookiesMerken(antwort) {
    const liste = typeof antwort.headers.getSetCookie === 'function' ? antwort.headers.getSetCookie() : [];
    for (const c of liste) {
      const [paar, ...attribute] = c.split(';');
      const i = paar.indexOf('=');
      if (i < 1) continue;
      const name = paar.slice(0, i).trim();
      const wert = paar.slice(i + 1).trim();
      const abgelaufen = attribute.some((a) => /^\s*max-age=(0|-\d+)\s*$/i.test(a)) || wert === '';
      if (abgelaufen) this.cookies.delete(name);
      else this.cookies.set(name, wert);
    }
  }

  async web(pfad, { methode = 'GET', form, json } = {}) {
    const kopf = { 'User-Agent': 'forgejo-board-bot' };
    if (this.cookies.size) kopf.Cookie = this.cookieKopf();
    let body;
    if (form) {
      kopf['Content-Type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(form).toString();
    } else if (json) {
      kopf['Content-Type'] = 'application/json';
      body = JSON.stringify(json);
    }
    const antwort = await this.abrufen(`${this.url}${pfad}`, {
      method: methode,
      headers: kopf,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(ZEITLIMIT_MS),
    });
    this.cookiesMerken(antwort);
    return antwort;
  }

  // Leitet die Antwort zur Anmeldeseite um, ist die Sitzung weg.
  static zurAnmeldung(antwort) {
    if (antwort.status === 401) return true;
    if (antwort.status < 300 || antwort.status >= 400) return false;
    const ziel = antwort.headers.get('location') || '';
    return /\/user\/login(\?|$)/.test(ziel);
  }

  async anmelden() {
    this.cookies.clear();
    this.angemeldet = false;
    const seite = await this.web('/user/login');
    if (!seite.ok) throw new ForgejoFehler(`Anmeldeseite: HTTP ${seite.status}`, seite.status);
    const html = await seite.text();
    if (!/name="user_name"/.test(html) || !/name="password"/.test(html)) {
      throw new ForgejoFehler('Anmeldeseite: Formularfelder user_name/password nicht gefunden (Forgejo-Update?)');
    }
    const form = { user_name: this.benutzer, password: this.passwort, remember: 'on' };
    const csrf = csrfLesen(html);
    if (csrf) form._csrf = csrf;

    const antwort = await this.web('/user/login', { methode: 'POST', form });
    await antwort.arrayBuffer().catch(() => {});
    const ziel = antwort.headers.get('location') || '';
    if (antwort.status < 300 || antwort.status >= 400 || /\/user\/(login|two_factor)/.test(ziel)) {
      throw new ForgejoFehler('Anmeldung abgelehnt: Benutzername/Passwort prüfen; das Konto darf keine Zwei-Faktor-Anmeldung haben', antwort.status);
    }
    // Gegenprobe: Einstellungsseite ist nur angemeldet erreichbar.
    const probe = await this.web('/user/settings');
    await probe.arrayBuffer().catch(() => {});
    if (probe.status !== 200) throw new ForgejoFehler(`Anmeldung nicht bestätigt (Einstellungsseite: HTTP ${probe.status})`, probe.status);
    this.angemeldet = true;
  }

  async angemeldetSein() {
    if (!this.angemeldet) await this.anmelden();
  }

  // Seite der Weboberfläche lesen (angemeldet, damit auch private Repos gehen).
  async seite(pfad) {
    await this.angemeldetSein();
    let antwort = await this.web(pfad);
    if (Forgejo.zurAnmeldung(antwort)) {
      await this.anmelden();
      antwort = await this.web(pfad);
    }
    if (antwort.status !== 200) throw new ForgejoFehler(`${pfad}: HTTP ${antwort.status}`, antwort.status);
    return antwort.text();
  }

  // Schreibender Aufruf der Weboberfläche; bei abgelaufener Sitzung einmal neu anmelden.
  async senden(pfad, inhalt) {
    await this.angemeldetSein();
    let antwort = await this.web(pfad, { methode: 'POST', ...inhalt });
    if (Forgejo.zurAnmeldung(antwort) || antwort.status === 403) {
      await antwort.arrayBuffer().catch(() => {});
      await this.anmelden();
      antwort = await this.web(pfad, { methode: 'POST', ...inhalt });
    }
    const text = await antwort.text();
    if (antwort.status !== 200) throw new ForgejoFehler(`${pfad}: HTTP ${antwort.status} ${text.slice(0, 200)}`, antwort.status);
    return text;
  }

  async api(pfad) {
    const kopf = { Accept: 'application/json', 'User-Agent': 'forgejo-board-bot' };
    kopf.Authorization = this.token
      ? `token ${this.token}`
      : `Basic ${Buffer.from(`${this.benutzer}:${this.passwort}`).toString('base64')}`;
    const antwort = await this.abrufen(`${this.url}/api/v1${pfad}`, { headers: kopf, signal: AbortSignal.timeout(ZEITLIMIT_MS) });
    if (!antwort.ok) {
      await antwort.arrayBuffer().catch(() => {});
      throw new ForgejoFehler(`API ${pfad.split('?')[0]}: HTTP ${antwort.status}`, antwort.status);
    }
    return antwort.json();
  }

  // Alle Seiten einer Listen-API.
  async apiAlle(pfad, groesse = 50) {
    const alle = [];
    const trenner = pfad.includes('?') ? '&' : '?';
    for (let seite = 1; seite <= 200; seite++) {
      const teil = await this.api(`${pfad}${trenner}limit=${groesse}&page=${seite}`);
      alle.push(...teil);
      if (teil.length < groesse) return alle;
    }
    throw new ForgejoFehler(`API ${pfad}: mehr als 200 Seiten`);
  }
}
