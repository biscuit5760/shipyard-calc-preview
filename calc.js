/* Shipyard Calc - math (no DOM). Works in the browser and in node for tests. */
(function (root) {
  "use strict";

  function gcd(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b) { var t = a % b; a = b; b = t; }
    return a;
  }

  function fracStr(n16) {
    var w = Math.floor(n16 / 16), r = n16 % 16;
    if (!r) return String(w);
    var g = gcd(r, 16), f = (r / g) + "/" + (16 / g);
    return w ? w + " " + f : f;
  }

  // ---------- Metric <-> Imperial ----------
  function mmToImp(mm) {
    var inch = mm / 25.4;
    var n16 = Math.round(inch * 16 + 1e-9);
    var ft = Math.floor(n16 / 192);
    var rem = n16 - ft * 192;
    var remStr = fracStr(rem);
    if (ft > 0 && rem > 0 && rem < 16) remStr = "0 " + remStr;
    var ftIn = ft > 0 ? ft + "' " + remStr + '"' : remStr + '"';
    return {
      dec: inch.toFixed(3) + '"',
      ftIn: ftIn,
      tot: fracStr(n16) + '"',
      ft: (inch / 12).toFixed(4) + "'",
      diff: n16 / 16 - inch
    };
  }

  function parseNum(s) {
    var t = String(s).trim().replace(",", ".");
    if (!t) return 0;
    if (!/^\d*\.?\d*$/.test(t) || t === ".") return NaN;
    return parseFloat(t);
  }

  function parseInches(s) {
    var t = String(s).trim().replace(/"/g, "");
    if (!t) return 0;
    var m = t.match(/^(\d+(?:\.\d*)?|\.\d+)?(?:[\s-]+)?(?:(\d+)\/(\d+))?$/);
    if (!m || (!m[1] && !m[2])) return NaN;
    var v = m[1] ? parseFloat(m[1]) : 0;
    if (m[2]) {
      var d = Number(m[3]);
      if (!d) return NaN;
      v += Number(m[2]) / d;
    }
    return v;
  }

  // words: optional { exact: "...", fromExact: "..." } for other languages
  function diffNote(d, words) {
    var w = words || { exact: "exact", fromExact: "from exact" };
    if (Math.abs(d) < 0.0005) return w.exact;
    var sign = d > 0 ? "+" : "\u2212";
    return "(" + sign + Math.abs(d).toFixed(3) + '" ' + w.fromExact + ")";
  }

  // ---------- Tape-measure fractions (exact rational math) ----------
  function q(n, d) {
    if (d === undefined) d = 1;
    if (d < 0) { n = -n; d = -d; }
    var g = gcd(n, d) || 1;
    return { n: n / g, d: d / g };
  }
  function qAdd(a, b) { return q(a.n * b.d + b.n * a.d, a.d * b.d); }
  function qSub(a, b) { return q(a.n * b.d - b.n * a.d, a.d * b.d); }
  function qMul(a, b) { return q(a.n * b.n, a.d * b.d); }
  function qDiv(a, b) { return b.n === 0 ? null : q(a.n * b.d, a.d * b.n); }

  var GLYPH = { 8: "\u00bd", 4: "\u00bc", 12: "\u00be", 2: "\u215b", 6: "\u215c", 10: "\u215d", 14: "\u215e" };
  function fracLabel(n16) {
    if (GLYPH[n16]) return GLYPH[n16];
    var g = gcd(n16, 16);
    return (n16 / g) + "/" + (16 / g);
  }

  // tokens: {t:"dig",v} {t:"frac",v:n16} {t:"ft"} {t:"op",v} {t:"val",q}
  function toParts(toks) {
    var out = [], cur = null;
    for (var i = 0; i < toks.length; i++) {
      var k = toks[i];
      if (k.t === "op") {
        if (cur) out.push({ kind: "term", term: cur });
        cur = null;
        out.push({ kind: "op", v: k.v });
        continue;
      }
      if (!cur) cur = { feet: "", inch: "", frac: 0, hasFt: false, val: null };
      if (k.t === "val") cur.val = k.q;
      else if (k.t === "dig") cur.inch += k.v;
      else if (k.t === "frac") cur.frac = k.v;
      else { cur.feet = cur.inch || "0"; cur.inch = ""; cur.hasFt = true; }
    }
    if (cur) out.push({ kind: "term", term: cur });
    return out;
  }

  // exact rational from a typed number like "12.83", ".5", "5." or ""
  function decQ(str) {
    str = String(str || "");
    var i = str.indexOf(".");
    if (i < 0) return q(Number(str || "0"), 1);
    var whole = str.slice(0, i) || "0", dec = str.slice(i + 1);
    return q(Number(whole + dec), Math.pow(10, dec.length));
  }
  var MAX_DEC = 4; // digits after the point

  function termQ(t) {
    if (t.val) return t.val;
    var r = qAdd(decQ(t.inch), q(t.frac, 16));
    if (t.hasFt) r = qAdd(r, qMul(decQ(t.feet), q(12)));
    return r;
  }

  function lastTerm(toks) {
    var p = toParts(toks), last = p[p.length - 1];
    return last && last.kind === "term" ? last.term : null;
  }

  function press(toks, key, fresh) {
    var last = toks[toks.length - 1];
    var t = lastTerm(toks);
    if (key === ".") {
      if (fresh) return [{ t: "dig", v: "." }];
      if (t && (t.val || t.frac)) return toks;
      if (t && t.inch.indexOf(".") >= 0) return toks; // only one point per number
      return toks.concat({ t: "dig", v: "." });
    }
    if (/^\d$/.test(key)) {
      if (fresh) return [{ t: "dig", v: key }];
      if (t && (t.val || t.frac)) return toks;
      if (t && key === "0" && t.inch === "0") return toks;
      if (t && t.inch.indexOf(".") >= 0 && t.inch.length - t.inch.indexOf(".") > MAX_DEC) return toks;
      return toks.concat({ t: "dig", v: key });
    }
    if (key === "ft") {
      if (fresh || !t || t.val || t.hasFt || t.frac || !t.inch || t.inch === ".") return toks;
      return toks.concat({ t: "ft" });
    }
    if (key.charAt(0) === "f") {
      var n16 = Number(key.slice(1));
      if (fresh) return [{ t: "frac", v: n16 }];
      if (t && t.val) return toks;
      if (t && t.inch.indexOf(".") >= 0) return toks; // 12.5 then ½ makes no sense
      if (last && last.t === "frac") return toks.slice(0, -1).concat({ t: "frac", v: n16 });
      return toks.concat({ t: "frac", v: n16 });
    }
    if (!toks.length) return toks;
    if (last.t === "op") return toks.slice(0, -1).concat({ t: "op", v: key });
    return toks.concat({ t: "op", v: key });
  }

  function evaluate(toks) {
    var p = toParts(toks);
    while (p.length && p[p.length - 1].kind === "op") p.pop();
    if (!p.length) return null;
    var vals = [], ops = [], acc = null;
    for (var i = 0; i < p.length; i++) {
      var x = p[i];
      if (x.kind === "op") { ops.push(x.v); continue; }
      var v = termQ(x.term);
      if (acc === null) { acc = v; continue; }
      var op = ops.pop();
      if (op === "\u00d7") acc = qMul(acc, v);
      else if (op === "\u00f7") {
        var r = qDiv(acc, v);
        if (!r) return "div0";
        acc = r;
      } else { ops.push(op); vals.push(acc); acc = v; }
    }
    if (acc === null) return null;
    vals.push(acc);
    var res = vals[0];
    for (var j = 1; j < vals.length; j++) res = ops[j - 1] === "+" ? qAdd(res, vals[j]) : qSub(res, vals[j]);
    return res;
  }

  function fmtQ(r) {
    var exact = r.n / r.d;
    var neg = exact < 0;
    var n16 = Math.round(Math.abs(exact) * 16 + 1e-9);
    var sign = neg && n16 > 0 ? "\u2212" : "";
    var text = sign + fracStr(n16) + '"';
    var ftIn = "";
    if (n16 >= 192) {
      var ft = Math.floor(n16 / 192), rem = n16 - ft * 192;
      ftIn = sign + ft + "' " + fracStr(rem) + '"';
    }
    var isExact = (r.n * 16) % r.d === 0;
    var diff = (neg ? -n16 : n16) / 16 - exact;
    return {
      text: text,
      ftIn: ftIn,
      dec: exact.toFixed(3).replace("-", "\u2212") + '"',
      mm: (exact * 25.4).toFixed(1).replace("-", "\u2212") + " mm",
      isExact: isExact,
      diff: diff
    };
  }

  function showExpr(toks) {
    return toParts(toks).map(function (x) {
      if (x.kind === "op") return x.v;
      var t = x.term;
      if (t.val) return fmtQ(t.val).text;
      var s = "";
      var lead = function (v) { return v.charAt(0) === "." ? "0" + v : v; };
      if (t.hasFt) s += lead(t.feet) + "'";
      if (t.inch) s += (s ? " " : "") + lead(t.inch);
      if (t.frac) s += (s ? " " : "") + fracLabel(t.frac);
      if (t.hasFt && (t.inch || t.frac)) s += '"';
      return s;
    }).join(" ");
  }

  // ---------- Plate weight ----------
  var MATS = {
    mild: { label: "Mild steel (490 lb/ft\u00b3)", name: "steel", lb: 490, kg: 7850 },
    stainless: { label: "Stainless (500 lb/ft\u00b3)", name: "stainless", lb: 500, kg: 8000 },
    alum: { label: "Aluminum (169 lb/ft\u00b3)", name: "aluminum", lb: 169, kg: 2700 }
  };
  var FT3_TO_M3 = 0.028316846592;

  // length in feet from the entry boxes
  function lenToFt(unit, a, b) {
    a = String(a || ""); b = String(b || "");
    if (unit === "ft") {
      if (a.trim() === "" && b.trim() === "") return NaN;
      return parseNum(a) + parseInches(b) / 12;
    }
    if (a.trim() === "") return NaN;
    if (unit === "in") return parseInches(a) / 12;
    if (unit === "mm") return parseNum(a) / 304.8;
    return parseNum(a) / 0.3048;
  }

  function thkToFt(unit, s) {
    s = String(s || "");
    if (s.trim() === "") return NaN;
    return unit === "mm" ? parseNum(s) / 304.8 : parseInches(s) / 12;
  }

  // L, W, T in feet; qty count
  function plate(L, W, T, qty, mat) {
    var m = MATS[mat] || MATS.mild;
    var ok = [L, W, T, qty].every(function (v) { return isFinite(v) && v > 0; });
    if (!ok) return null;
    var area = L * W;
    var vol = area * T;
    var pieceLb = vol * m.lb, pieceKg = vol * FT3_TO_M3 * m.kg;
    return {
      area: area,
      lbPerFt2: T * m.lb,
      pieceLb: pieceLb,
      pieceKg: pieceKg,
      totLb: pieceLb * qty,
      totKg: pieceKg * qty,
      tons: pieceLb * qty / 2000,
      tonnes: pieceKg * qty / 1000
    };
  }

  function fmtNum(v, dec) {
    return v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  function fmtWt(v) { return fmtNum(v, v < 1000 ? 1 : 0); }

  // mm to 3 places, trailing zeros trimmed (keeps one): 304.8, 325.882, 1.588
  function fmtMm(v) {
    var t = (v + (v >= 0 ? 1e-9 : -1e-9)).toFixed(3).replace(/0+$/, ""); // 1.5875 -> 1.588
    if (t.charAt(t.length - 1) === ".") t += "0";
    return t;
  }


  // ---------- Pipe fitting ----------
  var D2R = Math.PI / 180;

  // A length typed on the Pipe tab, returned in inches.
  // unit "in": 12 3/8, 12.375, 12,375, 12-3/8, 10' 6 1/2, 10'6", 3'   unit "mm": 1250 or 12,5
  function parseLen(s, unit) {
    var t = String(s === undefined || s === null ? "" : s).trim();
    if (!t) return NaN;
    if (unit === "mm") { var v = parseNum(t); return isFinite(v) && v >= 0 ? v / 25.4 : NaN; }
    t = t.replace(/,/g, ".").replace(/[\u2033\u201d]/g, '"').replace(/[\u2032\u2019]/g, "'");
    var m = t.match(/^([^']*)'(.*)$/);
    if (m) {
      if (!m[1].trim()) return NaN;
      var ft = parseNum(m[1]);
      var inch = parseInches(m[2].replace(/^[\s-]+/, ""));
      return isFinite(ft) && isFinite(inch) ? ft * 12 + inch : NaN;
    }
    return parseInches(t);
  }

  // An angle in degrees: 22.5, 22 1/2, 22,5, 22.5°
  function parseAngle(s) {
    var t = String(s || "").trim().replace(/\u00b0/g, "").replace(/,/g, ".").trim();
    if (!t) return NaN;
    return parseInches(t);
  }

  function angleOk(a) { return isFinite(a) && a > 0 && a <= 90; }

  // travel = offset x cosecant, run (advance) = offset x cotangent
  function offsetMult(angle) {
    if (!angleOk(angle)) return null;
    var r = angle * D2R, s = Math.sin(r);
    var cot = angle === 90 ? 0 : Math.cos(r) / s;
    return { csc: 1 / s, cot: cot };
  }

  function simpleOffset(offset, angle) {
    var m = offsetMult(angle);
    if (!m || !isFinite(offset) || offset <= 0) return null;
    return { travel: offset * m.csc, run: offset * m.cot, csc: m.csc, cot: m.cot };
  }

  // true offset = sqrt(rise^2 + roll^2); travel and setback come from the true offset
  function rollingOffset(rise, roll, angle) {
    var m = offsetMult(angle);
    if (!m || !isFinite(rise) || !isFinite(roll) || rise < 0 || roll < 0 || rise + roll <= 0) return null;
    var tr = Math.sqrt(rise * rise + roll * roll);
    return { trueOff: tr, travel: tr * m.csc, setback: tr * m.cot, csc: m.csc, cot: m.cot };
  }

  // ASME B16.9 butt-weld elbows, center-to-end (take-out), inches.
  // od = pipe OD (ASME B36.10M). lr90 = 90 LR "A", sr90 = 90 SR "A", lr45 = 45 LR "B".
  // The standard prints inches to 2 places (0.62, 0.88, 1.12, 1.38, 1.88, 3.12); those are the
  // tape marks 5/8, 7/8, 1 1/8, 1 3/8, 1 7/8, 3 1/8, stored here exactly. mm = the standard's mm column.
  var ELBOWS = [
    { nps: "1/2",   dn: 15,  od: 0.840,  lr90: 1.5,   sr90: null, lr45: 0.625, mm: [38, null, 16] },
    { nps: "3/4",   dn: 20,  od: 1.050,  lr90: 1.5,   sr90: null, lr45: 0.75,  mm: [38, null, 19] },
    { nps: "1",     dn: 25,  od: 1.315,  lr90: 1.5,   sr90: 1,    lr45: 0.875, mm: [38, 25, 22] },
    { nps: "1 1/4", dn: 32,  od: 1.660,  lr90: 1.875, sr90: 1.25, lr45: 1,     mm: [48, 32, 25] },
    { nps: "1 1/2", dn: 40,  od: 1.900,  lr90: 2.25,  sr90: 1.5,  lr45: 1.125, mm: [57, 38, 29] },
    { nps: "2",     dn: 50,  od: 2.375,  lr90: 3,     sr90: 2,    lr45: 1.375, mm: [76, 51, 35] },
    { nps: "2 1/2", dn: 65,  od: 2.875,  lr90: 3.75,  sr90: 2.5,  lr45: 1.75,  mm: [95, 64, 44] },
    { nps: "3",     dn: 80,  od: 3.500,  lr90: 4.5,   sr90: 3,    lr45: 2,     mm: [114, 76, 51] },
    { nps: "3 1/2", dn: 90,  od: 4.000,  lr90: 5.25,  sr90: 3.5,  lr45: 2.25,  mm: [133, 89, 57] },
    { nps: "4",     dn: 100, od: 4.500,  lr90: 6,     sr90: 4,    lr45: 2.5,   mm: [152, 102, 64] },
    { nps: "5",     dn: 125, od: 5.563,  lr90: 7.5,   sr90: 5,    lr45: 3.125, mm: [190, 127, 79] },
    { nps: "6",     dn: 150, od: 6.625,  lr90: 9,     sr90: 6,    lr45: 3.75,  mm: [229, 152, 95] },
    { nps: "8",     dn: 200, od: 8.625,  lr90: 12,    sr90: 8,    lr45: 5,     mm: [305, 203, 127] },
    { nps: "10",    dn: 250, od: 10.750, lr90: 15,    sr90: 10,   lr45: 6.25,  mm: [381, 254, 159] },
    { nps: "12",    dn: 300, od: 12.750, lr90: 18,    sr90: 12,   lr45: 7.5,   mm: [457, 305, 190] },
    { nps: "14",    dn: 350, od: 14,     lr90: 21,    sr90: 14,   lr45: 8.75,  mm: [533, 356, 222] },
    { nps: "16",    dn: 400, od: 16,     lr90: 24,    sr90: 16,   lr45: 10,    mm: [610, 406, 254] },
    { nps: "18",    dn: 450, od: 18,     lr90: 27,    sr90: 18,   lr45: 11.25, mm: [686, 457, 286] },
    { nps: "20",    dn: 500, od: 20,     lr90: 30,    sr90: 20,   lr45: 12.5,  mm: [762, 508, 318] },
    { nps: "22",    dn: 550, od: 22,     lr90: 33,    sr90: 22,   lr45: 13.5,  mm: [838, 559, 343] },
    { nps: "24",    dn: 600, od: 24,     lr90: 36,    sr90: 24,   lr45: 15,    mm: [914, 610, 381] }
  ];
  function elbow(i) { return ELBOWS[i] || null; }
  // type: "lr90" | "sr90" | "lr45" -> inches, or null when the standard has no such fitting
  function takeout(i, type) {
    var e = elbow(i);
    if (!e || (type !== "lr90" && type !== "sr90" && type !== "lr45")) return null;
    return e[type];
  }

  // cut = center-to-center - take-out at each end - (gap x number of welds)
  function cutLength(cc, to1, to2, gap, welds) {
    var vals = [cc, to1, to2, gap, welds];
    if (!vals.every(function (v) { return isFinite(v) && v >= 0; })) return null;
    if (cc <= 0) return null;
    var cut = cc - to1 - to2 - gap * welds;
    return { cut: cut, fittings: to1 + to2, gaps: gap * welds, ok: cut > 0 };
  }

  // Segmented (lobster-back) elbow. pieces = welds + 1: two end pieces (half segments) and
  // pieces - 2 full middle segments. Each weld turns bend/welds, so each cut is bend/(2 x welds)
  // off square. Cut-back from the centerline mark, each side = OD/2 x tan(cut angle).
  function miter(od, pieces, bend, R) {
    var ok = [od, pieces, bend, R].every(function (v) { return isFinite(v) && v > 0; });
    if (!ok || pieces < 2 || Math.floor(pieces) !== pieces || bend > 180) return null;
    var welds = pieces - 1, cutAng = bend / (2 * welds);
    if (cutAng >= 90) return null;
    var t = Math.tan(cutAng * D2R), h = od / 2;
    return {
      welds: welds, cutAng: cutAng, tan: t, cutback: h * t, nMid: pieces - 2,
      mid: { center: 2 * R * t, long: 2 * (R + h) * t, short: 2 * (R - h) * t },
      end: { center: R * t, long: (R + h) * t, short: (R - h) * t },
      tight: R <= h // radius inside the pipe: short side would be zero or less
    };
  }

  // inches -> nearest 1/16 tape mark, feet & inches, decimal, mm
  function fmtIn(v) {
    var neg = v < 0, n16 = Math.round(Math.abs(v) * 16 + 1e-9);
    var sign = neg && n16 > 0 ? "\u2212" : "";
    var ftIn = "";
    if (n16 >= 192) { var ft = Math.floor(n16 / 192), rem = n16 - ft * 192; ftIn = sign + ft + "' " + fracStr(rem) + '"'; }
    return {
      text: sign + fracStr(n16) + '"', ftIn: ftIn,
      dec: v.toFixed(3).replace("-", "\u2212") + '"',
      mm: (v * 25.4).toFixed(1).replace("-", "\u2212") + " mm",
      n16: neg ? -n16 : n16
    };
  }
  function fmtDeg(a) { return String(Math.round(a * 100) / 100) + "\u00b0"; }

  var api = {
    decQ: decQ, fmtMm: fmtMm,
    gcd: gcd, fracStr: fracStr, mmToImp: mmToImp, parseNum: parseNum, parseInches: parseInches,
    diffNote: diffNote, fracLabel: fracLabel, press: press, evaluate: evaluate, fmtQ: fmtQ,
    showExpr: showExpr, MATS: MATS, lenToFt: lenToFt, thkToFt: thkToFt, plate: plate,
    fmtNum: fmtNum, fmtWt: fmtWt,
    parseLen: parseLen, parseAngle: parseAngle, offsetMult: offsetMult, simpleOffset: simpleOffset,
    rollingOffset: rollingOffset, ELBOWS: ELBOWS, takeout: takeout, cutLength: cutLength, miter: miter,
    fmtIn: fmtIn, fmtDeg: fmtDeg
  };
  root.SC = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : this);
