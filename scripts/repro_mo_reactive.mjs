#!/usr/bin/env node
// Repro del bug: cambiar Técnicos/Días/Valor hora no actualiza el total de mano de obra
import { chromium } from "playwright";

const URL = "https://uss-preventa.vercel.app/";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);

// Completar form paso 1
async function fillByLabel(label, value) {
  const loc = page.locator(`label:has-text("${label}") + input, label:has-text("${label}") + textarea`).first();
  await loc.fill(String(value), { timeout: 5000 });
}
await fillByLabel("Cliente / Razón Social", "Test MO Reactive");
await fillByLabel("CUIT", "30-11111111-1");
await fillByLabel("Domicilio comercial", "Test 123");
await fillByLabel("Contacto", "Tester");
await fillByLabel("Vendedor USS", "E2E");
await fillByLabel("Valor hora técnico (ARS) *", "15000");
await page.locator("select").first().selectOption("Comercio");
await page.locator("textarea").first().fill("Local 400m² zona céntrica, monitoreo 24/7 con cámaras IP");

await page.locator('button:has-text("Generar propuesta")').first().click();
await page.waitForSelector("text=Resumen financiero", { timeout: 90000 });
await page.waitForTimeout(2000);

// Leer totales iniciales
async function snapshot(label) {
  const data = await page.evaluate(() => {
    const inputs = {};
    document.querySelectorAll("label").forEach((l) => {
      const txt = l.innerText.trim();
      const sibling = l.nextElementSibling;
      if (sibling && sibling.tagName === "INPUT") inputs[txt] = sibling.value;
    });
    const bodyText = document.body.innerText;
    const totalMO = bodyText.match(/Total MO:[\s\S]{0,50}/);
    const manoObraLine = bodyText.match(/Mano de obra.*?\$[\d.,]+/);
    return { inputs, totalMO: totalMO?.[0]?.slice(0,80), manoObraLine: manoObraLine?.[0]?.slice(0,100) };
  });
  console.log(`\n[${label}]`);
  console.log("  Inputs MO:", Object.fromEntries(Object.entries(data.inputs).filter(([k]) => /técnicos|días|horas|valor hora/i.test(k))));
  console.log("  totalMO:", data.totalMO);
  console.log("  manoObraLine:", data.manoObraLine);
  return data;
}
await snapshot("INITIAL");
await page.screenshot({ path: "/tmp/repro_01_initial.png", fullPage: true });

// Cambiar Valor Hora a 30000
const valorHoraInput = page.locator('label:has-text("Valor hora (ARS)") + input').first();
await valorHoraInput.fill("30000");
await valorHoraInput.blur();
await page.waitForTimeout(1000);
await snapshot("AFTER valor_hora=30000");
await page.screenshot({ path: "/tmp/repro_02_valorhora.png", fullPage: true });

// Cambiar Técnicos a 3
const techInput = page.locator('label:has-text("Técnicos") + input').first();
await techInput.fill("3");
await techInput.blur();
await page.waitForTimeout(1000);
await snapshot("AFTER tecnicos=3");
await page.screenshot({ path: "/tmp/repro_03_tec.png", fullPage: true });

// Cambiar Días a 5
const daysInput = page.locator('label:has-text("Días") + input').first();
await daysInput.fill("5");
await daysInput.blur();
await page.waitForTimeout(1000);
await snapshot("AFTER dias=5");
await page.screenshot({ path: "/tmp/repro_04_dias.png", fullPage: true });

await browser.close();
console.log("\nScreenshots en /tmp/repro_*.png");
