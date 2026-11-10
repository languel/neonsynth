import { describe, expect, test } from "bun:test";
import { MidiRouter } from "../src/studio/midiRouter.ts";

describe("channel-aware band MIDI", () => {
  test("routes channels independently, honors velocity, legato ownership and sustain", () => {
    const notes: [string,number|null,number][] = [], bends: [string,number][] = [], controls: [string,number,number][] = [];
    const r = new MidiRouter({note:(...x)=>notes.push(x),bend:(...x)=>bends.push(x),control:(...x)=>controls.push(x)});
    r.setRoutes([{id:"whale",channel:1},{id:"bird",channel:2}]); notes.length=0; bends.length=0;
    r.message("keyboard",[0x90,60,100]);
    r.message("keyboard",[0x91,72,80]);
    expect(notes).toEqual([["whale",60,100],["bird",72,80]]);
    r.message("keyboard",[0x90,64,70]);
    r.message("keyboard",[0x80,64,0]);
    expect(notes.at(-1)).toEqual(["whale",60,100]); // last-note fallback
    r.message("second",[0x90,60,110]);
    r.message("keyboard",[0x80,60,0]);
    expect(notes.at(-1)).toEqual(["whale",60,110]); // second keyboard still owns the note
    r.message("second",[0xb0,64,127]);
    r.message("second",[0x90,60,0]); // velocity zero is note off, held by sustain
    expect(notes.at(-1)).toEqual(["whale",60,110]);
    r.message("second",[0xb0,64,0]);
    expect(notes.at(-1)).toEqual(["whale",null,0]);
    r.message("keyboard",[0xe1,127,127]);
    expect(bends.at(-1)).toEqual(["bird",1]);
    r.message("keyboard",[0xb1,7,64]);
    r.message("keyboard",[0xb1,10,0]);
    expect(controls).toEqual([["bird",7,64],["bird",10,0]]);
    r.message("keyboard",[0xb1,123,0]);
    expect(notes.at(-1)).toEqual(["bird",null,0]);
  });
  test("unplug, channel reassignment and panic release notes without affecting other inputs", () => {
    const notes: [string,number|null,number][] = [], bends: [string,number][] = [];
    const r=new MidiRouter({note:(...x)=>notes.push(x),bend:(...x)=>bends.push(x),control:()=>{}});
    r.setRoutes([{id:"a",channel:1},{id:"b",channel:2}]);
    r.message("A",[0x90,60,80]); r.message("B",[0x90,62,100]); r.message("A",[0x91,70,90]);
    r.removeInput("B");
    expect(notes.at(-1)).toEqual(["a",60,80]);
    r.setRoutes([{id:"a",channel:2},{id:"b",channel:2}]);
    expect(notes.slice(-2)).toEqual([["a",70,90],["b",70,90]]); // same channel can intentionally layer
    r.removeInput("A");
    expect(notes.slice(-2)).toEqual([["a",null,0],["b",null,0]]);
    r.message("C",[0x91,66,90]); r.panic();
    expect(notes.slice(-2)).toEqual([["a",null,0],["b",null,0]]);
    expect(bends.at(-1)).toEqual(["b",0]);
  });
  test("ignores system and incomplete data; reset controllers releases the pedal and centers bend", () => {
    const notes: [string,number|null,number][] = [], bends: [string,number][] = [], cc: number[] = [];
    const r=new MidiRouter({note:(...x)=>notes.push(x),bend:(...x)=>bends.push(x),control:(_id,n)=>cc.push(n)});
    r.setRoutes([{id:"x",channel:1}]); notes.length=0; bends.length=0;
    r.message("A",[0xf8]); r.message("A",[0x90,60]);
    expect(notes).toEqual([]);
    r.message("A",[0x90,60,90]); r.message("A",[0xb0,64,127]); r.message("A",[0x80,60,0]);
    r.message("A",[0xe0,0,0]); r.message("A",[0xb0,121,0]);
    expect(notes.at(-1)).toEqual(["x",null,0]); expect(bends.at(-1)).toEqual(["x",0]); expect(cc).toEqual([121]);
  });
  test("all-notes-off respects sustain; all-sound-off and panic are immediate", () => {
    const notes: [string,number|null,number][] = [];
    const r=new MidiRouter({note:(...x)=>notes.push(x),bend:()=>{},control:()=>{}});
    r.setRoutes([{id:"part",channel:1}]);
    r.message("A",[0x90,60,70]); r.message("A",[0x90,64,90]); r.message("A",[0xb0,64,127]);
    r.message("A",[0xb0,123,0]);
    expect(notes.at(-1)).toEqual(["part",64,90]);
    r.message("A",[0xb0,64,0]);
    expect(notes.at(-1)).toEqual(["part",null,0]);
    r.message("A",[0xb0,64,127]); r.message("A",[0x90,67,100]); r.message("A",[0xb0,120,0]);
    expect(notes.at(-1)).toEqual(["part",null,0]);
    r.message("A",[0x90,69,100]); r.message("A",[0x80,69]); // incomplete note-off is ignored
    expect(notes.at(-1)).toEqual(["part",69,100]);
    r.panic(); expect(notes.at(-1)).toEqual(["part",null,0]);
  });
  test("pitch wheel ownership falls back to another connected device", () => {
    const bends: [string,number][] = [];
    const r=new MidiRouter({note:()=>{},bend:(...x)=>bends.push(x),control:()=>{}});
    r.setRoutes([{id:"part",channel:1}]);
    r.message("A",[0xe0,127,127]); r.message("B",[0xe0,0,0]);
    expect(bends.at(-1)).toEqual(["part",-1]);
    r.removeInput("B"); expect(bends.at(-1)).toEqual(["part",1]);
    r.removeInput("A"); expect(bends.at(-1)).toEqual(["part",0]);
  });

});
