/* WQRT-12: Night Duty — master control, October 12 1996 */
(function () {
  const START = 23 * 3600 + 47 * 60;
  const NIGHT = 18780;
  const SCALE = 26;
  const $ = (id) => document.getElementById(id);

  function at(h, m, s) {
    s = s || 0;
    let t = h * 3600 + m * 60 + s;
    if (t < START) t += 86400;
    return t - START;
  }
  function pad(n) { return String(n).padStart(2, "0"); }
  function clockStr(sec) {
    let t = START + sec;
    if (t >= 86400) t -= 86400;
    const h24 = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = Math.floor(t % 60);
    const h12 = ((h24 + 11) % 12) + 1;
    const ap = h24 >= 12 ? "PM" : "AM";
    return pad(h12) + ":" + pad(m) + ":" + pad(s) + " " + ap;
  }
  function hms(sec) {
    let t = START + sec;
    if (t >= 86400) t -= 86400;
    return [Math.floor(t / 3600), Math.floor((t % 3600) / 60), Math.floor(t % 60)];
  }

  const IMAGES = {
    newsEmpty: "assets/news-empty.jpg",
    newsAnchor: "assets/news-anchor.jpg",
    cam3Empty: "assets/cam3-empty.jpg",
    cam3Occ: "assets/cam3-occupied.jpg",
    cam3Ray: "assets/cam3-ray.jpg",
    churchEmpty: "assets/church-empty.jpg",
    churchPastor: "assets/church-pastor.jpg",
    shop: "assets/shop-empty.jpg",
    tower: "assets/tower.jpg",
    towerFig: "assets/tower-figure.jpg",
    parking: "assets/parking.jpg",
    ray: "assets/ray.jpg",
    surveyRoad: "assets/survey-road.jpg",
    surveyRiver: "assets/survey-river.jpg",
    surveyCamp: "assets/survey-camp.jpg",
    satEmpty: "assets/sat-empty.jpg",
    satRay: "assets/sat-ray.jpg",
    door: "assets/door.jpg",
  };

  const KEYS = [
    ["bars", "BARS"],
    ["black", "BLACK"],
    ["vtr1", "VTR 1"],
    ["vtr2", "VTR 2"],
    ["sat", "SAT"],
    ["cam3", "CAM 3"],
    ["tx", "TX CAM"],
    ["id", "ID"],
  ];

  const state = {
    name: "UNLOGGED",
    t: 0,
    running: false,
    lastTs: 0,
    pgm: "vtr1",
    pvw: "bars",
    txOn: true,
    crawl: "",
    crawlOn: false,
    quiet: false,
    satHot: false,
    loggedGhost: 0,
    answered: {},
    openedGray: false,
    grayUnlocked: false,
    doorUnlocked: false,
    satOnAir: 0,
    gaze: 0,
    cam3Seen: false,
    talkback: 0,
    dumped217: false,
    faced: false,
    ended: false,
    stutter: false,
    hijack: false,
    holdClock: false,
    phone: { ringing: false, onLine: false, call: null, step: 0, queue: [] },
    eventsFired: {},
    radarTimer: 0,
    flashUntil: 0,
    lookLock: null,
    debug: /[?&]debug=1/.test(location.search) || /[?&]go=1/.test(location.search),
    go: /[?&]go=1/.test(location.search),
  };

  const logEl = () => $("log");

  function logLine(text, cls) {
    const line = document.createElement("div");
    if (cls) line.className = cls;
    const [h, m, s] = hms(state.t);
    const stamp = pad(((h + 11) % 12) + 1) + ":" + pad(m) + ":" + pad(s);
    line.textContent = stamp + "  " + text;
    logEl().appendChild(line);
    logEl().scrollTop = logEl().scrollHeight;
  }

  function setPill(id, on, warn, alarm, label) {
    const el = $(id);
    el.classList.toggle("on", !!on && !warn && !alarm);
    el.classList.toggle("warn", !!warn);
    el.classList.toggle("alarm", !!alarm);
    if (label) el.textContent = label;
  }

  function escapeName() {
    return String(state.name || "UNLOGGED").replace(/\s+/g, " ").trim().slice(0, 24) || "UNLOGGED";
  }

  /* ---------- scene builders (no user HTML) ---------- */
  function clearScene(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
    el.style.backgroundImage = "";
  }
  function imgScene(el, src) {
    const im = document.createElement("img");
    im.src = src;
    im.alt = "";
    el.appendChild(im);
  }
  function barsScene(el) {
    const wrap = document.createElement("div");
    wrap.style.height = "100%";
    const top = document.createElement("div");
    top.className = "bars";
    for (let i = 0; i < 7; i++) top.appendChild(document.createElement("div"));
    const low = document.createElement("div");
    low.className = "bars-low";
    const b = document.createElement("div"); b.className = "black";
    const w = document.createElement("div"); w.className = "white";
    const p = document.createElement("div"); p.className = "pluge";
    const b2 = document.createElement("div"); b2.className = "black";
    low.appendChild(b); low.appendChild(w); low.appendChild(p); low.appendChild(b2);
    wrap.appendChild(top); wrap.appendChild(low);
    el.appendChild(wrap);
  }
  function slateScene(el) {
    const d = document.createElement("div");
    d.className = "slate";
    d.innerHTML = "<div class='name'>WQRT</div><div class='ch'>12</div><div>HARTSFIELD VALLEY</div><div class='tag'>WE KEEP YOU COMPANY</div>";
    el.appendChild(d);
  }
  function federalScene(el, named) {
    const d = document.createElement("div");
    d.className = "federal";
    const n = escapeName();
    d.textContent = named
      ? ("VALLEY RELAY\nCONTINUITY ANNEX 12\n\nOPERATOR " + n + " IS IN THE CHAIR\n\nKEEP THE CHAIN HOT\nDO NOT INFORM THE VALLEY\nDO NOT LEAVE THE CHAIR\n\nCOMPLETION IS STAFF")
      : "VALLEY RELAY\nCONTINUITY ANNEX 12\nTHIS IS A REQUIRED HOUR\n\nIF YOU ARE READING THIS\nYOU ARE THE OPERATOR\n\nKEEP THE CHAIN HOT\nDO NOT INFORM THE VALLEY\nDO NOT LEAVE THE CHAIR\n\nCOMPLETION IS STAFF";
    el.appendChild(d);
  }
  function staffScene(el) {
    const d = document.createElement("div");
    d.className = "staff-slide";
    d.textContent = "WQRT-12  SIGN-ON\nHARTSFIELD VALLEY\n\nGM  DONNA KEENE\nENG  M. RUIZ\nNEWS  —\nNIGHT  " + escapeName() + "\nNIGHT  R. HOLCOMB\nNIGHT  R. HOLCOMB\nNIGHT  R. HOLCOMB\n\nTHE CHAIR IS FILLED";
    el.appendChild(d);
  }
  function weatherScene(el) {
    const wrap = document.createElement("div");
    wrap.className = "weather";
    const c = document.createElement("canvas");
    c.width = 420; c.height = 360;
    const side = document.createElement("div");
    side.className = "wx-side";
    side.innerHTML = "<div>HARTSFIELD</div><div class='temp'>41°</div><div>WIND CALM</div><div id='wx-line'>NO ADVISORIES</div><div style='margin-top:12px;color:#6f6'>RADAR LOOP</div>";
    wrap.appendChild(c); wrap.appendChild(side);
    el.appendChild(wrap);
    drawRadar(c, state.t);
  }
  function drawRadar(c, t) {
    const ctx = c.getContext("2d");
    const w = c.width, h = c.height;
    ctx.fillStyle = "#02140c";
    ctx.fillRect(0, 0, w, h);
    const cx = w * 0.5, cy = h * 0.52, r = 150;
    ctx.strokeStyle = "#0a5c32";
    for (let i = 1; i <= 4; i++) {
      ctx.beginPath(); ctx.arc(cx, cy, r * i / 4, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();
    const sweep = (t * 0.35) % (Math.PI * 2);
    const grd = ctx.createConicalGradient
      ? null
      : null;
    ctx.fillStyle = "rgba(40,180,80,0.18)";
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, sweep - 0.5, sweep);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#8cff6b";
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(sweep) * r, cy + Math.sin(sweep) * r); ctx.stroke();
    // moving cells
    const cells = [
      { x: 0.35 + Math.sin(t * 0.01) * 0.04, y: 0.4, s: 18, a: 0.35 },
      { x: 0.62, y: 0.58 + Math.cos(t * 0.008) * 0.03, s: 12, a: 0.28 },
    ];
    cells.forEach((cell) => {
      ctx.fillStyle = "rgba(80,220,90," + cell.a + ")";
      ctx.beginPath();
      ctx.arc(cell.x * w, cell.y * h, cell.s, 0, Math.PI * 2);
      ctx.fill();
    });
    // locked cell over the transmitter — does not move
    ctx.fillStyle = "rgba(220,40,40,0.55)";
    ctx.beginPath();
    ctx.arc(w * 0.71, h * 0.33, 10 + Math.sin(t * 2) * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8cff6b";
    ctx.font = "10px monospace";
    ctx.fillText("WQRT TOWER", w * 0.58, h * 0.28);
  }

  function vtr1Kind() {
    const t = state.t;
    if (t < at(0, 0, 0)) return "shop";
    if (t < at(0, 0, 18)) return "id";
    if (t < at(0, 15, 0)) return "news";
    if (t < at(0, 30, 0)) return "weather";
    if (t < at(1, 0, 0)) return "faith";
    if (t < at(1, 8, 0)) return "id";
    if (state.hijack && t >= at(2, 17, 0)) return "federal";
    return "bars";
  }

  function sourceSpec(id) {
    const t = state.t;
    const late = t >= at(2, 17, 0);
    const later = t >= at(3, 0, 0);
    const four = t >= at(4, 0, 0);
    if (id === "bars") return { kind: "bars", label: "BARS / TONE", bed: "bars", cc: "WQRT-12 COLOR BARS — NOT FOR AIR" };
    if (id === "black") return { kind: "black", label: "BLACK", bed: null, cc: "" };
    if (id === "id") return { kind: "id", label: "STATION ID", bed: "id", cc: "" };
    if (id === "vtr1") {
      const k = vtr1Kind();
      if (k === "shop") return { kind: "img", src: IMAGES.shop, label: "VTR 1  SHOP VALLEY", bed: "shop", cc: t > at(23, 55, 0) ? "OPERATORS ARE STANDING BY  •  555-0-12" : "TONIGHT ONLY — CERAMIC KEEPSAKE  $19.95" };
      if (k === "id") return { kind: "id", label: "VTR 1  ID", bed: "id", cc: "" };
      if (k === "news") return { kind: "img", src: t > at(0, 8, 0) ? IMAGES.newsAnchor : IMAGES.newsEmpty, label: "VTR 1  NIGHT RECAP", bed: "news", cc: t > at(0, 10, 0) ? "…the search for overnight operator Ray Holcomb has been called off." : "HARTSFIELD NIGHT RECAP — RECORDED 6:00 PM" };
      if (k === "weather") return { kind: "weather", label: "VTR 1  WEATHER", bed: "weather", cc: t > at(0, 22, 0) ? "STATIONARY CELL OVER THE TRANSMITTER. IT IS NOT PRECIPITATION." : "OVERNIGHT: CLOUD. LOW 39. NO ADVISORIES." };
      if (k === "faith") return { kind: "img", src: t > at(0, 36, 0) ? IMAGES.churchPastor : IMAGES.churchEmpty, label: "VTR 1  VALLEY FAITH HOUR", bed: "faith", cc: t > at(0, 38, 0) ? "LET US LOOK TOGETHER." : "RECORDED SUNDAY  —  PASTOR ELLIS" };
      if (k === "federal") return { kind: "federal", named: state.gaze > 8, label: "VTR 1  —  ???", bed: "quiet", cc: "" };
      return { kind: "bars", label: "VTR 1  AFTER SIGN-OFF", bed: "bars", cc: "SIGN-OFF FAILED  •  STAYING HOT" };
    }
    if (id === "vtr2") {
      const cycle = Math.floor(t / 22) % 3;
      const src = [IMAGES.surveyRoad, IMAGES.surveyRiver, IMAGES.surveyCamp][cycle];
      const cc = ["PROVINCIAL SURVEY 1979  •  DAY 4", "THE FORD WAS NOT ON THE MAP.", "COUNT THE PEOPLE AT THE FIRE."][cycle];
      return { kind: "img", src: src, label: "VTR 2  SURVEY '79", bed: "survey", cc: cc, danger: cycle === 1 };
    }
    if (id === "sat") {
      if (t < at(1, 32, 0)) return { kind: "snow", label: "SAT  —  NO LOCK", bed: null, cc: "NO CARRIER" };
      if (t < at(2, 17, 0)) return { kind: "img", src: IMAGES.satEmpty, label: "SAT  CONTINUITY", bed: "sat", cc: "FEED ID: ANNEX-12  •  UNSCHEDULED", danger: true };
      return { kind: "img", src: IMAGES.satRay, label: "SAT  CONTINUITY", bed: "sat", cc: four ? escapeName() + "  KEEP THE CHAIN HOT" : "IF YOU ARE READING THIS YOU ARE THE OPERATOR", danger: true };
    }
    if (id === "cam3") {
      if (four) return { kind: "img", src: IMAGES.cam3Ray, label: "CAM 3  STUDIO", bed: "cam3", cc: "HE NEVER WENT HOME.", danger: true };
      if (later || state.cam3Seen) return { kind: "img", src: IMAGES.cam3Occ, label: "CAM 3  STUDIO", bed: "cam3", cc: state.talkback ? "THEY HEARD THAT." : "CAMERA 3  •  LIVE TALLY", danger: true };
      return { kind: "img", src: IMAGES.cam3Empty, label: "CAM 3  STUDIO", bed: null, cc: "CAMERA 3  •  DARK" };
    }
    if (id === "tx") {
      if (t >= at(3, 50, 0)) return { kind: "img", src: IMAGES.towerFig, label: "TX SITE CAM", bed: "hum", cc: "FENCE EAST  •  ONE FIGURE", danger: true };
      return { kind: "img", src: IMAGES.tower, label: "TX SITE CAM", bed: "hum", cc: "WQRT TRANSMITTER  •  FWD POWER OK" };
    }
    return { kind: "black", label: id, bed: null, cc: "" };
  }

  function renderInto(sceneEl, ccEl, spec) {
    clearScene(sceneEl);
    ccEl.textContent = spec.cc || "";
    if (spec.kind === "img") imgScene(sceneEl, spec.src);
    else if (spec.kind === "bars") barsScene(sceneEl);
    else if (spec.kind === "id") slateScene(sceneEl);
    else if (spec.kind === "federal") federalScene(sceneEl, spec.named);
    else if (spec.kind === "staff") staffScene(sceneEl);
    else if (spec.kind === "weather") weatherScene(sceneEl);
    else if (spec.kind === "snow") {
      sceneEl.style.background = "#151515";
      const n = document.createElement("div");
      n.className = "noise";
      n.style.opacity = "0.55";
      sceneEl.appendChild(n);
    } else {
      sceneEl.style.background = "#000";
    }
  }

  let lastPgmKind = "", lastPvwKind = "";
  function refreshMonitors(force) {
    const pgm = sourceSpec(state.pgm);
    const pvw = sourceSpec(state.pvw);
    const pk = state.pgm + ":" + pgm.kind + ":" + (pgm.src || "") + ":" + (pgm.cc || "") + ":" + !!pgm.named;
    const vk = state.pvw + ":" + pvw.kind + ":" + (pvw.src || "") + ":" + (pvw.cc || "");
    if (force || pk !== lastPgmKind) {
      renderInto($("pgm-scene"), $("pgm-cc"), pgm);
      lastPgmKind = pk;
    } else if (pgm.kind === "weather") {
      const c = $("pgm-scene").querySelector("canvas");
      if (c) drawRadar(c, state.t);
    }
    if (force || vk !== lastPvwKind) {
      renderInto($("pvw-scene"), $("pvw-cc"), pvw);
      lastPvwKind = vk;
    } else if (pvw.kind === "weather") {
      const c = $("pvw-scene").querySelector("canvas");
      if (c) drawRadar(c, state.t);
    }
    $("pgm-label").textContent = pgm.label;
    $("pvw-label").textContent = pvw.label;
    $("pgm-look").classList.toggle("on", !!pgm.danger && state.gaze > 3);
    $("pvw-look").classList.toggle("on", !!pvw.danger);
    if (state.crawlOn) {
      $("pgm-crawl-wrap").classList.add("on");
      $("pgm-crawl").textContent = state.crawl;
    } else {
      $("pgm-crawl-wrap").classList.remove("on");
    }
    const bed = state.txOn ? pgm.bed : null;
    WQRTAudio.setBed(bed);
    WQRTAudio.setCorruption(Math.min(1, state.gaze / 18 + state.satOnAir / 200));
  }

  function paintKeys() {
    document.querySelectorAll("#keys .src-key").forEach((btn) => {
      btn.classList.toggle("pgm", btn.dataset.src === state.pgm);
      btn.classList.toggle("pvw", btn.dataset.src === state.pvw && state.pvw !== state.pgm);
    });
  }

  function punchPvw(id) {
    if (state.ended || !state.txOn && id === "sat") { /* still allow preview */ }
    WQRTAudio.button();
    state.pvw = id;
    paintKeys();
    refreshMonitors(true);
    logLine("PVW " + id.toUpperCase());
  }
  function take() {
    if (state.ended) return;
    WQRTAudio.punch();
    const from = state.pgm;
    state.pgm = state.pvw;
    paintKeys();
    refreshMonitors(true);
    logLine("TAKE  " + from.toUpperCase() + " → " + state.pgm.toUpperCase());
    if (state.pgm === "sat" && state.t >= at(2, 17, 0)) state.hijack = true;
  }
  function dumpBlack() {
    WQRTAudio.punch();
    state.pgm = "black";
    paintKeys();
    refreshMonitors(true);
    logLine("DUMP TO BLACK");
    if (state.t >= at(2, 16, 0) && state.t <= at(2, 25, 0)) state.dumped217 = true;
  }

  /* ---------- phone ---------- */
  const CALLS = {
    ray1: {
      from: "HOLCOMB R  •  HOME",
      lines: [
        "You in? Good.",
        "Don't touch SAT. Preview only if you have to.",
        "If 2:17 happens again just ride it.",
        "I'm going to bed. Don't log the ghost. Engineering already yelled.",
      ],
    },
    breath: {
      from: "UNKNOWN  •  555-0-12",
      lines: ["(breathing)", "(a swallow)", null],
    },
    donna: {
      from: "KEENE D  •  GM",
      lines: [
        "I am going to say this once.",
        "If a crawl starts that we did not write, you did not see it.",
        "If Camera 3 comes up by itself, you log it as a tally light error.",
        "Ray is not at the station. I just called his house.",
        "His wife said he left for work at six.",
        "Do you understand.",
      ],
    },
    ray2: {
      from: "HOLCOMB R  •  HOME",
      lines: [
        "You're doing fine.",
        "Stay in the chair.",
        "Don't look at preview if the picture is already good.",
        "(the voice arrives a half-second late)",
      ],
    },
    self: {
      from: "EXT 12  •  MASTER CONTROL",
      lines: [
        "This is master control.",
        "This is master control.",
        null,
      ],
    },
    gray: {
      from: "NO CALLER ID",
      lines: [
        "Open the left drawer.",
        "The Gray Book is not a rumor.",
        "If it uses your name, you are already in the chain.",
      ],
    },
    ray3: {
      from: "STUDIO IFB",
      lines: [
        "I never went home.",
        "Don't dump me. I rode it.",
        "The chair is a transmitter.",
        escapeName() + ".",
      ],
    },
  };

  function ring(callId) {
    if (state.ended) return;
    if (state.phone.onLine || state.phone.ringing) {
      state.phone.queue.push(callId);
      logLine("CALL WAITING", "hand");
      return;
    }
    state.phone.ringing = true;
    state.phone.call = callId;
    state.phone.step = 0;
    WQRTAudio.phoneRing();
    setPill("pill-phone", false, false, true, "PHONE");
    $("phone-lcd").classList.add("ring");
    $("phone-lcd").textContent = "INCOMING\n" + CALLS[callId].from;
  }
  function nextQueuedCall() {
    if (state.ended || state.phone.queue.length === 0) return;
    const id = state.phone.queue.shift();
    setTimeout(() => { if (!state.ended) ring(id); }, 900);
  }
  function answer() {
    if (!state.phone.ringing && !state.phone.onLine) return;
    WQRTAudio.pickup();
    state.phone.ringing = false;
    state.phone.onLine = true;
    state.phone.acc = 0;
    $("phone-lcd").classList.remove("ring");
    setPill("pill-phone", true, false, false, "OFF HOOK");
    state.answered[state.phone.call] = true;
    WQRTAudio.speechBed();
    if (state.phone.call === "self") CALLS.self.lines[2] = "This is " + escapeName() + ".";
    if (state.phone.call === "ray3") CALLS.ray3.lines[3] = escapeName() + ".";
    showPhoneLine();
    if (state.phone.call === "breath") {
      setTimeout(() => {
        if (state.phone.call === "breath" && state.phone.onLine) {
          $("phone-lcd").textContent = CALLS.breath.from + "\n" + escapeName() + ".";
        }
      }, 5200);
    }
  }
  function showPhoneLine() {
    const call = CALLS[state.phone.call];
    if (!call) return;
    const line = call.lines[state.phone.step];
    const text = line === null ? escapeName() + "." : line;
    $("phone-lcd").textContent = call.from + "\n" + (text || "…");
  }
  function hang() {
    if (!state.phone.onLine && !state.phone.ringing) return;
    WQRTAudio.hangup();
    state.phone.ringing = false;
    state.phone.onLine = false;
    $("phone-lcd").classList.remove("ring");
    $("phone-lcd").textContent = "LINE IDLE\nEXT 12 — MASTER CONTROL";
    setPill("pill-phone", false, false, false, "PHONE");
    nextQueuedCall();
  }
  function ignore() {
    if (!state.phone.ringing) return;
    WQRTAudio.phoneStop();
    state.phone.ringing = false;
    $("phone-lcd").classList.remove("ring");
    $("phone-lcd").textContent = "MISSED\n" + (CALLS[state.phone.call] ? CALLS[state.phone.call].from : "");
    setPill("pill-phone", false, true, false, "MISSED");
    if (state.phone.call === "breath") {
      logLine("MISSED UNKNOWN — CAM 3 TALLY BLINKED", "ghost");
      state.cam3Seen = true;
      refreshMonitors(true);
    }
    nextQueuedCall();
  }

  /* ---------- papers ---------- */
  function showPaper(kind) {
    const box = $("paper-body");
    box.className = kind === "gray" ? "paper gray" : "paper";
    box.innerHTML = "";
    const h = document.createElement("h2");
    const close = document.createElement("button");
    close.textContent = "PUT IT BACK";
    close.onclick = () => $("paper").classList.add("hidden");
    if (kind === "note") {
      h.textContent = "FROM THE DESK OF R. HOLCOMB";
      const m = document.createElement("p"); m.className = "meta"; m.textContent = "OCT 12  —  LEFT ON THE CLIP";
      const p = document.createElement("p");
      p.textContent = "Going home. Stomach. Program log is on the clip. If 2:17 happens again just ride it. Engineering said stop logging the ghost. Do NOT dump to black during Quiet Hour. GM will have your ass. Coffee in the fridge is not coffee.";
      const p2 = document.createElement("p");
      p2.textContent = "If SAT locks by itself, it isn't a lock. Don't put it on air. Don't put it on preview either if you can help it. I mean it.";
      const p3 = document.createElement("p");
      p3.textContent = "— Ray";
      box.appendChild(h); box.appendChild(m); box.appendChild(p); box.appendChild(p2); box.appendChild(p3);
    } else if (kind === "clip") {
      h.textContent = "WQRT-12  PROGRAM LOG  •  OCT 12 1996";
      const p = document.createElement("p");
      p.style.whiteSpace = "pre-wrap";
      p.style.fontFamily = "monospace";
      p.style.fontSize = "13px";
      p.textContent = "23:45  VTR1  SHOP VALLEY (EVERGREEN)\n00:00  ID / NIGHT RECAP (CART 12)\n00:15  OVERNIGHT WEATHER\n00:30  VALLEY FAITH HOUR (SUN TAPE)\n01:00  SIGN-OFF  —  BARS TO 05:00\n05:00  SIGN-ON  —  DONNA\n\n02:17  (handwritten) just ride it\n        do not dump\n        do not log";
      box.appendChild(h); box.appendChild(p);
    } else if (kind === "gray") {
      h.textContent = "VALLEY RELAY  //  CONTINUITY ANNEX 12";
      const m = document.createElement("p"); m.className = "meta"; m.textContent = "QUIET HOUR PROCEDURE  •  DECOMMISSION PENDING  •  1962";
      const p = document.createElement("p");
      p.style.whiteSpace = "pre-wrap";
      p.textContent = "1. OPERATOR REMAINS IN THE CHAIR\n2. THE CHAIN REMAINS HOT\n3. DO NOT INFORM THE VALLEY\n4. DO NOT IDENTIFY FIGURES ON CAMERA 3\n5. IF ADDRESSED BY NAME, YOU ARE ALREADY IN THE CHAIN\n6. COMPLETION IS A STAFF ADDITION\n7. THE TRANSMITTER IS NOT THE ANTENNA\n   THE OPERATOR IS THE ANTENNA\n\nFAILURE TO COMPLETE RETURNS THE HOUR\nUNTIL THE CHAIR IS FILLED.";
      box.appendChild(h); box.appendChild(m); box.appendChild(p);
      state.openedGray = true;
      logLine("OPENED LEFT DRAWER — GRAY BOOK", "ghost");
    }
    box.appendChild(close);
    $("paper").classList.remove("hidden");
  }

  function confirmKill() {
    const box = $("confirm-box");
    box.innerHTML = "";
    const p = document.createElement("p");
    p.textContent = "TX KILL cuts forward power. The valley goes dark. Engineering is not in the building. Confirm.";
    const yes = document.createElement("button");
    yes.textContent = "KILL TRANSMITTER";
    const no = document.createElement("button");
    no.textContent = "CANCEL";
    yes.onclick = () => { $("confirm").classList.add("hidden"); killTx(); };
    no.onclick = () => $("confirm").classList.add("hidden");
    box.appendChild(p); box.appendChild(yes); box.appendChild(no);
    $("confirm").classList.remove("hidden");
  }

  function killTx() {
    if (state.ended) return;
    state.txOn = false;
    WQRTAudio.txKill();
    $("tx-meter").classList.add("dead");
    setPill("pill-tx", false, false, true, "TX OFF");
    setPill("pill-stl", false, false, true, "STL LOST");
    state.pgm = "black";
    paintKeys();
    refreshMonitors(true);
    logLine("TRANSMITTER KILLED — FWD POWER ZERO", "ghost");
    setTimeout(() => WQRTAudio.knock(), 1600);
    setTimeout(() => {
      state.pgm = "tx";
      refreshMonitors(true);
      $("pgm-cc").textContent = "THE TOWER IS STILL LIT.";
    }, 2800);
    setTimeout(() => ending("dark"), 6200);
  }

  function tryLeave() {
    if (!state.doorUnlocked) {
      logLine("DOOR SECURED — NIGHT LATCH", "hand");
      WQRTAudio.beep(240, 0.2, 0.08);
      return;
    }
    ending("walked");
  }

  function talkback() {
    WQRTAudio.beep(900, 0.15, 0.05);
    state.talkback += 1;
    logLine("TALKBACK CAM 3");
    if (state.t >= at(3, 0, 0) || state.cam3Seen) {
      state.cam3Seen = true;
      WQRTAudio.stinger();
      flash("pgm");
      flash("pvw");
      if (state.pvw !== "cam3") state.pvw = "cam3";
      refreshMonitors(true);
      $("phone-lcd").textContent = "IFB OPEN\nTHEY TURNED THEIR HEADS.";
    } else {
      $("phone-lcd").textContent = "IFB OPEN\n(your voice in an empty studio)\n(it comes back late)";
      setTimeout(() => WQRTAudio.knock(), 900);
    }
  }

  function flash(which) {
    const el = which === "pgm" ? $("pgm-flash") : $("pvw-flash");
    el.style.opacity = "0.85";
    setTimeout(() => { el.style.opacity = "0"; }, 70);
  }

  function subliminal() {
    const scene = $("pgm-scene");
    const hold = scene.innerHTML;
    clearScene(scene);
    imgScene(scene, IMAGES.cam3Occ);
    setTimeout(() => { refreshMonitors(true); }, 90);
  }

  /* ---------- timeline ---------- */
  function once(id, fn) {
    if (state.eventsFired[id]) return;
    state.eventsFired[id] = true;
    fn();
  }

  function tickEvents() {
    const t = state.t;
    if (t >= at(23, 52, 0)) once("log0", () => logLine("VTR1 SHOP VALLEY as scheduled"));
    if (t >= at(0, 0, 0)) once("midnight", () => {
      logLine("CART 12 — ID / NIGHT RECAP");
      if (state.pgm === "vtr1") refreshMonitors(true);
    });
    if (t >= at(0, 6, 0)) once("ray1", () => ring("ray1"));
    if (t >= at(0, 15, 0)) once("wx", () => {
      logLine("VTR1 OVERNIGHT WEATHER");
      refreshMonitors(true);
    });
    if (t >= at(0, 22, 0)) once("crawl1", () => {
      state.crawlOn = true;
      state.crawl = "HARTSFIELD VALLEY  —  OVERNIGHT CLOUD  —  NO ADVISORIES  —  WQRT-12 WE KEEP YOU COMPANY  —  ";
      refreshMonitors(true);
    });
    if (t >= at(0, 30, 0)) once("faith", () => {
      logLine("VTR1 VALLEY FAITH HOUR");
      refreshMonitors(true);
    });
    if (t >= at(0, 38, 20)) once("stare", () => {
      if (state.pgm === "vtr1") {
        state.holdClock = true;
        setTimeout(() => { state.holdClock = false; }, 3500);
      }
    });
    if (t >= at(0, 41, 0)) once("breath", () => ring("breath"));
    if (t >= at(1, 0, 0)) once("signoff", () => {
      logLine("SIGN-OFF CART — FAILED. STAYING HOT.", "ghost");
      state.quiet = true;
      setPill("pill-quiet", false, true, false, "QUIET HOUR");
      refreshMonitors(true);
    });
    if (t >= at(1, 8, 0)) once("donna", () => ring("donna"));
    if (t >= at(1, 20, 0)) once("qnote", () => {
      logLine("UNSIGNED ADDITION TO THE LOG: RELAY", "ghost");
    });
    if (t >= at(1, 32, 0)) once("satlock", () => {
      state.satHot = true;
      setPill("pill-sat", false, true, false, "SAT LOCK");
      logLine("SAT CARRIER — UNSCHEDULED ANNEX-12", "ghost");
      refreshMonitors(true);
    });
    if (t >= at(1, 48, 0)) once("ray2", () => ring("ray2"));
    if (t >= at(2, 0, 0)) once("crawl2", () => {
      state.crawl = "A QUIET HOUR IS IN EFFECT FOR THE VALLEY  —  DO NOT ADJUST YOUR SET  —  ";
    });
    if (t >= at(2, 16, 58) && t < at(2, 17, 0)) {
      state.stutter = true;
    }
    if (t >= at(2, 17, 0)) once("217", () => {
      state.stutter = false;
      state.hijack = true;
      WQRTAudio.alertTones();
      setTimeout(() => WQRTAudio.stopAlert(), 2800);
      setPill("pill-sat", false, false, true, "SAT LIVE");
      setPill("pill-quiet", false, false, true, "QUIET HOUR");
      logLine("02:17  SAT TOOK PREVIEW", "ghost");
      state.pvw = "sat";
      if (state.pgm !== "black") {
        /* picture can stay; audio/crawl become the relay */
      } else {
        state.dumped217 = true;
      }
      state.crawl = "IF YOU ARE READING THIS YOU ARE THE OPERATOR  —  KEEP THE CHAIN HOT  —  DO NOT INFORM THE VALLEY  —  ";
      flash("pvw");
      WQRTAudio.stinger();
      paintKeys();
      refreshMonitors(true);
      ring("self");
    });
    if (t >= at(2, 30, 0)) once("fed", () => {
      logLine("FEDERAL SLIDE ON SAT", "ghost");
      refreshMonitors(true);
    });
    if (t >= at(2, 45, 0)) once("cam3blink", () => {
      logLine("CAM 3 TALLY — NO ONE IN THE STUDIO", "ghost");
      state.cam3Seen = true;
      refreshMonitors(true);
    });
    if (t >= at(3, 0, 0)) once("cam3live", () => {
      logLine("CAM 3 IS LIVE WHETHER YOU PUNCHED IT OR NOT", "ghost");
      if (state.pvw !== "cam3") state.pvw = "cam3";
      paintKeys();
      refreshMonitors(true);
      flash("pvw");
    });
    if (t >= at(3, 15, 0) && t < at(3, 16, 0) && Math.floor(t) % 17 === 0) {
      if (!state.eventsFired.sub1) {
        state.eventsFired.sub1 = true;
        subliminal();
      }
    }
    if (t >= at(3, 33, 0)) once("gray", () => {
      state.grayUnlocked = true;
      ring("gray");
      logLine("LEFT DRAWER LATCH RELEASED", "ghost");
    });
    if (t >= at(3, 50, 0)) once("fence", () => {
      logLine("TX SITE — FIGURE INSIDE THE FENCE", "ghost");
      refreshMonitors(true);
    });
    if (t >= at(4, 0, 0)) once("raycam", () => {
      logLine("CAM 3 — HOLCOMB", "ghost");
      refreshMonitors(true);
      if (state.pvw !== "cam3") {
        state.pvw = "cam3";
        paintKeys();
      }
    });
    if (t >= at(4, 12, 0)) once("ray3", () => ring("ray3"));
    if (t >= at(4, 30, 0)) once("door", () => {
      state.doorUnlocked = true;
      WQRTAudio.knock();
      logLine("NIGHT LATCH OPEN — DOOR", "ghost");
    });
    if (t >= at(4, 33, 0)) once("crawl3", () => {
      state.crawl = escapeName() + " IS IN THE CHAIR  —  FACE CAMERA THREE  —  DO NOT LEAVE  —  ";
      refreshMonitors(true);
    });
    if (t >= at(4, 44, 0)) once("decision", () => {
      $("phone-lcd").textContent = "NO CALLER ID\nFACE CAMERA 3\nOR KILL THE CHAIN\nOR WALK.";
      if (state.pgm === "cam3" || state.pvw === "cam3") state.faced = true;
    });
    if (t >= at(5, 0, 0)) once("five", () => {
      if (state.ended) return;
      if (state.pgm === "cam3" || state.faced) ending("relay");
      else if (state.dumped217 && state.pgm === "black") ending("dump");
      else if (state.gaze > 14) ending("already");
      else ending("relay");
    });
  }

  /* ---------- endings ---------- */
  function ending(kind) {
    if (state.ended) return;
    state.ended = true;
    state.running = false;
    hang();
    const n = escapeName();
    const card = $("end-card");
    card.innerHTML = "";
    const code = document.createElement("div");
    code.className = "code";
    const h = document.createElement("h1");
    const p = document.createElement("p");
    const p2 = document.createElement("p");
    const again = document.createElement("button");
    again.textContent = "ANOTHER NIGHT";
    again.onclick = () => location.reload();
    if (kind === "relay") {
      code.textContent = "ENDING 01  •  RELAY COMPLETE";
      h.textContent = "THE CHAIR IS FILLED";
      p.textContent = "Sign-on ran at 05:00 with a staff slide Donna did not write. Overnight operator: " + n + ". Then R. Holcomb. Then R. Holcomb. Then R. Holcomb.";
      p2.textContent = "The clock is 11:47 PM. Shop Valley is up. You are still in the chair. The valley slept through it. You will not.";
      state.pgm = "id";
      staffScene($("pgm-scene"));
      WQRTAudio.setBed("shop");
    } else if (kind === "dark") {
      code.textContent = "ENDING 02  •  DARK VALLEY";
      h.textContent = "FWD POWER ZERO";
      p.textContent = "You cut the transmitter. The tower obstruction lights stayed on. Something carried the chain anyway. At 05:00 the missing-persons crawl ran with your name in it.";
      p2.textContent = n + " last seen in master control. The door was locked from the inside.";
      WQRTAudio.muteAll();
    } else if (kind === "walked") {
      code.textContent = "ENDING 03  •  WALKED";
      h.textContent = "PARKING LOT";
      p.textContent = "You left the chair. The night latch let you. In the car, the radio was already on WQRT-12. The voice reading the continuity slide was yours. You had not recorded one.";
      p2.textContent = "Camera 3 stayed live until sign-on. Four figures. Then three.";
      clearScene($("pgm-scene"));
      imgScene($("pgm-scene"), IMAGES.parking);
      WQRTAudio.setBed("sat");
    } else if (kind === "dump") {
      code.textContent = "ENDING 04  •  INCOMPLETE";
      h.textContent = "I TOLD YOU TO RIDE IT";
      p.textContent = "You dumped to black at 2:17 and held it. The valley saw nothing. The relay did not complete. Ray's voice, on a line that was not open: I told you to ride it.";
      p2.textContent = "The clock jumped. It is 11:47 PM again. SAT is already in preview. The chair remembers you.";
    } else if (kind === "already") {
      code.textContent = "ENDING 05  •  ALREADY ON AIR";
      h.textContent = "FOUR FIGURES";
      p.textContent = "Engineering reviewed Camera 3 in the morning. You logged three people in the studio. The tape shows four. The fourth is seated in master control, facing Camera 3, which is not how the room is built.";
      p2.textContent = "You were on air the whole night. You just weren't on Program.";
    }
    card.appendChild(code); card.appendChild(h); card.appendChild(p); card.appendChild(p2); card.appendChild(again);
    $("end").classList.remove("hidden");
  }

  /* ---------- loop ---------- */
  function frame(ts) {
    if (!state.running) return;
    if (!state.lastTs) state.lastTs = ts;
    let dt = (ts - state.lastTs) / 1000;
    if (dt > 0.25) dt = 0.25;
    state.lastTs = ts;
    if (!state.holdClock && !state.stutter) {
      state.t += dt * SCALE;
    }
    if (state.t > NIGHT) state.t = NIGHT;

    if (state.stutter) {
      $("clock").textContent = "02:16:58 AM";
      $("clock").style.opacity = (Math.floor(ts / 120) % 2) ? "1" : "0.2";
    } else {
      $("clock").style.opacity = "1";
      $("clock").textContent = clockStr(state.t);
    }

    const pgm = sourceSpec(state.pgm);
    const pvw = sourceSpec(state.pvw);
    if (state.txOn && pgm.danger) state.gaze += dt * 0.35;
    if (pvw.danger) state.gaze += dt * 0.55;
    if (state.lookLock === "pgm" && pgm.danger) state.gaze += dt * 0.8;
    if (state.lookLock === "pvw" && pvw.danger) state.gaze += dt * 1.1;
    if (state.pgm === "sat" && state.txOn) state.satOnAir += dt * SCALE;
    if ((pgm.danger || pvw.danger) && (state.pgm === "cam3" || state.pvw === "cam3")) state.cam3Seen = true;

    if (state.phone.onLine) {
      state.phone.acc = (state.phone.acc || 0) + dt;
      const call = CALLS[state.phone.call];
      if (call && state.phone.acc > 3.4) {
        state.phone.acc = 0;
        if (state.phone.step < call.lines.length - 1) {
          state.phone.step += 1;
          showPhoneLine();
        } else {
          hang();
        }
      }
    }

    tickEvents();
    refreshMonitors(false);

    const jitter = (Math.random() - 0.5) * (0.4 + state.gaze * 0.08);
    $("pgm").style.transform = "translate(" + jitter + "px," + (jitter * 0.4) + "px)";
    $("pvw").style.transform = "translate(" + (-jitter * 0.5) + "px," + jitter + "px)";

    if (state.debug) $("dbg-t").textContent = Math.floor(state.t) + "s  gaze " + state.gaze.toFixed(1);

    if (state.running) requestAnimationFrame(frame);
  }

  /* ---------- boot ---------- */
  const GATE = "ad472ef360d068c68d7c8fe31a08ecc03a7c29e9c878cc6235387920473b7ccf";
  function normCode(s) {
    return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }
  async function codeOk(s) {
    const n = normCode(s);
    if (!n || !crypto.subtle) return false;
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(n));
    const hex = Array.from(new Uint8Array(buf)).map(function (b) {
      return b.toString(16).padStart(2, "0");
    }).join("");
    return hex === GATE;
  }

  function boot() {
    if (state.go) {
      const params = new URLSearchParams(location.search);
      state.name = (params.get("name") || "VEGA").toUpperCase().slice(0, 24);
      const t0 = Number(params.get("t") || 0);
      if (!isNaN(t0) && t0 > 0) state.t = Math.min(NIGHT, t0);
      $("boot").classList.add("hidden");
      $("app").classList.remove("hidden");
      WQRTAudio.start();
      startNight();
      $("paper").classList.add("hidden");
      return;
    }
    const card = $("boot-card");
    let step = 0;
    let fails = 0;
    function show() {
      card.innerHTML = "";
      if (step === 0) {
        const h = document.createElement("h1"); h.textContent = "WQRT-12";
        const s = document.createElement("p"); s.textContent = "CONTINUITY ACCESS  •  ANNEX 12";
        const p = document.createElement("p"); p.textContent = "You were given a station code. Do not read it on air. Headphones.";
        const i = document.createElement("input");
        i.maxLength = 24; i.placeholder = "STATION CODE"; i.autocomplete = "off";
        i.type = "text";
        const err = document.createElement("p");
        err.id = "code-err";
        const b = document.createElement("button"); b.textContent = "OPEN THE CHAIN";
        async function tryCode() {
          if (fails >= 5) {
            err.textContent = "NO CARRIER. TRY AGAIN IN A MOMENT.";
            return;
          }
          const ok = await codeOk(i.value);
          if (ok) {
            WQRTAudio.start();
            WQRTAudio.beep(700, 0.1, 0.08);
            step = 1;
            show();
          } else {
            fails += 1;
            WQRTAudio.start();
            WQRTAudio.beep(140, 0.25, 0.1);
            if (fails >= 5) {
              err.textContent = "THE LOG DOES NOT LIST YOU.";
              b.disabled = true;
              setTimeout(function () { fails = 3; b.disabled = false; err.textContent = "TRY AGAIN."; }, 8000);
            } else if (fails >= 3) err.textContent = "NO CARRIER.";
            else err.textContent = "DENIED.";
          }
        }
        b.onclick = tryCode;
        i.addEventListener("keydown", function (e) { if (e.key === "Enter") tryCode(); });
        card.appendChild(h); card.appendChild(s); card.appendChild(p); card.appendChild(i); card.appendChild(b); card.appendChild(err);
        setTimeout(function () { i.focus(); }, 50);
      } else if (step === 1) {
        const h = document.createElement("h1"); h.textContent = "WQRT-12";
        const s = document.createElement("p"); s.textContent = "MASTER CONTROL  •  HARTSFIELD VALLEY";
        const p = document.createElement("p"); p.textContent = "OCTOBER 12, 1996  —  NIGHT DUTY";
        const p2 = document.createElement("p"); p2.textContent = "You are covering for Ray Holcomb. The board is already hot. Sit close. Do not pause the chain.";
        const b = document.createElement("button"); b.textContent = "POWER ON";
        b.onclick = function () { WQRTAudio.beep(700, 0.1, 0.08); step = 2; show(); };
        card.appendChild(h); card.appendChild(s); card.appendChild(p); card.appendChild(p2); card.appendChild(b);
      } else if (step === 2) {
        const h = document.createElement("h1"); h.textContent = "FCC OPERATOR LOG";
        const p = document.createElement("p"); p.textContent = "Print your name as it should appear on the overnight log. The valley will not see this.";
        const i = document.createElement("input");
        i.maxLength = 24; i.placeholder = "LAST NAME"; i.autocomplete = "off";
        const b = document.createElement("button"); b.textContent = "SIGN THE LOG";
        b.onclick = function () {
          const v = i.value.replace(/[<>]/g, "").trim().toUpperCase();
          state.name = v || "UNLOGGED";
          step = 3; show();
        };
        card.appendChild(h); card.appendChild(p); card.appendChild(i); card.appendChild(b);
        setTimeout(function () { i.focus(); }, 50);
      } else if (step === 3) {
        $("boot").classList.add("hidden");
        $("app").classList.remove("hidden");
        startNight();
      }
    }
    show();
  }

  function startNight() {
    Object.keys(IMAGES).forEach((k) => { const im = new Image(); im.src = IMAGES[k]; });
    const keys = $("keys");
    KEYS.forEach(([id, label]) => {
      const b = document.createElement("button");
      b.className = "key src-key";
      b.dataset.src = id;
      const lamp = document.createElement("div"); lamp.className = "lamp";
      b.appendChild(lamp);
      b.appendChild(document.createTextNode(label));
      b.onclick = () => punchPvw(id);
      keys.appendChild(b);
    });
    const takeBtn = document.createElement("button");
    takeBtn.className = "key take";
    takeBtn.innerHTML = "<div class='lamp'></div>TAKE";
    takeBtn.onclick = take;
    keys.appendChild(takeBtn);

    paintKeys();
    refreshMonitors(true);
    logLine("NIGHT DUTY BEGINS — OP " + escapeName());
    logLine("Ray's note is on the clip.");
    showPaper("note");

    $("phone-lcd").onclick = () => {
      if (!state.phone.onLine) return;
      state.phone.acc = 3.5;
    };
    $("btn-answer").onclick = answer;
    $("btn-ignore").onclick = ignore;
    $("btn-hang").onclick = hang;
    $("btn-talkback").onclick = talkback;
    $("btn-log-ghost").onclick = () => {
      state.loggedGhost += 1;
      logLine("ANOMALY LOGGED BY " + escapeName(), "ghost");
      if (state.loggedGhost === 1) logLine("YOU WERE TOLD NOT TO DO THAT.", "hand");
      if (state.loggedGhost === 3) {
        state.crawlOn = true;
        state.crawl = escapeName() + " IS LOGGING THE GHOST  —  STOP  —  ";
      }
    };
    $("btn-note").onclick = () => showPaper("note");
    $("btn-schedule").onclick = () => showPaper("clip");
    $("btn-gray").onclick = () => {
      if (!state.grayUnlocked) {
        logLine("LEFT DRAWER LOCKED", "hand");
        WQRTAudio.beep(200, 0.15, 0.06);
        return;
      }
      showPaper("gray");
    };
    $("btn-dump").onclick = dumpBlack;
    $("btn-tx").onclick = confirmKill;
    $("btn-leave").onclick = tryLeave;
    $("paper").onclick = (e) => { if (e.target.id === "paper") $("paper").classList.add("hidden"); };

    $("pgm").onclick = () => { state.lookLock = "pgm"; };
    $("pvw").onclick = () => { state.lookLock = "pvw"; };

    document.addEventListener("keydown", (e) => {
      if (e.code === "Space") { e.preventDefault(); take(); }
      if (e.key === "b" || e.key === "B") dumpBlack();
      if (e.key === "Enter" && state.phone.ringing) answer();
    });

    if (state.debug) {
      $("debug").classList.add("on");
      $("dbg-clock").oninput = (e) => { state.t = Number(e.target.value); refreshMonitors(true); };
    }

    state.running = true;
    requestAnimationFrame(frame);
  }

  boot();
})();
