// api/agent.js — Orquestador del agente de preventa.
// Encadena: Supabase (histórico + catálogo) → Claude → BOM final con mano de obra.
// El frontend envía form + plano; este endpoint devuelve la propuesta completa.

const SUPABASE_URL = "https://lmiaajtuhlcapfyuvqwl.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "sb_publishable_K2dmKFAX0xZeY-eOsiIv6A_2lNUBRI_";

async function sb(path, params = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase ${path} ${res.status}: ${await res.text()}`);
  return res.json();
}

// Score de similitud entre el requerimiento nuevo y un proyecto histórico
function similarityScore(proj, form) {
  const projText = [proj.necesidad, proj.infraestructura, proj.rubro, proj.lugar, proj.solicitud_elementos, proj.problematica_resolver]
    .filter(Boolean).join(" ").toLowerCase();
  let score = 0;
  // Soluciones (CCTV, Control de acceso, Alarma, etc)
  (form.sols || []).forEach(sol => {
    const s = sol.toLowerCase();
    if (projText.includes(s)) score += 8;
    // Sinónimos comunes
    if (s === "cctv" && (projText.includes("camara") || projText.includes("cámara"))) score += 6;
    if (s === "control de acceso" && projText.includes("acceso")) score += 6;
  });
  // Rubro
  if (form.rubro && proj.rubro && proj.rubro.toLowerCase().includes(form.rubro.toLowerCase())) score += 10;
  // Palabras del input que aparecen en el proyecto
  const inputText = [form.desc, form.infra].filter(Boolean).join(" ").toLowerCase();
  const keywords = (inputText.match(/[a-záéíóúñ]{5,}/g) || []).slice(0, 20);
  keywords.forEach(kw => {
    if (projText.includes(kw)) score += 1;
  });
  return score;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY no configurada" });

  const { form, planoB64, planoMime } = req.body || {};
  if (!form || !form.desc || form.desc.length < 15) {
    return res.status(400).json({ error: "form.desc requerido (min 15 chars)" });
  }
  if (!form.valor_hora || Number(form.valor_hora) <= 0) {
    return res.status(400).json({ error: "form.valor_hora requerido (> 0)" });
  }

  try {
    // ── 1. Histórico: TODOS los proyectos (incluyendo perdidos) ranking por similitud.
    //      Priorizamos concretados pero Claude ve también perdidos como contexto.
    const historicos = await sb("proyectos_historicos", {
      select: "id,lugar,rubro,necesidad,solicitud_elementos,infraestructura,problematica_resolver,periferico,costo_total,instalacion,resultado_comercial",
      limit: "300",
    });
    const scored = historicos
      .map(p => {
        let s = similarityScore(p, form);
        // Bump proyectos concretados para que queden priorizados en ties
        if (p.resultado_comercial === "Concretado") s += 3;
        return { p, s };
      })
      .sort((a, b) => b.s - a.s);
    const topSimilares = scored.slice(0, 10).map(x => ({ ...x.p, _score: x.s }));
    const topIds = topSimilares.map(p => p.id);

    // ── 2. Materiales y mano de obra de esos proyectos ─────────────────────
    let materiales = [];
    let manoObra = [];
    if (topIds.length) {
      const inList = `in.(${topIds.map(id => `"${id}"`).join(",")})`;
      materiales = await sb("materiales_historicos", {
        select: "proyecto_id,codigo,detalle,cantidad,costo,marca",
        proyecto_id: inList,
      });
      manoObra = await sb("mano_obra_historica", {
        select: "proyecto_id,categoria,cantidad_hs",
        proyecto_id: inList,
      });
    }

    // Agrupar materiales y mano de obra por proyecto para el prompt
    const matByProj = {};
    materiales.forEach(m => {
      (matByProj[m.proyecto_id] = matByProj[m.proyecto_id] || []).push(m);
    });
    const moByProj = {};
    manoObra.forEach(mo => {
      (moByProj[mo.proyecto_id] = moByProj[mo.proyecto_id] || []).push(mo);
    });

    // ── 3. Catálogo vigente (productos con precio) ────────────────────────
    // Filtramos por las soluciones seleccionadas para reducir tokens.
    const catalogo = await sb("productos", {
      select: "sku,descripcion,categoria,linea,precio_usd,proveedor,marca",
      limit: "800",
    });
    // Pre-filtro simple por categoría relevante al rubro/sols
    const sols = (form.sols || []).map(s => s.toLowerCase());
    const catFilter = catalogo.filter(c => {
      const cat = (c.categoria || "").toLowerCase();
      if (!sols.length) return true;
      return sols.some(s => {
        if (s === "cctv") return cat.includes("camara") || cat.includes("cámara") || cat.includes("nvr") || cat.includes("cctv") || cat.includes("video") || cat.includes("switch") || cat.includes("grabad") || cat.includes("lente") || cat.includes("gabinet") || cat.includes("fuent") || cat.includes("rack") || cat.includes("cable");
        if (s === "control de acceso") return cat.includes("acceso") || cat.includes("control") || cat.includes("cerrad") || cat.includes("bot") || cat.includes("lector") || cat.includes("tarjeta") || cat.includes("barrera") || cat.includes("molinet") || cat.includes("fuent") || cat.includes("cable");
        if (s === "alarma") return cat.includes("alarma") || cat.includes("sensor") || cat.includes("sirena") || cat.includes("panel") || cat.includes("bateria") || cat.includes("contacto") || cat.includes("movimiento") || cat.includes("humo");
        if (s === "incendio") return cat.includes("incendio") || cat.includes("humo") || cat.includes("detector") || cat.includes("sirena") || cat.includes("panel");
        return cat.includes(s);
      });
    }).slice(0, 500);

    // ── 4. Construir contexto para Claude ─────────────────────────────────
    const similaresResumen = topSimilares.map((p, i) => {
      const mats = (matByProj[p.id] || []).map(m => `    - ${m.cantidad || 1}x ${m.codigo || "s/sku"} — ${m.detalle || ""} ($${m.costo || 0})`).join("\n");
      const mo = (moByProj[p.id] || []).map(h => `    - ${h.categoria || "s/cat"}: ${h.cantidad_hs || 0}hs`).join("\n");
      return `Proyecto ${i + 1} (score ${p._score}) — id=${p.id}
  Lugar: ${p.lugar || "s/d"} | Rubro: ${p.rubro || "s/d"} | Tamaño: ${p.periferico || "s/d"} | Costo USD: ${p.costo_total || "s/d"}
  Necesidad: ${(p.necesidad || "").slice(0, 220)}
  Solicitud: ${p.solicitud_elementos || "s/d"}
  Materiales usados:
${mats || "    (sin BOM registrado)"}
  Mano de obra real:
${mo || "    (sin registro de horas)"}`;
    }).join("\n\n");

    const userText = `PROYECTO NUEVO
Cliente: ${form.name || "Sin nombre"}
Rubro: ${form.rubro || "s/d"} | Soluciones pedidas: ${(form.sols || []).join(", ") || "s/d"}
Instalación: ${form.site || form.address || "s/d"}
Necesidad: ${form.desc}
Infraestructura existente: ${form.infra || "s/d"}
Valor hora técnico (ARS): ${form.valor_hora}

════════════════════════════════
PROYECTOS HISTÓRICOS SIMILARES (concretados, ranking por similitud)
════════════════════════════════
${similaresResumen || "(no se encontraron proyectos históricos relevantes)"}

════════════════════════════════
CATÁLOGO VIGENTE (Fiesa/Hikvision, subset relevante)
════════════════════════════════
${JSON.stringify(catFilter)}`;

    const userContent = [];
    if (planoB64) {
      userContent.push({
        type: "image",
        source: { type: "base64", media_type: planoMime || "image/png", data: planoB64 },
      });
      userContent.push({ type: "text", text: "Arriba: plano del sitio del cliente. Usalo para dimensionar cantidades y ubicaciones." });
    }
    userContent.push({ type: "text", text: userText });

    // ── 5. Llamada a Claude ───────────────────────────────────────────────
    const system = `Sos el asistente de preventa de USS Seguridad Electrónica (integrador B2B, Argentina).

Tu tarea: diseñar un BOM COMPLETO y profesional para el PROYECTO NUEVO y estimar mano de obra.

IMPORTANTE — diseño completo significa NO quedarse corto:
- Cubrí TODO lo que necesita el proyecto: no solo las cámaras/sensores/lectores, también los elementos de soporte y conexión
  (NVR/grabador dimensionado a los canales, switch PoE apropiado, rack/gabinete si corresponde, fuentes de alimentación,
  cables por metro, herrajes, sirenas, contactos magnéticos, panel de alarma, batería de respaldo, etc.).
- Pensá como un preventa profesional: si vendés 10 cámaras, necesitás 10 cables, PoE suficiente, grabador acorde.
- Si el plano muestra accesos, incluí elementos para cada uno.
- Un BOM típico de CCTV tiene 8-25 líneas, no 3-5. Un proyecto mediano de accesos + alarma fácil supera los 15 items.

Fuentes que te doy:
1) Proyectos históricos similares (concretados Y perdidos). Los concretados son patrones que funcionaron.
   Usá el BOM histórico como CHECKLIST de qué no olvidarte, pero ampliá si el proyecto nuevo lo pide.
2) Catálogo vigente con precios Fiesa. Seleccioná SKUs reales del catálogo (no inventes SKUs).
3) El plano (si adjuntado) para dimensionar cantidades.

Mano de obra:
- Proyectá horas basándote en la relación horas/envergadura de los proyectos similares.
- Categorías observadas: B2B (técnico principal), Ayudante, Project Manager, Terciarizado.
- Devolvé cada categoría con sus horas. NO repitas un monto en ARS — el frontend calcula con el valor/hora del usuario.

Respondé SOLO con JSON válido, sin markdown:
{
  "analysis": "3-5 oraciones: qué proyectos similares te guiaron y qué criterio usaste para completar el BOM",
  "products": [
    {"sku": "", "desc": "", "qty": 1, "unit_usd": 0, "reason": "por qué este SKU y cantidad"}
  ],
  "labor": {
    "categorias": [
      {"nombre": "B2B", "horas": 0, "justificacion": "basado en proyecto X"}
    ],
    "horas_totales": 0,
    "justification": "cómo llegué al total"
  },
  "historicos_referencia": ["id1", "id2"]
}`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8000,
        system,
        messages: [{ role: "user", content: userContent }],
      }),
    });
    const claudeData = await claudeRes.json();
    if (!claudeRes.ok) {
      return res.status(claudeRes.status).json({ error: "Error de Anthropic", detail: claudeData });
    }
    const rawText = (claudeData.content || []).map(c => c.text || "").join("").trim().replace(/```json|```/g, "").trim();
    let plan;
    try {
      plan = JSON.parse(rawText);
    } catch (e) {
      return res.status(500).json({ error: "Claude devolvió JSON inválido", raw: rawText.slice(0, 2000) });
    }

    // ── 6. Post-process: calcular costo de mano de obra con valor/hora del form ──
    const valorHora = Number(form.valor_hora);
    const categorias = (plan.labor?.categorias || []).map(c => ({
      ...c,
      costo_hora_ars: valorHora,
      subtotal_ars: (Number(c.horas) || 0) * valorHora,
    }));
    const horasTotales = plan.labor?.horas_totales ?? categorias.reduce((s, c) => s + (Number(c.horas) || 0), 0);
    const laborFinal = {
      ...plan.labor,
      categorias,
      horas_totales: horasTotales,
      valor_hora_ars: valorHora,
      costo_total_ars: horasTotales * valorHora,
    };

    return res.status(200).json({
      analysis: plan.analysis || "",
      products: plan.products || [],
      labor: laborFinal,
      historicos_referencia: plan.historicos_referencia || topIds,
      meta: {
        proyectos_evaluados: concretados.length,
        top_similares: topSimilares.map(p => ({ id: p.id, score: p._score, lugar: p.lugar, rubro: p.rubro })),
        catalogo_items: catFilter.length,
      },
    });
  } catch (error) {
    console.error("/api/agent error:", error);
    return res.status(500).json({ error: "Error en orquestador", detail: String(error).slice(0, 500) });
  }
}
