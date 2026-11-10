import { expect, test } from "bun:test";
import { EXAMPLES } from "../src/studio/examples.ts";
import { newBand } from "../src/studio/model.ts";
import { importFile, readLibrary, saveBand } from "../src/studio/storage.ts";

test("legacy saved bands and JSON imports migrate and round-trip mixer fields", async () => {
  const old={...newBand(),tracks:[{
    id:"legacy",name:"Old part",design:EXAMPLES[0],level:.4,mute:false,steps:Array(16).fill(null),
  }]};
  let stored=JSON.stringify({instruments:[],bands:[old]});
  const original=Object.getOwnPropertyDescriptor(globalThis,"localStorage");
  Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{
    getItem:()=>stored, setItem:(_key:string,value:string)=>{stored=value;},
  }});
  try {
    const fromLibrary=readLibrary().bands[0];
    expect(fromLibrary.tracks[0]).toMatchObject({channel:1,pan:0,expression:1,solo:false,level:.4});
    fromLibrary.tracks[0].channel=6; fromLibrary.tracks[0].pan=-.75; fromLibrary.tracks[0].expression=.3; fromLibrary.tracks[0].solo=true;
    saveBand(fromLibrary);
    expect(readLibrary().bands[0].tracks[0]).toMatchObject({channel:6,pan:-.75,expression:.3,solo:true});
    const file=new File([JSON.stringify({format:"neonsynth-band",version:1,band:old})],"legacy.json",{type:"application/json"});
    const imported=await importFile(file);
    expect(imported.type).toBe("band");
    if(imported.type!=="band")throw new Error("expected band");
    expect(imported.value.id).not.toBe(old.id);
    expect(imported.value.tracks[0]).toMatchObject({channel:1,pan:0,expression:1,solo:false});
    const bad=new File([JSON.stringify({format:"neonsynth-band",band:{...old,tracks:[{...old.tracks[0],channel:0}]}})],"bad.json");
    await expect(importFile(bad)).rejects.toThrow("not a valid");
  } finally {
    if(original)Object.defineProperty(globalThis,"localStorage",original);
    else Reflect.deleteProperty(globalThis,"localStorage");
  }
});
