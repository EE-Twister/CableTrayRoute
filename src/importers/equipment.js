/**
 * Simple CSV and XML import helpers for equipment schedules. These functions
 * accept raw text from external tools and map incoming fields to the property
 * names expected by the data store. The mapping object is a dictionary where
 * keys are source column/tag names and values are the desired field names.
 */

/**
 * Parse equipment data from CSV.
 * @param {string} text - CSV content including header row.
 * @param {Object} mapping - optional field mapping.
 * @returns {Array<Object>} equipment objects.
 */
export function importEquipmentCSV(text = '', mapping = {}) {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).filter(Boolean).map(line => {
    const cells = line.split(',');
    const obj = {};
    headers.forEach((h, i) => {
      const key = mapping[h] || h;
      obj[key] = cells[i] ? cells[i].trim() : '';
    });
    return obj;
  });
}

/**
 * Parse equipment data from a very small XML format. Expected structure:
 * `<items><equipment><field>value</field>...</equipment>...</items>`.
 * @param {string} xml - XML text.
 * @param {Object} mapping - optional field mapping.
 * @returns {Array<Object>}
 */
export function importEquipmentXML(xml = '', mapping = {}) {
  const items = [];
  const equipRegex = /<equipment>([\s\S]*?)<\/equipment>/gi;
  let match;
  while ((match = equipRegex.exec(xml))) {
    const block = match[1];
    const obj = {};
    block.replace(/<([^>]+)>([^<]*)<\/\1>/g, (_m, tag, val) => {
      const key = mapping[tag] || tag;
      obj[key] = val.trim();
      return '';
    });
    if (Object.keys(obj).length) items.push(obj);
  }
  return items;
}

export default { importEquipmentCSV, importEquipmentXML };
