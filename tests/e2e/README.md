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
