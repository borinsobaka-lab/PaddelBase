// OKLCH -> sRGB -> WCAG contrast. Проверка палитры до того, как она попадёт в код.

function oklchToSrgb(L, C, Hdeg) {
  const h = (Hdeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  const lin = [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return lin;
}

const clamp = (x) => Math.min(1, Math.max(0, x));
const toHex = (lin) =>
  '#' +
  lin
    .map((c) => {
      const v = clamp(c);
      const srgb = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
      return Math.round(clamp(srgb) * 255)
        .toString(16)
        .padStart(2, '0');
    })
    .join('');

const luminance = (lin) => {
  const [r, g, b] = lin.map(clamp);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const inGamut = (lin) => lin.every((c) => c >= -0.0005 && c <= 1.0005);

const T = {
  canvas: [0.968, 0.006, 175],
  surface: [1, 0, 175],
  sunken: [0.945, 0.009, 175],
  border: [0.898, 0.011, 175],
  borderStrong: [0.640, 0.018, 175],

  text: [0.268, 0.021, 175],
  textSecondary: [0.452, 0.019, 175],
  muted: [0.518, 0.017, 175],
  faint: [0.612, 0.016, 175],

  accent: [0.512, 0.118, 158],
  accentSoft: [0.945, 0.032, 158],
  accentInk: [1, 0, 0],

  ball: [0.885, 0.166, 113],
  ballInk: [0.285, 0.062, 122],
  ballSoft: [0.972, 0.045, 110],

  warn: [0.522, 0.108, 62],
  warnSoft: [0.962, 0.028, 72],
  danger: [0.508, 0.176, 27],
  dangerSoft: [0.952, 0.022, 22],
};

const rgb = Object.fromEntries(Object.entries(T).map(([k, v]) => [k, oklchToSrgb(...v)]));

console.log('--- токены ---');
for (const [k, v] of Object.entries(T)) {
  const g = inGamut(rgb[k]) ? '  ' : ' ⚠ вне sRGB';
  console.log(`${k.padEnd(15)} oklch(${v[0]} ${v[1]} ${v[2]})`.padEnd(46), toHex(rgb[k]), g);
}

const pairs = [
  ['text', 'canvas', 4.5],
  ['text', 'surface', 4.5],
  ['text', 'sunken', 4.5],
  ['textSecondary', 'canvas', 4.5],
  ['textSecondary', 'surface', 4.5],
  ['muted', 'canvas', 4.5],
  ['muted', 'surface', 4.5],
  ['muted', 'sunken', 4.5],
  ['muted', 'ballSoft', 4.5],
  ['faint', 'canvas', 3],
  ['faint', 'surface', 3],
  ['accent', 'canvas', 4.5],
  ['accent', 'surface', 4.5],
  ['accent', 'accentSoft', 4.5],
  ['accentInk', 'accent', 4.5],
  ['ballInk', 'ball', 4.5],
  ['ballInk', 'ballSoft', 4.5],
  ['text', 'ballSoft', 4.5],
  ['text', 'accentSoft', 4.5],
  ['warn', 'canvas', 4.5],
  ['warn', 'warnSoft', 4.5],
  ['warn', 'ballSoft', 4.5],
  ['danger', 'canvas', 4.5],
  ['danger', 'surface', 4.5],
  ['danger', 'dangerSoft', 4.5],
  ['borderStrong', 'canvas', 3],
  ['borderStrong', 'surface', 3],
  ['faint', 'sunken', 3],
];

console.log('\n--- контраст ---');
let fails = 0;
for (const [fg, bg, min] of pairs) {
  const ratio = contrast(rgb[fg], rgb[bg]);
  const ok = ratio >= min;
  if (!ok) fails += 1;
  console.log(
    `${(fg + ' на ' + bg).padEnd(34)} ${ratio.toFixed(2)}:1  (нужно ${min})  ${ok ? 'ок' : '✗ ПРОВАЛ'}`,
  );
}
console.log(fails === 0 ? '\nвсе пары проходят' : `\n${fails} пар не проходит`);
