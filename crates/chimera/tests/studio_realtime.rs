//! A warmed custom physical graph must not allocate while the audio thread renders or controls it.
use chimera::studio::StudioVoice;
use std::alloc::{GlobalAlloc, Layout, System};
use std::cell::Cell;
struct Counting;
thread_local! { static ALLOCS: Cell<usize> = const { Cell::new(0) }; }
unsafe impl GlobalAlloc for Counting {
    unsafe fn alloc(&self, l: Layout) -> *mut u8 { let _=ALLOCS.try_with(|c| c.set(c.get()+1)); unsafe { System.alloc(l) } }
    unsafe fn dealloc(&self, p: *mut u8, l: Layout) { unsafe { System.dealloc(p,l) } }
    unsafe fn realloc(&self, p: *mut u8, l: Layout, n: usize) -> *mut u8 { let _=ALLOCS.try_with(|c| c.set(c.get()+1)); unsafe { System.realloc(p,l,n) } }
}
#[global_allocator] static A: Counting = Counting;
fn allocs() -> usize { ALLOCS.with(|c| c.get()) }
#[test]
fn custom_physical_voices_do_not_allocate_on_the_audio_path() {
    for source in ["folds", "syrinx", "reed", "whistle", "air"] {
        let json = format!(r#"{{"basePitch":220,"attack":0.01,"release":0.05,"vibrato":20,"vibratoRate":5,"pulseDepth":0.3,"pulseRate":3,"outputGain":1,
        "parts":[{{"kind":"source","id":"s","source":"{source}","pitch":220,"pressure":12,"strength":0.5,"tension":0.5}},
        {{"kind":"tube","id":"t","length":24,"areaStart":1,"areaEnd":2,"wall":"soft"}},{{"kind":"outlet","id":"o"}}],
        "links":[{{"a":{{"id":"s","end":0}},"b":{{"id":"t","end":0}}}},{{"a":{{"id":"t","end":1}},"b":{{"id":"o","end":0}}}}]}}"#);
        let mut voice=StudioVoice::from_json(48000.0,json.as_bytes()).unwrap();
        let mut buf=[0.0f32; 128];
        voice.set(1.0,1.0); voice.render(&mut buf);
        let probe=allocs(); drop(std::hint::black_box(vec![1u8; 16])); assert!(allocs()>probe);
        let before=allocs();
        for i in 0..50 { voice.set(0.5+i as f64/40.0, if i<30 {1.0} else {0.0}); voice.render(&mut buf); }
        assert_eq!(allocs()-before,0,"{source} allocated while rendering");
    }
}
