/* =========================================================
   Prato Nevoso Live — app.js
   Vanilla JS. No build step, no dependencies.
   ========================================================= */
(() => {
  'use strict';

  /* ── Configuration ──────────────────────────────────────
     Change these values to adapt the page to another place.
     ─────────────────────────────────────────────────────── */
  const LOCATION = {
    name: 'Prato Nevoso',
    lat: 44.256097,
    lng: 7.792604,
    altitude: 1500,
    timezone: 'Europe/Rome',
    locale: 'it-IT'
  };

  const WEATHER_API = 'https://api.open-meteo.com/v1/forecast';
  const CACHE_KEY = 'pn-live-weather-v1';
  const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

  const state = {
    weather: null,
    webcams: [],
    lastFocus: null,
    frameTimer: null,
    loadingWeather: false,
    lastWeatherFetch: null
  };

  /* ── Small helpers ─────────────────────────────────────── */
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));

  const cap = (value) => value ? value.charAt(0).toUpperCase() + value.slice(1) : '';

  const isImageUrl = (url) => /\.(jpe?g|png|gif|webp|avif|bmp|svg)(\?|#|$)/i.test(url);

  const withCacheBuster = (url, param) => {
    if (!param) return url;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}${encodeURIComponent(param)}=${Date.now()}`;
  };

  const withThumbBuster = (url, forced = null) => {
    if (!url) return url;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}t=${forced ?? Math.floor(Date.now() / 300000)}`;
  };

  const round = (value) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
    return Math.round(Number(value));
  };

  const temp = (value) => {
    const n = round(value);
    return n === null ? '—' : `${n}°`;
  };

  const mm = (value) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    const n = Number(value);
    return n === 0 ? '0 mm' : `${n < 1 ? n.toFixed(1) : Math.round(n)} mm`;
  };

  const snowDepth = (metres) => {
    if (metres === null || metres === undefined || Number.isNaN(Number(metres))) return '—';
    const cm = Math.round(Number(metres) * 100);
    if (cm > 0) return `${cm} cm`;
    return Number(metres) > 0 ? '<1 cm' : '0 cm';
  };

  const snowAmount = (cm) => {
    if (!cm) return '';
    const n = Number(cm);
    return n < 1 ? '<1 cm' : `${Math.round(n)} cm`;
  };

  const cardinal = (degrees) => {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    if (degrees === null || degrees === undefined) return '';
    return dirs[Math.round(Number(degrees) / 45) % 8];
  };

  const uvLabel = (value) => {
    if (value === null || value === undefined) return '';
    if (value < 3) return 'Basso';
    if (value < 6) return 'Moderato';
    if (value < 8) return 'Alto';
    if (value < 11) return 'Molto alto';
    return 'Estremo';
  };

  /* ── Date / time (always in the resort timezone) ───────── */
  const clockFormatter = new Intl.DateTimeFormat(LOCATION.locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: LOCATION.timezone
  });

  const dateFormatter = new Intl.DateTimeFormat(LOCATION.locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: LOCATION.timezone
  });

  const sliceTime = (iso) => (iso && iso.length >= 16 ? iso.slice(11, 16) : '--:--');

  const dateFromIso = (iso) => {
    const parts = String(iso || '').slice(0, 10).split('-').map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return new Date();
    return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
  };

  const weekdayShort = (iso) => dateFromIso(iso).toLocaleDateString(LOCATION.locale, { weekday: 'short' }).replace('.', '');

  const dayLabel = (iso, index) => {
    if (index === 0) return 'Oggi';
    if (index === 1) return 'Domani';
    return cap(weekdayShort(iso));
  };

  const dateShort = (iso) => dateFromIso(iso).toLocaleDateString(LOCATION.locale, { day: 'numeric', month: 'short' }).replace('.', '');

  const todayLong = () => cap(dateFormatter.format(new Date()));

  const updateClock = () => {
    const now = clockFormatter.format(new Date());
    const headerClock = $('#clock');
    const heroClock = $('#nowClock');
    if (headerClock) headerClock.textContent = now;
    if (heroClock) heroClock.textContent = now;
  };

  /* ── Weather icons (inline SVG, stroke style) ──────────── */
  const svg = (content) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${content}</svg>`;

  const ICONS = {
    sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    moon: svg('<path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z"/>'),
    partlyDay: svg('<circle cx="8.5" cy="8.5" r="3"/><path d="M8.5 3v1.5M3 8.5h1.5M4.6 4.6l1.1 1.1M12.4 4.6l-1.1 1.1"/><path d="M9 20a4 4 0 0 1 .3-8 5 5 0 0 1 9.5 1.6A3.2 3.2 0 0 1 18.5 20Z"/>'),
    partlyNight: svg('<path d="M18.5 3.5a6.8 6.8 0 0 1-8 8.6A7 7 0 1 0 18.5 3.5Z"/><path d="M9 20a4 4 0 0 1 .3-8 5 5 0 0 1 9.5 1.6A3.2 3.2 0 0 1 18.5 20Z"/>'),
    cloud: svg('<path d="M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24"/>'),
    fog: svg('<path d="M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24"/><path d="M6 18h12M8 21h8"/>'),
    drizzle: svg('<path d="M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24"/><path d="M8 18v1M12 18v1M16 18v1"/>'),
    rain: svg('<path d="M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24"/><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3"/>'),
    snow: svg('<path d="M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24"/><path d="M8 18v2M7.1 18.6l1.8 1.8M8.9 18.6l-1.8 1.8M16 18v2M15.1 18.6l1.8 1.8M16.9 18.6l-1.8 1.8"/>'),
    thunder: svg('<path d="M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24"/><path d="m13 15-3 5h4l-2 4"/>'),
    wind: svg('<path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h15a3 3 0 1 1-3 3"/><path d="M3 16h7"/>'),
    droplet: svg('<path d="M12 2.5c-3 5-7 9.5-7 13a7 7 0 0 0 14 0c0-3.5-4-8-7-13z"/>'),
    snowflake: svg('<path d="M12 2v20M4.5 6.5l15 11M19.5 6.5l-15 11"/><path d="M9 4l3 2 3-2M9 20l3-2 3 2M4.5 10.5 8 12l-3.5 1.5M19.5 10.5 16 12l3.5 1.5"/>'),
    thermo: svg('<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0Z"/>'),
    sunrise: svg('<path d="M12 3v4M5.6 6.6l2.8 2.8M3 13h4M17 13h4M15.6 9.4l2.8-2.8"/><path d="M6 17a6 6 0 0 1 12 0"/><path d="M2 21h20"/>'),
    sunset: svg('<path d="M12 9V5M5.6 10.6l2.8-2.8M3 17h4M17 17h4M15.6 7.8l2.8 2.8"/><path d="M6 21a6 6 0 0 1 12 0"/><path d="M2 17h20"/>'),
    camera: svg('<rect x="2.5" y="6" width="19" height="14" rx="3"/><circle cx="12" cy="13" r="4"/><path d="M8 6l1.5-2h5L16 6"/>'),
    expand: svg('<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/>'),
    external: svg('<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5"/>'),
    globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>'),
    instagram: svg('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>'),
    facebook: svg('<path d="M14 21v-8h2.5l.5-3H14V8.2c0-.9.3-1.7 1.8-1.7H17V4.1C16.6 4 15.5 4 14.3 4 11.8 4 10 5.4 10 8v2H7v3h3v8"/>'),
    telegram: svg('<path d="m21 4-3 15-6-4-3 3 .5-5L19 6 8 13l-4-1.5Z"/>'),
    youtube: svg('<rect x="2.5" y="5" width="19" height="14" rx="4"/><path d="m10 9 5 3-5 3Z" fill="currentColor" stroke="none"/>'),
    tiktok: svg('<path d="M15.5 3.5v13a4 4 0 1 1-4-4"/><path d="M15.5 7.2c1.2 2.6 3.2 4 6 4.3"/>')
  };

  const weatherInfo = (code, isDay = 1) => {
    const day = Number(isDay) !== 0;
    if (code === 0) return { label: 'Sereno', icon: day ? ICONS.sun : ICONS.moon };
    if (code === 1) return { label: 'Poco nuvoloso', icon: day ? ICONS.partlyDay : ICONS.partlyNight };
    if (code === 2) return { label: 'Parzialmente nuvoloso', icon: day ? ICONS.partlyDay : ICONS.partlyNight };
    if (code === 3) return { label: 'Nuvoloso', icon: ICONS.cloud };
    if (code === 45 || code === 48) return { label: 'Nebbia', icon: ICONS.fog };
    if (code >= 51 && code <= 57) return { label: 'Pioviggine', icon: ICONS.drizzle };
    if (code >= 61 && code <= 67) return { label: 'Pioggia', icon: ICONS.rain };
    if (code >= 71 && code <= 77) return { label: 'Neve', icon: ICONS.snow };
    if (code >= 80 && code <= 82) return { label: 'Rovesci', icon: ICONS.rain };
    if (code >= 85 && code <= 86) return { label: 'Rovesci di neve', icon: ICONS.snow };
    if (code >= 95) return { label: 'Temporale', icon: ICONS.thunder };
    return { label: 'Variabile', icon: ICONS.cloud };
  };

  /* ── Weather data ──────────────────────────────────────── */
  const weatherUrl = () => {
    const params = new URLSearchParams({
      latitude: String(LOCATION.lat),
      longitude: String(LOCATION.lng),
      current: [
        'temperature_2m',
        'relative_humidity_2m',
        'apparent_temperature',
        'is_day',
        'precipitation',
        'rain',
        'snowfall',
        'weather_code',
        'cloud_cover',
        'wind_speed_10m',
        'wind_direction_10m',
        'snow_depth'
      ].join(','),
      daily: [
        'weather_code',
        'temperature_2m_max',
        'temperature_2m_min',
        'sunrise',
        'sunset',
        'daylight_duration',
        'precipitation_sum',
        'rain_sum',
        'snowfall_sum',
        'precipitation_probability_max',
        'wind_speed_10m_max',
        'uv_index_max'
      ].join(','),
      hourly: ['temperature_2m', 'weather_code', 'precipitation_probability', 'snowfall', 'is_day'].join(','),
      timezone: LOCATION.timezone,
      forecast_days: '7'
    });
    return `${WEATHER_API}?${params.toString()}`;
  };

  const readCache = (maxAge = CACHE_TTL) => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.data || !parsed.ts) return null;
      if (maxAge !== Infinity && Date.now() - parsed.ts > maxAge) return null;
      return parsed;
    } catch (error) {
      return null;
    }
  };

  const writeCache = (data) => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
    } catch (error) {
      /* localStorage may be unavailable or full: the page still works. */
    }
  };

  const setWeatherLoading = (loading) => {
    const button = $('#refreshWeather');
    if (!button) return;
    button.classList.toggle('is-loading', loading);
    if (loading) button.setAttribute('disabled', '');
    else button.removeAttribute('disabled');
  };

  const loadWeather = async (force = false) => {
    if (state.loadingWeather) return;

    if (!force) {
      const cached = readCache();
      if (cached) {
        state.weather = cached.data;
        renderWeather(cached.data, { cached: true });
        return;
      }
    }

    state.loadingWeather = true;
    setWeatherLoading(true);

    try {
      const response = await fetch(weatherUrl(), { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!data || !data.current || !data.daily) throw new Error('Invalid weather payload');
      state.weather = data;
      state.lastWeatherFetch = Date.now();
      writeCache(data);
      renderWeather(data, { cached: false });
    } catch (error) {
      const stale = readCache(Infinity);
      if (stale) {
        state.weather = stale.data;
        renderWeather(stale.data, { cached: true, stale: true });
      } else {
        renderWeatherError();
      }
    } finally {
      state.loadingWeather = false;
      setWeatherLoading(false);
    }
  };

  const renderWeather = (data, meta = {}) => {
    const current = data.current;
    const daily = data.daily;
    const info = weatherInfo(current.weather_code, current.is_day);
    const stamp = sliceTime(current.time);

    const nowIcon = $('#nowIcon');
    const nowTemp = $('#nowTemp');
    const nowCond = $('#nowCond');
    const nowRange = $('#nowRange');
    const nowFeels = $('#nowFeels');
    const nowWind = $('#nowWind');
    const nowSnow = $('#nowSnow');
    const nowUpdated = $('#nowUpdated');

    if (nowIcon) nowIcon.innerHTML = info.icon;
    if (nowTemp) nowTemp.textContent = round(current.temperature_2m) ?? '--';
    if (nowCond) nowCond.textContent = info.label;
    if (nowRange) nowRange.textContent = `Max ${temp(daily.temperature_2m_max?.[0])} · Min ${temp(daily.temperature_2m_min?.[0])}`;
    if (nowFeels) nowFeels.textContent = temp(current.apparent_temperature);
    if (nowWind) nowWind.textContent = `${round(current.wind_speed_10m) ?? 0} km/h`;
    if (nowSnow) nowSnow.textContent = snowDepth(current.snow_depth);
    if (nowUpdated) {
      nowUpdated.textContent = meta.stale
        ? `Dati non aggiornati · ${stamp}`
        : meta.cached
          ? `Cache · ${stamp}`
          : `Open-Meteo · ${stamp}`;
    }

    const wbIcon = $('#wbIcon');
    const wbTemp = $('#wbTemp');
    const wbCond = $('#wbCond');
    const wbRange = $('#wbRange');
    const wbDate = $('#wbDate');
    const wbUpdated = $('#wbUpdated');

    if (wbIcon) wbIcon.innerHTML = info.icon;
    if (wbTemp) wbTemp.textContent = round(current.temperature_2m) ?? '--';
    if (wbCond) wbCond.textContent = info.label;
    if (wbRange) wbRange.textContent = `Max ${temp(daily.temperature_2m_max?.[0])} · Min ${temp(daily.temperature_2m_min?.[0])}`;
    if (wbDate) wbDate.textContent = todayLong();
    if (wbUpdated) {
      wbUpdated.textContent = meta.stale
        ? `Dati non aggiornati · ${stamp}`
        : meta.cached
          ? `Dati in cache · ${stamp}`
          : `Aggiornato alle ${stamp}`;
    }

    renderFacts(data);
    renderSun(daily);
    renderForecast(daily);
    renderHourly(data);
  };

  const fact = (label, value, icon) =>
    `<div class="wb-fact"><dt>${icon}${escapeHtml(label)}</dt><dd>${value}</dd></div>`;

  const renderFacts = (data) => {
    const current = data.current;
    const daily = data.daily;
    const container = $('#wbFacts');
    if (!container) return;

    const rain = daily.precipitation_sum?.[0] ?? 0;
    const probability = daily.precipitation_probability_max?.[0] ?? 0;
    const uv = daily.uv_index_max?.[0];
    const wind = `${round(current.wind_speed_10m) ?? 0} km/h${current.wind_direction_10m !== undefined ? ` <span class="sub">${escapeHtml(cardinal(current.wind_direction_10m))}</span>` : ''}`;
    const precipitation = `${mm(rain)}${probability ? ` <span class="sub">${Math.round(probability)}%</span>` : ''}`;
    const uvValue = uv === null || uv === undefined
      ? '—'
      : `${Number(uv).toFixed(1).replace('.0', '')} <span class="sub">${escapeHtml(uvLabel(uv))}</span>`;

    container.innerHTML = [
      fact('Percepita', temp(current.apparent_temperature), ICONS.thermo),
      fact('Umidità', `${round(current.relative_humidity_2m) ?? '—'}%`, ICONS.droplet),
      fact('Vento', wind, ICONS.wind),
      fact('Neve al suolo', snowDepth(current.snow_depth), ICONS.snowflake),
      fact('Precipitazioni', precipitation, ICONS.rain),
      fact('Indice UV', uvValue, ICONS.sun)
    ].join('');
  };

  const renderSun = (daily) => {
    const sunrise = $('#sunrise');
    const sunset = $('#sunset');
    const daylight = $('#daylight');
    if (sunrise) sunrise.textContent = sliceTime(daily.sunrise?.[0]);
    if (sunset) sunset.textContent = sliceTime(daily.sunset?.[0]);
    if (daylight) {
      const seconds = daily.daylight_duration?.[0];
      if (seconds === null || seconds === undefined) {
        daylight.textContent = '—';
      } else {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.round((seconds % 3600) / 60);
        daylight.textContent = `${hours}h ${String(minutes).padStart(2, '0')}m`;
      }
    }
  };

  const renderForecast = (daily) => {
    const container = $('#forecast');
    if (!container || !daily?.time) return;

    container.innerHTML = daily.time.map((iso, index) => {
      const info = weatherInfo(daily.weather_code?.[index], 1);
      const probability = daily.precipitation_probability_max?.[index] ?? 0;
      const snow = daily.snowfall_sum?.[index] ?? 0;
      const rainLine = probability > 0
        ? `<span class="fc-rain">${ICONS.droplet}${Math.round(probability)}%</span>`
        : '';
      const snowLine = snow > 0
        ? `<span class="fc-snow">${ICONS.snowflake}${snowAmount(snow)}</span>`
        : '';
      return `<div class="fc" title="${escapeHtml(info.label)}">
        <span class="fc-day">${escapeHtml(dayLabel(iso, index))}</span>
        <span class="fc-date">${escapeHtml(dateShort(iso))}</span>
        <span class="fc-icon" aria-hidden="true">${info.icon}</span>
        <span class="fc-temps"><span class="fc-max">${temp(daily.temperature_2m_max?.[index])}</span><span class="fc-min">${temp(daily.temperature_2m_min?.[index])}</span></span>
        ${rainLine}${snowLine}
      </div>`;
    }).join('');
  };

  const renderHourly = (data) => {
    const container = $('#hourly');
    const hourly = data.hourly;
    if (!container || !hourly?.time) return;

    const currentHour = `${String(data.current?.time || '').slice(0, 13)}:00`;
    let start = hourly.time.findIndex((time) => time >= currentHour);
    if (start < 0) start = 0;
    const end = Math.min(start + 12, hourly.time.length);

    const items = [];
    for (let index = start; index < end; index += 1) {
      const info = weatherInfo(hourly.weather_code?.[index], hourly.is_day?.[index] ?? 1);
      const probability = hourly.precipitation_probability?.[index] ?? 0;
      items.push(`<div class="hr" title="${escapeHtml(info.label)}">
        <span class="hr-time">${escapeHtml(sliceTime(hourly.time[index]))}</span>
        <span class="hr-icon" aria-hidden="true">${info.icon}</span>
        <span class="hr-temp">${temp(hourly.temperature_2m?.[index])}</span>
        ${probability > 0 ? `<span class="hr-rain">${ICONS.droplet}${Math.round(probability)}%</span>` : ''}
      </div>`);
    }
    container.innerHTML = items.join('');
  };

  const renderWeatherError = () => {
    const nowCond = $('#nowCond');
    const nowTemp = $('#nowTemp');
    const nowRange = $('#nowRange');
    const wbCond = $('#wbCond');
    const wbTemp = $('#wbTemp');
    const wbRange = $('#wbRange');
    const wbUpdated = $('#wbUpdated');
    const nowUpdated = $('#nowUpdated');

    if (nowCond) nowCond.textContent = 'Dati non disponibili';
    if (nowTemp) nowTemp.textContent = '--';
    if (nowRange) nowRange.textContent = 'Riprova tra poco';
    if (wbCond) wbCond.textContent = 'Dati non disponibili';
    if (wbTemp) wbTemp.textContent = '--';
    if (wbRange) wbRange.textContent = 'Nessuna connessione';
    if (nowUpdated) nowUpdated.textContent = 'Open-Meteo';
    if (wbUpdated) wbUpdated.textContent = 'Dati non disponibili';

    const forecast = $('#forecast');
    if (forecast) {
      forecast.innerHTML = `<div class="weather-error"><strong>Previsioni non disponibili</strong>Controlla la connessione e riprova.<button type="button" data-retry="weather">Riprova</button></div>`;
    }
    const hourly = $('#hourly');
    if (hourly) hourly.innerHTML = '';
  };

  /* ── Periodic refresh & return-to-foreground ──────────── */
  // Weather and thumbnails refresh dynamically about every minute while
  // the page is open, and immediately when the page regains visibility
  // (e.g. reopening the iOS home-screen "app").
  const REFRESH_INTERVAL = 60 * 1000; // 1 minute

  const refreshThumbs = () => {
    if (document.visibilityState !== 'visible') return;
    $$('#webcamGrid .cam-media img').forEach((image) => {
      const base = image.dataset.thumb;
      if (!base) return;
      if (image.closest('.cam-media')?.classList.contains('is-missing')) return;
      image.src = withThumbBuster(base, Date.now());
    });
  };

  const refreshContent = () => {
    if (document.visibilityState !== 'visible') return;
    if (!state.lastWeatherFetch || Date.now() - state.lastWeatherFetch >= REFRESH_INTERVAL) {
      loadWeather(true);
    }
    refreshThumbs();
  };

  const initAutorefresh = () => {
    setInterval(refreshContent, REFRESH_INTERVAL);
    document.addEventListener('visibilitychange', () => {
      // Firing on foreground: coming back to the app / tab.
      if (document.visibilityState === 'visible') refreshContent();
    });
    window.addEventListener('focus', () => refreshContent());
  };

  /* ── Webcams ───────────────────────────────────────────── */
  const fetchJson = async (url) => {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  };

  const loadWebcams = async () => {
    const grid = $('#webcamGrid');
    if (!grid) return;
    try {
      const list = await fetchJson('data/webcams.json');
      state.webcams = (Array.isArray(list) ? list : []).filter((item) => item.enabled !== false);
      renderWebcams();
      openDeepLinkWebcam();
    } catch (error) {
      const hint = window.location.protocol === 'file:'
        ? 'Apri la pagina con un server locale (vedi README).'
        : 'Controlla la connessione.';
      grid.innerHTML = `<div class="list-error">Impossibile caricare le webcam. ${hint} <button type="button" data-retry="webcams">Riprova</button></div>`;
    }
  };

  const renderWebcams = () => {
    const grid = $('#webcamGrid');
    if (!grid) return;
    if (!state.webcams.length) {
      grid.innerHTML = '<div class="list-error">Nessuna webcam disponibile al momento.</div>';
      return;
    }

    grid.innerHTML = state.webcams.map((webcam, index) => {
      const thumb = webcam.thumb ? withThumbBuster(webcam.thumb) : '';
      const fallback = webcam.thumbFallback ? withThumbBuster(webcam.thumbFallback) : '';
      const credit = webcam.credit
        ? `<a class="cam-credit" href="${escapeHtml(webcam.creditUrl || '#')}" target="_blank" rel="noopener noreferrer" data-credit>${escapeHtml(webcam.credit)}</a>`
        : '';
      return `<article class="cam" data-index="${index}">
        <div class="cam-media">
          ${thumb ? `<img src="${escapeHtml(thumb)}" data-thumb="${escapeHtml(webcam.thumb)}" alt="Anteprima della webcam ${escapeHtml(webcam.label || '')}" loading="lazy" referrerpolicy="no-referrer" data-fallback="${escapeHtml(fallback)}">` : ''}
          <div class="cam-fallback" aria-hidden="true">${ICONS.camera}<span>Anteprima non disponibile</span></div>
          <span class="cam-live"><span class="live-dot"></span>Live</span>
          <span class="cam-open" aria-hidden="true">${ICONS.expand}</span>
          <button class="cam-hit" type="button" aria-label="Apri la webcam ${escapeHtml(webcam.label || '')} a tutto schermo"></button>
        </div>
        <div class="cam-info">
          <div class="cam-copy">
            <h3 class="cam-title">${escapeHtml(webcam.label || 'Webcam')}</h3>
            ${webcam.desc ? `<p class="cam-desc">${escapeHtml(webcam.desc)}</p>` : ''}
          </div>
          ${credit}
        </div>
      </article>`;
    }).join('');

    $$('.cam-media img', grid).forEach((image) => {
      image.addEventListener('error', () => {
        const fallback = image.dataset.fallback;
        if (fallback && image.src !== fallback) {
          image.src = fallback;
          image.removeAttribute('data-fallback');
          return;
        }
        image.closest('.cam-media')?.classList.add('is-missing');
      });
    });
  };

  /* ── Webcam modal ──────────────────────────────────────── */
  const openDeepLinkWebcam = () => {
    if (!state.webcams.length) return;
    const match = window.location.hash.match(/^#webcam-(\d+)$/);
    if (!match) return;
    const index = parseInt(match[1], 10);
    if (state.webcams[index]) openCam(index);
  };

  const modal = () => $('#camModal');
  const frame = () => $('#camFrame');
  const image = () => $('#camImage');
  const html = () => $('#camHtml');
  const loader = () => $('#camLoader');

  const resetStage = () => {
    const iframe = frame();
    const picture = image();
    const htmlBox = html();
    const loading = loader();

    if (iframe) {
      iframe.onload = null;
      iframe.style.display = 'none';
      iframe.src = 'about:blank';
    }
    if (picture) {
      picture.onload = null;
      picture.onerror = null;
      picture.style.display = 'none';
      picture.removeAttribute('src');
    }
    if (htmlBox) {
      htmlBox.innerHTML = '';
      htmlBox.style.display = 'none';
    }
    if (loading) loading.style.display = 'none';
    clearTimeout(state.frameTimer);
  };

  const showModalError = (message) => {
    const loading = loader();
    if (!loading) return;
    loading.style.display = 'grid';
    loading.innerHTML = `<div class="modal-error">${escapeHtml(message)}</div>`;
  };

  const openCam = (index) => {
    const webcam = state.webcams[index];
    const overlay = modal();
    if (!webcam || !overlay) return;

    state.lastFocus = document.activeElement;

    const title = $('#camTitle');
    const credit = $('#camCredit');
    const external = $('#camExternal');
    if (title) title.textContent = webcam.label || 'Webcam';
    if (credit) {
      credit.innerHTML = webcam.credit
        ? `Fonte: ${webcam.creditUrl ? `<a href="${escapeHtml(webcam.creditUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(webcam.credit)}</a>` : escapeHtml(webcam.credit)}`
        : '';
    }
    if (external) {
      external.href = webcam.creditUrl || (isImageUrl(String(webcam.embed || '')) ? webcam.embed : '#');
      external.style.display = webcam.creditUrl || isImageUrl(String(webcam.embed || '')) ? '' : 'none';
    }

    resetStage();
    const content = String(webcam.embed || '').trim();
    const loading = loader();
    if (loading) {
      loading.innerHTML = '<span class="spinner" aria-hidden="true"></span><span class="sr-only">Caricamento webcam…</span>';
      loading.style.display = 'grid';
    }

    if (!content) {
      showModalError('Webcam non disponibile.');
    } else if (content.startsWith('<')) {
      const htmlBox = html();
      if (htmlBox) {
        htmlBox.innerHTML = content;
        htmlBox.style.display = 'flex';
      }
      if (loading) loading.style.display = 'none';
    } else if (isImageUrl(content)) {
      const picture = image();
      if (picture) {
        picture.alt = `Webcam ${webcam.label || ''}`;
        picture.style.display = 'block';
        picture.onload = () => { if (loading) loading.style.display = 'none'; };
        picture.onerror = () => showModalError('Immagine non disponibile. Apri la webcam in una nuova scheda.');
        picture.src = withCacheBuster(content, webcam.time);
      }
    } else {
      const iframe = frame();
      if (iframe) {
        iframe.title = `Webcam ${webcam.label || ''}`;
        iframe.style.display = 'block';
        iframe.onload = () => { if (loading) loading.style.display = 'none'; };
        iframe.src = withCacheBuster(content, webcam.time);
      }
      clearTimeout(state.frameTimer);
      state.frameTimer = setTimeout(() => {
        if (overlay.classList.contains('open') && loading) loading.style.display = 'none';
      }, 9000);
    }

    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    setTimeout(() => $('#camClose')?.focus(), 60);
  };

  const closeCam = () => {
    const overlay = modal();
    if (!overlay || !overlay.classList.contains('open')) return;

    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    clearTimeout(state.frameTimer);

    if (window.location.hash.startsWith('#webcam-')) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    setTimeout(() => {
      const iframe = frame();
      const picture = image();
      const htmlBox = html();
      const loading = loader();
      if (iframe) {
        iframe.onload = null;
        iframe.src = 'about:blank';
        iframe.style.display = 'none';
      }
      if (picture) {
        picture.onload = null;
        picture.onerror = null;
        picture.removeAttribute('src');
        picture.style.display = 'none';
      }
      if (htmlBox) {
        htmlBox.innerHTML = '';
        htmlBox.style.display = 'none';
      }
      if (loading) loading.style.display = 'grid';
    }, 300);

    if (state.lastFocus && typeof state.lastFocus.focus === 'function') state.lastFocus.focus();
    state.lastFocus = null;
  };

  const trapFocus = (event) => {
    const overlay = modal();
    if (!overlay) return;
    const focusable = $$('a[href], button:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])', overlay)
      .filter((element) => element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const initModal = () => {
    const overlay = modal();
    if (!overlay) return;

    $('#camClose')?.addEventListener('click', closeCam);
    $$('[data-close]', overlay).forEach((element) => element.addEventListener('click', closeCam));

    document.addEventListener('keydown', (event) => {
      if (!overlay.classList.contains('open')) return;
      if (event.key === 'Escape') closeCam();
      if (event.key === 'Tab') trapFocus(event);
    });
  };

  /* ── News and social links ─────────────────────────────── */
  const initials = (title) => String(title || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 3);

  const renderNews = (items) => {
    const container = $('#newsList');
    if (!container) return;
    const list = (Array.isArray(items) ? items : []).filter((item) => item.enabled !== false);
    if (!list.length) {
      container.innerHTML = '<div class="list-error">Nessun link disponibile.</div>';
      return;
    }
    container.innerHTML = list.map((item) => {
      const mark = item.mark || initials(item.title);
      return `<a class="link-row" href="${escapeHtml(item.url || '#')}" target="_blank" rel="noopener noreferrer">
        <span class="link-mark" aria-hidden="true">${escapeHtml(mark)}</span>
        <span class="link-main">
          <span class="link-title">${escapeHtml(item.title || '')}</span>
          ${item.description ? `<span class="link-desc">${escapeHtml(item.description)}</span>` : ''}
        </span>
        ${item.tag ? `<span class="link-tag">${escapeHtml(item.tag)}</span>` : ''}
        ${ICONS.external.replace('<svg ', '<svg class="link-arrow" ')}
      </a>`;
    }).join('');
  };

  const renderSocial = (items) => {
    const container = $('#socialList');
    if (!container) return;
    const list = (Array.isArray(items) ? items : []).filter((item) => item.enabled !== false);
    if (!list.length) {
      container.innerHTML = '<div class="list-error">Nessun link disponibile.</div>';
      return;
    }
    container.innerHTML = list.map((item) => {
      const icon = ICONS[item.icon] || ICONS.globe;
      const meta = [item.handle, item.description].filter(Boolean).join(' · ');
      return `<a class="link-row" href="${escapeHtml(item.url || '#')}" target="_blank" rel="noopener noreferrer">
        <span class="link-icon" aria-hidden="true">${icon}</span>
        <span class="link-main">
          <span class="link-title">${escapeHtml(item.title || '')}</span>
          ${meta ? `<span class="link-desc">${escapeHtml(meta)}</span>` : ''}
        </span>
        ${ICONS.external.replace('<svg ', '<svg class="link-arrow" ')}
      </a>`;
    }).join('');
  };

  const renderListError = (selector, kind) => {
    const container = $(selector);
    if (!container) return;
    const hint = window.location.protocol === 'file:'
      ? 'Apri la pagina con un server locale (vedi README).'
      : 'Controlla la connessione.';
    container.innerHTML = `<div class="list-error">Impossibile caricare i link. ${hint} <button type="button" data-retry="${kind}">Riprova</button></div>`;
  };

  const loadNews = async () => {
    try {
      renderNews(await fetchJson('data/news.json'));
    } catch (error) {
      renderListError('#newsList', 'news');
    }
  };

  const loadSocial = async () => {
    try {
      renderSocial(await fetchJson('data/social.json'));
    } catch (error) {
      renderListError('#socialList', 'social');
    }
  };

  /* ── Navigation, reveal, clock ─────────────────────────── */
  const initHeader = () => {
    const header = $('#siteHeader');
    if (!header) return;
    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  };

  const initScrollSpy = () => {
    const links = $$('.nav a[data-section]');
    const sections = links
      .map((link) => document.getElementById(link.dataset.section))
      .filter(Boolean);
    if (!sections.length || !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((link) => {
          link.classList.toggle('active', link.dataset.section === entry.target.id);
        });
      });
    }, { rootMargin: '-35% 0px -55% 0px', threshold: 0 });

    sections.forEach((section) => observer.observe(section));
  };

  const initReveal = () => {
    const items = $$('.reveal');
    if (!items.length) return;
    if (!('IntersectionObserver' in window)) {
      items.forEach((item) => item.classList.add('in'));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.04 });
    items.forEach((item) => observer.observe(item));
  };

  const initWebcamGrid = () => {
    const grid = $('#webcamGrid');
    if (!grid || grid._pnBound) return;
    grid._pnBound = true;
    grid.addEventListener('click', (event) => {
      if (event.target.closest('.cam-credit')) return; // let the credit link open
      const card = event.target.closest('.cam');
      if (card) openCam(parseInt(card.dataset.index, 10));
    });
  };

  const initRetry = () => {
    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-retry]');
      if (!button) return;
      const kind = button.dataset.retry;
      if (kind === 'weather') loadWeather(true);
      if (kind === 'webcams') loadWebcams();
      if (kind === 'news') loadNews();
      if (kind === 'social') loadSocial();
    });
  };

  const init = () => {
    updateClock();
    setInterval(updateClock, 30000);

    const year = $('#year');
    if (year) year.textContent = new Date().getFullYear();

    const wbDate = $('#wbDate');
    if (wbDate) wbDate.textContent = todayLong();

    initHeader();
    initScrollSpy();
    initReveal();
    initModal();
    initWebcamGrid();
    initRetry();
    initAutorefresh();

    $('#refreshWeather')?.addEventListener('click', () => loadWeather(true));

    loadWeather();
    loadWebcams();
    loadNews();
    loadSocial();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
