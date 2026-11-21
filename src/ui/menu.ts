// Home screen, pop-up panels and pause menu (HTML overlays over the game).
//
// The game boots in "attract mode" behind the home screen: the reef and its
// fish run live, with no player. PLAY starts a run; CONTINUE picks up a saved
// one; HOME (pause or death screen) returns here. Settings, records and the
// run checkpoint go through the SaveManager (src/save).
import type Phaser from 'phaser';
import { SPECIES, STAGES, type DifficultyName } from '../data';
import { levelToSwallow } from '../systems/growth';
import type { GameScene } from '../scenes/GameScene';
import type { HudScene } from '../scenes/HudScene';
import { APP_VERSION, mergeBest, saves, type Checkpoint, type DeathCause, type Profile } from '../save';
import { listStudioProjects, loadStageLooks, loadStudioProject, setActiveSkin, validateProject } from '../skins';
import { installSafetyNet, readErrorLog, requestAutoContinue, takeAutoContinue } from './safety';

/** Sprite Studio lives in the same artifact, so both pages share saves. */
const STUDIO_URL = 'studio/index.html';
const studioUrl = (project?: string, pose?: number) =>
  STUDIO_URL + (project ? `?project=${encodeURIComponent(project)}${pose !== undefined ? `&pose=${pose}` : ''}` : '');

const $ = (id: string) => document.getElementById(id)!;

function ago(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}
function clock(sec: number): string {
  const m = Math.floor(sec / 60);
  return `${m}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
}

export function initMenu(game: Phaser.Game): void {
  const loadedProfile = saves.loadProfile();
  const profile: Profile = loadedProfile.data;
  const opts = profile.settings;
  const saveProfile = () => {
    if (!saves.saveProfile(profile)) badge('Could not save on this device', true);
  };
  const scene = () => game.scene.getScene('Game') as GameScene | null;
  const hud = () => game.scene.getScene('Hud') as HudScene;
  const home = $('home');
  const wrap = $('panelWrap');
  const panel = $('panel');
  let paused = false;
  let checkpoint: { data: Checkpoint; savedAt: number } | null = null;

  // ---------------------------------------------------------------- creature look (Sprite Studio)
  let skinReady: Promise<void> = Promise.resolve();
  // The three stage designs (hatchling, juvenile, adult): loaded in the background.
  const looksReady = loadStageLooks(STAGES).catch(() => undefined);
  /** Load the chosen studio drawing in the background so PLAY starts instantly. */
  function prepareSkin(id: string | null, quiet = false): Promise<boolean> {
    let ok = true;
    skinReady = (async () => {
      if (!id) return setActiveSkin(null);
      const project = await loadStudioProject(id);
      const problems = validateProject(project);
      if (!project || problems.length) {
        ok = false;
        setActiveSkin(null);
        if (!quiet) notice(`Your drawing could not be used, so the original crocodile is back. ${problems[0] ?? ''}`);
        return;
      }
      setActiveSkin({ id, project });
    })();
    return skinReady.then(() => ok);
  }
  window.addEventListener('ce:skinfailed', () => notice('Your drawing could not be shown, so the original crocodile is used.'));

  // ---------------------------------------------------------------- notices
  function notice(text: string): void {
    $('noticeText').textContent = text;
    $('notice').classList.add('open');
  }
  $('noticeClose').addEventListener('click', () => $('notice').classList.remove('open'));

  let badgeTimer = 0;
  function badge(text: string, warn = false): void {
    const b = $('saveBadge');
    b.textContent = text;
    b.classList.toggle('warn', warn);
    b.classList.add('show');
    window.clearTimeout(badgeTimer);
    badgeTimer = window.setTimeout(() => b.classList.remove('show'), warn ? 4000 : 1400);
  }
  window.addEventListener('ce:saved', () => badge(saves.persistent ? 'Saved' : 'Saved until this tab closes', !saves.persistent));
  let lastFailNote = 0;
  window.addEventListener('ce:savefailed', () => {
    if (Date.now() - lastFailNote < 30_000) return;
    lastFailNote = Date.now();
    badge('Could not save on this device', true);
  });

  // ---------------------------------------------------------------- home
  function renderBest(): void {
    const best = profile.best;
    $('bestLine').innerHTML = best.level
      ? `Best: <b>level ${best.level}</b> · ${best.fish} fish swallowed · ${best.kills} kills`
      : 'No record yet. Go set one!';
  }
  function renderDifficulty(): void {
    document.querySelectorAll<HTMLButtonElement>('[data-diff]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.diff === opts.difficulty)));
  }
  function renderContinue(): void {
    const got = saves.loadCheckpoint();
    checkpoint = got.data ? { data: got.data, savedAt: got.savedAt } : null;
    if (got.problem) notice(got.problem);
    const btn = $('btnContinue') as HTMLButtonElement;
    btn.hidden = !checkpoint;
    if (checkpoint) {
      const c = checkpoint.data;
      const name = SPECIES[c.species]?.displayName ?? 'Creature';
      $('continueSub').textContent = `${name} · level ${c.level} · ${clock(c.runTime)} · saved ${ago(checkpoint.savedAt)}`;
      $('btnPlay').textContent = 'NEW RUN';
    } else {
      $('btnPlay').textContent = 'PLAY';
    }
    $('btnPlay').classList.toggle('alt', !!checkpoint);
  }
  document.querySelectorAll<HTMLButtonElement>('[data-diff]').forEach((b) =>
    b.addEventListener('click', () => {
      opts.difficulty = b.dataset.diff as DifficultyName;
      saveProfile();
      renderDifficulty();
    }),
  );

  function showHome(): void {
    endTest();
    closePanel();
    home.classList.add('open');
    renderBest();
    renderContinue();
  }
  async function startRun(resume: Checkpoint | null, test = false): Promise<void> {
    closePanel();
    // Never keep the player waiting long: the original art is the fallback.
    await Promise.race([Promise.all([skinReady, looksReady]), new Promise((r) => setTimeout(r, 4000))]);
    home.classList.remove('open');
    hud().hideDeath();
    hud().startMusic();
    scene()?.startPlay(resume ? resume.difficulty : opts.difficulty, resume, test);
  }
  function play(): void {
    if (!checkpoint) return void startRun(null);
    const c = checkpoint.data;
    openPanel(
      `<h3>Start a new run?</h3>
      <p>Your saved run (level ${c.level}, ${clock(c.runTime)}) will be replaced.</p>
      <div class="row"><button class="btn btn-danger" id="pNew">Start new run</button><button class="btn" id="pKeep">Keep my saved run</button></div>`,
      () => {
        $('pNew').onclick = () => void startRun(null);
        $('pKeep').onclick = closePanel;
      },
    );
  }
  $('btnPlay').addEventListener('click', play);
  $('btnContinue').addEventListener('click', () => checkpoint && void startRun(checkpoint.data));

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
      <h4>Saving</h4>
      <ul>
        <li>Your run saves by itself every few seconds, when you level up, pause, or switch apps. Tap <b>CONTINUE</b> on the home screen to pick it up.</li>
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
      saveProfile();
      hud().setMusicOn(opts.music);
      refreshToggles();
    };
    $('oSfx').onclick = () => {
      opts.sfx = !opts.sfx;
      saveProfile();
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
  /** Two-tap confirmation for anything destructive (kid-safe). */
  function confirmButton(id: string, label: string, action: () => void): void {
    const b = $(id) as HTMLButtonElement;
    let armed = false;
    b.onclick = () => {
      if (!armed) {
        armed = true;
        b.textContent = label;
        b.classList.add('btn-danger');
        window.setTimeout(() => {
          if (!armed) return;
          armed = false;
          b.classList.remove('btn-danger');
          b.textContent = b.dataset.label ?? 'Reset';
        }, 4000);
        return;
      }
      armed = false;
      action();
    };
  }
  function openOptions(): void {
    const lt = profile.lifetime;
    openPanel(
      `<h3>Options</h3>${optionsHtml()}
      <div class="toggle"><span>Your crocodile<br><span style="color:var(--muted);font-size:13px">Drawings from Sprite Studio</span></span><select id="oSkin" aria-label="Your crocodile"><option value="">Grows with each stage</option></select></div>
      <div class="toggle"><span>Best record<br><span style="color:var(--muted);font-size:13px">${profile.best.level ? `Level ${profile.best.level} · ${lt.runs} runs played` : 'None yet'}</span></span><button class="btn" id="oReset" data-label="Reset">Reset</button></div>
      <div class="toggle"><span>Reset everything<br><span style="color:var(--muted);font-size:13px">Settings, records and the saved run</span></span><button class="btn" id="oResetAll" data-label="Reset all">Reset all</button></div>
      <p style="color:var(--muted);font-size:13px">${
        saves.persistent
          ? 'Your settings, records and saved run are kept on this device.'
          : 'This browser is blocking storage, so saves last only until this tab closes.'
      }</p>
      <div class="row"><button class="btn" id="pClose">Done</button></div>`,
      () => {
        bindOptions();
        $('pClose').onclick = closePanel;
        fillSkinPicker($('oSkin') as HTMLSelectElement);
        confirmButton('oReset', 'Tap again to reset', () => {
          profile.best = { level: 0, kills: 0, fish: 0 };
          saveProfile();
          renderBest();
          $('oReset').textContent = 'Cleared';
        });
        confirmButton('oResetAll', 'Tap again: erase all', () => {
          saves.resetAll();
          window.location.reload();
        });
      },
    );
  }
  $('cardOptions').addEventListener('click', openOptions);

  async function fillSkinPicker(sel: HTMLSelectElement): Promise<void> {
    const list = await listStudioProjects();
    for (const p of list) {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.name || p.id;
      sel.appendChild(o);
    }
    if (opts.skin && !list.some((p) => p.id === opts.skin)) {
      const o = document.createElement('option');
      o.value = opts.skin;
      o.textContent = 'Saved drawing (not found)';
      sel.appendChild(o);
    }
    sel.value = opts.skin ?? '';
    sel.onchange = async () => {
      const id = sel.value || null;
      opts.skin = id;
      saveProfile();
      if (!(await prepareSkin(id))) {
        opts.skin = null;
        saveProfile();
        sel.value = '';
      } else badge(id ? 'Your drawing will swim next run' : 'Stage designs: hatchling, juvenile, adult');
    };
  }

  // ---------------------------------------------------------------- test swim from Sprite Studio
  let testing: { id: string; pose: number } | null = null;
  function endTest(): void {
    if (!testing) return;
    testing = null;
    $('testBar').classList.remove('open');
    try {
      history.replaceState(null, '', window.location.pathname);
    } catch {
      /* ignore */
    }
    void prepareSkin(opts.skin, true);
  }
  $('testBack').addEventListener('click', () => {
    const t = testing;
    window.location.href = studioUrl(t?.id, t?.pose);
  });
  $('testUse').addEventListener('click', () => {
    if (!testing) return;
    opts.skin = testing.id;
    saveProfile();
    $('testUse').textContent = 'Saved as your look';
    badge('This drawing is now your crocodile');
  });
  async function startTest(id: string, pose: number): Promise<void> {
    const ok = await prepareSkin(id);
    if (!ok) {
      history.replaceState(null, '', window.location.pathname);
      return;
    }
    testing = { id, pose };
    const project = await loadStudioProject(id);
    $('testName').textContent = project?.name ?? 'your drawing';
    $('testUse').textContent = opts.skin === id ? 'This is your look' : 'Use this look';
    const until = Date.now() + 20000;
    const wait = window.setInterval(() => {
      const g = scene();
      if (g?.player && g.menuMode) {
        window.clearInterval(wait);
        $('testBar').classList.add('open');
        void startRun(null, true);
      } else if (Date.now() > until) window.clearInterval(wait);
    }, 200);
  }

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
      <p style="color:var(--muted);font-size:13px">Game mechanics inspired by underwater survival games. Creature Evolution is an independent fan project. Version ${APP_VERSION}.</p>
      <div class="row"><a class="btn" href="${STUDIO_URL}">Open Sprite Studio</a><button class="btn" id="pClose">Close</button></div>`,
      () => ($('pClose').onclick = closePanel),
    ),
  );

  // ---------------------------------------------------------------- pause
  function playing(): boolean {
    const g = scene();
    return !!g && !g.menuMode && !g.dead && !!g.player;
  }
  function pause(): void {
    const g = scene();
    if (!g || !playing() || paused) return;
    const saved = g.checkpoint(true);
    paused = true;
    game.scene.pause('Game');
    openPanel(
      `<h3>Paused</h3>
      <p class="saved-line">${testing ? 'Test swim: nothing here is saved, and your real run is untouched.' : saved ? (saves.persistent ? 'Saved just now' : 'Saved until this tab closes') : 'Could not save right now'}</p>
      <div class="pause-btns">
        <button class="btn btn-play" id="pResume">RESUME</button>
        <button class="btn" id="pRestart" data-label="Restart run">Restart run</button>
        <button class="btn" id="pHome">${testing ? 'End test swim' : 'Home (run is kept)'}</button>
        <button class="btn" id="pStudio">${testing ? 'Back to studio' : 'Sprite Studio (run is kept)'}</button>
      </div>
      ${optionsHtml()}`,
      () => {
        bindOptions();
        $('pResume').onclick = () => closePanel();
        confirmButton('pRestart', 'Tap again to restart', () => {
          resume();
          wrap.classList.remove('open');
          scene()?.restartRun();
        });
        $('pHome').onclick = () => {
          resume();
          scene()?.goHome();
        };
        $('pStudio').onclick = () => {
          // The run was saved when the pause menu opened; Continue picks it up later.
          window.location.href = testing ? studioUrl(testing.id, testing.pose) : studioUrl();
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
    const r = (e as CustomEvent<{ level: number; kills: number; fish: number; ended: boolean; cause?: DeathCause }>).detail;
    profile.best = mergeBest(profile.best, { level: r.level, kills: r.kills, fish: r.fish });
    if (r.ended) {
      profile.lifetime.runs++;
      if (r.cause) profile.lifetime.deaths[r.cause]++;
    }
    saveProfile();
    renderBest();
  });

  // ---------------------------------------------------------------- safety net
  installSafetyNet(game, {
    saveNow: () => scene()?.checkpoint(true) ?? false,
    playing,
    pause,
    showError: (saved) => {
      const wasPaused = paused;
      if (playing() && !paused) {
        paused = true;
        game.scene.pause('Game');
      }
      openPanel(
        `<h3>Something went wrong</h3>
        <p>${saved ? 'Your run was saved.' : 'Your settings and records are safe.'} You can keep playing, or reload the game to start clean.</p>
        <div class="row"><button class="btn btn-play" id="eResume">Keep playing</button><button class="btn" id="eReload">Reload</button></div>`,
        () => {
          $('eResume').onclick = () => (wasPaused ? wrap.classList.remove('open') : closePanel());
          $('eReload').onclick = () => {
            if (saved) requestAutoContinue();
            window.location.reload();
          };
        },
      );
    },
    showGraphicsLost: (saved) =>
      openPanel(
        `<h3>The screen needs a refresh</h3>
        <p>The device paused the game's graphics to save memory. ${saved ? 'Your run is saved, and you will be right back in it.' : 'Your settings and records are safe.'}</p>
        <div class="row"><button class="btn btn-play" id="gReload">Tap to restore</button></div>`,
        () => {
          $('gReload').onclick = () => {
            if (saved) requestAutoContinue();
            window.location.reload();
          };
        },
      ),
  });

  if (loadedProfile.problem) notice(loadedProfile.problem);
  const params = new URLSearchParams(window.location.search);
  const tryId = params.get('try');
  if (tryId && /^[\w-]{1,40}$/.test(tryId)) {
    void startTest(tryId, Math.max(0, parseInt(params.get('pose') ?? '0', 10) || 0));
  } else {
    void prepareSkin(opts.skin, true);
  }
  $('verLine').textContent = `v${APP_VERSION}`;
  renderBest();
  renderDifficulty();
  renderContinue();
  drawArt();

  // After a reload from the error or graphics panel, go straight back into the run.
  const saved = checkpoint as { data: Checkpoint } | null; // set by renderContinue()
  if (takeAutoContinue() && saved) {
    const cp = saved.data;
    const until = Date.now() + 15000;
    const wait = window.setInterval(() => {
      const g = scene();
      if (g?.player && g.menuMode) {
        window.clearInterval(wait);
        startRun(cp);
      } else if (Date.now() > until) window.clearInterval(wait);
    }, 200);
  }

  // Diagnostics from the browser console: ceDiagnostics()
  (window as unknown as { ceDiagnostics: () => unknown }).ceDiagnostics = () => ({
    version: APP_VERSION,
    device: saves.device,
    persistent: saves.persistent,
    failedWrites: saves.failedWrites,
    errors: readErrorLog(),
  });
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

  // Food chain: what the crocodile can swallow at which level (bigger ones it can only bite).
  const steps: Array<{ name: string; frame: string; level: number | null; tint?: string }> = [
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
    el.insertAdjacentHTML('beforeend', `<span class="n">${s.name}</span><span class="lv">${s.level === 1 ? 'from the start' : s.level ? `level ${s.level}+` : 'bite it'}</span>`);
    row.appendChild(el);
  });
}
