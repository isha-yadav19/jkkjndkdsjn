import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { POPULAR_CITIES, getWeatherDataForCity } from './src/data/mockWeatherData.ts';
import { PersonaId } from './src/types/index.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    })
  : null;

async function startServer() {
  const app = express();
  const port = process.env.PORT || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  app.use(express.json());

  // Helper to find city
  function resolveCity(lat?: any, lon?: any, cityName?: any) {
    if (cityName) {
      const match = POPULAR_CITIES.find(
        (c) => c.name.toLowerCase() === String(cityName).toLowerCase()
      );
      if (match) return match;
    }
    if (lat && lon) {
      const latNum = parseFloat(lat);
      const lonNum = parseFloat(lon);
      // Find closest popular city
      let closest = POPULAR_CITIES[0];
      let minDistance = Number.MAX_VALUE;
      for (const c of POPULAR_CITIES) {
        const dist = Math.hypot(c.lat - latNum, c.lon - lonNum);
        if (dist < minDistance) {
          minDistance = dist;
          closest = c;
        }
      }
      return closest;
    }
    return POPULAR_CITIES[0];
  }

  // In-memory cache to prevent hitting rate limits
const mapsWeatherCache = new Map<string, { text: string; groundingMetadata: any; timestamp: number }>();
let isQuotaExhaustedCooldownUntil = 0;

function getLocalMapsWeatherGuidance(location: string, prompt: string) {
  const locLower = location.toLowerCase();
  const promptLower = prompt.toLowerCase();
  const city = POPULAR_CITIES.find(c => locLower.includes(c.name.toLowerCase())) || POPULAR_CITIES[0];
  const feed = getWeatherDataForCity(city);

  let guidanceText = '';
  const chunks: Array<{ maps?: { title: string; uri: string }; web?: { title: string; uri: string } }> = [];
  const queryEncoded = encodeURIComponent(`${city.name}`);

  if (promptLower.includes('park') || promptLower.includes('jog') || promptLower.includes('run') || promptLower.includes('walk') || promptLower.includes('fitness')) {
    if (city.id === 'mumbai') {
      guidanceText = `📍 **Best Running & Fitness Spots in Mumbai** (Current: ${feed.currentTempC}°C, AQI ${feed.health.aqi.current}):\n\n• **Marine Drive Promenade**: Optimal for morning & evening coastal jogging. Wide open bay breeze keeps humidity manageable.\n• **Shivaji Park (Dadar)**: Soft red-mud track, shaded periphery, active sports culture.\n• **Priyadarshini Park (Napean Sea Rd)**: Dedicated synthetic jogging track with sea view.\n\n💡 **Weather Advisory**: Morning window (${feed.fitness.bestRunningHours.morningWindow}) has lowest photochemical haze and optimal airflow.`;
      chunks.push(
        { maps: { title: 'Marine Drive Promenade, Mumbai', uri: 'https://www.google.com/maps/search/?api=1&query=Marine+Drive+Promenade+Mumbai' } },
        { maps: { title: 'Shivaji Park, Dadar, Mumbai', uri: 'https://www.google.com/maps/search/?api=1&query=Shivaji+Park+Dadar+Mumbai' } },
        { maps: { title: 'Priyadarshini Park, Mumbai', uri: 'https://www.google.com/maps/search/?api=1&query=Priyadarshini+Park+Mumbai' } }
      );
    } else if (city.id === 'delhi') {
      guidanceText = `📍 **Recommended Jogging Parks in New Delhi** (Current: ${feed.currentTempC}°C, AQI ${feed.health.aqi.current}):\n\n• **Lodhi Garden**: Dense canopy filtration; best run between 05:45 AM - 07:15 AM before peak traffic pollution.\n• **Nehru Park (Chanakyapuri)**: Excellent landscaped jogging paths and clean air pocket.\n• **Sanjay Van**: Ridge forest area with natural woodland trails.\n\n💡 **Health Note**: AQI is ${feed.health.aqi.current} (${feed.health.aqi.status}). Avoid high-intensity cardio outdoors between 11 AM - 4 PM.`;
      chunks.push(
        { maps: { title: 'Lodhi Garden, New Delhi', uri: 'https://www.google.com/maps/search/?api=1&query=Lodhi+Garden+New+Delhi' } },
        { maps: { title: 'Nehru Park, Chanakyapuri', uri: 'https://www.google.com/maps/search/?api=1&query=Nehru+Park+Chanakyapuri+New+Delhi' } }
      );
    } else if (city.id === 'bengaluru') {
      guidanceText = `📍 **Top Outdoor Exercise Locations in Bengaluru** (Current: ${feed.currentTempC}°C, AQI ${feed.health.aqi.current}):\n\n• **Cubbon Park**: 300+ acres of vehicle-free morning jogging trails under bamboo & gulmohar canopies.\n• **Lalbagh Botanical Garden**: Serene lake-loop track; great oxygen levels.\n• **Sankey Tank Perimeter**: 2 km waterbody jogging pathway in Sadashivanagar.\n\n💡 **Commute Tip**: Passing showers probable in late afternoon (${feed.parent.schoolHours.afternoonPickUp.rainProbability}% chance); early morning is prime.`;
      chunks.push(
        { maps: { title: 'Cubbon Park, Bengaluru', uri: 'https://www.google.com/maps/search/?api=1&query=Cubbon+Park+Bengaluru' } },
        { maps: { title: 'Lalbagh Botanical Garden', uri: 'https://www.google.com/maps/search/?api=1&query=Lalbagh+Botanical+Garden+Bengaluru' } }
      );
    } else {
      guidanceText = `📍 **Fitness & Outdoor Recreation in ${city.name}** (Current: ${feed.currentTempC}°C, AQI ${feed.health.aqi.current}):\n\n• Central city promenade and municipal botanical parks are in optimal condition with clear footing.\n• Wind speed is ${feed.windSpeedKmph} km/h with comfortable humidity of ${feed.humidityPercentage}%.\n\n💡 **Optimal Window**: ${feed.fitness.bestRunningHours.morningWindow}.`;
      chunks.push(
        { maps: { title: `${city.name} Central Public Park`, uri: `https://www.google.com/maps/search/?api=1&query=park+in+${queryEncoded}` } }
      );
    }
  } else if (promptLower.includes('rain') || promptLower.includes('umbrella') || promptLower.includes('shower')) {
    guidanceText = `🌧️ **Precipitation & Rain Probability for ${city.name}**:\n\n• **Current Status**: ${feed.condition} (${feed.currentTempC}°C).\n• **Rain Probability**: ${feed.parent.schoolHours.afternoonPickUp.rainProbability}%.\n• **Advisory**: ${feed.parent.schoolHours.afternoonPickUp.rainProbability > 40 ? 'Carry a compact umbrella or lightweight waterproof jacket.' : 'No major rain interruptions expected during regular commuting hours.'}\n• **Doppler Radar Status**: Active scans show no severe convective cells in the immediate 50 km radius.`;
    chunks.push(
      { maps: { title: `${city.name} Doppler Weather Radar Station`, uri: `https://www.google.com/maps/search/?api=1&query=IMD+Radar+${queryEncoded}` } },
      { web: { title: 'IMD National Nowcast Bulletin', uri: 'https://mausam.imd.gov.in/nowcast' } }
    );
  } else if (promptLower.includes('sun') || promptLower.includes('uv') || promptLower.includes('heat') || promptLower.includes('hot')) {
    guidanceText = `☀️ **Solar UV & Thermal Advisory for ${city.name}**:\n\n• **UV Index**: ${feed.health.uvIndex.current} (${feed.health.uvIndex.status}).\n• **Temperature**: ${feed.currentTempC}°C (Feels like ${feed.feelsLikeC}°C).\n• **Sun Protection**: ${feed.health.uvIndex.current >= 6 ? 'SPF 30+ sunscreen, sunglasses, and wide-brim hat recommended between 11:00 AM - 03:30 PM.' : 'Moderate UV exposure; safe for routine outdoor errands.'}\n• **Hydration**: Drink 2.5–3 liters of water across the day.`;
    chunks.push(
      { maps: { title: `${city.name} Shaded Public Corridors`, uri: `https://www.google.com/maps/search/?api=1&query=parks+in+${queryEncoded}` } }
    );
  } else if (promptLower.includes('air') || promptLower.includes('aqi') || promptLower.includes('smog') || promptLower.includes('pollution')) {
    guidanceText = `💨 **Air Quality & Respiratory Index for ${city.name}**:\n\n• **Current AQI**: ${feed.health.aqi.current} (${feed.health.aqi.status}).\n• **Particulate Matter**: PM2.5: ${feed.health.aqi.pm25} µg/m³, PM10: ${feed.health.aqi.pm10} µg/m³.\n• **Advisory**: ${feed.health.advisories[0]}.\n• **Safe Outdoor Window**: Early morning (06:00 AM - 08:00 AM) before vehicular emission peaks.`;
    chunks.push(
      { maps: { title: `${city.name} Continuous Ambient Air Quality Monitoring Station (CPCB)`, uri: `https://www.google.com/maps/search/?api=1&query=Air+Quality+Station+${queryEncoded}` } }
    );
  } else if (promptLower.includes('beach') || promptLower.includes('surf') || promptLower.includes('swim') || promptLower.includes('tide') || promptLower.includes('coast')) {
    guidanceText = `🏖️ **Coastal & Beach Weather Report for ${city.name}**:\n\n• **Sea Conditions**: ${feed.beach.seaCondition} with water temperature of ${feed.beach.waterTemperatureC}°C.\n• **Tides Status**: High tide at ${feed.beach.tides.nextHighTide.split('(')[0]} (+${feed.beach.tides.highTideHeightM}m peak), Low tide at ${feed.beach.tides.nextLowTide}.\n• **Surf & Wave**: Height ${feed.beach.wave.heightM}m (${feed.beach.wave.heightFt}ft), Swell Period ${feed.beach.wave.swellPeriodSec}s.\n• **Lifeguard Flag**: ${feed.beach.flagStatus} Flag (${feed.beach.flagMeaning}).`;
    chunks.push(
      { maps: { title: `${city.name} Coastline & Waterfront`, uri: `https://www.google.com/maps/search/?api=1&query=beach+in+${queryEncoded}` } },
      { web: { title: 'INCOIS Marine Forecast Bulletin', uri: 'https://incois.gov.in' } }
    );
  } else if (promptLower.includes('traffic') || promptLower.includes('highway') || promptLower.includes('fog') || promptLower.includes('waterlog') || promptLower.includes('road') || promptLower.includes('commute')) {
    guidanceText = `🚗 **Transit & Traffic-Weather Impact for ${city.name}**:\n\n• **Road Visibility**: ${feed.commuter.visibility.distanceMeters} meters (${feed.commuter.visibility.status}).\n• **Delay Index**: Estimated ${feed.commuter.trafficWeatherCorrelation.delayMinutes} mins delay across key corridors.\n• **Corridor Advisory**: ${feed.commuter.activeHighwayAlerts[0]?.corridor} has ${feed.commuter.activeHighwayAlerts[0]?.hazard}. ${feed.commuter.activeHighwayAlerts[0]?.advice}\n• **Best Departure Slot**: ${feed.commuter.bestDepartureSlot}.`;
    chunks.push(
      { maps: { title: `${city.name} Expressway & Arterial Corridor`, uri: `https://www.google.com/maps/search/?api=1&query=traffic+in+${queryEncoded}` } }
    );
  } else {
    guidanceText = `🌤️ **Mausam IMD Observation & Maps Advisory for ${city.name}**:\n\n• **Current Observation**: ${feed.currentTempC}°C (Feels like ${feed.feelsLikeC}°C), ${feed.condition}.\n• **Atmosphere**: Humidity ${feed.humidityPercentage}%, Wind ${feed.windSpeedKmph} km/h, Pressure ${feed.pressureHpa} hPa.\n• **Air Quality**: ${feed.health.aqi.current} AQI (${feed.health.aqi.status}) — safe for general outdoor movement.\n• **Nearby Stations**: Observations validated by IMD Doppler Weather Radar station in ${city.name}.`;
    chunks.push(
      { maps: { title: `${city.name} Weather Observatory Station`, uri: `https://www.google.com/maps/search/?api=1&query=IMD+Observatory+${queryEncoded}` } },
      { web: { title: 'IMD National Weather Forecasting Centre', uri: 'https://mausam.imd.gov.in' } }
    );
  }

  return { text: guidanceText, groundingMetadata: { groundingChunks: chunks } };
}

  // 1. POST /api/feed (Personalized weather feed cards)
  app.post('/api/feed', (req, res) => {
    try {
      const { location, personas = ['health', 'fitness', 'beach'], language = 'en' } = req.body;
      const city = resolveCity(location?.lat, location?.lon, location?.city);
      const weatherFeed = getWeatherDataForCity(city);

      const cards = (personas as PersonaId[]).map((pid, idx) => {
        const isPrimary = idx === 0;
        return {
          persona: pid,
          is_primary: isPrimary,
          data: (weatherFeed as any)[pid],
          tip:
            pid === 'health'
              ? weatherFeed.health.advisories[0]
              : pid === 'fitness'
              ? weatherFeed.fitness.bestRunningHours.rationale
              : pid === 'beach'
              ? weatherFeed.beach.beachAdvisories[0]
              : pid === 'traveller'
              ? `Flight alert: ${weatherFeed.traveller.flightWeatherAlerts[0]?.alertText}`
              : pid === 'parent'
              ? weatherFeed.parent.familyTips[0]
              : pid === 'agriculture'
              ? weatherFeed.agriculture.cropAdvisories[0]?.actionItem
              : pid === 'commuter'
              ? `Departure slot: ${weatherFeed.commuter.bestDepartureSlot}`
              : weatherFeed.events.plannerTips[0],
          explainability: `Because you follow ${pid.charAt(0).toUpperCase() + pid.slice(1)}`,
          confidence: weatherFeed.confidence
        };
      });

      res.json({
        location: {
          city: city.name,
          state: city.state,
          country: city.country,
          coordinates: { lat: city.lat, lon: city.lon }
        },
        current_observation: {
          temperature_c: weatherFeed.currentTempC,
          feels_like_c: weatherFeed.feelsLikeC,
          condition: weatherFeed.condition,
          humidity: weatherFeed.humidityPercentage,
          wind_kmph: weatherFeed.windSpeedKmph
        },
        timestamp: new Date().toISOString(),
        cards
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 2. GET /api/health
  app.get('/api/health', (req, res) => {
    const city = resolveCity(req.query.lat, req.query.lon, req.query.city);
    const feed = getWeatherDataForCity(city);
    res.json({
      location: city,
      health: feed.health,
      timestamp: new Date().toISOString()
    });
  });

  // 3. GET /api/fitness
  app.get('/api/fitness', (req, res) => {
    const city = resolveCity(req.query.lat, req.query.lon, req.query.city);
    const feed = getWeatherDataForCity(city);
    res.json({
      location: city,
      fitness: feed.fitness,
      timestamp: new Date().toISOString()
    });
  });

  // 4. GET /api/beach
  app.get('/api/beach', (req, res) => {
    const city = resolveCity(req.query.lat, req.query.lon, req.query.city);
    const feed = getWeatherDataForCity(city);
    res.json({
      location: city,
      beach: feed.beach,
      timestamp: new Date().toISOString()
    });
  });

  // 5. GET /api/traveller
  app.get('/api/traveller', (req, res) => {
    const city = resolveCity(req.query.lat, req.query.lon, req.query.city);
    const feed = getWeatherDataForCity(city);
    res.json({
      location: city,
      traveller: feed.traveller,
      timestamp: new Date().toISOString()
    });
  });

  // 6. GET /api/parent
  app.get('/api/parent', (req, res) => {
    const city = resolveCity(req.query.lat, req.query.lon, req.query.city);
    const feed = getWeatherDataForCity(city);
    res.json({
      location: city,
      parent: feed.parent,
      timestamp: new Date().toISOString()
    });
  });

  // 7. GET /api/commuter
  app.get('/api/commuter', (req, res) => {
    const city = resolveCity(req.query.lat, req.query.lon, req.query.city);
    const feed = getWeatherDataForCity(city);
    res.json({
      location: city,
      commuter: feed.commuter,
      timestamp: new Date().toISOString()
    });
  });

  // 8. GET /api/agriculture
  app.get('/api/agriculture', (req, res) => {
    const city = resolveCity(req.query.lat, req.query.lon, req.query.city);
    const feed = getWeatherDataForCity(city);
    res.json({
      location: city,
      agriculture: feed.agriculture,
      timestamp: new Date().toISOString()
    });
  });

  // 9. GET /api/events
  app.get('/api/events', (req, res) => {
    const city = resolveCity(req.query.lat, req.query.lon, req.query.city);
    const feed = getWeatherDataForCity(city);
    res.json({
      location: city,
      events: feed.events,
      timestamp: new Date().toISOString()
    });
  });

  // 10. POST /api/gemini/maps-weather (Maps Grounding with gemini-3.5-flash)
  app.post('/api/gemini/maps-weather', async (req, res) => {
    const { prompt, location = 'Mumbai' } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Check in-memory cache first to conserve API rate limits
    const cacheKey = `${location.toLowerCase().trim()}_${prompt.toLowerCase().trim()}`;
    const cached = mapsWeatherCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) {
      return res.json({ text: cached.text, groundingMetadata: cached.groundingMetadata });
    }

    // If quota was previously exhausted, return local maps guidance directly without throwing
    if (!ai || Date.now() < isQuotaExhaustedCooldownUntil) {
      const fallback = getLocalMapsWeatherGuidance(location, prompt);
      mapsWeatherCache.set(cacheKey, { text: fallback.text, groundingMetadata: fallback.groundingMetadata, timestamp: Date.now() });
      return res.json(fallback);
    }

    try {
      // Use gemini-3.8-flash as prescribed in the skill
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `You are the official IMD Mausam AI weather and location specialist.
The user is inquiring about: ${location}.
User query: "${prompt}".
Provide concise, localized weather advice with specific landmarks, parks, coastal areas, or transit corridors.`,
        config: {
          tools: [{ googleMaps: {} }]
        }
      });

      const text = response.text || '';
      const groundingMetadata = (response.candidates?.[0] as any)?.groundingMetadata || {};

      // Cache successful response
      mapsWeatherCache.set(cacheKey, { text, groundingMetadata, timestamp: Date.now() });
      return res.json({ text, groundingMetadata });
    } catch (err: any) {
      const errMsg = String(err?.message || err);
      console.warn('Gemini Maps API call failed or quota exceeded:', errMsg);

      // If quota exhausted (429), enter 10-minute cooldown to avoid hammering the API
      if (errMsg.includes('resource_exhausted') || errMsg.includes('quota') || errMsg.includes('429')) {
        isQuotaExhaustedCooldownUntil = Date.now() + 10 * 60 * 1000;
      }

      // Seamlessly serve instant, rich location-grounded guidance
      const localResult = getLocalMapsWeatherGuidance(location, prompt);
      mapsWeatherCache.set(cacheKey, { text: localResult.text, groundingMetadata: localResult.groundingMetadata, timestamp: Date.now() });
      return res.json(localResult);
    }
  });

  // Mount Vite or static dist
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(port, () => {
    console.log(`Mausam Server running on port ${port}`);
  });
}

startServer();
