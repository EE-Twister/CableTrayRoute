export class Drawing {
  constructor() {
    this.entities = [];
  }

  sanitizeText(value, fallback = '') {
    const text = String(value ?? '');
    const normalized = text.replace(/[\r\n\u0000-\u001F\u007F]/g, ' ').trim();
    return normalized || fallback;
  }

  toFiniteNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  drawText(x, y, height, value, rotation = 0) {
    const safeX = this.toFiniteNumber(x);
    const safeY = this.toFiniteNumber(y);
    const safeHeight = this.toFiniteNumber(height, 1);
    const safeValue = this.sanitizeText(value, 'Component');
    const safeRotation = this.toFiniteNumber(rotation);
    this.entities.push(`0\nTEXT\n8\n0\n10\n${safeX}\n20\n${safeY}\n30\n0\n40\n${safeHeight}\n1\n${safeValue}\n50\n${safeRotation}`);
  }

  drawLine3d(x1, y1, z1, x2, y2, z2) {
    const safeX1 = this.toFiniteNumber(x1);
    const safeY1 = this.toFiniteNumber(y1);
    const safeZ1 = this.toFiniteNumber(z1);
    const safeX2 = this.toFiniteNumber(x2);
    const safeY2 = this.toFiniteNumber(y2);
    const safeZ2 = this.toFiniteNumber(z2);
    this.entities.push(`0\nLINE\n8\n0\n10\n${safeX1}\n20\n${safeY1}\n30\n${safeZ1}\n11\n${safeX2}\n21\n${safeY2}\n31\n${safeZ2}`);
  }

  toDxfString() {
    const header = `0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1027\n0\nENDSEC`;
    const entities = `0\nSECTION\n2\nENTITIES\n${this.entities.join('\n')}\n0\nENDSEC`;
    return `${header}\n${entities}\n0\nEOF`;
  }
}
