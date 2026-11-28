#!/usr/bin/env node
// make-reels.js: ONE file that makes all the reels.
//   node make-reels.js                 builds every reel
//   node make-reels.js <reel-id>       builds just one reel
//   VOICE=af_bella node make-reels.js  uses another voice
//
// For each reel it: generates the voiceover (hyperframes tts), speeds it up (ffmpeg),
// transcribes it (hyperframes transcribe), builds the animated layout, and renders
// out/<reel-id>.mp4 (hyperframes render).
// Needs: Node 22+, ffmpeg, and `pip install kokoro-onnx soundfile` once.

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const VOICE = process.env.VOICE || "af_heart";

// ---- The reels: edit the narration, scenes and speed here ----
const REELS = [
  {
    "id": "spooky1-the-nine-oclock-bell",
    "style": "cartoon",
    "title": "Part 1",
    "narration": "Welcome to Hollowbrook, the town where everybody shouts HUSS! HUSS! HUSS! Every night, at exactly nine o'clock, a bell rings, and the whole town opens their windows and screams HUSS! HUSS! HUSS! as loud as they can. Max moved in last week and thought it was a joke. Tonight, he stayed quiet. The bell rang. The town shouted HUSS! HUSS! HUSS! Max said nothing. The streetlights flickered, one by one. A cold fog rolled down the road. And at the end of the street, something tall appeared. It had no face. It slowly turned its head toward Max's window. Granny knocked on his door and whispered, shout, kid. Shout now! Follow for part two.",
    "scenes": [
      {
        "label": "HOLLOWBROOK",
        "sky": [
          "#0b0b2a",
          "#2b1b5c"
        ],
        "ground": "#1f2430",
        "emoji": "🏘️",
        "kind": "street"
      },
      {
        "label": "9 PM",
        "sky": [
          "#0b0b2a",
          "#2b1b5c"
        ],
        "ground": "#1f2430",
        "emoji": "🔔",
        "kind": "street"
      },
      {
        "label": "SILENCE",
        "sky": [
          "#1c2233",
          "#4a5470"
        ],
        "ground": "#1f2430",
        "emoji": "🌫️",
        "kind": "street"
      },
      {
        "label": "THE FIGURE",
        "sky": [
          "#05050f",
          "#1a1230"
        ],
        "ground": "#1f2430",
        "emoji": "👻",
        "kind": "street"
      }
    ],
    "speed": 1.15
  },
  {
    "id": "spooky2-the-quiet",
    "style": "cartoon",
    "title": "Part 2",
    "narration": "Part two. Max couldn't sleep. Granny sat at his kitchen table, shaking. She said, a long time ago, this town was silent. And the silence woke up something. We call it the Quiet. It takes anyone who stays silent. That's why we shout HUSS! HUSS! HUSS! every night, to keep it away. Max laughed nervously. Then the lights went out. Every window in town went dark. No dogs. No wind. Not a single sound. Something scratched slowly at the front door. The doorknob began to turn. Max opened his mouth to shout, but no sound came out. His voice was gone. Follow for the final part.",
    "scenes": [
      {
        "label": "GRANNY'S STORY",
        "sky": [
          "#3b2a3f",
          "#5a3f55"
        ],
        "ground": "#2b1f2a",
        "emoji": "🕯️",
        "kind": "room"
      },
      {
        "label": "THE QUIET",
        "sky": [
          "#05050f",
          "#1a1230"
        ],
        "ground": "#1f2430",
        "emoji": "🌑",
        "kind": "plain"
      },
      {
        "label": "LIGHTS OUT",
        "sky": [
          "#0d0b17",
          "#1b1730"
        ],
        "ground": "#14111f",
        "emoji": "🏚️",
        "kind": "room"
      },
      {
        "label": "THE DOORKNOB",
        "sky": [
          "#1a1226",
          "#33224a"
        ],
        "ground": "#14111f",
        "emoji": "🚪",
        "kind": "room"
      }
    ],
    "speed": 1.15
  },
  {
    "id": "spooky3-the-loudest-huss",
    "style": "cartoon",
    "title": "Part 3",
    "narration": "Final part. Max's voice was gone, and the door creaked open. The Quiet stepped inside, taller than the ceiling. Granny pulled out an old brass bell and rang it as hard as she could. One by one, windows opened across town. A shout echoed from the bakery. Another from the basketball court. Then another. Soon the whole town was screaming HUSS! HUSS! HUSS! together. Max felt something rising in his chest. He took the deepest breath of his life and shouted HUSS! HUSS! HUSS! The Quiet shattered like glass. Silence followed, but a normal silence, with crickets. Max smiled. Then, from his own shadow on the wall, a tiny whisper said, huss. huss. huss. The end. Follow for more spooky town stories.",
    "scenes": [
      {
        "label": "NO VOICE",
        "sky": [
          "#2a2036",
          "#4a3560"
        ],
        "ground": "#1d1629",
        "emoji": "😶",
        "kind": "room"
      },
      {
        "label": "THE BELL",
        "sky": [
          "#0b0b2a",
          "#2b1b5c"
        ],
        "ground": "#1f2430",
        "emoji": "🔔",
        "kind": "street"
      },
      {
        "label": "ALL TOGETHER",
        "sky": [
          "#0b0b2a",
          "#2b1b5c"
        ],
        "ground": "#1f2430",
        "emoji": "📢",
        "kind": "street"
      },
      {
        "label": "THE LAST WHISPER",
        "sky": [
          "#0d0b17",
          "#241a3d"
        ],
        "ground": "#14111f",
        "emoji": "🌙",
        "kind": "room"
      }
    ],
    "speed": 1.15
  }
];

// ---- Layout builder: writes reels/<id>/index.html from the transcript ----
function buildHtml(reel) {
  const id = reel.id;
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

// Every spoken HUSS is a shout window: characters open their mouths and jump.
const shouts = [];
words.forEach((w, i) => {
  if (!/huss/i.test(w.text)) return;
  const next = words[i + 1];
  let end = w.end;
  if (next && next.start > w.start) end = Math.min(w.end, next.start - 0.06);
  end = Math.max(end, w.start + 0.1);
  shouts.push({ start: w.start, end });
});

const sceneDefs = (Array.isArray(reel.scenes) && reel.scenes.length ? reel.scenes : [{}]).map((s) => ({
  label: s.label || "",
  kind: s.kind || "plain",
  sky: s.sky || ["#6ec6ff", "#d6f1ff"],
  ground: s.ground || "#4f5560",
  emoji: s.emoji || "",
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

const data = JSON.stringify({ duration, caps, scenes, shouts, title: reel.title || "" });

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=1080, height=1920">
<style>
  html, body { margin: 0; width: 1080px; height: 1920px; overflow: hidden; background: #0b0b2a; }
  body { font-family: "Arial Black", "Helvetica Neue", Arial, sans-serif; position: relative; }
  .scene { position: absolute; left: 0; top: 0; width: 1080px; height: 1920px; opacity: 0; overflow: hidden; }
  .abs { position: absolute; }
  .cloud { position: absolute; width: 240px; height: 80px; border-radius: 60px; background: rgba(255,255,255,.35); }
  .label { position: absolute; left: 40px; right: 40px; top: 190px; text-align: center; font-size: 130px;
           font-weight: 900; letter-spacing: 4px; color: #fff; -webkit-text-stroke: 14px #1b1030; paint-order: stroke fill; }
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

  // Keyframes that sit at "base" and switch to "hot" during every shout window.
  function shoutTimeline(prop, base, hot) {
    var fr = [], last = 0;
    function push(off, v) { var f = { offset: off }; f[prop] = v; fr.push(f); }
    push(0, base);
    D.shouts.forEach(function (w) {
      var ramp = 0.04 / D.duration;
      var s = Math.max(last, at(w.start) - ramp);
      var s2 = Math.max(s, at(w.start));
      var e = Math.max(s2, at(w.end));
      var e2 = Math.min(1, e + ramp);
      push(s, base); push(s2, hot); push(e, hot); push(e2, base);
      last = e2;
    });
    push(1, base);
    return fr;
  }
  function shout(el, prop, base, hot) {
    if (!D.shouts.length) return;
    el.animate(shoutTimeline(prop, base, hot), { duration: total, fill: "both", easing: "linear" });
  }

  document.getElementById("tag").textContent = D.title;
  if (!D.title) document.getElementById("tag").style.display = "none";

  // Outfits: new colors and styles (stripes, jackets, hoodies, jerseys, chef hat, glasses).
  var OUTFITS = [
    { style: "stripe", c1: "#7b2ff7", c2: "#c6ff3d", hair: "#1b1b1b", pants: "#23233a" },
    { style: "jacket", c1: "#17171f", c2: "#ffcc33", hair: "#8a3b12", pants: "#3a3a4d", sleeve: true },
    { style: "hoodie", c1: "#ff7a1a", c2: "#ffb347", hair: "#2b1d12", pants: "#2b2b3f", sleeve: true },
    { style: "jersey", c1: "#0fb5a6", c2: "#ffffff", hair: "#111111", pants: "#1d2b3a", num: "13" },
    { style: "stripe", c1: "#ff3d81", c2: "#2b2b3a", hair: "#e9c46a", pants: "#2f2f45", glasses: true },
    { style: "jacket", c1: "#f2f2f7", c2: "#8a2be2", hair: "#1b1b1b", pants: "#3b2f5a", sleeve: true, hat: "chef" },
    { style: "tee", c1: "#3d7bff", c2: "#ffffff", hair: "#6b3b1b", pants: "#222b45" },
    { style: "hoodie", c1: "#2ecc71", c2: "#145a32", hair: "#d9a441", pants: "#1f2a36", sleeve: true, hat: "cap" }
  ];
  var SKINS = ["#f2c9a0", "#c68a5b", "#8d5a3b", "#ffd9b3", "#e8b48a"];

  function box(parent, css) {
    var d = document.createElement("div");
    d.style.cssText = css;
    parent.appendChild(d);
    return d;
  }

  function avatar(o, skin) {
    var a = document.createElement("div");
    a.className = "av";
    // legs
    box(a, "left:55px;top:390px;width:85px;height:170px;border-radius:14px;background:" + o.pants + ";");
    box(a, "left:160px;top:390px;width:85px;height:170px;border-radius:14px;background:" + o.pants + ";");
    box(a, "left:55px;top:520px;width:85px;height:40px;border-radius:0 0 14px 14px;background:#f5f5f5;");
    box(a, "left:160px;top:520px;width:85px;height:40px;border-radius:0 0 14px 14px;background:#f5f5f5;");
    // arms
    var armBg = o.sleeve ? o.c1 : skin;
    var armL = box(a, "left:-5px;top:200px;width:62px;height:180px;border-radius:18px;background:" + armBg + ";transform-origin:50% 8%;");
    var armR = box(a, "left:243px;top:200px;width:62px;height:180px;border-radius:18px;background:" + armBg + ";transform-origin:50% 8%;");
    box(armL, "left:0;top:130px;width:62px;height:50px;border-radius:0 0 18px 18px;background:" + skin + ";");
    box(armR, "left:0;top:130px;width:62px;height:50px;border-radius:0 0 18px 18px;background:" + skin + ";");
    // torso
    var bg = o.c1;
    if (o.style === "stripe") bg = "repeating-linear-gradient(180deg," + o.c1 + " 0px," + o.c1 + " 26px," + o.c2 + " 26px," + o.c2 + " 52px)";
    var t = box(a, "left:45px;top:190px;width:210px;height:210px;border-radius:20px;background:" + bg + ";");
    if (o.style === "jacket") {
      box(t, "left:98px;top:0;width:14px;height:210px;background:rgba(255,255,255,.18);");
      for (var b = 0; b < 4; b++) box(t, "left:96px;top:" + (32 + b * 44) + "px;width:18px;height:18px;border-radius:50%;background:" + o.c2 + ";");
      box(t, "left:60px;top:0;width:90px;height:34px;border-radius:0 0 40px 40px;background:" + o.c2 + ";opacity:.9;");
    }
    if (o.style === "hoodie") {
      box(t, "left:55px;top:0;width:100px;height:46px;border-radius:0 0 50px 50px;background:" + o.c2 + ";");
      box(t, "left:45px;top:120px;width:120px;height:60px;border-radius:12px;background:rgba(0,0,0,.18);");
      box(t, "left:78px;top:46px;width:8px;height:50px;border-radius:4px;background:#fff;");
      box(t, "left:124px;top:46px;width:8px;height:50px;border-radius:4px;background:#fff;");
    }
    if (o.style === "jersey") {
      box(t, "left:0;top:0;width:210px;height:28px;border-radius:20px 20px 0 0;background:" + o.c2 + ";");
      var num = box(t, "left:0;top:58px;width:210px;text-align:center;font-size:96px;font-weight:900;line-height:1;color:" + o.c2 + ";");
      num.textContent = o.num || "7";
    }
    if (o.style === "tee") {
      box(t, "left:0;top:0;width:210px;height:26px;border-radius:20px 20px 0 0;background:rgba(255,255,255,.28);");
    }
    // head
    box(a, "left:70px;top:20px;width:160px;height:165px;border-radius:30px;background:" + skin + ";");
    // hair
    box(a, "left:70px;top:8px;width:160px;height:62px;border-radius:30px 30px 8px 8px;background:" + o.hair + ";");
    box(a, "left:80px;top:-14px;width:36px;height:34px;border-radius:10px 10px 0 0;background:" + o.hair + ";");
    box(a, "left:132px;top:-22px;width:36px;height:42px;border-radius:10px 10px 0 0;background:" + o.hair + ";");
    box(a, "left:184px;top:-10px;width:36px;height:30px;border-radius:10px 10px 0 0;background:" + o.hair + ";");
    // hats
    if (o.hat === "chef") {
      box(a, "left:62px;top:-70px;width:176px;height:96px;border-radius:48px;background:#fff;");
      box(a, "left:78px;top:6px;width:144px;height:34px;border-radius:6px;background:#f3f3f3;");
    }
    if (o.hat === "cap") {
      box(a, "left:66px;top:-8px;width:168px;height:52px;border-radius:30px 30px 6px 6px;background:" + o.c2 + ";");
      box(a, "left:150px;top:30px;width:96px;height:16px;border-radius:8px;background:" + o.c2 + ";");
    }
    // face
    var eyeY = 96;
    box(a, "left:104px;top:" + eyeY + "px;width:16px;height:26px;border-radius:9px;background:#1b1b1b;");
    box(a, "left:180px;top:" + eyeY + "px;width:16px;height:26px;border-radius:9px;background:#1b1b1b;");
    if (o.glasses) {
      box(a, "left:92px;top:" + (eyeY - 10) + "px;width:40px;height:44px;border-radius:50%;border:5px solid #1b1b1b;box-sizing:border-box;");
      box(a, "left:168px;top:" + (eyeY - 10) + "px;width:40px;height:44px;border-radius:50%;border:5px solid #1b1b1b;box-sizing:border-box;");
      box(a, "left:130px;top:" + (eyeY + 6) + "px;width:40px;height:5px;background:#1b1b1b;");
    }
    var browL = box(a, "left:96px;top:" + (eyeY - 22) + "px;width:36px;height:9px;border-radius:5px;background:#1b1b1b;opacity:0;transform:rotate(18deg);");
    var browR = box(a, "left:168px;top:" + (eyeY - 22) + "px;width:36px;height:9px;border-radius:5px;background:#1b1b1b;opacity:0;transform:rotate(-18deg);");
    var mouthBox = box(a, "left:118px;top:134px;width:64px;height:30px;transform-origin:50% 0%;");
    var mouth = box(mouthBox, "left:0;top:0;width:64px;height:30px;border-radius:4px 4px 34px 34px;background:#6b1d1d;transform-origin:50% 0%;");
    return { el: a, armL: armL, armR: armR, mouth: mouth, mouthBox: mouthBox, browL: browL, browR: browR };
  }

  function place(parent, av, left, scale, bottom, phase) {
    av.el.style.left = left + "px";
    av.el.style.top = (bottom - 560) + "px";
    av.el.style.transformOrigin = "50% 100%";
    av.el.style.transform = "scale(" + scale + ")";
    var wrap = box(parent, "position:absolute;left:0;top:0;width:1080px;height:1920px;");
    var inner = box(wrap, "position:absolute;left:0;top:0;width:1080px;height:1920px;");
    inner.appendChild(av.el);
    loop(wrap, [{ transform: "translateY(0px)" }, { transform: "translateY(-26px)" }, { transform: "translateY(0px)" }], 560, phase);
    loop(av.armL, [{ transform: "rotate(10deg)" }, { transform: "rotate(-35deg)" }, { transform: "rotate(10deg)" }], 560, phase);
    loop(av.armR, [{ transform: "rotate(-10deg)" }, { transform: "rotate(35deg)" }, { transform: "rotate(-10deg)" }], 560, phase);
    loop(av.mouth, [{ transform: "scaleY(1)" }, { transform: "scaleY(0.3)" }, { transform: "scaleY(1)" }], 240, phase);
    // Shouting: jump, wide open mouth, angry eyebrows on every HUSS.
    shout(inner, "transform", "translateY(0px) scale(1)", "translateY(-46px) scale(1.07)");
    shout(av.mouthBox, "transform", "scale(1, 1)", "scale(1.5, 2.3)");
    shout(av.browL, "opacity", "0", "1");
    shout(av.browR, "opacity", "0", "1");
  }

  function skyline(sc, k) {
    var cols = ["#3a3f5c", "#4b3f72", "#2d3a55", "#5a3d6b", "#3a4a66"];
    var x = -20, i = 0;
    while (x < 1100) {
      var w = 80 + ((i * 37 + k * 13) % 50);
      var h = 150 + ((i * 71 + k * 29) % 190);
      var b = box(sc, "left:" + x + "px;top:" + (1000 - h) + "px;width:" + w + "px;height:" + h + "px;background-color:" + cols[(i + k) % cols.length] + ";" +
        "background-image:radial-gradient(rgba(255,214,102,.65) 38%, transparent 42%);background-size:26px 34px;background-position:12px 14px;");
      b.className = "abs";
      x += w + 6; i++;
    }
  }

  function road(sc) {
    var r = box(sc, "left:0;top:1000px;width:1080px;height:920px;background:#2b2f3a;clip-path:polygon(38% 0,62% 0,100% 100%,0 100%);");
    r.className = "abs";
    for (var d = 0; d < 5; d++) {
      var w = 10 + d * 16, h = 36 + d * 30, y = 1040 + d * d * 38 + d * 30;
      var m = box(sc, "left:" + (540 - w / 2) + "px;top:" + y + "px;width:" + w + "px;height:" + h + "px;background:#f2f2f2;opacity:.85;");
      m.className = "abs";
    }
  }

  function room(sc, s) {
    var wall = box(sc, "left:0;top:0;width:1080px;height:1250px;background:linear-gradient(180deg," + s.sky[0] + "," + s.sky[1] + ");");
    wall.className = "abs";
    var floor = box(sc, "left:0;top:1250px;width:1080px;height:670px;background:" + s.ground + ";" +
      "background-image:repeating-linear-gradient(0deg, rgba(0,0,0,.12) 0px, rgba(0,0,0,.12) 4px, transparent 4px, transparent 90px), repeating-linear-gradient(90deg, rgba(0,0,0,.12) 0px, rgba(0,0,0,.12) 4px, transparent 4px, transparent 120px);");
    floor.className = "abs";
  }

  var scenesEl = document.getElementById("scenes");
  D.scenes.forEach(function (s, k) {
    var sc = box(scenesEl, "");
    sc.className = "scene";

    if (s.kind === "room") {
      room(sc, s);
    } else {
      var sky = box(sc, "left:0;top:0;width:1080px;height:1480px;background:linear-gradient(180deg," + s.sky[0] + "," + s.sky[1] + ");");
      sky.className = "abs";
      var c1 = box(sc, "left:90px;top:520px;"); c1.className = "cloud";
      var c2 = box(sc, "left:700px;top:300px;"); c2.className = "cloud";
      loop(c1, [{ transform: "translateX(0px)" }, { transform: "translateX(90px)" }], 6000, 0);
      loop(c2, [{ transform: "translateX(0px)" }, { transform: "translateX(-90px)" }], 7000, 0);
      var top = s.kind === "street" ? 1000 : 1480;
      var g = box(sc, "left:0;top:" + top + "px;width:1080px;height:" + (1920 - top) + "px;background:" + s.ground + ";");
      g.className = "abs";
      if (s.kind === "street") { skyline(sc, k); road(sc); }
    }

    if (s.label) { var lb = box(sc, ""); lb.className = "label"; lb.textContent = s.label; }
    if (s.emoji) {
      var pr = box(sc, ""); pr.className = "prop"; pr.textContent = s.emoji;
      loop(pr, [{ transform: "translateY(0px) rotate(-4deg)" }, { transform: "translateY(-30px) rotate(4deg)" }, { transform: "translateY(0px) rotate(-4deg)" }], 1400, 0);
    }

    var n = OUTFITS.length;
    // back row (crowd), sides, then the main character in front
    place(sc, avatar(OUTFITS[(k + 5) % n], SKINS[(k + 3) % SKINS.length]), 250, 0.72, 1480, 200);
    place(sc, avatar(OUTFITS[(k + 6) % n], SKINS[(k + 4) % SKINS.length]), 560, 0.72, 1480, 80);
    place(sc, avatar(OUTFITS[(k + 1) % n], SKINS[(k + 1) % SKINS.length]), 10, 1.0, 1530, 120);
    place(sc, avatar(OUTFITS[(k + 3) % n], SKINS[(k + 2) % SKINS.length]), 770, 1.0, 1530, 300);
    place(sc, avatar(OUTFITS[k % n], SKINS[k % SKINS.length]), 390, 1.45, 1770, 0);

    var a = at(s.start), b = at(s.end), pop = Math.min(at(s.start + 0.18), b);
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
  D.caps.forEach(function (c, i) {
    var el = document.createElement("div");
    var hot = /huss/i.test(c.text);
    el.className = "word" + (hot ? " hot" : "");
    el.textContent = hot ? c.text.toUpperCase() : c.text;
    wordsEl.appendChild(el);
    var s = at(c.start), e = Math.max(at(c.end), at(c.start)), p = Math.min(at(c.start + 0.1), e);
    var tilt = hot ? ((i % 2 ? 1 : -1) * 4) : 0;
    var big = hot ? 1.28 : 1.12;
    el.animate(
      [{ opacity: 0, transform: "scale(0.6) rotate(" + tilt + "deg)", offset: 0 },
       { opacity: 0, transform: "scale(0.6) rotate(" + tilt + "deg)", offset: Math.max(0, s - 0.0001) },
       { opacity: 1, transform: "scale(" + big + ") rotate(" + tilt + "deg)", offset: s },
       { opacity: 1, transform: "scale(1) rotate(" + tilt + "deg)", offset: Math.max(s, p) },
       { opacity: 1, transform: "scale(1) rotate(" + tilt + "deg)", offset: e },
       { opacity: 0, transform: "scale(1) rotate(" + tilt + "deg)", offset: Math.min(1, e + 0.0001) },
       { opacity: 0, transform: "scale(1) rotate(" + tilt + "deg)", offset: 1 }],
      { duration: total, fill: "both" }
    );
  });
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(dir, "index.html"), html);
console.log(`Built ${path.join(dir, "index.html")} (${duration}s, ${scenes.length} scenes, ${shouts.length} shouts)`);
}

function run(cmd, args, cwd) {
  execFileSync(cmd, args, { cwd, stdio: "inherit" });
}

function makeReel(reel) {
  const dir = path.join("reels", reel.id);
  fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
  fs.mkdirSync("out", { recursive: true });
  fs.writeFileSync(path.join(dir, "script.txt"), reel.narration + "\n");

  console.log("\n=== " + reel.id + " ===");
  run("npx", ["hyperframes", "tts", "script.txt", "--voice", VOICE, "--output", "assets/voiceover.wav"], dir);

  const speed = Number(reel.speed || 1);
  if (speed !== 1) {
    run("ffmpeg", ["-v", "error", "-y", "-i", "assets/voiceover.wav", "-filter:a", "atempo=" + speed, "assets/voiceover_fast.wav"], dir);
    fs.renameSync(path.join(dir, "assets", "voiceover_fast.wav"), path.join(dir, "assets", "voiceover.wav"));
  }

  run("npx", ["hyperframes", "transcribe", "assets/voiceover.wav", "--output", "assets/transcript.json"], dir);
  buildHtml(reel);
  run("npx", ["hyperframes", "render", "--output", path.join("..", "..", "out", reel.id + ".mp4")], dir);
}

const only = process.argv[2];
const todo = only ? REELS.filter((r) => r.id === only) : REELS;
if (!todo.length) {
  console.error("No reel with id: " + only + ". Available: " + REELS.map((r) => r.id).join(", "));
  process.exit(1);
}

const failed = [];
for (const reel of todo) {
  try {
    makeReel(reel);
  } catch (err) {
    console.error("FAILED: " + reel.id + ": " + err.message);
    failed.push(reel.id);
  }
}
console.log(failed.length ? "\nDone with errors. Failed: " + failed.join(", ") : "\nDone. Reels are in ./out");
process.exit(failed.length ? 1 : 0);
