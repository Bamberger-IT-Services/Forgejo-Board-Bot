// Liest Projektliste und Projektseite aus dem HTML der Weboberfläche (Forgejo hat dafür keine API).
// Bewusst ohne HTML-Bibliothek: gesucht werden nur wenige, stabile Merkmale, dieselben wie in
// forgejo-board.js (.project-column[data-id], .project-column-title-label, .issue-card[data-issue]).
// Ändert ein Forgejo-Update das Markup, fällt das im Selbsttest auf (siehe board.js › selbsttest).

const ENTITAETEN = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };

export function text(roh) {
  return String(roh)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (ganz, e) => {
      if (ENTITAETEN[e.toLowerCase()] !== undefined) return ENTITAETEN[e.toLowerCase()];
      if (/^#x/i.test(e)) return String.fromCodePoint(parseInt(e.slice(2), 16));
      if (/^#\d/.test(e)) return String.fromCodePoint(Number(e.slice(1)));
      return ganz;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

const regexSicher = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const klasseEnthaelt = (tag, klasse) => {
  const m = /\sclass="([^"]*)"/.exec(tag);
  return !!m && m[1].split(/\s+/).includes(klasse);
};

const attribut = (tag, name) => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? m[1] : undefined;
};

// Offene Projekte eines Repos aus /{org}/{repo}/projects?state=open, in Seitenreihenfolge.
export function projekteLesen(html, basis) {
  const muster = new RegExp(`<a\\b[^>]*\\shref="${regexSicher(basis)}/projects/(\\d+)"[^>]*>([\\s\\S]*?)</a>`, 'g');
  const gesehen = new Set();
  const projekte = [];
  for (const m of html.matchAll(muster)) {
    const name = text(m[2]);
    if (gesehen.has(m[1]) || !name) continue;
    gesehen.add(m[1]);
    projekte.push({ id: m[1], name });
  }
  return projekte;
}

// Spalten mit Titel, angezeigter Kartenzahl und Karten (interne Issue-IDs) einer Projektseite.
// Karten gehören zur letzten Spalte, die vor ihnen im HTML beginnt.
export function spaltenLesen(html) {
  const spalten = [];
  for (const m of html.matchAll(/<div\b[^>]*>/g)) {
    const tag = m[0];
    if (klasseEnthaelt(tag, 'project-column')) {
      const id = attribut(tag, 'data-id');
      if (/^\d+$/.test(id || '')) spalten.push({ id, start: m.index, titel: '', anzahl: undefined, karten: [] });
    } else if (klasseEnthaelt(tag, 'issue-card')) {
      const issue = attribut(tag, 'data-issue');
      const spalte = spalten[spalten.length - 1];
      if (spalte && /^\d+$/.test(issue || '')) spalte.karten.push(Number(issue));
    }
  }
  spalten.forEach((s, i) => {
    const abschnitt = html.slice(s.start, spalten[i + 1]?.start ?? html.length);
    const titel = /class="[^"]*\bproject-column-title-label\b[^"]*"[^>]*>([\s\S]*?)<\//.exec(abschnitt);
    s.titel = titel ? text(titel[1]) : '';
    const anzahl = /class="[^"]*\bproject-column-issue-count\b[^"]*"[^>]*>([\s\S]*?)<\//.exec(abschnitt);
    if (anzahl && /^\d+$/.test(text(anzahl[1]))) s.anzahl = Number(text(anzahl[1]));
    delete s.start;
  });
  return spalten;
}

// Verstecktes CSRF-Feld eines Formulars, falls die Forgejo-Fassung eines verlangt.
export function csrfLesen(html) {
  const m = /<input\b[^>]*\sname="_csrf"[^>]*>/.exec(html);
  return m ? attribut(m[0], 'value') : undefined;
}
