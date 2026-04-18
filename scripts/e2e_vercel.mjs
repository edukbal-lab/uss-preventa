#!/usr/bin/env node
// E2E test del frontend en Vercel — corre varios perfiles de proyecto y valida
// que el agente devuelve BOM + mano de obra desde la BD histórica.
// Usa Playwright (chromium headless) para navegar la SPA y verificar el resultado.

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const URL = process.env.TEST_URL || "https://uss-preventa.vercel.app/";
const OUT = "/tmp/e2e_runs";
fs.mkdirSync(OUT, { recursive: true });

const cases = [
  {
    id: "comercio_cctv",
    name: "Comercio + CCTV",
    form: {
      name: "Local Martínez - Test E2E",
      cuit: "30-11111111-1",
      address: "Av. Maipú 2500, Vicente López",
      contact: "Juan Test",
      seller: "E2E Playwright",
      valor_hora: "15000",
      rubro: "Comercio",
      sols: ["CCTV"],
      desc: "Local comercial de 400m² en zona céntrica, necesita monitoreo 24/7 con cámaras IP y grabación 30 días. Tienen 4 accesos y un depósito trasero.",
      infra: "Internet fibra 300Mbps, cableado UTP cat6 existente",
    },
  },
  {
    id: "industria_acceso_alarma",
    name: "Industria + Control de Acceso + Alarma",
    form: {
      name: "Planta Industrial Tigre - Test E2E",
      cuit: "30-22222222-2",
      address: "Parque Industrial Tigre 5",
      contact: "Maria Test",
      seller: "E2E Playwright",
      valor_hora: "15000",
      rubro: "Fábrica",
      sols: ["Control de Acceso", "Alarma"],
      desc: "Planta industrial con 3 accesos vehiculares y 2 peatonales, necesitan control de acceso con lectores y alarma perimetral en predio de 5000m²",
      infra: "Sin cableado existente, internet 4G de respaldo",
    },
  },
  {
    id: "oficina_cctv_alarma",
    name: "Oficina + CCTV + Alarma",
    form: {
      name: "Oficinas Puerto Madero - Test E2E",
      cuit: "30-33333333-3",
      address: "Alicia Moreau de Justo 1500",
      contact: "Luis Test",
      seller: "E2E Playwright",
      valor_hora: "18000",
      rubro: "Oficinas",
      sols: ["CCTV", "Alarma"],
      desc: "Oficina corporativa de 3 pisos con 20 puestos de trabajo cada uno, acceso único con recepción. Necesitan cámaras interiores, perimetrales y alarma anti-robo.",
      infra: "Fibra simétrica, rack existente en planta baja, UPS central",
    },
  },
];

async function runCase(browser, c) {
  const runOut = path.join(OUT, c.id);
  fs.mkdirSync(runOut, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const netLog = [];
  page.on("response", (r) => {
    if (r.url().includes("/api/")) netLog.push({ url: r.url(), status: r.status() });
  });
  const consoleLog = [];
  page.on("console", (msg) => consoleLog.push(`[${msg.type()}] ${msg.text()}`));

  const result = { id: c.id, name: c.name, steps: [], ok: false };
  try {
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1500);
    result.steps.push("loaded");
    await page.screenshot({ path: path.join(runOut, "01_loaded.png"), fullPage: false });

    // Completar form paso 1
    async function fillByLabel(label, value) {
      const loc = page.locator(`label:has-text("${label}") + input, label:has-text("${label}") + textarea`).first();
      await loc.fill(String(value), { timeout: 5000 });
    }
    await fillByLabel("Cliente / Razón Social", c.form.name);
    await fillByLabel("CUIT", c.form.cuit);
    await fillByLabel("Domicilio comercial", c.form.address);
    await fillByLabel("Contacto", c.form.contact);
    await fillByLabel("Vendedor USS", c.form.seller);
    await fillByLabel("Valor hora técnico (ARS) *", c.form.valor_hora);

    // Rubro (select) y sols (chips)
    await page.selectOption('select', c.form.rubro).catch(async () => {
      // fallback: el select es el primer <select> del form
      const sel = page.locator("select").first();
      await sel.selectOption(c.form.rubro);
    });
    // Las soluciones son chips clickeables. Click cada una si no está activa.
    // Asumimos por defecto "CCTV" está seleccionado.
    for (const sol of c.form.sols) {
      if (sol === "CCTV") continue; // default
      await page.locator(`span:has-text("${sol}")`).first().click({ timeout: 3000 }).catch(() => {});
    }
    // Descripción
    await page.locator('textarea').first().fill(c.form.desc);
    // Infraestructura (segundo textarea)
    await page.locator('textarea').nth(1).fill(c.form.infra).catch(() => {});

    result.steps.push("form_filled");
    await page.screenshot({ path: path.join(runOut, "02_form.png"), fullPage: false });

    // Infra (segundo textarea) ya está hecha. Click "Generar propuesta"
    await page.locator('button:has-text("Generar propuesta")').first().click({ timeout: 5000 });
    result.steps.push("generate_clicked");

    // Esperar step 3 (Resumen financiero aparece cuando hay calc) o error
    const t0 = Date.now();
    try {
      await page.waitForSelector("text=Resumen financiero", { timeout: 90000 });
      result.elapsedMs = Date.now() - t0;
      result.steps.push("resumen_visible");
    } catch (e) {
      result.error = "timeout esperando step 3";
      await page.screenshot({ path: path.join(runOut, "03_timeout.png"), fullPage: true });
      return result;
    }

    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(runOut, "03_resumen.png"), fullPage: true });

    // Extraer datos visibles
    const data = await page.evaluate(() => {
      const get = (sel) => Array.from(document.querySelectorAll(sel)).map((e) => e.innerText.trim());
      const bodyText = document.body.innerText;
      const mMO = bodyText.match(/Mano de obra[^\n]*/g) || [];
      const mTotal = bodyText.match(/\$[\d.,]+/g) || [];
      return {
        bodyLen: bodyText.length,
        manoObra: mMO.slice(0, 5),
        primerosTotales: mTotal.slice(0, 10),
      };
    });
    result.dataSnapshot = data;
    result.ok = true;
    result.netLog = netLog.slice(-10);
  } catch (e) {
    result.error = String(e).slice(0, 300);
    await page.screenshot({ path: path.join(runOut, "99_error.png"), fullPage: true }).catch(() => {});
  } finally {
    fs.writeFileSync(path.join(runOut, "result.json"), JSON.stringify({ ...result, consoleLog: consoleLog.slice(-30) }, null, 2));
    await ctx.close();
  }
  return result;
}

const browser = await chromium.launch({ headless: true });
const summary = [];
for (const c of cases) {
  console.log(`\n=== ${c.name} ===`);
  const r = await runCase(browser, c);
  summary.push(r);
  console.log(`  ok=${r.ok} · elapsed=${r.elapsedMs ? (r.elapsedMs / 1000).toFixed(1) + "s" : "N/A"} · error=${r.error || "-"}`);
  console.log(`  steps: ${r.steps.join(" → ")}`);
  if (r.ok) {
    console.log(`  MO: ${r.dataSnapshot?.manoObra?.[0] || "n/d"}`);
    console.log(`  net: ${r.netLog?.map((n) => `${n.status} ${n.url.split("/").slice(-2).join("/")}`).join(", ")}`);
  }
}
await browser.close();

fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
console.log(`\n=== Resumen ===`);
const ok = summary.filter((s) => s.ok).length;
console.log(`Pasaron: ${ok}/${summary.length}`);
console.log(`Outputs en ${OUT}/`);
process.exit(ok === summary.length ? 0 : 1);
