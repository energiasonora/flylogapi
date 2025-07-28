const express = require('express');
const axios = require('axios');
const https = require('https');

const app = express();

// Constantes para los UUIDs
const UUID_BERNAL = 'B8046881-1BC3-43F8-9C9B-841AC482CF85';
const UUID_BERAZATEGUI = '5FFBD91B-1EBA-49CE-9AFA-2129F9397D22';
const BASE_API_URL = 'https://www.aysa.com.ar/api/estaciones/getVariablesEstacionesHistorico';

// Helper function to fetch JSON data from a URL
async function fetchJsonData(url) {
  const agent = new https.Agent({ rejectUnauthorized: false });
  try {
      console.log(`Fetching data from: ${url}`);
      const response = await axios.get(url, {
          httpsAgent: agent,
          timeout: 15000, // Aumentado el timeout
          headers: {
              'User-Agent': 'Mozilla/5.0 (Scraping Script)'
          }
      });
      console.log(`Data fetched successfully from: ${url}`);
      return response.data;
  } catch (error) {
      console.error(`Error fetching data from ${url}:`, error.message);
      if (error.response) {
          console.error(` - Status: ${error.response.status}`);
          console.error(` - Status Text: ${error.response.statusText}`);
      }
      throw error;
  }
}

// Function to extract wind data for a station from the JSON API response
function extractWindData(apiData, stationName = 'Desconocida') {
    console.log(`Procesando datos de la API para la estación: ${stationName}...`);
    try {
        if (!apiData || typeof apiData !== 'object') {
            console.error("La respuesta de la API no es un objeto como se esperaba.");
            return { error: "Formato de datos de la API inesperado.", estacion: stationName };
        }

        if (!apiData.estacion || !apiData.variables || !apiData.fechaMedicion) {
             console.error("La respuesta de la API no contiene la estructura esperada (estacion, variables, fechaMedicion).");
             return { error: "Formato de datos de la API incompleto o inesperado.", estacion: stationName };
        }

        const estacionNombre = apiData.estacion; // Será el UUID
        const variables = apiData.variables;
        const fechaMedicion = apiData.fechaMedicion;

        console.log(`Datos recibidos para la estación (${stationName}): ${estacionNombre}`);

        let velocidadViento = null;
        let rafagaViento = null;
        let direccionViento = null;

        if (Array.isArray(variables.VelocidadViento) && variables.VelocidadViento.length > 0) {
            const ultimoValorViento = variables.VelocidadViento[variables.VelocidadViento.length - 1];
            velocidadViento = ultimoValorViento !== null ? parseFloat(ultimoValorViento) : null;
        } else {
            console.warn(`No se encontró datos de 'VelocidadViento' o no es un array válido para ${stationName}.`);
        }

        if (Array.isArray(variables.RafagaViento) && variables.RafagaViento.length > 0) {
            const ultimoValorRafaga = variables.RafagaViento[variables.RafagaViento.length - 1];
            rafagaViento = ultimoValorRafaga !== null ? parseFloat(ultimoValorRafaga) : null;
        } else {
            console.warn(`No se encontró datos de 'RafagaViento' o no es un array válido para ${stationName}.`);
        }

        if (Array.isArray(variables.DireccionViento) && variables.DireccionViento.length > 0) {
            direccionViento = variables.DireccionViento[variables.DireccionViento.length - 1];
        } else {
            console.warn(`No se encontró datos de 'DireccionViento' o no es un array válido para ${stationName}.`);
        }

        console.log(`Datos extraídos para ${stationName} - Viento: ${velocidadViento}, Rafaga: ${rafagaViento}, Direccion: ${direccionViento}`);

        return {
            estacion: stationName, // Usamos el nombre legible
            uuid: estacionNombre, // Incluimos el UUID también
            fecha_medicion: fechaMedicion,
            velocidad_viento: velocidadViento,
            velocidad_rafaga: rafagaViento,
            direccion_viento: direccionViento
        };

    } catch (err) {
        console.error(`Error al procesar los datos de la API para ${stationName}:`, err);
        return { error: "Error interno al procesar los datos recibidos de la API.", estacion: stationName };
    }
}

// --- RUTA PARA OBTENER DATOS DE AMBAS ESTACIONES ---
app.get('/api/viento', async (req, res) => {
  try {
    const urlBernal = `${BASE_API_URL}/${UUID_BERNAL}`;
    const urlBerazategui = `${BASE_API_URL}/${UUID_BERAZATEGUI}`;

    console.log(`Solicitando datos combinados de viento para Bernal y Berazategui...`);

    // Hacer ambas solicitudes en paralelo para mejorar el rendimiento
    const [responseBernal, responseBerazategui] = await Promise.allSettled([
      fetchJsonData(urlBernal),
      fetchJsonData(urlBerazategui)
    ]);

    // Procesar las respuestas
    let windDataBernal, windDataBerazategui;

    if (responseBernal.status === 'fulfilled') {
        windDataBernal = extractWindData(responseBernal.value, 'Bernal');
    } else {
        console.error('Error obteniendo datos de Bernal:', responseBernal.reason);
        windDataBernal = { error: `Error al obtener datos de Bernal: ${responseBernal.reason.message}`, estacion: 'Bernal' };
    }

    if (responseBerazategui.status === 'fulfilled') {
        windDataBerazategui = extractWindData(responseBerazategui.value, 'Berazategui');
    } else {
        console.error('Error obteniendo datos de Berazategui:', responseBerazategui.reason);
        windDataBerazategui = { error: `Error al obtener datos de Berazategui: ${responseBerazategui.reason.message}`, estacion: 'Berazategui' };
    }

    // Combinar resultados en un solo objeto
    const resultadoCombinado = {
        bernal: windDataBernal,
        berazategui: windDataBerazategui
    };

    return res.json(resultadoCombinado);

  } catch (error) {
    console.error('Error general en la ruta /api/viento:', error);
    return res.status(500).json({ error: 'Error interno del servidor al obtener datos combinados de viento.' });
  }
});
// --- FIN DE LA NUEVA RUTA ---

// --- RUTAS INDIVIDUALES (Opcionales) ---
app.get('/api/viento/bernal', async (req, res) => {
  try {
    const url = `${BASE_API_URL}/${UUID_BERNAL}`;
    const apiData = await fetchJsonData(url);
    const windData = extractWindData(apiData, 'Bernal');
    if (windData.error) return res.status(500).json(windData);
    return res.json(windData);
  } catch (error) {
    console.error('Error en la ruta /api/viento/bernal:', error);
    return res.status(500).json({ error: 'Error interno del servidor al obtener datos de Bernal.', estacion: 'Bernal' });
  }
});

app.get('/api/viento/berazategui', async (req, res) => {
  try {
    const url = `${BASE_API_URL}/${UUID_BERAZATEGUI}`;
    const apiData = await fetchJsonData(url);
    const windData = extractWindData(apiData, 'Berazategui');
    if (windData.error) return res.status(500).json(windData);
    return res.json(windData);
  } catch (error) {
    console.error('Error en la ruta /api/viento/berazategui:', error);
    return res.status(500).json({ error: 'Error interno del servidor al obtener datos de Berazategui.', estacion: 'Berazategui' });
  }
});
// --- FIN RUTAS INDIVIDUALES ---

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`API de viento Aysa corriendo en http://localhost:${PORT}`);
  console.log(` - Datos combinados: http://localhost:${PORT}/api/viento`);
  console.log(` - Datos de Bernal: http://localhost:${PORT}/api/viento/bernal`);
  console.log(` - Datos de Berazategui: http://localhost:${PORT}/api/viento/berazategui`);
});