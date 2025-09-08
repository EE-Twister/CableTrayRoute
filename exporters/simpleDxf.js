export class Drawing {
  constructor() {
    this.entities = [];
  }

  drawText(x, y, height, value, rotation = 0) {
    this.entities.push(`0\nTEXT\n8\n0\n10\n${x}\n20\n${y}\n30\n0\n40\n${height}\n1\n${value}\n50\n${rotation}`);
  }

  drawLine3d(x1, y1, z1, x2, y2, z2) {
    this.entities.push(`0\nLINE\n8\n0\n10\n${x1}\n20\n${y1}\n30\n${z1}\n11\n${x2}\n21\n${y2}\n31\n${z2}`);
  }

  toDxfString() {
    const header = `0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1027\n0\nENDSEC`;
    const entities = `0\nSECTION\n2\nENTITIES\n${this.entities.join('\n')}\n0\nENDSEC`;
    return `${header}\n${entities}\n0\nEOF`;
  }
}
