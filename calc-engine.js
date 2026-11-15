// === CALC_ENGINE_START ===
var SalaryForecast = (function () {
  "use strict";

  var HEBREW_MONTHS = [
    "ינואר",
    "פברואר",
    "מרץ",
    "אפריל",
    "מאי",
    "יוני",
    "יולי",
    "אוגוסט",
    "ספטמבר",
    "אוקטובר",
    "נובמבר",
    "דצמבר",
  ];

  var FORECAST_MONTHS = 36;

  function num(value, fallback) {
    var n = Number(value);
    return Number.isFinite(n) ? n : fallback || 0;
  }

  function parseYearMonth(value) {
    if (value == null || value === "") return null;
    if (typeof value === "object" && value.year != null && value.month != null) {
      var y = num(value.year);
      var m = num(value.month);
      if (y > 0 && m >= 1 && m <= 12) return { year: y, month: m };
      return null;
    }
    var s = String(value);
    var match = s.match(/^(\d{4})-(\d{1,2})/);
    if (!match) return null;
    var year = Number(match[1]);
    var month = Number(match[2]);
    if (year > 0 && month >= 1 && month <= 12) return { year: year, month: month };
    return null;
  }

  function formatYearMonth(year, month) {
    return year + "-" + String(month).padStart(2, "0");
  }

  function addMonths(year, month, delta) {
    var idx = year * 12 + (month - 1) + delta;
    var y = Math.floor(idx / 12);
    var mo = idx - y * 12 + 1;
    return { year: y, month: mo };
  }

  function monthsBetween(aYear, aMonth, bYear, bMonth) {
    return (bYear - aYear) * 12 + (bMonth - aMonth);
  }

  function monthLabel(year, month) {
    return HEBREW_MONTHS[month - 1] + " " + year;
  }

  function currentYearMonth(now) {
    var d = now ? new Date(now) : new Date();
    try {
      var parts = new Intl.DateTimeFormat("en-IL", {
        timeZone: "Asia/Jerusalem",
        year: "numeric",
        month: "numeric",
      }).formatToParts(d);
      var map = {};
      parts.forEach(function (p) {
        map[p.type] = p.value;
      });
      return { year: Number(map.year), month: Number(map.month) };
    } catch (e) {
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    }
  }

  function defaultInputs() {
    return {
      start: "2026-12",
      baseSalary: 0,
      annualRaisePercent: 0,
      raiseMonth: 1,
      bonusType: "fixed",
      bonusAmount: 0,
      bonusPercent: 0,
      payoutMonths: [3, 6, 9, 12],
      bonusAchievement: 100,
      grants: [
        {
          id: "g1",
          shares: 0,
          start: "2026-01",
          vestingMonths: 48,
          cliffMonths: 12,
          offsetMonths: 0,
        },
      ],
      sharePriceUSD: 0,
      priceGrowthPercent: 0,
      fxRate: 3.7,
      netEnabled: false,
      salaryTaxPercent: 0,
      equityTaxPercent: 0,
    };
  }

  function normalizeInputs(raw) {
    var d = defaultInputs();
    var src = raw && typeof raw === "object" ? raw : {};
    var payout = Array.isArray(src.payoutMonths) ? src.payoutMonths.map(Number).filter(function (m) {
      return m >= 1 && m <= 12;
    }) : d.payoutMonths.slice();
    if (!payout.length) payout = d.payoutMonths.slice();
    var grants = Array.isArray(src.grants) && src.grants.length
      ? src.grants.map(function (g, i) {
          return {
            id: g.id || "g" + (i + 1),
            shares: num(g.shares, 0),
            start: g.start || "",
            vestingMonths: num(g.vestingMonths, 48),
            cliffMonths: num(g.cliffMonths, 12),
            offsetMonths: num(g.offsetMonths, 0),
          };
        })
      : defaultInputs().grants;
    return {
      start: src.start || d.start,
      baseSalary: Math.max(0, num(src.baseSalary, 0)),
      annualRaisePercent: num(src.annualRaisePercent, 0),
      raiseMonth: Math.min(12, Math.max(1, Math.round(num(src.raiseMonth, 1)))),
      bonusType: src.bonusType === "percent" ? "percent" : "fixed",
      bonusAmount: Math.max(0, num(src.bonusAmount, 0)),
      bonusPercent: Math.max(0, num(src.bonusPercent, 0)),
      payoutMonths: payout,
      bonusAchievement: Math.max(0, num(src.bonusAchievement, 100)),
      grants: grants,
      sharePriceUSD: Math.max(0, num(src.sharePriceUSD, 0)),
      priceGrowthPercent: num(src.priceGrowthPercent, 0),
      fxRate: Math.max(0, num(src.fxRate, 3.7)),
      netEnabled: !!src.netEnabled,
      salaryTaxPercent: Math.max(0, num(src.salaryTaxPercent, 0)),
      equityTaxPercent: Math.max(0, num(src.equityTaxPercent, 0)),
    };
  }

  function numRaisesApplied(inputs, year, month) {
    var inp = normalizeInputs(inputs);
    if (!inp.annualRaisePercent) return 0;
    var start = parseYearMonth(inp.start);
    if (!start) return 0;
    var raiseMonth = inp.raiseMonth;
    var firstYear = start.year;
    if (raiseMonth <= start.month) firstYear += 1;
    if (year < firstYear || (year === firstYear && month < raiseMonth)) return 0;
    return year - firstYear + (month >= raiseMonth ? 1 : 0);
  }

  function baseSalaryForMonth(inputs, year, month) {
    var inp = normalizeInputs(inputs);
    var raises = numRaisesApplied(inp, year, month);
    return inp.baseSalary * Math.pow(1 + inp.annualRaisePercent / 100, raises);
  }

  function quarterlyBase(inputs, year, month) {
    var sum = 0;
    for (var i = 2; i >= 0; i--) {
      var d = addMonths(year, month, -i);
      sum += baseSalaryForMonth(inputs, d.year, d.month);
    }
    return sum;
  }

  function bonusForMonth(inputs, year, month) {
    var inp = normalizeInputs(inputs);
    if (inp.payoutMonths.indexOf(month) === -1) return 0;
    var achievement = inp.bonusAchievement / 100;
    if (inp.bonusType === "percent") {
      return quarterlyBase(inp, year, month) * (inp.bonusPercent / 100) * achievement;
    }
    return inp.bonusAmount * achievement;
  }

  function vestEventsForGrant(grant) {
    if (!grant) return [];
    var shares = num(grant.shares, 0);
    var period = Math.max(0, Math.round(num(grant.vestingMonths, 0)));
    var cliff = Math.max(0, Math.round(num(grant.cliffMonths, 0)));
    var offset = Math.round(num(grant.offsetMonths, 0));
    var start = parseYearMonth(grant.start);
    if (!start || shares <= 0 || period <= 0) return [];

    var interval = 3;
    var first = cliff === 0 ? interval : cliff;
    if (first > period) first = period;

    var offsets = [];
    for (var m = first; m <= period; m += interval) offsets.push(m);
    if (offsets[offsets.length - 1] !== period) offsets.push(period);

    var events = [];
    var vested = 0;
    for (var i = 0; i < offsets.length; i++) {
      var at = offsets[i];
      var amt;
      if (i === offsets.length - 1) {
        amt = shares - vested;
      } else if (i === 0 && cliff > 0) {
        amt = shares * (Math.min(cliff, period) / period);
      } else {
        var prev = i === 0 ? 0 : offsets[i - 1];
        amt = shares * ((at - prev) / period);
      }
      vested += amt;
      var date = addMonths(start.year, start.month, at + offset);
      events.push({
        year: date.year,
        month: date.month,
        shares: amt,
        monthsFromGrant: at,
        offsetApplied: offset,
        key: formatYearMonth(date.year, date.month),
      });
    }
    return events;
  }

  function allVestEvents(inputs) {
    var inp = normalizeInputs(inputs);
    var all = [];
    inp.grants.forEach(function (grant, gi) {
      vestEventsForGrant(grant).forEach(function (ev) {
        all.push(Object.assign({ grantId: grant.id || "g" + (gi + 1) }, ev));
      });
    });
    return all;
  }

  function sharePriceUSD(inputs, year, month) {
    var inp = normalizeInputs(inputs);
    var start = parseYearMonth(inp.start);
    if (!start) return inp.sharePriceUSD;
    var months = monthsBetween(start.year, start.month, year, month);
    return inp.sharePriceUSD * Math.pow(1 + inp.priceGrowthPercent / 100, months / 12);
  }

  function equityForMonth(inputs, year, month) {
    var inp = normalizeInputs(inputs);
    var key = formatYearMonth(year, month);
    var shares = 0;
    allVestEvents(inp).forEach(function (ev) {
      if (ev.key === key) shares += ev.shares;
    });
    var usdPrice = sharePriceUSD(inp, year, month);
    var usd = shares * usdPrice;
    return {
      shares: shares,
      usdPrice: usdPrice,
      usd: usd,
      ils: usd * inp.fxRate,
    };
  }

  function netForMonth(base, bonus, equityIls, inputs) {
    var inp = normalizeInputs(inputs);
    if (!inp.netEnabled) return null;
    var salaryNet = (base + bonus) * (1 - inp.salaryTaxPercent / 100);
    var equityNet = equityIls * (1 - inp.equityTaxPercent / 100);
    return salaryNet + equityNet;
  }

  function forecast(inputs, now) {
    var inp = normalizeInputs(inputs);
    var start = parseYearMonth(inp.start) || { year: 2026, month: 12 };
    var today = currentYearMonth(now);
    var months = [];
    var yearMap = {};

    for (var i = 0; i < FORECAST_MONTHS; i++) {
      var d = addMonths(start.year, start.month, i);
      var base = baseSalaryForMonth(inp, d.year, d.month);
      var bonus = bonusForMonth(inp, d.year, d.month);
      var equity = equityForMonth(inp, d.year, d.month);
      var gross = base + bonus + equity.ils;
      var net = netForMonth(base, bonus, equity.ils, inp);
      var row = {
        index: i,
        year: d.year,
        month: d.month,
        key: formatYearMonth(d.year, d.month),
        label: monthLabel(d.year, d.month),
        isCurrent: d.year === today.year && d.month === today.month,
        base: base,
        bonus: bonus,
        equityShares: equity.shares,
        equityUsdPrice: equity.usdPrice,
        equityUSD: equity.usd,
        equity: equity.ils,
        gross: gross,
        net: net,
      };
      months.push(row);

      if (!yearMap[d.year]) {
        yearMap[d.year] = {
          year: d.year,
          months: 0,
          base: 0,
          bonus: 0,
          equity: 0,
          equityShares: 0,
          gross: 0,
          net: inp.netEnabled ? 0 : null,
        };
      }
      var y = yearMap[d.year];
      y.months += 1;
      y.base += base;
      y.bonus += bonus;
      y.equity += equity.ils;
      y.equityShares += equity.shares;
      y.gross += gross;
      if (inp.netEnabled) y.net += net;
    }

    var years = Object.keys(yearMap)
      .map(Number)
      .sort(function (a, b) {
        return a - b;
      })
      .map(function (year) {
        return yearMap[year];
      });

    var totals = years.reduce(
      function (acc, y) {
        acc.base += y.base;
        acc.bonus += y.bonus;
        acc.equity += y.equity;
        acc.equityShares += y.equityShares;
        acc.gross += y.gross;
        if (inp.netEnabled) acc.net += y.net;
        return acc;
      },
      {
        base: 0,
        bonus: 0,
        equity: 0,
        equityShares: 0,
        gross: 0,
        net: inp.netEnabled ? 0 : null,
        months: FORECAST_MONTHS,
      }
    );

    return {
      inputs: inp,
      start: start,
      months: months,
      years: years,
      totals: totals,
      averageGross: totals.gross / FORECAST_MONTHS,
      averageNet: inp.netEnabled ? totals.net / FORECAST_MONTHS : null,
    };
  }

  return {
    HEBREW_MONTHS: HEBREW_MONTHS,
    FORECAST_MONTHS: FORECAST_MONTHS,
    num: num,
    parseYearMonth: parseYearMonth,
    formatYearMonth: formatYearMonth,
    addMonths: addMonths,
    monthsBetween: monthsBetween,
    monthLabel: monthLabel,
    currentYearMonth: currentYearMonth,
    defaultInputs: defaultInputs,
    normalizeInputs: normalizeInputs,
    numRaisesApplied: numRaisesApplied,
    baseSalaryForMonth: baseSalaryForMonth,
    quarterlyBase: quarterlyBase,
    bonusForMonth: bonusForMonth,
    vestEventsForGrant: vestEventsForGrant,
    allVestEvents: allVestEvents,
    sharePriceUSD: sharePriceUSD,
    equityForMonth: equityForMonth,
    netForMonth: netForMonth,
    forecast: forecast,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = SalaryForecast;
}
// === CALC_ENGINE_END ===
