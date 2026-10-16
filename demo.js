/**
 * Demo mode: answers API routes from demo-data.json (fictional makes and numbers)
 * using the same response envelope as the real Car Specs API.
 */
const D = require('./demo-data.json');

const ok = (data, extra = {}) => ({ success: true, data, meta: { requestId: 'demo', tookMs: 1, demo: true, ...extra } });
const err = (code, message) => ({ success: false, error: { code, message }, meta: { requestId: 'demo' } });
const specs = Object.values(D.specs);
const norm = (s) => String(s || '').toLowerCase().replace(/[\s-]/g, '');
const byModel = (make, model) => specs.filter((s) => norm(s.make) === norm(make) && norm(s.model).startsWith(norm(model)));

const ROWS = [
  ['combinedMpg', (s) => s.fuelEconomy.mpg.combined, 'max'],
  ['cityMpg', (s) => s.fuelEconomy.mpg.city, 'max'],
  ['highwayMpg', (s) => s.fuelEconomy.mpg.highway, 'max'],
  ['annualFuelCostUsd', (s) => s.costs.annualFuelCostUsd, 'min'],
  ['co2GramsPerMile', (s) => s.emissions.co2GramsPerMile, 'min'],
  ['electricRangeMiles', (s) => s.fuelEconomy.electric?.rangeMiles ?? null, 'max'],
  ['displacementL', (s) => s.engine?.displacementL ?? null],
  ['cylinders', (s) => s.engine?.cylinders ?? null],
  ['powertrain', (s) => s.powertrain],
  ['drivetrain', (s) => s.drivetrain],
  ['transmission', (s) => s.transmission.description],
  ['vehicleClass', (s) => s.vehicleClass],
  ['passengerVolumeCuFt', (s) => s.interior?.passengerVolumeCuFt ?? null, 'max'],
  ['luggageVolumeCuFt', (s) => s.interior?.luggageVolumeCuFt ?? null, 'max'],
];

function bundle(list) {
  return {
    summary: `${list[0].year} ${list[0].make} ${list[0].model}: ${list.length} trims (demo data)`,
    vehicle: { year: list[0].year, make: list[0].make, model: list[0].model, matchedModels: list.map((s) => s.model) },
    trims: list.map((s) => D.trims[s.id]),
    specs: list,
    dimensions: [D.dimensions],
    safetyRatings: [D.safety],
    images: [D.image, D.image],
  };
}

module.exports = function demo(route, q, body) {
  const make = q.get('make'), model = q.get('model');
  switch (true) {
    case route === '/years': return ok([2024]);
    case route === '/makes': return ok(D.makes.map((name) => ({ name })));
    case route === '/models': return ok((D.models[D.makes.find((m) => norm(m) === norm(make))] || []).map((name) => ({ name })));
    case route === '/trims': {
      const l = byModel(make, model);
      return l.length ? ok({ vehicle: { year: 2024, make, model }, matchedModels: l.map((s) => s.model), count: l.length, trims: l.map((s) => D.trims[s.id]) }) : err('NO_SPEC_DATA', 'No trims (demo)');
    }
    case /^\/specs\/\d+$/.test(route): {
      const s = D.specs[route.split('/')[2]];
      return s ? ok(s) : err('TRIM_NOT_FOUND', 'Unknown trim id (demo)');
    }
    case route === '/compare': {
      const list = (q.get('ids') || '').split(',').map((id) => D.specs[id.trim()]).filter(Boolean);
      const comparison = {};
      for (const [k, f, best] of ROWS) {
        const values = list.map(f);
        const row = { values };
        const nums = values.map((v, i) => [v, list[i].id]).filter(([v]) => typeof v === 'number');
        if (best && nums.length > 1) row.bestId = nums.sort((a, b) => (best === 'max' ? b[0] - a[0] : a[0] - b[0]))[0][1];
        comparison[k] = row;
      }
      return ok({ vehicles: list.map((s) => ({ id: s.id, name: `${s.year} ${s.make} ${s.model}`, summary: s.summary })), comparison, specs: list });
    }
    case route === '/images': return ok([D.image, D.image, D.image]);
    case route === '/safety-ratings': return ok([D.safety]);
    case route === '/vehicle': {
      const l = byModel(make, model);
      return l.length ? ok(bundle(l)) : err('NO_SPEC_DATA', 'No trims (demo)');
    }
    case route === '/vin/validate': {
      const v = String(q.get('vin') || '').toUpperCase();
      return ok({ vin: v, valid: v.length === 17 && !/[IOQ]/.test(v), length: v.length, checkDigitValid: true, suggestion: null });
    }
    case route === '/vin/specs' || route === '/vin/decode': {
      const v = String(q.get('vin') || '').toUpperCase();
      const b = bundle(specs.slice(0, 2));
      b.vin = {
        vin: v, make: 'Demo Motors', model: 'Aurora Sedan', modelYear: 2024, possibleModelYears: [2024], trim: 'Touring', series: null,
        bodyClass: 'Sedan/Saloon', vehicleType: 'Passenger Car', doors: 4, seats: 5, driveType: 'FWD/Front-Wheel Drive', fuelType: 'Gasoline',
        electrificationLevel: null, engine: { cylinders: 4, displacementL: 2, horsepower: 180, kilowatts: 134, configuration: 'In-Line', model: 'DM20', turbo: false },
        transmission: { style: 'Continuously Variable Transmission (CVT)', speeds: null }, manufacturer: 'DEMO MOTORS CORP',
        plant: { city: 'Sampleville', state: 'Ohio', country: 'United States (USA)' }, weightClass: 'Class 1C: 4,001 - 5,000 lb',
        origin: { region: 'North America', country: 'United States', wmi: v.slice(0, 3) }, decodeQuality: 'complete', decodeNotes: ['Demo decode'],
      };
      b.likelyTrimIds = [9001];
      b.trims = b.trims.map((t) => ({ ...t, engineMatch: t.id === 9001 }));
      return ok(b, { warnings: ['Demo mode: this is fictional sample data, not a real decode.'] });
    }
    case route === '/vin/batch': {
      let vins = [];
      try { vins = JSON.parse(body || '{}').vins || []; } catch {}
      return ok({ results: vins.map((v, i) => (i % 4 === 3
        ? { vin: v, success: false, error: { code: 'INVALID_VIN', message: 'Check digit mismatch (demo)' } }
        : { vin: v, success: true, data: { make: i % 2 ? 'Sample Auto' : 'Demo Motors', model: i % 2 ? 'Trailmark SUV' : 'Aurora Sedan', modelYear: 2020 + (i % 5), bodyClass: i % 2 ? 'SUV' : 'Sedan', fuelType: 'Gasoline', engine: { cylinders: 4, displacementL: 2 } } })) });
    }
    default: return err('ROUTE_NOT_FOUND', 'Not available in demo mode');
  }
};
