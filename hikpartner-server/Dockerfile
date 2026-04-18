FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV DISPLAY=:1

# Dependencias de sistema + escritorio virtual + navegador
# Usamos chromium de apt PPA en vez de snap (no funciona en Docker)
RUN apt-get update && apt-get install -y \
    xvfb \
    x11vnc \
    novnc \
    websockify \
    fluxbox \
    xdotool \
    imagemagick \
    python3 \
    python3-pip \
    curl \
    wget \
    gnupg \
    fonts-liberation \
    libnss3 \
    libxss1 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libgbm1 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Instalar Chromium via descarga directa (compatible con Docker)
RUN wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
    && apt-get update && apt-get install -y ./google-chrome-stable_current_amd64.deb \
    && rm google-chrome-stable_current_amd64.deb \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

COPY agent.py .
COPY entrypoint.sh .
RUN chmod +x entrypoint.sh

EXPOSE 8501 6080 5900

ENTRYPOINT ["./entrypoint.sh"]
