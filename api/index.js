// --- DEPENDENCIAS ---
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const cors = require('cors'); // <-- ¡Esta es la línea que faltaba!

const app = express();

// --- MIDDLEWARE ---
// Habilitar CORS para todas las solicitudes.
// Esto debe ir antes de la definición de las rutas.
app.use(cors()); 

// --- CONSTANTES PARA AYSA ---
const UUID_BERNAL = 'B8046881-1BC3-43F8-9C9B-841AC482CF85';
const UUID_BERAZATEGUI = '5FFBD91B-1EBA-49CE-9AFA-2129F9397D22';
const BASE_API_URL_AYSA = 'https://www.aysa.com.ar/api/estaciones/getVariablesEstacionesHistorico';

// --- FUNCIONES PARA AYSA (API JSON) ---

// Helper function to fetch JSON data from a URL
async function fetchJsonData(url) {
  // El agente se crea aquí para asegurar que no se reutilice en un entorno serverless
  const agent = new https.Agent({ rejectUnauthorized: false });
  try {
      console.log(`[Aysa] Fetching data from: ${url}`);
      const response = await axios.get(url, {
          httpsAgent: agent,
          timeout: 15000,
          headers: {
              'User-Agent': 'Mozilla/5.0 (Vercel Scraping Script)'
          }
      });
      console.log(`[Aysa] Data fetched successfully from: ${url}`);
      return response.data;
  } catch (error) {
      console.error(`[Aysa] Error fetching data from ${url}:`, error.message);
      throw error;
  }
}

// Function to extract wind data for an Aysa station from the JSON API response
function extractWindDataAysa(apiData, stationName = 'Desconocida') {
    console.log(`[Aysa] Procesando datos para la estación: ${stationName}...`);
    try {
        if (!apiData || typeof apiData !== 'object') {
            return { error: "Formato de datos de la API inesperado.", estacion: stationName };
        }

        if (!apiData.estacion || !apiData.variables || !apiData.fechaMedicion) {
             return { error: "Formato de datos de la API incompleto.", estacion: stationName };
        }

        const estacionUUID = apiData.estacion;
        const variables = apiData.variables;
        const fechaMedicion = apiData.fechaMedicion;

        let velocidadViento = null;
        let rafagaViento = null;
        let direccionViento = null;

        if (Array.isArray(variables.VelocidadViento) && variables.VelocidadViento.length > 0) {
            const ultimoValorViento = variables.VelocidadViento[variables.VelocidadViento.length - 1];
            velocidadViento = ultimoValorViento !== null ? parseFloat(ultimoValorViento) : null;
        }

        if (Array.isArray(variables.RafagaViento) && variables.RafagaViento.length > 0) {
            const ultimoValorRafaga = variables.RafagaViento[variables.RafagaViento.length - 1];
            rafagaViento = ultimoValorRafaga !== null ? parseFloat(ultimoValorRafaga) : null;
        }

        if (Array.isArray(variables.DireccionViento) && variables.DireccionViento.length > 0) {
            direccionViento = variables.DireccionViento[variables.DireccionViento.length - 1];
        }

        console.log(`[Aysa] Datos extraídos para ${stationName} - Viento: ${velocidadViento}, Rafaga: ${rafagaViento}, Direccion: ${direccionViento}`);

        return {
            estacion: stationName,
            uuid: estacionUUID,
            fecha_medicion: fechaMedicion,
            velocidad_viento: velocidadViento,
            velocidad_rafaga: rafagaViento,
            direccion_viento: direccionViento ? direccionViento.toString() : null // Asegurar string
        };

    } catch (err) {
        console.error(`[Aysa] Error al procesar los datos para ${stationName}:`, err);
        return { error: "Error interno al procesar los datos de la API.", estacion: stationName };
    }
}

// --- FUNCIONES PARA UNLP (SCRAPING HTML) ---

// Helper function to get data from a URL (Cheerio)
async function fetchDataCheerio(url) {
    const agent = new https.Agent({ rejectUnauthorized: false });
    try {
        console.log(`[UNLP] Fetching data from: ${url}`);
        const cleanUrl = url.trim();
        const { data } = await axios.get(cleanUrl, { httpsAgent: agent, timeout: 10000 });
        const $ = cheerio.load(data);
        console.log(`[UNLP] Data fetched successfully from: ${cleanUrl}`);
        return $;
    } catch (error) {
        console.error(`[UNLP] Error fetching data from ${url}:`, error.message);
        throw error;
    }
}

// Extract viento from torre.htm (UNLP)
function extractVientoUNLP($) {
    try {
        console.log(`[UNLP] Extrayendo datos de viento...`);
        const $tabla = $('.variable').filter(function () {
            return $(this).find('.nombre').text().trim() === 'Viento';
        }).find('table.valores');

        if (!$tabla.length) {
            console.warn(`[UNLP] Tabla de viento no encontrada.`);
            return {
                velocidad_actual: null,
                racha_maxima: null,
                direccion: null
            };
        }

        const velocidad_actual_text = $tabla.find('tr').eq(0).find('td').eq(1).text().trim();
        const direccion_text = $tabla.find('tr').eq(1).find('td').eq(1).text().trim();
        const racha_maxima_text = $tabla.find('tr').eq(3).find('td').eq(1).text().trim();

        const velocidad_actual_match = velocidad_actual_text.match(/^(\d+(?:[.,]\d+)?)/);
        const racha_maxima_match = racha_maxima_text.match(/^(\d+(?:[.,]\d+)?)/);

        const velocidad_actual = velocidad_actual_match ? parseFloat(velocidad_actual_match[1].replace(',', '.')) : null;
        const racha_maxima = racha_maxima_match ? parseFloat(racha_maxima_match[1].replace(',', '.')) : null;
        const direccion = direccion_text || null;

        console.log(`[UNLP] Datos extraídos - Viento Actual: ${velocidad_actual}, Rafaga: ${racha_maxima}, Direccion: ${direccion}`);

        return {
            velocidad_actual,
            racha_maxima,
            direccion
        };
    } catch (err) {
        console.error(`[UNLP] Error al extraer datos de viento:`, err);
        return {
            error: "Error al extraer datos de viento de la página UNLP."
        };
    }
}

// Función para adaptar el formato de UNLP al de Aysa
function adaptUNLPToAysaFormat(vientoUNLPData, stationName) {
    const now = new Date();
    const fecha_medicion = now.toISOString();

    return {
        estacion: stationName,
        fecha_medicion: fecha_medicion,
        velocidad_viento: vientoUNLPData.velocidad_actual,
        velocidad_rafaga: vientoUNLPData.racha_maxima,
        direccion_viento: vientoUNLPData.direccion
    };
}


// --- RUTA PRINCIPAL COMBINADA ---
app.get('/api/clima/combinado', async (req, res) => {
  try {
    console.log("Solicitando datos combinados de todas las estaciones...");

    const urlBernal = `${BASE_API_URL_AYSA}/${UUID_BERNAL}`;
    const urlBerazategui = `${BASE_API_URL_AYSA}/${UUID_BERAZATEGUI}`;
    const torreURL = 'https://meteo.fcaglp.unlp.edu.ar/davis/torre/torre.htm';

    // Hacer todas las solicitudes en paralelo
    const [responseBernal, responseBerazategui, responseUNLPTorre] = await Promise.allSettled([
      fetchJsonData(urlBernal),
      fetchJsonData(urlBerazategui),
      fetchDataCheerio(torreURL)
    ]);

    // --- Procesar datos de Aysa ---
    let windDataBernal, windDataBerazategui;

    if (responseBernal.status === 'fulfilled') {
        windDataBernal = extractWindDataAysa(responseBernal.value, 'Bernal');
    } else {
        console.error('[Aysa] Error obteniendo datos de Bernal:', responseBernal.reason.message);
        windDataBernal = { error: `Error al obtener datos de Bernal: ${responseBernal.reason.message}`, estacion: 'Bernal' };
    }

    if (responseBerazategui.status === 'fulfilled') {
        windDataBerazategui = extractWindDataAysa(responseBerazategui.value, 'Berazategui');
    } else {
        console.error('[Aysa] Error obteniendo datos de Berazategui:', responseBerazategui.reason.message);
        windDataBerazategui = { error: `Error al obtener datos de Berazategui: ${responseBerazategui.reason.message}`, estacion: 'Berazategui' };
    }

    // --- Procesar datos de UNLP ---
    let windDataUNLP = { error: "Datos no disponibles", estacion: 'UNLP' };
    if (responseUNLPTorre.status === 'fulfilled') {
        const $torre = responseUNLPTorre.value;
        const vientoUNLPData = extractVientoUNLP($torre);
        if (!vientoUNLPData.error) {
             windDataUNLP = adaptUNLPToAysaFormat(vientoUNLPData, 'UNLP');
        } else {
             windDataUNLP = vientoUNLPData; // Devolver el error
        }
    } else {
        const torreError = responseUNLPTorre.status === 'rejected' ? responseUNLPTorre.reason.message : null;
        console.error(`[UNLP] Error obteniendo datos: Torre: ${torreError}`);
        windDataUNLP = { error: `Error al obtener datos de UNLP: Torre (${torreError})`, estacion: 'UNLP' };
    }

    // --- Combinar resultados finales ---
    const resultadoFinal = {
        bernal: windDataBernal,
        berazategui: windDataBerazategui,
        unlp: windDataUNLP
    };

    console.log("Datos combinados obtenidos exitosamente.");
    return res.json(resultadoFinal);

  } catch (error) {
    console.error('Error general en la ruta /api/clima/combinado:', error);
    return res.status(500).json({ error: 'Error interno del servidor al obtener datos combinados de todas las estaciones.' });
  }
});

// --- RUTAS INDIVIDUALES PARA AYSA ---
app.get('/api/viento/aysa/bernal', async (req, res) => {
  try {
    const url = `${BASE_API_URL_AYSA}/${UUID_BERNAL}`;
    const apiData = await fetchJsonData(url);
    const windData = extractWindDataAysa(apiData, 'Bernal');
    if (windData.error) return res.status(500).json(windData);
    return res.json(windData);
  } catch (error) {
    console.error('[Aysa/Bernal] Error en ruta individual:', error);
    return res.status(500).json({ error: 'Error interno del servidor al obtener datos de Bernal.', estacion: 'Bernal' });
  }
});

app.get('/api/viento/aysa/berazategui', async (req, res) => {
  try {
    const url = `${BASE_API_URL_AYSA}/${UUID_BERAZATEGUI}`;
    const apiData = await fetchJsonData(url);
    const windData = extractWindDataAysa(apiData, 'Berazategui');
    if (windData.error) return res.status(500).json(windData);
    return res.json(windData);
  } catch (error) {
    console.error('[Aysa/Berazategui] Error en ruta individual:', error);
    return res.status(500).json({ error: 'Error interno del servidor al obtener datos de Berazategui.', estacion: 'Berazategui' });
  }
});

// --- EXPORTAR LA APP PARA VERCEL ---
// Vercel se encarga de levantar el servidor, por lo que no necesitamos app.listen()
module.exports = app;
