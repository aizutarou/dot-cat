// ドット絵スプライト(32x32、右向き)をコードで定義して生成する
// 形(shapes)は自動で1pxの輪郭線が付く。details は輪郭なしの模様・目鼻。
const C = {
  line: '#3b2a2a',
  fur: '#f0a25a',
  furDark: '#d9803a',
  cream: '#fff0d6',
  pink: '#f08aa0',
  eye: '#2a1a1a',
};

// ---- 毛色 ----
const COAT_KEYS = ['line', 'fur', 'furDark', 'cream', 'pink', 'eye'];
const COATS = {
  orange: { name: '茶トラ' },
  calico: { name: '三毛', fur: '#fffaf0', furDark: '#f0a25a', cream: '#fffaf0',
    patches: [[5, 12, 8, 9, '#f0a25a'], [14, 13, 7, 8, '#3d3d4d'], [22, 5, 6, 5, '#f0a25a'], [17, 4, 4, 4, '#3d3d4d']] },
  black: { name: '黒猫', fur: '#3d3d4d', furDark: '#2c2c38', cream: '#55556a', line: '#14141a', eye: '#ffd34d' },
  white: { name: '白猫', fur: '#ffffff', furDark: '#d3d3e6', cream: '#fff0f4', line: '#4a4458', eye: '#3f9bff' },
  gray:  { name: 'グレー', fur: '#9ca5b8', furDark: '#7b849a', cream: '#eceff6', line: '#2f3342' },
};
const COAT_IDS = Object.keys(COATS);
const BASE_COAT = Object.assign({}, C);
let COAT_PATCHES = null;
function applyCoat(id) {
  const c = COATS[id] || {};
  COAT_KEYS.forEach((k) => { C[k] = c[k] || BASE_COAT[k]; });
  COAT_PATCHES = c.patches || null;
}
const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

let CURRENT_FACE = null; // 表情の差し替え(blink / sad / wow / smile)

function headParts(hx, hy, mood) {
  if (mood === 'open' && CURRENT_FACE) mood = CURRENT_FACE;
  const shapes = [
    [hx, hy, 9, 8, C.fur],
    [hx, hy - 3, 3, 3, C.fur],
    [hx + 6, hy - 3, 3, 3, C.fur],
  ];
  const d = [
    [hx + 1, hy - 2, 1, 1, C.pink],
    [hx + 7, hy - 2, 1, 1, C.pink],
    [hx + 3, hy + 6, 5, 2, C.cream],
    [hx + 8, hy + 5, 1, 1, C.pink],
    [hx + 2, hy, 1, 2, C.furDark],
    [hx + 4, hy, 1, 2, C.furDark],
  ];
  if (mood === 'open') {
    d.push([hx + 6, hy + 3, 1, 2, C.eye], [hx + 3, hy + 3, 1, 2, C.eye]);
  } else if (mood === 'blink') {
    d.push([hx + 5, hy + 4, 3, 1, C.eye], [hx + 2, hy + 4, 3, 1, C.eye]);
  } else if (mood === 'sad') {
    // しょんぼり:目が下がり、眉がハの字
    d.push(
      [hx + 3, hy + 4, 1, 2, C.eye], [hx + 6, hy + 4, 1, 2, C.eye],
      [hx + 2, hy + 3, 1, 1, C.eye], [hx + 7, hy + 3, 1, 1, C.eye],
      [hx + 3, hy + 4, 1, 1, '#fff'], [hx + 6, hy + 4, 1, 1, '#fff']
    );
  } else if (mood === 'wow') {
    // まんまるの目
    d.push(
      [hx + 3, hy + 3, 2, 3, C.eye], [hx + 6, hy + 3, 2, 3, C.eye],
      [hx + 3, hy + 3, 1, 1, '#fff'], [hx + 6, hy + 3, 1, 1, '#fff']
    );
  } else if (mood === 'smile') {
    // にっこり:ふつうの目 + 口
    d.push(
      [hx + 6, hy + 3, 1, 2, C.eye], [hx + 3, hy + 3, 1, 2, C.eye],
      [hx + 4, hy + 6, 1, 1, C.eye], [hx + 5, hy + 7, 1, 1, C.eye], [hx + 6, hy + 6, 1, 1, C.eye]
    );
  } else if (mood === 'happy') {
    d.push(
      [hx + 5, hy + 4, 1, 1, C.eye], [hx + 6, hy + 3, 1, 1, C.eye], [hx + 7, hy + 4, 1, 1, C.eye],
      [hx + 2, hy + 4, 1, 1, C.eye], [hx + 3, hy + 3, 1, 1, C.eye], [hx + 4, hy + 4, 1, 1, C.eye]
    );
  } else if (mood === 'angry') {
    // つり目(V字)+への字の口
    d.push(
      [hx + 2, hy + 3, 1, 1, C.eye], [hx + 3, hy + 4, 2, 1, C.eye],
      [hx + 7, hy + 3, 1, 1, C.eye], [hx + 5, hy + 4, 2, 1, C.eye],
      [hx + 6, hy + 7, 2, 1, C.eye]
    );
  } else if (mood === 'sleep') {
    d.push([hx + 5, hy + 4, 3, 1, C.eye], [hx + 2, hy + 4, 3, 1, C.eye]);
  }
  return { shapes, d };
}

function buildPose(pose, f) {
  let shapes = [];
  let d = [];
  const add = (p) => { shapes = shapes.concat(p.shapes); d = d.concat(p.d); };

  if (pose === 'idle' || pose === 'walk') {
    const bob = pose === 'walk' && f % 2 === 1 ? 1 : 0;
    // しっぽ
    if (f % 2 === 0) shapes.push([5, 19 + bob, 3, 2, C.fur], [3, 13 + bob, 3, 8, C.fur]);
    else shapes.push([5, 19 + bob, 3, 2, C.fur], [4, 12 + bob, 3, 9, C.fur]);
    // 体
    shapes.push([7, 15 + bob, 15, 8, C.fur]);
    d.push([9, 21 + bob, 11, 2, C.cream]);
    d.push([10, 15 + bob, 1, 3, C.furDark], [14, 15 + bob, 1, 3, C.furDark], [18, 15 + bob, 1, 3, C.furDark]);
    // 足
    let lx = [8, 11, 17, 20];
    let lh = [5, 5, 5, 5];
    if (pose === 'walk') {
      lh = f % 2 === 0 ? [5, 4, 4, 5] : [4, 5, 5, 4];
    }
    lx.forEach((x, i) => shapes.push([x, 23 + bob + (5 - lh[i]) , 2, lh[i] - bob, C.fur]));
    add(headParts(20, 9 + bob, 'open'));
  } else if (pose === 'eat') {
    // 頭を下げてごはん・お水
    const j = f % 2;
    shapes.push([5, 19, 3, 2, C.fur], [3 + j, 14, 3, 7, C.fur]);
    shapes.push([7, 16, 15, 8, C.fur]);
    d.push([9, 22, 11, 2, C.cream]);
    d.push([10, 16, 1, 3, C.furDark], [14, 16, 1, 3, C.furDark], [18, 16, 1, 3, C.furDark]);
    [8, 11, 17, 20].forEach((x) => shapes.push([x, 24, 2, 4, C.fur]));
    add(headParts(21, 15 + j, 'open'));
  } else if (pose === 'angry') {
    // 毛を逆立てて尻尾を太く立てる
    const j = f % 2;
    shapes.push([4 + j, 5, 5, 16, C.fur]);          // 太いしっぽ
    shapes.push([6, 14, 17, 9, C.fur]);             // ふくらんだ体
    d.push([9, 14, 1, 3, C.furDark], [13, 14, 1, 3, C.furDark], [17, 14, 1, 3, C.furDark]);
    d.push([5 + j, 7, 3, 1, C.furDark], [5 + j, 11, 3, 1, C.furDark], [5 + j, 15, 3, 1, C.furDark]);
    [7, 10, 17, 20].forEach((x) => shapes.push([x, 23, 2, 5, C.fur]));
    // 背中のとげとげ
    d.push([9, 13, 1, 1, C.furDark], [12, 13, 1, 1, C.furDark], [15, 13, 1, 1, C.furDark], [18, 13, 1, 1, C.furDark]);
    add(headParts(20, 9, 'angry'));
  } else if (pose === 'sit' || pose === 'groom' || pose === 'pet') {
    const mood = pose === 'pet' ? 'happy' : 'open';
    let hy = 7;
    if (pose === 'groom') hy = 9;
    if (pose === 'pet' && f % 2 === 1) hy = 8;
    shapes.push([1, 24, 6, 4, C.fur]); // しっぽ(床に巻く)
    shapes.push([8, 14, 10, 14, C.fur]);
    shapes.push([6, 19, 8, 9, C.fur]);
    shapes.push([17, 16, 3, 12, C.fur]);
    d.push([9, 14, 1, 3, C.furDark], [12, 14, 1, 3, C.furDark]);
    d.push([18, 18, 1, 8, C.cream]);
    add(headParts(17, hy, mood));
    if (pose === 'groom') {
      if (f % 2 === 0) shapes.push([24, hy + 4, 3, 4, C.cream]);
      else shapes.push([23, hy + 6, 3, 4, C.cream]);
    }
  } else if (pose === 'sleep') {
    const b = f % 2;
    shapes.push([2, 22, 6, 6, C.fur]);
    shapes.push([5, 20 + b, 20, 8 - b, C.fur]);
    d.push([9, 20 + b, 1, 3, C.furDark], [13, 20 + b, 1, 3, C.furDark], [17, 20 + b, 1, 3, C.furDark]);
    add(headParts(18, 20, 'sleep'));
  }
  return { shapes, d };
}

const POSES = { eat: 2, angry: 2, idle: 2, walk: 2, sit: 1, groom: 2, pet: 2, sleep: 2 };

const FACES = ['blink', 'sad', 'wow', 'smile'];
const FACE_POSES = ['idle', 'walk', 'sit', 'groom', 'eat'];

function renderPose(pose, f) {
  const cv = document.createElement('canvas');
  cv.width = 32; cv.height = 32;
  const g = cv.getContext('2d');
  const { shapes, d } = buildPose(pose, f);
  g.fillStyle = C.line;
  shapes.forEach(([x, y, w, h]) => g.fillRect(x - 1, y - 1, w + 2, h + 2));
  shapes.forEach(([x, y, w, h, c]) => { g.fillStyle = c; g.fillRect(x, y, w, h); });
  if (COAT_PATCHES) { // 三毛:毛の色のところだけ、ぶちを塗る
    const img = g.getImageData(0, 0, 32, 32), fr = hex2rgb(C.fur);
    COAT_PATCHES.forEach(([px, py, pw, ph, col]) => {
      const rgb = hex2rgb(col);
      for (let y = py; y < py + ph; y++) for (let x = px; x < px + pw; x++) {
        const i = (y * 32 + x) * 4, d = img.data;
        if (d[i] === fr[0] && d[i + 1] === fr[1] && d[i + 2] === fr[2] && d[i + 3] === 255) { d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; }
      }
    });
    g.putImageData(img, 0, 0);
  }
  d.forEach(([x, y, w, h, c]) => { g.fillStyle = c; g.fillRect(x, y, w, h); });
  return cv;
}

// out['idle'] = ふつうの顔、out['idle:sad'] = しょんぼり顔 …
function makeSprites(coat) {
  applyCoat(coat);
  const out = {};
  [[null, '']].concat(FACES.map((fc) => [fc, ':' + fc])).forEach(([face, suffix]) => {
    CURRENT_FACE = face;
    for (const pose in POSES) {
      if (face && !FACE_POSES.includes(pose)) continue;
      out[pose + suffix] = [];
      for (let f = 0; f < POSES[pose]; f++) out[pose + suffix].push(renderPose(pose, f));
    }
  });
  CURRENT_FACE = null;
  return out;
}

// ハート(7x6)
const HEART = [
  '.##.##.',
  '#######',
  '#######',
  '.#####.',
  '..###..',
  '...#...',
];

// 怒りマーク(5x5)
const ANGER = [
  '#...#',
  '.#.#.',
  '..#..',
  '.#.#.',
  '#...#',
];

// おみやげ(7x7)。# = 1色目、o = 2色目、g = 緑。rarity: 1 よくある / 2 ときどき / 3 めずらしい
const ITEMS = [
  { id: 'acorn', name: 'どんぐり', rarity: 1, c: ['#c8873a', '#7a4a1e'], rows: [
    '..ooo..', '.ooooo.', '.#####.', '.#####.', '..###..', '..###..', '...#...'] },
  { id: 'flower', name: 'ちいさな はな', rarity: 1, c: ['#ff8fb0', '#ffd34d'], rows: [
    '.#...#.', '.##.##.', '.##o##.', '..###..', '...g...', '...g...', '..ggg..'] },
  { id: 'leaf', name: 'はっぱ', rarity: 1, c: ['#6fae6f', '#3f8a3f'], rows: [
    '....###', '..#####', '.##o###', '.#o####', '#o####.', 'o###...', 'o......'] },
  { id: 'feather', name: 'とりの はね', rarity: 1, c: ['#9fd8ff', '#ffffff'], rows: [
    '.....##', '....###', '...###.', '..###..', '.###...', '.#o....', 'o......'] },
  { id: 'shell', name: 'かいがら', rarity: 2, c: ['#ffb7a0', '#d97a60'], rows: [
    '..###..', '.#o#o#.', '#o#o#o#', '#######', '.#####.', '..###..', '.......'] },
  { id: 'marble', name: 'ビーだま', rarity: 2, c: ['#6fb8ff', '#ffffff'], rows: [
    '..###..', '.#oo##.', '##o####', '#######', '#######', '.#####.', '..###..'] },
  { id: 'bone', name: 'さかなの ほね', rarity: 2, c: ['#fff0d6', '#d9c9a8'], rows: [
    '.......', '.#.#.#.', '#######', '.#.#.#.', '.......', '.......', '.......'] },
  { id: 'yarn', name: 'けいとだま', rarity: 2, c: ['#e85a6a', '#a83a48'], rows: [
    '..###..', '.#o###.', '##o#o##', '#o###o#', '##o#o##', '.#####.', '..###..'] },
  { id: 'bell', name: 'ちいさな すず', rarity: 3, c: ['#ffd34d', '#b8902a'], rows: [
    '..###..', '.#####.', '.#####.', '#######', 'ooooooo', '..ooo..', '...o...'] },
  { id: 'star', name: 'ほしの かけら', rarity: 3, c: ['#fff6a0', '#ffd34d'], rows: [
    '...#...', '...#...', '#######', '.#####.', '..###..', '.##.##.', '.#...#.'] },
  { id: 'pebble', name: 'きれいな いし', rarity: 1, c: ['#b8b0c0', '#8a8296'], rows: [
    '.......', '..###..', '.#####.', '#o#####', '#######', '.#####.', '.......'] },
  { id: 'twig', name: 'こえだ', rarity: 1, c: ['#a8703a', '#7a4a1e'], rows: [
    '......#', '.....#.', '....#.g', '...#.gg', '..#..g.', '.#.....', '#......'] },
  { id: 'button', name: 'ボタン', rarity: 1, c: ['#7ab8e0', '#2f5f85'], rows: [
    '.#####.', '#######', '##o#o##', '#######', '##o#o##', '#######', '.#####.'] },
  { id: 'cookie', name: 'ビスケット', rarity: 1, c: ['#d9a066', '#8a5a2a'], rows: [
    '.#####.', '##o####', '####o##', '#o#####', '####o##', '##o####', '.#####.'] },
  { id: 'mushroom', name: 'きのこ', rarity: 1, c: ['#e8412f', '#fff0d6'], rows: [
    '..###..', '.#o#o#.', '#######', '.ooooo.', '..ooo..', '..ooo..', '..ooo..'] },
  { id: 'ribbon', name: 'リボン', rarity: 2, c: ['#ff7aa8', '#c94a78'], rows: [
    '.......', '##...##', '###o###', '##ooo##', '###o###', '##...##', '.......'] },
  { id: 'coin', name: 'ちいさな コイン', rarity: 2, c: ['#ffd34d', '#b8902a'], rows: [
    '..###..', '.#ooo#.', '#o###o#', '#o#o#o#', '#o###o#', '.#ooo#.', '..###..'] },
  { id: 'key', name: 'ふるい かぎ', rarity: 2, c: ['#c9ced6', '#8a8f99'], rows: [
    '.###...', '#...#..', '#...#..', '.###...', '..#....', '..##...', '..#.#..'] },
  { id: 'butterfly', name: 'ちょうちょ', rarity: 2, c: ['#b58aff', '#3b2a2a'], rows: [
    '#.....#', '##...##', '###o###', '.#ooo#.', '###o###', '##...##', '#.....#'] },
  { id: 'petal', name: 'さくらの はなびら', rarity: 2, c: ['#ffc0d6', '#ff8fb0'], rows: [
    '.......', '..#.#..', '.#####.', '.##o##.', '..###..', '...#...', '.......'] },
  { id: 'fish', name: 'ちいさな さかな', rarity: 2, c: ['#6fb8ff', '#ffffff'], rows: [
    '.......', '..###.#', '.#o####', '#######', '.#####.', '..###.#', '.......'] },
  { id: 'crown', name: 'ちいさな おうかん', rarity: 3, c: ['#ffd34d', '#e8412f'], rows: [
    '#.#.#.#', '#######', '#o###o#', '#######', '.......', '.......', '.......'] },
  { id: 'diamond', name: 'きらきらの いし', rarity: 3, c: ['#9fe8ff', '#ffffff'], rows: [
    '..###..', '.#o###.', '#######', '.#####.', '..###..', '...#...', '.......'] },
  { id: 'moon', name: 'つきの かけら', rarity: 3, c: ['#fff6a0', '#ffd34d'], rows: [
    '..####.', '.###...', '###....', '###....', '###....', '.###...', '..####.'] },
  { id: 'clover', name: 'よつばの クローバー', rarity: 3, c: ['#4fc46a', '#2f8a4a'], rows: [
    '.##.##.', '###.###', '.#####.', '..#o#..', '.#####.', '###.###', '.##.##.'] },
];
function drawItem(g, it, x, y, s, silhouette) {
  const pal = { '#': it.c[0], o: it.c[1], g: '#4f9a4f' };
  it.rows.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch === '.') return;
    g.fillStyle = silhouette ? '#3b3350' : pal[ch];
    g.fillRect(x + i * s, y + j * s, s, s);
  }));
}
