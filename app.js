/* Shipyard Calc - UI */
// Anonymous open counter (GoatCounter). Change this one line if the site code changes; "" turns counting off.
var COUNTER_URL = ""; // PREVIEW copy: counting is off
(function () {
  "use strict";
  var SC = window.SC;
  var $ = function (id) { return document.getElementById(id); };
  var T = window.I18N.T;
  window.I18N.apply(document);
  var DW = { exact: T("exact"), fromExact: T("fromExact") }; // words for the rounding note
  var uName = function (u) { return u === "ft" ? T("phFt") : u === "in" ? T("phIn") : u; };

  // ---------- storage ----------
  var KEYS = { conv: "shipyard-calc-recent", frac: "shipyard-frac-recent", plate: "shipyard-plate-recent", pipe: "shipyard-pipe-recent" };
  function loadList(key) {
    try {
      var raw = localStorage.getItem(key);
      if (raw) { var v = JSON.parse(raw); if (Array.isArray(v)) return v.slice(0, 10); }
    } catch (e) { /* storage blocked: session only */ }
    return [];
  }
  function saveList(key, list) {
    try { localStorage.setItem(key, JSON.stringify(list)); } catch (e) { /* session only */ }
  }
  var recent = { conv: loadList(KEYS.conv), frac: loadList(KEYS.frac), plate: loadList(KEYS.plate), pipe: loadList(KEYS.pipe) };

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function cell(label, value, big, note) {
    var c = el("div", "cell");
    c.appendChild(el("div", "lbl", label));
    c.appendChild(el("div", big ? "v-big" : "v-mid", value));
    if (note) c.appendChild(el("div", "note", note));
    return c;
  }
  function fill(box, nodes) {
    box.textContent = "";
    nodes.forEach(function (n) { if (n) box.appendChild(n); });
  }
  function segValue(seg) { var b = seg.querySelector("button.on"); return b ? b.getAttribute("data-v") : ""; }
  function bindSeg(seg, onChange) {
    seg.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b || !seg.contains(b)) return;
      setSeg(seg, b.getAttribute("data-v"));
      onChange(b.getAttribute("data-v"));
    });
  }
  function setSeg(seg, v) {
    Array.prototype.forEach.call(seg.querySelectorAll("button"), function (b) {
      b.classList.toggle("on", b.getAttribute("data-v") === v);
    });
  }

  // ---------- theme ----------
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    $("themeBtn").textContent = t === "dark" ? "☀" : "☾";
    $("themeBtn").setAttribute("aria-label", t === "dark" ? T("toLight") : T("toDark"));
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", t === "dark" ? "#0b0d10" : "#ffffff");
  }
  var theme = "dark";
  try { theme = localStorage.getItem("shipyard-theme") || "dark"; } catch (e) { /* default */ }
  applyTheme(theme);
  $("themeBtn").addEventListener("click", function () {
    theme = theme === "dark" ? "light" : "dark";
    applyTheme(theme);
    try { localStorage.setItem("shipyard-theme", theme); } catch (e) { /* ignore */ }
  });

  // ---------- tabs ----------
  var tool = "frac";
  Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (b) {
    b.addEventListener("click", function () {
      tool = b.getAttribute("data-tab");
      Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (x) { x.classList.toggle("active", x === b); });
      ["frac", "conv", "plate", "pipe"].forEach(function (t) { $("tab-" + t).classList.toggle("hidden", t !== tool); });
      layoutMode();
      renderRecent();
    });
  });

  // ---------- steady layout ----------
  var recentHome = $("recentBox").parentNode;
  function layoutMode() {
    var fixed = tool === "frac";
    document.body.classList.toggle("fixed", fixed);
    var box = $("recentBox");
    // Tape: Recent sits first in its own fixed-height strip above the keypad (help text scrolls under it)
    if (fixed) $("fScroll").insertBefore(box, $("fScroll").firstChild); else recentHome.appendChild(box);
    document.documentElement.classList.toggle("fixedPage", fixed);
    if (fixed) { window.scrollTo(0, 0); sizeKeys(); }
  }
  function sizeKeys() {
    $("fKeys").classList.toggle("open16", !$("pad16").classList.contains("hidden"));
  }
  // real visible height: CSS 100dvh where supported, else track the visual viewport
  var hasDvh = window.CSS && CSS.supports && CSS.supports("height", "100dvh");
  function setAppH() {
    if (hasDvh) return;
    var h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    document.documentElement.style.setProperty("--appH", Math.round(h) + "px");
  }
  setAppH();
  window.addEventListener("resize", setAppH);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", setAppH);
  window.addEventListener("orientationchange", function () { setTimeout(setAppH, 300); });
  // fit long text inside the fixed display without growing it
  function fitText(node, max, min) {
    var size = max;
    node.style.fontSize = size + "px";
    while (node.scrollWidth > node.clientWidth && size > min) { size -= 2; node.style.fontSize = size + "px"; }
  }

  // result boxes on the typing tabs only ever grow, so deleting a digit never yanks the page
  function reserveOut() {
    Array.prototype.forEach.call(document.querySelectorAll(".outBox"), function (box) {
      var maxH = 0;
      function ratchet() {
        if (box.offsetParent === null) return; // hidden tab
        var h = box.offsetHeight;
        if (h > maxH) { maxH = h; box.style.minHeight = h + "px"; }
      }
      if (window.MutationObserver) new MutationObserver(ratchet).observe(box, { childList: true, subtree: true, characterData: true });
      ratchet();
    });
  }

  // ---------- recent list ----------
  function pushRecent(which, from, to, dedupe) {
    var prev = recent[which];
    if (dedupe) {
      if (prev.length && prev[0].from === from && prev[0].to === to) return;
      prev = prev.filter(function (r) { return r.from !== from; });
    }
    recent[which] = [{ from: from, to: to }].concat(prev).slice(0, 10);
    saveList(KEYS[which], recent[which]);
    if (which === tool) { renderRecent(); if (tool === "frac") $("fScroll").scrollTop = 0; }
  }
  function renderRecent() {
    var list = recent[tool];
    // always shown on every tab; an empty list gets a one-line note and no Clear button (its space is kept so nothing shifts)
    $("recentClear").classList.toggle("off", list.length === 0);
    $("recentClear").disabled = list.length === 0;
    $("recentTitle").textContent = tool === "conv" ? T("recentConv") : tool === "frac" ? T("recentFrac") : tool === "pipe" ? T("recentPipe") : T("recentPlate");
    if (!list.length) { fill($("recentList"), [el("li", "rEmpty", tool === "frac" ? T("recentEmptyFrac") : T("recentEmpty"))]); return; }
    fill($("recentList"), list.map(function (r) {
      var li = el("li");
      li.appendChild(el("div", "r-to", r.to));
      li.appendChild(el("div", "r-from", tool === "conv" ? T("from") + r.from : tool === "frac" ? r.from + " =" : r.from));
      return li;
    }));
  }
  $("recentClear").addEventListener("click", function () {
    recent[tool] = [];
    saveList(KEYS[tool], []);
    renderRecent();
  });

  // =====================================================
  // Tape fractions
  // =====================================================
  var toks = [], fresh = false, lastExpr = "";
  function renderFrac() {
    var r = SC.evaluate(toks);
    var f = r !== null && r !== "div0" ? SC.fmtQ(r) : null;
    var exprLine = fresh ? lastExpr + " =" : SC.showExpr(toks);
    $("fExpr").textContent = exprLine || T("fStart");
    $("fRes").textContent = r === "div0" ? T("div0") : f ? (fresh ? "" : f.isExact ? "= " : "\u2248 ") + f.text : "";
    fill($("fMore"), f ? [
      f.ftIn ? cell(T("ftIn"), f.ftIn) : null,
      cell(T("decMm"), f.dec + "  ·  " + f.mm),
      el("div", "fNote", f.isExact ? T("exactMark") : T("nearest") + SC.diffNote(f.diff, DW))
    ] : [
      el("div", "fHint", T("hint1")),
      el("div", "fHint", T("hint2"))
    ]);
    var ex = $("fExpr");
    fitText(ex, 22, 15);
    ex.scrollLeft = ex.scrollWidth; // keep the newest entry in view (scrolls inside the display only)
    fitText($("fRes"), 42, 20);
    Array.prototype.forEach.call($("fMore").querySelectorAll(".v-mid"), function (v) { fitText(v, 19, 13); });
  }
  function tap(key) {
    var isOp = key === "+" || key === "\u2212" || key === "\u00d7" || key === "\u00f7";
    toks = SC.press(toks, key, fresh && !isOp);
    if (key !== "ft" || !fresh) { fresh = false; lastExpr = ""; }
    renderFrac();
  }
  function onKeyClick(e) {
    var b = e.target.closest("button[data-k]");
    if (b) tap(b.getAttribute("data-k"));
  }
  // screen-reader names come from each key's own value, e.g. f6 -> "3/8 inch" / "3/8 de pulgada"
  Array.prototype.forEach.call(document.querySelectorAll('#fKeys button[data-k^="f"]'), function (b) {
    b.setAttribute("aria-label", T("fracAria", { f: SC.fracStr(Number(b.getAttribute("data-k").slice(1))) }));
  });
  $("fracPad").addEventListener("click", onKeyClick);
  $("pad16").addEventListener("click", onKeyClick);
  $("numPad").addEventListener("click", onKeyClick);
  $("t16").addEventListener("click", function () {
    var open = $("pad16").classList.toggle("hidden") === false;
    $("t16").classList.toggle("on", open);
    $("t16").setAttribute("aria-expanded", open ? "true" : "false");
    sizeKeys();
  });
  $("fBack").addEventListener("click", function () { toks = toks.slice(0, -1); fresh = false; lastExpr = ""; renderFrac(); });
  $("fClear").addEventListener("click", function () { toks = []; fresh = false; lastExpr = ""; renderFrac(); });
  $("fEq").addEventListener("click", function () {
    var r = SC.evaluate(toks);
    if (r === null || r === "div0" || fresh) return;
    var expr = SC.showExpr(toks);
    var f = SC.fmtQ(r);
    pushRecent("frac", expr, f.ftIn ? f.text + " = " + f.ftIn : f.text, false);
    lastExpr = expr;
    toks = [{ t: "val", q: r }];
    fresh = true;
    renderFrac();
  });
  renderFrac();

  // =====================================================
  // Metric <-> Imperial
  // =====================================================
  var fracSel = $("cFrac");
  [{ v: "0", l: T("none") }].concat(Array.from({ length: 15 }, function (_, i) {
    return { v: String(i + 1), l: SC.fracStr(i + 1) + '"' };
  })).forEach(function (o) { var op = el("option", null, o.l); op.value = o.v; fracSel.appendChild(op); });

  var dir = "toImp", unit = "mm", convTimer = null;
  function convCalc() {
    var metric = $("cMetric").value, feet = $("cFeet").value, inches = $("cInches").value, frac = fracSel.value;
    var mVal = SC.parseNum(metric);
    var mm = unit === "mm" ? mVal : unit === "cm" ? mVal * 10 : mVal * 1000;
    var impOk = metric.trim() !== "" && isFinite(mm) && mm >= 0;
    var imp = impOk ? SC.mmToImp(mm) : null;
    var totalIn = SC.parseNum(feet) * 12 + SC.parseInches(inches) + Number(frac) / 16;
    var metOk = (feet.trim() !== "" || inches.trim() !== "" || frac !== "0") && isFinite(totalIn) && totalIn >= 0;
    var outMm = metOk ? totalIn * 25.4 : 0;
    return { metric: metric, feet: feet, inches: inches, frac: frac, mm: mm, imp: imp, metOk: metOk, outMm: outMm };
  }
  function renderConv() {
    var c = convCalc();
    $("cHead").textContent = dir === "toImp" ? T("cHeadImp") : T("cHeadMet");
    $("cToImp").classList.toggle("hidden", dir !== "toImp");
    $("cToMet").classList.toggle("hidden", dir !== "toMet");
    $("cMetricLbl").textContent = T("measIn", { u: unit });
    $("cMetric").placeholder = T("typeU", { u: unit });
    if (c.imp) {
      fill($("cImpOut"), [
        cell(T("ftInNear"), c.imp.ftIn, true, SC.diffNote(c.imp.diff, DW)),
        cell(T("inFrac"), c.imp.tot),
        cell(T("decIn"), c.imp.dec),
        cell(T("decFt"), c.imp.ft)
      ]);
    } else {
      fill($("cImpOut"), c.metric.trim() !== "" ? [el("div", "note", T("numOnly"))] : []);
    }
    if (c.metOk) {
      fill($("cMetOut"), [
        cell(T("mmL"), SC.fmtMm(c.outMm) + " mm", true),
        cell(T("cmL"), (c.outMm / 10).toFixed(2) + " cm"),
        cell(T("mL"), (c.outMm / 1000).toFixed(3) + " m")
      ]);
    } else {
      fill($("cMetOut"), (c.feet.trim() !== "" || c.inches.trim() !== "") ? [el("div", "note", T("tryFt"))] : []);
    }
    // save after 1.5 s of no typing
    var from = dir === "toImp"
      ? c.metric.trim() + " " + unit
      : [c.feet.trim() ? c.feet.trim() + "'" : "", c.inches.trim() ? c.inches.trim() + '"' : "", c.frac !== "0" ? "+" + SC.fracStr(Number(c.frac)) + '"' : ""].filter(Boolean).join(" ");
    var to = dir === "toImp" ? (c.imp ? c.imp.ftIn + "  ·  " + c.imp.dec : "") : (c.metOk ? SC.fmtMm(c.outMm) + " mm" : "");
    if (convTimer) clearTimeout(convTimer);
    if (to) convTimer = setTimeout(function () { pushRecent("conv", from, to, true); }, 1500);
  }
  bindSeg($("cDir"), function (v) { dir = v; renderConv(); });
  bindSeg($("cUnit"), function (v) { unit = v; renderConv(); });
  ["cMetric", "cFeet", "cInches"].forEach(function (id) { $(id).addEventListener("input", renderConv); });
  fracSel.addEventListener("change", renderConv);
  $("cClear").addEventListener("click", function () {
    $("cMetric").value = ""; $("cFeet").value = ""; $("cInches").value = ""; fracSel.value = "0"; renderConv();
  });
  $("cSwap").addEventListener("click", function () {
    var c = convCalc();
    if (dir === "toImp") {
      if (c.imp && isFinite(c.mm)) {
        var n16 = Math.round((c.mm / 25.4) * 16 + 1e-9);
        var ft = Math.floor(n16 / 192), rem = n16 - ft * 192;
        $("cFeet").value = ft ? String(ft) : "";
        $("cInches").value = String(Math.floor(rem / 16));
        fracSel.value = String(rem % 16);
      }
      dir = "toMet";
    } else {
      if (c.metOk) { unit = "mm"; setSeg($("cUnit"), "mm"); $("cMetric").value = c.outMm.toFixed(1); }
      dir = "toImp";
    }
    setSeg($("cDir"), dir);
    renderConv();
  });
  renderConv();

  // =====================================================
  // Plate weight
  // =====================================================
  var lenUnit = "ft", thkUnit = "mm", plateTimer = null;
  function renderPlate() {
    var ftMode = lenUnit === "ft";
    $("pFtBoxes").classList.toggle("hidden", !ftMode);
    $("pOneBoxes").classList.toggle("hidden", ftMode);
    $("pLLbl").textContent = T("lenU", { u: uName(lenUnit) });
    $("pWLbl").textContent = T("widU", { u: uName(lenUnit) });
    $("pL").placeholder = uName(lenUnit); $("pW").placeholder = uName(lenUnit);
    var inMode = lenUnit === "in" ? "text" : "decimal";
    $("pL").setAttribute("inputmode", inMode); $("pW").setAttribute("inputmode", inMode);
    $("pThkLbl").textContent = thkUnit === "mm" ? T("thkMm") : T("thkInch");
    $("pThk").placeholder = thkUnit === "mm" ? T("eg14") : T("egHalf");
    $("pThk").setAttribute("inputmode", thkUnit === "mm" ? "decimal" : "text");
    $("pThkFracs").classList.toggle("hidden", thkUnit !== "in");
    var thk = $("pThk").value;
    Array.prototype.forEach.call($("pThkFracs").querySelectorAll("button"), function (b) {
      b.classList.toggle("on", b.getAttribute("data-t") === thk);
    });

    var la = ftMode ? $("pLFt").value : $("pL").value, lb = ftMode ? $("pLIn").value : "";
    var wa = ftMode ? $("pWFt").value : $("pW").value, wb = ftMode ? $("pWIn").value : "";
    var L = SC.lenToFt(lenUnit, la, lb), W = SC.lenToFt(lenUnit, wa, wb), Th = SC.thkToFt(thkUnit, thk);
    var qs = $("pQty").value;
    var qRaw = qs.trim() === "" ? 1 : SC.parseNum(qs);
    var Q = isFinite(qRaw) && qRaw > 0 ? qRaw : NaN;
    var mat = $("pMat").value;
    var r = SC.plate(L, W, Th, Q, mat);
    if (!r) { fill($("pOut"), []); if (plateTimer) clearTimeout(plateTimer); return; }

    var tot = el("div", "cell");
    tot.appendChild(el("div", "lbl", Q > 1 ? T("totN", { n: Q }) : T("tot")));
    tot.appendChild(el("div", "v-big", SC.fmtWt(r.totLb) + " lb"));
    if (r.totLb >= 1000) tot.appendChild(el("div", "v-mid", T("tons", { t: SC.fmtNum(r.tons, 2) })));
    fill($("pOut"), [
      tot,
      cell(T("metric"), SC.fmtWt(r.totKg) + " kg  ·  " + SC.fmtNum(r.tonnes, 2) + " t"),
      Q > 1 ? cell(T("each"), SC.fmtWt(r.pieceLb) + " lb  ·  " + SC.fmtWt(r.pieceKg) + " kg") : null,
      cell(T("area"), SC.fmtNum(r.area, 1) + " ft²  ·  " + SC.fmtNum(r.lbPerFt2, 2) + " lb/ft²"),
      el("div", "note", T("safety"))
    ]);

    var dim = function (a, b) {
      return ftMode ? (a.trim() || "0") + "'" + (b.trim() ? " " + b.trim() + '"' : "") : a.trim() + " " + lenUnit;
    };
    var from = (Q > 1 ? Q + " × " : "") + dim(la, lb) + " x " + dim(wa, wb) + " x " + thk.trim() +
      (thkUnit === "mm" ? " mm" : '"') + " " + T({ mild: "nmMild", stainless: "nmStain", alum: "nmAlum" }[mat]);
    var to = SC.fmtWt(r.totLb) + " lb  ·  " + SC.fmtWt(r.totKg) + " kg";
    if (plateTimer) clearTimeout(plateTimer);
    plateTimer = setTimeout(function () { pushRecent("plate", from, to, true); }, 1500);
  }
  function clearLen() { ["pLFt", "pLIn", "pWFt", "pWIn", "pL", "pW"].forEach(function (id) { $(id).value = ""; }); }
  bindSeg($("pLenUnit"), function (v) { lenUnit = v; clearLen(); renderPlate(); });
  bindSeg($("pThkUnit"), function (v) { thkUnit = v; $("pThk").value = ""; renderPlate(); });
  ["pLFt", "pLIn", "pWFt", "pWIn", "pL", "pW", "pThk", "pQty"].forEach(function (id) {
    $(id).addEventListener("input", renderPlate);
  });
  $("pMat").addEventListener("change", renderPlate);
  $("pThkFracs").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-t]");
    if (b) { $("pThk").value = b.getAttribute("data-t"); renderPlate(); }
  });
  $("pClear").addEventListener("click", function () {
    clearLen(); $("pThk").value = ""; $("pQty").value = "1"; renderPlate();
  });
  renderPlate();

  // =====================================================
  // Pipe fitting
  // =====================================================
  (function () {
    var ptool = "off", pUnit = "in", pipeTimer = null;
    var angSel = { oAng: "45", rAng: "45" }, tType = "lr90", kWelds = 2, mPieces = 3;
    var GAP_DEF = { "in": "1/8", mm: "3" };
    var ftKey = { lr90: "ftLr90s", sr90: "ftSr90s", lr45: "ftLr45s" };

    // size lists: "1/2"" ... "24"" (DN in brackets)
    Array.prototype.forEach.call(document.querySelectorAll(".sizeSel"), function (sel) {
      SC.ELBOWS.forEach(function (e, i) {
        var o = el("option", null, e.nps + '"  (DN ' + e.dn + ")"); o.value = String(i); sel.appendChild(o);
      });
      if (sel.id === "mSize") { var o = el("option", null, T("typeOd")); o.value = "typed"; sel.appendChild(o); }
      sel.value = "9"; // 4"
    });

    function len(id) { return SC.parseLen($(id).value, pUnit); }
    function blank(id) { return $(id).value.trim() === ""; }
    function lenStr(id) { return $(id).value.trim() + (pUnit === "mm" ? " mm" : /["']$/.test($(id).value.trim()) ? "" : '"'); }
    // one result line: big tape fraction (or mm), note with the other units
    function lenCell(label, v, big) {
      var f = SC.fmtIn(v);
      var main = pUnit === "mm" ? f.mm : f.text;
      var rest = pUnit === "mm" ? [f.text, f.dec] : [f.dec, f.mm];
      if (f.ftIn) rest.unshift(f.ftIn);
      return cell(label, main, big, rest.join("  ·  "));
    }
    function shortLen(v) { var f = SC.fmtIn(v); return pUnit === "mm" ? f.mm : f.text; }
    function angle(id) {
      var v = angSel[id];
      return v === "c" ? SC.parseAngle($(id + "C").value) : Number(v);
    }
    function bad(box, key) { fill(box, [el("div", "note", T(key))]); }
    function save(from, to) {
      if (pipeTimer) clearTimeout(pipeTimer);
      pipeTimer = setTimeout(function () { pushRecent("pipe", from, to, true); }, 1500);
    }
    function stopSave() { if (pipeTimer) clearTimeout(pipeTimer); }
    function multNote(r) { return T("mult", { c: r.csc.toFixed(3), t: r.cot.toFixed(3) }); }

    function renderOff() {
      var box = $("oOut"), a = angle("oAng");
      if (blank("oOff")) { fill(box, []); return stopSave(); }
      var off = len("oOff");
      if (!isFinite(off) || off <= 0) { bad(box, pUnit === "mm" ? "badMm" : "badIn"); return stopSave(); }
      if (!SC.offsetMult(a)) { bad(box, "badAng"); return stopSave(); }
      var r = SC.simpleOffset(off, a);
      fill(box, [lenCell(T("travel"), r.travel, true), lenCell(T("run"), r.run), el("div", "note", multNote(r))]);
      save(T("offH") + " " + lenStr("oOff") + " @ " + SC.fmtDeg(a), T("travel") + " " + shortLen(r.travel) + "  ·  " + T("run") + " " + shortLen(r.run));
    }
    function renderRoll() {
      var box = $("rOut"), a = angle("rAng");
      if (blank("rRise") && blank("rRoll")) { fill(box, []); return stopSave(); }
      var rise = blank("rRise") ? 0 : len("rRise"), roll = blank("rRoll") ? 0 : len("rRoll");
      if (!isFinite(rise) || !isFinite(roll) || rise < 0 || roll < 0 || rise + roll <= 0) { bad(box, pUnit === "mm" ? "badMm" : "badIn"); return stopSave(); }
      if (!SC.offsetMult(a)) { bad(box, "badAng"); return stopSave(); }
      var r = SC.rollingOffset(rise, roll, a);
      fill(box, [lenCell(T("travel"), r.travel, true), lenCell(T("trueOff"), r.trueOff), lenCell(T("setback"), r.setback), el("div", "note", multNote(r))]);
      save(T("rollH") + " " + (blank("rRise") ? "0" : lenStr("rRise")) + " × " + (blank("rRoll") ? "0" : lenStr("rRoll")) + " @ " + SC.fmtDeg(a),
        T("travel") + " " + shortLen(r.travel) + "  ·  " + T("setback") + " " + shortLen(r.setback));
    }
    function renderTo() {
      var i = Number($("tSize").value), e = SC.ELBOWS[i], v = SC.takeout(i, tType);
      var others = el("div", "cell");
      others.appendChild(el("div", "lbl", T("allFor", { s: e.nps + '"' })));
      ["lr90", "sr90", "lr45"].forEach(function (k) {
        var x = e[k], row = el("div", "mRow");
        row.appendChild(el("span", "mK", T(ftKey[k])));
        row.appendChild(el("span", "mV", x === null ? "—" : SC.fmtIn(x).text));
        row.appendChild(el("span", "mMm", x === null ? "" : e.mm[["lr90", "sr90", "lr45"].indexOf(k)] + " mm"));
        others.appendChild(row);
      });
      if (v === null) { fill($("tOut"), [el("div", "note warnTxt", T("noSr")), others]); return stopSave(); }
      var f = SC.fmtIn(v), mm = e.mm[["lr90", "sr90", "lr45"].indexOf(tType)];
      fill($("tOut"), [
        cell(T("takeout"), f.text, true, f.dec + "  ·  " + mm + " mm (B16.9)"),
        cell(T("odL"), SC.fmtIn(e.od).dec + "  ·  " + (e.od * 25.4).toFixed(1) + " mm"),
        others
      ]);
      save(e.nps + '" ' + T(ftKey[tType]), T("takeout") + " " + f.text);
    }
    function endTo(n, i) {
      var k = $("kEnd" + n).value;
      if (k === "none") return { v: 0, lbl: T("ftNone") };
      if (k === "typed") {
        if (blank("kTyped" + n)) return { v: NaN, need: true };
        return { v: len("kTyped" + n), lbl: T("ftTyped") };
      }
      var v = SC.takeout(i, k);
      return v === null ? { v: NaN, noSr: true } : { v: v, lbl: SC.ELBOWS[i].nps + '" ' + T(ftKey[k]) };
    }
    function renderCut() {
      var box = $("kOut");
      $("kTyped1").classList.toggle("hidden", $("kEnd1").value !== "typed");
      $("kTyped2").classList.toggle("hidden", $("kEnd2").value !== "typed");
      if (blank("kCC")) { fill(box, []); return stopSave(); }
      var i = Number($("kSize").value), cc = len("kCC"), e1 = endTo(1, i), e2 = endTo(2, i);
      var gap = blank("kGap") ? 0 : len("kGap");
      if (e1.noSr || e2.noSr) { bad(box, "noSr"); return stopSave(); }
      if (e1.need || e2.need) { bad(box, "needTo"); return stopSave(); }
      var r = SC.cutLength(cc, e1.v, e2.v, gap, kWelds);
      if (!r) { bad(box, pUnit === "mm" ? "badMm" : "badIn"); return stopSave(); }
      if (!r.ok) { fill(box, [el("div", "note warnTxt", T("cutNeg"))]); return stopSave(); }
      fill(box, [
        lenCell(T("cutL"), r.cut, true),
        (function () {
          var c = el("div", "cell"); c.appendChild(el("div", "lbl", T("minus")));
          [[T("end1"), e1.v], [T("end2"), e2.v], [T("gaps", { n: kWelds }), r.gaps]].forEach(function (x) {
            var row = el("div", "mRow"); row.appendChild(el("span", "mK", x[0])); row.appendChild(el("span", "mV", shortLen(x[1]))); c.appendChild(row);
          });
          return c;
        })()
      ]);
      save(T("cc") + " " + lenStr("kCC") + " − " + shortLen(e1.v) + " − " + shortLen(e2.v) + " − " + shortLen(r.gaps), T("cutL") + " " + shortLen(r.cut));
    }
    function renderMit() {
      var box = $("mOut"), typed = $("mSize").value === "typed";
      $("mOD").classList.toggle("hidden", !typed);
      $("mR15").classList.toggle("hidden", typed);
      var od = typed ? (blank("mOD") ? NaN : len("mOD")) : SC.ELBOWS[Number($("mSize").value)].od;
      var bend = SC.parseAngle($("mBend").value);
      if (blank("mR") || (typed && blank("mOD"))) { fill(box, []); return stopSave(); }
      var R = len("mR");
      if (!isFinite(od) || od <= 0 || !isFinite(R) || R <= 0) { bad(box, pUnit === "mm" ? "badMm" : "badIn"); return stopSave(); }
      if (!isFinite(bend) || bend <= 0 || bend > 180) { bad(box, "badBend"); return stopSave(); }
      var r = SC.miter(od, mPieces, bend, R);
      if (!r) { bad(box, "badBend"); return stopSave(); }
      if (r.tight) { fill(box, [el("div", "note warnTxt", T("tight"))]); return stopSave(); }
      var piece = function (label, p, count) {
        var c = el("div", "cell");
        c.appendChild(el("div", "lbl", label + (count > 1 ? " × " + count : "")));
        [["long", p.long], ["center", p.center], ["short", p.short]].forEach(function (x) {
          var f = SC.fmtIn(x[1]), row = el("div", "mRow");
          row.appendChild(el("span", "mK", T(x[0])));
          row.appendChild(el("span", "mV", pUnit === "mm" ? f.mm : f.text));
          row.appendChild(el("span", "mMm", pUnit === "mm" ? f.text : f.mm));
          c.appendChild(row);
        });
        return c;
      };
      fill(box, [
        cell(T("cutAng"), SC.fmtDeg(r.cutAng), true, (r.welds === 1 ? T("weld1") : T("weldsN", { n: r.welds })) + "  ·  " + T("odIs", { d: shortLen(od) })),
        lenCell(T("cutback"), r.cutback),
        r.nMid > 0 ? piece(T("midPc"), r.mid, r.nMid) : null,
        piece(T("endPc"), r.end, 2),
        el("div", "note", T("endNote"))
      ]);
      save(T("mitH") + " " + mPieces + " × " + SC.fmtDeg(bend) + ", OD " + shortLen(od) + ", R " + lenStr("mR"),
        T("cutAng") + " " + SC.fmtDeg(r.cutAng) + "  ·  " + T("cutback") + " " + shortLen(r.cutback));
    }
    var R = { off: renderOff, roll: renderRoll, to: renderTo, cut: renderCut, mit: renderMit };
    function renderPipe() {
      ["off", "roll", "to", "cut", "mit"].forEach(function (k) { $("pt-" + k).classList.toggle("hidden", k !== ptool); });
      $("ptUnitBox").classList.toggle("hidden", ptool === "to");
      Array.prototype.forEach.call(document.querySelectorAll("#tab-pipe .lenIn"), function (inp) {
        inp.setAttribute("inputmode", pUnit === "mm" ? "decimal" : "text");
        inp.placeholder = pUnit === "mm" ? T("phMm") : T("phLen");
      });
      ["oAng", "rAng"].forEach(function (id) { $(id + "C").classList.toggle("hidden", angSel[id] !== "c"); });
      R[ptool]();
    }
    bindSeg($("ptSel"), function (v) { ptool = v; stopSave(); renderPipe(); });
    bindSeg($("ptUnit"), function (v) {
      if (v === pUnit) return;
      // switching units clears typed lengths so a number never silently changes meaning
      Array.prototype.forEach.call(document.querySelectorAll("#tab-pipe .lenIn"), function (inp) { inp.value = ""; });
      pUnit = v;
      $("kGap").value = GAP_DEF[pUnit]; // 1/8" or 3 mm
      stopSave(); renderPipe();
    });
    ["oAng", "rAng"].forEach(function (id) {
      bindSeg($(id), function (v) { angSel[id] = v; renderPipe(); if (v === "c") $(id + "C").focus(); });
      $(id + "C").addEventListener("input", renderPipe);
    });
    bindSeg($("tType"), function (v) { tType = v; renderPipe(); });
    bindSeg($("kWelds"), function (v) { kWelds = Number(v); renderPipe(); });
    bindSeg($("mPieces"), function (v) { mPieces = Number(v); renderPipe(); });
    ["oOff", "rRise", "rRoll", "kCC", "kTyped1", "kTyped2", "kGap", "mOD", "mBend", "mR"].forEach(function (id) {
      $(id).addEventListener("input", renderPipe);
    });
    ["tSize", "kSize", "kEnd1", "kEnd2", "mSize"].forEach(function (id) { $(id).addEventListener("change", renderPipe); });
    $("mR15").addEventListener("click", function () {
      var e = SC.ELBOWS[Number($("mSize").value)]; if (!e) return;
      var nps = SC.parseInches(e.nps) * 1.5; // long radius = 1.5 x nominal size
      $("mR").value = pUnit === "mm" ? SC.fmtMm(nps * 25.4) : SC.fmtIn(nps).text.replace('"', "");
      renderPipe();
    });
    $("kClear").addEventListener("click", function () {
      ["kCC", "kTyped1", "kTyped2"].forEach(function (id) { $(id).value = ""; });
      $("kGap").value = GAP_DEF[pUnit]; renderPipe();
    });
    renderPipe();
  })();

  layoutMode();
  renderRecent();
  reserveOut();

  // ---------- share / QR ----------
  var SHARE_URL = "https://biscuit5760.github.io/shipyard-calc/";
  var ov = $("shareOv"), lastFocus = null;
  document.querySelector(".qrBox img").alt = T("qrAlt", { u: SHARE_URL });
  function openShare() { lastFocus = document.activeElement; ov.classList.remove("hidden"); $("shareCopy").textContent = T("copy"); $("shareClose").focus({ preventScroll: true }); }
  function closeShare() { ov.classList.add("hidden"); if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true }); }
  $("shareBtn").addEventListener("click", openShare);
  $("shareClose").addEventListener("click", closeShare);
  ov.addEventListener("click", function (e) { if (e.target === ov) closeShare(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !ov.classList.contains("hidden")) closeShare(); });
  function copied(ok) { $("shareCopy").textContent = ok ? T("copied") : T("copyFail"); }
  function fallbackCopy() {
    try {
      var ta = document.createElement("textarea"); ta.value = SHARE_URL; ta.setAttribute("readonly", "");
      ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select();
      var ok = document.execCommand("copy"); document.body.removeChild(ta); copied(ok);
    } catch (e) { copied(false); }
  }
  $("shareCopy").addEventListener("click", function () {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(SHARE_URL).then(function () { copied(true); }, fallbackCopy);
    } else fallbackCopy();
  });
  if (navigator.share) {
    $("shareSend").classList.remove("hidden");
    $("shareSend").addEventListener("click", function () {
      navigator.share({ title: "Shipyard Calc", text: T("shareText"), url: SHARE_URL }).catch(function () { /* cancelled */ });
    });
  }

  // ---------- offline ----------
  // ---------- install banner ----------
  // Phones never let a web page install itself, so this just makes the phone's own install step easy to find.
  // Android/Chrome/Edge/Samsung: one tap opens the phone's real Install box. iPhone: short Share -> Add to Home Screen tip.
  (function () {
    var bar = $("instBar"), btn = $("instBtn"), msg = $("instMsg");
    var DKEY = "shipyard-install-hidden", IKEY = "shipyard-installed", WEEK = 7 * 24 * 3600 * 1000;
    var ua = navigator.userAgent || "", deferred = null, mode = "", lastTap = 0, pending = null;
    function store(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
    function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function standalone() {
      var mm = function (q) { return window.matchMedia && window.matchMedia(q).matches; };
      return mm("(display-mode: standalone)") || mm("(display-mode: fullscreen)") || mm("(display-mode: minimal-ui)") ||
        navigator.standalone === true || document.referrer.indexOf("android-app://") === 0;
    }
    function hiddenByUser() { var t = Number(read(DKEY) || 0); return t > 0 && Date.now() - t < WEEK; }
    var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    var isAndroid = /Android/i.test(ua);
    var inApp = /FBAN|FBAV|FB_IAB|Messenger|Instagram|Line\/|GSA\/|Snapchat|Twitter|MicroMessenger|GmailApp|; wv\)/i.test(ua);
    var iosOtherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua); // these have Share > Add to Home Screen too (iOS 16.4+)
    var iosSafari = isIOS && !inApp && (iosOtherBrowser || /Safari\//.test(ua));

    var SHARE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Share"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>';
    function setMsg(key) {
      msg.textContent = "";
      T(key).split("{icon}").forEach(function (part, i) {
        if (i > 0) { var s = document.createElement("span"); s.className = "instSvg"; s.innerHTML = SHARE_SVG; s.firstChild.setAttribute("aria-label", T("share")); msg.appendChild(s); }
        if (part) msg.appendChild(document.createTextNode(part));
      });
    }
    function hide() { mode = ""; bar.classList.add("hidden"); document.body.classList.remove("instOn"); if (pending) { clearTimeout(pending); pending = null; } }
    function show(m) {
      if (standalone() || hiddenByUser()) return hide();
      if (m !== "prompt" && read(IKEY)) return; // already installed from this browser: no tip
      // never shift the keypad in the middle of typing: wait for a short pause
      var wait = 1500 - (Date.now() - lastTap);
      if (wait > 0) { if (pending) clearTimeout(pending); pending = setTimeout(function () { pending = null; show(m); }, wait); return; }
      mode = m;
      btn.classList.toggle("hidden", m !== "prompt");
      msg.classList.toggle("hidden", m === "prompt");
      if (m === "ios") setMsg("instIos");
      else if (m === "iosOther") setMsg("instIosOther");
      else if (m === "android") setMsg("instAnd");
      else if (m === "inApp") setMsg("instInApp");
      bar.classList.remove("hidden");
      document.body.classList.add("instOn");
    }
    document.addEventListener("pointerdown", function (e) { if (!bar.contains(e.target)) lastTap = Date.now(); }, true);

    if (standalone()) { store(IKEY, "1"); return; } // opened from the home screen: nothing to show
    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();
      deferred = e;
      store(IKEY, null); // Chrome only offers this when the app is NOT installed
      show("prompt");
    });
    window.addEventListener("appinstalled", function () { store(IKEY, "1"); deferred = null; hide(); });
    btn.addEventListener("click", function () {
      if (!deferred) return hide();
      var ev = deferred; deferred = null;
      try {
        ev.prompt();
        if (ev.userChoice) ev.userChoice.then(function (c) { if (c && c.outcome === "accepted") store(IKEY, "1"); hide(); }, hide);
        else hide();
      } catch (err) { hide(); }
    });
    $("instX").addEventListener("click", function () { store(DKEY, String(Date.now())); hide(); });
    if (window.matchMedia) {
      var mq = window.matchMedia("(display-mode: standalone)");
      var onMode = function () { if (standalone()) hide(); };
      if (mq.addEventListener) mq.addEventListener("change", onMode); else if (mq.addListener) mq.addListener(onMode);
    }

    if (isIOS) { show(iosSafari ? "ios" : "iosOther"); return; }
    if (isAndroid) {
      // Chrome, Edge and Samsung fire beforeinstallprompt within a few seconds; QR-scanner and chat-app browsers usually don't.
      setTimeout(function () { if (!deferred && !mode) show(inApp ? "inApp" : "android"); }, 3000);
    }
  })();

  // ---------- anonymous open counter ----------
  // Sends only a path, title, and "installed"/"browser". No cookies, no IDs, no referrer.
  // /first-open: once ever per device. /app: at most once per day per device.
  (function () {
    if (!COUNTER_URL || location.protocol === "file:") return;
    function get(k) { try { return localStorage.getItem(k); } catch (e) { return "x"; } } // storage blocked: don't count
    function set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
    function today() { var d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
    function mode() {
      var sa = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
      return sa ? "installed" : "browser";
    }
    function ping(path) {
      var url = COUNTER_URL + "?p=" + path + "&t=Shipyard%20Calc&r=" + mode() + "&rnd=" + Math.random().toString(36).slice(2, 10);
      try {
        if (window.fetch) {
          fetch(url, { mode: "no-cors", credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store", keepalive: true }).catch(function () { /* silent */ });
        } else {
          var img = new Image(); img.referrerPolicy = "no-referrer"; img.src = url;
        }
      } catch (e) { /* silent */ }
    }
    var sent = false;
    function run() {
      if (sent || !navigator.onLine) return;
      sent = true;
      if (!get("shipyard-count-first")) { set("shipyard-count-first", "1"); ping("/first-open"); }
      var d = today();
      if (get("shipyard-count-day") !== d) { set("shipyard-count-day", d); ping("/app"); }
    }
    function start() { if (navigator.onLine) run(); else window.addEventListener("online", run); }
    // after the page is up, so it never slows the app
    if (document.readyState === "complete") setTimeout(start, 0);
    else window.addEventListener("load", function () { setTimeout(start, 0); });
  })();

  // When a new version takes over, reload once so the new files show right away.
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    var hadController = !!navigator.serviceWorker.controller, reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (!hadController || reloaded) return; // first install: nothing to refresh
      var key = "shipyard-sw-reload", now = Date.now(), last = 0;
      try { last = Number(sessionStorage.getItem(key) || 0); } catch (e) { /* ignore */ }
      if (now - last < 10000) return; // guard against reload loops
      try { sessionStorage.setItem(key, String(now)); } catch (e) { /* ignore */ }
      reloaded = true;
      location.reload();
    });
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./sw.js", { scope: "./" }).then(function (reg) {
        if (reg && reg.update) reg.update().catch(function () { /* offline */ });
      }).catch(function () { /* offline cache unavailable */ });
    });
  }
})();
