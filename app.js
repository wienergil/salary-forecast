(function () {
  "use strict";
  var F = SalaryForecast;
  var STORAGE_KEY = "salary-forecast-v1";
  var INSTALL_DISMISS_KEY = "salary-forecast-install-dismissed";
  var grantSeq = 1;
  var payoutSelected = [3, 6, 9, 12];
  var bonusType = "fixed";
  var equityTaxMode = "flat";
  var statusEl = document.getElementById("status");
  var statusTimer = null;
  var selectedMonthKey = null;

  function $(id) { return document.getElementById(id); }

  function formatILS(value, digits) {
    if (value == null || !isFinite(value)) return "—";
    var d = digits == null ? 0 : digits;
    return new Intl.NumberFormat("he-IL", {
      style: "currency",
      currency: "ILS",
      minimumFractionDigits: d,
      maximumFractionDigits: d
    }).format(value);
  }

  function formatNum(value, digits) {
    if (value == null || !isFinite(value)) return "—";
    return new Intl.NumberFormat("he-IL", {
      minimumFractionDigits: digits || 0,
      maximumFractionDigits: digits == null ? 2 : digits
    }).format(value);
  }

  function setStatus(text) {
    statusEl.textContent = text || "";
    clearTimeout(statusTimer);
    if (text) {
      statusTimer = setTimeout(function () { statusEl.textContent = ""; }, 3500);
    }
  }

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
  }

  function showInstallBanner() {
    var banner = $("install-banner");
    if (!banner) return;
    var dismissed = false;
    try { dismissed = sessionStorage.getItem(INSTALL_DISMISS_KEY) === "1"; } catch (e) {}
    if (isStandalone() || dismissed) {
      banner.hidden = true;
      return;
    }
    banner.hidden = false;
  }

  function populateMonths() {
    var sel = $("raiseMonth");
    sel.innerHTML = F.HEBREW_MONTHS.map(function (name, i) {
      return '<option value="' + (i + 1) + '">' + name + "</option>";
    }).join("");
    var host = $("payout-months");
    host.innerHTML = F.HEBREW_MONTHS.map(function (name, i) {
      var m = i + 1;
      return '<button type="button" class="chip" data-month="' + m + '" aria-pressed="false">' + name + "</button>";
    }).join("");
  }

  function newGrant(partial) {
    grantSeq += 1;
    return Object.assign({
      id: "g" + grantSeq,
      shares: 0,
      start: "2026-01",
      vestingMonths: 48,
      cliffMonths: 12,
      offsetMonths: 0,
      grantDate: "",
      grantPriceUSD: 0
    }, partial || {});
  }

  function renderPayoutChips() {
    document.querySelectorAll("#payout-months .chip").forEach(function (btn) {
      var m = Number(btn.getAttribute("data-month"));
      btn.setAttribute("aria-pressed", payoutSelected.indexOf(m) !== -1 ? "true" : "false");
    });
  }

  function renderBonusType() {
    $("bonus-fixed").setAttribute("aria-pressed", bonusType === "fixed" ? "true" : "false");
    $("bonus-percent").setAttribute("aria-pressed", bonusType === "percent" ? "true" : "false");
    $("wrap-bonus-amount").hidden = bonusType !== "fixed";
    $("wrap-bonus-percent").hidden = bonusType !== "percent";
  }

  function renderGrants(grants) {
    var host = $("grants");
    if (!grants.length) {
      host.innerHTML = '<p class="help">אין מענקים עדיין. הוסיפו מענק כדי לכלול הבשלת מניות.</p>';
      return;
    }
    host.innerHTML = grants.map(function (g, i) {
      return (
        '<div class="grant" data-id="' + g.id + '">' +
          '<div class="grant-head"><span>מענק ' + (i + 1) + '</span>' +
          '<button type="button" class="btn btn-danger btn-remove-grant">הסר</button></div>' +
          '<div class="fields two">' +
            '<div class="field"><label>מספר מניות</label><input type="number" data-k="shares" min="0" step="1" inputmode="decimal" value="' + (g.shares || 0) + '"></div>' +
            '<div class="field"><label>תחילת הבשלה</label><input type="month" data-k="start" value="' + (g.start || "") + '"></div>' +
            '<div class="field"><label>תקופת הבשלה (חודשים)</label><input type="number" data-k="vestingMonths" min="1" step="1" inputmode="numeric" value="' + (g.vestingMonths || 48) + '"></div>' +
            '<div class="field"><label>קליף (חודשים)</label><input type="number" data-k="cliffMonths" min="0" step="1" inputmode="numeric" value="' + (g.cliffMonths || 0) + '"><span class="help">0 = בלי קליף, הבשלה רבעונית מתחילה אחרי 3 חודשים</span></div>' +
            '<div class="field span-2"><label>היסט חודש הבשלה</label><input type="number" data-k="offsetMonths" step="1" inputmode="numeric" value="' + (g.offsetMonths || 0) + '"><span class="help">הזזה של מועדי ההבשלה במספר חודשים ביחס לתאריך ההתחלה</span></div>' +
            '<div class="field s102-only"' + (equityTaxMode === "s102" ? "" : " hidden") + '><label>חודש ההקצאה (לסעיף 102)</label><input type="month" data-k="grantDate" value="' + (g.grantDate || "") + '"><span class="help">ריק = כמו תחילת ההבשלה. 24 החודשים נספרים ממנו.</span></div>' +
            '<div class="field s102-only"' + (equityTaxMode === "s102" ? "" : " hidden") + '><label>מחיר מניה בהקצאה (USD)</label><input type="number" data-k="grantPriceUSD" min="0" step="0.01" inputmode="decimal" value="' + (g.grantPriceUSD || 0) + '"><span class="help">ממוצע 30 ימי המסחר שלפני ההקצאה. מופיע באישור הנאמן או בפורטל.</span></div>' +
          '</div>' +
        '</div>'
      );
    }).join("");
  }

  function readGrantsFromDom() {
    return Array.prototype.map.call(document.querySelectorAll("#grants .grant"), function (el) {
      function val(k) {
        var input = el.querySelector('[data-k="' + k + '"]');
        return input ? input.value : "";
      }
      return {
        id: el.getAttribute("data-id"),
        shares: Number(val("shares") || 0),
        start: val("start"),
        vestingMonths: Number(val("vestingMonths") || 0),
        cliffMonths: Number(val("cliffMonths") || 0),
        offsetMonths: Number(val("offsetMonths") || 0),
        grantDate: val("grantDate"),
        grantPriceUSD: Number(val("grantPriceUSD") || 0)
      };
    });
  }

  function readInputs() {
    var equityTax = $("netEnabled").checked ? Number($("equityTaxPercent").value || 0) : Number($("equityTaxPercentGlobal").value || 0);
    return {
      start: $("start").value || "2026-12",
      baseSalary: Number($("baseSalary").value || 0),
      annualRaisePercent: Number($("annualRaisePercent").value || 0),
      raiseMonth: Number($("raiseMonth").value || 1),
      bonusType: bonusType,
      bonusAmount: Number($("bonusAmount").value || 0),
      bonusPercent: Number($("bonusPercent").value || 0),
      payoutMonths: payoutSelected.slice().sort(function (a, b) { return a - b; }),
      bonusAchievement: Number($("bonusAchievement").value || 0),
      grants: readGrantsFromDom(),
      sharePriceUSD: Number($("sharePriceUSD").value || 0),
      priceGrowthPercent: Number($("priceGrowthPercent").value || 0),
      fxRate: Number($("fxRate").value || 0),
      netEnabled: $("netEnabled").checked,
      salaryTaxPercent: Number($("salaryTaxPercent").value || 0),
      equityTaxPercent: equityTax,
      equityTaxMode: equityTaxMode,
      s102OrdinaryPercent: Number($("s102OrdinaryPercent").value || 0),
      s102CapitalPercent: Number($("s102CapitalPercent").value || 0),
      s102NiiPercent: Number($("s102NiiPercent").value || 0),
      s102EarlySale: $("s102EarlySale").value,
      surtaxEnabled: $("surtaxEnabled").checked,
      surtaxPercent: Number($("surtaxPercent").value || 0),
      surtaxCapitalExtraPercent: Number($("surtaxCapitalExtraPercent").value || 0),
      surtaxThreshold: Number($("surtaxThreshold").value || 0)
    };
  }

  function renderTaxMode() {
    var s102 = equityTaxMode === "s102";
    $("taxmode-flat").setAttribute("aria-pressed", s102 ? "false" : "true");
    $("taxmode-s102").setAttribute("aria-pressed", s102 ? "true" : "false");
    $("s102-fields").hidden = !s102;
    $("flat-mode-help").hidden = s102;
    $("wrap-flat-tax").hidden = s102;
    $("wrap-flat-tax-net").hidden = s102;
    $("surtax-fields").hidden = !$("surtaxEnabled").checked;
    document.querySelectorAll("#grants .s102-only").forEach(function (el) { el.hidden = !s102; });
  }

  function applyInputs(raw, skipStorage) {
    var inp = F.normalizeInputs(raw);
    bonusType = inp.bonusType;
    payoutSelected = inp.payoutMonths.slice();
    $("start").value = inp.start;
    $("baseSalary").value = inp.baseSalary;
    $("annualRaisePercent").value = inp.annualRaisePercent;
    $("raiseMonth").value = String(inp.raiseMonth);
    $("bonusAmount").value = inp.bonusAmount;
    $("bonusPercent").value = inp.bonusPercent;
    $("bonusAchievement").value = inp.bonusAchievement;
    $("sharePriceUSD").value = inp.sharePriceUSD;
    $("priceGrowthPercent").value = inp.priceGrowthPercent;
    $("fxRate").value = inp.fxRate;
    $("netEnabled").checked = inp.netEnabled;
    $("salaryTaxPercent").value = inp.salaryTaxPercent;
    $("equityTaxPercent").value = inp.equityTaxPercent;
    $("equityTaxPercentGlobal").value = inp.equityTaxPercent;
    $("net-fields").hidden = !inp.netEnabled;
    equityTaxMode = inp.equityTaxMode;
    $("s102OrdinaryPercent").value = inp.s102OrdinaryPercent;
    $("s102CapitalPercent").value = inp.s102CapitalPercent;
    $("s102NiiPercent").value = inp.s102NiiPercent;
    $("s102EarlySale").value = inp.s102EarlySale;
    $("surtaxEnabled").checked = inp.surtaxEnabled;
    $("surtaxPercent").value = inp.surtaxPercent;
    $("surtaxCapitalExtraPercent").value = inp.surtaxCapitalExtraPercent;
    $("surtaxThreshold").value = inp.surtaxThreshold;
    renderBonusType();
    renderPayoutChips();
    renderGrants(inp.grants);
    renderTaxMode();
    if (!skipStorage) persist();
    refresh();
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(readInputs()));
    } catch (e) {}
  }

  function loadStored() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function sampleInputs() {
    return {
      start: "2026-12",
      baseSalary: 30000,
      annualRaisePercent: 0,
      raiseMonth: 1,
      bonusType: "fixed",
      bonusAmount: 15000,
      bonusPercent: 0,
      payoutMonths: [3, 6, 9, 12],
      bonusAchievement: 100,
      grants: [{ id: "g-sample", shares: 4000, start: "2026-01", vestingMonths: 48, cliffMonths: 12, offsetMonths: 0, grantDate: "2026-01", grantPriceUSD: 18 }],
      sharePriceUSD: 20,
      priceGrowthPercent: 0,
      fxRate: 3.7,
      netEnabled: false,
      salaryTaxPercent: 0,
      equityTaxPercent: 0
    };
  }

  function niceCeil(n) {
    if (n <= 0) return 1;
    var exp = Math.pow(10, Math.floor(Math.log10(n)));
    var f = n / exp;
    var nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
    return nice * exp;
  }

  function escapeXml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function renderMetrics(result) {
    var netBlock = result.inputs.netEnabled
      ? ('<div class="s">הערכת נטו ממוצעת: ' + formatILS(result.averageNet) + "</div>")
      : '<div class="s">הערכת נטו כבויה</div>';
    var current = result.months.find(function (m) { return m.isCurrent; });
    var currentHtml = current
      ? formatILS(current.gross) + '<div class="s">' + current.label + (result.inputs.netEnabled ? " · נטו " + formatILS(current.net) : "") + "</div>"
      : '<span style="color:var(--faint);font-weight:600">לא בחלון התחזית</span><div class="s">החודש הנוכחי לפי שעון ישראל</div>';
    $("metrics").innerHTML =
      '<article class="metric emphasis"><div class="k">סה״כ 36 חודשים, ברוטו</div><div class="v">' + formatILS(result.totals.gross) + "</div>" +
        (result.inputs.netEnabled ? '<div class="s">הערכת נטו: ' + formatILS(result.totals.net) + "</div>" : '<div class="s">בסיס + בונוס + מניות</div>') +
      "</article>" +
      '<article class="metric"><div class="k">ממוצע חודשי ברוטו</div><div class="v">' + formatILS(result.averageGross) + "</div>" + netBlock + "</article>" +
      '<article class="metric"><div class="k">החודש הנוכחי</div><div class="v">' + currentHtml + "</article>" +
      '<article class="metric"><div class="k">מניות שיבשילו בחלון</div><div class="v">' + formatNum(result.totals.equityShares, 0) + '</div><div class="s">שווי ברוטו ' + formatILS(result.totals.equity) + (result.s102 ? " · מס לפי 102 " + formatILS(result.totals.equityTax) + " · נטו " + formatILS(result.totals.equityNet) : "") + "</div></article>";

    $("year-cards").innerHTML = result.years.map(function (y) {
      return '<div class="year-card"><h3>שנת ' + y.year + ' · ' + y.months + ' חודשים</h3>' +
        "<p><span>בסיס</span><b>" + formatILS(y.base) + "</b></p>" +
        "<p><span>בונוס</span><b>" + formatILS(y.bonus) + "</b></p>" +
        "<p><span>מניות</span><b>" + formatILS(y.equity) + "</b></p>" +
        (result.s102 ? "<p><span>מס על מניות (102)</span><b>" + formatILS(y.equityTax) + "</b></p><p><span>מניות נטו</span><b>" + formatILS(y.equityNet) + "</b></p>" : "") +
        "<p><span>סה״כ ברוטו</span><b>" + formatILS(y.gross) + "</b></p>" +
        (result.inputs.netEnabled ? "<p><span>הערכת נטו</span><b>" + formatILS(y.net) + "</b></p>" : "") +
        "</div>";
    }).join("");
  }

  var showEquityTax = false;
  function breakdown(row, showNet) {
    var eqTax = "";
    if (showEquityTax && row.equity) {
      eqTax = " · מס מניות " + formatILS(row.equityTax);
      if (row.equityTaxOrdinary != null) {
        eqTax += " (פירותי " + formatILS(row.equityTaxOrdinary) + ", הוני " + formatILS(row.equityTaxCapital) +
          (row.equitySurtax ? ", יסף " + formatILS(row.equitySurtax) : "") + ")";
      }
      eqTax += " · מניות נטו " + formatILS(row.equityNet);
      if (row.equityHeldShares) eqTax += " · כולל מניות שהוחזקו עד 24 חודשים";
      if (row.equityEarlyShares) eqTax += " · נמכר לפני 24 חודשים: הכול פירותי";
    }
    return "בסיס " + formatILS(row.base) +
      " · בונוס " + formatILS(row.bonus) +
      " · מניות " + formatILS(row.equity) +
      (row.equityShares ? " (" + formatNum(row.equityShares, 2) + ")" : "") +
      eqTax +
      (showNet && row.net != null ? " · נטו " + formatILS(row.net) : "");
  }

  function renderMonthList(result) {
    var showNet = result.inputs.netEnabled;
    var html = "";
    var lastYear = null;
    result.months.forEach(function (row, idx) {
      if (row.year !== lastYear) {
        html += '<div class="month-year">שנת ' + row.year + "</div>";
        lastYear = row.year;
      }
      var cls = "month-row" + (row.isCurrent ? " current" : "");
      html += '<div class="' + cls + '">' +
        '<div class="label-m">' + row.label + (row.isCurrent ? " · החודש" : "") + "</div>" +
        '<div class="total">' + formatILS(row.gross) + "</div>" +
        '<div class="break">' + breakdown(row, showNet) + "</div>" +
        "</div>";
      var next = result.months[idx + 1];
      if (!next || next.year !== row.year) {
        var y = result.years.find(function (item) { return item.year === row.year; });
        if (y) {
          html += '<div class="month-row year-total">' +
            '<div class="label-m">סה״כ ' + y.year + "</div>" +
            '<div class="total">' + formatILS(y.gross) + "</div>" +
            '<div class="break">' + breakdown(y, showNet) + "</div>" +
            "</div>";
        }
      }
    });
    html += '<div class="month-row grand">' +
      '<div class="label-m">סה״כ 36 חודשים</div>' +
      '<div class="total">' + formatILS(result.totals.gross) + "</div>" +
      '<div class="break">' + breakdown(result.totals, showNet) + "</div>" +
      "</div>";
    $("month-list").innerHTML = html;
  }

  function setChartDetail(row, showNet) {
    var el = $("chart-detail");
    if (!row) {
      el.textContent = "געו בעמודה לפירוט החודש.";
      return;
    }
    selectedMonthKey = row.key;
    el.innerHTML = "<strong>" + row.label + (row.isCurrent ? " · החודש" : "") +
      " · " + formatILS(row.gross) + "</strong>" + breakdown(row, showNet);
  }

  function renderChart(result) {
    var width = 360, height = 220;
    var m = { top: 12, right: 8, bottom: 40, left: 52 };
    var innerW = width - m.left - m.right;
    var innerH = height - m.top - m.bottom;
    var maxVal = niceCeil(Math.max.apply(null, result.months.map(function (row) { return row.gross; }).concat([1])));
    var barSlot = innerW / result.months.length;
    var barW = Math.max(2.4, barSlot - 1.2);
    var ticks = 4;
    var svg = [];
    svg.push('<svg id="chart" viewBox="0 0 ' + width + " " + height + '" role="img" aria-label="תרשים הכנסה חודשית מוערם">');
    svg.push('<rect x="0" y="0" width="' + width + '" height="' + height + '" fill="#ffffff"/>');

    for (var t = 0; t <= ticks; t++) {
      var val = maxVal * (t / ticks);
      var y = m.top + innerH - (val / maxVal) * innerH;
      svg.push('<line x1="' + m.left + '" x2="' + (width - m.right) + '" y1="' + y + '" y2="' + y + '" stroke="#e6edf4" stroke-width="1"/>');
      svg.push('<text x="' + (m.left - 4) + '" y="' + (y + 3) + '" text-anchor="end" font-size="8" fill="#5a6b7c" font-family="-apple-system, Arial, sans-serif">' + escapeXml(formatILS(val)) + "</text>");
    }

    result.months.forEach(function (row, i) {
      var x = m.left + i * barSlot + (barSlot - barW) / 2;
      var yCursor = m.top + innerH;
      function stack(value, color) {
        if (value <= 0) return;
        var h = (value / maxVal) * innerH;
        yCursor -= h;
        svg.push('<rect x="' + x.toFixed(2) + '" y="' + yCursor.toFixed(2) + '" width="' + barW.toFixed(2) + '" height="' + Math.max(h, 0).toFixed(2) + '" fill="' + color + '" rx="0.6"/>');
      }
      stack(row.base, "#1d4ed8");
      stack(row.bonus, "#0f766e");
      stack(row.equity, "#c2410c");
      if (row.isCurrent) {
        svg.push('<rect x="' + (x - 0.8).toFixed(2) + '" y="' + (m.top - 3) + '" width="' + (barW + 1.6).toFixed(2) + '" height="' + (innerH + 6) + '" fill="none" stroke="#d97706" stroke-width="1.4" rx="1"/>');
      }
      svg.push('<rect class="hit" data-i="' + i + '" x="' + (m.left + i * barSlot).toFixed(2) + '" y="' + m.top + '" width="' + barSlot.toFixed(2) + '" height="' + innerH + '" fill="transparent"/>');
      if (i % 3 === 0 || row.month === 1) {
        svg.push('<text x="' + (x + barW / 2).toFixed(2) + '" y="' + (height - 22) + '" text-anchor="middle" font-size="7" fill="#5a6b7c" font-family="-apple-system, Arial, sans-serif">' + escapeXml(F.HEBREW_MONTHS[row.month - 1].slice(0, 3)) + "</text>");
        svg.push('<text x="' + (x + barW / 2).toFixed(2) + '" y="' + (height - 11) + '" text-anchor="middle" font-size="7" fill="#8a97a6" font-family="-apple-system, Arial, sans-serif">' + String(row.year).slice(2) + "</text>");
      }
    });
    svg.push("</svg>");
    $("chart-host").innerHTML = svg.join("");

    var current = result.months.find(function (row) { return row.key === selectedMonthKey; }) ||
      result.months.find(function (row) { return row.isCurrent; });
    setChartDetail(current, result.inputs.netEnabled);

    var host = $("chart-host");
    function pick(ev) {
      var target = ev.target;
      if (ev.changedTouches && ev.changedTouches[0]) {
        target = document.elementFromPoint(ev.changedTouches[0].clientX, ev.changedTouches[0].clientY) || target;
      } else if (ev.touches && ev.touches[0]) {
        target = document.elementFromPoint(ev.touches[0].clientX, ev.touches[0].clientY) || target;
      }
      var hit = target && target.closest && target.closest(".hit");
      if (!hit) return;
      var row = result.months[Number(hit.getAttribute("data-i"))];
      if (row) setChartDetail(row, result.inputs.netEnabled);
    }
    host.onclick = pick;
    host.ontouchstart = pick;
  }

  function refresh() {
    var result = F.forecast(readInputs());
    showEquityTax = result.s102;
    renderMetrics(result);
    renderChart(result);
    renderMonthList(result);
  }

  function onFormChange() {
    $("net-fields").hidden = !$("netEnabled").checked;
    $("surtax-fields").hidden = !$("surtaxEnabled").checked;
    if ($("netEnabled").checked) {
      if (document.activeElement === $("equityTaxPercentGlobal")) {
        $("equityTaxPercent").value = $("equityTaxPercentGlobal").value;
      } else if (document.activeElement === $("equityTaxPercent")) {
        $("equityTaxPercentGlobal").value = $("equityTaxPercent").value;
      }
    }
    persist();
    refresh();
  }

  function downloadJson(text, filename) {
    var blob = new Blob([text], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function exportJson() {
    var text = JSON.stringify(readInputs(), null, 2);
    var filename = "salary-forecast.json";
    var blob = new Blob([text], { type: "application/json" });
    var file = new File([blob], filename, { type: "application/json" });

    function fallback() {
      downloadJson(text, filename);
      setStatus("קובץ הייצוא ירד. אפשר לשמור אותו בקבצים או לשתף.");
    }

    if (navigator.canShare) {
      var payload = { files: [file], title: "תחזית שכר", text: "גיבוי נתוני תחזית שכר" };
      if (navigator.canShare(payload)) {
        navigator.share(payload).then(function () {
          setStatus("הקובץ נשלח לשיתוף.");
        }).catch(function (err) {
          if (err && err.name === "AbortError") return;
          fallback();
        });
        return;
      }
    }
    if (navigator.share) {
      navigator.share({ title: "תחזית שכר", text: text }).then(function () {
        setStatus("הנתונים נשלחו לשיתוף.");
      }).catch(function (err) {
        if (err && err.name === "AbortError") return;
        fallback();
      });
      return;
    }
    fallback();
  }

  function bind() {
    populateMonths();
    $("payout-months").addEventListener("click", function (ev) {
      var btn = ev.target.closest(".chip");
      if (!btn) return;
      var m = Number(btn.getAttribute("data-month"));
      var idx = payoutSelected.indexOf(m);
      if (idx === -1) payoutSelected.push(m);
      else {
        if (payoutSelected.length === 1) return;
        payoutSelected.splice(idx, 1);
      }
      renderPayoutChips();
      onFormChange();
    });
    $("bonus-fixed").addEventListener("click", function () { bonusType = "fixed"; renderBonusType(); onFormChange(); });
    $("bonus-percent").addEventListener("click", function () { bonusType = "percent"; renderBonusType(); onFormChange(); });
    $("taxmode-flat").addEventListener("click", function () { equityTaxMode = "flat"; renderTaxMode(); onFormChange(); });
    $("taxmode-s102").addEventListener("click", function () { equityTaxMode = "s102"; renderTaxMode(); onFormChange(); });
    $("btn-add-grant").addEventListener("click", function () {
      var grants = readGrantsFromDom();
      grants.push(newGrant());
      renderGrants(grants);
      renderTaxMode();
      onFormChange();
    });
    $("grants").addEventListener("click", function (ev) {
      var btn = ev.target.closest(".btn-remove-grant");
      if (!btn) return;
      var card = ev.target.closest(".grant");
      if (card) card.remove();
      if (!document.querySelector("#grants .grant")) renderGrants([]);
      onFormChange();
    });
    $("grants").addEventListener("input", onFormChange);
    ["start","baseSalary","annualRaisePercent","raiseMonth","bonusAmount","bonusPercent","bonusAchievement","sharePriceUSD","priceGrowthPercent","fxRate","netEnabled","salaryTaxPercent","equityTaxPercent","equityTaxPercentGlobal","s102OrdinaryPercent","s102CapitalPercent","s102NiiPercent","s102EarlySale","surtaxEnabled","surtaxPercent","surtaxCapitalExtraPercent","surtaxThreshold"].forEach(function (id) {
      $(id).addEventListener("input", onFormChange);
      $(id).addEventListener("change", onFormChange);
    });
    $("btn-export").addEventListener("click", exportJson);
    $("btn-import").addEventListener("click", function () { $("import-file").click(); });
    $("import-file").addEventListener("change", function () {
      var file = $("import-file").files && $("import-file").files[0];
      $("import-file").value = "";
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var data = JSON.parse(String(reader.result || ""));
          applyInputs(data);
          setStatus("הנתונים יובאו מהקובץ.");
        } catch (e) {
          setStatus("לא הצלחתי לקרוא את קובץ ה-JSON.");
        }
      };
      reader.readAsText(file);
    });
    $("btn-reset").addEventListener("click", function () {
      if (!confirm("לאפס את כל השדות ולמחוק את הנתונים השמורים במכשיר?")) return;
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      applyInputs(F.defaultInputs());
      setStatus("הטופס אופס.");
    });
    $("btn-example").addEventListener("click", function () {
      applyInputs(sampleInputs());
      setStatus("נטענה דוגמה: שכר 30,000 ₪, בונוס רבעוני 15,000 ₪, 4,000 מניות מקליף של שנה.");
    });
    $("btn-dismiss-install").addEventListener("click", function () {
      try { sessionStorage.setItem(INSTALL_DISMISS_KEY, "1"); } catch (e) {}
      $("install-banner").hidden = true;
    });
  }

  function registerWorker() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("./sw.js").catch(function () {});
  }


  var FX_AUTO_KEY = "salary-forecast-fx-auto";
  var fxLastFetch = 0;
  function fxAutoOn() { try { return localStorage.getItem(FX_AUTO_KEY) !== "0"; } catch (e) { return true; } }
  function setFxStatus(t) { var el = $("fxStatus"); if (el) el.textContent = t; }
  function fetchJson(url) {
    return fetch(url, { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); });
  }
  function updateFx(force) {
    if (!$("fxAuto").checked) return;
    if (!force && Date.now() - fxLastFetch < 30 * 60 * 1000) return;
    fxLastFetch = Date.now();
    setFxStatus("מעדכן שער…");
    fetchJson("https://open.er-api.com/v6/latest/USD").then(function (d) {
      var r = d && d.rates && d.rates.ILS; if (!r) throw new Error("no rate");
      return { rate: r, date: d.time_last_update_utc ? new Date(d.time_last_update_utc) : new Date() };
    }).catch(function () {
      return fetchJson("https://api.frankfurter.dev/v1/latest?base=USD&symbols=ILS").then(function (d) {
        var r = d && d.rates && d.rates.ILS; if (!r) throw new Error("no rate");
        return { rate: r, date: new Date(d.date) };
      });
    }).then(function (res) {
      if (!$("fxAuto").checked) return;
      $("fxRate").value = Math.round(res.rate * 10000) / 10000;
      onFormChange();
      setFxStatus("שער עדכני: " + $("fxRate").value + " (נכון ל-" + res.date.toLocaleDateString("he-IL") + ")");
    }).catch(function () {
      fxLastFetch = 0;
      setFxStatus("אין חיבור, משתמש בשער השמור האחרון.");
    });
  }
  function bindFx() {
    $("fxAuto").checked = fxAutoOn();
    $("fxAuto").addEventListener("change", function () {
      try { localStorage.setItem(FX_AUTO_KEY, $("fxAuto").checked ? "1" : "0"); } catch (e) {}
      if ($("fxAuto").checked) updateFx(true); else setFxStatus("השער מוזן ידנית.");
    });
    $("fxRate").addEventListener("input", function (ev) {
      if (ev.isTrusted && $("fxAuto").checked) {
        $("fxAuto").checked = false;
        try { localStorage.setItem(FX_AUTO_KEY, "0"); } catch (e) {}
        setFxStatus("השער מוזן ידנית. סמן עדכון אוטומטי כדי לחזור לשער החי.");
      }
    });
    document.addEventListener("visibilitychange", function () { if (!document.hidden) updateFx(false); });
    window.addEventListener("online", function () { updateFx(true); });
    setInterval(function () { updateFx(false); }, 60 * 60 * 1000);
  }

  bind();
  bindFx();
  showInstallBanner();
  registerWorker();
  var stored = loadStored();
  applyInputs(stored || F.defaultInputs(), true);
  if (stored) setStatus("נטענו נתונים שנשמרו במכשיר.");
  updateFx(true);
})();
