// Nachgebautes Forgejo für die Tests: hält Projekte, Spalten, Karten und Issues im Speicher,
// liefert dasselbe Markup wie Forgejo 17 und nimmt die beiden Board-Aufrufe entgegen.
// Nur Platzhalter-Namen und -Adressen (forgejo.example), keine echten Daten.

export const URL_ = 'https://forgejo.example';
export const ORG = 'beispiel-org';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export function projektSeite(basis, projekt, spalten) {
  const teile = spalten.map((s) => `
    <div class="project-column" data-id="${s.id}" data-sorting="0" data-url="${basis}/projects/${projekt.id}/${s.id}">
      <div class="project-column-header">
        <div class="ui large label project-column-title tw-py-1">
          <div class="ui small circular grey label project-column-issue-count">
            ${s.karten.length}
          </div>
          <span class="project-column-title-label">${esc(s.titel)}</span>
        </div>
      </div>
      <div class="ui cards" data-url="${basis}/projects/${projekt.id}/${s.id}" id="board_${s.id}">
        ${s.karten.map((k) => `<div class="issue-card tw-break-anywhere " data-issue="${k}"><div class="issue-card-icon"></div><a class="issue-card-title" href="${basis}/issues/1">x</a></div>`).join('\n')}
      </div>
    </div>`).join('\n');
  return `<!DOCTYPE html><html><body><div id="project-board"><div class="board ">${teile}</div></div></body></html>`;
}

export function projektListe(basis, projekte) {
  return `<html><body><div class="milestone-list">${projekte.map((p) => `
    <div class="milestone-header"><h3><a class="muted" href="${basis}/projects/${p.id}">${esc(p.name)}</a></h3></div>`).join('')}
    <a href="${basis}/projects/new">Neues Projekt</a></div></body></html>`;
}

const LOGIN = `<form class="ui form" action="/user/login" method="post">
  <input id="user_name" type="text" name="user_name" value="">
  <input id="password" name="password" type="password" value="">
  <input name="remember" type="checkbox"></form>`;

// repos: { name: { projekte: [{id,name,spalten:[{id,titel,karten:[]}]}], issues: [{id,number,state,pull_request?}] } }
export function attrappe({ repos, benutzer = 'bot', passwort = 'testpasswort', standardspalte = 0 } = {}) {
  const zustand = { repos, sitzungen: new Set(), anfragen: [], anmeldungen: 0, sitzungAblaufen: false };
  let zaehler = 0;

  const antwort = (status, inhalt = '', kopf = {}) => {
    const h = new Headers(kopf);
    const r = new Response(status === 204 || (status >= 300 && status < 400) ? null : inhalt, { status, headers: h });
    return r;
  };
  const sitzung = (init) => {
    const c = new Headers(init.headers || {}).get('cookie') || '';
    const m = /sitzung=([^;]+)/.exec(c);
    return m && zustand.sitzungen.has(m[1]);
  };
  const projektVon = (repo, id) => repos[repo]?.projekte.find((p) => p.id === String(id));
  const ausAllenSpalten = (p, issue) => { for (const s of p.spalten) s.karten = s.karten.filter((k) => k !== issue); };

  async function abrufen(adresse, init = {}) {
    const u = new URL(adresse);
    const methode = init.method || 'GET';
    const pfad = u.pathname;
    zustand.anfragen.push(`${methode} ${pfad}${u.search}`);
    if (zustand.sitzungAblaufen) { zustand.sitzungen.clear(); zustand.sitzungAblaufen = false; }

    if (pfad.startsWith('/api/v1/')) {
      const auth = new Headers(init.headers).get('authorization') || '';
      const erwartet = `Basic ${Buffer.from(`${benutzer}:${passwort}`).toString('base64')}`;
      if (auth !== erwartet) return antwort(401, '{}');
      let m;
      if ((m = /^\/api\/v1\/orgs\/[^/]+\/repos$/.exec(pfad))) {
        const seite = Number(u.searchParams.get('page'));
        const liste = seite === 1 ? Object.keys(repos).map((name) => ({ name, archived: false, has_projects: true })) : [];
        return antwort(200, JSON.stringify(liste));
      }
      if ((m = /^\/api\/v1\/repos\/[^/]+\/([^/]+)\/issues$/.exec(pfad))) {
        const seite = Number(u.searchParams.get('page'));
        const groesse = Number(u.searchParams.get('limit'));
        const alle = repos[m[1]].issues.filter((i) => !i.pull_request);
        return antwort(200, JSON.stringify(alle.slice((seite - 1) * groesse, seite * groesse)));
      }
      if ((m = /^\/api\/v1\/repos\/[^/]+\/([^/]+)\/issues\/(\d+)$/.exec(pfad))) {
        const i = repos[m[1]]?.issues.find((x) => x.number === Number(m[2]));
        return i ? antwort(200, JSON.stringify(i)) : antwort(404, '{}');
      }
      return antwort(404, '{}');
    }

    if (pfad === '/user/login' && methode === 'GET') return antwort(200, LOGIN);
    if (pfad === '/user/login' && methode === 'POST') {
      const f = new URLSearchParams(init.body);
      if (f.get('user_name') === benutzer && f.get('password') === passwort) {
        const id = `s${++zaehler}`;
        zustand.sitzungen.add(id);
        zustand.anmeldungen++;
        return antwort(303, '', { location: '/', 'set-cookie': `sitzung=${id}; Path=/; HttpOnly` });
      }
      return antwort(200, `${LOGIN}<div class="ui negative message">Falsch</div>`);
    }
    if (pfad === '/user/settings') return sitzung(init) ? antwort(200, 'ok') : antwort(303, '', { location: '/user/login' });

    const web = /^\/[^/]+\/([^/]+)\/(.*)$/.exec(pfad);
    if (!web) return antwort(404);
    const [, repo, rest] = web;
    const basis = `/${ORG}/${repo}`;
    if (!repos[repo]) return antwort(404);

    if (methode === 'GET') {
      if (!sitzung(init)) return antwort(303, '', { location: '/user/login' });
      if (rest === 'projects' && u.searchParams.get('state') === 'open') return antwort(200, projektListe(basis, repos[repo].projekte));
      const p = /^projects\/(\d+)$/.exec(rest);
      if (p && projektVon(repo, p[1])) {
        const projekt = projektVon(repo, p[1]);
        return antwort(200, projektSeite(basis, projekt, projekt.spalten));
      }
      return antwort(404);
    }

    if (!sitzung(init)) return antwort(303, '', { location: `/user/login?redirect_to=${encodeURIComponent(pfad)}` });
    if (rest === 'issues/projects') {
      const f = new URLSearchParams(init.body);
      const projekt = projektVon(repo, f.get('id'));
      if (!projekt) return antwort(404);
      for (const id of f.get('issue_ids').split(',').map(Number)) {
        for (const anderes of repos[repo].projekte) ausAllenSpalten(anderes, id);
        projekt.spalten[standardspalte].karten.push(id);
      }
      return antwort(200, '{"ok":true}');
    }
    const mv = /^projects\/(\d+)\/(\d+)\/move$/.exec(rest);
    if (mv) {
      const projekt = projektVon(repo, mv[1]);
      const spalte = projekt?.spalten.find((s) => s.id === mv[2]);
      if (!spalte) return antwort(404);
      for (const { issueID } of JSON.parse(init.body).issues) {
        ausAllenSpalten(projekt, issueID);
        spalte.karten.push(issueID);
      }
      return antwort(200, '{"ok":true}');
    }
    return antwort(404);
  }

  return { abrufen, zustand };
}

// Standard-Board wie in Anweisung 08: Backlog, To do, In progress, Review, Geschlossen.
export function standardRepo({ review = true, issues = [] } = {}) {
  const spalten = [
    { id: '11', titel: 'Backlog', karten: [] },
    { id: '12', titel: 'To do', karten: [] },
    { id: '13', titel: 'In progress', karten: [] },
    ...(review ? [{ id: '14', titel: 'To review', karten: [] }] : []),
    { id: '15', titel: 'Geschlossen', karten: [] },
  ];
  return { projekte: [{ id: '7', name: 'Roadmap', spalten }], issues };
}

export const karten = (repo) => Object.fromEntries(repo.projekte[0].spalten.map((s) => [s.titel, [...s.karten]]));
