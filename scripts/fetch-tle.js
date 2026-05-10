// Run by GitHub Actions to keep tle.json fresh from Celestrak.
// Falls back to ARISS if Celestrak is unavailable.
const https = require('https');
const fs = require('fs');
const path = require('path');

const SOURCES = [
  'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE',
  'https://live.ariss.org/iss.txt',
];
const OUT_FILE = path.join(__dirname, '..', 'tle.json');

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'iss-planet-transit-tool/1.0' } }, res => {
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseTLE(text) {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);
  const idx = lines.findIndex(l => /^1 \d{5}/.test(l));
  if (idx < 0) throw new Error('TLE line 1 not found');
  return { name: idx > 0 ? lines[idx - 1] : 'ISS (ZARYA)', line1: lines[idx], line2: lines[idx + 1] };
}

function tleEpoch(line1) {
  const raw = line1.substring(18, 32).trim();
  const yr = parseInt(raw.substring(0, 2));
  const fullYear = yr < 57 ? 2000 + yr : 1900 + yr;
  const doy = parseFloat(raw.substring(2));
  const d = new Date(Date.UTC(fullYear, 0, 1));
  d.setUTCDate(d.getUTCDate() + Math.floor(doy) - 1);
  const hours = (doy % 1) * 24;
  d.setUTCHours(Math.floor(hours));
  d.setUTCMinutes(Math.floor((hours % 1) * 60));
  return d.toUTCString().replace(' GMT', ' UTC');
}

async function main() {
  for (const url of SOURCES) {
    try {
      console.log(`Trying ${url} ...`);
      const text = await fetchText(url);
      const tle = parseTLE(text);
      const out = {
        name: tle.name,
        line1: tle.line1,
        line2: tle.line2,
        epoch: tleEpoch(tle.line1),
        generated: new Date().toISOString(),
        source: url.includes('celestrak') ? 'Celestrak' : 'ARISS',
      };
      fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));
      console.log(`Success. Epoch: ${out.epoch}`);
      return;
    } catch (e) {
      console.warn(`  Failed: ${e.message}`);
    }
  }
  console.error('All sources failed — tle.json not updated.');
  process.exit(1);
}

main();
