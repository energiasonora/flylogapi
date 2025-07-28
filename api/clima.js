// api/clima.js
// import axios from 'axios';
// import * as cheerio from 'cheerio';
// import https from 'https';

// usando require:
const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
// --- Reusable Helper Functions (Copied/Adapted) ---

// Helper function to fetch JSON data from a URL (for Aysa)
async function fetchJsonData(url) {
  // Consider removing httpsAgent for Vercel deployment if it causes issues
  // const agent = new https.Agent({ rejectUnauthorized: false });
  try {
      console.log(`[Aysa] Fetching data from: ${url}`);
      // const response = await axios.get(url, { httpsAgent: agent, timeout: 15000, ... });
      const response = await axios.get(url, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0 (Scraping Script)' } });
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
        if (!apiData || typeof apiData !== 'object' || !apiData.estacion || !apiData.variables || !apiData.fechaMedicion) {
             return { error: "Formato de datos de la API incompleto o inesperado.", estacion: stationName };
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

        // Return data in the format you requested
        return {
            estacion: stationName,
            uuid: estacionUUID,
            fecha_medicion: fechaMedicion,
            velocidad_viento: velocidadViento,
            velocidad_rafaga: rafagaViento,
            direccion_viento: direccionViento ? direccionViento.toString() : null
        };

    } catch (err) {
        console.error(`[Aysa] Error al procesar los datos para ${stationName}:`, err);
        return { error: "Error interno al procesar los datos de la API.", estacion: stationName };
    }
}

// Helper function to get data from a URL (Cheerio - for UNLP)
async function fetchDataCheerio(url) {
    // Consider removing httpsAgent for Vercel deployment if it causes issues
    // const agent = new https.Agent({ rejectUnauthorized: false });
    try {
        console.log(`[UNLP] Fetching data from: ${url}`);
        const cleanUrl = url.trim();
        // const { data } = await axios.get(cleanUrl, { httpsAgent: agent, timeout: 10000 });
        const { data } = await axios.get(cleanUrl, { timeout: 10000 });
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

        // Extraer solo el número de "XX km/h"
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
    const fecha_medicion = now.toISOString(); // Use ISO string for consistency

    return {
        estacion: stationName,
        // uuid: null,
        fecha_medicion: fecha_medicion,
        velocidad_viento: vientoUNLPData.velocidad_actual,
        velocidad_rafaga: vientoUNLPData.racha_maxima,
        direccion_viento: vientoUNLPData.direccion
    };
}

// --- Vercel Function Handler ---
// --- Vercel Function Handler ---
// export default async function handler(req, res) {
module.exports = async (req, res) => {
  // --- CORS for Vercel Functions ---
  // IMPORTANT: Configure this properly for production
  // const allowedOrigins = ['*', 'http://localhost:3000', 'http://localhost:5173', 'https://tu-dominio-frontend.com]; // Add your frontend origins
  // Corregido:
  const allowedOrigins = ['*', 'http://localhost:3000', 'http://localhost:5173', 'https://tu-dominio-frontend.com']; // Add your frontend origins

  const origin = req.headers.origin;
  if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); // Add any headers your frontend might send

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
  }
  // ... resto del código ...

  
  

  // Only allow GET requests
  if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method Not Allowed. Use GET.' });
      return;
  }
  // --- End CORS ---

  try {
    console.log("Vercel Function (/api/clima): Solicitando datos combinados de todas las estaciones...");

    // --- Constants ---
    const UUID_BERNAL = 'B8046881-1BC3-43F8-9C9B-841AC482CF85';
    const UUID_BERAZATEGUI = '5FFBD91B-1EBA-49CE-9AFA-2129F9397D22';
    const BASE_API_URL_AYSA = 'https://www.aysa.com.ar/api/estaciones/getVariablesEstacionesHistorico';
    const campoURL = 'https://meteo.fcaglp.unlp.edu.ar/davis/campo/campo.htm';
    const torreURL = 'https://meteo.fcaglp.unlp.edu.ar/davis/torre/torre.htm';
    // --- End Constants ---

    // --- Fetch Data from All Sources ---
    // Using Promise.allSettled to handle potential individual failures gracefully
    const [responseBernal, responseBerazategui, responseUNLPCampo, responseUNLPTorre] = await Promise.allSettled([
      fetchJsonData(`${BASE_API_URL_AYSA}/${UUID_BERNAL}`),
      fetchJsonData(`${BASE_API_URL_AYSA}/${UUID_BERAZATEGUI}`),
      fetchDataCheerio(campoURL),
      fetchDataCheerio(torreURL)
    ]);
    // --- End Fetch ---

    // --- Process Responses ---
    let windDataBernal, windDataBerazategui, windDataUNLP;

    // --- Process Aysa Bernal ---
    if (responseBernal.status === 'fulfilled') {
        windDataBernal = extractWindDataAysa(responseBernal.value, 'Bernal');
    } else {
        console.error('[Aysa/Bernal] Error obteniendo datos:', responseBernal.reason.message);
        windDataBernal = { error: `Error al obtener datos de Bernal: ${responseBernal.reason.message}`, estacion: 'Bernal' };
    }

    // --- Process Aysa Berazategui ---
    if (responseBerazategui.status === 'fulfilled') {
        windDataBerazategui = extractWindDataAysa(responseBerazategui.value, 'Berazategui');
    } else {
        console.error('[Aysa/Berazategui] Error obteniendo datos:', responseBerazategui.reason.message);
        windDataBerazategui = { error: `Error al obtener datos de Berazategui: ${responseBerazategui.reason.message}`, estacion: 'Berazategui' };
    }

    // --- Process UNLP ---
    let vientoUNLPProcessed = { error: "Datos no disponibles" };
    if (responseUNLPCampo.status === 'fulfilled' && responseUNLPTorre.status === 'fulfilled') {
        const vientoUNLPData = extractVientoUNLP(responseUNLPTorre.value); // Use $torre
        if (!vientoUNLPData.error) {
             vientoUNLPProcessed = adaptUNLPToAysaFormat(vientoUNLPData, 'UNLP');
        } else {
             vientoUNLPProcessed = { error: vientoUNLPData.error, estacion: 'UNLP' };
        }
    } else {
        const campoError = responseUNLPCampo.status === 'rejected' ? responseUNLPCampo.reason.message : null;
        const torreError = responseUNLPTorre.status === 'rejected' ? responseUNLPTorre.reason.message : null;
        console.error(`[UNLP] Error obteniendo datos: Campo: ${campoError}, Torre: ${torreError}`);
        vientoUNLPProcessed = { error: `Error scraping UNLP: Campo (${campoError}), Torre (${torreError})`, estacion: 'UNLP' };
    }
    windDataUNLP = vientoUNLPProcessed;
    // --- End Process UNLP ---

    // --- Combine Final Result ---
    const resultadoFinal = {
        bernal: windDataBernal,
        berazategui: windDataBerazategui,
        unlp: windDataUNLP
    };
    // --- End Combine ---

    console.log("Vercel Function (/api/clima): Datos combinados obtenidos exitosamente.");
    res.status(200).json(resultadoFinal);

  } catch (error) {
    console.error('Vercel Function (/api/clima) Error general:', error);
    // Provide a more user-friendly error message in the response
    res.status(500).json({ error: 'Error interno del servidor Vercel al obtener datos combinados de clima.', details: error.message });
  }
}
