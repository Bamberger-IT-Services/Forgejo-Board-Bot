// Spalten über Stichworte finden statt über feste Nummern – wie forgejo-board.js.
// Erst exakter Titel, dann „enthält“; Groß-/Kleinschreibung egal.

export const STICHWORTE = {
  backlog: ['backlog'],
  todo: ['to do', 'todo', 'offen'],
  arbeit: ['in progress', 'in arbeit', 'arbeit'],
  review: ['to review', 'review', 'prüfung'],
  fertig: ['geschlossen', 'done', 'erledigt', 'fertig'],
};

export function spalteFinden(spalten, schluessel) {
  const worte = STICHWORTE[schluessel];
  if (!worte) throw new Error(`Unbekannte Spalte „${schluessel}“`);
  const titel = (s) => s.titel.toLowerCase();
  return spalten.find((s) => worte.includes(titel(s)))
    || spalten.find((s) => worte.some((w) => titel(s).includes(w)));
}
