#!/usr/bin/env node
// Builds reels/<id>/index.html (a 1080x1920 HyperFrames composition) from reels.json
// and the word-level transcript produced by `hyperframes transcribe`.
// Usage: node build-reel-html.js <reel-id>

const fs = require("node:fs");
const path = require("node:path");

const id = process.argv[2];
if (!id) {
  console.error("Usage: node build-reel-html.js <reel-id>");
  process.exit(1);
}

const reel = JSON.parse(fs.readFileSync("reels.json", "utf8")).reels.find((r) => r.id === id);
if (!reel) throw new Error(`Unknown reel: ${id}`);

const dir = path.join("reels", id);
const raw = JSON.parse(fs.readFileSync(path.join(dir, "assets", "transcript.json"), "utf8"));

// Be tolerant about the transcript shape: array, or { words: [...] }, or { segments: [{ words }] }.
function extractWords(t) {
  const list = Array.isArray(t)
    ? t
    : t.words || (t.segments ? t.segments.flatMap((s) => s.words || []) : []);
  return list
    .map((w) => ({
      text: String(w.text ?? w.word ?? "").trim(),
      start: Number(w.start ?? w.startTime ?? 0),
      end: Number(w.end ?? w.endTime ?? 0),
    }))
    .filter((w) => w.text);
}

const words = extractWords(raw);
if (!words.length) throw new Error("No words found in transcript.json (check its format).");

const duration = Math.ceil((words[words.length - 1].end + 0.8) * 10) / 10;

// Group words into short caption chunks of up to 4 words.
const chunks = [];
for (let i = 0; i < words.length; i += 4) {
  const group = words.slice(i, i + 4);
  const next = words[i + 4];
  chunks.push({
    text: group.map((w) => w.text).join(" "),
    start: group[0].start,
    end: next ? next.start : group[group.length - 1].end + 0.4,
  });
}

// Key-point cards appear evenly across the reel.
const cards = reel.points.map((text, i) => ({
  text,
  start: 1.0 + (i * (duration - 3)) / reel.points.length,
}));

// Optional per-reel background settings in reels.json:
//   "emoji": ["✈️","🧳"]            floating emoji that match the topic
//   "gradient": ["#0b1220","#1e3a5f"] custom background colors (top-left to bottom-right)
const bg = Array.isArray(reel.gradient) && reel.gradient.length >= 2
  ? `linear-gradient(160deg, ${reel.gradient[0]}, ${reel.gradient[1]})`
  : `linear-gradient(160deg, #0b0f19 0%, #0b0f19 35%, ${reel.accent}40 100%)`;

const data = JSON.stringify({
  duration, chunks, cards, title: reel.title, accent: reel.accent,
  emoji: Array.isArray(reel.emoji) ? reel.emoji : [], seed: id,
});

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=1080, height=1920">
<style>
  html, body { margin: 0; width: 1080px; height: 1920px; overflow: hidden; background: #0b0f19; }
  body { background: ${bg}; }
  .bgitem { position: absolute; user-select: none; line-height: 1; }
  body { font-family: "Helvetica Neue", Arial, sans-serif; color: #fff; position: relative; }
  .glow { position: absolute; left: 50%; top: 760px; width: 900px; height: 900px; margin-left: -450px;
          border-radius: 50%; background: radial-gradient(circle, var(--accent) 0%, transparent 65%); opacity: .22; }
  .title { position: absolute; top: 170px; left: 60px; right: 60px; text-align: center;
           font-size: 112px; font-weight: 800; line-height: 1.05; color: var(--accent); }
  .cards { position: absolute; top: 640px; left: 90px; right: 90px; }
  .card { margin-bottom: 44px; padding: 44px 48px; border-radius: 32px; font-size: 64px; font-weight: 700;
          background: rgba(255,255,255,.08); border-left: 14px solid var(--accent); opacity: 0; }
  .caption { position: absolute; left: 60px; right: 60px; bottom: 260px; text-align: center;
             font-size: 92px; font-weight: 800; line-height: 1.15; opacity: 0;
             text-shadow: 0 6px 24px rgba(0,0,0,.8); }
</style>
</head>
<body data-composition-id="${id}" data-start="0" data-duration="${duration}" data-width="1080" data-height="1920">
  <div class="glow"></div>
  <div class="title" id="title"></div>
  <div class="cards" id="cards"></div>
  <div id="captions"></div>
  <audio id="voice" src="assets/voiceover.wav" data-start="0" data-duration="${duration}" data-track-index="1"></audio>

<script>
  const D = ${data};
  document.documentElement.style.setProperty("--accent", D.accent);
  const total = D.duration * 1000;
  const clamp = (v) => Math.min(1, Math.max(0, v));
  const at = (t) => clamp(t / D.duration);

  // Background: slowly drifting rings, plus topic emoji if the reel has them.
  (function () {
    var h = 1779033703;
    for (var k = 0; k < D.seed.length; k++) h = Math.imul(h ^ D.seed.charCodeAt(k), 3432918353);
    function rnd() {
      h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x6d2b79f5) | 0;
      return ((h >>> 0) % 100000) / 100000;
    }
    var layer = document.createElement("div");
    layer.style.cssText = "position:absolute;left:0;top:0;width:1080px;height:1920px;overflow:hidden;";
    document.body.insertBefore(layer, document.body.firstChild);
    function drift(el, dx, dy, rot) {
      el.animate(
        [{ transform: "translate(0px,0px) rotate(0deg)" },
         { transform: "translate(" + dx + "px," + dy + "px) rotate(" + rot + "deg)" }],
        { duration: total, fill: "both", easing: "linear" });
    }
    for (var i = 0; i < 9; i++) {
      var size = 160 + rnd() * 380;
      var ring = document.createElement("div");
      ring.className = "bgitem";
      ring.style.cssText = "left:" + (rnd() * 1080 - size / 2) + "px;top:" + (rnd() * 1920 - size / 2) + "px;" +
        "width:" + size + "px;height:" + size + "px;border-radius:50%;border:3px solid " + D.accent + ";" +
        "opacity:" + (0.08 + rnd() * 0.1) + ";";
      layer.appendChild(ring);
      drift(ring, (rnd() - 0.5) * 160, -120 - rnd() * 200, 0);
    }
    if (D.emoji.length) {
      for (var j = 0; j < 12; j++) {
        var el = document.createElement("div");
        el.className = "bgitem";
        el.textContent = D.emoji[j % D.emoji.length];
        el.style.cssText = "left:" + (rnd() * 960) + "px;top:" + (rnd() * 1750) + "px;" +
          "font-size:" + (110 + rnd() * 110) + "px;opacity:0.2;";
        layer.appendChild(el);
        drift(el, (rnd() - 0.5) * 140, -200 - rnd() * 300, (rnd() - 0.5) * 50);
      }
    }
  })();

  // Title: fade/slide in over the first 0.6s.
  const title = document.getElementById("title");
  title.textContent = D.title;
  title.animate(
    [{ opacity: 0, transform: "translateY(40px)" }, { opacity: 1, transform: "translateY(0)", offset: at(0.6) },
     { opacity: 1, transform: "translateY(0)" }],
    { duration: total, fill: "both" }
  );

  // Key-point cards: slide in at their start time and stay.
  const cardsEl = document.getElementById("cards");
  D.cards.forEach((c) => {
    const el = document.createElement("div");
    el.className = "card";
    el.textContent = c.text;
    cardsEl.appendChild(el);
    el.animate(
      [{ opacity: 0, transform: "translateX(-80px)" },
       { opacity: 0, transform: "translateX(-80px)", offset: at(c.start) },
       { opacity: 1, transform: "translateX(0)", offset: at(c.start + 0.5) },
       { opacity: 1, transform: "translateX(0)" }],
      { duration: total, fill: "both" }
    );
  });

  // Captions: each chunk is visible only between its start and end times.
  const capsEl = document.getElementById("captions");
  D.chunks.forEach((c) => {
    const el = document.createElement("div");
    el.className = "caption";
    el.textContent = c.text;
    capsEl.appendChild(el);
    const s = at(c.start), e = at(c.end);
    el.animate(
      [{ opacity: 0, offset: 0 }, { opacity: 0, offset: Math.max(0, s - 0.0001) },
       { opacity: 1, offset: s }, { opacity: 1, offset: e },
       { opacity: 0, offset: Math.min(1, e + 0.0001) }, { opacity: 0, offset: 1 }],
      { duration: total, fill: "both" }
    );
  });
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(dir, "index.html"), html);
console.log(`Built ${path.join(dir, "index.html")} (${duration}s)`);
