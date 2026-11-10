import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });
async function at(page: Page, x: number, y: number) {
  const box = await page.getByLabel("Instrument drawing canvas").boundingBox();
  if (!box) throw new Error("drawing not visible");
  return { x: box.x + box.width*x/1000, y: box.y + box.height*y/650 };
}
async function clickDrawing(page: Page, x: number, y: number) { const p=await at(page,x,y); await page.mouse.click(p.x,p.y); }

test("draw a physical instrument, save it, and add it as an independent band part", async ({page}) => {
  const errors: string[] = [];
  page.on("pageerror", e=>errors.push(e.message));
  await page.goto("./");
  await page.getByRole("radio",{name:"Build"}).click();
  await expect(page.getByLabel("Instrument name")).toHaveValue("Whale song");
  await page.getByRole("button",{name:"New drawing"}).click();
  await page.getByRole("button",{name:"Source",exact:true}).click();
  await clickDrawing(page,180,300);
  await page.getByRole("button",{name:"Draw duct"}).click();
  const a=await at(page,310,300), b=await at(page,690,300);
  await page.mouse.move(a.x,a.y); await page.mouse.down(); await page.mouse.move(b.x,b.y,{steps:12}); await page.mouse.up();
  await page.getByRole("button",{name:"Outlet",exact:true}).click();
  await clickDrawing(page,810,300);
  await page.getByRole("button",{name:"Connect",exact:true}).click();
  await clickDrawing(page,180,300); await clickDrawing(page,310,300);
  await clickDrawing(page,690,300); await clickDrawing(page,810,300);
  await expect(page.getByText("3 PARTS · 2 CONNECTIONS")).toBeVisible();
  await page.getByLabel("Instrument name").fill("Test throat");
  await page.getByRole("button",{name:"Hear instrument"}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__studioAudio.status.rms),{timeout:15_000}).toBeGreaterThan(.000001);
  await page.getByRole("button",{name:"Stop instrument"}).click();
  await page.getByRole("button",{name:"Save instrument"}).click();
  await expect(page.getByRole("status")).toContainText("saved");
  await page.getByRole("button",{name:"Add to band"}).click();
  await page.getByRole("radio",{name:"Band",exact:true}).click();
  await expect(page.getByRole("region",{name:"Band part Test throat"})).toBeVisible();
  const track=page.getByRole("region",{name:"Band part Test throat"});
  await track.getByRole("button",{name:/step 1: rest/i}).click();
  await expect(track.getByRole("button",{name:/step 1:/i})).toHaveAttribute("aria-pressed","true");
  await page.getByRole("button",{name:"Play band"}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__studioAudio.status.voices),{timeout:10_000}).toBe(3);
  await expect.poll(()=>page.evaluate(()=>(window as any).__studioAudio.status.rms),{timeout:15_000}).toBeGreaterThan(.000001);
  await page.getByRole("button",{name:"Stop band"}).click();
  await page.getByLabel("Band name").fill("Test ensemble");
  await page.getByRole("button",{name:"Save band"}).click();
  await expect(page.locator(".studio-status")).toContainText("saved");
  await page.reload();
  await page.getByRole("radio",{name:"Build"}).click();
  await page.getByLabel("Examples and saved instruments").selectOption({label:"Test throat"});
  await expect(page.getByLabel("Instrument name")).toHaveValue("Test throat");
  await page.getByRole("radio",{name:"Band",exact:true}).click();
  await page.getByLabel("Saved bands").selectOption({label:"Test ensemble"});
  await expect(page.getByLabel("Band name")).toHaveValue("Test ensemble");
  await expect(page.getByRole("region",{name:"Band part Test throat"})).toBeVisible();
  expect(errors).toEqual([]);
});

test("examples, instrument export, and mobile layout remain usable", async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto("./");
  await page.getByRole("radio",{name:"Build"}).click();
  await page.getByLabel("Examples and saved instruments").selectOption({label:"Two-voiced songbird"});
  await expect(page.getByLabel("Instrument name")).toHaveValue("Two-voiced songbird");
  const download = page.waitForEvent("download");
  await page.getByRole("button",{name:"Export",exact:true}).click();
  expect((await download).suggestedFilename()).toContain("two-voiced-songbird");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole("radio",{name:"Band",exact:true}).click();
  await expect(page.getByRole("button",{name:"Play band"})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test("switching modes silences the original voice and cancels a pending studio start", async ({page}) => {
  let observed = false;
  await page.route("**/*studioProcessor*", async route => {
    observed = true;
    await new Promise(resolve=>setTimeout(resolve, 1200));
    await route.continue();
  });
  await page.goto("./");
  await page.getByRole("radio",{name:"Play",exact:true}).click();
  await page.getByRole("button",{name:"Breathe in and start"}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__chimeraEngine?.latest?.t?.outRms ?? 0),{timeout:10_000}).toBeGreaterThan(.001);
  await page.getByRole("radio",{name:"Build",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__chimeraEngine?.latest?.t?.outRms ?? 1),{timeout:10_000}).toBeLessThan(.001);
  await page.getByRole("button",{name:"Hear instrument"}).click();
  await expect.poll(()=>observed,{timeout:5_000}).toBe(true);
  await page.getByRole("radio",{name:"Band",exact:true}).click();
  await page.waitForTimeout(1800);
  expect(await page.evaluate(()=>(window as any).__studioAudio.status.mode)).toBe("stopped");
});

test("instrument and band files round-trip and malformed imports are rejected", async ({page}) => {
  await page.goto("./");
  await page.getByRole("radio",{name:"Build",exact:true}).click();
  await page.getByLabel("Examples and saved instruments").selectOption({label:"Dragon breath"});
  const instrumentDownload = page.waitForEvent("download");
  await page.getByRole("button",{name:"Export",exact:true}).click();
  const instrumentPath = await (await instrumentDownload).path();
  await page.getByRole("button",{name:"New drawing"}).click();
  await page.getByLabel("Import instrument file").setInputFiles(instrumentPath!);
  await expect(page.getByLabel("Instrument name")).toHaveValue("Dragon breath");
  await expect(page.getByRole("status")).toContainText("imported");
  await page.getByLabel("Import instrument file").setInputFiles({name:"bad.json",mimeType:"application/json",buffer:Buffer.from('{"format":"neonsynth-instrument","instrument":{}}')});
  await expect(page.getByRole("status")).toContainText("not a valid");
  await page.getByRole("radio",{name:"Band",exact:true}).click();
  await page.getByLabel("Band name").fill("Exported ensemble");
  const bandDownload = page.waitForEvent("download");
  await page.getByRole("button",{name:"Export",exact:true}).click();
  const bandPath = await (await bandDownload).path();
  await page.getByRole("button",{name:"New band"}).click();
  await page.getByLabel("Import band file").setInputFiles(bandPath!);
  await expect(page.getByLabel("Band name")).toHaveValue("Exported ensemble");
  await expect(page.getByRole("region",{name:"Band part Whale / bass"})).toBeVisible();
});

test("part controls and behaviors edit the simulated design without corrupting numeric input", async ({page}) => {
  await page.goto("./");
  await page.getByRole("radio",{name:"Build",exact:true}).click();
  const ref=page.getByLabel(/Reference pitch/);
  await ref.click(); await ref.press("ControlOrMeta+A"); await ref.pressSequentially("120");
  await expect(ref).toHaveValue("120");
  await clickDrawing(page, 380, 290);
  await expect(page.getByText("Drawn duct",{exact:true})).toBeVisible();
  await page.getByLabel(/Entry area/).fill("3.5");
  await expect(page.getByLabel(/Entry area/)).toHaveValue("3.5");
  await clickDrawing(page, 130, 320);
  await page.getByLabel("Mechanism").selectOption("reed");
  await expect(page.getByLabel("Mechanism")).toHaveValue("reed");
  await page.getByLabel(/Pressure/).fill("20");
  await page.getByLabel(/Pulse depth/).fill("0.5");
  await page.getByRole("button",{name:"Hear instrument"}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__studioAudio.status.rms),{timeout:10_000}).toBeGreaterThan(.000001);
  await page.getByLabel(/Pulse rate/).fill("7");
  await expect.poll(()=>page.evaluate(()=>(window as any).__studioAudio.status.mode)).toBe("stopped");
  await page.getByRole("button",{name:"Save instrument"}).click();
  await page.reload();
  await page.getByRole("radio",{name:"Build",exact:true}).click();
  await page.getByLabel("Examples and saved instruments").selectOption({label:"Whale song"});
  // Both the built-in and saved copy share a name; select the saved copy by its option group.
  const saved=page.locator('select[aria-label="Examples and saved instruments"] optgroup[label="Saved in this browser"] option');
  await page.getByLabel("Examples and saved instruments").selectOption(await saved.first().getAttribute("value") as string);
  await expect(page.getByLabel(/Pulse depth/)).toHaveValue("0.5");
  await expect(page.getByLabel(/Reference pitch/)).toHaveValue("120");
});
