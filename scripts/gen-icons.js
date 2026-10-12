const sharp = require('sharp');
const fs = require('fs');
(async () => {
  const svg = fs.readFileSync('public/icons/icon.svg');
  for (const n of [192, 512]) await sharp(svg).resize(n, n).png().toFile(`public/icons/icon-${n}.png`);
  console.log('ícones gerados');
})();
