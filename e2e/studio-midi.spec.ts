import { expect, test, type Page } from "@playwright/test";

type Mode = "normal" | "pending" | "denied" | "unsupported";
/** A Web MIDI implementation under browser control: the audio and worklets remain real. */
async function mockMidi(page: Page, mode: Mode = "normal") {
  await page.addInitScript(({mode}) => {
    const state: any = { calls: [], requests: [], ports: {} };
    class Input extends EventTarget {
      id: string; name: string; state="connected"; connection="closed";
      onmidimessage: ((e: Event) => void) | null=null;
      listeners=0; opened=0; closed=0;
      constructor(id: string, name: string) { super(); this.id=id; this.name=name; }
      addEventListener(type: string, cb: any, opts?: any) { super.addEventListener(type,cb,opts); if(type==="midimessage")this.listeners++; }
      removeEventListener(type: string, cb: any, opts?: any) { super.removeEventListener(type,cb,opts); if(type==="midimessage")this.listeners--; }
      async open() { this.opened++; this.connection="open"; return this; }
      async close() { this.closed++; this.connection="closed"; return this; }
      send(data: number[]) {
        const event=new Event("midimessage");
        Object.defineProperty(event,"data",{value:new Uint8Array(data)});
        this.dispatchEvent(event); this.onmidimessage?.(event);
      }
    }
    const access: any=new EventTarget();
    access.inputs=new Map(); access.outputs=new Map(); access.onstatechange=null;
    const change=()=>{const e=new Event("statechange");access.dispatchEvent(e);access.onstatechange?.(e);};
    state.plug=(id: string,name: string)=>{const input=new Input(id,name);state.ports[id]=input;access.inputs.set(id,input);change();};
    state.unplug=(id: string)=>{const input=state.ports[id]; if(!input)return; input.state="disconnected"; access.inputs.delete(id); change();};
    state.send=(id: string,data: number[])=>state.ports[id]?.send(data);
    state.plug("A","Keyboard A"); state.plug("B","Controller B");
    state.resolve=(index: number)=>state.requests[index].resolve(access);
    Object.defineProperty(navigator,"requestMIDIAccess",{configurable:true,value:mode==="unsupported" ? undefined : (options: any)=>{
      state.calls.push(options);
      if(mode==="denied")return Promise.reject(new DOMException("Permission denied","NotAllowedError"));
      if(mode==="pending")return new Promise((resolve,reject)=>state.requests.push({resolve,reject}));
      return Promise.resolve(access);
    }});
    (window as any).__fakeMidi=state;
  },{mode});
}
async function send(page: Page, id: string, data: number[]) {
  await page.evaluate(({id,data})=>(window as any).__fakeMidi.send(id,data),{id,data});
}

// These tests exercise the browser UI, mocked devices, actual WebAudio worklet and Wasm solver.
test("MIDI channels, external CC mixer, sustain, hot plug and transport work together", async ({page}) => {
  const errors: string[]=[]; page.on("pageerror",e=>errors.push(e.message));
  let delayed=false;
  await page.route("**/*studioProcessor*",async route=>{delayed=true;await new Promise(r=>setTimeout(r,1000));await route.continue();});
  await mockMidi(page);
  await page.goto("./");
  await page.getByRole("radio",{name:"Band",exact:true}).click();
  const whale=page.getByRole("region",{name:"Mixer Whale / bass"});
  const bird=page.getByRole("region",{name:"Mixer Songbird / lead"});
  await expect(page.getByLabel("MIDI channel for Whale / bass")).toHaveValue("1");
  await expect(page.getByLabel("MIDI channel for Songbird / lead")).toHaveValue("2");
  await page.getByRole("button",{name:"Connect MIDI"}).click();
  await expect(page.locator(".midi-toolbar [role=status]")).toContainText("2 INPUTS / LIVE");
  expect(await page.evaluate(()=>(window as any).__fakeMidi.calls)).toEqual([{sysex:false}]);
  // Data can arrive while the AudioWorklet is still loading: controls and held notes survive it.
  await send(page,"A",[0xb0,7,32]);
  await send(page,"A",[0x90,60,110]);
  await send(page,"B",[0x91,72,90]);
  await expect(whale).toContainText("25%");
  await expect.poll(()=>delayed,{timeout:10_000}).toBe(true);
  await expect.poll(()=>page.evaluate(()=>(window as any).__studioAudio.status.mode),{timeout:15_000}).toBe("band");
  await expect(whale).toContainText("C4",{timeout:15_000});
  await expect(bird).toContainText("C5",{timeout:15_000});
  await expect.poll(()=>page.evaluate(()=>(window as any).__studioAudio.status.rms),{timeout:15_000}).toBeGreaterThan(.000001);
  expect(await page.evaluate(()=>(window as any).__studioAudio.status.playing)).toBe(false);
  await expect.poll(()=>page.evaluate(()=>(window as any).__chimeraEngine?.latest?.t?.outRms ?? 1),{timeout:10_000}).toBeLessThan(.001);

  await send(page,"B",[0xb1,10,127]); await send(page,"B",[0xb1,11,64]);
  await expect(bird).toContainText("R100"); await expect(bird).toContainText("50%");
  await send(page,"A",[0xb0,80,127]); await expect(page.getByRole("button",{name:"Mute Whale / bass"})).toHaveAttribute("aria-pressed","true");
  await send(page,"A",[0xb0,80,0]); await expect(page.getByRole("button",{name:"Mute Whale / bass"})).toHaveAttribute("aria-pressed","false");
  await send(page,"B",[0xb1,81,127]); await expect(page.getByRole("button",{name:"Solo Songbird / lead"})).toHaveAttribute("aria-pressed","true");
  await expect(page.getByRole("meter",{name:"Output for Whale / bass"})).toHaveAttribute("aria-valuenow","0");
  await send(page,"B",[0xb1,81,0]);

  await page.getByRole("button",{name:"Play band"}).click();
  await expect(page.getByRole("button",{name:"Stop band"})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>(window as any).__studioAudio.status.step),{timeout:10_000}).toBeGreaterThanOrEqual(0);
  await page.getByRole("button",{name:"Stop band"}).click();
  expect(await page.evaluate(()=>(window as any).__studioAudio.status.mode)).toBe("band"); // live notes remain enabled
  await expect(whale).toContainText("C4");

  await page.getByLabel("MIDI channel for Whale / bass").selectOption("2");
  await expect(whale).toContainText("C5"); // intentionally layered with the bird
  await page.getByLabel("MIDI channel for Whale / bass").selectOption("1");
  await expect(whale).toContainText("C4"); // restores the note still held on channel one
  await send(page,"B",[0xb1,64,127]); await send(page,"B",[0x81,72,0]);
  await expect(bird).toContainText("C5");
  await send(page,"B",[0xb1,64,0]);
  await expect(bird.locator(".mixer-strip-head span")).toHaveText("—");

  await page.getByLabel("MIDI input").selectOption("device:B");
  await expect(whale.locator(".mixer-strip-head span")).toHaveText("—");
  await send(page,"A",[0x90,64,90]); await send(page,"B",[0x90,65,100]);
  await expect(whale.locator(".mixer-strip-head span")).toHaveText("F4");
  await page.evaluate(()=>(window as any).__fakeMidi.unplug("B"));
  await expect(page.getByLabel("MIDI input")).toHaveValue("");
  await expect(whale.locator(".mixer-strip-head span")).toHaveText("—");
  await send(page,"A",[0x90,67,100]); await expect(whale.locator(".mixer-strip-head span")).toHaveText("G4");
  await page.getByRole("button",{name:"All MIDI notes off"}).click();
  await expect(whale.locator(".mixer-strip-head span")).toHaveText("—");
  await page.evaluate(()=>(window as any).__fakeMidi.plug("all","New keyboard"));
  await expect(page.getByLabel("MIDI input").locator("option")).toHaveCount(3);
  await page.getByLabel("MIDI input").selectOption("device:all");
  await send(page,"all",[0x91,74,100]); await expect(bird.locator(".mixer-strip-head span")).toHaveText("D5");

  await page.getByLabel("Band name").fill("MIDI ensemble");
  await page.getByRole("button",{name:"Save band"}).click();
  await page.reload(); await page.getByRole("radio",{name:"Band",exact:true}).click();
  await page.getByLabel("Saved bands").selectOption({label:"MIDI ensemble"});
  await expect(page.getByLabel("MIDI channel for Whale / bass")).toHaveValue("1");
  await expect(page.getByRole("region",{name:"Mixer Whale / bass"})).toContainText("25%");
  await expect(page.getByRole("region",{name:"Mixer Songbird / lead"})).toContainText("R100");
  expect(errors).toEqual([]);
});

test("original Chimera MIDI is released before studio routing and can be reconnected afterwards", async ({page}) => {
  const errors: string[]=[]; page.on("pageerror",e=>errors.push(e.message));
  await mockMidi(page); await page.goto("./");
  await page.getByRole("radio",{name:"Play",exact:true}).click();
  await page.getByRole("button",{name:/MIDI keyboard/}).click();
  await expect(page.getByRole("button",{name:/MIDI keyboard/})).toHaveAttribute("aria-pressed","true");
  await send(page,"A",[0x90,60,100]);
  await expect(page.getByLabel("Note 60")).toHaveClass(/down/);
  await page.getByRole("radio",{name:"Band",exact:true}).click();
  expect(await page.evaluate(()=>(window as any).__fakeMidi.ports.A.onmidimessage)).toBeNull();
  await page.getByRole("button",{name:"Connect MIDI"}).click();
  await expect(page.locator(".midi-toolbar [role=status]")).toContainText("LIVE");
  await send(page,"A",[0x90,60,100]);
  await expect(page.getByRole("region",{name:"Mixer Whale / bass"}).locator(".mixer-strip-head span")).toHaveText("C4",{timeout:15_000});
  await expect.poll(()=>page.evaluate(()=>(window as any).__chimeraEngine?.latest?.t?.outRms ?? 1),{timeout:10_000}).toBeLessThan(.001);
  await page.getByRole("radio",{name:"Play",exact:true}).click();
  expect(await page.evaluate(()=>(window as any).__fakeMidi.ports.A.listeners)).toBe(0);
  await expect(page.getByRole("button",{name:/MIDI keyboard/})).toHaveAttribute("aria-pressed","false");
  await page.getByRole("button",{name:/MIDI keyboard/}).click();
  await send(page,"A",[0x90,62,100]);
  await expect(page.getByLabel("Note 62")).toHaveClass(/down/);
  expect(errors).toEqual([]);
});

test("cancelled or stale permission requests cannot reconnect the band", async ({page}) => {
  const errors: string[]=[]; page.on("pageerror",e=>errors.push(e.message));
  await mockMidi(page,"pending"); await page.goto("./");
  await page.getByRole("radio",{name:"Band",exact:true}).click();
  await page.getByRole("button",{name:"Connect MIDI"}).click();
  await expect(page.getByRole("button",{name:"Cancel MIDI request"})).toBeVisible();
  await page.getByRole("button",{name:"Cancel MIDI request"}).click();
  await page.getByRole("button",{name:"Connect MIDI"}).click();
  await page.evaluate(()=>(window as any).__fakeMidi.resolve(1)); // newer request wins
  await expect(page.locator(".midi-toolbar [role=status]")).toContainText("LIVE");
  await page.evaluate(()=>(window as any).__fakeMidi.resolve(0));
  await expect(page.getByRole("button",{name:"Disconnect MIDI"})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).__fakeMidi.ports.A.listeners)).toBe(1);
  await page.getByRole("button",{name:"Disconnect MIDI"}).click();
  expect(await page.evaluate(()=>(window as any).__fakeMidi.ports.A.listeners)).toBe(0);
  expect(await page.evaluate(()=>(window as any).__fakeMidi.ports.A.closed)).toBeGreaterThan(0);
  await page.getByRole("button",{name:"Connect MIDI"}).click();
  await page.getByRole("radio",{name:"Build",exact:true}).click();
  await page.evaluate(()=>(window as any).__fakeMidi.resolve(2));
  await page.getByRole("radio",{name:"Band",exact:true}).click();
  await expect(page.getByRole("button",{name:"Connect MIDI"})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).__fakeMidi.ports.A.listeners)).toBe(0);
  expect(errors).toEqual([]);
});

for (const mode of ["denied","unsupported"] as const) test(`MIDI ${mode} is explained without breaking the band`, async ({page}) => {
  const errors: string[]=[]; page.on("pageerror",e=>errors.push(e.message));
  await mockMidi(page,mode); await page.goto("./");
  await page.getByRole("radio",{name:"Band",exact:true}).click();
  await page.getByRole("button",{name:"Connect MIDI"}).click();
  await expect(page.locator(".mixer-body .studio-warning")).toContainText(mode==="denied" ? "Permission denied" : "not available");
  await page.getByRole("button",{name:"Play band"}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__studioAudio.status.rms),{timeout:15_000}).toBeGreaterThan(.000001);
  expect(errors).toEqual([]);
});

test("new parts choose unused channels and shared assignments survive save and reload", async ({page}) => {
  await page.goto("./"); await page.getByRole("radio",{name:"Band",exact:true}).click();
  await page.getByLabel("Instrument for a new part").selectOption({label:"Dinosaur bellow"});
  await page.getByRole("button",{name:"Add voice",exact:true}).click();
  await expect(page.getByLabel("MIDI channel for Dinosaur bellow")).toHaveValue("3");
  await page.getByLabel("MIDI channel for Whale / bass").selectOption("5");
  await page.getByLabel("Instrument for a new part").selectOption({label:"Dragon breath"});
  await page.getByRole("button",{name:"Add voice",exact:true}).click();
  await expect(page.getByLabel("MIDI channel for Dragon breath")).toHaveValue("1"); // first available
  await page.getByLabel("MIDI channel for Dragon breath").selectOption("3"); // intentionally shared
  await page.getByRole("button",{name:"Solo Dragon breath"}).click();
  await page.getByLabel("Band name").fill("Layered channels");
  await page.getByRole("button",{name:"Save band"}).click();
  await page.reload(); await page.getByRole("radio",{name:"Band",exact:true}).click();
  await page.getByLabel("Saved bands").selectOption({label:"Layered channels"});
  await expect(page.getByLabel("MIDI channel for Whale / bass")).toHaveValue("5");
  await expect(page.getByLabel("MIDI channel for Dinosaur bellow")).toHaveValue("3");
  await expect(page.getByLabel("MIDI channel for Dragon breath")).toHaveValue("3");
  await expect(page.getByRole("button",{name:"Solo Dragon breath"})).toHaveAttribute("aria-pressed","true");
});

test("an original MIDI permission request is cancelled when entering the studio", async ({page}) => {
  await mockMidi(page,"pending"); await page.goto("./");
  await page.getByRole("radio",{name:"Play",exact:true}).click();
  await page.getByRole("button",{name:/MIDI keyboard/}).click();
  await expect(page.getByRole("button",{name:/MIDI keyboard/})).toContainText("Connecting");
  await page.getByRole("radio",{name:"Band",exact:true}).click();
  await page.evaluate(()=>(window as any).__fakeMidi.resolve(0));
  await page.getByRole("button",{name:"Connect MIDI"}).click();
  await page.evaluate(()=>(window as any).__fakeMidi.resolve(1));
  await expect(page.locator(".midi-toolbar [role=status]")).toContainText("LIVE");
  expect(await page.evaluate(()=>(window as any).__fakeMidi.ports.A.onmidimessage)).toBeNull();
  await send(page,"A",[0x90,60,100]);
  await expect(page.getByRole("region",{name:"Mixer Whale / bass"}).locator(".mixer-strip-head span")).toHaveText("C4",{timeout:15_000});
});
