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
