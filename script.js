const $ = id => document.getElementById(id);

/* ==========================================================
   PARTE 1 — HEADING: botões Write/Finish, timer e contador
   ========================================================== */
const editor = $('editor');
let seconds = 0, timerId = null;

const pad = n => String(n).padStart(2, '0');
const formatClock = s => `${Math.floor(s / 3600)}:${pad(Math.floor(s % 3600 / 60))}:${pad(s % 60)}`;

function startTimer() {
  if (timerId) return;
  timerId = setInterval(() => { seconds++; $('timer').textContent = formatClock(seconds); }, 1000);
}
function stopTimer() { clearInterval(timerId); timerId = null; }

$('write').onclick = () => {                    // começa (ou retoma) a escrever
  startTimer();
  $('write').classList.add('active');
  editor.focus();
};
$('finish').onclick = () => {                   // para o timer
  stopTimer();
  $('write').classList.remove('active');
};

/* contador de palavras + meta */
function updateCount() {
  const words = editor.innerText.trim().split(/\s+/).filter(Boolean).length;
  const goal  = parseInt($('goal').value, 10);
  $('words').textContent = words;
  $('word-count').classList.toggle('reached', goal > 0 && words >= goal);
}
$('goal').oninput = e => { e.target.value = e.target.value.replace(/\D/g, ''); updateCount(); };


/* ==========================================================
   PARTE 2 — EDITOR: negrito, itálico, sublinhado
   ========================================================== */
document.querySelectorAll('[data-cmd]').forEach(btn => {
  btn.onmousedown = e => e.preventDefault();    // mantém a seleção no editor
  btn.onclick = () => { document.execCommand(btn.dataset.cmd); refreshToolbar(); };
});

function refreshToolbar() {
  document.querySelectorAll('[data-cmd]').forEach(btn =>
    btn.classList.toggle('active', document.queryCommandState(btn.dataset.cmd)));
}
document.addEventListener('selectionchange', refreshToolbar);


/* ==========================================================
   PARTE 3 — CORRETOR (inglês britânico) com Typo.js
   Usa assets/index.aff + assets/index.dic
   ========================================================== */
const tip = $('tip');
let typo = null, spellOn = false, debounce;
const cache = new Map();

const normalize = w => w.replace(/’/g, "'");

function loadDictionary() {
  if (typo) return Promise.resolve();
  const btn = $('spell');
  btn.classList.add('loading');
  const get = url => fetch(url).then(r => {
    if (!r.ok) throw new Error(url + ' → ' + r.status);
    return r.text();
  });
  return Promise.all([get('assets/index.aff'), get('assets/index.dic')])
    .then(([aff, dic]) => new Promise((resolve, reject) => {
      new Typo('en-GB', aff, dic, {
        asyncLoad: true,
        loadedCallback: t => { typo = t; resolve(); },
        errorCallback: reject
      });
    }))
    .catch(err => {
      console.error(err);
      alert('Could not load the dictionary. Open the site through a local server (e.g. Live Server).');
      spellOn = false;
      btn.classList.remove('active');
    })
    .finally(() => btn.classList.remove('loading'));
}

/* acha todas as palavras do editor → {word, range} */
function findWords() {
  const found = [];
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  for (let node; (node = walker.nextNode());) {
    for (const m of node.textContent.matchAll(/[A-Za-zÀ-ÿ]+(?:['’][A-Za-zÀ-ÿ]+)*/g)) {
      const range = new Range();
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      found.push({ word: m[0], range });
    }
  }
  return found;
}

function isWrong(word) {
  const key = normalize(word);
  if (!cache.has(key)) cache.set(key, !typo.check(key));
  return cache.get(key);
}

/* sublinha as palavras erradas */
function checkSpelling() {
  if (!CSS.highlights) return;
  if (!spellOn || !typo) { CSS.highlights.delete('misspelled'); return; }
  const wrong = findWords().filter(w => isWrong(w.word)).map(w => w.range);
  CSS.highlights.set('misspelled', new Highlight(...wrong));
}

/* caixinha de correção embaixo da palavra */
function showTip(item) {
  const options = typo.suggest(normalize(item.word), 5);
  const box = item.range.getBoundingClientRect();
  tip.innerHTML = '';
  if (!options.length) tip.innerHTML = '<span>No suggestions</span>';
  options.forEach(s => {
    const b = document.createElement('button');
    b.textContent = s;
    b.onmousedown = e => e.preventDefault();
    b.onclick = () => {
  editor.focus();
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(item.range);
  document.execCommand('insertText', false, s);
  hideTip(); updateCount(); checkSpelling();
};
    tip.appendChild(b);
  });
  tip.style.display = 'flex';
  const maxLeft = window.innerWidth - tip.offsetWidth - 8;
  tip.style.left = Math.max(8, Math.min(box.left, maxLeft)) + 'px';
  tip.style.top  = box.bottom + 6 + 'px';
}
const hideTip = () => { tip.style.display = 'none'; };

$('spell').onclick = async () => {
  spellOn = !spellOn;
  $('spell').classList.toggle('active', spellOn);
  hideTip();
  if (spellOn) await loadDictionary();
  checkSpelling();
};

editor.addEventListener('click', e => {        // clique numa palavra errada → sugestões
  hideTip();
  if (!spellOn || !typo) return;
  const hit = findWords().find(({ range, word }) =>
    isWrong(word) && [...range.getClientRects()].some(r =>
      e.clientX >= r.left && e.clientX <= r.right &&
      e.clientY >= r.top  && e.clientY <= r.bottom));
  if (hit) showTip(hit);
});
document.addEventListener('mousedown', e => { if (!tip.contains(e.target)) hideTip(); });
window.addEventListener('scroll', hideTip, true);

editor.addEventListener('input', () => {
  updateCount();
  clearTimeout(debounce);
  debounce = setTimeout(checkSpelling, 300);
});

editor.addEventListener('paste', e => {
  e.preventDefault();
  document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
});


/* ==========================================================
   PARTE 4 — MUSIC PLAYER: DADOS
   ► ONDE ADICIONAR AS MÚSICAS ◄
   1) Coloque o mp3 na pasta  songs/
   2) Adicione uma linha em playlist: ["Título exibido", "NomeDoArquivoSemMp3"]
   A ordem da lista é a ordem de reprodução.
   ========================================================== */
const playlist = [
  ["My Moon My Man - (FINNEAS version)",        "MyMoonMyMan"],
  ["Home - Dotan",                              "Home"],
  ["All the Young Dudes - Mott The Hoople",     "AllTheYoungDudes"],
  ["Werewolves of London - Warren Zevon",       "WerewolvesOfLondon"],
  ["The View Between Villages - Noah Kahan",    "TheViewBetweenVillages"],
  ["Come on Eileen - Dexys Midnight Runners",   "ComeOnEileen"],
  ["Save a Prayer - Duran Duran",               "SaveAPrayer"],
  ["Go Your Own Way - Fleetwood Mac",           "GoYourOwnWay"],
  ["Let's Dance - David Bowie",                 "LetsDance"],
  ["Harness Your Hopes - Pavement",             "HarnessYourHopes"],
  ["Merry Christmas Please Don't Call - Bleachers", "MerryChristmasPleaseDontCall"],
  ["Lie to Me - Chris Isaak",                   "LieToMe"],
  ["The Prettiest Star - David Bowie",          "ThePrettiestStar"],
  ["Dreams - Fleetwood Mac",                    "Dreams"],
  ["Welcome Home, Son - Radical Face",          "WelcomeHomeSon"],
  ["Last Train to London - Electric Light Orchestra", "LastTrainToLondon"],
  ["Jeepster - T.Rex",                          "Jeepster"],
  ["Hungry Like the Wolf - Duran Duran",        "HungryLikeTheWolf"],
  ["Northern Attitude - Noah Kahan",            "NorthernAttitude"],
  ["Full Moon - The Black Ghosts",              "FullMoon"],
  ["Werewolf Heart - Dead Man's Bones",         "WerewolfHeart"],
  ["Everywhere - Fleetwood Mac",                "Everywhere"],
  ["I Will - The Beatles",                      "I Will"],        // tem espaço no nome
  ["Our House - Crosby, Stills, Nash & Young",  "OurHouse"],
  ["Landslide - Fleetwood Mac",                 "Landslide"],
  ["Parklife - Blur",                           "Parklife"],
  ["Wicked Game - Chris Isaak",                 "WickedGame"],
  ["Girls & Boys - Blur",                       "Girls&Boys"],    // tem &
  ["The Man Who Sold the World - David Bowie",  "TheManWhoSoldTheWorld"],
  ["Starman - David Bowie",                     "Starman"],
  ["Five Years - David Bowie",                  "FiveYears"],
  ["About You - The 1975",                      "About You"]      // tem espaço no nome
];

const songs = playlist.map(([title, file]) => ({
  title,
  src: `songs/${encodeURIComponent(file)}.mp3`   // trata espaço e &
}));


/* ==========================================================
   PARTE 5 — MUSIC PLAYER: LISTA (caderno)
   O CSS divide a lista em 2 colunas; aqui só informamos as linhas.
   ========================================================== */
const audio = $('audio'), playBtn = $('play'), progress = $('progress');
const items = [];

let queue = songs.map((_, i) => i);   // ordem atual de reprodução
let position = 0;                     // posição dentro da fila

$('playlist').style.setProperty('--rows', Math.ceil(songs.length / 2));

songs.forEach((song, i) => {
  const li = document.createElement('li');
  li.textContent = song.title;
  li.onclick = () => { setShuffleMode(false); queue = songs.map((_, k) => k); play(i); };
  items.push(li);
  $('playlist').appendChild(li);
});


/* ==========================================================
   PARTE 6 — MUSIC PLAYER: REPRODUÇÃO
   ========================================================== */
function play(index) {
  position = queue.indexOf(index);
  audio.src = songs[index].src;
  audio.play().catch(err => console.warn('Playback blocked/failed:', err));
  items.forEach((li, k) => li.classList.toggle('playing', k === index));
  $('track-title').textContent = songs[index].title;
}

const next = () => play(queue[(position + 1) % queue.length]);
const prev = () => play(queue[(position - 1 + queue.length) % queue.length]);

function shuffled() {
  const a = songs.map((_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const setShuffleMode = on => $('btn-shuffle').classList.toggle('active', on);


/* ==========================================================
   PARTE 7 — MUSIC PLAYER: BOTÕES, PROGRESSO E VOLUME
   ========================================================== */
$('btn-start').onclick = () => {                // ordem escrita
  setShuffleMode(false);
  queue = songs.map((_, i) => i);
  play(0);
};
$('btn-shuffle').onclick = () => {              // ordem aleatória
  setShuffleMode(true);
  queue = shuffled();
  play(queue[0]);
};
$('next').onclick = next;
$('prev').onclick = prev;
audio.onended = next;

/* o ícone segue o estado real do áudio */
audio.onplay  = () => { playBtn.textContent = '⏸'; };
audio.onpause = () => { playBtn.textContent = '▶'; };
audio.onerror = () => {
  $('track-title').textContent = 'File not found: ' + audio.getAttribute('src');
};

playBtn.onclick = () => {
  if (!audio.getAttribute('src')) { play(queue[0]); return; }   // nada tocando: começa a lista
  if (audio.paused) audio.play(); else audio.pause();
};

const formatTime = s => `${Math.floor(s / 60)}:${pad(Math.floor(s % 60))}`;

audio.ontimeupdate = () => {
  if (!audio.duration) return;
  progress.value = (audio.currentTime / audio.duration) * 100;
  $('current').textContent   = formatTime(audio.currentTime);
  $('remaining').textContent = '-' + formatTime(audio.duration - audio.currentTime);
};
progress.oninput = () => {
  if (!audio.duration) return;
  audio.currentTime = (progress.value / 100) * audio.duration;
};
$('volume').oninput = e => { audio.volume = e.target.value; };