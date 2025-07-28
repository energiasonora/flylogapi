const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');

const app = express();

// Helper function to get data from a URL
async function fetchData(url) {
  const agent = new https.Agent({ rejectUnauthorized: false });
  const { data } = await axios.get(url, { httpsAgent: agent });
  return cheerio.load(data);
}

// Extract common data like fecha and hora
function extractCommonData($) {
  let fecha = '';
  let hora = '';
  $('div.variable table tr td').each((i, el) => {
    const text = $(el).text().trim();
    if (text.startsWith('FECHA:')) {
      fecha = text.replace('FECHA:', '').trim();
    }
    if (text.startsWith('HORA:')) {
      hora = text.replace('HORA:', '').trim();
    }
  });
  return { fecha, hora };
}

// Extract temperatura
function extractTemperatura($) {
  return {
    actual: $('.tabla .actual').first().text().trim(),
    minima_diaria: $('.tabla tr').eq(3).find('td').eq(1).text().trim(),
    maxima_diaria: $('.tabla tr').eq(3).find('td').eq(2).text().trim(),
    hora_minima: $('.tabla tr').eq(4).find('td').eq(1).text().trim(),
    hora_maxima: $('.tabla tr').eq(4).find('td').eq(2).text().trim()
  };
}

// Extract humedad
function extractHumedad($) {
  return {
    actual: $('.tabla').eq(1).find('.actual').first().text().trim(),
    minima_diaria: $('.tabla').eq(1).find('tr').eq(3).find('td').eq(1).text().trim(),
    maxima_diaria: $('.tabla').eq(1).find('tr').eq(3).find('td').eq(2).text().trim(),
    hora_minima: $('.tabla').eq(1).find('tr').eq(4).find('td').eq(1).text().trim(),
    hora_maxima: $('.tabla').eq(1).find('tr').eq(4).find('td').eq(2).text().trim()
  };
}

// Extract punto de rocío
function extractPuntoRocio($) {
  return {
    actual: $('.tabla').eq(2).find('.actual').first().text().trim()
  };
}

// Extract sensación térmica

function extractSensacionTermica($) {
  const $tabla = $('.variable').filter(function() {
    return $(this).find('.nombre').text().trim() === 'Sensación térmica';
  }).find('.tabla');

  const temperatura_y_viento = $tabla.find('tr').eq(0).find('td').eq(2).text().trim();
  const temperatura_y_humedad = $tabla.find('tr').eq(2).find('td').eq(2).text().trim();

  return { temperatura_y_viento, temperatura_y_humedad };
}
// function extractSensacionTermica($) {
//   return {
//     temperatura_y_viento: $('.tabla').eq(3).find('.actual').first().text().trim(),
//     temperatura_y_humedad: $('.tabla').eq(4).find('.actual').first().text().trim()
//   };
// }

// Extract presión
function extractPresion($) {
  const $tabla = $('.variable').filter(function() {
    return $(this).find('.nombre').text().trim() === 'Presión barométrica';
  }).find('.tabla');

  const actual = $tabla.find('.actual').text().trim();
  return { actual };
}
// function extractPresion($) {
//   return {
//     actual: $('.tabla').eq(5).find('.actual').first().text().trim()
//   };
// }

// Extract lluvia
function extractLluvia($) {
  const $tabla = $('.variable').filter(function() {
    return $(this).find('.nombre').text().trim() === 'Lluvia';
  }).find('.tabla');

  const diaria = $tabla.find('tr').eq(0).find('td').eq(1).text().trim();
  const intensidad = $tabla.find('tr').eq(1).find('td').eq(1).text().trim();

  return { diaria, intensidad };
}
// function extractLluvia($) {
//   return {
//     diaria: $('.tabla').eq(6).find('td').eq(1).text().trim(),
//     intensidad: $('.tabla').eq(6).find('td').eq(3).text().trim()
//   };
// }

// Extract viento from torre.htm
function extractViento($) {
  const $tabla = $('.variable').filter(function () {
    return $(this).find('.nombre').text().trim() === 'Viento';
  }).find('table.valores');

  if (!$tabla.length) {
    return {
      velocidad_actual: '',
      racha_maxima: '',
      direccion: ''
    };
  }

  const velocidad_actual = $tabla.find('tr').eq(0).find('td').eq(1).text().trim();
  const direccion = $tabla.find('tr').eq(1).find('td').eq(1).text().trim();
  const racha_maxima = $tabla.find('tr').eq(3).find('td').eq(1).text().trim();

  return {
    velocidad_actual,
    racha_maxima,
    direccion
  };
}
// function extractViento($) {
//   const $tabla = $('.variable').first().find('.tabla'); // Viento section has only one .tabla

//   const velocidad_actual = $tabla.find('.actual').first().text().trim();
//   const racha_maxima = $tabla.find('tr').eq(1).find('td').eq(1).text().trim();
//   const direccion = $tabla.find('tr').eq(2).find('td').eq(1).text().trim();

//   return { velocidad_actual, racha_maxima, direccion };
// }
// function extractViento($) {
//   return {
//     velocidad_actual: $('.tabla .actual').first().text().trim(),
//     racha_maxima: $('.tabla tr').eq(1).find('td').eq(1).text().trim(),
//     direccion: $('.tabla tr').eq(2).find('td').eq(1).text().trim()
//   };
// }

// Main route
app.get('/api/clima', async (req, res) => {
  try {
    const campoURL = 'https://meteo.fcaglp.unlp.edu.ar/davis/campo/campo.htm ';
    const torreURL = 'https://meteo.fcaglp.unlp.edu.ar/davis/torre/torre.htm ';

    const [$campo, $torre] = await Promise.all([
      fetchData(campoURL),
      fetchData(torreURL)
    ]);

    const { fecha, hora } = extractCommonData($campo);

    const clima = {
      fecha,
      hora,
      temperatura: extractTemperatura($campo),
      humedad: extractHumedad($campo),
      punto_rocio: extractPuntoRocio($campo),
      sensacion_termica: extractSensacionTermica($campo),
      presion: extractPresion($campo),
      lluvia: extractLluvia($campo),
      viento: extractViento($torre)
    };

    res.json(clima);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudieron obtener los datos meteorológicos' });
  }
});

app.listen(3000, () => {
  console.log('API corriendo en http://localhost:3000/api/clima');
});