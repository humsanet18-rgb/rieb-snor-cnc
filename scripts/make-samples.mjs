// Writes the public sample SVGs. All geometry is synthetic; customer files never go in public/.
import { writeFileSync } from 'node:fs';

const dir = new URL('../public/samples/', import.meta.url);

/** Corel-style block letters, 200 mm tall, drawn on a 0..120 by 0..200 box. */
const LETTERS = {
  A: 'M0 200L46 0H74L120 200H90L80 152H40L30 200ZM46 124H74L60 56Z',
  B: 'M0 0H70C104 0 118 22 118 52C118 74 108 90 92 96C110 102 120 120 120 142C120 176 100 200 66 200H0ZM30 28V84H62C78 84 86 72 86 56C86 40 78 28 62 28ZM30 112V172H64C80 172 88 158 88 142C88 126 80 112 64 112Z',
  D: 'M0 0H60C100 0 120 40 120 100C120 160 100 200 60 200H0ZM30 30V170H56C80 170 88 140 88 100C88 60 80 30 56 30Z',
  E: 'M0 0H110V30H30V84H96V114H30V170H112V200H0Z',
  H: 'M0 0H30V84H90V0H120V200H90V114H30V200H0Z',
  L: 'M0 0H30V170H104V200H0Z',
  O: 'M60 0C100 0 120 40 120 100C120 160 100 200 60 200C20 200 0 160 0 100C0 40 20 0 60 0ZM60 30C40 30 32 60 32 100C32 140 40 170 60 170C80 170 88 140 88 100C88 60 80 30 60 30Z',
  R: 'M0 0H70C104 0 118 24 118 60C118 88 106 106 86 114L122 200H88L56 120H30V200H0ZM30 28V92H62C80 92 86 78 86 60C86 42 80 28 62 28Z',
  T: 'M0 0H120V30H75V200H45V30H0Z'
};

const word = (text, x, y, step = 145) =>
  [...text].map((c, i) => `  <path fill="#000" transform="translate(${x + i * step} ${y})" d="${LETTERS[c]}"/>`).join('\n');

writeFileSync(new URL('block-letters.svg', dir), `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1000mm" height="480mm" viewBox="0 0 1000 480">
  <title>Sample block letters</title>
${word('HELLO', 20, 15)}
${word('BOARD', 20, 245)}
${word('T', 780, 15)}
</svg>
`);

writeFileSync(new URL('mixed-shapes.svg', dir), `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="50cm" height="30cm" viewBox="0 0 500 300">
  <title>Sample primitives, transforms and units</title>
  <style>.solid { fill: #222 } #ring { fill-rule: evenodd }</style>
  <defs><symbol id="star" viewBox="0 0 100 100"><polygon points="50,0 62,36 100,38 70,60 80,98 50,76 20,98 30,60 0,38 38,36"/></symbol></defs>
  <rect class="solid" x="10" y="10" width="90" height="60" rx="10"/>
  <circle class="solid" cx="170" cy="50" r="40"/>
  <ellipse class="solid" cx="290" cy="50" rx="60" ry="35"/>
  <path id="ring" fill="#222" d="M370 10h100v100h-100zM395 35v50h50v-50z"/>
  <g fill="#222" transform="translate(70 170) rotate(30)">
    <rect x="-50" y="-30" width="100" height="60"/>
  </g>
  <g fill="#222" transform="matrix(1 0 0.3 1 170 120)">
    <polygon points="0,0 80,0 80,70 0,70"/>
  </g>
  <use xlink:href="#star" x="300" y="130" width="90" height="90" fill="#222"/>
  <path fill="#222" d="M400 130 a50 50 0 1 1 0.1 0zM10 240 q40 -40 80 0 t80 0 v40 h-160z"/>
</svg>
`);

writeFileSync(new URL('file-with-problems.svg', dir), `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600mm" height="300mm" viewBox="0 0 600 300">
  <title>Sample with problems the importer must report</title>
  <script>document.title = 'this must never run'</script>
  <path fill="#000" d="${LETTERS.H}"/>
  <path fill="#000" transform="translate(150 0)" d="${LETTERS.O}"/>
  <path fill="#000" transform="translate(150 0)" d="${LETTERS.O}"/>
  <text x="300" y="100" font-size="80">Not curves</text>
  <image x="300" y="150" width="100" height="100" href="data:image/gif;base64,R0lGODlhAQABAAAAACw="/>
  <path fill="none" stroke="#000" d="M450 20 L580 20 L580 140"/>
  <line x1="300" y1="280" x2="580" y2="280" stroke="#000"/>
  <path fill="#000" d="M450 170 h120 v100 h-120 z M470 190 Q"/>
</svg>
`);
