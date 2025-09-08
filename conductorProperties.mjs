import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = join(__dirname, 'data', 'conductor_properties.json');
const data = JSON.parse(readFileSync(dataPath, 'utf8'));

export default data;
