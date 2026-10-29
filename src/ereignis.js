// Webhook-Ereignis → Board-Aufträge. Reine Funktion ohne Netz, damit sie sich gut testen lässt.
// Ein Auftrag ist { repo, nummer, regel, issue? }; fehlt issue, liest der Bot es per API nach.
//
//   issues        opened / reopened → regel „offen“  (Backlog)
//   issues        closed            → regel „fertig“ (Geschlossen/Done)
//   pull_request  opened            → regel „review“ für jedes Issue aus „Closes/Fixes/Resolves #n“
// „In progress“ setzen weiterhin die Sitzungen selbst.

import { gueltigerName } from './konfig.js';

// Schlüsselwörter wie in Forgejo (close/fix/resolve mit Beugungen), Groß-/Kleinschreibung egal.
// Erlaubt: „#12“, „Org/Repo#12“ und die volle Adresse „…/Org/Repo/issues/12“.
const VERWEIS = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b:?[ \t]+((?:https?:\/\/[^\s/]+(?:\/[^\s/]+)*?\/)?(?:([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+))?(?:#|\/issues\/)(\d+))\b/gi;

export function verweiseLesen(text, org, repo) {
  const nummern = new Set();
  for (const m of String(text ?? '').matchAll(VERWEIS)) {
    const [, , o, r, n] = m;
    if (o && (o.toLowerCase() !== org.toLowerCase() || r.toLowerCase() !== repo.toLowerCase())) continue;
    const nummer = Number(n);
    if (Number.isSafeInteger(nummer) && nummer > 0) nummern.add(nummer);
  }
  return [...nummern];
}

export function auftraegeFuer(ereignis, nutzlast, org) {
  const repo = nutzlast?.repository?.name;
  const besitzer = nutzlast?.repository?.owner?.login ?? nutzlast?.repository?.owner?.username;
  if (!repo || !besitzer || !gueltigerName(repo)) return { auftraege: [], grund: 'kein Repo im Ereignis' };
  if (String(besitzer).toLowerCase() !== org.toLowerCase()) return { auftraege: [], grund: 'fremde Organisation' };

  if (ereignis === 'issues') {
    const issue = nutzlast.issue;
    if (!issue || issue.pull_request) return { auftraege: [], grund: 'kein Issue' };
    const regel = { opened: 'offen', reopened: 'offen', closed: 'fertig' }[nutzlast.action];
    if (!regel) return { auftraege: [], grund: `Aktion „${nutzlast.action}“ wird nicht behandelt` };
    const knapp = { id: issue.id, number: issue.number, state: regel === 'fertig' ? 'closed' : 'open' };
    return { auftraege: [{ repo, nummer: issue.number, regel, issue: knapp }] };
  }

  if (ereignis === 'pull_request') {
    if (nutzlast.action !== 'opened') return { auftraege: [], grund: `Aktion „${nutzlast.action}“ wird nicht behandelt` };
    const pr = nutzlast.pull_request || {};
    const nummern = verweiseLesen(`${pr.title ?? ''}\n${pr.body ?? ''}`, org, repo).filter((n) => n !== pr.number);
    if (!nummern.length) return { auftraege: [], grund: 'PR verweist auf kein Issue' };
    return { auftraege: nummern.map((nummer) => ({ repo, nummer, regel: 'review' })) };
  }

  return { auftraege: [], grund: `Ereignis „${ereignis}“ wird nicht behandelt` };
}
