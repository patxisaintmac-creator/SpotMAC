// SpotMAC — photos et fiches techniques depuis Wikipédia.
// Les photos viennent de Wikimedia Commons (licences libres) : l'auteur et la licence
// sont affichés dans la fiche de chaque carte.
window.WIKI = (() => {
  const V = 'wk3:';
  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  const ORD = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9 };
  const strip = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const compact = s => strip(s).replace(/[^a-z0-9]/g, '');
  const enc = encodeURIComponent;
  const frModel = (lang, model) => lang === 'fr'
    ? model.replace(/^Series (\d)/, 'Série $1').replace(/^([A-Z]{1,3})-Class$/, 'Classe $1') : model;
  const baseModel = model => model.replace(/ (kombi|Combi|SW|Touring|Avant|Break|Grandtour|Sportback|Cabrio|Cabriolet|Coupé|Limousine|Sedan|Estate|Van)$/i, '');
  function genTokens(gen) {
    const t = { roman: null, codes: [] };
    let m = /mk\s*(\d+)/i.exec(gen) || /(\d+)(?:st|nd|rd|th) gen/i.exec(gen);
    if (m) t.roman = ROMAN[+m[1]];
    m = /^(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)/i.exec(gen);
    if (m) t.roman = ROMAN[ORD[m[1].toLowerCase()]];
    t.codes = (gen.match(/\b[A-Z]{1,3}\d{1,3}[A-Z]?\b/g) || []).filter(c => !/^MK\d/i.test(c));
    return t;
  }
  async function search(lang, q) {
    const u = `https://${lang}.wikipedia.org/w/api.php?origin=*&format=json&action=query&generator=search&gsrlimit=6` +
      `&gsrsearch=${enc(q)}&prop=pageimages&piprop=thumbnail|name&pithumbsize=480`;
    const r = await fetch(u);
    if (!r.ok) throw new Error('wiki ' + r.status);
    const j = await r.json();
    return Object.values(j.query?.pages || {}).sort((a, b) => a.index - b.index);
  }
  function pick(pages, m, lang, g) {
    const model = strip(frModel(lang, baseModel(m.model)));
    const first = model.split(' ')[0], brand = compact(m.brand.split(' ')[0]);
    let best = null, bs = -1e9;
    for (const p of pages) {
      const t = strip(p.title);
      if (/homonymie|disambiguation|\(film|\(album|\(chanson|\(song/.test(t)) continue;
      const toks = t.replace(/[(),/]/g, ' ').split(/\s+/);
      const modelOk = toks.includes(first) || (model.length > 3 && t.includes(model));
      if (!modelOk || !compact(t).includes(brand)) continue;
      let s = -p.index * 0.5 + (p.thumbnail ? 1 : 0);
      if (g.roman && toks.includes(g.roman.toLowerCase())) s += 4;
      for (const c of g.codes) if (t.includes(c.toLowerCase())) s += 4;
      if (s > bs) { bs = s; best = p; }
    }
    return best;
  }
  async function find(m) {
    const g = genTokens(m.gen || '');
    for (const lang of ['fr', 'en']) {
      const model = frModel(lang, baseModel(m.model));
      const qs = [...new Set([[m.brand, model, g.roman, g.codes[0]], [m.brand, model, g.roman], [m.brand, model, g.codes[0]], [m.brand, model]]
        .map(a => a.filter(Boolean).join(' ')))];
      for (const q of qs) {
        const p = pick(await search(lang, q), m, lang, g);
        if (p) return { lang, title: p.title, thumb: p.thumbnail?.source || null, file: p.pageimage || null };
      }
    }
    return { none: 1 };
  }

  // Cache (mémoire + téléphone) et file d'attente pour ne pas surcharger Wikipédia
  const mem = {}, pending = {};
  const cacheGet = (k) => { if (k in mem) return mem[k]; try { const v = localStorage.getItem(V + k); if (v) return (mem[k] = JSON.parse(v)); } catch (e) {} };
  const cacheSet = (k, v) => { mem[k] = v; try { localStorage.setItem(V + k, JSON.stringify(v)); } catch (e) {} };
  let active = 0; const queue = [];
  const pump = () => { while (active < 4 && queue.length) { const { fn, res, rej } = queue.shift(); active++; fn().then(res, rej).finally(() => { active--; pump(); }); } };
  const enqueue = fn => new Promise((res, rej) => { queue.push({ fn, res, rej }); pump(); });
  function lookup(m) {
    const c = cacheGet(m.id); if (c) return Promise.resolve(c);
    return pending[m.id] ||= enqueue(() => find(m))
      .then(v => { cacheSet(m.id, v); return v; })
      .catch(() => ({ none: 1, error: 1 }))           // erreur réseau : on réessaiera plus tard
      .finally(() => { delete pending[m.id]; });
  }

  // Photo sur les cartes : chargée quand la carte apparaît à l'écran
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); paint(e.target); } }), { rootMargin: '300px' });
  async function paint(card) {
    const m = window.M?.[+card.dataset.mid]; if (!m) return;
    const r = await lookup(m);
    if (!r.thumb) return;
    const art = card.querySelector('.tc-art'); if (!art || art.querySelector('img')) return;
    const img = new Image(); img.alt = ''; img.decoding = 'async';
    img.onload = () => { art.innerHTML = ''; art.appendChild(img); art.classList.add('photo'); };
    img.src = r.thumb;
  }
  new MutationObserver(ms => {
    for (const mu of ms) for (const n of mu.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (n.matches('.tcard[data-mid]')) io.observe(n);
      n.querySelectorAll('.tcard[data-mid]').forEach(c => io.observe(c));
    }
  }).observe(document.body, { childList: true, subtree: true });

  // Fiche technique : infobox de la page Wikipédia
  const FIELDS = {
    fr: [['Années de production', 'Années de production'], ['Production', 'Exemplaires produits'], ['Prix', 'Prix'],
      ['Puissance', 'Puissance'], ['Moteur', 'Moteur'], ['Cylindrée', 'Cylindrée'], ['Couple', 'Couple'],
      ['Vitesse maximale', 'Vitesse max'], ['Accélération', 'Accélération'], ['Masse', 'Poids'],
      ['Transmission', 'Transmission'], ['Boîte', 'Boîte de vitesses'], ['Classe', 'Catégorie'], ['Longueur', 'Longueur']],
    en: [['Production', 'Production'], ['Price', 'Prix'], ['Power output', 'Puissance'], ['Engine', 'Moteur'],
      ['Top speed', 'Vitesse max'], ['Curb weight', 'Poids'], ['Transmission', 'Boîte de vitesses'], ['Class', 'Catégorie'],
      ['Length', 'Longueur']]
  };
  const clean = node => { const c = node.cloneNode(true); c.querySelectorAll('sup, style, .noprint, .mw-editsection').forEach(x => x.remove());
    return c.textContent.replace(/\s+/g, ' ').trim(); };
  async function details(m) {
    const r = await lookup(m);
    if (!r.title) return null;
    const ck = 'd' + m.id, cached = cacheGet(ck);
    if (cached) return cached;
    const base = `https://${r.lang}.wikipedia.org/w/api.php?origin=*&format=json&redirects=1`;
    const [parse, ext, img] = await Promise.all([
      fetch(`${base}&action=parse&prop=text&section=0&page=${enc(r.title)}`).then(x => x.json()),
      fetch(`${base}&action=query&prop=extracts&exintro=1&explaintext=1&exsentences=3&titles=${enc(r.title)}`).then(x => x.json()),
      r.file ? fetch(`${base}&action=query&prop=imageinfo&iiprop=extmetadata|url&iiurlwidth=900&titles=${enc('File:' + r.file)}`).then(x => x.json()) : null
    ]);
    const rows = [];
    const doc = new DOMParser().parseFromString(parse?.parse?.text?.['*'] || '', 'text/html');
    const box = doc.querySelector('.infobox_v3, .infobox_v2, table.infobox');
    if (box) for (const tr of box.querySelectorAll('tr')) {
      const th = tr.querySelector('th'), td = tr.querySelector('td'); if (!th || !td) continue;
      const label = clean(th), f = FIELDS[r.lang].find(([k]) => label.startsWith(k));
      if (f && !rows.some(x => x[0] === f[1])) { const v = clean(td); if (v) rows.push([f[1], v.length > 150 ? v.slice(0, 147) + '…' : v]); }
    }
    const extract = Object.values(ext?.query?.pages || {})[0]?.extract || '';
    let photo = null;
    const ii = img && Object.values(img.query?.pages || {})[0]?.imageinfo?.[0];
    if (ii) {
      const md = ii.extmetadata || {};
      const txt = h => { const d = document.createElement('div'); d.innerHTML = h || ''; return d.textContent.trim(); };
      photo = { src: ii.thumburl || ii.url, artist: txt(md.Artist?.value) || 'auteur inconnu', license: txt(md.LicenseShortName?.value) || '', link: ii.descriptionurl };
    }
    const out = { title: r.title, lang: r.lang, url: `https://${r.lang}.wikipedia.org/wiki/${enc(r.title.replace(/ /g, '_'))}`,
      rows, extract: r.lang === 'fr' ? extract : '', photo };
    cacheSet(ck, out);
    return out;
  }
  return { lookup, details };
})();
