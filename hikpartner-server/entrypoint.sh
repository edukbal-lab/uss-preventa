#!/bin/bash
set -e

# Chrome profile persisted via docker volume (/tmp/chrome-profile).
# No lo borramos en boot para preservar la sesión OneHikID entre restarts.
# Si hay que resetear, borrar el volume: docker compose down -v
# Limpiamos singleton locks del container anterior (sin ellos Chrome arranca ok).
rm -f /tmp/chrome-profile/SingletonCookie /tmp/chrome-profile/SingletonLock /tmp/chrome-profile/SingletonSocket

# Limpiar locks de Xvfb de runs anteriores (sin esto, un restart del docker daemon
# deja /tmp/.X1-lock y Xvfb falla con "Server is already active for display 1")
rm -f /tmp/.X1-lock /tmp/.X11-unix/X1

# Iniciar Xvfb (escritorio virtual)
Xvfb :1 -screen 0 1280x720x24 &
sleep 1

# Iniciar window manager
fluxbox &
sleep 1

# Iniciar VNC server (sin contraseña para desarrollo, agregar -passwd para prod)
x11vnc -display :1 -nopw -forever -shared &

# Iniciar noVNC (acceso web al escritorio)
websockify --web /usr/share/novnc 6080 localhost:5900 &

# Abrir Chrome en Hik-Partner Pro (ISA)
# --test-type suprime el warning amarillo de "--no-sandbox" que confunde al agente
# Pre-seed chrome prefs para deshabilitar password manager y popups de permisos
mkdir -p /tmp/chrome-profile/Default
cat > /tmp/chrome-profile/Default/Preferences <<'PREF'
{"credentials_enable_service":false,"profile":{"password_manager_enabled":false,"default_content_setting_values":{"notifications":2}}}
PREF

DISPLAY=:1 google-chrome \
  --no-sandbox \
  --test-type \
  --use-gl=swiftshader \
  --enable-webgl \
  --ignore-gpu-blocklist \
  --enable-unsafe-swiftshader \
  --disable-web-security \
  --disable-features=IsolateOrigins,site-per-process,CrossOriginOpenerPolicy,CrossOriginEmbedderPolicy \
  --start-maximized \
  --disable-dev-shm-usage \
  --no-first-run \
  --no-default-browser-check \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=Translate,TranslateUI,AutofillServerCommunication,PasswordLeakDetection,ChromeWhatsNewUI \
  --disable-popup-blocking \
  --disable-notifications \
  --disable-blink-features=AutomationControlled \
  --disable-save-password-bubble \
  --password-store=basic \
  --deny-permission-prompts \
  --remote-debugging-port=9222 \
  --remote-debugging-address=127.0.0.1 \
  --user-data-dir=/tmp/chrome-profile \
  --window-size=1280,720 \
  --window-position=0,0 \
  "https://isa.hik-partner.com" &

echo "Escritorio virtual listo en :1"
echo "noVNC disponible en http://localhost:6080"
echo "API del agente en http://localhost:8501"

# Iniciar el agente API en background
python3 agent.py &
AGENT_PID=$!

# Esperar a que la API esté lista
echo "Esperando a que la API levante..."
for i in $(seq 1 30); do
  curl -s http://localhost:8501/health > /dev/null 2>&1 && break
  sleep 1
done

# Login automático (en background para no bloquear el shell — uvicorn ya está sirviendo)
echo "Logueando en Hik-Partner Pro (en background)..."
(curl -s -X POST http://localhost:8501/login > /tmp/login_result.json 2>&1 && \
  echo "Login result: $(cat /tmp/login_result.json | python3 -c 'import sys,json; r=json.load(sys.stdin); print(r.get(\"status\",\"error\"), \"-\", r.get(\"notes\",\"\")[:120])' 2>/dev/null)") &

# /explore deshabilitado mientras debugeamos /login. Reactivar cuando login sea estable.
echo "Agente listo (entrenamiento desactivado para debug)."

# Mantener el proceso en primer plano
wait $AGENT_PID
