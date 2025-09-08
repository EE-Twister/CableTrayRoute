let data;

if (typeof process !== 'undefined' && process.versions?.node) {
  const { readFileSync } = await import('fs');
  const { fileURLToPath } = await import('url');
  const { dirname, join } = await import('path');

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const dataPath = join(__dirname, 'data', 'conductor_properties.json');
  data = JSON.parse(readFileSync(dataPath, 'utf8'));
} else {
  data = (await import('./data/conductor_properties.js')).default;
}

export default data;
