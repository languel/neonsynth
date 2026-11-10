# Neonsynth / Chimera

This project starts with the full [Chimera Vocal Synth](https://github.com/jamesondh/chimera-vocal-synth) demo and its actual Rust physical-modeling engine, imported at commit `6259e880f5d0108b862e98cefd930aa8c5bc0dc5`. Play, Speak, Sing, Bestiary, and Beatbox are the original application, with its code-drawn vector display and simulated airways. Chimera is MIT licensed; see [LICENSE-CHIMERA.txt](LICENSE-CHIMERA.txt), [the upstream README](docs/UPSTREAM-README.md), and its [architecture notes](docs/architecture.md).

**Live site:** <https://languel.github.io/neonsynth/>

## Build an instrument

Choose **Build** next to the five original modes. Load an example, or choose **New drawing**. Draw a duct, place sources, chambers and outlets, then use **Connect** and click two glowing anchors at a time. Select a part to edit its dimensions, wall material or energy source. A drawing's centerline determines the initial duct length; the editable start and end areas create its taper. Coordinates are diagrammatic, not a 3D acoustic mesh: the solver uses the resulting lengths, areas, cavity volumes, connections and source settings.

Folds, syrinx labia, lip reed, coupled whistling jet and turbulent air use Chimera's Rust source and `AirwayNetwork` models. The instrument has reference pitch, attack/release, vibrato, pressure pulsing and output trim; multiple sources can share an airway. Sources and outlets each need one connection, and all parts must form one connected graph. **Hear instrument** holds its reference pitch; the keyboard plays notes relative to that pitch. Examples include speculative whale, bird, dinosaur and dragon voices, brass, flute, glass and invented instruments. They are creative sketches rather than recordings or definitive reconstructions of animal anatomy.

Save designs in browser local storage or export and import portable JSON. Local browser data may be lost when site data is cleared; export anything important.

## Assemble a band

Choose **Band**, add up to four independent instruments, name the parts and set their levels. Choose a note for each part and tap the 16-step grid to place or erase notes; the playhead loops at the chosen tempo. Every part has its own Rust/Wasm physical voice, mixed together in an AudioWorklet. The studio chooses the lowest internal oversampling rate that keeps the drawn geometry stable; notes are bounded to a safe source frequency. If the displayed load is high, mute or remove a part. Editing the band stops playback so the physical graphs can be safely rebuilt. Bands save each instrument as a snapshot, alongside the notes, and can also be exported/imported as JSON.

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
