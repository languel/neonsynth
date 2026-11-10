use chimera::studio::StudioVoice;

fn design(source: &str, area: f64) -> String {
    format!(r#"{{"basePitch":220,"attack":0.01,"release":0.05,"vibrato":0,"vibratoRate":5,"pulseDepth":0,"pulseRate":4,"outputGain":1,
      "parts":[{{"kind":"source","id":"s","source":"{source}","pitch":220,"pressure":12,"strength":0.5,"tension":0.5}},
        {{"kind":"tube","id":"t","length":24,"areaStart":{area},"areaEnd":2,"wall":"soft"}},
        {{"kind":"outlet","id":"o"}}],
      "links":[{{"a":{{"id":"s","end":0}},"b":{{"id":"t","end":0}}}},{{"a":{{"id":"t","end":1}},"b":{{"id":"o","end":0}}}}]}}"#)
}

#[test]
fn drawn_tubes_drive_the_actual_airway_and_change_the_sound() {
    let render = |a| {
        let mut voice = StudioVoice::from_json(48000.0, design("folds", a).as_bytes()).unwrap();
        voice.set(1.0, 1.0);
        let mut out = vec![0.0; 12000];
        voice.render(&mut out);
        assert!(out.iter().all(|x| x.is_finite()));
        assert!(out.iter().any(|x| x.abs() > 1e-5), "the source and airway must radiate sound");
        out
    };
    let a = render(1.0);
    let b = render(5.0);
    assert!(a.iter().zip(b.iter()).any(|(x,y)| (x-y).abs() > 1e-4), "drawn geometry must affect the audio");
}

#[test]
fn every_physical_source_renders_finite_audio() {
    for name in ["folds", "syrinx", "reed", "whistle", "air"] {
        let mut voice = StudioVoice::from_json(48000.0, design(name, 1.0).as_bytes()).unwrap();
        voice.set(1.0, 1.0);
        let mut out = vec![0.0; 12000];
        voice.render(&mut out);
        assert!(out.iter().all(|x| x.is_finite()), "{name}");
    }
}

#[test]
fn invalid_or_disconnected_graphs_are_rejected() {
    assert!(StudioVoice::from_json(48000.0, b"{}").is_err());
    assert!(StudioVoice::from_json(48000.0, design("folds", 0.0).as_bytes()).is_err());
    let no_outlet = design("folds", 1.0).replace(r#",{"a":{"id":"t","end":1},"b":{"id":"o","end":0}}"#, "");
    assert!(StudioVoice::from_json(48000.0, no_outlet.as_bytes()).is_err());
}

#[test]
fn air_source_radiates_even_into_a_single_node_chamber() {
    let json = r#"{"basePitch":220,"attack":0.01,"release":0.05,"vibrato":0,"vibratoRate":5,"pulseDepth":0,"pulseRate":4,"outputGain":1,
      "parts":[{"kind":"source","id":"s","source":"air","pitch":220,"pressure":30,"strength":0.5,"tension":0.5},
        {"kind":"cavity","id":"c","volume":1,"wall":"rigid"},{"kind":"outlet","id":"o"}],
      "links":[{"a":{"id":"s","end":0},"b":{"id":"c","end":0}},{"a":{"id":"c","end":0},"b":{"id":"o","end":0}}]}"#;
    let mut voice = StudioVoice::from_json(48000.0, json.as_bytes()).unwrap();
    voice.set(1.0, 1.0);
    let mut out = vec![0.0; 24000];
    voice.render(&mut out);
    let rms = (out[12000..].iter().map(|x| x*x).sum::<f32>() / 12000.0).sqrt();
    assert!(rms > 1e-6, "steady turbulent air must be audible: {rms}");
}

#[test]
fn short_parts_are_stable_at_supported_device_rates() {
    let small = design("folds", 1.0).replace("\"length\":24", "\"length\":0.6");
    for fs in [16000.0, 44100.0, 48000.0, 96000.0] {
        let mut voice = StudioVoice::from_json(fs, small.as_bytes()).unwrap();
        voice.set(1.0, 1.0);
        let mut out = vec![0.0; 4096];
        voice.render(&mut out);
        assert!(out.iter().all(|x| x.is_finite()), "{fs} Hz");
    }
}

#[test]
fn physical_parameters_and_behaviors_change_the_rendered_signal() {
    fn render(json: &str) -> Vec<f32> {
        let mut voice = StudioVoice::from_json(48000.0, json.as_bytes()).unwrap();
        voice.set(1.0, 1.0);
        let mut out = vec![0.0; 12000]; voice.render(&mut out); out
    }
    let base = design("folds", 1.0);
    let a = render(&base);
    for (label, changed) in [
        ("pressure", base.replace("\"pressure\":12", "\"pressure\":24")),
        ("strength", base.replace("\"strength\":0.5", "\"strength\":0.9")),
        ("tension", base.replace("\"tension\":0.5", "\"tension\":0.1")),
        ("pitch", base.replace("\"pitch\":220", "\"pitch\":330")),
        ("tube length", base.replace("\"length\":24", "\"length\":40")),
        ("pulse", base.replace("\"pulseDepth\":0", "\"pulseDepth\":0.8")),
        ("vibrato", base.replace("\"vibrato\":0", "\"vibrato\":90")),
    ] {
        let b = render(&changed);
        let diff = a.iter().zip(&b).map(|(x,y)| (x-y).abs() as f64).sum::<f64>() / a.len() as f64;
        assert!(diff > 1e-5, "{label} must affect the physical sound (difference {diff})");
    }
}
