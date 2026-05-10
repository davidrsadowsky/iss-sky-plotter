const https = require('https');
const fs = require('fs');
const path = require('path');

const TLE_URLS = [
  'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE',
  'https://live.ariss.org/iss.txt',
];
const TEMPLATE_FILE = path.join(__dirname, 'template.html');
const OUT_FILE = path.join(__dirname, 'index.html');

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'iss-sky-plotter/1.0' } }, res => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseTLE(text) {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 3) throw new Error('Response too short');
  const line1idx = lines.findIndex(l => /^1 \d{5}/.test(l));
  if (line1idx < 0) throw new Error('Could not find TLE line 1');
  const name = line1idx > 0 ? lines[line1idx - 1] : 'ISS (ZARYA)';
  return { name, line1: lines[line1idx], line2: lines[line1idx + 1] };
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

async function fetchTLE() {
  for (const url of TLE_URLS) {
    try {
      console.log(`Trying ${url} ...`);
      const text = await fetchText(url);
      const tle = parseTLE(text);
      console.log(`  Got TLE: ${tle.name}`);
      return tle;
    } catch (e) {
      console.warn(`  Failed: ${e.message}`);
    }
  }
  throw new Error('All TLE sources failed');
}

async function main() {
  let tle;
  try {
    tle = await fetchTLE();
  } catch (e) {
    console.error('Could not fetch TLE:', e.message);
    if (fs.existsSync(OUT_FILE)) {
      console.log('Keeping existing index.html unchanged.');
    }
    process.exit(1);
  }

  const tleJson = JSON.stringify({
    name: tle.name,
    line1: tle.line1,
    line2: tle.line2,
    epoch: tleEpoch(tle.line1),
    generated: new Date().toLocaleString(),
  });

  const template = fs.readFileSync(TEMPLATE_FILE, 'utf8');
  const output = template.replace('TLE_DATA_PLACEHOLDER', tleJson);
  fs.writeFileSync(OUT_FILE, output, 'utf8');

  console.log(`\nSuccess!`);
  console.log(`TLE epoch : ${tleEpoch(tle.line1)}`);
  console.log(`Output    : ${OUT_FILE}`);
  console.log(`\nOpen index.html in your browser.`);
}

main();
