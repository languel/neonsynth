# Neonsynth / Chimera

This project starts with the full [Chimera Vocal Synth](https://github.com/jamesondh/chimera-vocal-synth) demo and its actual Rust physical-modeling engine, imported at commit `6259e880f5d0108b862e98cefd930aa8c5bc0dc5`. Play, Speak, Sing, Bestiary, and Beatbox are the original application, with its code-drawn vector display and simulated airways. Chimera is MIT licensed; see [LICENSE-CHIMERA.txt](LICENSE-CHIMERA.txt), [the upstream README](docs/UPSTREAM-README.md), and its [architecture notes](docs/architecture.md).

**Live site:** <https://languel.github.io/neonsynth/>

## Run

Requires Node 22+, Rust, and the `wasm32-unknown-unknown` target (`rustup target add wasm32-unknown-unknown`). Bun is installed as a development dependency.

```sh
npm ci
npm run wasm         # compile the actual Rust engine to WebAssembly
npm run dev          # http://localhost:5317
npm test             # rebuild wasm, native Rust tests, and Bun ABI/UI tests
npm run build        # typecheck and build the site
npx playwright install chromium
npm run test:e2e     # browser smoke tests
```

The AudioWorklet needs HTTPS or localhost and a user gesture to start. The wasm binary is a build product and is not checked into Git.

## Deployment

GitHub Actions builds the Rust engine and site, runs native, Wasm and browser tests, then deploys to GitHub Pages on every push from a branch containing the workflow. The repository is served at `/neonsynth/`. The `github-pages` environment must allow the branch; the newest successful push can replace the live site.
