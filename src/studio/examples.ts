import { copy, type Design, type Part, type SourceKind, type Wall } from "./model.ts";

type Tube = [string, [number, number][], number, number, number, Wall];
type Src = [string, number, number, SourceKind, number, number, number, number];
function buildExample(id: string, name: string, description: string, basePitch: number, tubes: Tube[], sources: Src[], chambers: [string, number, number, number, Wall][], outlet: [number, number], edges: [string, number, string, number][], behavior: Partial<Pick<Design, "attack" | "release" | "vibrato" | "vibratoRate" | "pulseDepth" | "pulseRate" | "outputGain">> = {}): Design {
  const parts: Part[] = [
    ...tubes.map(([n, pts, length, areaStart, areaEnd, wall]) => ({ id: n, name: n, kind: "tube" as const, points: pts.map(([x,y]) => ({x,y})), length, areaStart, areaEnd, wall })),
    ...sources.map(([n,x,y,source,pitch,pressure,strength,tension]) => ({ id: n, name: n, kind: "source" as const, x,y,source,pitch,pressure,strength,tension })),
    ...chambers.map(([n,x,y,volume,wall]) => ({ id: n, name: n, kind: "cavity" as const, x,y,volume,wall })),
    { id: "out", name: "Radiating outlet", kind: "outlet", x: outlet[0], y: outlet[1] },
  ];
  return { version: 1, id: `example-${id}`, name, description, basePitch, attack: .02, release: .12, vibrato: 0, vibratoRate: 5, pulseDepth: 0, pulseRate: 4, outputGain: 1, ...behavior, parts, links: edges.map(([a,ae,b,be]) => ({ a: {id:a,end:ae as 0|1}, b: {id:b,end:be as 0|1} })) };
}
export const EXAMPLES: Design[] = [
  buildExample("whale", "Whale song", "A large, soft airway and a resonating air sac give a low, slow call. An imagined anatomy, not a biological reconstruction.", 90,
    [["Long throat",[[220,320],[320,280],[440,290],[560,250]],100,12,8,"soft"],["Mouth",[[560,250],[680,260],[780,300]],46,8,12,"soft"]],
    [["Vocal folds",130,320,"folds",90,18,.75,.55]], [["Air sac",560,400,550,"soft"]], [865,300],
    [["Vocal folds",0,"Long throat",0],["Long throat",1,"Mouth",0],["Air sac",0,"Long throat",1],["Mouth",1,"out",0]], {attack:.07,release:.25,vibrato:20,vibratoRate:3,pulseDepth:.2,pulseRate:2,outputGain:3}),
  buildExample("bird", "Two-voiced songbird", "Two independently pitched syringeal labia share a small beak and throat chamber.", 2200,
    [["Left bronchus",[[250,235],[385,270]],5,.08,.1,"cartilage"],["Right bronchus",[[250,415],[385,350]],5,.08,.1,"cartilage"],["Trachea & beak",[[410,310],[570,300],[715,265],[790,290]],8,.12,.3,"cartilage"]],
    [["Left syrinx",145,225,"syrinx",2200,65,.45,.45],["Right syrinx",145,420,"syrinx",2772,65,.38,.65]], [["Throat chamber",580,410,2,"soft"]], [860,290],
    [["Left syrinx",0,"Left bronchus",0],["Right syrinx",0,"Right bronchus",0],["Left bronchus",1,"Trachea & beak",0],["Right bronchus",1,"Trachea & beak",0],["Throat chamber",0,"Trachea & beak",1],["Trachea & beak",1,"out",0]], {attack:.006,release:.04,vibrato:12,vibratoRate:6,outputGain:.08}),
  buildExample("dinosaur", "Dinosaur bellow", "A speculative deep call through a long, branching crest and a chest cavity.", 65,
    [["Windpipe",[[230,400],[350,400],[440,335]],80,10,8,"cartilage"],["Crest",[[440,335],[470,190],[625,150],[730,240]],120,7,4,"soft"],["Mouth",[[730,240],[800,275]],45,4,10,"soft"]],
    [["Deep folds",130,400,"folds",65,24,.9,.65]], [["Crest chamber",570,390,800,"soft"]], [865,275],
    [["Deep folds",0,"Windpipe",0],["Windpipe",1,"Crest",0],["Crest",1,"Mouth",0],["Crest chamber",0,"Windpipe",1],["Mouth",1,"out",0]], {attack:.09,release:.3,outputGain:5}),
  buildExample("dragon", "Dragon breath", "Folds and a whistling jet excite the same curved resonator: a deliberately imaginary creature.", 125,
    [["Throat",[[240,320],[340,320],[440,230],[570,225]],65,6,4,"soft"],["Muzzle",[[570,225],[670,280],[785,300]],35,4,8,"cartilage"]],
    [["Growl",145,320,"folds",125,18,.8,.8],["Fire jet",335,445,"whistle",750,28,.5,.6]], [["Chest",550,415,260,"soft"]], [865,300],
    [["Growl",0,"Throat",0],["Fire jet",0,"Throat",0],["Throat",1,"Muzzle",0],["Chest",0,"Throat",1],["Muzzle",1,"out",0]], {vibrato:15,vibratoRate:4,outputGain:.35}),
  buildExample("trumpet", "Brass horn", "A pressure-driven lip reed and a flaring rigid bore, inspired by a brass instrument.", 220,
    [["Brass bore",[[220,320],[330,320],[330,200],[470,200],[470,405],[620,405],[620,300],[790,300]],135,1.5,8,"rigid"]],
    [["Lip reed",125,320,"reed",220,35,.65,.85]], [], [870,300], [["Lip reed",0,"Brass bore",0],["Brass bore",1,"out",0]], {attack:.025,release:.1,outputGain:.08}),
  buildExample("flute", "Air-jet flute", "A coupled jet oscillator feeds a narrow rigid tube; pitch and tube length both matter.", 440,
    [["Flute bore",[[240,310],[390,310],[540,310],[690,310],[790,310]],42,1.2,1.3,"rigid"]],
    [["Air jet",145,310,"whistle",440,18,.6,.5]], [], [865,310], [["Air jet",0,"Flute bore",0],["Flute bore",1,"out",0]], {attack:.035,release:.08,vibrato:18,vibratoRate:5,outputGain:.6}),
  buildExample("glass", "Glass chamber organ", "A narrow jet sings into a rigid, bell-like chamber and an open pipe.", 523.25,
    [["Neck",[[240,325],[405,325]],13,.7,1,"rigid"],["Pipe",[[405,325],[610,300],[790,300]],32,1,3,"rigid"]],
    [["Glass jet",145,325,"whistle",523.25,16,.5,.65]], [["Glass chamber",475,440,70,"rigid"]], [865,300],
    [["Glass jet",0,"Neck",0],["Neck",1,"Pipe",0],["Glass chamber",0,"Neck",1],["Pipe",1,"out",0]], {attack:.08,release:.35,vibrato:10,vibratoRate:4,outputGain:.8}),
  buildExample("nightglass", "Nightglass creature", "An invented duet of folds and syrinx through a forked horn and a flexible sac.", 175,
    [["Main horn",[[250,330],[390,285],[540,290],[720,315]],55,3,6,"soft"],["Side horn",[[480,430],[555,395],[720,315]],38,2,3,"cartilage"]],
    [["Folds",150,330,"folds",175,16,.7,.55],["Syrinx",390,460,"syrinx",350,45,.45,.5]], [["Resonant sac",565,165,100,"soft"]], [850,315],
    [["Folds",0,"Main horn",0],["Syrinx",0,"Side horn",0],["Side horn",1,"Main horn",1],["Resonant sac",0,"Main horn",1],["Main horn",1,"out",0]], {attack:.05,release:.2,vibrato:24,vibratoRate:4.5,outputGain:.3}),
];
export const example = (id: string) => copy(EXAMPLES.find(d => d.id === id) ?? EXAMPLES[0]);
