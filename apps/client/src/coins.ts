/**
 * Money in the interface is written "1,200G" everywhere (prompts, cards, logs, dialogs). This
 * watcher turns each such "G" into a little gold coin as text appears, so every screen shows
 * coins without each one having to build them. Inputs and the canvas are left alone (the
 * board draws its own coins).
 */
const MONEY = /(\d[\d,]*)G\b/g;
const SKIP = new Set(['INPUT', 'TEXTAREA', 'SCRIPT', 'STYLE', 'OPTION', 'TITLE']);

function coin(): HTMLElement {
  const el = document.createElement('span');
  el.className = 'gc';
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', 'G');
  return el;
}

function convert(node: Text) {
  const text = node.data;
  MONEY.lastIndex = 0;
  if (!MONEY.test(text)) return;
  const parent = node.parentElement;
  if (!parent || SKIP.has(parent.tagName) || parent.closest('[data-no-coins]')) return;
  const frag = document.createDocumentFragment();
  let last = 0;
  MONEY.lastIndex = 0;
  for (let m = MONEY.exec(text); m; m = MONEY.exec(text)) {
    frag.append(text.slice(last, m.index) + m[1]);
    frag.append(coin());
    last = m.index + m[0].length;
  }
  frag.append(text.slice(last));
  node.replaceWith(frag);
}

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return convert(root as Text);
  if (root.nodeType !== Node.ELEMENT_NODE || SKIP.has((root as Element).tagName)) return;
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const found: Text[] = [];
  for (let n = tw.nextNode(); n; n = tw.nextNode()) found.push(n as Text);
  found.forEach(convert);
}

export function installCoins() {
  walk(document.body);
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') convert(r.target as Text);
      else r.addedNodes.forEach(walk);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
}
