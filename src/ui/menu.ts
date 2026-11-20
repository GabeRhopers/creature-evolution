// Home screen, pop-up panels and pause menu (HTML overlays over the game).
//
// The game boots in "attract mode" behind the home screen: the reef and its
// fish run live, with no player. PLAY starts a run; HOME (pause or death
// screen) returns here. Options and records are remembered per device.
import type Phaser from 'phaser';
import { BALANCE, SPECIES, type DifficultyName } from '../data';
import { sizeAt } from '../systems/growth';
import type { GameScene } from '../scenes/GameScene';
import type { HudScene } from '../scenes/HudScene';

const STUDIO_URL = 'https://claude.ai/artifact/NN3Dh7yq1ReEreK5xW63E1';

interface Options {
  music: boolean;
  sfx: boolean;
  difficulty: DifficultyName;
}
interface Best {
  level: number;
  kills: number;
  fish: number;
}

const $ = (id: string) => document.getElementById(id)!;

function loadJson<T>(key: string, fallback: T): T {
  try {
    return { ...fallback, ...JSON.parse(window.localStorage.getItem(key) || '{}') };
  } catch {
    return fallback;
  }
}
function saveJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: keep in memory only */
  }
}

export function initMenu(game: Phaser.Game): void {
  const opts = loadJson<Options>('ce.options', { music: true, sfx: true, difficulty: 'normal' });
  let best = loadJson<Best>('ce.best', { level: 0, kills: 0, fish: 0 });
  const scene = () => game.scene.getScene('Game') as GameScene;
  const hud = () => game.scene.getScene('Hud') as HudScene;
  const home = $('home');
  const wrap = $('panelWrap');
  const panel = $('panel');
  let paused = false;

  // ---------------------------------------------------------------- home
  function renderBest(): void {
    $('bestLine').innerHTML = best.level
      ? `Best: <b>level ${best.level}</b> · ${best.fish} fish swallowed · ${best.kills} kills`
      : 'No record yet. Go set one!';
  }
  function renderDifficulty(): void {
    document.querySelectorAll<HTMLButtonElement>('[data-diff]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.diff === opts.difficulty)));
  }
  document.querySelectorAll<HTMLButtonElement>('[data-diff]').forEach((b) =>
    b.addEventListener('click', () => {
      opts.difficulty = b.dataset.diff as DifficultyName;
      saveJson('ce.options', opts);
      renderDifficulty();
    }),
  );

  function showHome(): void {
    closePanel();
    home.classList.add('open');
    renderBest();
  }
  function play(): void {
    closePanel();
    home.classList.remove('open');
    hud().hideDeath();
    hud().startMusic();
    scene().startPlay(opts.difficulty);
  }
  $('btnPlay').addEventListener('click', play);

  // First tap anywhere on the home screen starts the music (browsers need a gesture).
  home.addEventListener('pointerdown', () => hud()?.startMusic(), { once: true });

  // ---------------------------------------------------------------- panels
  function openPanel(html: string, bind?: () => void): void {
    panel.innerHTML = html;
    wrap.classList.add('open');
    bind?.();
    (panel.querySelector('button, a') as HTMLElement | null)?.focus();
  }
  function closePanel(): void {
    wrap.classList.remove('open');
    if (paused) resume();
  }
  wrap.addEventListener('pointerdown', (e) => {
    if (e.target === wrap && !paused) closePanel();
  });

  const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  $('cardHow').addEventListener('click', () =>
    openPanel(
      `<h3>How to play</h3>
      <p>You are a young crocodile in a reef full of hungry fish. Eat, grow, and work your way up the food chain.</p>
      <h4>Controls</h4>
      <ul>${
        touch
          ? `<li><b>Swim:</b> put your left thumb anywhere on the left half and drag the joystick.</li>
             <li><b>EAT / BITE</b>, <b>SPRINT</b> and <b>DASH</b> buttons are on the right.</li>`
          : `<li><b>Swim:</b> WASD or arrow keys, or hold the mouse button.</li>
             <li><b>Eat / bite:</b> Space or right-click. <b>Sprint:</b> Shift. <b>Dash:</b> E or Q.</li>`
      }</ul>
      <h4>Eating</h4>
      <ul>
        <li>Plankton and meat chunks are eaten just by touching them with your mouth.</li>
        <li>The ring at your mouth turns <span class="ring" style="border-color:#7cff6b"></span> green when you can swallow a fish whole, and <span class="ring" style="border-color:#ffa53a"></span> orange when it is too big: then you bite it.</li>
      </ul>
      <h4>Staying alive</h4>
      <ul>
        <li>Big fish hunt you. Each hit takes at most a third of your health and you blink for a moment, so swim away.</li>
        <li>Hide in kelp: predators can't see you unless they come very close.</li>
        <li>Big predators live in deep water. Grow up in the shallows first.</li>
        <li>When your stomach is over 75% full, stay still to digest. Digesting heals you, then turns food into growth.</li>
        <li>Don't let your stomach run empty, or you starve.</li>
      </ul>
      <div class="row"><button class="btn" id="pClose">Got it</button></div>`,
      () => ($('pClose').onclick = closePanel),
    ),
  );

  function optionsHtml(): string {
    return `
      <div class="toggle"><span>Music</span><button class="btn" id="oMusic" aria-pressed="${opts.music}">${opts.music ? 'On' : 'Off'}</button></div>
      <div class="toggle"><span>Sound effects</span><button class="btn" id="oSfx" aria-pressed="${opts.sfx}">${opts.sfx ? 'On' : 'Off'}</button></div>`;
  }
  function bindOptions(): void {
    $('oMusic').onclick = () => {
      opts.music = !opts.music;
      saveJson('ce.options', opts);
      hud().setMusicOn(opts.music);
      refreshToggles();
    };
    $('oSfx').onclick = () => {
      opts.sfx = !opts.sfx;
      saveJson('ce.options', opts);
      hud().setSfxOn(opts.sfx);
      refreshToggles();
    };
  }
  function refreshToggles(): void {
    for (const [id, on] of [['oMusic', opts.music], ['oSfx', opts.sfx]] as const) {
      const b = document.getElementById(id);
      if (b) {
        b.setAttribute('aria-pressed', String(on));
        b.textContent = on ? 'On' : 'Off';
      }
    }
  }
  $('cardOptions').addEventListener('click', () =>
    openPanel(
      `<h3>Options</h3>${optionsHtml()}
      <div class="toggle"><span>Best record<br><span style="color:var(--muted);font-size:13px">${best.level ? `Level ${best.level}` : 'None yet'}</span></span><button class="btn" id="oReset">Reset</button></div>
      <p style="color:var(--muted);font-size:13px">Settings and records are saved on this device.</p>
      <div class="row"><button class="btn" id="pClose">Done</button></div>`,
      () => {
        bindOptions();
        $('pClose').onclick = closePanel;
        $('oReset').onclick = () => {
          best = { level: 0, kills: 0, fish: 0 };
          saveJson('ce.best', best);
          renderBest();
          $('oReset').textContent = 'Cleared';
        };
      },
    ),
  );

  $('cardCredits').addEventListener('click', () =>
    openPanel(
      `<h3>Credits</h3>
      <ul>
        <li><b>Crocodile design:</b> original pixel art by the developer's son, cleaned up and animated.</li>
        <li><b>Fish, kelp, rocks, sand:</b> Fish Pack by Kenney (kenney.nl), CC0.</li>
        <li><b>Music:</b> "Aquaria" by cynicmusic, CC0.</li>
        <li><b>Sound effects:</b> generated in the game's code.</li>
        <li><b>Engine:</b> Phaser 4.</li>
      </ul>
      <p style="color:var(--muted);font-size:13px">Game mechanics inspired by underwater survival games. Creature Evolution is an independent fan project.</p>
      <div class="row"><a class="btn" href="${STUDIO_URL}" target="_blank" rel="noopener">Open Sprite Studio</a><button class="btn" id="pClose">Close</button></div>`,
      () => ($('pClose').onclick = closePanel),
    ),
  );

  // ---------------------------------------------------------------- pause
  function pause(): void {
    const g = scene();
    if (!g || g.menuMode || g.dead || paused) return;
    paused = true;
    game.scene.pause('Game');
    openPanel(
      `<h3>Paused</h3>
      <div class="pause-btns">
        <button class="btn btn-play" id="pResume">RESUME</button>
        <button class="btn" id="pRestart">Restart run</button>
        <button class="btn" id="pHome">Home</button>
      </div>
      ${optionsHtml()}`,
      () => {
        bindOptions();
        $('pResume').onclick = () => closePanel();
        $('pRestart').onclick = () => {
          resume();
          wrap.classList.remove('open');
          scene().restartRun();
        };
        $('pHome').onclick = () => {
          resume();
          scene().goHome();
        };
      },
    );
  }
  function resume(): void {
    if (!paused) return;
    paused = false;
    wrap.classList.remove('open');
    game.scene.resume('Game');
  }
  window.addEventListener('ce:pause', pause);
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (wrap.classList.contains('open')) closePanel();
    else if (!home.classList.contains('open')) pause();
  });

  // ---------------------------------------------------------------- game events
  window.addEventListener('ce:home', showHome);
  window.addEventListener('ce:run', (e) => {
    const r = (e as CustomEvent<Best>).detail;
    if (r.level > best.level || (r.level === best.level && r.kills > best.kills)) {
      best = r;
      saveJson('ce.best', best);
      renderBest();
    }
  });

  renderBest();
  renderDifficulty();
  drawArt();
}

// ---------------------------------------------------------------- artwork from the atlas
interface AtlasFrame {
  frame: { x: number; y: number; w: number; h: number };
}

async function drawArt(): Promise<void> {
  let frames: Record<string, AtlasFrame>;
  const img = new Image();
  try {
    const res = await fetch('assets/atlas.json');
    frames = (await res.json()).frames;
    img.src = 'assets/atlas.png';
    await img.decode();
  } catch {
    return; // art is decoration: the menu works without it
  }

  // Animated crocodile: idle loop with a blink, like in the game.
  const hero = $('heroCroc') as HTMLCanvasElement;
  const hctx = hero.getContext('2d')!;
  hctx.imageSmoothingEnabled = false;
  const seq = ['croc_idle1', 'croc_idle2', 'croc_idle1', 'croc_idle2', 'croc_idle1', 'croc_idle_blink'];
  let i = 0;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const drawHero = () => {
    const f = frames[seq[i % seq.length]]?.frame;
    if (f) {
      hctx.clearRect(0, 0, hero.width, hero.height);
      hctx.drawImage(img, f.x, f.y, f.w, f.h, 0, 0, hero.width, hero.height);
    }
    i++;
  };
  drawHero();
  if (!reduce) setInterval(drawHero, 380);

  // Food chain: what the crocodile can swallow at which level.
  const croc = SPECIES[BALANCE.playerSpecies];
  const levelToSwallow = (size: number) => {
    let lv = 1;
    while (sizeAt(croc, lv) * croc.devourRatio < size && lv < 99) lv++;
    return lv;
  };
  const steps: Array<{ name: string; frame: string; level: number; tint?: string }> = [
    { name: 'Plankton', frame: 'bubble_b', level: 1, tint: '#9adc6c' },
    ...['blue_tang', 'reef_snapper', 'red_grouper', 'grey_shark'].map((id) => ({
      name: SPECIES[id].displayName,
      frame: SPECIES[id].sprite,
      level: levelToSwallow(SPECIES[id].baseSize),
    })),
  ];
  const row = $('chain');
  row.innerHTML = '';
  steps.forEach((s, k) => {
    if (k > 0) {
      const a = document.createElement('span');
      a.className = 'chain-arrow';
      a.textContent = '›';
      a.setAttribute('aria-hidden', 'true');
      row.appendChild(a);
    }
    const el = document.createElement('div');
    el.className = 'chain-step';
    const c = document.createElement('canvas');
    c.width = 112;
    c.height = 80;
    const g = c.getContext('2d')!;
    const f = frames[s.frame]?.frame;
    if (f) {
      if (s.tint) {
        // Plankton: a small tinted dot.
        g.fillStyle = s.tint;
        g.beginPath();
        g.arc(56, 40, 9, 0, Math.PI * 2);
        g.fill();
      } else {
        g.drawImage(img, f.x, f.y, f.w, f.h, 16, 0, 80, 80);
      }
    }
    el.appendChild(c);
    el.insertAdjacentHTML('beforeend', `<span class="n">${s.name}</span><span class="lv">${s.level === 1 ? 'from the start' : `level ${s.level}+`}</span>`);
    row.appendChild(el);
  });
}
