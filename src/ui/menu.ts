// Home screen, pop-up panels and pause menu (HTML overlays over the game).
//
// The game boots in "attract mode" behind the home screen: the reef and its
// fish run live, with no player. PLAY starts a run; CONTINUE picks up a saved
// one; HOME (pause or death screen) returns here. Settings, records and the
// run checkpoint go through the SaveManager (src/save).
import type Phaser from 'phaser';
import { ALL_SPECIES_LOOKS, ALL_STAGE_SKINS, BALANCE, DEFAULT_HERO, HEROES, SPECIES, heroStages, isHero, legendLevel, tideName, tideOf, type DifficultyName } from '../data';
import { levelToSwallow } from '../systems/growth';
import type { GameScene } from '../scenes/GameScene';
import type { HudScene } from '../scenes/HudScene';
import { APP_VERSION, MAX_PLAYERS, SLOT_COUNT, cleanSlotName, defaultSlotNames, mergeBest, saves, type Checkpoint, type DeathCause, type HeroSlots, type Profile } from '../save';
import { perkIconUrl } from './perkIcons';
import { ENEMY_FIELDS, ENEMY_GROUPS, enemiesChanged, enemyIds, resetEnemies, saveEnemy, shippedValue } from '../data/adminSettings';
import { DEFAULT_PAD_MAP, buttonName, PAD, PAD_ACTIONS, PAD_ACTION_NAMES, assignButton, buttonsLabel, pads, type PadAction } from '../input/gamepad';
import { decodeFrame, listStudioProjects, loadStageLooks, loadStudioProject, setActiveSkin, validateProject, type StudioProject } from '../skins';
import { earlyHelpMods, earlyHelpStrength, perkById, type PerkDef } from '../systems/perks';
import { installSafetyNet, lastErrorLine, readErrorLog, requestAutoContinue, takeAutoContinue } from './safety';

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
  // Who's playing: their profile, and the slots of the hero they picked.
  const players = saves.loadPlayers();
  saves.setPlayer(players.active);
  const playerName = players.players.find((p) => p.id === players.active)?.name ?? 'Player 1';
  const loadedProfile = saves.loadProfile();
  const profile: Profile = loadedProfile.data;
  const opts = profile.settings;
  if (!isHero(opts.hero)) opts.hero = DEFAULT_HERO;
  /** The picked hero's save slots (created the first time a hero is picked). */
  const heroSlots = (): HeroSlots => (profile.slots[opts.hero ?? DEFAULT_HERO] ??= { active: 1, names: defaultSlotNames() });
  saves.setHero(opts.hero);
  // Controller buttons saved in Options.
  pads.map = opts.padMap ?? DEFAULT_PAD_MAP;
  const saveProfile = () => {
    if (!saves.saveProfile(profile)) badge('Could not save on this device', true);
  };
  // The save slot the game reads and writes (picked in Saved games).
  saves.setSlot(heroSlots().active);
  const scene = () => game.scene.getScene('Game') as GameScene | null;
  const hud = () => game.scene.getScene('Hud') as HudScene;
  const home = $('home');
  const wrap = $('panelWrap');
  const panel = $('panel');
  let paused = false;
  let checkpoint: { data: Checkpoint; savedAt: number } | null = null;

  // ---------------------------------------------------------------- creature look (Sprite Studio)
  let skinReady: Promise<void> = Promise.resolve();
  // Every hero's stage designs and every reef creature design, studio edits included: loaded in the background.
  const loadLooks = () => loadStageLooks([...ALL_STAGE_SKINS, ...ALL_SPECIES_LOOKS]).catch(() => undefined);
  let looksReady = loadLooks();
  // Designs edited in the studio (another tab, or after Back to game) are picked up on the next run.
  const refreshLooks = () => {
    looksReady = loadLooks();
  };
  window.addEventListener('focus', refreshLooks);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshLooks();
  });
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
  // ---------------------------------------------------------------- hero picker (each hero has its own saves)
  /** Pick a hero: its own save slots (and CONTINUE) come with it. */
  function pickHero(id: string): void {
    if (!isHero(id)) return;
    opts.hero = id;
    saves.setHero(id);
    saves.setSlot(heroSlots().active);
    saveProfile();
    renderHeroes();
    renderContinue();
  }
  const heroPick = $('heroPick');
  for (const h of HEROES) {
    const b = document.createElement('button');
    b.className = 'hero-btn';
    b.dataset.hero = h.id;
    b.innerHTML = `<canvas width="224" height="88" aria-hidden="true"></canvas><span>${h.name}</span><span class="d">${h.blurb}</span>`;
    const adult = heroStages(h.id).at(-1)!;
    void drawLook(b.querySelector('canvas')!, `studio/seeds/${adult.skin}.json`);
    b.addEventListener('click', () => pickHero(h.id));
    heroPick.appendChild(b);
  }
  function renderHeroes(): void {
    heroPick.querySelectorAll<HTMLButtonElement>('[data-hero]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.hero === opts.hero)));
    void showHeroLogo(opts.hero ?? DEFAULT_HERO);
  }
  renderHeroes();

  function renderContinue(): void {
    const got = saves.loadCheckpoint();
    checkpoint = got.data ? { data: got.data, savedAt: got.savedAt } : null;
    if (got.problem) notice(got.problem);
    const btn = $('btnContinue') as HTMLButtonElement;
    btn.hidden = !checkpoint;
    if (checkpoint) {
      const c = checkpoint.data;
      const name = SPECIES[c.species]?.displayName ?? 'Creature';
      $('continueSub').textContent = `${slotName(saves.activeSlot)}: ${name} · level ${c.level} · ${clock(c.runTime)} · saved ${ago(checkpoint.savedAt)}`;
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
    refreshLooks();
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
    scene()?.startPlay(resume ? resume.difficulty : opts.difficulty, resume, test, opts.hero ?? DEFAULT_HERO);
  }
  function play(): void {
    if (!checkpoint) return void startRun(null);
    const c = checkpoint.data;
    // Prefer an empty slot, so nobody's run gets replaced by accident.
    const empty = slotNumbers().find((n) => n !== saves.activeSlot && !saves.loadCheckpoint(n).data);
    openPanel(
      `<h3>Start a new run?</h3>
      <p>${esc(slotName(saves.activeSlot))} has a saved run (level ${c.level}, ${clock(c.runTime)}).</p>
      <div class="row">${empty ? `<button class="btn" id="pEmpty">Start in ${esc(slotName(empty))} (empty)</button>` : ''}
      <button class="btn btn-danger" id="pNew">Replace ${esc(slotName(saves.activeSlot))}</button><button class="btn" id="pKeep">Keep my saved run</button></div>`,
      () => {
        if (empty) $('pEmpty').onclick = () => {
          selectSlot(empty);
          void startRun(null);
        };
        $('pNew').onclick = () => void startRun(null);
        $('pKeep').onclick = closePanel;
      },
    );
  }

  // ---------------------------------------------------------------- saved games (slots)
  const esc = (t: string) => t.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
  function slotNumbers(): number[] {
    return Array.from({ length: SLOT_COUNT }, (_, i) => i + 1);
  }
  function slotName(n: number): string {
    return heroSlots().names[n - 1] ?? `Game ${n}`;
  }
  function selectSlot(n: number): void {
    saves.setSlot(n);
    heroSlots().active = n;
    saveProfile();
    renderContinue();
  }
  function savesHtml(): string {
    return slotNumbers()
      .map((n) => {
        const got = saves.loadCheckpoint(n);
        const c = got.data;
        const active = n === saves.activeSlot;
        const info = c
          ? `${esc(SPECIES[c.species]?.displayName ?? 'Creature')} · level ${c.level} · ${clock(c.runTime)} played · saved ${ago(got.savedAt)}`
          : 'Empty';
        return `<div class="slot${active ? ' on' : ''}" data-slot="${n}">
          <div class="slot-head"><b class="slot-name">${esc(slotName(n))}</b>${active ? '<span class="tag">In use</span>' : ''}</div>
          <div class="slot-sub">${info}</div>
          <div class="row">
            ${c ? `<button class="btn" data-act="continue">Continue</button>` : ''}
            <button class="btn" data-act="new">New game</button>
            <button class="btn" data-act="rename">Rename</button>
            ${c ? `<button class="btn btn-danger" data-act="delete">Delete</button>` : ''}
          </div>
        </div>`;
      })
      .join('');
  }
  function heroTabsHtml(): string {
    return HEROES.map((h) => `<button class="btn" data-tab="${h.id}" aria-pressed="${h.id === opts.hero}">${esc(h.name)}</button>`).join('');
  }
  function savesTitle(): string {
    return `${esc(playerName)}'s ${esc(HEROES.find((h) => h.id === opts.hero)?.name ?? 'creature')} games`;
  }
  function openSaves(): void {
    openPanel(
      `<h3 id="savesTitle">${savesTitle()}</h3>
      <p>Every creature has ${SLOT_COUNT} games of its own. Your records count across all of them.</p>
      <div class="hero-tabs" id="heroTabs" role="group" aria-label="Creature">${heroTabsHtml()}</div>
      <div class="slots" id="slotList">${savesHtml()}</div>
      <div class="row"><button class="btn" id="pClose">Done</button></div>`,
      bindSaves,
    );
  }
  function refreshSaves(): void {
    $('slotList').innerHTML = savesHtml();
    $('heroTabs').innerHTML = heroTabsHtml();
    $('savesTitle').innerHTML = savesTitle();
    bindSaves();
  }
  function bindSaves(): void {
    $('pClose').onclick = closePanel;
    panel.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => {
      b.onclick = () => {
        pickHero(b.dataset.tab!);
        refreshSaves();
      };
    });
    panel.querySelectorAll<HTMLElement>('.slot').forEach((el) => {
      const n = Number(el.dataset.slot);
      const act = (a: string) => el.querySelector<HTMLButtonElement>(`[data-act="${a}"]`);
      const row = el.querySelector('.row') as HTMLElement;
      act('continue')?.addEventListener('click', () => {
        selectSlot(n);
        if (checkpoint) void startRun(checkpoint.data);
      });
      act('new')?.addEventListener('click', () => {
        if (!saves.loadCheckpoint(n).data) {
          selectSlot(n);
          return void startRun(null);
        }
        row.innerHTML = `<span>Replace the run in ${esc(slotName(n))}?</span>
          <button class="btn btn-danger" data-act="yes">Replace</button><button class="btn" data-act="no">Cancel</button>`;
        act('yes')!.onclick = () => {
          selectSlot(n);
          void startRun(null);
        };
        act('no')!.onclick = refreshSaves;
      });
      act('rename')?.addEventListener('click', () => {
        row.innerHTML = `<input class="slot-input" maxlength="24" aria-label="Name for this game" value="${esc(slotName(n))}">
          <button class="btn" data-act="save">Save</button><button class="btn" data-act="no">Cancel</button>`;
        const input = row.querySelector('input') as HTMLInputElement;
        input.focus();
        input.select();
        const save = () => {
          heroSlots().names[n - 1] = cleanSlotName(input.value, n);
          saveProfile();
          renderContinue();
          refreshSaves();
        };
        act('save')!.onclick = save;
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            save();
          }
          if (e.key === 'Escape') refreshSaves();
        });
        act('no')!.onclick = refreshSaves;
      });
      act('delete')?.addEventListener('click', () => {
        row.innerHTML = `<span>Delete the run in ${esc(slotName(n))}? This can't be undone.</span>
          <button class="btn btn-danger" data-act="yes">Delete</button><button class="btn" data-act="no">Cancel</button>`;
        act('yes')!.onclick = () => {
          saves.clearCheckpoint(n);
          renderContinue();
          refreshSaves();
        };
        act('no')!.onclick = refreshSaves;
      });
    });
  }
  $('cardSaves').addEventListener('click', openSaves);

  // ---------------------------------------------------------------- who's playing (players)
  $('playerName').textContent = playerName;
  /** Switch player: their profile, hero and saves load with the page. */
  function switchPlayer(id: number): void {
    const list = saves.loadPlayers();
    if (!list.players.some((p) => p.id === id)) return;
    list.active = id;
    saves.savePlayers(list);
    window.location.reload();
  }
  function playersHtml(): string {
    const list = saves.loadPlayers();
    return list.players
      .map((p) => {
        const on = p.id === list.active;
        return `<div class="player-row${on ? ' on' : ''}" data-player="${p.id}">
          <span class="pname">${esc(p.name)}</span>${on ? '<span class="tag">Playing</span>' : `<button class="btn" data-act="pick">Play as ${esc(p.name)}</button>`}
          <button class="btn" data-act="rename">Rename</button>
          ${list.players.length > 1 ? `<button class="btn btn-danger" data-act="delete">Delete</button>` : ''}
        </div>`;
      })
      .join('');
  }
  function openPlayers(): void {
    const full = saves.loadPlayers().players.length >= MAX_PLAYERS;
    openPanel(
      `<h3>Who's playing?</h3>
      <p>Each player has their own creature, games and records. Up to ${MAX_PLAYERS} players on this device.</p>
      <div class="players" id="playerList">${playersHtml()}</div>
      ${full ? '' : `<div class="player-row" id="addRow"><input id="newPlayer" maxlength="16" placeholder="New player's name" aria-label="New player's name"><button class="btn" id="pAdd">Add player</button></div>`}
      <div class="row"><button class="btn" id="pClose">Done</button></div>`,
      bindPlayers,
    );
  }
  function bindPlayers(): void {
    $('pClose').onclick = closePanel;
    const add = document.getElementById('pAdd');
    if (add) {
      const input = $('newPlayer') as HTMLInputElement;
      const doAdd = () => {
        const id = saves.addPlayer(input.value, profile);
        if (id !== null) switchPlayer(id);
      };
      add.onclick = doAdd;
      input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        doAdd();
      });
    }
    panel.querySelectorAll<HTMLElement>('.player-row[data-player]').forEach((el) => {
      const id = Number(el.dataset.player);
      const name = saves.loadPlayers().players.find((p) => p.id === id)?.name ?? '';
      const act = (a: string) => el.querySelector<HTMLButtonElement>(`[data-act="${a}"]`);
      act('pick')?.addEventListener('click', () => switchPlayer(id));
      act('rename')?.addEventListener('click', () => {
        el.innerHTML = `<input maxlength="16" aria-label="Player name" value="${esc(name)}"><button class="btn" data-act="save">Save</button><button class="btn" data-act="no">Cancel</button>`;
        const input = el.querySelector('input') as HTMLInputElement;
        input.focus();
        input.select();
        const save = () => {
          saves.renamePlayer(id, input.value);
          if (id === saves.activePlayer) $('playerName').textContent = saves.loadPlayers().players.find((p) => p.id === id)?.name ?? '';
          openPlayers();
        };
        act('save')!.onclick = save;
        input.addEventListener('keydown', (e) => {
          // preventDefault: otherwise the same Enter also presses the button that gets focus next (Rename again).
          if (e.key === 'Enter') {
            e.preventDefault();
            save();
          }
          if (e.key === 'Escape') openPlayers();
        });
        act('no')!.onclick = openPlayers;
      });
      act('delete')?.addEventListener('click', () => {
        el.innerHTML = `<span class="pname">Delete ${esc(name)} with all their games and records? This can't be undone.</span>
          <button class="btn btn-danger" data-act="yes">Delete</button><button class="btn" data-act="no">Cancel</button>`;
        act('yes')!.onclick = () => {
          const wasActive = id === saves.activePlayer;
          saves.deletePlayer(id);
          if (wasActive) window.location.reload();
          else openPlayers();
        };
        act('no')!.onclick = openPlayers;
      });
    });
  }
  $('btnPlayer').addEventListener('click', openPlayers);
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
      <p>You are a young crocodile or Mosa (pick one above PLAY) in a reef full of hungry fish. Eat, grow, and work your way up the food chain.</p>
      <h4>Controls</h4>
      <ul>${
        touch
          ? `<li><b>Swim:</b> put your left thumb anywhere on the left half and drag the joystick.</li>
             <li><b>EAT / BITE</b>, <b>SPRINT</b> and <b>DASH</b> buttons are on the right.</li>`
          : `<li><b>Swim:</b> WASD or arrow keys, or hold the mouse button.</li>
             <li><b>Eat / bite:</b> Space or right-click. <b>Sprint:</b> Shift. <b>Dash:</b> E or Q.</li>`
      }
      <li><b>Controller</b> (Xbox, PlayStation, most Bluetooth pads): left stick or D-pad to swim, <b>${buttonsLabel(pads.map, 'eat', pads.style)}</b> eat, <b>${buttonsLabel(pads.map, 'sprint', pads.style)}</b> sprint, <b>${buttonsLabel(pads.map, 'ability', pads.style)}</b> your stage ability, <b>${buttonsLabel(pads.map, 'pause', pads.style)}</b> pause. Change them in Options, Controller buttons. In menus, move with the D-pad, <b>A</b> to choose, <b>B</b> to go back.</li></ul>
      <h4>Eating</h4>
      <ul>
        <li>Plankton and meat chunks are eaten just by touching them with your mouth.</li>
        <li>The ring at your mouth turns <span class="ring" style="border-color:#7cff6b"></span> green when you can swallow a fish whole, and <span class="ring" style="border-color:#ffa53a"></span> orange when it is too big: then you bite it.</li>
      </ul>
      <h4>Staying alive</h4>
      <ul>
        <li>Big fish hunt you. Each hit takes at most a third of your health and you blink for a moment, so swim away.</li>
        <li>Hide in kelp: predators can't see you unless they come very close.</li>
        <li>Big predators live in deep water. A baby crocodile can't swim down there yet: each time you evolve, deeper water opens up.</li>
        <li>When your stomach is over 75% full, stay still to digest. Digesting heals you, then turns food into growth.</li>
        <li>Don't let your stomach run empty, or you starve.</li>
      </ul>
      <h4>Saving</h4>
      <ul>
        <li>Your run saves by itself every few seconds, when you level up, pause, or switch apps. Tap <b>CONTINUE</b> on the home screen to pick it up.</li>
        <li>Every 10 levels a <b>Checkpoint Crab</b> appears (an arrow points to it). Defeat it and that level is saved: if you die, you swim again from there instead of from level 1.</li>
        <li>Every 10 levels is a <b>Tide</b>: the reef grows a little tougher, and a Checkpoint Crab waits at its end. There is no last level: after level 30 you earn <b>Legend levels</b>, a little stronger each time, with a perk every 3 levels.</li>
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
      <div class="toggle"><span>Controller buttons<br><span style="color:var(--muted);font-size:13px">Choose which button does what</span></span><button class="btn" id="oPad">Set up</button></div>
      <div class="toggle"><span>Enemy settings<br><span style="color:var(--muted);font-size:13px">${enemiesChanged() ? 'Changed on this device' : 'When enemies appear, how strong they are'}</span></span><button class="btn" id="oEnemies">Edit</button></div>
      <div class="toggle"><span>Problem log<br><span style="color:var(--muted);font-size:13px">${readErrorLog().length ? `${readErrorLog().length} problem(s) noted on this device` : 'No problems noted'}</span></span><button class="btn" id="oErrors">Show</button></div>
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
        $('oPad').onclick = openPadMap;
        $('oEnemies').onclick = openEnemies;
        $('oErrors').onclick = openErrors;
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

  /** The problems this device noted (newest first), so they can be screenshotted and sent. */
  function openErrors(): void {
    const list = readErrorLog().slice().reverse();
    const rows = list
      .map((e) => {
        const top = (e.stack ?? '').split('\n').slice(0, 3).join(' / ');
        return `<li><b>${esc(new Date(e.t).toLocaleString())}</b> v${esc(e.app)}<br>${esc(e.msg)}<br><span style="color:var(--muted)">${esc(e.where ?? '')} ${esc(top)}</span></li>`;
      })
      .join('');
    openPanel(
      `<h3>Problem log</h3>
      ${list.length ? `<ol id="errList" style="font-size:12px;word-break:break-word;max-height:50vh;overflow:auto;padding-left:18px">${rows}</ol>` : '<p>No problems noted on this device.</p>'}
      <div class="row"><button class="btn" id="eBack">Back</button></div>`,
      () => {
        $('eBack').onclick = openOptions;
      },
    );
  }

  // ---------------------------------------------------------------- enemy settings (admin)
  function openEnemies(): void {
    const rows = enemyIds()
      .map((id) => {
        const sp = SPECIES[id];
        const field = (k: string) => ENEMY_FIELDS.find((f) => f.key === k)!.get(id);
        return `<button class="btn enemy-row" data-enemy="${esc(id)}"><b>${esc(sp.displayName)}</b><span>from level ${field('unlockLevel')} · ${field('count')} in the sea</span></button>`;
      })
      .join('');
    openPanel(
      `<h3>Enemy settings</h3>
      <p class="saved-line">Change when enemies appear and how strong they are. Saved on this device; your next swim uses them.</p>
      <div class="enemy-list">${rows}</div>
      <div class="row"><button class="btn" id="enReset" data-label="Reset all">Reset all</button><button class="btn" id="enBack">Done</button></div>`,
      () => {
        panel.querySelectorAll<HTMLButtonElement>('[data-enemy]').forEach((b) => (b.onclick = () => openEnemy(b.dataset.enemy!)));
        confirmButton('enReset', 'Tap again to reset all', () => {
          resetEnemies();
          badge('Enemies back to the shipped settings');
          openEnemies();
        });
        $('enBack').onclick = openOptions;
      },
    );
  }
  function openEnemy(id: string): void {
    const sp = SPECIES[id];
    const fields = ENEMY_GROUPS.map((group) => `<h4 class="en-group">${esc(group)}</h4>` + ENEMY_FIELDS.filter((f) => f.group === group).map((f) => {
      const v = f.get(id);
      return `<div class="en-field"><label for="en_${f.key}"><b>${esc(f.label)}</b> <output id="eo_${f.key}">${fmt(v)}</output><br><span class="en-help">${esc(f.help)} Shipped: ${fmt(shippedValue(id, f.key))}.</span></label>
        <input type="range" id="en_${f.key}" min="${f.min}" max="${f.max}" step="${f.step}" value="${v}"></div>`;
    }).join('')).join('');
    openPanel(
      `<h3>${esc(sp.displayName)}</h3>${fields}
      <div class="row"><button class="btn" id="enSave">Save</button><button class="btn" id="enShipped">Shipped values</button><button class="btn" id="enBack2">Back</button></div>`,
      () => {
        for (const f of ENEMY_FIELDS) {
          const input = $(`en_${f.key}`) as HTMLInputElement;
          input.oninput = () => ($(`eo_${f.key}`).textContent = fmt(+input.value));
        }
        $('enSave').onclick = () => {
          saveEnemy(id, Object.fromEntries(ENEMY_FIELDS.map((f) => [f.key, +($(`en_${f.key}`) as HTMLInputElement).value])));
          badge(`${sp.displayName} saved: your next swim uses it`);
          openEnemies();
        };
        $('enShipped').onclick = () => {
          for (const f of ENEMY_FIELDS) {
            ($(`en_${f.key}`) as HTMLInputElement).value = String(shippedValue(id, f.key));
            $(`eo_${f.key}`).textContent = fmt(shippedValue(id, f.key));
          }
        };
        $('enBack2').onclick = openEnemies;
      },
    );
  }
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));

  // ---------------------------------------------------------------- controller buttons (mapping)
  /** Waiting for a controller button for this action (the menu's own pad handling pauses meanwhile). */
  let capturing: { action: PadAction; replace: boolean; until: number } | null = null;
  function savePadMap(map: typeof pads.map): void {
    pads.map = map;
    const isDefault = PAD_ACTIONS.every((a) => map[a].join() === DEFAULT_PAD_MAP[a].join());
    opts.padMap = isDefault ? null : map;
    saveProfile();
  }
  function openPadMap(): void {
    capturing = null;
    pads.poll();
    const rows = PAD_ACTIONS.map(
      (a) => `<div class="toggle pad-row"><span><b>${PAD_ACTION_NAMES[a]}</b><br><span class="pad-btns" id="pm_${a}">${esc(buttonsLabel(pads.map, a, pads.style))}</span></span>
        <span class="row"><button class="btn" data-pm="${a}" data-mode="set">Change</button><button class="btn" data-pm="${a}" data-mode="add">Add</button></span></div>`,
    ).join('');
    openPanel(
      `<h3>Controller buttons</h3>
      <p class="saved-line" id="pmStatus">${pads.connected ? `Controller: ${esc(pads.name.replace(/\(.*\)/, '').trim().slice(0, 40) || 'connected')}` : 'No controller found yet. Connect one and press any button on it.'}</p>
      ${rows}
      <p style="color:var(--muted);font-size:13px">Change = only the button you press next. Add = one more button for it. Swimming stays on the left stick and D-pad; menus always use ${buttonName(0, pads.style)} to choose and ${buttonName(1, pads.style)} to go back.</p>
      <div class="row"><button class="btn" id="pmReset">Default buttons</button><button class="btn" id="pmBack">Done</button></div>`,
      () => {
        panel.querySelectorAll<HTMLButtonElement>('[data-pm]').forEach((b) => {
          b.onclick = () => {
            const action = b.dataset.pm as PadAction;
            capturing = { action, replace: b.dataset.mode === 'set', until: performance.now() + 8000 };
            $('pmStatus').innerHTML = `Press a button on your controller for <b>${PAD_ACTION_NAMES[action]}</b>... <button class="btn" id="pmCancel">Cancel</button>`;
            $('pmCancel').onclick = openPadMap;
          };
        });
        $('pmReset').onclick = () => {
          savePadMap(DEFAULT_PAD_MAP);
          openPadMap();
          badge('Controller buttons back to default');
        };
        $('pmBack').onclick = openOptions;
      },
    );
  }
  /** Called from the pad loop while waiting for a button. Returns true while it owns the controller. */
  function capturePad(): boolean {
    if (!capturing) return false;
    if (!wrap.classList.contains('open')) {
      capturing = null;
      return false;
    }
    if (performance.now() > capturing.until) {
      openPadMap();
      return true;
    }
    const b = pads.firstPressed();
    if (b < 0) return true;
    const { action, replace } = capturing;
    capturing = null;
    savePadMap(assignButton(pads.map, action, b, replace));
    openPadMap();
    badge(`${PAD_ACTION_NAMES[action]}: ${buttonName(b, pads.style)}`);
    // Keep the menu from also acting on this press.
    padSkipUntil = performance.now() + 250;
    return true;
  }
  let padSkipUntil = 0;

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

  // ---------------------------------------------------------------- Sprite Studio: pick a design to edit
  // Every creature in the game is a studio project. Editing it here changes it in the game.
  $('cardStudio').addEventListener('click', (e) => {
    e.preventDefault();
    const link = (id: string, label: string) => `<a class="btn" href="${studioUrl(id)}">${esc(label)}</a>`;
    const heroes = HEROES.map(
      (h) => `<p class="studio-group">${esc(h.name)}</p><div class="row">${heroStages(h.id).map((st) => link(st.skin, st.name)).join('')}</div>`,
    ).join('');
    const seen = new Set<string>();
    const reef = Object.values(SPECIES)
      .filter((sp) => sp.look && !isHero(sp.id) && !seen.has(sp.look) && seen.add(sp.look))
      .map((sp) => link(sp.look!, sp.displayName))
      .join('');
    openPanel(
      `<h3>Sprite Studio</h3>
      <p>Pick a creature to change how it looks in the game. Your changes show up on your next swim.</p>
      ${heroes}
      <p class="studio-group">Reef creatures</p><div class="row">${reef}</div>
      <div class="row"><a class="btn" href="${STUDIO_URL}">Open Sprite Studio</a><button class="btn" id="pClose">Close</button></div>`,
      () => ($('pClose').onclick = closePanel),
    );
  });

  $('cardCredits').addEventListener('click', () =>
    openPanel(
      `<h3>Credits</h3>
      <ul>
        <li><b>Crocodile design:</b> original pixel art by the developer's son, cleaned up and animated.</li>
        <li><b>Fish, kelp, rocks, sand:</b> Fish Pack by Kenney (kenney.nl), CC0.</li>
        <li><b>Music:</b> "Aquaria" by cynicmusic, CC0 (Sunny Reef). The other pieces are generated live in the game's code.</li>
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
  /** Everything the play screen no longer shows (it stays minimal): shown when you pause (Start / MENU). */
  function detailsHtml(): string {
    const g = scene();
    const p = g?.player;
    if (!g || !p) return '';
    const mins = Math.floor(g.runTime / 60), secs = Math.floor(g.runTime % 60);
    const legend = legendLevel(p.level);
    const rows: Array<[string, string]> = [
      ['Where', `${g.region?.name ?? ''} · ${BALANCE.dayNight.periods[g.period].name}`],
      ['Tide', `${tideOf(p.level)}: ${tideName(tideOf(p.level))}`],
      ['Stage', `${p.stage?.name ?? ''} · level ${p.level}${legend ? ` (Legend ${legend})` : ''}`],
      ['Health', `${Math.ceil(p.hp)} / ${p.maxHp}`],
      ['Bite', `${p.biteDamage.toFixed(0)}`],
      ['Swallows up to', `size ${p.devourSize.toFixed(0)}`],
      ['Stomach', `${Math.round(g.stomach.ratio * 100)}% full`],
      ['Kills', `${g.stats.kills} (fish eaten ${g.stats.fish})`],
      ['Time', `${mins}:${String(secs).padStart(2, '0')}`],
    ];
    const help = earlyHelpStrength(p.level);
    if (help > 0) {
      const h = earlyHelpMods(p.level);
      const pc = (v: number) => Math.round(Math.abs(v - 1) * 100);
      rows.push(['Head start', `+${pc(h.speed)}% speed, +${pc(h.turn)}% turning, ${pc(1 / h.stamina)}% longer sprint, -${pc(h.damageTaken)}% damage (fades out by level ${BALANCE.earlyHelp.endsAt})`]);
    }
    const perks = g.perks.map((id) => perkById(id)?.name).filter(Boolean).join(', ');
    if (perks) rows.push(['Perks', perks]);
    return `<div class="details">${rows.map(([k, v]) => `<span class="dk">${esc(k)}</span><span class="dv">${esc(v)}</span>`).join('')}</div>`;
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
      ${detailsHtml()}
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

  // ---------------------------------------------------------------- controller in the menus
  // D-pad / left stick moves between buttons (the nearest one in that direction), A presses,
  // B goes back (closes a panel, resumes from pause; never skips a perk choice), Start pauses
  // and resumes in a run, and on the home screen starts CONTINUE or PLAY.
  const FOCUSABLE = 'button:not([disabled]), a[href], input, select';
  let navHeld = 0;
  let navDir = '';
  function visibleIn(root: HTMLElement): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && !el.closest('[hidden]') && getComputedStyle(el).visibility !== 'hidden';
    });
  }
  function padFocus(el: HTMLElement | null): void {
    document.querySelectorAll('.pad-focus').forEach((e) => e.classList.remove('pad-focus'));
    if (!el) return;
    el.classList.add('pad-focus');
    el.focus({ preventScroll: false });
    el.scrollIntoView({ block: 'nearest' });
  }
  /** The nearest button in a direction: mostly along it, a little across it. */
  function moveFocus(root: HTMLElement, dx: number, dy: number): void {
    const items = visibleIn(root);
    if (!items.length) return;
    const cur = document.activeElement as HTMLElement | null;
    if (!cur || !items.includes(cur)) return padFocus(items[0]);
    const a = cur.getBoundingClientRect();
    const ax = a.left + a.width / 2;
    const ay = a.top + a.height / 2;
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const el of items) {
      if (el === cur) continue;
      const b = el.getBoundingClientRect();
      const vx = b.left + b.width / 2 - ax;
      const vy = b.top + b.height / 2 - ay;
      const along = vx * dx + vy * dy;
      if (along <= 4) continue;
      const across = Math.abs(vx * dy - vy * dx);
      const score = along + across * 2.5;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    if (best) padFocus(best);
  }
  function padLoop(): void {
    requestAnimationFrame(padLoop);
    pads.poll();
    if (capturePad() || performance.now() < padSkipUntil) return;
    if (!pads.connected) return;
    const panelOpen = wrap.classList.contains('open');
    const root = panelOpen ? panel : home.classList.contains('open') ? home : null;
    if (pads.actJust('pause')) {
      if (paused && !choosingPerk) return void closePanel();
      if (!root && playing()) return void pause();
      if (root === home) return void (($('btnContinue') as HTMLButtonElement).hidden ? $('btnPlay') : $('btnContinue')).click();
    }
    if (!root) return;
    // Directions: act on the first press, then repeat while held.
    const d = pads.y < -0.5 ? 'up' : pads.y > 0.5 ? 'down' : pads.x < -0.5 ? 'left' : pads.x > 0.5 ? 'right' : '';
    if (d !== navDir) {
      navDir = d;
      navHeld = 0;
    } else navHeld++;
    if (d && (navHeld === 0 || (navHeld > 24 && navHeld % 8 === 0))) {
      const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[d]!;
      moveFocus(root, dx, dy);
    }
    if (pads.justDown(PAD.A)) {
      const el = document.activeElement as HTMLElement | null;
      if (el && root.contains(el) && el.tagName !== 'INPUT') el.click();
      else if (!el || !root.contains(el)) moveFocus(root, 0, 1);
    }
    if (pads.justDown(PAD.B) && panelOpen && !choosingPerk) {
      // Back: cancel an open confirm step first, else close the panel.
      const cancel = panel.querySelector<HTMLElement>('[data-act="no"]');
      if (cancel) cancel.click();
      else closePanel();
    }
  }
  requestAnimationFrame(padLoop);
  window.addEventListener('gamepadconnected', (e) => {
    badge(`Controller connected: ${(e as GamepadEvent).gamepad.id.replace(/\(.*\)/, '').trim().slice(0, 40) || 'gamepad'}`);
    pads.poll();
  });
  window.addEventListener('gamepaddisconnected', () => badge('Controller disconnected', true));

  // ---------------------------------------------------------------- perk choice
  let choosingPerk = false;
  window.addEventListener('ce:perk', (e) => {
    const { options, level } = (e as CustomEvent<{ options: PerkDef[]; level: number }>).detail;
    if (!playing() || paused) return;
    choosingPerk = true;
    paused = true;
    game.scene.pause('Game');
    openPanel(
      `<h3>Level ${level}: choose a perk</h3>
      <p class="saved-line">Pick one. Perks add up, and they stay with you if you swim again from your stage.</p>
      <div class="perks">${options
        .map((o) => `<button class="btn perk" data-perk="${esc(o.id)}"><img class="pi" alt="" width="32" height="32" src="${perkIconUrl(o.id, 2)}"><span class="pn">${esc(o.name)}</span><span class="pd">${esc(o.desc)}</span></button>`)
        .join('')}</div>`,
      () =>
        panel.querySelectorAll<HTMLButtonElement>('[data-perk]').forEach((b) => {
          b.onclick = () => {
            choosingPerk = false;
            paused = false;
            wrap.classList.remove('open');
            game.scene.resume('Game');
            scene()?.choosePerk(b.dataset.perk!);
          };
        }),
    );
  });

  // A boss cave: ask before going in (the game waits paused).
  window.addEventListener('ce:cave', (e) => {
    const d = (e as CustomEvent<{ id: string; cave: string; boss: string; beaten: boolean }>).detail;
    const g = scene();
    if (!g) return;
    if (!playing() || paused) return void g.answerCave(false);
    choosingPerk = true; // like a perk choice: Escape and B don't skip it, the buttons answer
    paused = true;
    game.scene.pause('Game');
    const answer = (enter: boolean) => {
      choosingPerk = false;
      paused = false;
      wrap.classList.remove('open');
      game.scene.resume('Game');
      scene()?.answerCave(enter);
    };
    openPanel(
      `<h3>${esc(d.cave)}</h3>
      <p>${
        d.beaten
          ? `You beat the ${esc(d.boss)} here. The cave is quiet now.`
          : `The ${esc(d.boss)} lives in this cave. Inside, it's just you and it. You can swim back out any time, and if it wins you wake up outside.`
      }</p>
      <div class="row"><button class="btn btn-play" id="cEnter">Enter the cave</button><button class="btn" id="cNo">Not now</button></div>`,
      () => {
        $('cEnter').onclick = () => answer(true);
        $('cNo').onclick = () => answer(false);
      },
    );
  });

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || choosingPerk) return;
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
        <p class="err-line" style="color:var(--muted);font-size:12px;word-break:break-word">${esc(lastErrorLine())}</p>
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

// ---------------------------------------------------------------- home screen artwork (pixel designs)
async function drawArt(): Promise<void> {
  // Food chain: what the crocodile can swallow at which level (bigger ones it can only bite).
  const steps: Array<{ id?: string; name: string; level: number | null; tint?: string }> = [
    { name: 'Plankton', level: 1, tint: '#63c74d' },
    ...['blue_tang', 'reef_snapper', 'red_grouper', 'grey_shark'].map((id) => ({
      id,
      name: SPECIES[id].displayName,
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
    if (s.tint) {
      // Plankton: a small pixel dot in its game color.
      g.fillStyle = s.tint;
      for (const [x, y, w, h] of [[51, 35, 10, 10], [49, 37, 14, 6], [53, 33, 6, 14]]) g.fillRect(x, y, w, h);
    } else {
      const look = SPECIES[s.id!]?.look;
      if (look) void drawLook(c, `studio/seeds/${look}.json`);
    }
    el.appendChild(c);
    el.insertAdjacentHTML('beforeend', `<span class="n">${s.name}</span><span class="lv">${s.level === 1 ? 'from the start' : s.level ? `level ${s.level}+` : 'bite it'}</span>`);
    row.appendChild(el);
  });
}

/** The home screen's big creature: the picked hero's adult design, animating its idle pose (with the blink). */
let logoTimer: number | undefined;
let logoToken = 0;
async function showHeroLogo(heroId: string): Promise<void> {
  const c = document.getElementById('heroCroc') as HTMLCanvasElement | null;
  if (!c) return;
  const token = ++logoToken;
  const adult = heroStages(heroId).at(-1)!;
  let p: StudioProject;
  try {
    p = (await (await fetch(`studio/seeds/${adult.skin}.json`)).json()) as StudioProject;
  } catch {
    return; // decoration only
  }
  if (token !== logoToken) return; // another hero was picked meanwhile
  const pose = p.poses.find((x) => x.name === 'idle' && x.frames.length) ?? p.poses.find((x) => x.frames.length);
  if (!pose) return;
  const frames = pose.frames.map((f) => decodeFrame(f, p.w * p.h));
  // One crop box for all frames, so the creature does not jump; whole-number scale keeps pixels square.
  let x0 = p.w, y0 = p.h, x1 = 0, y1 = 0;
  for (const px of frames)
    px.forEach((v, i) => {
      if (v < 0) return;
      const x = i % p.w, y = Math.floor(i / p.w);
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    });
  if (x1 < x0) return;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const k = Math.max(1, Math.floor(Math.min(c.width / w, c.height / h)));
  const ox = Math.floor((c.width - w * k) / 2), oy = Math.floor((c.height - h * k) / 2);
  const g = c.getContext('2d')!;
  let i = 0;
  const draw = () => {
    const px = frames[i % frames.length];
    g.clearRect(0, 0, c.width, c.height);
    px.forEach((v, n) => {
      if (v < 0) return;
      g.fillStyle = p.palette[v];
      g.fillRect(ox + ((n % p.w) - x0) * k, oy + (Math.floor(n / p.w) - y0) * k, k, k);
    });
    i++;
  };
  window.clearInterval(logoTimer);
  draw();
  c.setAttribute('aria-label', `The ${SPECIES[heroId]?.displayName ?? 'hero'}`);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce && frames.length > 1) logoTimer = window.setInterval(draw, Math.round(1000 / Math.max(1, pose.fps || 3)));
}

/** Draw a Sprite Studio design (its first idle or move frame) crisply into a canvas, centered and fitted. */
async function drawLook(c: HTMLCanvasElement, url: string): Promise<void> {
  try {
    const p = (await (await fetch(url)).json()) as StudioProject;
    const pose = p.poses.find((x) => x.name === 'idle' && x.frames.length) ?? p.poses.find((x) => x.name === 'move');
    if (!pose) return;
    const px = decodeFrame(pose.frames[0], p.w * p.h);
    // Crop to the drawn pixels, then scale by a whole number so every pixel stays square.
    let x0 = p.w, y0 = p.h, x1 = 0, y1 = 0;
    px.forEach((v, i) => {
      if (v < 0) return;
      const x = i % p.w, y = Math.floor(i / p.w);
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    });
    if (x1 < x0) return;
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const k = Math.max(1, Math.floor(Math.min((c.width - 8) / w, (c.height - 8) / h)));
    const ox = Math.floor((c.width - w * k) / 2), oy = Math.floor((c.height - h * k) / 2);
    const g = c.getContext('2d')!;
    px.forEach((v, i) => {
      if (v < 0) return;
      g.fillStyle = p.palette[v];
      g.fillRect(ox + ((i % p.w) - x0) * k, oy + (Math.floor(i / p.w) - y0) * k, k, k);
    });
  } catch {
    /* decoration only */
  }
}
