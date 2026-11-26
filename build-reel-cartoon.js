#!/usr/bin/env node
// Builds reels/<id>/index.html in a bright cartoon style: blocky characters, scene labels,
// and big one-word-at-a-time captions. Usage: node build-reel-cartoon.js <reel-id>
//
// Optional fields in reels.json for a reel with "style": "cartoon":
//   "scenes": [ { "label": "BAKERY", "sky": ["#7ec8ff","#cfeeff"], "ground": "#c9a26b",
//                 "emoji": "🥖", "shirt": "#ff6b5a" }, ... ]
// The narration is split evenly across the scenes in order.

const fs = require("node:fs");
const path = require("node:path");

const id = process.argv[2];
if (!id) {
  console.error("Usage: node build-reel-cartoon.js <reel-id>");
  process.exit(1);
}

const reel = JSON.parse(fs.readFileSync("reels.json", "utf8")).reels.find((r) => r.id === id);
if (!reel) throw new Error(`Unknown reel: ${id}`);

const dir = path.join("reels", id);
const raw = JSON.parse(fs.readFileSync(path.join(dir, "assets", "transcript.json"), "utf8"));

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

// One caption per word; each stays until the next word starts.
const caps = words.map((w, i) => ({
  text: w.text.replace(/[,.;:]+$/, ""),
  start: w.start,
  end: i + 1 < words.length ? words[i + 1].start : w.end + 0.6,
}));

const defaults = [
  { label: "", sky: ["#6ec6ff", "#d6f1ff"], ground: "#4f5560", emoji: "", shirt: "#ff6b5a" },
];
const sceneDefs = (Array.isArray(reel.scenes) && reel.scenes.length ? reel.scenes : defaults).map((s) => ({
  label: s.label || "",
  sky: s.sky || ["#6ec6ff", "#d6f1ff"],
  ground: s.ground || "#4f5560",
  emoji: s.emoji || "",
  shirt: s.shirt || "#ff6b5a",
}));

// Scene k covers an equal share of the spoken words.
const n = words.length;
const S = sceneDefs.length;
const scenes = sceneDefs.map((s, k) => {
  const startIdx = Math.floor((k * n) / S);
  const endIdx = Math.floor(((k + 1) * n) / S);
  return {
    ...s,
    start: k === 0 ? 0 : words[startIdx].start,
    end: k === S - 1 ? duration : words[endIdx].start,
  };
});

const data = JSON.stringify({ duration, caps, scenes, title: reel.title || "" });

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=1080, height=1920">
<style>
  html, body { margin: 0; width: 1080px; height: 1920px; overflow: hidden; background: #6ec6ff; }
  body { font-family: "Arial Black", "Helvetica Neue", Arial, sans-serif; position: relative; }
  .scene { position: absolute; left: 0; top: 0; width: 1080px; height: 1920px; opacity: 0; overflow: hidden; }
  .sky { position: absolute; left: 0; top: 0; width: 1080px; height: 1480px; }
  .ground { position: absolute; left: 0; top: 1480px; width: 1080px; height: 440px; }
  .strip { position: absolute; left: 0; top: 1480px; width: 1080px; height: 10px; background: rgba(255,255,255,.35); }
  .cloud { position: absolute; width: 240px; height: 80px; border-radius: 60px; background: rgba(255,255,255,.9); }
  .label { position: absolute; left: 40px; right: 40px; top: 190px; text-align: center; font-size: 130px;
           font-weight: 900; letter-spacing: 4px; color: #fff; -webkit-text-stroke: 14px #2b1d12; paint-order: stroke fill; }
  .prop { position: absolute; left: 0; width: 1080px; top: 360px; text-align: center; font-size: 280px; line-height: 1; }
  .tag { position: absolute; left: 40px; top: 70px; padding: 14px 28px; border-radius: 40px; background: rgba(0,0,0,.45);
         color: #fff; font-size: 38px; font-weight: 800; }
  .av { position: absolute; width: 300px; height: 560px; }
  .av div { position: absolute; }
  .word { position: absolute; left: 20px; right: 20px; top: 930px; text-align: center; font-size: 150px; line-height: 1;
          font-weight: 900; color: #fff; -webkit-text-stroke: 16px #1b1b1b; paint-order: stroke fill; opacity: 0; }
  .word.hot { color: #ffd23f; }
</style>
</head>
<body data-composition-id="${id}" data-start="0" data-duration="${duration}" data-width="1080" data-height="1920">
  <div id="scenes"></div>
  <div class="tag" id="tag"></div>
  <div id="words"></div>
  <audio id="voice" src="assets/voiceover.wav" data-start="0" data-duration="${duration}" data-track-index="1"></audio>

<script>
  var D = ${data};
  var total = D.duration * 1000;
  function clamp(v) { return Math.min(1, Math.max(0, v)); }
  function at(t) { return clamp(t / D.duration); }
  function loop(el, frames, period, delay) {
    el.animate(frames, { duration: period, delay: delay || 0, iterations: Math.ceil(total / period) + 1, fill: "both", easing: "ease-in-out" });
  }

  document.getElementById("tag").textContent = D.title;
  if (!D.title) document.getElementById("tag").style.display = "none";

  var PANTS = ["#2f3e63", "#3a3a3a", "#5b3a29"];
  var SKINS = ["#f2c9a0", "#c68a5b", "#8d5a3b", "#ffd9b3"];
  var HAIRS = ["#2b1d12", "#6b3b1b", "#d9a441", "#1b1b1b"];
  var SHIRTS = ["#ff6b5a", "#4cc3a0", "#5b8cff", "#ffd23f", "#b37bff", "#ff9ecb"];

  function box(parent, css) {
    var d = document.createElement("div");
    d.style.cssText = css;
    parent.appendChild(d);
    return d;
  }

  function avatar(shirt, skin, hair, pants) {
    var a = document.createElement("div");
    a.className = "av";
    box(a, "left:55px;top:390px;width:85px;height:170px;border-radius:14px;background:" + pants + ";");
    box(a, "left:160px;top:390px;width:85px;height:170px;border-radius:14px;background:" + pants + ";");
    var armL = box(a, "left:-5px;top:200px;width:62px;height:180px;border-radius:18px;background:" + skin + ";transform-origin:50% 8%;");
    var armR = box(a, "left:243px;top:200px;width:62px;height:180px;border-radius:18px;background:" + skin + ";transform-origin:50% 8%;");
    box(a, "left:45px;top:190px;width:210px;height:210px;border-radius:20px;background:" + shirt + ";");
    box(a, "left:45px;top:190px;width:210px;height:44px;border-radius:20px 20px 0 0;background:rgba(255,255,255,.25);");
    box(a, "left:70px;top:20px;width:160px;height:165px;border-radius:30px;background:" + skin + ";");
    box(a, "left:70px;top:8px;width:160px;height:62px;border-radius:30px 30px 8px 8px;background:" + hair + ";");
    box(a, "left:104px;top:92px;width:16px;height:26px;border-radius:9px;background:#1b1b1b;");
    box(a, "left:180px;top:92px;width:16px;height:26px;border-radius:9px;background:#1b1b1b;");
    var mouth = box(a, "left:118px;top:134px;width:64px;height:30px;border-radius:4px 4px 34px 34px;background:#6b1d1d;transform-origin:50% 0%;");
    return { el: a, armL: armL, armR: armR, mouth: mouth };
  }

  function place(parent, av, left, scale, bottom, phase) {
    av.el.style.left = left + "px";
    av.el.style.top = (bottom - 560) + "px";
    av.el.style.transformOrigin = "50% 100%";
    av.el.style.transform = "scale(" + scale + ")";
    var wrap = box(parent, "position:absolute;left:0;top:0;width:1080px;height:1920px;");
    wrap.appendChild(av.el);
    loop(wrap, [{ transform: "translateY(0px)" }, { transform: "translateY(-34px)" }, { transform: "translateY(0px)" }], 640, phase);
    loop(av.armL, [{ transform: "rotate(10deg)" }, { transform: "rotate(-35deg)" }, { transform: "rotate(10deg)" }], 640, phase);
    loop(av.armR, [{ transform: "rotate(-10deg)" }, { transform: "rotate(35deg)" }, { transform: "rotate(-10deg)" }], 640, phase);
    loop(av.mouth, [{ transform: "scaleY(1)" }, { transform: "scaleY(0.25)" }, { transform: "scaleY(1)" }], 260, phase);
  }

  var scenesEl = document.getElementById("scenes");
  D.scenes.forEach(function (s, k) {
    var sc = box(scenesEl, "");
    sc.className = "scene";
    var sky = box(sc, ""); sky.className = "sky";
    sky.style.background = "linear-gradient(180deg," + s.sky[0] + "," + s.sky[1] + ")";
    var c1 = box(sc, "left:90px;top:520px;"); c1.className = "cloud";
    var c2 = box(sc, "left:700px;top:300px;"); c2.className = "cloud";
    loop(c1, [{ transform: "translateX(0px)" }, { transform: "translateX(90px)" }], 6000, 0);
    loop(c2, [{ transform: "translateX(0px)" }, { transform: "translateX(-90px)" }], 7000, 0);
    var g = box(sc, ""); g.className = "ground"; g.style.background = s.ground;
    var st = box(sc, ""); st.className = "strip";
    if (s.label) { var lb = box(sc, ""); lb.className = "label"; lb.textContent = s.label; }
    if (s.emoji) {
      var pr = box(sc, ""); pr.className = "prop"; pr.textContent = s.emoji;
      loop(pr, [{ transform: "translateY(0px) rotate(-4deg)" }, { transform: "translateY(-30px) rotate(4deg)" }, { transform: "translateY(0px) rotate(-4deg)" }], 1400, 0);
    }
    var side1 = avatar(SHIRTS[(k + 1) % SHIRTS.length], SKINS[(k + 1) % SKINS.length], HAIRS[(k + 2) % HAIRS.length], PANTS[k % PANTS.length]);
    var side2 = avatar(SHIRTS[(k + 3) % SHIRTS.length], SKINS[(k + 2) % SKINS.length], HAIRS[(k + 1) % HAIRS.length], PANTS[(k + 1) % PANTS.length]);
    var main = avatar(s.shirt, SKINS[k % SKINS.length], HAIRS[k % HAIRS.length], PANTS[(k + 2) % PANTS.length]);
    place(sc, side1, 20, 1.0, 1520, 120);
    place(sc, side2, 760, 1.0, 1520, 300);
    place(sc, main, 390, 1.45, 1760, 0);

    var a = at(s.start), b = at(s.end), pop = at(s.start + 0.18);
    sc.animate(
      [{ opacity: 0, transform: "scale(1)", offset: 0 },
       { opacity: 0, transform: "scale(1.06)", offset: Math.max(0, a - 0.0001) },
       { opacity: 1, transform: "scale(1.06)", offset: a },
       { opacity: 1, transform: "scale(1)", offset: Math.max(a, pop) },
       { opacity: 1, transform: "scale(1)", offset: b },
       { opacity: 0, transform: "scale(1)", offset: Math.min(1, b + 0.0001) },
       { opacity: 0, transform: "scale(1)", offset: 1 }],
      { duration: total, fill: "both" }
    );
  });

  var wordsEl = document.getElementById("words");
  D.caps.forEach(function (c) {
    var el = document.createElement("div");
    el.className = "word" + (/^[A-Z]{3,}[!?]*$/.test(c.text) ? " hot" : "");
    el.textContent = c.text;
    wordsEl.appendChild(el);
    var s = at(c.start), e = at(c.end), p = at(c.start + 0.12);
    el.animate(
      [{ opacity: 0, transform: "scale(0.6)", offset: 0 },
       { opacity: 0, transform: "scale(0.6)", offset: Math.max(0, s - 0.0001) },
       { opacity: 1, transform: "scale(1.12)", offset: s },
       { opacity: 1, transform: "scale(1)", offset: Math.max(s, p) },
       { opacity: 1, transform: "scale(1)", offset: e },
       { opacity: 0, transform: "scale(1)", offset: Math.min(1, e + 0.0001) },
       { opacity: 0, transform: "scale(1)", offset: 1 }],
      { duration: total, fill: "both" }
    );
  });
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(dir, "index.html"), html);
console.log(`Built ${path.join(dir, "index.html")} (${duration}s, ${scenes.length} scenes)`);
