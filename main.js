(() => {
  let W = 120, H = 190, OY = 0; // 画面の論理サイズ(画面に合わせて変わる)。OY は縦に余ったぶん
  const WH = 190, SCALE = 2;  // 部屋の高さ・猫の拡大率
  const WW = 360; // 部屋全体の横幅(画面の3倍)。猫を追ってスクロールする
  const FOOT = 56; // 猫の上端から足元までの高さ
  const YMIN = 142 - FOOT, YMAX = 182 - FOOT; // 奥〜手前(猫の上端y)
  const cam = { x: 0, focusX: null, focusT: 0 };
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');

  // 画面いっぱいに、整数倍で拡大する。余った縦は、壁を上に伸ばして埋める
  function fit() {
    const wrap = document.getElementById('wrap');
    const availW = wrap.clientWidth || innerWidth, availH = wrap.clientHeight || innerHeight;
    const s = Math.max(2, Math.min(5, Math.floor(Math.min(availW / 100, availH / WH))));
    W = Math.max(100, Math.min(180, Math.floor(availW / s)));
    H = Math.max(WH, Math.min(WH + 70, Math.floor(availH / s)));
    OY = H - WH;
    canvas.width = W; canvas.height = H;
    canvas.style.width = W * s + 'px';
    canvas.style.height = H * s + 'px';
    cam.x = Math.max(0, Math.min(cam.x, WW - W));
  }
  addEventListener('resize', fit); fit();

  // ---- お世話の置き場所(部屋の中の位置。fy は足元のy)----
  const GIFT_X = [200, 232, 264], GIFT_Y = 166, GIFT_C = 232;
  const OBJ = {
    food: { x: 60, fy: 166 },
    water: { x: 92, fy: 166 },
    box: { x: 6, fy: 172 },
  };

  // ---- 保存データ ----
  const KEY = 'dotcat.v1';
  const DEFAULT = {
    name: '', love: 30,
    hunger: 80, thirst: 80, bladder: 20, // 満腹度・水分・トイレ我慢(高いほど行きたい)
    bowlFood: 100, bowlWater: 100, dirt: 0, // ごはん皿・水皿の残量、トイレの汚れ
    last: 0, gone: false, giftAcc: 0, coat: null,
    gifts: [], book: {}, diary: [], // おみやげ・たからばこ・留守中の日記
    visits: 0, a2hsDone: false,      // 開いた回数・ホーム画面の案内をすませたか
  };
  let raw = {};
  try { raw = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { raw = {}; }
  const save = Object.assign({}, DEFAULT, raw);
  if (!raw.last) save.love = Math.max(save.love, 30); // 旧データの引き継ぎ
  save.gone = false; // 猫はいなくならない
  save.visits = (save.visits || 0) + 1;
  // 最初に来る猫の毛色はランダム。それ以前から飼っている猫は茶トラのまま
  if (!save.coat || !COATS[save.coat]) save.coat = save.name ? 'orange' : COAT_IDS[Math.floor(Math.random() * COAT_IDS.length)];
  save.gifts = (save.gifts || []).slice(); save.book = Object.assign({}, save.book); save.diary = (save.diary || []).slice();
  // 保存できない環境(ブラウザの設定など)でも、ゲームは止めない
  let saveFailed = false;
  const persist = () => {
    save.last = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { saveFailed = true; }
  };
  const nameEl = document.getElementById('name');
  const showName = () => { nameEl.textContent = save.name ? `${save.name}  ${'♥'.repeat(Math.min(5, Math.ceil(save.love / 20)))}` : ''; };

  // 動作確認用:URLに ?speed=60 を付けると、空腹などが60倍の速さで進む(手元で開いたときだけ有効)
  const isLocal = ['localhost', '127.0.0.1', '[::1]', ''].includes(location.hostname);
  const TS = (isLocal && Number(new URLSearchParams(location.search).get('speed'))) || 1;

  // ---- 欲求の経過(1時間あたり)----
  const RATE = { hunger: 10, thirst: 12, bladder: 8, lovePerBad: 2 };
  function tickNeeds(h) {
    save.hunger = Math.max(0, save.hunger - RATE.hunger * h);
    save.thirst = Math.max(0, save.thirst - RATE.thirst * h);
    save.bladder = Math.min(100, save.bladder + RATE.bladder * h);
    let bad = 0;
    if (save.hunger <= 0) bad++;
    if (save.thirst <= 0) bad++;
    if (save.bladder >= 100) bad++;
    save.love = Math.max(0, save.love - RATE.lovePerBad * bad * h);
  }
  const eatEffect = () => { const a = Math.min(save.bowlFood, 45); save.bowlFood -= a; save.hunger = Math.min(100, save.hunger + a); };
  const drinkEffect = () => { const a = Math.min(save.bowlWater, 45); save.bowlWater -= a; save.thirst = Math.min(100, save.thirst + a); };
  const toiletEffect = () => { save.bladder = 0; save.dirt = Math.min(100, save.dirt + 25); };

  // ---- 通知(画面上部のふきだし)----
  const toastEl = document.getElementById('toast');
  const toastQ = []; let toastBusy = false;
  function nextToast() {
    const m = toastQ.shift();
    if (!m) { toastBusy = false; toastEl.style.opacity = 0; return; }
    toastBusy = true; toastEl.textContent = m; toastEl.style.opacity = 1;
    setTimeout(nextToast, 3000);
  }
  function toast(msg) { toastQ.push(msg); if (!toastBusy) nextToast(); }

  // ---- 待つ楽しみ:アプリを閉じている間、猫は自分で過ごし、おみやげを持ってくる ----
  function pickItem() {
    // まだ持っていないものは、少し出やすい(同じものばかりにならないように)
    const w = ITEMS.map((it) => (it.rarity === 1 ? 3 : it.rarity === 2 ? 2 : 0.6 + save.love / 60) * (save.book[it.id] ? 1 : 1.6));
    let r = Math.random() * w.reduce((x, y) => x + y, 0);
    for (let i = 0; i < ITEMS.length; i++) { if ((r -= w[i]) <= 0) return ITEMS[i].id; }
    return ITEMS[0].id;
  }
  const GIFT_HOURS = 8; // おみやげは8時間ごとに1つ(最大3つまでためておく)
  const startToasts = [];

  // ---- 日記(日付ごとに最大7日分)----
  const DAYS = '日月火水木金土';
  const dayLabel = (d) => `${d.getMonth() + 1}/${d.getDate()}(${DAYS[d.getDay()]})`;
  const slotOf = (h) => (h >= 5 && h < 10 ? '朝' : h >= 10 && h < 16 ? '昼' : h >= 16 && h < 19 ? '夕' : '夜');
  const POOL = {
    朝: ['あさひの あたる まどべで のびを していた', 'ねぼけながら かおを あらっていた', 'あさごはんを まっているみたいだった', 'カーテンの かげで まるまっていた'],
    昼: ['ひなたで うとうと していた', 'まどの そとの とりを じっと みていた', 'ざぶとんの うえで まるくなっていた', 'ちょうちょを おいかけていた', 'ほんだなの したを のぞきこんでいた'],
    夕: ['ゆうやけを ながめていた', 'しっぽを おいかけて くるくる していた', 'ラグの うえで ごろごろ していた'],
    夜: ['ぐっすり ねむっていた', 'つきを みながら ゆったり していた', 'はこに はいろうとして しっぱいしていた', 'よなかに すこし はしりまわっていた'],
  };
  const pickOf = (arr) => arr[Math.floor(Math.random() * arr.length)];
  function writeDiary(startMs, endMs, info, newGifts) {
    const begin = Math.max(startMs, endMs - 7 * 24 * 3600000);
    const days = new Map(); // 日付 -> { ts, slots }
    for (let t = begin; t < endMs; t += 3600000) {
      const d = new Date(t), key = dayLabel(d);
      if (!days.has(key)) days.set(key, { ts: new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(), slots: [] });
      const sl = slotOf(d.getHours());
      if (!days.get(key).slots.includes(sl)) days.get(key).slots.push(sl);
    }
    const todayKey = dayLabel(new Date(endMs));
    let todayLines = [];
    days.forEach((v, key) => {
      const lines = [];
      v.slots.forEach((sl) => { if (Math.random() < 0.75) { let l = pickOf(POOL[sl]); if (!lines.includes(l)) lines.push(l); } });
      if (!lines.length) lines.push(pickOf(POOL[v.slots[0]]));
      let out = lines.slice(0, 3);
      if (key === todayKey) { // いちばん新しい日には、お世話の様子も書く
        const extra = [];
        if (newGifts > 0) extra.push('なにかを くわえて もってきたみたい!');
        if (info.ate) extra.push('ごはんを もぐもぐ たべていた');
        if (info.drank) extra.push('おみずを ぺろぺろ のんでいた');
        if (info.starved) extra.push('ごはんが なくて ちょっと さびしそうだった');
        else if (info.thirsty) extra.push('おみずが なくて ちょっと さびしそうだった');
        if (save.love < 15) extra.push('すこし そっけない ようす…');
        out = extra.concat(out).slice(0, 4);
        todayLines = out;
      }
      const exist = save.diary.find((e) => e.d === key);
      if (exist) exist.l = exist.l.concat(out).slice(0, 8);
      else save.diary.push({ d: key, ts: v.ts, l: out });
    });
    save.diary.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    save.diary = save.diary.slice(0, 7);
    return todayLines;
  }
  if (raw.last) {
    const away = (Date.now() - raw.last) / 3600000;
    const info = { ate: 0, drank: 0, toilet: 0, starved: false, thirsty: false };
    // 欲求の経過(最大10時間分)。猫は皿やトイレを自分で使う
    for (let i = 0; i < Math.min(away, 10) / 0.25; i++) {
      if (save.hunger < 55) { if (save.bowlFood > 0) { eatEffect(); info.ate++; } else if (save.hunger < 30) info.starved = true; }
      if (save.thirst < 55) { if (save.bowlWater > 0) { drinkEffect(); info.drank++; } else if (save.thirst < 30) info.thirsty = true; }
      if (save.bladder > 70 && save.dirt < 80) { toiletEffect(); info.toilet++; }
      tickNeeds(0.25);
    }
    // おみやげ:離れていた時間をためて、8時間ごとに1つ
    save.giftAcc = (save.giftAcc || 0) + away;
    let newGifts = 0;
    while (save.giftAcc >= GIFT_HOURS && save.gifts.length < 3) { save.giftAcc -= GIFT_HOURS; save.gifts.push(pickItem()); newGifts++; }
    if (save.gifts.length >= 3) save.giftAcc = Math.min(save.giftAcc, GIFT_HOURS);

    if (away >= 0.5) {
      const todayLines = writeDiary(raw.last, Date.now(), info, newGifts);
      todayLines.forEach((m, i) => startToasts.push(i === 0 ? `${save.name || 'ねこ'}は、${m}` : m));
    }
  }

  const hello = document.getElementById('hello');
  if (!save.name) hello.style.display = 'flex';
  document.getElementById('ok').onclick = () => {
    save.name = document.getElementById('nameInput').value.trim() || 'ミケ';
    persist(); showName(); hello.style.display = 'none'; ensureAudio();
  };
  showName();
  persist();

  // ---- データを守る ----
  // ・保存できない環境(プライベートモードの一部など)では、そのことを1回だけ知らせる
  // ・iPhoneのSafariは、開かないと保存データを消すことがある。ホーム画面に追加したアプリなら消えない
  if (saveFailed) startToasts.push('このブラウザでは、データを ほぞんできないみたい。プライベートモードを やめてね');
  if (save.name && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  (function homeScreenTip() {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
    if (!ios || standalone || !save.name || save.visits < 2 || save.a2hsDone) return;
    const box = document.getElementById('a2hs');
    setTimeout(() => { box.style.display = 'flex'; }, 2500);
    document.getElementById('a2hsClose').onclick = () => { box.style.display = 'none'; save.a2hsDone = true; persist(); };
  })();

  // ---- 音(Web Audio、素材ファイル不要)----
  let ac = null, muted = false;
  function ensureAudio() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const A = window.AudioContext || window.webkitAudioContext;
    if (!A) return;
    ac = new A();
  }
  // やわらかい声。高さ・長さの違う数種類を、毎回ほんの少し音程を変えて鳴らす
  function tone(pts, vol, cutoff, delay) {
    if (!ac || muted) return;
    const t = ac.currentTime + (delay || 0);
    const o = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter();
    o.type = 'sine'; lp.type = 'lowpass'; lp.frequency.value = cutoff;
    pts.forEach(([dt, f], i) => (i === 0 ? o.frequency.setValueAtTime(f, t + dt) : o.frequency.linearRampToValueAtTime(f, t + dt)));
    const end = pts[pts.length - 1][0] + 0.06;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, t + end);
    o.connect(lp); lp.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + end + 0.02);
  }
  // 息の音(フーッ):ノイズを帯域でしぼった、短い音
  function hiss(delay, dur, vol) {
    if (!ac || muted) return;
    const t = ac.currentTime + (delay || 0), n = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource(), bp = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = buf; bp.type = 'bandpass'; bp.frequency.value = 4200; bp.Q.value = 0.7;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.05);
    g.gain.linearRampToValueAtTime(0.0005, t + dur);
    src.connect(bp); bp.connect(g); g.connect(ac.destination); src.start(t);
  }
  function meow(kind) {
    if (!ac || muted) return;
    kind = kind || ['mew', 'mew', 'low', 'chirp', 'soft'][Math.floor(Math.random() * 5)];
    const p = 0.92 + Math.random() * 0.2;
    if (kind === 'mew') tone([[0, 820 * p], [0.07, 1050 * p], [0.2, 900 * p]], 0.035, 1400);              // みゃ
    else if (kind === 'low') tone([[0, 520 * p], [0.14, 650 * p], [0.42, 470 * p]], 0.03, 1000);           // にゃ〜ん(低くのんびり)
    else if (kind === 'chirp') tone([[0, 900 * p], [0.05, 1250 * p], [0.1, 950 * p], [0.16, 1300 * p]], 0.03, 1800); // くるっ(うれしい)
    else if (kind === 'soft') tone([[0, 700 * p], [0.16, 780 * p]], 0.02, 1100);                            // …(ちいさな呼びかけ)
    else if (kind === 'angry') { // フーッ → ンニャッ(小さめ・短め)
      hiss(0, 0.35, 0.05);
      tone([[0, 640 * p], [0.1, 560 * p], [0.26, 420 * p]], 0.03, 900, 0.3);
    }
    else if (kind === 'beg') { // ごはんちょうだい:みゃ、みゃ
      tone([[0, 800 * p], [0.08, 1000 * p], [0.2, 880 * p]], 0.035, 1400);
      tone([[0, 840 * p], [0.08, 1080 * p], [0.24, 900 * p]], 0.035, 1400, 0.32);
    }
  }
  const muteBtn = document.getElementById('mute');
  muteBtn.onclick = (e) => {
    e.stopPropagation(); ensureAudio();
    muted = !muted; muteBtn.classList.toggle('muted', muted);
  };

  // ---- 背景(1回だけ描画。横長の部屋)----
  const bg = document.createElement('canvas'); bg.width = WW; bg.height = WH;
  const wallTop = document.createElement('canvas'); wallTop.width = WW; wallTop.height = 80; // 画面が縦に長いとき、壁を上に伸ばす
  (function drawRoom() {
    const g = bg.getContext('2d');
    const hour = new Date().getHours();
    const night = hour >= 19 || hour < 6;
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    // 壁
    R(0, 0, WW, 120, night ? '#4a3f6b' : '#f3d9b1');
    for (let x = 0; x < WW; x += 12) R(x, 0, 1, 120, night ? '#443a62' : '#ecce9f');
    R(0, 112, WW, 8, night ? '#352c52' : '#c98f5a'); // 幅木
    // 床
    R(0, 120, WW, WH - 120, night ? '#5a3f3a' : '#d9a066');
    {
      const w = wallTop.getContext('2d');
      w.fillStyle = night ? '#4a3f6b' : '#f3d9b1'; w.fillRect(0, 0, WW, 80);
      w.fillStyle = night ? '#443a62' : '#ecce9f'; for (let x = 0; x < WW; x += 12) w.fillRect(x, 0, 1, 80);
    }
    for (let y = 120; y < WH; y += 10) R(0, y, WW, 1, night ? '#4a332f' : '#c28a52');

    const windowAt = (x, seed) => {
      R(x, 20, 34, 40, '#3b2a2a');
      R(x + 2, 22, 30, 36, night ? '#1a1838' : '#9fd8ff');
      if (night) {
        [[6, 8], [20, 6], [26, 20], [10, 28], [16, 16]].forEach(([dx, dy]) => R(x + 2 + dx + seed, y0(dy), 1, 1, '#fff6c0'));
        if (seed === 0) { R(x + 24, 28, 5, 5, '#fff6c0'); R(x + 26, 28, 3, 5, '#1a1838'); }
      } else {
        R(x + 6 + seed, 30, 12, 4, '#fff'); R(x + 10 + seed, 28, 10, 4, '#fff');
      }
      R(x + 16, 22, 2, 36, '#3b2a2a'); R(x + 2, 39, 30, 2, '#3b2a2a');
      R(x - 2, 60, 38, 3, '#a8703a');
    };
    const y0 = (dy) => 22 + dy;
    const frame = (x, y, paw) => {
      R(x, y, 22, 26, '#3b2a2a'); R(x + 2, y + 2, 18, 22, '#fff0d6');
      if (paw) [[8, 14], [12, 14], [6, 10], [14, 10], [10, 17]].forEach(([dx, dy]) => R(x + dx, y + dy, 3, 3, '#d9803a'));
      else { R(x + 5, y + 6, 12, 12, '#9fd8ff'); R(x + 5, y + 14, 12, 4, '#6fae6f'); }
    };
    const plant = (x) => {
      R(x, 96, 12, 16, '#a85a3a'); R(x + 2, 90, 8, 6, '#4f9a4f'); R(x - 2, 84, 6, 8, '#4f9a4f'); R(x + 8, 80, 6, 12, '#3f8a3f');
    };
    const rug = (x, w, c1, c2, c3) => {
      R(x, 158, w, 26, c1); R(x + 2, 160, w - 4, 22, c2);
      R(x + 8, 166, w - 16, 2, c3); R(x + 8, 172, w - 16, 2, c3);
    };
    const shelf = (x) => {
      R(x, 40, 40, 72, '#3b2a2a'); R(x + 2, 42, 36, 68, '#a8703a');
      [42, 62, 82].forEach((y) => R(x + 2, y + 18, 36, 2, '#3b2a2a'));
      const cols = ['#d9534f', '#4f8fd9', '#e8c547', '#6fae6f', '#b06fd9'];
      [42, 62, 82].forEach((y, r) => { for (let i = 0; i < 7; i++) R(x + 4 + i * 5, y + 4 + (i % 3), 4, 14 - (i % 3), cols[(i + r) % 5]); });
    };
    const bed = (x) => {
      R(x, 170, 44, 14, '#3b2a2a'); R(x + 2, 168, 40, 14, '#d98a5a'); R(x + 6, 164, 32, 8, '#f0b88a');
      R(x + 12, 166, 20, 5, '#fff0d6'); R(x + 14, 167, 16, 3, '#f7d9b8');
      R(x + 4, 174, 36, 3, '#b8643a');
    };

    plant(4); frame(18, 30, true);
    windowAt(66, 0);
    rug(190, 84, '#8e4a5e', '#b0657c', '#e8a9b9');
    shelf(130); frame(190, 34, false);
    windowAt(226, 3);
    plant(278); bed(290 - 6);
    frame(318, 30, true); plant(344);
  })();

  // ---- ネコ本体 ----
  const sprites = makeSprites(save.coat);
  const cat = {
    x: WW / 2 - 32, y: 156 - FOOT, dir: 1,
    state: 'idle', t: 0, dur: 2, target: null, targetY: null, after: null,
    speed: 22, frame: 0, ft: 0, sinceTouch: 99, cool: 0, needCool: 0, bubble: 0, fleeFrom: 0,
  };
  const catW = 32 * SCALE;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hour = () => new Date().getHours();
  const toy = { on: false, kind: 'wand', x: 0, y: 150, idle: 0, vx: 0, vy: 0, bat: 0, nipT: 0 };
  let petting = false;

  // 状況に合わせた表情(まばたき・しょんぼり・ワクワク・にっこり)
  function faceFor(base) {
    if (!['idle', 'walk', 'sit', 'groom', 'eat'].includes(base)) return null;
    if (cat.state === 'play') return toy.kind === 'nip' ? 'smile' : 'wow';
    if (performance.now() % 4200 < 140) return 'blink';
    if (save.hunger < 30 || save.thirst < 30 || save.love < 15) return 'sad';
    if (save.love >= 70 && ['idle', 'walk', 'sit'].includes(base)) return 'smile';
    return null;
  }
  const spriteKey = () => ({ toilet: 'sit', play: toy.kind === 'nip' ? 'sit' : 'idle' }[cat.state] || cat.state);

  // お世話コーナー(ごはん・お水・トイレ)の上に、猫がかぶさって休まないようにする
  const ZX0 = OBJ.box.x - 4, ZX1 = OBJ.water.x + 24, LANE = 148;
  const blocked = (x, y) => x + catW - 8 > ZX0 && x + 8 < ZX1 && y + FOOT > LANE;
  function goTo(x, y, after) {
    enter('walk');
    cat.target = clamp(x, 2, WW - catW - 2);
    cat.targetY = clamp(y, YMIN, YMAX);
    cat.after = after; cat.dur = 30;
    if (Math.abs(cat.target - cat.x) > 2) cat.dir = cat.target > cat.x ? 1 : -1;
  }
  const spot = {
    eat: () => [OBJ.food.x - 40, OBJ.food.fy - FOOT + 2],
    drink: () => [OBJ.water.x - 40, OBJ.water.fy - FOOT + 2],
    toilet: () => [OBJ.box.x - 10, OBJ.box.fy - FOOT - 6],
  };
  function startAfter(a) {
    if (a === 'eat' || a === 'drink') {
      const stock = a === 'eat' ? save.bowlFood : save.bowlWater;
      if (stock > 0) {
        enter('eat'); cat.dir = 1; cat.dur = 4.5;
        save.love = Math.min(100, save.love + 1.5); showName();
        a === 'eat' ? eatEffect() : drinkEffect();
        persist();
      } else { wish(); }
    } else if (a === 'toilet') {
      if (save.dirt < 80) { enter('toilet'); cat.dur = 3.5; toiletEffect(); save.love = Math.min(100, save.love + 0.5); persist(); }
      else { wish(); }
    }
  }
  // 困っている:「!」を出して鳴く
  function wish() {
    enter('idle'); cat.dur = 2.5; cat.bubble = 2.5; cat.needCool = 45; meow('beg');
  }
  function needAction() {
    if (cat.needCool > 0) return null;
    if (save.hunger < 55 && Math.random() < 0.6) return 'eat';
    if (save.thirst < 55 && Math.random() < 0.6) return 'drink';
    if (save.bladder > 70 && Math.random() < 0.6) return 'toilet';
    return null;
  }

  function chooseNext() {
    const night = hour() >= 22 || hour() < 6;
    const need = needAction();
    if (need) { const [x, y] = spot[need](); goTo(x, y, need); return; }
    const lacking = (save.hunger < 35 && save.bowlFood <= 0) || (save.thirst < 35 && save.bowlWater <= 0) ||
      (save.bladder > 70 && save.dirt >= 80);
    if (lacking && cat.needCool <= 0 && Math.random() < 0.4) { wish(); return; }
    const w = [
      ['idle', 3], ['walk', 3], ['sit', 2], ['groom', 2], ['sleep', night ? 6 : 1.2],
    ];
    let sum = w.reduce((s, a) => s + a[1], 0), r = Math.random() * sum, pick = 'idle';
    for (const [k, v] of w) { if ((r -= v) <= 0) { pick = k; break; } }
    enter(pick);
    if (pick !== 'walk' && blocked(cat.x, cat.y)) { // コーナーの上なら、先にどいてから休む
      enter('walk'); cat.target = ZX1 - 8; cat.targetY = rnd(YMIN, YMAX); cat.dir = cat.target > cat.x ? 1 : -1;
    }
    if (save.love > 30 && Math.random() < 0.08) meow();
  }
  function enter(s) {
    cat.state = s; cat.t = 0; cat.frame = 0; cat.target = null; cat.targetY = null; cat.speed = 22; cat.after = null;
    cat.dur = {
      idle: rnd(1.5, 3.5), walk: rnd(6, 10), sit: rnd(3, 6), groom: rnd(3, 5), sleep: rnd(10, 20),
      pet: 1, angry: 1.3, eat: 4.5, toilet: 3.5, play: 99,
    }[s];
    if (s === 'walk') {
      cat.target = clamp(cat.x + rnd(-160, 160), 2, WW - catW - 2);
      cat.dir = cat.target > cat.x ? 1 : -1;
      cat.targetY = Math.random() < 0.7 ? rnd(YMIN, YMAX) : cat.y; // 奥・手前にも歩く
    }
  }
  chooseNext();
  cam.x = clamp(cat.x + catW / 2 - W / 2, 0, WW - W);
  if (save.gifts.length) { // おみやげのそばで、猫が待っている
    cat.x = 140; cat.y = 150 - FOOT; cat.dir = 1; enter('sit'); cat.dur = 6;
    cam.x = clamp(GIFT_C - W / 2, 0, WW - W); cam.focusX = GIFT_C; cam.focusT = 3;
  }
  setTimeout(() => startToasts.forEach((m) => toast(m)), 700);

  // ---- 演出 ----
  const hearts = [];
  const zs = [];
  function addHeart(x, y) {
    hearts.push({ x: x === undefined ? cat.x + catW / 2 + rnd(-10, 10) : x, y: y === undefined ? cat.y - 6 + rnd(-4, 4) : y, life: 0 });
  }

  // ---- お世話ボタン ----
  const B = {
    food: document.getElementById('bFood'),
    water: document.getElementById('bWater'),
    box: document.getElementById('bBox'),
    toy: document.getElementById('bToy'),
  };
  const canRespond = (need) => cat.state !== 'angry' && !toy.on && !petting && cat.cool <= 0 && (cat.state !== 'sleep' || need < 40);
  const focusOn = (x) => { cam.focusX = x; cam.focusT = 1.8; };
  function refill(kind) {
    ensureAudio();
    if (save.gone) return;
    const o = kind === 'food' ? OBJ.food : OBJ.water;
    if (kind === 'food') save.bowlFood = 100; else save.bowlWater = 100;
    persist(); focusOn(o.x + 10);
    addHeart(o.x + 6, o.fy - 22); addHeart(o.x + 12, o.fy - 26);
    const need = kind === 'food' ? save.hunger : save.thirst;
    if (need < 70 && canRespond(need)) {
      cat.needCool = 0;
      const k = kind === 'food' ? 'eat' : 'drink';
      const [x, y] = spot[k](); goTo(x, y, k);
    }
  }
  function cleanBox() {
    ensureAudio();
    if (save.gone) return;
    save.dirt = 0; save.love = Math.min(100, save.love + 1); showName(); persist(); focusOn(OBJ.box.x + 22);
    for (let i = 0; i < 3; i++) addHeart(OBJ.box.x + 8 + i * 12, OBJ.box.fy - 28 - i * 3);
    if (save.bladder > 70 && canRespond(save.bladder < 90 ? 100 : 0)) {
      cat.needCool = 0; const [x, y] = spot.toilet(); goTo(x, y, 'toilet');
    }
  }
  function setToy(on, kind) {
    toy.on = on; B.toy.classList.toggle('on', on);
    if (on) {
      toy.kind = kind || 'wand'; toy.vx = toy.vy = 0; toy.bat = 0; toy.nipT = 0;
      toy.x = cam.x + W / 2; toy.y = 150; toy.idle = 0;
      if (petting) { petting = false; petAcc = 0; }
      if (cat.state !== 'angry') enter('idle');
      meow('chirp');
    } else if (cat.state === 'play') {
      enter('sit'); cat.dur = rnd(2, 4);
    }
  }
  B.food.onclick = () => refill('food');
  B.water.onclick = () => refill('water');
  B.box.onclick = cleanBox;
  const toyMenu = document.getElementById('toyMenu');
  B.toy.onclick = () => {
    ensureAudio(); if (save.gone) return;
    if (toy.on) { setToy(false); toyMenu.classList.remove('show'); } else toyMenu.classList.toggle('show');
  };
  toyMenu.querySelectorAll('button').forEach((b) => { b.onclick = () => { ensureAudio(); toyMenu.classList.remove('show'); setToy(true, b.dataset.k); }; });

  const bGift = document.getElementById('bGift');
  bGift.onclick = () => { ensureAudio(); cam.focusX = GIFT_C; cam.focusT = 6; }; // おみやげの場所を見せる
  function updateButtons() {
    bGift.style.display = save.gifts.length ? '' : 'none';
    // 普段は普通の色、少なくなると黄色、なくなりそうなら赤く点滅
    const set = (btn, level, warn) => {
      btn.classList.toggle('warn', warn);
      btn.classList.toggle('low', !warn && level <= 50);
    };
    set(B.food, save.bowlFood, save.bowlFood <= 25 && save.hunger < 70);
    set(B.water, save.bowlWater, save.bowlWater <= 25 && save.thirst < 70);
    set(B.box, 100 - save.dirt, save.dirt >= 60);
  }

  // ---- おみやげ ----
  
  function collectGift(i) {
    const id = save.gifts.splice(i, 1)[0];
    const it = ITEMS.find((x) => x.id === id);
    const first = !save.book[id];
    save.book[id] = (save.book[id] || 0) + 1;
    save.love = Math.min(100, save.love + 1.5);
    persist(); showName();
    for (let k = 0; k < 2; k++) addHeart(GIFT_X[i] + k * 6 - 3, GIFT_Y - 16 - k * 4);
    meow('chirp');
    toast(`${it.name}を もらった!${first ? '  ★はじめて' : ''}`);
    if (ITEMS.every((x) => save.book[x.id])) toast('たからばこが ぜんぶ そろった!');
  }
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function renderBook() {
    const grid = document.getElementById('grid'); grid.innerHTML = '';
    ITEMS.forEach((it) => {
      const got = save.book[it.id];
      const cell = document.createElement('div');
      const cv = document.createElement('canvas'); cv.width = 7; cv.height = 7;
      drawItem(cv.getContext('2d'), it, 0, 0, 1, !got);
      cell.appendChild(cv);
      cell.appendChild(document.createTextNode(got ? `${it.name} ×${got}` : '？？？'));
      grid.appendChild(cell);
    });
    document.getElementById('cnt').textContent = `${ITEMS.filter((x) => save.book[x.id]).length} / ${ITEMS.length} あつめたよ`;
    const dbox = document.getElementById('diaryBox');
    if (!save.diary.length) { dbox.textContent = 'まだ にっきは ないよ。しばらく るすに してみてね。'; return; }
    dbox.innerHTML = `<b>${esc(save.name || 'ねこ')}の るすばん にっき</b><br>`;
    save.diary.forEach((e) => { dbox.innerHTML += `<br><b>${esc(e.d)}</b><br>` + e.l.map((x) => '・' + esc(x)).join('<br>') + '<br>'; });
  }
  const showTab = (id) => {
    document.getElementById('cnt').style.display = id === 'pGrid' ? 'block' : 'none';
    ['pGrid', 'pDiary', 'pName'].forEach((p) => { document.getElementById(p).style.display = p === id ? (p === 'pName' ? 'flex' : 'block') : 'none'; });
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === id));
  };
  document.querySelectorAll('#tabs button').forEach((b) => { b.onclick = () => showTab(b.dataset.t); });
  const renameInput = document.getElementById('renameInput');
  document.getElementById('bBook').onclick = () => { showTab('pGrid'); renderBook(); renameInput.value = save.name || ''; document.getElementById('book').style.display = 'flex'; };
  document.getElementById('renameOk').onclick = () => {
    const n = renameInput.value.trim();
    if (!n || n === save.name) { renameInput.value = save.name || ''; return; }
    save.name = n; persist(); showName(); renderBook(); // 過去の日記は、書いたときのまま
    toast(`これからは「${n}」だね`);
  };
  document.getElementById('closeBook').onclick = () => { document.getElementById('book').style.display = 'none'; };

  // なつき度が低い猫は、触られると逃げることがある(そっけない)
  function shy(p) {
    cat.cool = 2; cat.fleeFrom = p.x;
    const away = cat.x + catW / 2 < p.x ? -1 : 1;
    enter('walk'); cat.speed = 45;
    cat.target = clamp(cat.x + away * rnd(60, 110), 2, WW - catW - 2);
    cat.targetY = rnd(YMIN, YMAX); cat.dir = cat.target > cat.x ? 1 : -1; cat.dur = 5;
    petting = false; petAcc = 0;
  }

  // ---- 入力(なでる)----
  let down = false, lastPt = null, petAcc = 0, petHeartT = 0;
  const toLogical = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * W + cam.x, y: (e.clientY - r.top) / r.height * H - OY };
  };
  // 触った場所(頭・しっぽ・おなか・からだ)。スプライト座標(32x32、右向き)で判定
  const ZONES = {
    stand: { head: [19, 5, 11, 13], tail: [0, 10, 9, 12], belly: [9, 20, 11, 6] },
    sit:   { head: [16, 3, 12, 14], tail: [0, 22, 8, 7],  belly: [12, 19, 5, 9] },
    sleep: { head: [17, 16, 11, 13], tail: [0, 20, 8, 9], belly: null },
  };
  const ZONE_OF = {
    idle: 'stand', walk: 'stand', angry: 'stand', eat: 'stand', play: 'stand',
    sit: 'sit', groom: 'sit', pet: 'sit', toilet: 'sit', sleep: 'sleep',
  };
  const inRect = (lx, ly, r, pad) => r && lx >= r[0] - pad && lx < r[0] + r[2] + pad && ly >= r[1] - pad && ly < r[1] + r[3] + pad;
  function zoneAt(p) {
    let lx = (p.x - cat.x) / SCALE;
    if (cat.dir < 0) lx = 32 - lx;
    const ly = (p.y - cat.y) / SCALE;
    const z = ZONES[ZONE_OF[cat.state]];
    if (inRect(lx, ly, z.head, 1)) return 'head';
    if (inRect(lx, ly, z.tail, 2)) return 'tail';
    if (inRect(lx, ly, z.belly, 0)) return 'belly';
    return 'body';
  }
  function getAngry(p) {
    save.love = Math.max(1, save.love - 4); // 怒らせただけでは、いなくならない
    persist(); showName();
    petting = false; petAcc = 0;
    enter('angry'); cat.cool = 3; cat.fleeFrom = p.x; meow('angry');
    cat.dir = p.x > cat.x + catW / 2 ? 1 : -1; // 触られた方をにらむ
  }
  const onCat = (p) => p.x > cat.x - 4 && p.x < cat.x + catW + 4 && p.y > cat.y - 8 && p.y < cat.y + 32 * SCALE + 4;
  const moveToy = (p, isDown) => {
    toy.idle = 0;
    if (toy.kind === 'ball') { // ボールは、タップした方へ転がす
      if (isDown) { toy.vx = clamp((p.x - toy.x) * 1.4, -200, 200); toy.vy = clamp((p.y - toy.y) * 1.4, -120, 120); }
      return;
    }
    toy.x = clamp(p.x, 6, WW - 6); toy.y = clamp(p.y, 128, 182);
  };

  canvas.addEventListener('pointerdown', (e) => {
    ensureAudio(); toyMenu.classList.remove('show');
    if (save.gone) return;
    const p = toLogical(e); lastPt = p; down = true; canvas.setPointerCapture(e.pointerId);
    for (let i = 0; i < save.gifts.length; i++) {
      if (Math.abs(p.x - GIFT_X[i]) < 14 && Math.abs(p.y - (GIFT_Y - 8)) < 14) { collectGift(i); return; }
    }
    if (!toy.on) {
      const inR = (o, w, top) => p.x >= o.x - 4 && p.x <= o.x + w && p.y >= o.fy - top && p.y <= o.fy + 4;
      if (inR(OBJ.food, 24, 32)) { refill('food'); return; }
      if (inR(OBJ.water, 24, 32)) { refill('water'); return; }
      if (inR(OBJ.box, 44, 26)) { cleanBox(); return; }
    }
    if (toy.on) { moveToy(p, true); return; }
    if (onCat(p)) {
      if (cat.state !== 'angry' && cat.cool <= 0 && zoneAt(p) === 'tail') getAngry(p);
    } else if (save.love >= 30 && cat.state !== 'sleep' && cat.state !== 'angry' && cat.cool <= 0) {
      // なついていれば、タップした場所に寄ってくる(奥行きも)
      goTo(p.x - catW / 2, p.y - 50, null); cat.dur = 8;
      if (Math.random() < 0.5) meow('soft');
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!down || save.gone) return;
    const p = toLogical(e);
    if (toy.on) { moveToy(p); lastPt = p; return; }
    if (onCat(p) && lastPt && cat.state !== 'angry' && cat.cool <= 0) {
      const zone = zoneAt(p);
      if (save.love < 15 && !petting && cat.sinceTouch > 1.5 && Math.random() < 0.5) { shy(p); lastPt = p; return; }
      if (zone === 'tail' || (zone === 'belly' && save.love < 40)) {
        getAngry(p);              // しっぽ、なつく前のおなかは怒る
      } else {
        const mul = zone === 'head' ? 1.5 : zone === 'belly' ? 2.5 : 1;
        petAcc += Math.hypot(p.x - lastPt.x, p.y - lastPt.y) * mul;
        cat.sinceTouch = 0;
      }
    }
    lastPt = p;
  });
  const up = () => { down = false; lastPt = null; };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  // ---- 更新 ----
  function stepMove(dt) {
    const dx = cat.target - cat.x, dy = (cat.targetY === null ? cat.y : cat.targetY) - cat.y;
    const dist = Math.hypot(dx, dy);
    if (dist >= 1.5) {
      const step = Math.min(dist, cat.speed * dt);
      cat.x += dx / dist * step; cat.y += dy / dist * step;
      if (Math.abs(dx) > 2) cat.dir = dx > 0 ? 1 : -1;
    }
    return dist;
  }
  function stepAnim(interval) {
    if (cat.ft > interval) { cat.ft = 0; cat.frame++; }
  }

  let saveT = 0;
  function update(dt) {
    tickNeeds(dt / 3600 * TS);
    save.giftAcc = (save.giftAcc || 0) + dt / 3600 * TS;
    if (save.giftAcc >= GIFT_HOURS) {
      if (save.gifts.length < 3) {
        save.giftAcc -= GIFT_HOURS; save.gifts.push(pickItem()); persist();
        toast(`${save.name || 'ねこ'}が なにかを もってきた!`); meow('chirp');
      } else save.giftAcc = GIFT_HOURS;
    }
    saveT += dt; if (saveT > 20) { saveT = 0; persist(); showName(); }

    cat.sinceTouch += dt;
    cat.ft += dt;
    cat.cool = Math.max(0, cat.cool - dt);
    cat.needCool = Math.max(0, cat.needCool - dt);
    cat.bubble = Math.max(0, cat.bubble - dt);

    // 怒り:しばらく怒ってから、触った人から逃げる
    if (cat.state === 'angry') {
      cat.t += dt; stepAnim(0.12);
      if (cat.t > cat.dur) {
        const away = cat.x + catW / 2 < cat.fleeFrom ? -1 : 1;
        enter('walk'); cat.speed = 60;
        cat.target = clamp(cat.x + away * rnd(90, 150), 2, WW - catW - 2);
        cat.targetY = rnd(YMIN, YMAX); cat.dir = cat.target > cat.x ? 1 : -1; cat.dur = 6;
      }
      return;
    }

    // おもちゃ:じゃらし・ボール・またたび
    if (toy.on) {
      toy.idle += dt;
      if (toy.idle > (toy.kind === 'wand' ? 25 : 45)) { setToy(false); return; }
      if (toy.kind === 'ball') { // 転がって、はしでバウンドして、だんだん止まる
        toy.x += toy.vx * dt; toy.y += toy.vy * dt;
        const f = Math.pow(0.25, dt); toy.vx *= f; toy.vy *= f;
        if (toy.x < 6) { toy.x = 6; toy.vx = Math.abs(toy.vx) * 0.7; } else if (toy.x > WW - 6) { toy.x = WW - 6; toy.vx = -Math.abs(toy.vx) * 0.7; }
        if (toy.y < 128) { toy.y = 128; toy.vy = Math.abs(toy.vy) * 0.7; } else if (toy.y > 182) { toy.y = 182; toy.vy = -Math.abs(toy.vy) * 0.7; }
      }
      const tx = clamp(toy.x - catW / 2, 2, WW - catW - 2), ty = clamp(toy.y - FOOT, YMIN, YMAX);
      const far = Math.hypot(tx - cat.x, ty - cat.y) > 14;
      if (far) {
        if (cat.state !== 'walk') { enter('walk'); cat.dur = 999; }
        cat.speed = toy.kind === 'ball' ? 60 : 42; cat.target = tx; cat.targetY = ty;
        stepMove(dt); stepAnim(0.12);
      } else {
        if (cat.state !== 'play') enter('play');
        cat.dir = toy.x > cat.x + catW / 2 ? 1 : -1;
        stepAnim(toy.kind === 'nip' ? 0.5 : 0.16);
        if (toy.kind === 'ball') { // ぽんっと前足でたたく
          toy.bat -= dt;
          if (toy.bat <= 0) { toy.bat = rnd(0.5, 0.9); toy.vx = cat.dir * rnd(70, 120); toy.vy = rnd(-40, 40); if (Math.random() < 0.3) meow('chirp'); }
        }
        if (toy.kind === 'nip') { // うっとり。しばらくして満足する
          toy.nipT += dt;
          if (toy.nipT > 12) { setToy(false); toast(`${save.name || 'ねこ'}は まんぞくした みたい`); return; }
        }
        save.love = Math.min(100, save.love + dt * (toy.kind === 'nip' ? 0.3 : 0.4));
        petHeartT += dt;
        if (petHeartT > (toy.kind === 'nip' ? 0.6 : 0.9)) { petHeartT = 0; addHeart(); showName(); }
      }
      return;
    }

    // なでられ判定
    const isPet = cat.sinceTouch < 0.5 && petAcc > 0;
    if (isPet) {
      if (!petting) {
        petting = true;
        if (cat.state !== 'pet') { cat.state = 'pet'; cat.frame = 0; }
        meow(Math.random() < 0.6 ? 'soft' : 'mew');
      }
      // なつき度:最初は上がりにくく、なつくほど上がりやすい
      save.love = Math.min(100, save.love + petAcc * (0.004 + save.love * 0.00008));
      petAcc = 0;
      petHeartT += dt;
      if (petHeartT > 0.35) { petHeartT = 0; addHeart(); }
    } else if (petting && cat.sinceTouch >= 0.8) {
      petting = false; persist(); showName();
      enter('sit'); cat.dur = rnd(3, 5);
    }
    if (petting) { stepAnim(0.28); return; }

    cat.t += dt;
    if (cat.state === 'walk' && cat.target !== null) {
      if (!cat.after) { // ただの散歩は、コーナーの前を通らず、奥を回る
        const ty = cat.targetY === null ? cat.y : cat.targetY;
        if (blocked(cat.x, cat.y) || blocked(cat.target, ty)) cat.targetY = Math.min(ty, LANE - FOOT);
      }
      const dist = stepMove(dt);
      if (dist < 1.5) { if (cat.after) startAfter(cat.after); else chooseNext(); }
    }
    if (cat.t > cat.dur && cat.state !== 'walk') chooseNext();
    else if (cat.state === 'walk' && cat.t > cat.dur + 6) chooseNext();

    if (cat.state === 'sleep' && Math.random() < dt * 0.5) zs.push({ x: cat.x + catW - 6, y: cat.y + 20, life: 0 });
    stepAnim(cat.state === 'walk' ? (cat.speed > 30 ? 0.1 : 0.18) : cat.state === 'sleep' ? 0.9 : cat.state === 'eat' ? 0.3 : 0.5);
  }

  // ---- 描画 ----
  function px(g, rows, x, y, color, s) {
    s = s || 1;
    g.fillStyle = color;
    rows.forEach((row, j) => [...row].forEach((c, i) => { if (c === '#') g.fillRect(x + i * s, y + j * s, s, s); }));
  }
  const ZROWS = ['###', '..#', '.#.', '#..', '###'];
  const BANG = ['.#.', '.#.', '.#.', '...', '.#.'];

  // 猫の影:姿勢ごとに幅と位置を変えた、ドット絵の楕円(階段状)
  const SHADOW = { // [スプライト上の中心x, 半分の幅]
    idle: [14, 11], walk: [14, 11], angry: [14, 11], eat: [13, 11], play: [14, 11],
    sit: [11, 8], groom: [11, 8], pet: [11, 8], toilet: [11, 8], sleep: [14, 12],
  };
  function drawCatShadow() {
    const [c, hw] = SHADOW[cat.state] || SHADOW.idle;
    const cxw = cat.dir > 0 ? cat.x + c * SCALE : cat.x + catW - c * SCALE; // 向きに合わせて反転
    const w = hw * 2 * SCALE, gy = Math.round(cat.y) + 28 * SCALE - 1;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    [[0.7, 0], [1, 1], [1, 2], [0.7, 3]].forEach(([f, r]) => {
      const ww = Math.round(w * f);
      ctx.fillRect(Math.round(cxw - ww / 2), gy + r, ww, 1);
    });
  }
  // ---- お世話コーナー(ごはん・お水・トイレ)----
  const FISH = ['.......#.', '.#####.##', '#########', '.#####.##', '.......#.'];
  const DROP = ['..#..', '.###.', '#####', '#####', '.###.'];
  const DROP_B = ['..#..', '..#..', '.###.', '#####', '#####', '#####', '.###.'];
  const POOP = ['...#...', '..###..', '..###..', '.#####.', '#######', '#######'];
  const FISH_B = ['.......#.', '.#####.##', '#########', '.#####.##', '.......#.'];

  // 吹き出し:足りなくなったときに、中身のマークで知らせる
  function bubble(x, y, icon, color) {
    ctx.fillStyle = '#3b2a2a'; ctx.fillRect(x, y, 17, 14);
    ctx.fillStyle = '#fff'; ctx.fillRect(x + 1, y + 1, 15, 12);
    ctx.fillStyle = '#3b2a2a'; ctx.fillRect(x + 7, y + 14, 3, 2);
    ctx.fillStyle = '#fff'; ctx.fillRect(x + 8, y + 14, 1, 1);
    const w = icon[0].length, h = icon.length;
    px(ctx, icon, x + Math.floor((17 - w) / 2), y + Math.floor((14 - h) / 2), color);
    ctx.fillStyle = '#e8412f'; ctx.fillRect(x + 15, y - 4, 3, 5); ctx.fillRect(x + 15, y + 2, 3, 2); // 赤い「!」
  }

  function drawObjects() {
    const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
    const t = performance.now(), blink = Math.floor(t / 450) % 2 === 0;
    const bowl = (o, level, food) => {
      const mat = food ? ['#c0583c', '#e08a68'] : ['#4f86c0', '#7eaede'];
      // ランチョンマット
      R(o.x - 4, o.fy - 2, 28, 7, '#3b2a2a'); R(o.x - 3, o.fy - 1, 26, 5, mat[0]); R(o.x - 3, o.fy - 1, 26, 1, mat[1]);
      // うつわ
      R(o.x, o.fy - 9, 20, 11, '#3b2a2a'); R(o.x + 1, o.fy - 8, 18, 9, '#f4efe6');
      R(o.x + 1, o.fy - 1, 18, 2, '#d9d0c2'); R(o.x + 1, o.fy - 8, 18, 1, '#ffffff');
      R(o.x + 2, o.fy - 8, 16, 3, '#6b625a'); // ふちの内側(中が見える)
      if (food) {
        const h = Math.ceil(level / 100 * 4); // カリカリの山
        for (let k = 0; k < h; k++) R(o.x + 2 + k * 2, o.fy - 9 - k, 16 - k * 4, 2, '#a0522d');
        if (h > 0) { R(o.x + 6, o.fy - 9, 2, 1, '#cf7d45'); R(o.x + 11, o.fy - 10 - Math.min(h - 1, 1), 2, 1, '#cf7d45'); }
        px(ctx, FISH, o.x + 5, o.fy - 5, '#e8793c'); // 側面に魚のマーク
      } else {
        const h = Math.ceil(level / 100 * 3);
        if (h > 0) { R(o.x + 2, o.fy - 5 - h, 16, h, '#5aaeff'); R(o.x + 3, o.fy - 5 - h, 4, 1, '#d6ecff'); }
        px(ctx, DROP, o.x + 8, o.fy - 5, '#5aaeff'); // 側面に水のしずく
      }
      if (level <= 25 && blink) bubble(o.x + 1, o.fy - 34, food ? FISH : DROP_B, food ? '#e8793c' : '#5aaeff');
    };
    bowl(OBJ.food, save.bowlFood, true);
    bowl(OBJ.water, save.bowlWater, false);

    // トイレ
    const b = OBJ.box;
    R(b.x + 2, b.fy + 1, 40, 1, 'rgba(0,0,0,0.22)'); R(b.x, b.fy + 2, 44, 1, 'rgba(0,0,0,0.22)');
    R(b.x, b.fy - 20, 44, 21, '#3b2a2a'); R(b.x + 1, b.fy - 19, 42, 19, '#6f9bd9');
    R(b.x + 1, b.fy - 19, 42, 2, '#a3c3ee');
    R(b.x + 3, b.fy - 17, 38, 9, '#ecdcae');           // 砂
    [[6, 2], [14, 5], [22, 1], [30, 4], [36, 2], [10, 6]].forEach(([dx, dy]) => R(b.x + 3 + dx, b.fy - 17 + dy, 2, 1, '#cfbc86'));
    R(b.x + 1, b.fy - 8, 42, 9, '#5a82bf');            // 手前の壁
    [[18, 7], [21, 8], [24, 7]].forEach(([dx, dy]) => R(b.x + dx, b.fy - dy, 2, 2, '#ffffff')); // 肉球マーク
    R(b.x + 19, b.fy - 5, 6, 3, '#ffffff');
    const blobs = [[6, 1], [14, 4], [24, 2], [32, 4], [10, 5], [20, 0], [28, 6], [36, 1]];
    blobs.slice(0, Math.ceil(save.dirt / 100 * blobs.length)).forEach(([dx, dy]) => { R(b.x + 3 + dx, b.fy - 17 + dy, 4, 2, '#7a4a2a'); R(b.x + 4 + dx, b.fy - 17 + dy, 2, 1, '#9a6238'); });
    if (save.dirt >= 60) { // においの湯気
      for (let k = 0; k < 3; k++) for (let yy = 0; yy < 9; yy++) R(b.x + 10 + k * 12 + Math.round(Math.sin(t / 280 + k * 2 + yy * 0.7) * 1.6), b.fy - 22 - yy, 1, 1, '#8fbf5a');
    }
    if (save.dirt >= 60 && blink) bubble(b.x + 14, b.fy - 46, POOP, '#7a4a2a');
  }

  function drawGifts() {
    const t = performance.now();
    save.gifts.forEach((id, i) => {
      const it = ITEMS.find((x) => x.id === id);
      const bob = Math.round(Math.sin(t / 300 + i) * 1);
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(GIFT_X[i] - 6, GIFT_Y, 12, 1); ctx.fillRect(GIFT_X[i] - 4, GIFT_Y + 1, 8, 1);
      drawItem(ctx, it, GIFT_X[i] - 7, GIFT_Y - 14 + bob, 2, false);
      if (Math.floor(t / 400 + i) % 2 === 0) { ctx.fillStyle = '#fff'; ctx.fillRect(GIFT_X[i] + 8, GIFT_Y - 18 + bob, 1, 3); ctx.fillRect(GIFT_X[i] + 7, GIFT_Y - 17 + bob, 3, 1); }
    });
  }
  // ねこじゃらし:上から棒でつるした、羽つきのおもり
  function drawToy() {
    const t = performance.now(), bob = Math.round(Math.sin(t / 120) * 2), sw = Math.round(Math.sin(t / 160));
    const x = Math.round(toy.x), y = Math.round(toy.y) + bob;
    const R = (dx, dy, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x + dx, y + dy, w, h); };
    // 棒(右上へのびる。持ち手は画面の外)
    for (let i = 0; i < 40; i++) { const yy = -24 - Math.round(i * 0.9); R(6 + i, yy, 3, 3, '#3b2a2a'); R(7 + i, yy + 1, 1, 1, '#d9a066'); }
    // ひも
    R(5, -24, 1, 1, '#3b2a2a'); for (let i = 0; i < 16; i++) R(Math.round(5 - i * 0.3 + sw * (i / 16)), -23 + i, 1, 1, '#3b2a2a');
    // 金具と鈴
    R(-2, -8, 5, 3, '#3b2a2a'); R(-1, -7, 3, 1, '#9aa3ad');
    R(-2, -5, 5, 5, '#3b2a2a'); R(-1, -4, 3, 3, '#ffd34d'); R(-1, -4, 1, 1, '#fff2a8');
    // 羽(ふさになって、下にたれる)
    const f = (dx, len, c, c2) => { R(dx + sw, 1, 2, len, '#3b2a2a'); R(dx + sw, 1, 1, len - 1, c); R(dx + 1 + sw, 2, 1, len - 2, c2); };
    f(-5, 6, '#c98f5a', '#a8703a'); f(-3, 9, '#7ec8ff', '#4f9ad9'); f(-1, 11, '#ffffff', '#d9d0c2'); f(1, 9, '#7ec8ff', '#4f9ad9'); f(3, 6, '#c98f5a', '#a8703a');
  }

  // ボール・またたび(足もとに置くもの)
  function drawFloorToy() {
    const t = performance.now();
    const x = Math.round(toy.x), y = Math.round(toy.y);
    const R = (dx, dy, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x + dx, y + dy, w, h); };
    R(-4, -1, 9, 2, 'rgba(0,0,0,0.25)');
    if (toy.kind === 'ball') {
      R(-3, -8, 7, 7, '#3b2a2a'); R(-4, -7, 9, 5, '#3b2a2a');
      R(-3, -7, 7, 5, '#e8412f'); R(-2, -8, 5, 7, '#e8412f');
      const sx = ((Math.round(toy.x / 2) % 5) + 5) % 5 - 2;
      R(sx, -7, 1, 5, '#ffffff');
      R(-2, -7, 2, 1, '#ff9a8a');
    } else { // またたび:緑の枝と小さな花
      R(-1, -4, 2, 4, '#6a4a2a');
      R(-6, -8, 6, 4, '#3b2a2a'); R(-5, -7, 4, 2, '#4f9a4f');
      R(1, -9, 6, 4, '#3b2a2a'); R(2, -8, 4, 2, '#6fae6f');
      R(-3, -12, 6, 4, '#3b2a2a'); R(-2, -11, 4, 2, '#3f8a3f');
      R(-1, -14, 2, 2, '#fff6c0'); R(4, -11, 2, 2, '#fff6c0'); R(-5, -10, 2, 2, '#fff6c0');
      if (Math.floor(t / 350) % 2 === 0) { R(7, -14, 1, 3, '#fff'); R(6, -13, 3, 1, '#fff'); }
    }
  }

  function draw() {
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.translate(-Math.round(cam.x), OY);
    ctx.drawImage(wallTop, 0, -wallTop.height);
    ctx.drawImage(bg, 0, 0);
    drawObjects();
    drawGifts();
    if (save.gone) { ctx.restore(); return; }
    drawCatShadow();
    const behind = toy.on && toy.kind !== 'wand' && toy.y < cat.y + FOOT; // 猫より奥にあるものは、先に描く
    if (behind) drawFloorToy();

    const base = spriteKey(), face = faceFor(base);
    const list = (face && sprites[base + ':' + face]) || sprites[base];
    const img = list[cat.frame % list.length];
    ctx.save();
    const cx = Math.round(cat.x) + (cat.state === 'angry' ? (cat.frame % 2 ? 1 : -1) : cat.state === 'play' && toy.kind === 'nip' ? Math.round(Math.sin(performance.now() / 350)) : 0);
    const cy = Math.round(cat.y) - (cat.state === 'play' && toy.kind !== 'nip' ? (cat.frame % 2) * 3 : 0);
    if (cat.dir < 0) { ctx.translate(cx + catW, cy); ctx.scale(-SCALE, SCALE); }
    else { ctx.translate(cx, cy); ctx.scale(SCALE, SCALE); }
    ctx.drawImage(img, 0, 0);
    ctx.restore();

    const headX = Math.round(cat.x) + (cat.dir > 0 ? 46 : catW - 51);
    if (cat.state === 'angry' && cat.frame % 2 === 0) {
      px(ctx, ANGER, headX, Math.round(cat.y) - 2, '#e8412f');
    }
    if (cat.bubble > 0) px(ctx, BANG, headX + 1, Math.round(cat.y) - 12, '#ffd34d', 2);
    if (toy.on) { if (toy.kind === 'wand') drawToy(); else if (!behind) drawFloorToy(); }
    hearts.forEach((h) => px(ctx, HEART, Math.round(h.x), Math.round(h.y - h.life * 18), h.life > 0.7 ? '#f7b6c4' : '#ff5c82'));
    zs.forEach((z) => px(ctx, ZROWS, Math.round(z.x + Math.sin(z.life * 4) * 2), Math.round(z.y - z.life * 14), '#fff'));
    ctx.restore();
  }

  let prev = performance.now(), btnT = 0;
  function loop(now) {
    const dt = Math.min(0.1, (now - prev) / 1000); prev = now;
    update(dt);
    let camTarget = clamp(cat.x + catW / 2 - W / 2, 0, WW - W);
    if (cam.focusT > 0) { cam.focusT -= dt; camTarget = clamp(cam.focusX - W / 2, 0, WW - W); }
    cam.x += (camTarget - cam.x) * Math.min(1, dt * 3);
    for (let i = hearts.length - 1; i >= 0; i--) { hearts[i].life += dt; if (hearts[i].life > 1) hearts.splice(i, 1); }
    for (let i = zs.length - 1; i >= 0; i--) { zs[i].life += dt * 0.6; if (zs[i].life > 1) zs.splice(i, 1); }
    btnT += dt; if (btnT > 0.3) { btnT = 0; updateButtons(); }
    draw();
    requestAnimationFrame(loop);
  }
  updateButtons();
  requestAnimationFrame(loop);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { persist(); } });
})();
