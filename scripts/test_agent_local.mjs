#!/usr/bin/env node
// Test local del orquestador /api/agent.js — mock req/res sin vercel dev.
// Carga ANTHROPIC_API_KEY desde hikpartner-server/.env.

import fs from "node:fs";
import { readFileSync } from "node:fs";

// Cargar env desde hikpartner-server/.env
const envPath = new URL("../hikpartner-server/.env", import.meta.url);
if (fs.existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = process.env[m[1]] || m[2];
  }
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Falta ANTHROPIC_API_KEY (buscá en hikpartner-server/.env)");
  process.exit(1);
}

// Importar el handler
const mod = await import("../api/agent.js");
const handler = mod.default;

// Mock req/res mínimos al estilo Vercel/Node
function mockReq(body) {
  return { method: "POST", body };
}
function mockRes() {
  const res = {
    statusCode: 200,
    _body: null,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(data) {
      res._body = data;
      return res;
    },
  };
  return res;
}

// Casos de prueba: 3 perfiles distintos
const cases = [
  {
    name: "Comercio + CCTV",
    form: {
      name: "Test Comercio",
      cuit: "30-11111111-1",
      address: "Av. Siempre Viva 123",
      site: "",
      contact: "Juan Test",
      seller: "AI Test",
      valor_hora: "15000",
      rubro: "Comercio",
      sols: ["CCTV"],
      desc: "Local comercial de 400m² en zona céntrica, necesita monitoreo 24/7 con 8 cámaras IP y grabación de 30 días",
      infra: "Internet fibra 300Mbps, cableado UTP existente",
    },
  },
  {
    name: "Industria + Control de Acceso + Alarma",
    form: {
      name: "Test Industria",
      cuit: "30-22222222-2",
      address: "Parque Industrial 5",
      site: "",
      contact: "Maria Test",
      seller: "AI Test",
      valor_hora: "15000",
      rubro: "Industria",
      sols: ["Control de Acceso", "Alarma"],
      desc: "Planta industrial con 3 accesos vehiculares y 2 peatonales, sistema de alarma perimetral en predio de 5000m²",
      infra: "Sin cableado existente, tienen internet 4G de respaldo",
    },
  },
];

console.log("=== Test local /api/agent ===\n");
for (const c of cases) {
  console.log(`--- Caso: ${c.name} ---`);
  const req = mockReq({ form: c.form, planoB64: null, planoMime: null });
  const res = mockRes();
  const t0 = Date.now();
  try {
    await handler(req, res);
  } catch (e) {
    console.error("Handler error:", e);
    continue;
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  HTTP ${res.statusCode} en ${elapsed}s`);
  if (res.statusCode !== 200) {
    console.log("  ERROR body:", JSON.stringify(res._body).slice(0, 400));
    continue;
  }
  const b = res._body;
  console.log(`  analysis: ${(b.analysis || "").slice(0, 150)}...`);
  console.log(`  products: ${b.products?.length} items`);
  if (b.products?.length) {
    b.products.slice(0, 3).forEach((p) => {
      console.log(`    - ${p.qty}x ${p.sku} — ${p.desc?.slice(0, 50)} @ USD ${p.unit_usd}`);
    });
  }
  console.log(`  labor.horas_totales: ${b.labor?.horas_totales}`);
  console.log(`  labor.costo_total_ars: ${b.labor?.costo_total_ars}`);
  if (b.labor?.categorias?.length) {
    console.log(`  labor.categorias:`);
    b.labor.categorias.forEach((cat) => {
      console.log(`    - ${cat.nombre}: ${cat.horas}hs × $${cat.costo_hora_ars} = $${cat.subtotal_ars}`);
    });
  }
  console.log(`  historicos_referencia: ${(b.historicos_referencia || []).slice(0, 3).join(", ")}`);
  console.log(`  meta.proyectos_evaluados: ${b.meta?.proyectos_evaluados}, catalogo_items: ${b.meta?.catalogo_items}`);
  console.log();
}
console.log("=== Test completo ===");
