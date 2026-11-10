# Neonsynth / Chimera

This project starts with the full [Chimera Vocal Synth](https://github.com/jamesondh/chimera-vocal-synth) demo and its actual Rust physical-modeling engine, imported at commit `6259e880f5d0108b862e98cefd930aa8c5bc0dc5`. Play, Speak, Sing, Bestiary, and Beatbox are the original application, with its code-drawn vector display and simulated airways. Chimera is MIT licensed; see [LICENSE-CHIMERA.txt](LICENSE-CHIMERA.txt), [the upstream README](docs/UPSTREAM-README.md), and its [architecture notes](docs/architecture.md).

**Live site:** <https://languel.github.io/neonsynth/>

## Build an instrument

Choose **Build** next to the five original modes. Load an example, or choose **New drawing**. Draw a duct, place sources, chambers and outlets, then use **Connect** and click two glowing anchors at a time. Select a part to edit its dimensions, wall material or energy source. A drawing's centerline determines the initial duct length; the editable start and end areas create its taper. Coordinates are diagrammatic, not a 3D acoustic mesh: the solver uses the resulting lengths, areas, cavity volumes, connections and source settings.

Folds, syrinx labia, lip reed, coupled whistling jet and turbulent air use Chimera's Rust source and `AirwayNetwork` models. The instrument has reference pitch, attack/release, vibrato, pressure pulsing and output trim; multiple sources can share an airway. Sources and outlets each need one connection, and all parts must form one connected graph. **Hear instrument** holds its reference pitch; the keyboard plays notes relative to that pitch. Examples include speculative whale, bird, dinosaur and dragon voices, brass, flute, glass and invented instruments. They are creative sketches rather than recordings or definitive reconstructions of animal anatomy.

Save designs in browser local storage or export and import portable JSON. Local browser data may be lost when site data is cleared; export anything important.

## Assemble a band

Choose **Band**, add up to four independent physical instruments, and name their parts. Choose a note for each part and tap the 16-step grid to place or erase notes; the playhead loops at the chosen tempo. Every part has its own Rust/Wasm voice, mixed together in stereo on an AudioWorklet. The studio chooses an internal oversampling rate that keeps the drawn geometry stable; source frequencies are bounded for safety. If the displayed load is high, mute or remove a part.

The **Mixer** controls each part's level, stereo pan, expression, mute, and solo. Pattern, tempo and mixer changes take effect while the band plays without rebuilding the voices. Adding or removing a voice or loading a different band rebuilds the physical graphs and restarts the playhead. Bands save each instrument as a snapshot together with its pattern, channel and mixer settings; they can be exported/imported as JSON. Earlier band files without mixer settings are migrated automatically.

### Play and mix with MIDI

1. Connect a MIDI keyboard or controller to the computer, open **Band**, and choose **Connect MIDI**. The browser asks for permission; Neonsynth requests *input only*, without SysEx. You can choose one input or **All inputs**, and devices connected later appear automatically. A disconnected input releases its notes; **All MIDI notes off** releases live notes and resets pitch bend without stopping the sequencer.
2. Assign each part a MIDI channel from 1–16 in the mixer, then set the sending device to the same channel. New parts use different channels by default. Deliberately give several parts the same channel to layer them. Up to four physical parts can sound together; each part is monophonic, with most-recent-note priority and fallback to earlier held notes. When a live MIDI note is held, it overrides that part's sequencer; releasing it returns to the pattern. MIDI can play even when the band transport is stopped.
3. Send channel messages from a keyboard, DAW, or MIDI control surface. Controller messages update the visible mixer and take effect live on all parts assigned to the channel. CC 80 and 81 are general-purpose controller numbers that Neonsynth maps to mute and solo; configure those controls on your device:

   | Message | Effect |
   | --- | --- |
   | Note on/off | Pitch and velocity (velocity-zero note-on is note-off) |
   | Pitch bend | ±2 semitones around center |
   | CC 7 | Level (0–127) |
   | CC 10 | Stereo pan (0 left, 64 center, 127 right) |
   | CC 11 | Expression (0–127, multiplied by level) |
   | CC 64 | Sustain pedal (0–63 up, 64–127 down) |
   | CC 80 / CC 81 | Mute / solo switches (0–63 off, 64–127 on) |
   | CC 120 / CC 123 | Release live notes from that input/channel; CC 123 respects sustain. Neither stops the sequencer |
   | CC 121 | Release that input's sustained notes, center channel pitch bend, and reset channel expression |

Web MIDI requires a supporting browser, permission, and a secure context (HTTPS or localhost). If an embedded preview blocks MIDI permission, open the deployed site directly. MIDI input does not send data back to a controller, and MIDI clock/transport and SysEx are not implemented. Leaving Band disconnects the studio MIDI listener; the original Chimera modes retain their own MIDI keyboard control and can be reconnected there.

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
