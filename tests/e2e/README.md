# Browser tests

Headless Chrome checks for the save system. They need a running build:

```
npm run build && npx vite preview --port 4173      # game
python3 -m http.server 8090 -d tools/sprite-studio # studio
node tests/e2e/save_e2e.mjs
node tests/e2e/studio_save.mjs
```

`save_e2e.mjs` covers legacy migration, checkpoint, reload and Continue, tab
hiding, a damaged save, the error panel, death, and blocked storage.
`studio_save.mjs` uses a mock cloud database to cover the instant device copy,
revisions and the conflict dialog, offline retry, startup recovery, history
and the trash.

`mosa.mjs` picks Mosa on the home screen, grows it through all three stages, uses Dart,
Tail Slam and Crushing Bite, then checks that Continue brings back a Mosa run and that a new
run with Croc picked is a crocodile again.

`shark.mjs` picks the White Shark, grows it through all three stages and checks that Feeding
Frenzy boosts bite and speed, then wears off and recharges.

`crab.mjs` covers the Checkpoint Crab: appears at level 10 with a banner and an arrow, can't be
swallowed, takes about 14 bites, pinches, saves level 10, and after dying the run restarts at
level 10 with its perks; Continue keeps the crab level and a new run clears it.

`enemies.mjs` checks the higher-level enemies: none on the home screen or at the start, lionfish at
level 6 (with a banner and venom), moray eels at 14 (they lunge), barracuda at 22, and a run
continued at level 15 starts with the enemies it has unlocked.

`slots.mjs` covers save slots: the first run saves in slot 1 (the original key), NEW RUN offers an
empty slot, slots keep separate runs, rename (kept after reload), Continue from the panel, delete
with a confirm step, and New game in an empty slot.

`gamepad.mjs` plugs in a virtual controller (navigator.getGamepads replaced before load) and drives
the home screen, swimming, eating, sprint, the ability, pause and resume, a perk choice and the
death screen with it.
