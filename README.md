# Neonsynth

Draw an instrument, give its parts energy and behavior, and make a band from voices real and imagined. Neonsynth is a static, browser-based instrument lab; it does not require an account or a server.

**Live site:** <https://languel.github.io/neonsynth/>

## Get started

```sh
npm ci
npm run dev          # http://localhost:5173
npm test             # sound-engine tests
npm run build        # type-check and production build
```

Open the site over HTTPS or on localhost: the Web Audio worklet requires a secure context. Browsers also require a click or key press before audio can start. Headphones are recommended.

## Use the studio

- Start with one of eight editable examples: a humpback, songbird, parasaurolophus, dragon, concert flute, celestial lyre, glass armonica, or singing kettle. Or start with a blank canvas.
- Use **Draw a part** to sketch a closed outline. Its initial chamber size comes from the outline's dimensions; you can resize the outline or change the size independently in the inspector. A part may instead be a visual-only body outline, an energy source, a resonator, a tube, a modulator, or an outlet. Drag parts to position them.
- Use **Add part** for named components. Select one to change its name, role, source, and behavior. Connect parts in the direction energy travels with the **Connect parts** tool: select the sender, then the receiver. At least one source must reach an outlet to play. Connections can branch, and can be removed in the inspector. Feedback loops are rejected.
- Audition with **Hear it**, the on-screen piano, or the A–K keyboard keys (W/E/T/Y/U are the black keys). Changes take effect on the next note.
- **Save instrument** puts a copy in **Library → My instruments**. The current draft is also retained on this device. Use JSON export/import in the library for backups or sharing. Saving an example never changes the bundled original.
- In **Band studio**, add voices, choose an instrument for each, name its part, set its root note, level and mute state, and paint notes across the 16-step loop. Pick a semitone offset before clicking a step; click the same pitch again to erase. Save named bands and load them from **Saved bands**; **New empty band** starts another. Saved arrangements include instrument snapshots, so they can still play if a library instrument is later removed.

Instruments, drafts, and bands are stored in this browser's local storage—not in a cloud account. Clearing browser data removes them; export instrument JSON if you need a backup. Band export/sync is not yet available.

## Sound model and attribution

Neonsynth builds on the source-and-resonator ideas of [Chimera Vocal Synth](https://github.com/jamesondh/chimera-vocal-synth), MIT © 2026 Jameson Hodge. The glottal pulse and the bird-syrinx oscillator/limit-cycle table are adapted from Chimera at commit `d361a82`; the original license is in [LICENSE-CHIMERA.txt](LICENSE-CHIMERA.txt). The other sources and the editable, directed network of damped resonant modes are a deliberately smaller browser implementation, **not** Chimera's full Rust/Wasm branched FDTD airway solver. Shapes seed an expressive size parameter; they are not automatically converted to physically measured anatomical geometry. Sound is synthesized in real time, not played from animal recordings. The illustrated specimen backgrounds are generated artwork; their overlays and sound networks are editable.

## Deployment

GitHub Pages is configured for workflow deployment at `/neonsynth/`. [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) installs dependencies, runs tests, builds, and publishes on every branch push or manual dispatch. The `github-pages` environment must allow the pushed branch. Because any branch can publish, the most recent successful push can replace the live site; restrict the workflow/environment if that is not desired. Local Vite builds use `/`; GitHub Actions builds use the Pages subpath.
