//! A user-built instrument on the same FDTD airway and source models as the Chimera demo.
//!
//! The editor sends a small, validated graph. Each drawn tube becomes an airway tube, each
//! chamber a compliant volume, each source a pressure boundary and a physical valve, and each
//! outlet a radiation load. Graph construction happens outside rendering; `render` allocates no
//! memory and can run on the AudioWorklet thread.
use std::collections::{HashMap, HashSet};
use serde::Deserialize;
use crate::airway::decimator::Decimator;
use crate::airway::network::{AirwayNetwork, Area, NoiseSpec, PortSpec, Tube, TubeSpec};
use crate::math::{exp, sin, tanh, PI};
use crate::physics::{C_SOUND, CM_H2O, WALL_NASAL, WALL_SOFT, WALL_TRACHEA, WallParams};
use crate::sources::glottis::ParametricGlottis;
use crate::sources::syrinx::SyrinxLabia;
use crate::sources::valves::{LipReed, Whistle};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Design {
    pub base_pitch: f64,
    pub attack: f64,
    pub release: f64,
    pub vibrato: f64,
    pub vibrato_rate: f64,
    pub pulse_depth: f64,
    pub pulse_rate: f64,
    pub output_gain: f64,
    pub parts: Vec<Part>,
    pub links: Vec<Link>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Part {
    Tube { id: String, length: f64, area_start: f64, area_end: f64, wall: String },
    Cavity { id: String, volume: f64, wall: String },
    Source { id: String, source: String, pitch: f64, pressure: f64, strength: f64, tension: f64 },
    Outlet { id: String },
}
impl Part {
    fn id(&self) -> &str {
        match self { Part::Tube { id, .. } | Part::Cavity { id, .. } | Part::Source { id, .. } | Part::Outlet { id, .. } => id }
    }
}
#[derive(Clone, Debug, Deserialize)]
pub struct End { pub id: String, pub end: usize }
#[derive(Clone, Debug, Deserialize)]
pub struct Link { pub a: End, pub b: End }

fn finite_between(x: f64, lo: f64, hi: f64) -> bool { x.is_finite() && x >= lo && x <= hi }
fn wall(name: &str) -> Result<Option<WallParams>, String> {
    match name {
        "rigid" => Ok(None), "soft" => Ok(Some(WALL_SOFT)), "cartilage" => Ok(Some(WALL_TRACHEA)), "nasal" => Ok(Some(WALL_NASAL)),
        _ => Err("Unknown wall material".into()),
    }
}

enum Valve { Folds(ParametricGlottis), Syrinx(SyrinxLabia), Reed(LipReed), Whistle(Whistle), Air }
struct Source {
    pressure_node: usize,
    target_node: usize,
    port: usize,
    valve: Valve,
    pitch: f64,
    pressure: f64,
    strength: f64,
    tension: f64,
}

/// One independent voice. A band uses one of these per part, rather than switching a single voice.
pub struct StudioVoice {
    net: AirwayNetwork,
    sources: Vec<Source>,
    fs: f64,
    dec: Decimator,
    pitch_ratio: f64,
    gate_target: f64,
    gate: f64,
    attack: f64,
    release: f64,
    vibrato: f64,
    vibrato_rate: f64,
    pulse_depth: f64,
    pulse_rate: f64,
    output_gain: f64,
    phase: f64,
    pulse_phase: f64,
    control_left: usize,
    dc_x: f64,
    dc_y: f64,
    dc_coef: f64,
    pub rms: f64,
}

impl StudioVoice {
    /// Parse and validate before allocating the network. Lengths and areas are CGS units.
    pub fn from_json(fs: f64, json: &[u8]) -> Result<Self, String> {
        if json.len() > 100_000 { return Err("Instrument is too large".into()); }
        let design: Design = serde_json::from_slice(json).map_err(|e| e.to_string())?;
        Self::new(fs, &design)
    }
    pub fn new(fs: f64, d: &Design) -> Result<Self, String> {
        if !finite_between(fs, 16000.0, 96000.0) || !finite_between(d.base_pitch, 20.0, 8000.0)
            || !finite_between(d.attack, 0.002, 2.0) || !finite_between(d.release, 0.005, 3.0)
            || !finite_between(d.vibrato, 0.0, 200.0) || !finite_between(d.vibrato_rate, 0.1, 15.0)
            || !finite_between(d.pulse_depth, 0.0, 1.0) || !finite_between(d.pulse_rate, 0.1, 30.0) || !finite_between(d.output_gain, 0.02, 10.0)
        { return Err("Invalid instrument settings".into()); }
        if d.parts.is_empty() || d.parts.len() > 32 || d.links.len() > 64 { return Err("An instrument supports up to 32 parts and 64 connections".into()); }
        let internal_fs = fs * 2.0;
        let mut net = AirwayNetwork::new(internal_fs);
        let mut parts = HashMap::new();
        let mut nodes: HashMap<&str, (usize, usize)> = HashMap::new();
        let mut tubes: HashMap<&str, Tube> = HashMap::new();
        for part in &d.parts {
            let id = part.id();
            if id.is_empty() || id.len() > 80 || parts.insert(id, part).is_some() { return Err("Part IDs must be unique".into()); }
            match part {
                Part::Tube { length, area_start, area_end, wall: w, .. } => {
                    if !finite_between(*length, 0.6, 300.0) || !finite_between(*area_start, 0.02, 50.0) || !finite_between(*area_end, 0.02, 50.0) { return Err("Tube dimensions are out of range".into()); }
                    // The CFL condition limits how finely a tube can be subdivided.
                    let dx_min = C_SOUND / internal_fs / 0.93;
                    if *length < dx_min { return Err("Tube is too short for this sample rate".into()); }
                    let n = ((*length / dx_min).floor() as usize).clamp(1, 100);
                    let areas = (0..n).map(|i| area_start + (area_end - area_start) * (i as f64 + 0.5) / n as f64).collect();
                    let t = net.add_tube(TubeSpec::new(id, n, *length, Area::Profile(areas)).wall(wall(w)?).radiating(if w == "soft" { 0.15 } else { 0.0 }));
                    nodes.insert(id, (t.first_node(), t.last_node()));
                    tubes.insert(id, t);
                }
                Part::Cavity { volume, wall: w, .. } => {
                    if !finite_between(*volume, 0.1, 3000.0) { return Err("Chamber volume is out of range".into()); }
                    let n = net.add_cavity(id, *volume, wall(w)?);
                    nodes.insert(id, (n, n));
                }
                Part::Source { source, pitch, pressure, strength, tension, .. } => {
                    if !["folds", "syrinx", "reed", "whistle", "air"].contains(&source.as_str()) || !finite_between(*pitch, 20.0, 8000.0) || !finite_between(*pressure, 0.2, 80.0) || !finite_between(*strength, 0.01, 1.0) || !finite_between(*tension, 0.0, 1.0) { return Err("Source settings are out of range".into()); }
                }
                Part::Outlet { .. } => {}
            }
        }
        let mut sources = Vec::new();
        let mut noise = Vec::new();
        let mut wired = HashSet::new();
        let mut pairs = HashSet::new();
        let mut adjacency: HashMap<&str, Vec<&str>> = HashMap::new();
        let mut outlets = 0;
        for link in &d.links {
            let a = parts.get(link.a.id.as_str()).ok_or("Connection refers to a missing part")?;
            let b = parts.get(link.b.id.as_str()).ok_or("Connection refers to a missing part")?;
            if link.a.id == link.b.id || link.a.end > 1 || link.b.end > 1 { return Err("Invalid connection".into()); }
            let ka = (link.a.id.as_str(), link.a.end);
            let kb = (link.b.id.as_str(), link.b.end);
            let pair = if ka < kb { (ka, kb) } else { (kb, ka) };
            if !pairs.insert(pair) { return Err("Duplicate connection".into()); }
            adjacency.entry(link.a.id.as_str()).or_default().push(link.b.id.as_str());
            adjacency.entry(link.b.id.as_str()).or_default().push(link.a.id.as_str());
            let physical = |part: &Part, e: &End| -> Option<usize> {
                nodes.get(part.id()).map(|&(first, last)| if e.end == 0 { first } else { last })
            };
            let an = physical(a, &link.a);
            let bn = physical(b, &link.b);
            match (an, bn) {
                (Some(x), Some(y)) => { net.connect(x, y); }
                (Some(x), None) | (None, Some(x)) => {
                    let (special, target) = if an.is_some() { (*b, *a) } else { (*a, *b) };
                    if !wired.insert(special.id()) { return Err("Each source and outlet must have exactly one connection".into()); }
                    match special {
                        Part::Outlet { .. } => { net.add_radiation(x); outlets += 1; }
                        Part::Source { source, pitch, pressure, strength, tension, .. } => {
                            let pressure_node = net.add_pressure_node(special.id());
                            let port = net.add_port(pressure_node, x, PortSpec::new(0.03, 0.4).kinetic(0.37, 1.0));
                            let valve = match source.as_str() {
                                "folds" => { let mut g = ParametricGlottis::new(internal_fs); g.threshold = 1.5 * CM_H2O; Valve::Folds(g) }
                                "syrinx" => Valve::Syrinx(SyrinxLabia::new(internal_fs, sources.len() as f64)),
                                "reed" => { let mut v = LipReed::new(internal_fs); v.h0 = 0.003; v.width = 2.0; v.surface_per_mass = 40.0; Valve::Reed(v) }
                                "whistle" => Valve::Whistle(Whistle::new(internal_fs)),
                                "air" => Valve::Air,
                                _ => unreachable!(),
                            };
                            // If the target is a single-node tube or chamber, inject turbulence
                            // into the source port itself: an air-only source must not go silent.
                            let branch = tubes.get(target.id()).filter(|t| t.n > 1).map_or(port, |t| t.branch(0));
                            let gain = if source == "air" { 3e-5 } else { 1e-6 };
                            noise.push(NoiseSpec::new(port, branch, branch, gain).band(6000.0, 300.0));
                            sources.push(Source { pressure_node, target_node: x, port, valve, pitch: *pitch, pressure: *pressure, strength: *strength, tension: *tension });
                        }
                        _ => return Err("Invalid connection".into()),
                    }
                }
                (None, None) => return Err("Connect sources and outlets to tubes or chambers".into()),
            }
        }
        if sources.is_empty() || outlets == 0 { return Err("Connect at least one source and one outlet".into()); }
        if d.parts.iter().any(|p| matches!(p, Part::Source { .. } | Part::Outlet { .. }) && !wired.contains(p.id())) { return Err("A source or outlet is not connected".into()); }
        // Every part must be reachable from a source: isolated drawings should not silently sound.
        let first = d.parts.iter().find(|p| matches!(p, Part::Source { .. })).unwrap().id();
        let mut visited = HashSet::new();
        let mut stack = vec![first];
        while let Some(id) = stack.pop() {
            if visited.insert(id) { if let Some(next) = adjacency.get(id) { stack.extend(next.iter().copied()); } }
        }
        if visited.len() != d.parts.len() { return Err("All parts must be connected to the instrument".into()); }
        net.finalize();
        net.set_noise_sources(&noise);
        net.snap_to_targets();
        Ok(Self {
            net, sources, fs: internal_fs, dec: Decimator::new(2), pitch_ratio: 1.0, gate_target: 0.0, gate: 0.0,
            attack: d.attack, release: d.release, vibrato: d.vibrato, vibrato_rate: d.vibrato_rate, pulse_depth: d.pulse_depth, pulse_rate: d.pulse_rate, output_gain: d.output_gain, phase: 0.0, pulse_phase: 0.0,
            control_left: 0, dc_x: 0.0, dc_y: 0.0, dc_coef: exp(-2.0 * PI * 20.0 / fs), rms: 0.0,
        })
    }
    /// Pitch ratio is relative to the instrument's base note. All of its sources follow it.
    pub fn set(&mut self, ratio: f64, gate: f64) {
        if ratio.is_finite() { self.pitch_ratio = ratio.clamp(0.0625, 16.0); }
        if gate.is_finite() { self.gate_target = gate.clamp(0.0, 1.0); }
    }
    fn control(&mut self) {
        const BLOCK: usize = 32;
        let dt = BLOCK as f64 / self.fs;
        let tau = if self.gate_target > self.gate { self.attack } else { self.release };
        self.gate += (self.gate_target - self.gate) * (1.0 - exp(-dt / tau));
        self.phase = (self.phase + 2.0 * PI * self.vibrato_rate * dt) % (2.0 * PI);
        let vib = 2.0_f64.powf(self.vibrato * sin(self.phase) / 1200.0);
        self.pulse_phase = (self.pulse_phase + 2.0 * PI * self.pulse_rate * dt) % (2.0 * PI);
        let pulse = 1.0 - self.pulse_depth + self.pulse_depth * (0.5 + 0.5 * sin(self.pulse_phase));
        for s in &mut self.sources {
            self.net.set_fixed_pressure(s.pressure_node, s.pressure * CM_H2O * self.gate * pulse);
            let pitch = (s.pitch * self.pitch_ratio * vib).clamp(20.0, 8000.0);
            match &mut s.valve {
                Valve::Folds(g) => {
                    g.params.f0 = pitch;
                    g.params.amplitude = 0.05 + 0.55 * s.strength;
                    g.params.effort = 0.35 + 0.65 * s.tension;
                    g.params.open_quotient = 0.7 - 0.3 * s.tension;
                    g.params.closure_sharpness = s.tension;
                }
                Valve::Syrinx(v) => { v.f0 = pitch; v.drive = s.strength; v.tension = s.tension; v.gate = self.gate; }
                Valve::Reed(v) => { v.f = pitch; v.zeta = 0.04 + 0.22 * (1.0 - s.tension); v.width = 0.2 + 2.5 * s.strength; }
                Valve::Whistle(v) => v.f = pitch,
                Valve::Air => {}
            }
        }
        self.net.begin_block(BLOCK);
        self.control_left = BLOCK;
    }
    /// Render without heap allocation; radiation is the actual airway network output.
    pub fn render(&mut self, out: &mut [f32]) {
        let mut sum = 0.0;
        for sample in out.iter_mut() {
            for _ in 0..2 {
                if self.control_left == 0 { self.control(); }
                self.control_left -= 1;
                for s in &mut self.sources {
                    let dp = self.net.p[s.pressure_node] - self.net.p[s.target_node];
                    let area = match &mut s.valve {
                        Valve::Folds(g) => g.next(dp),
                        Valve::Syrinx(v) => (0.01 + 0.09 * s.strength) * v.next(),
                        Valve::Reed(v) => v.next(dp),
                        Valve::Whistle(v) => (0.02 + 0.12 * s.strength) * (1.0 + v.next(self.gate, self.net.p[s.target_node], 1.0).clamp(-0.95, 0.95)),
                        Valve::Air => 0.02 + 0.2 * s.strength,
                    };
                    self.net.set_port_area(s.port, area);
                }
                let y = self.net.step();
                if self.dec.push(y) {
                    // Same radiated-flow → audio and DC rejection as the creature voices.
                    let v = self.dec.value * 6.4e-8 * self.output_gain;
                    let hp = v - self.dc_x + self.dc_coef * self.dc_y;
                    self.dc_x = v;
                    self.dc_y = hp;
                    let v = if hp.is_finite() { tanh(hp * 2.0) * 0.5 } else { 0.0 };
                    *sample = v as f32;
                    sum += v * v;
                }
            }
        }
        self.rms = (sum / out.len().max(1) as f64).sqrt();
    }
}
