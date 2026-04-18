// api/hikpartner.js — Vercel Serverless Function
// Proxy al servidor de escritorio que corre Computer Use + Hik-Partner Pro.
// El servidor de escritorio (hikpartner-server) debe estar corriendo en HIKPARTNER_SERVER_URL.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const serverUrl = process.env.HIKPARTNER_SERVER_URL;
  if (!serverUrl) {
    return res.status(500).json({
      error: 'HIKPARTNER_SERVER_URL no configurada. Levantá el servidor de escritorio con: cd hikpartner-server && docker compose up -d'
    });
  }

  const { plano_b64, plano_mime, products, site_info } = req.body;

  // Ahora el plano es opcional — si no hay, el servidor usa "Select by Product"
  // en vez de "Select by Designer" y arma la cotización solo con SKUs.

  try {
    // Verificar que el servidor esté disponible
    const healthCheck = await fetch(`${serverUrl}/health`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
    if (!healthCheck || !healthCheck.ok) {
      return res.status(503).json({
        error: 'El servidor de Hik-Partner Pro no está disponible. Verificá que esté corriendo en ' + serverUrl
      });
    }

    // Enviar request al agente de diseño
    const response = await fetch(`${serverUrl}/design`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plano_b64: plano_b64 || "", plano_mime: plano_mime || "image/png", products, site_info }),
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    console.error('Error Hik-Partner Pro:', error);
    return res.status(500).json({ error: 'Error al conectar con el servidor de diseño: ' + error.message });
  }
}
