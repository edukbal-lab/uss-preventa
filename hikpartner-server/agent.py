"""
Agente Hik-Partner Pro — Servidor de Computer Use
Login automático, exploración/entrenamiento, y diseño de soluciones en isa.hik-partner.com.
"""

import os
import base64
import subprocess
import json
import time
import anthropic
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="USS Hik-Partner Pro Agent")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

client = anthropic.Anthropic()

DISPLAY_WIDTH = 1280
DISPLAY_HEIGHT = 720
HIKPARTNER_USER = os.environ.get("HIKPARTNER_USER", "")
HIKPARTNER_PASS = os.environ.get("HIKPARTNER_PASS", "")
is_logged_in = False
platform_knowledge = ""  # Aprendizaje acumulado sobre la plataforma


# ── Modelos ────────────────────────────────────────────────────────────

class DesignRequest(BaseModel):
    plano_b64: str
    plano_mime: str = "image/png"
    products: list = []
    site_info: str = ""
    skip_cu: bool = True  # Default True: Playwright ya cubre todo el flujo. CU solo si explícitamente se pide.


# ── Utilidades de escritorio ───────────────────────────────────────────

def take_screenshot() -> str:
    """Captura screenshot del escritorio virtual en JPEG (menor tamaño = menos tokens)."""
    png_path = "/tmp/screenshot.png"
    jpg_path = "/tmp/screenshot.jpg"
    subprocess.run(
        ["import", "-window", "root", "-display", ":1", png_path],
        capture_output=True, timeout=5,
    )
    # Convertir a JPEG calidad 70 (~5x más chico que PNG, reduce tokens ~50%)
    subprocess.run(
        ["convert", png_path, "-quality", "70", jpg_path],
        capture_output=True, timeout=5,
    )
    with open(jpg_path, "rb") as f:
        return base64.standard_b64encode(f.read()).decode()


def execute_computer_action(action: dict):
    """Ejecuta una acción de Computer Use en el escritorio virtual."""
    env = {**os.environ, "DISPLAY": ":1"}
    act_type = action.get("action", "screenshot")

    if act_type == "screenshot":
        return take_screenshot()

    coord = action.get("coordinate")

    if act_type == "mouse_move" and coord:
        subprocess.run(["xdotool", "mousemove", str(coord[0]), str(coord[1])], env=env)

    elif act_type == "left_click" and coord:
        subprocess.run(["xdotool", "mousemove", str(coord[0]), str(coord[1]), "click", "1"], env=env)

    elif act_type == "double_click" and coord:
        subprocess.run(["xdotool", "mousemove", str(coord[0]), str(coord[1]), "click", "--repeat", "2", "1"], env=env)

    elif act_type == "right_click" and coord:
        subprocess.run(["xdotool", "mousemove", str(coord[0]), str(coord[1]), "click", "3"], env=env)

    elif act_type == "left_click_drag":
        start = action.get("start_coordinate", coord)
        end = action.get("coordinate", coord)
        if start and end:
            subprocess.run(["xdotool", "mousemove", str(start[0]), str(start[1]), "mousedown", "1"], env=env)
            subprocess.run(["xdotool", "mousemove", str(end[0]), str(end[1]), "mouseup", "1"], env=env)

    elif act_type == "type":
        text = action.get("text", "")
        subprocess.run(["xdotool", "type", "--delay", "30", text], env=env)

    elif act_type == "key":
        key = action.get("key", "")
        subprocess.run(["xdotool", "key", key], env=env)

    elif act_type == "scroll" and coord:
        delta_y = action.get("delta_y", 0)
        direction = "5" if delta_y > 0 else "4"
        clicks = abs(delta_y) // 30 or 1
        subprocess.run(["xdotool", "mousemove", str(coord[0]), str(coord[1])], env=env)
        for _ in range(clicks):
            subprocess.run(["xdotool", "click", direction], env=env)

    return None


def run_computer_use_loop(system_prompt: str, messages: list, max_turns: int = 30) -> dict:
    """Loop genérico de Computer Use. Devuelve el resultado final parseado."""
    final_result = None

    for turn in range(max_turns):
        response = client.beta.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=4096,
            system=system_prompt,
            tools=[
                {
                    "type": "computer_20250124",
                    "name": "computer",
                    "display_width_px": DISPLAY_WIDTH,
                    "display_height_px": DISPLAY_HEIGHT,
                    "display_number": 1,
                }
            ],
            messages=messages,
            betas=["computer-use-2025-01-24"],
        )

        assistant_content = response.content
        messages.append({"role": "assistant", "content": assistant_content})

        # Si terminó, extraer resultado
        if response.stop_reason == "end_turn":
            text_parts = [b.text for b in assistant_content if hasattr(b, "text")]
            combined = " ".join(text_parts)
            try:
                final_result = json.loads(
                    combined.replace("```json", "").replace("```", "").strip()
                )
            except json.JSONDecodeError:
                final_result = {"status": "ok", "raw_response": combined, "turns": turn + 1}
            break

        # Ejecutar tool calls
        tool_results = []
        for block in assistant_content:
            if block.type == "tool_use" and block.name == "computer":
                result = execute_computer_action(block.input)

                if block.input.get("action") == "screenshot" and result:
                    screenshot = result
                else:
                    time.sleep(0.5)
                    screenshot = take_screenshot()

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": [{
                        "type": "image",
                        "source": {"type": "base64", "media_type": "image/jpeg", "data": screenshot},
                    }],
                })

        messages.append({"role": "user", "content": tool_results})

    if not final_result:
        final_result = {"status": "timeout", "turns": max_turns}

    return final_result


# ── Endpoints ──────────────────────────────────────────────────────────

@app.post("/login")
def login():
    """Loguea en isa.hik-partner.com usando Playwright (CDP al Chrome ya abierto).
    Determinístico, sin llamadas a Claude. Se conecta al Chrome de Xvfb por puerto 9222
    para que la sesión quede compartida y Computer Use la herede en /design."""
    global is_logged_in

    if is_logged_in:
        return {"status": "already_logged_in"}

    from playwright.sync_api import sync_playwright

    debug_log = []

    def log(msg: str):
        debug_log.append(f"[{time.strftime('%H:%M:%S')}] {msg}")

    try:
        with sync_playwright() as p:
            browser = p.chromium.connect_over_cdp("http://127.0.0.1:9222")
            context = browser.contexts[0]
            page = context.pages[0] if context.pages else context.new_page()
            log(f"page.url inicial: {page.url}")

            # 1. Navegar o reload
            if "hik" not in (page.url or ""):
                page.goto("https://isa.hik-partner.com", wait_until="domcontentloaded", timeout=20000)
                log(f"goto() done. url: {page.url}")
            else:
                page.reload(wait_until="domcontentloaded", timeout=20000)
                log(f"reloaded. url: {page.url}")
            time.sleep(2)

            # 1b. Si ya estamos en el dashboard (sesión activa), no hace falta login.
            #     Dashboard real tiene hash-routes como #/installer, #/partner, #/project
            #     Landing page (NO logueada) es /lp/index.html sin hash-route útil
            current = page.url or ""
            is_on_dashboard = "hik-partner.com" in current and (
                "#/installer" in current or "#/partner" in current or
                "#/project" in current or "#/home" in current
            )
            if is_on_dashboard:
                is_logged_in = True
                screenshot = take_screenshot()
                log(f"ya logueado en dashboard: {current}")
                return {
                    "status": "ok",
                    "logged_in": True,
                    "dashboard_visible": True,
                    "url": current,
                    "debug_log": debug_log,
                    "screenshot_b64": screenshot,
                }

            # 2. Aceptar cookies si hay banner (best-effort, 2s c/u)
            for sel in ["button:has-text('Accept All')", "button:has-text('Accept all')",
                        "button:has-text('Aceptar todo')", "button:has-text('Accept')"]:
                try:
                    page.locator(sel).first.click(timeout=2000)
                    log(f"cookies aceptadas con selector: {sel}")
                    break
                except Exception:
                    continue

            # 3. Si estamos en la home, clickear el botón grande que lleva al form dedicado.
            #    (Evitamos el mini-widget inline porque son componentes Vue que interceptan fill()).
            if "/onehikid/login" not in (page.url or "") and "oauth" not in (page.url or ""):
                log("no estamos en form de OneHikID, busco botón 'Log In by OneHikID'")
                clicked = False
                for sel in [
                    "a:has-text('Log In by OneHikID')", "button:has-text('Log In by OneHikID')",
                    "a:has-text('OneHikID')", "button:has-text('OneHikID')",
                    "a:has-text('Log In')", "button:has-text('Log In')",
                    "a:has-text('Log in')", "button:has-text('Log in')",
                ]:
                    try:
                        page.locator(sel).first.click(timeout=2000)
                        clicked = True
                        log(f"click con selector: {sel}")
                        break
                    except Exception:
                        continue
                if not clicked:
                    raise RuntimeError(f"No encontré botón para ir al form. URL: {page.url}")
                # Esperar a que la URL incluya el hash de login o que aparezca el form
                try:
                    page.wait_for_url("**/onehikid/login**", timeout=15000)
                except Exception:
                    pass
                time.sleep(2)

            # 4. Buscar el frame que tenga input password CON dimensiones reales
            #    (los forms ocultos en main frame tienen 0x0; el form real está en un iframe).
            target_frame = None
            deadline = time.time() + 20
            while time.time() < deadline:
                log(f"frames ({len(page.frames)}): {[f.url[:80] for f in page.frames]}")
                for f in page.frames:
                    try:
                        pw_count = f.locator("input[type='password']").count()
                        if pw_count == 0:
                            continue
                        # Verificar que al menos uno tenga rect > 0
                        has_real = f.evaluate(
                            """() => Array.from(document.querySelectorAll('input[type=\"password\"]')).some(i => {
                                const r = i.getBoundingClientRect();
                                return r.width > 0 && r.height > 0;
                            })"""
                        )
                        if has_real:
                            target_frame = f
                            break
                    except Exception:
                        continue
                if target_frame:
                    break
                time.sleep(1)
            if not target_frame:
                raise RuntimeError(f"No encontré iframe con form visible. URL: {page.url}, frames: {[f.url[:60] for f in page.frames]}")
            log(f"frame con form REAL: {target_frame.url[:120]}")

            # 5. Llenar inputs en el iframe target (ahora sí con dimensiones reales)
            time.sleep(1)

            fill_result = target_frame.evaluate(
                """([email, pw]) => {
                    const all = Array.from(document.querySelectorAll('input'));
                    const real = all.filter(i => {
                        const r = i.getBoundingClientRect();
                        return r.width > 0 && r.height > 0;
                    });
                    const emailInput = real.find(i => (i.type === 'text' || i.type === 'email'));
                    const passInput = real.find(i => i.type === 'password');
                    if (!emailInput || !passInput) {
                        return { err: 'no inputs visibles en iframe. real_count=' + real.length };
                    }
                    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
                    emailInput.focus();
                    setter.call(emailInput, email);
                    emailInput.dispatchEvent(new Event('input', {bubbles: true}));
                    emailInput.dispatchEvent(new Event('change', {bubbles: true}));
                    passInput.focus();
                    setter.call(passInput, pw);
                    passInput.dispatchEvent(new Event('input', {bubbles: true}));
                    passInput.dispatchEvent(new Event('change', {bubbles: true}));
                    return { email_val: emailInput.value, pw_len: passInput.value.length };
                }""",
                [HIKPARTNER_USER, HIKPARTNER_PASS],
            )
            log(f"fill en iframe: {fill_result}")
            if fill_result.get("err"):
                raise RuntimeError(f"Fill iframe falló: {fill_result['err']}")

            # 5b. Marcar "Automatically login within 7 days" para sesión persistente
            try:
                checkbox = target_frame.locator("input[type='checkbox']").first
                if not checkbox.is_checked():
                    checkbox.check(force=True, timeout=3000)
                    log("checkbox 'login 7 days' marcado")
                else:
                    log("checkbox ya marcado")
            except Exception as e:
                log(f"checkbox skip: {e}")

            # 5c. Click Sign in en el iframe
            submitted = False
            for sel in [
                "button:has-text('Sign in')", "button:has-text('Sign In')",
                "button:has-text('Log in')", "button[type='submit']",
                ".el-button--primary", "[class*='submit-btn']",
            ]:
                try:
                    target_frame.locator(sel).first.click(timeout=3000, force=True)
                    submitted = True
                    log(f"submit con selector: {sel}")
                    break
                except Exception:
                    continue
            if not submitted:
                # Último recurso: Enter en el password
                target_frame.locator("input[type='password']").first.press("Enter")
                log("submit via Enter")
            time.sleep(1)

            # 6. Esperar redirect al dashboard (no más 'login' ni 'oauth' en URL)
            page.wait_for_function(
                "() => !location.href.toLowerCase().includes('login') && !location.href.toLowerCase().includes('oauth') && location.href.includes('hik-partner.com')",
                timeout=30000,
            )
            time.sleep(2)
            log(f"dashboard cargado: {page.url}")

            is_logged_in = True
            screenshot = take_screenshot()
            return {
                "status": "ok",
                "logged_in": True,
                "dashboard_visible": True,
                "url": page.url,
                "debug_log": debug_log,
                "screenshot_b64": screenshot,
            }

    except Exception as e:
        try:
            screenshot = take_screenshot()
        except Exception:
            screenshot = ""
        return {
            "status": "error",
            "logged_in": False,
            "notes": f"{type(e).__name__}: {str(e)[:400]}",
            "debug_log": debug_log,
            "screenshot_b64": screenshot,
        }


@app.post("/explore")
def explore():
    """Explora la plataforma Hik-Partner Pro para aprender su interfaz y capacidades."""
    global platform_knowledge

    if not is_logged_in:
        login_result = login()
        if not login_result.get("logged_in") and login_result.get("status") != "already_logged_in":
            return {"status": "error", "notes": "No se pudo loguear antes de explorar."}

    system_prompt = """Sos un ingeniero de preventa aprendiendo a usar Hik-Partner Pro (isa.hik-partner.com).
Ya estás logueado en la plataforma.

Tu tarea es explorar y documentar:
1. **Navegación principal** — Qué secciones/menús hay disponibles
2. **Sección de productos** — Cómo se buscan y seleccionan productos Hikvision
3. **Herramienta de diseño** — Cómo se crea un proyecto, se sube un plano, se agregan dispositivos
4. **Cursos/documentación** — Qué recursos de aprendizaje hay disponibles
5. **Funcionalidades clave** — Calculadora de almacenamiento, cobertura de cámaras, BOM automático, etc.

Navegá por cada sección, tomá screenshots, y documentá todo.

Respondé con JSON:
{"status":"ok","sections_found":["lista de secciones"],"design_tool":{"how_to_create_project":"pasos","how_to_upload_floorplan":"pasos","how_to_add_devices":"pasos","how_to_set_coverage":"pasos"},"courses_available":["lista"],"tips":"consejos importantes","notes":"resumen general"}"""

    screenshot = take_screenshot()
    messages = [{
        "role": "user",
        "content": [
            {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": screenshot}},
            {"type": "text", "text": "Estás logueado en Hik-Partner Pro. Explorá toda la plataforma y documentá cómo funciona."},
        ],
    }]

    result = run_computer_use_loop(system_prompt, messages, max_turns=15)

    # Guardar conocimiento acumulado
    if result.get("design_tool"):
        platform_knowledge = json.dumps(result, ensure_ascii=False)

    try:
        result["screenshot_b64"] = take_screenshot()
    except Exception:
        pass

    return result


@app.post("/design")
def design(req: DesignRequest):
    """Diseña una solución en Hik-Partner Pro.
    Fase 1 (Playwright, $0): login + crear sitio + subir plano.
    Fase 2 (Claude Computer Use, ~$0.05-$0.15): colocar dispositivos en el plano."""

    from playwright.sync_api import sync_playwright

    debug_log = []
    def log(msg): debug_log.append(f"[{time.strftime('%H:%M:%S')}] {msg}")

    # Siempre re-loguear antes de diseñar
    global is_logged_in
    is_logged_in = False
    login_result = login()
    if not login_result.get("logged_in"):
        return {"status": "error", "notes": f"No se pudo loguear: {login_result.get('notes','')[:200]}", "debug_log": debug_log}

    equipment_list = "\n".join(
        f"  {p.get('qty', 1)}x {p.get('sku', '')} — {p.get('desc', '')}"
        for p in req.products
    )

    # Guardar plano en disco para upload via file picker
    plano_ext = "pdf" if "pdf" in req.plano_mime else "png"
    plano_path = f"/tmp/plano_cliente.{plano_ext}"
    with open(plano_path, "wb") as f:
        f.write(base64.b64decode(req.plano_b64))

    site_name = f"USS_{time.strftime('%Y%m%d_%H%M%S')}_{req.site_info[:30]}"

    # ── FASE 1: Playwright (gratis) — crear quote + entrar al tab Design ──
    project_id = None
    phase1_ok = False
    net_errors = []
    api_responses = []
    offer_data = None
    try:
        with sync_playwright() as p:
            browser = p.chromium.connect_over_cdp("http://127.0.0.1:9222")
            context = browser.contexts[0]
            page = context.pages[0] if context.pages else context.new_page()

            # Capturar fallos de red para diagnosticar el "Loading..." del editor
            def _on_response(res):
                try:
                    st = res.status
                    url = res.url
                    # Capturamos TODAS las llamadas a dominios hik — aprender el backend
                    if "hik-partner" in url or "hikvision" in url:
                        if st >= 400:
                            net_errors.append(f"{st} {res.request.method} {url[:200]}")
                        else:
                            # Guardamos método/status/url, filtramos recursos estáticos
                            rtype = res.request.resource_type
                            if rtype not in ("image", "font", "stylesheet", "media"):
                                api_responses.append(f"{st} {res.request.method} [{rtype}] {url[:200]}")
                except Exception:
                    pass
            page.on("response", _on_response)
            page.on("requestfailed", lambda req: net_errors.append(f"FAIL {req.method} {req.url[:200]} — {req.failure}"))

            # 1. Navegar a Products/Quote
            page.goto("https://isa.hik-partner.com/#/Product/list/quote", wait_until="domcontentloaded", timeout=20000)
            time.sleep(4)
            log(f"en quote: {page.url}")

            # 2-3. Clickear card "Select by Designer" con retry hasta que aparezca el dialog
            card_loc = page.locator("div.card-item:has-text('Select by Designer')").first
            dialog = page.locator(".el-dialog:has-text('Create New Quote')").first
            card_opened = False
            for attempt in range(3):
                try:
                    # Primer intento sin force; si falla la visibility de Playwright, reintentamos con force.
                    card_loc.click(timeout=5000, force=(attempt > 0))
                    log(f"click card Select by Designer (attempt {attempt}, force={attempt>0})")
                    try:
                        dialog.wait_for(state="visible", timeout=6000)
                        card_opened = True
                        break
                    except Exception:
                        log(f"  dialog no apareció post-click attempt {attempt}")
                        time.sleep(2)
                except Exception as e:
                    log(f"  click attempt {attempt} error: {type(e).__name__}: {str(e)[:120]}")
                    time.sleep(2)
            if not card_opened:
                raise RuntimeError("no pude abrir el dialog Create New Quote tras 3 reintentos")
            log("dialog Create New Quote visible")

            # 4. Llenar Quote Name (idx 0) y Customer Name (idx 1) vía Element UI-safe fill
            def fill_el_input(loc, value):
                loc.evaluate(
                    """(el, v) => {
                        const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
                        el.focus(); s.call(el, v);
                        el.dispatchEvent(new Event('input', {bubbles:true}));
                        el.dispatchEvent(new Event('change', {bubbles:true}));
                    }""",
                    value,
                )
            inputs = dialog.locator("input.el-input__inner")
            fill_el_input(inputs.nth(0), site_name)
            fill_el_input(inputs.nth(1), req.site_info or site_name)
            log(f"Name y Customer llenados (site_name={site_name!r})")

            # 5. Scene dropdown: click al input (idx 2) → click opción "Office" en el dropdown flotante
            inputs.nth(2).click(timeout=3000)
            time.sleep(0.5)
            # La opción está en un popup `.el-select-dropdown` fuera del dialog (al final del body)
            option_loc = page.locator(".el-select-dropdown__item:visible", has_text="Office").first
            option_loc.click(timeout=3000)
            log("Scene='Office' seleccionado")
            time.sleep(0.5)

            # 6. Click Create (el botón primario del dialog, texto "Create")
            create_btn = dialog.locator("button:has-text('Create')").first
            # Verificar que no esté disabled
            is_disabled = create_btn.evaluate("el => el.disabled")
            log(f"Create btn disabled={is_disabled}")
            create_btn.click(timeout=5000)
            log("click Create")

            # 7. Esperar redirect al editor: URL contiene /Product/generate/.
            # IMPORTANTE: page.url no se actualiza en hash routes via CDP attach —
            # hay que polear location.href via evaluate.
            current_url = page.url
            for i in range(60):
                current_url = page.evaluate("location.href")
                if "/Product/generate/" in current_url:
                    log(f"redirect OK en {i*0.5:.1f}s: {current_url}")
                    break
                time.sleep(0.5)
            else:
                raise RuntimeError(f"no hubo redirect a /Product/generate/ en 30s — url quedó en: {current_url}")
            log(f"editor cargado: {current_url}")
            # Extraer project id del URL
            import re
            m = re.search(r'id=(\d+)', current_url)
            if m:
                project_id = m.group(1)
                log(f"project_id={project_id}")

            # 8. Click tab "Design" (default llega en Offer List)
            time.sleep(2)
            # Los tabs son probablemente spans/divs con texto. Probamos varios selectores.
            tab_design = None
            for sel in [
                "div.el-tabs__item:has-text('Design')",
                ".tab-item:has-text('Design')",
                "[role='tab']:has-text('Design')",
                "span:has-text('Design'):not(:has-text('Description'))",
            ]:
                try:
                    cand = page.locator(sel).first
                    if cand.count() > 0:
                        tab_design = cand
                        log(f"tab Design encontrado con: {sel}")
                        break
                except Exception:
                    continue
            if tab_design:
                try:
                    tab_design.click(timeout=3000)
                    log("click tab Design")
                except Exception as e:
                    log(f"click tab Design fail: {e}")
            else:
                # Fallback: navegar directo
                if project_id:
                    page.goto(f"https://isa.hik-partner.com/#/Product/generate/design?id={project_id}",
                              wait_until="domcontentloaded", timeout=10000)
                    time.sleep(2)
                    log(f"navegación directa a /design?id={project_id}")

            # 9. Esperar que el editor tenga algún elemento funcional (file input oculto, botón de upload,
            #    o que aparezca iframe del canvas). Hasta 60s.
            ready = False
            for i in range(60):
                probe = page.evaluate("""() => {
                    const ifc = document.querySelectorAll('iframe').length;
                    const fic = document.querySelectorAll('input[type=file]').length;
                    const uploads = document.querySelectorAll('.el-upload, [class*="upload"]:not([class*="uploaded"])').length;
                    const loadingVisible = Array.from(document.querySelectorAll('*')).some(e => {
                        const r = e.getBoundingClientRect();
                        return /^\\s*Loading/i.test(e.innerText||'') && r.width > 50 && r.height > 50 && e.children.length < 3;
                    });
                    return { ifc, fic, uploads, loadingVisible };
                }""")
                if probe["fic"] > 0 or probe["uploads"] > 0 or probe["ifc"] > 0 or not probe["loadingVisible"]:
                    ready = True
                    log(f"editor ready (poll #{i}): probe={probe}")
                    break
                if i % 5 == 0:
                    log(f"esperando editor… poll #{i}: probe={probe}")
                time.sleep(1)
            if not ready:
                log(f"editor NO terminó de cargar en 60s — url: {page.url}")

            # 10. Upload plano. Flujo:
            #  a) Click card "Upload Floor Plan" → abre un modal secundario con drop zone
            #     + Layout Name + Ceiling Height + Confirm
            #  b) Dentro del modal hay un input[type=file] oculto; set_input_files sobre él
            #  c) Click Confirm
            try:
                # a) abrir el modal
                page.locator(".design-upload-item:has-text('Upload Floor Plan')").first.click()
                time.sleep(2)
                log("modal Upload Floor Plan abierto")

                # b) El input type=file aparece cuando se muestra el modal. set_input_files
                #    funciona aún si el input está oculto (display:none).
                file_inputs = page.locator('input[type="file"]')
                fi_count = file_inputs.count()
                log(f"input[type=file] en página: {fi_count}")
                if fi_count == 0:
                    raise RuntimeError("no apareció input[type=file] en el modal")

                file_inputs.first.set_input_files(plano_path)
                log(f"plano set via set_input_files: {plano_path}")

                # Esperar a que el backend complete el multipart upload + conversion.
                # Detectamos que terminó cuando aparece el call scene/convert/file con 200.
                upload_done = False
                for i in range(40):
                    matched = [a for a in api_responses if "survey/scene/convert/file" in a]
                    if matched:
                        upload_done = True
                        log(f"upload backend OK en {i}s — {matched[-1][:120]}")
                        break
                    time.sleep(1)
                if not upload_done:
                    log("warning: no se vio scene/convert/file — sigo igual")

                # c) Click Confirm — buscamos el botón visible con texto "Confirm"
                confirm_btn = page.locator("button:has-text('Confirm'):visible").first
                for _ in range(20):
                    disabled = confirm_btn.evaluate("el => el.disabled || el.classList.contains('is-disabled')")
                    if not disabled:
                        break
                    time.sleep(0.5)
                confirm_btn.click(timeout=5000)
                log("click Confirm (upload)")

                # Esperar que el modal se cierre (retry si no)
                for attempt in range(3):
                    time.sleep(3)
                    modal_open = page.locator("text=Upload Floor Plan:visible").count() > 0
                    if not modal_open:
                        log(f"modal cerrado en intento #{attempt}")
                        break
                    log(f"modal sigue abierto (intento #{attempt}), reintentando Confirm")
                    try:
                        confirm_btn.click(timeout=3000)
                    except Exception:
                        pass
            except Exception as e:
                log(f"upload falló: {type(e).__name__}: {str(e)[:200]}")

            # 11. Switch a tab "Offer List" para capturar la cotización auto-generada
            try:
                offer_tab = page.locator(".generate-tab-item:has-text('Offer List')").first
                offer_tab.click(timeout=5000)
                log("click tab Offer List")
                time.sleep(4)  # esperar que cargue la lista
                # Dump de productos listados
                offer_data = page.evaluate("""() => {
                    const visible = el => { const r = el.getBoundingClientRect(); return r.width > 5 && r.height > 5; };
                    // Buscar tablas con productos
                    const tables = Array.from(document.querySelectorAll('table, .el-table')).filter(visible);
                    const rows = [];
                    tables.forEach(t => {
                        Array.from(t.querySelectorAll('tr')).forEach(tr => {
                            const cells = Array.from(tr.querySelectorAll('td, th')).map(td => (td.innerText||'').trim().slice(0, 100));
                            if (cells.length) rows.push(cells);
                        });
                    });
                    const totalHints = Array.from(document.querySelectorAll('*'))
                        .filter(e => visible(e) && /total|subtotal|USD|EUR|ARS|\\$/i.test((e.innerText||'')) && e.children.length < 3 && (e.innerText||'').length < 80)
                        .slice(0, 10)
                        .map(e => (e.innerText||'').trim());
                    // Buscar botones "Add" / "+ Add" y sus rects
                    const addBtns = Array.from(document.querySelectorAll('*'))
                        .filter(e => visible(e) && /^(\\+\\s*)?Add$/i.test((e.innerText||'').trim()))
                        .slice(0, 10)
                        .map(e => ({ tag: e.tagName, cls: (e.className||'').slice(0,80), text: (e.innerText||'').trim(),
                                    rect: (r=>({x:r.x|0,y:r.y|0,w:r.width|0,h:r.height|0}))(e.getBoundingClientRect()) }));
                    return { rows: rows.slice(0, 80), totalHints, addBtns, url: location.href };
                }""")
                log(f"offer_data: {len(offer_data.get('rows',[]))} filas, {len(offer_data.get('totalHints',[]))} totales, {len(offer_data.get('addBtns',[]))} Add btns")

                # 12. Click "+ Add" del panel de productos — filtrar visibilidad en CSS
                try:
                    # Los botones Add en el tab Design quedan en DOM pero ocultos tras tab switch;
                    # usamos :visible pseudo-selector para tomar solo los del Offer List.
                    add_btns_loc = page.locator("button.el-button:visible").filter(has_text="Add")
                    count = add_btns_loc.count()
                    log(f"Add btns visibles en Offer List: {count}")
                    add_btns_loc.first.click(timeout=5000)
                    log("click Add (Products)")
                    time.sleep(3)
                    # Dump del dialog que se abrió
                    add_dialog_dump = page.evaluate("""() => {
                        const visible = el => { const r = el.getBoundingClientRect(); return r.width > 5 && r.height > 5; };
                        const dlgs = Array.from(document.querySelectorAll('.el-dialog, [role=dialog]')).filter(visible);
                        if (!dlgs.length) return { err: 'no dialog' };
                        const dlg = dlgs[dlgs.length-1];
                        return {
                            title: (dlg.querySelector('.el-dialog__title, h2')?.innerText||'').trim(),
                            text: (dlg.innerText||'').replace(/\\s+/g,' ').slice(0, 800),
                            inputs: Array.from(dlg.querySelectorAll('input')).slice(0,15).map(i => ({
                                type: i.type, placeholder: i.placeholder||'', cls: (i.className||'').slice(0,60),
                            })),
                            tabs: Array.from(dlg.querySelectorAll('[role=tab], .el-tabs__item')).slice(0,10).map(t => (t.innerText||'').trim().slice(0,40)),
                        };
                    }""")
                    log(f"add_dialog_dump: {json.dumps(add_dialog_dump, ensure_ascii=False)[:300]}")
                    offer_data["add_dialog_dump"] = add_dialog_dump

                    # 13. Para cada producto del request: buscar SKU + seleccionar
                    products_added = []
                    products_not_found = []
                    for prod in req.products:
                        sku = prod.get("sku", "").strip()
                        qty = prod.get("qty", 1)
                        if not sku:
                            continue
                        try:
                            # Input de búsqueda — limpiar y escribir el SKU
                            search_inp = page.locator("input[placeholder='Search all products']:visible").first
                            search_inp.click()
                            search_inp.fill("")
                            time.sleep(0.3)
                            search_inp.fill(sku)
                            search_inp.press("Enter")
                            time.sleep(2)

                            # Evaluar resultados — buscamos el texto "X items found" o dump de cards
                            found = page.evaluate("""() => {
                                const visible = el => { const r = el.getBoundingClientRect(); return r.width > 50 && r.height > 30; };
                                // Header "N items found"
                                const hdr = Array.from(document.querySelectorAll('*'))
                                    .filter(e => visible(e) && /^\\d+\\s+items?\\s+found/i.test((e.innerText||'').trim()))
                                    .map(e => e.innerText.trim())[0];
                                const m = hdr ? hdr.match(/^(\\d+)/) : null;
                                const itemCount = m ? parseInt(m[1]) : 0;
                                // Buscar botones "+" rojos en las cards (primer card)
                                // Los botones + son iconos rojos en la esquina inferior derecha de cada card.
                                // Buscamos elementos clickeables pequeños (w<50 h<50) con class que incluya
                                // 'plus' / 'add' / 'primary' y que estén dentro de un container tipo card.
                                const plusBtns = Array.from(document.querySelectorAll('i, span, button, .el-button, [class*="add"]'))
                                    .filter(el => {
                                        if (!visible(el)) return false;
                                        const r = el.getBoundingClientRect();
                                        if (r.width > 60 || r.height > 60) return false;  // solo iconos chicos
                                        const clsStr = (el.className||'').toString().toLowerCase();
                                        const selfPlus = /(h-icon-add|icon-plus|icon-add|add-btn|plus-btn)/i.test(clsStr);
                                        const childPlus = el.querySelector && el.querySelector('i[class*="h-icon-add"], i[class*="plus"], i[class*="add"]');
                                        return selfPlus || childPlus;
                                    })
                                    .slice(0, 20)
                                    .map(el => ({
                                        tag: el.tagName,
                                        cls: (el.className||'').toString().slice(0,100),
                                        rect: (r=>({x:r.x|0,y:r.y|0,w:r.width|0,h:r.height|0}))(el.getBoundingClientRect()),
                                    }));
                                return { itemCount, hdr, plusBtns };
                            }""")
                            log(f"  {sku}: itemCount={found.get('itemCount')} plusBtns={len(found.get('plusBtns', []))}")
                            if not found.get("itemCount"):
                                products_not_found.append(sku)
                                continue

                            # Solo la primera vez: dumpeo estructura de una card para diagnosticar
                            if sku == req.products[0].get("sku"):
                                card_dump = page.evaluate("""() => {
                                    const card = document.querySelector('.product-item-card');
                                    if (!card) return { err: 'no product-item-card' };
                                    const children = Array.from(card.querySelectorAll('*')).slice(0, 30).map(el => {
                                        const r = el.getBoundingClientRect();
                                        const s = getComputedStyle(el);
                                        return {
                                            tag: el.tagName,
                                            cls: (el.className||'').toString().slice(0,120),
                                            text: (el.innerText||'').trim().slice(0,40),
                                            cursor: s.cursor,
                                            rect: {x:r.x|0,y:r.y|0,w:r.width|0,h:r.height|0},
                                            hasIcon: !!el.querySelector('i'),
                                        };
                                    });
                                    return { cardCls: (card.className||'').toString(), children };
                                }""")
                                log(f"  card_dump: {json.dumps(card_dump, ensure_ascii=False)[:1500]}")
                                offer_data["card_dump"] = card_dump

                            # Click del icon "+" que es un <img> en la esquina inferior derecha de la
                            # primera .product-item-card. No tiene clase, lo encontramos por posición
                            # relativa dentro de la card.
                            plus_rect = page.evaluate("""() => {
                                const card = document.querySelector('.product-item-card');
                                if (!card) return null;
                                const cr = card.getBoundingClientRect();
                                const imgs = Array.from(card.querySelectorAll('img')).filter(img => {
                                    const r = img.getBoundingClientRect();
                                    return r.width > 10 && r.width < 40 && r.height > 10 && r.height < 40;
                                });
                                if (!imgs.length) return null;
                                // Último img pequeño (la acción + está al final en DOM order)
                                const img = imgs[imgs.length-1];
                                const r = img.getBoundingClientRect();
                                return {x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2)};
                            }""")
                            if plus_rect:
                                page.mouse.click(plus_rect["x"], plus_rect["y"])
                                time.sleep(0.8)
                                log(f"  {sku}: + clickeado en ({plus_rect['x']},{plus_rect['y']})")
                                products_added.append({"sku": sku, "qty": qty})
                            else:
                                log(f"  {sku}: no encontré img en card — salto")
                                products_not_found.append(sku)
                        except Exception as e:
                            log(f"  {sku}: error {type(e).__name__}: {str(e)[:120]}")
                            products_not_found.append(sku)

                    # 14. Click final "Add Product" para confirmar la selección
                    if products_added:
                        try:
                            # Buscar el botón primario "Add Product" (el rojo abajo)
                            page.locator("button.el-button--primary:visible").filter(has_text="Add Product").first.click(timeout=5000)
                            log(f"click Add Product — {len(products_added)} productos agregados a la cotización")
                            time.sleep(4)
                        except Exception as e:
                            log(f"Add Product final falló: {type(e).__name__}: {str(e)[:200]}")

                    # 15. Ajustar qty de cada fila de la Offer List al valor original del request
                    #     Los productos aparecen en el orden en que se agregaron → mismo orden que products_added
                    try:
                        for idx, prod in enumerate(products_added):
                            target_qty = prod.get("qty", 1)
                            if target_qty == 1:
                                continue  # default ya es 1
                            # Localizar la fila idx y su input de qty.
                            # La tabla Offer List es un .el-table con filas .el-table__row
                            qty_inputs = page.locator(".el-table__row input[type='number']:visible, .el-table__row input.el-input__inner:visible")
                            # Filtrar a los de la columna Qty (son los que tienen un spinner +/- cerca)
                            # Approach más robusto: evaluate para setear el valor directamente
                            page.evaluate(
                                """([i, v]) => {
                                    const rows = Array.from(document.querySelectorAll('.el-table__row'));
                                    const row = rows[i];
                                    if (!row) return { err: 'no row ' + i };
                                    // El input de qty suele ser el 2do input del row (Unit Price, Qty, Discount)
                                    const inputs = Array.from(row.querySelectorAll('input'));
                                    const qtyInput = inputs[1] || inputs[0];
                                    if (!qtyInput) return { err: 'no input' };
                                    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
                                    qtyInput.focus();
                                    setter.call(qtyInput, String(v));
                                    qtyInput.dispatchEvent(new Event('input', {bubbles:true}));
                                    qtyInput.dispatchEvent(new Event('change', {bubbles:true}));
                                    qtyInput.blur();
                                    return { ok: true, val: qtyInput.value };
                                }""",
                                [idx, target_qty],
                            )
                            time.sleep(0.5)
                            log(f"  qty ajustado para {prod['sku']} → {target_qty}")
                    except Exception as e:
                        log(f"ajuste qty falló: {type(e).__name__}: {str(e)[:200]}")

                    offer_data["products_added"] = products_added
                    offer_data["products_not_found"] = products_not_found
                except Exception as e:
                    log(f"Add producto falló: {type(e).__name__}: {str(e)[:200]}")
            except Exception as e:
                log(f"switch a Offer List falló: {type(e).__name__}: {str(e)[:200]}")
                offer_data = None

            phase1_ok = True
            log("FASE 1 completa — quote creado y tab Design abierto")

    except Exception as e:
        log(f"FASE 1 error: {type(e).__name__}: {str(e)[:300]}")
        # Si Phase 1 falló, devolvemos early sin gastar tokens en CU
        try:
            screenshot = take_screenshot()
        except Exception:
            screenshot = ""
        return {
            "status": "error",
            "notes": f"FASE 1 (Playwright) falló: {type(e).__name__}: {str(e)[:200]}",
            "debug_log": debug_log,
            "project_id": project_id,
            "screenshot_b64": screenshot,
        }

    # Si skip_cu, devolvemos acá sin gastar tokens de Computer Use
    if req.skip_cu:
        log("skip_cu=True — devolvemos sin correr FASE 2, con dump de DOM del editor")
        editor_dump = {}
        try:
            with sync_playwright() as p:
                browser = p.chromium.connect_over_cdp("http://127.0.0.1:9222")
                page = browser.contexts[0].pages[0]
                # Dump de elementos candidatos para upload y colocar dispositivos
                editor_dump = page.evaluate("""() => {
                    const visible = el => { const r = el.getBoundingClientRect(); return r.width > 5 && r.height > 5; };
                    const fileInputs = Array.from(document.querySelectorAll('input[type="file"]')).map(i => ({
                        accept: i.accept, multiple: i.multiple,
                        cls: (i.className||'').toString().slice(0,120),
                        rect: (r=>({x:r.x|0,y:r.y|0,w:r.width|0,h:r.height|0}))(i.getBoundingClientRect()),
                        visible: visible(i),
                        parent_cls: (i.parentElement?.className||'').toString().slice(0,120),
                    }));
                    const buttons = Array.from(document.querySelectorAll('button, .el-button, [role="button"]'))
                        .filter(visible)
                        .slice(0, 30)
                        .map(b => ({
                            text: (b.innerText||'').trim().slice(0,60),
                            cls: (b.className||'').toString().slice(0,100),
                            rect: (r=>({x:r.x|0,y:r.y|0,w:r.width|0,h:r.height|0}))(b.getBoundingClientRect()),
                        }));
                    const uploadAreas = Array.from(document.querySelectorAll('.el-upload, .upload-area, [class*="upload"], [class*="plan"], [class*="floor"]'))
                        .filter(visible)
                        .slice(0, 15)
                        .map(e => ({
                            tag: e.tagName, cls: (e.className||'').toString().slice(0,120),
                            text: (e.innerText||'').replace(/\\s+/g,' ').slice(0, 100),
                            rect: (r=>({x:r.x|0,y:r.y|0,w:r.width|0,h:r.height|0}))(e.getBoundingClientRect()),
                        }));
                    const iframes = Array.from(document.querySelectorAll('iframe')).map(f => ({
                        src: (f.src||'').slice(0, 200),
                        cls: (f.className||'').toString().slice(0,100),
                        rect: (r=>({x:r.x|0,y:r.y|0,w:r.width|0,h:r.height|0}))(f.getBoundingClientRect()),
                    }));
                    // Cualquier elemento con handler click o cursor:pointer o rol button/tab
                    const interactive = Array.from(document.querySelectorAll('*'))
                        .filter(el => {
                            if (!visible(el)) return false;
                            const s = getComputedStyle(el);
                            const hasPtr = s.cursor === 'pointer';
                            const role = el.getAttribute('role');
                            const isBtn = el.tagName === 'BUTTON' || role === 'button' || role === 'tab';
                            const t = (el.innerText||'').trim();
                            const hasText = t && t.length < 80;
                            return (hasPtr || isBtn) && hasText;
                        })
                        .slice(0, 60)
                        .map(el => ({
                            tag: el.tagName,
                            text: (el.innerText||'').replace(/\\s+/g,' ').trim().slice(0, 60),
                            cls: (el.className||'').toString().slice(0, 80),
                            rect: (r=>({x:r.x|0,y:r.y|0,w:r.width|0,h:r.height|0}))(el.getBoundingClientRect()),
                        }));
                    // Buscar texto sugestivo para device deploy / placement
                    const deployHints = Array.from(document.querySelectorAll('*'))
                        .filter(el => {
                            if (!visible(el) || el.children.length > 3) return false;
                            const t = (el.innerText||'').toLowerCase();
                            return /fast deploy|auto place|place device|add camera|deploy|camera|device/i.test(t) && t.length < 60;
                        })
                        .slice(0, 20)
                        .map(el => ({
                            tag: el.tagName, cls: (el.className||'').toString().slice(0,80),
                            text: (el.innerText||'').trim().slice(0, 60),
                            rect: (r=>({x:r.x|0,y:r.y|0,w:r.width|0,h:r.height|0}))(el.getBoundingClientRect()),
                        }));
                    const loading = Array.from(document.querySelectorAll('*'))
                        .filter(e => /Loading/i.test(e.innerText||'') && visible(e) && e.children.length < 3)
                        .slice(0, 5)
                        .map(e => ({ tag: e.tagName, cls: (e.className||'').toString().slice(0,80), text: (e.innerText||'').slice(0,60) }));
                    return { fileInputs, buttons, uploadAreas, iframes, interactive, deployHints, loading, url: location.href };
                }""")
                # Si hay iframes, inspeccionarlos también
                if editor_dump.get("iframes"):
                    iframe_dumps = []
                    for frame in page.frames:
                        if frame == page.main_frame:
                            continue
                        try:
                            fd = frame.evaluate("""() => {
                                const visible = el => { const r = el.getBoundingClientRect(); return r.width > 5 && r.height > 5; };
                                return {
                                    url: location.href,
                                    fileInputs: Array.from(document.querySelectorAll('input[type=file]')).map(i => ({
                                        accept: i.accept, cls: (i.className||'').slice(0,80), visible: visible(i),
                                    })),
                                    buttons: Array.from(document.querySelectorAll('button, .el-button')).filter(visible).slice(0,20).map(b => ({
                                        text: (b.innerText||'').trim().slice(0,50), cls: (b.className||'').slice(0,80),
                                    })),
                                    uploadAreas: Array.from(document.querySelectorAll('.el-upload, [class*="upload"]')).filter(visible).slice(0,10).map(e => ({
                                        tag: e.tagName, cls: (e.className||'').slice(0,80), text: (e.innerText||'').slice(0,80),
                                    })),
                                };
                            }""")
                            iframe_dumps.append({"frame_url": frame.url[:200], **fd})
                        except Exception as e:
                            iframe_dumps.append({"frame_url": frame.url[:200], "err": str(e)[:200]})
                    editor_dump["iframe_dumps"] = iframe_dumps
        except Exception as e:
            editor_dump = {"err": f"{type(e).__name__}: {e}"}
        try:
            screenshot = take_screenshot()
        except Exception:
            screenshot = ""
        return {
            "status": "ok",
            "phase1_ok": phase1_ok,
            "project_id": project_id,
            "debug_log": debug_log,
            "editor_dump": editor_dump,
            "offer_data": offer_data,
            "net_errors": net_errors[-30:],
            "api_responses": api_responses[-40:],
            "screenshot_b64": screenshot,
        }

    # ── FASE 2: Claude Computer Use — upload plano (si hace falta) + colocar dispositivos ──
    log("FASE 2 — Computer Use: upload plano + dispositivos")

    system_prompt = f"""Sos un diseñador de seguridad usando Hik-Partner Pro.
El navegador YA está dentro del editor del proyecto "{site_name}", en el tab **Design** activo.
El plano del cliente está en el filesystem en: {plano_path}

REGLAS:
- NUNCA uses right_click.
- Sé eficiente: no repitas clicks innecesarios.
- Si ves un dialog modal irrelevante, cerralo.

TAREA:
1. Si el editor Design muestra un botón/card de "Upload floorplan" / "Add floorplan" / icono +, clickealo.
2. Cuando se abra el file picker del SO, escribí la ruta completa "{plano_path}" y clickeá "Open".
   (Si el diálogo tiene un campo de ruta: escribilo; si no, navegá al directorio /tmp/ y seleccioná el archivo).
3. Una vez subido el plano, colocá los dispositivos del listado sobre el plano haciendo drag-and-drop
   desde el panel de dispositivos (usualmente a la izquierda o derecha) al plano.
4. Cuando terminés, tomá screenshot final.

EQUIPAMIENTO A COLOCAR:
{equipment_list}

SITIO: {req.site_info}

Respondé con JSON:
{{"status":"ok","design_summary":"descripción","devices_placed":N,"uploaded":true/false,"notes":"observaciones"}}"""

    screenshot = take_screenshot()
    messages = [{
        "role": "user",
        "content": [
            {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": screenshot}},
            {"type": "text", "text": f"Estado actual del navegador. El sitio '{site_name}' fue creado. Ubicá los dispositivos."},
        ],
    }]

    result = run_computer_use_loop(system_prompt, messages, max_turns=25)
    result["debug_log"] = debug_log

    try:
        result["screenshot_b64"] = take_screenshot()
    except Exception:
        pass

    return result


@app.post("/inspect")
def inspect():
    """Reconocimiento: navega a Products/Quote, clickea 'Select by Design Tool' card,
    y dumpea selectores del dialog 'Create New Quote' para poder codear todo en Playwright.
    Gratis (0 tokens)."""
    from playwright.sync_api import sync_playwright
    debug_log = []
    def log(msg): debug_log.append(f"[{time.strftime('%H:%M:%S')}] {msg}")

    global is_logged_in
    if not is_logged_in:
        r = login()
        if not r.get("logged_in"):
            return {"status": "error", "notes": "no login", "debug_log": debug_log, "login_result": r}

    try:
        with sync_playwright() as p:
            browser = p.chromium.connect_over_cdp("http://127.0.0.1:9222")
            context = browser.contexts[0]
            page = context.pages[0] if context.pages else context.new_page()

            page.goto("https://isa.hik-partner.com/#/Product/list/quote", wait_until="domcontentloaded", timeout=20000)
            time.sleep(4)
            log(f"en quote: {page.url}")

            # Dumpeo inicial: cards arriba de Quote
            cards_info = page.evaluate("""() => {
                const cards = Array.from(document.querySelectorAll('div,a,button'))
                    .filter(el => {
                        const t = (el.innerText||'').trim();
                        return t.length < 200 && /Design Tool|herramienta de diseño|Select by/i.test(t);
                    })
                    .slice(0, 8)
                    .map(el => ({
                        tag: el.tagName,
                        cls: el.className.toString().slice(0, 100),
                        text: (el.innerText||'').replace(/\\s+/g,' ').slice(0, 120),
                        rect: (r => ({x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height)}))(el.getBoundingClientRect())
                    }));
                return cards;
            }""")
            log(f"cards candidatos: {json.dumps(cards_info, ensure_ascii=False)[:800]}")

            # Click card "Select by Designer" — texto real en la UI (no "Design Tool")
            clicked = False
            for sel in [
                "div.card-item:has-text('Select by Designer')",
                "text=Select by Designer",
                "div.card-title:has-text('Select by Designer')",
            ]:
                try:
                    loc = page.locator(sel).first
                    loc.click(timeout=3000)
                    clicked = True
                    log(f"click card con: {sel}")
                    break
                except Exception as e:
                    log(f"skip {sel}: {type(e).__name__}")
            if not clicked:
                log("no pude clickear card, tomo screenshot y termino")
                return {"status": "no-card", "debug_log": debug_log, "screenshot_b64": take_screenshot()}

            time.sleep(2)

            # Dumpear estructura del dialog "Create New Quote"
            dialog_info = page.evaluate("""() => {
                const dialogs = Array.from(document.querySelectorAll('.el-dialog__wrapper, [role="dialog"], .el-dialog'));
                const visible = dialogs.filter(d => {
                    const r = d.getBoundingClientRect();
                    return r.width > 100 && r.height > 100;
                });
                const dlg = visible[visible.length - 1];
                if (!dlg) return { err: 'no dialog visible', count: dialogs.length };
                const title = dlg.querySelector('.el-dialog__title, header h2, h2')?.innerText || '';
                const inputs = Array.from(dlg.querySelectorAll('input')).map(i => ({
                    type: i.type,
                    placeholder: i.placeholder || '',
                    name: i.name || '',
                    readonly: i.readOnly,
                    cls: i.className.toString().slice(0, 80),
                    rect: (r => ({x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}))(i.getBoundingClientRect())
                }));
                const labels = Array.from(dlg.querySelectorAll('label')).map(l => (l.innerText||'').trim()).filter(Boolean);
                const selects = Array.from(dlg.querySelectorAll('.el-select, .el-cascader, [class*="select"]')).map(s => ({
                    cls: s.className.toString().slice(0, 100),
                    text: (s.innerText||'').replace(/\\s+/g,' ').slice(0, 100)
                }));
                const buttons = Array.from(dlg.querySelectorAll('button')).map(b => ({
                    text: (b.innerText||'').trim().slice(0, 40),
                    disabled: b.disabled,
                    cls: b.className.toString().slice(0, 80)
                }));
                return { title, labels, inputs, selects, buttons };
            }""")
            log(f"dialog estructura: {json.dumps(dialog_info, ensure_ascii=False)[:1500]}")

            return {
                "status": "ok",
                "debug_log": debug_log,
                "dialog": dialog_info,
                "cards": cards_info,
                "screenshot_b64": take_screenshot(),
            }
    except Exception as e:
        return {"status": "error", "notes": f"{type(e).__name__}: {str(e)[:300]}", "debug_log": debug_log, "screenshot_b64": take_screenshot()}


@app.post("/logout")
def logout():
    """Resetea el flag de login para forzar re-login."""
    global is_logged_in
    is_logged_in = False
    return {"status": "ok", "logged_in": False}


@app.get("/health")
def health():
    return {
        "status": "ok",
        "display": os.environ.get("DISPLAY", "none"),
        "logged_in": is_logged_in,
        "has_knowledge": bool(platform_knowledge),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8501)
