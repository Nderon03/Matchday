import { describeSymbol, kickoffWeather, metQuery, reminderLine } from '../weather';

const entry = (time: string, temp: number, symbol: string, rain?: number, six = false) => ({
  time,
  data: {
    instant: { details: { air_temperature: temp, wind_speed: 5 } },
    ...(six ? { next_6_hours: { summary: { symbol_code: symbol }, details: { precipitation_amount: rain } } }
      : { next_1_hours: { summary: { symbol_code: symbol }, details: { precipitation_amount: rain } } }),
  },
});

describe('kick-off weather', () => {
  const series = [entry('2026-11-05T18:00:00Z', 11.6, 'cloudy'), entry('2026-11-05T19:00:00Z', 10.4, 'lightrain', 0.6), entry('2026-11-05T20:00:00Z', 9.8, 'rain', 1.4)];
  it('uses the hour nearest kick-off', () => {
    expect(kickoffWeather(series, new Date('2026-11-05T19:10:00Z'))).toEqual({
      at: '2026-11-05T19:00:00Z', temp_c: 10, wind_mph: 11, precip_mm: 0.6, symbol: 'lightrain', summary: 'Light rain', icon: 'rainy-outline',
    });
  });
  it('gives nothing when kick-off is outside the forecast', () => expect(kickoffWeather(series, new Date('2026-11-09T19:00:00Z'))).toBeNull());
  it('falls back to 6-hour periods further ahead', () => {
    const w = kickoffWeather([entry('2026-11-12T18:00:00Z', 7, 'partlycloudy_night', undefined, true)], new Date('2026-11-12T19:30:00Z'));
    expect(w).toMatchObject({ summary: 'Partly cloudy', icon: 'cloudy-night-outline', precip_mm: null });
  });
  it('describes symbols', () => {
    expect(describeSymbol('heavyrainshowers_day').summary).toBe('Heavy rain showers');
    expect(describeSymbol('clearsky_day').icon).toBe('sunny-outline');
    expect(describeSymbol('heavysnow').summary).toBe('Snow');
  });
  it('trims coordinates', () => expect(metQuery(51.614234, -0.24471)).toContain('lat=51.6142&lon=-0.2447'));
});

describe('reminder line', () => {
  const w = { at: '', precip_mm: null, symbol: '' };
  it('adds a tip when it matters', () => {
    expect(reminderLine({ ...w, temp_c: 9, wind_mph: 8, summary: 'Light rain', icon: 'rainy-outline' })).toBe('🌧 9°C, light rain at kick-off. Bring a layer.');
    expect(reminderLine({ ...w, temp_c: 2, wind_mph: 5, summary: 'Clear', icon: 'moon-outline' })).toBe('🌙 2°C, clear at kick-off. Wrap up warm.');
    expect(reminderLine({ ...w, temp_c: 16, wind_mph: 6, summary: 'Partly cloudy', icon: 'partly-sunny-outline' })).toBe('⛅ 16°C, partly cloudy at kick-off.');
  });
});
