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
  // Section 102 capital-gains track: shares must stay with the trustee 24 months from grant.
  var S102_HOLD_MONTHS = 24;
  // Surtax threshold (סעיף 121ב), 2024-2027 frozen at 721,560 ILS per year.
  var SURTAX_THRESHOLD_DEFAULT = 721560;

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
          grantDate: "",
          grantPriceUSD: 0,
        },
      ],
      sharePriceUSD: 0,
      priceGrowthPercent: 0,
      fxRate: 3.7,
      netEnabled: false,
      salaryTaxPercent: 0,
      equityTaxPercent: 0,
      equityTaxMode: "flat",
      s102OrdinaryPercent: 47,
      s102CapitalPercent: 25,
      s102NiiPercent: 0,
      s102EarlySale: "hold",
      surtaxEnabled: false,
      surtaxPercent: 3,
      surtaxCapitalExtraPercent: 2,
      surtaxThreshold: SURTAX_THRESHOLD_DEFAULT,
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
            grantDate: g.grantDate || "",
            grantPriceUSD: Math.max(0, num(g.grantPriceUSD, 0)),
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
      equityTaxMode: src.equityTaxMode === "s102" ? "s102" : "flat",
      s102OrdinaryPercent: Math.max(0, num(src.s102OrdinaryPercent, d.s102OrdinaryPercent)),
      s102CapitalPercent: Math.max(0, num(src.s102CapitalPercent, d.s102CapitalPercent)),
      s102NiiPercent: Math.max(0, num(src.s102NiiPercent, 0)),
      s102EarlySale: src.s102EarlySale === "sell" ? "sell" : "hold",
      surtaxEnabled: !!src.surtaxEnabled,
      surtaxPercent: Math.max(0, num(src.surtaxPercent, d.surtaxPercent)),
      surtaxCapitalExtraPercent: Math.max(0, num(src.surtaxCapitalExtraPercent, d.surtaxCapitalExtraPercent)),
      surtaxThreshold: Math.max(0, num(src.surtaxThreshold, d.surtaxThreshold)),
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

  // Grant (allocation) date used for the 24-month trustee period. Defaults to vesting start.
  function grantDateOf(grant) {
    return parseYearMonth(grant.grantDate) || parseYearMonth(grant.start);
  }

  // When the shares of each vest event are sold (= when cash and tax happen).
  // flat mode: sold at vest. s102 mode: vests before the 24-month date are held until it
  // ("hold") or sold at vest and taxed fully as work income ("sell").
  function saleEvents(inputs) {
    var inp = normalizeInputs(inputs);
    var out = [];
    inp.grants.forEach(function (grant, gi) {
      var gd = grantDateOf(grant);
      var eligibleAt = gd ? addMonths(gd.year, gd.month, S102_HOLD_MONTHS) : null;
      vestEventsForGrant(grant).forEach(function (ev) {
        var sale = { year: ev.year, month: ev.month };
        var eligible = true;
        if (inp.equityTaxMode === "s102" && eligibleAt) {
          var early = monthsBetween(ev.year, ev.month, eligibleAt.year, eligibleAt.month) > 0;
          if (early && inp.s102EarlySale === "hold") sale = eligibleAt;
          else if (early) eligible = false;
        }
        out.push({
          grantId: grant.id || "g" + (gi + 1),
          grantPriceUSD: grant.grantPriceUSD,
          vestKey: ev.key,
          shares: ev.shares,
          year: sale.year,
          month: sale.month,
          key: formatYearMonth(sale.year, sale.month),
          held: sale.year !== ev.year || sale.month !== ev.month,
          eligible102: eligible,
        });
      });
    });
    return out;
  }

  // Section 102(b)(3) split for one sale, in USD.
  // eligible: work-income part = min(grant price, sale price) x shares; capital part = gain above grant price.
  // not eligible (sold before 24 months, 102(b)(4)): everything is work income.
  function split102(shares, salePriceUSD, grantPriceUSD, eligible) {
    var gross = shares * salePriceUSD;
    if (!eligible) return { ordinaryUSD: gross, capitalUSD: 0 };
    var ordinary = shares * Math.min(Math.max(0, grantPriceUSD), salePriceUSD);
    return { ordinaryUSD: ordinary, capitalUSD: gross - ordinary };
  }

  function equityForMonth(inputs, year, month) {
    var inp = normalizeInputs(inputs);
    var key = formatYearMonth(year, month);
    var usdPrice = sharePriceUSD(inp, year, month);
    var shares = 0, ordinaryUSD = 0, capitalUSD = 0, heldShares = 0, earlyShares = 0;
    saleEvents(inp).forEach(function (ev) {
      if (ev.key !== key) return;
      shares += ev.shares;
      if (ev.held) heldShares += ev.shares;
      if (!ev.eligible102) earlyShares += ev.shares;
      var sp = split102(ev.shares, usdPrice, ev.grantPriceUSD, ev.eligible102);
      ordinaryUSD += sp.ordinaryUSD;
      capitalUSD += sp.capitalUSD;
    });
    var usd = shares * usdPrice;
    return {
      shares: shares,
      heldShares: heldShares,
      earlyShares: earlyShares,
      usdPrice: usdPrice,
      usd: usd,
      ils: usd * inp.fxRate,
      ordinaryIls: ordinaryUSD * inp.fxRate,
      capitalIls: capitalUSD * inp.fxRate,
    };
  }

  // Surtax (121ב) on equity, per month, for one calendar year. Salary and bonus fill the
  // threshold first (their own surtax is assumed to be inside the salary tax rate);
  // the 2% extra applies only to capital income that by itself exceeds the threshold.
  function equitySurtaxForYear(inputs, year) {
    var inp = normalizeInputs(inputs);
    var res = {};
    var th = inp.surtaxThreshold;
    var totalCum = 0, capCum = 0;
    function over(x) { return Math.max(0, x - th); }
    for (var m = 1; m <= 12; m++) {
      totalCum += baseSalaryForMonth(inp, year, m) + bonusForMonth(inp, year, m);
      var eq = equityForMonth(inp, year, m);
      var before = totalCum;
      totalCum += eq.ordinaryIls + eq.capitalIls;
      var capBefore = capCum;
      capCum += eq.capitalIls;
      res[m] = (inp.surtaxPercent / 100) * (over(totalCum) - over(before)) +
        (inp.surtaxCapitalExtraPercent / 100) * (over(capCum) - over(capBefore));
    }
    return res;
  }

  function equityTaxForMonth(inputs, year, month, equity, surtaxCache) {
    var inp = normalizeInputs(inputs);
    var eq = equity || equityForMonth(inp, year, month);
    if (inp.equityTaxMode !== "s102") {
      var flat = eq.ils * (inp.equityTaxPercent / 100);
      return { ordinary: 0, capital: 0, surtax: 0, flat: flat, total: flat };
    }
    var ordinary = eq.ordinaryIls * ((inp.s102OrdinaryPercent + inp.s102NiiPercent) / 100);
    var capital = eq.capitalIls * (inp.s102CapitalPercent / 100);
    var surtax = 0;
    if (inp.surtaxEnabled) {
      var cache = surtaxCache || {};
      if (!cache[year]) cache[year] = equitySurtaxForYear(inp, year);
      surtax = cache[year][month] || 0;
    }
    return { ordinary: ordinary, capital: capital, surtax: surtax, flat: 0, total: ordinary + capital + surtax };
  }

  function netForMonth(base, bonus, equityIls, inputs, equityTax) {
    var inp = normalizeInputs(inputs);
    if (!inp.netEnabled) return null;
    var salaryNet = (base + bonus) * (1 - inp.salaryTaxPercent / 100);
    var tax = equityTax != null ? equityTax : equityIls * (inp.equityTaxPercent / 100);
    return salaryNet + (equityIls - tax);
  }

  function forecast(inputs, now) {
    var inp = normalizeInputs(inputs);
    var start = parseYearMonth(inp.start) || { year: 2026, month: 12 };
    var today = currentYearMonth(now);
    var months = [];
    var yearMap = {};
    var surtaxCache = {};
    var s102 = inp.equityTaxMode === "s102";

    for (var i = 0; i < FORECAST_MONTHS; i++) {
      var d = addMonths(start.year, start.month, i);
      var base = baseSalaryForMonth(inp, d.year, d.month);
      var bonus = bonusForMonth(inp, d.year, d.month);
      var equity = equityForMonth(inp, d.year, d.month);
      var gross = base + bonus + equity.ils;
      var tax = equityTaxForMonth(inp, d.year, d.month, equity, surtaxCache);
      var net = netForMonth(base, bonus, equity.ils, inp, tax.total);
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
        equityHeldShares: equity.heldShares,
        equityEarlyShares: equity.earlyShares,
        equityOrdinary: equity.ordinaryIls,
        equityCapital: equity.capitalIls,
        equityTaxOrdinary: tax.ordinary,
        equityTaxCapital: tax.capital,
        equitySurtax: tax.surtax,
        equityTax: tax.total,
        equityNet: equity.ils - tax.total,
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
          equityTax: 0,
          equityNet: 0,
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
      y.equityTax += tax.total;
      y.equityNet += equity.ils - tax.total;
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
        acc.equityTax += y.equityTax;
        acc.equityNet += y.equityNet;
        acc.gross += y.gross;
        if (inp.netEnabled) acc.net += y.net;
        return acc;
      },
      {
        base: 0,
        bonus: 0,
        equity: 0,
        equityShares: 0,
        equityTax: 0,
        equityNet: 0,
        gross: 0,
        net: inp.netEnabled ? 0 : null,
        months: FORECAST_MONTHS,
      }
    );

    return {
      inputs: inp,
      s102: s102,
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
    S102_HOLD_MONTHS: S102_HOLD_MONTHS,
    SURTAX_THRESHOLD_DEFAULT: SURTAX_THRESHOLD_DEFAULT,
    grantDateOf: grantDateOf,
    saleEvents: saleEvents,
    split102: split102,
    equityForMonth: equityForMonth,
    equitySurtaxForYear: equitySurtaxForYear,
    equityTaxForMonth: equityTaxForMonth,
    netForMonth: netForMonth,
    forecast: forecast,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = SalaryForecast;
}
// === CALC_ENGINE_END ===
