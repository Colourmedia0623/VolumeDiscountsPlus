/* Volume Discounts Plus: product page tier picker.
 * Picks the offer that applies to this product, renders the tier cards, and
 * keeps the product form's quantity in sync with the selected tier. The real
 * discount is applied at checkout by the app's Shopify Function; this only
 * displays it and sets the quantity.
 */
(function () {
  "use strict";

  if (window.__vdpLoaded) return;
  window.__vdpLoaded = true;

  function readJson(root, selector) {
    var el = root.querySelector(selector);
    if (!el) return null;
    try {
      return JSON.parse(el.textContent);
    } catch (e) {
      return null;
    }
  }

  function isLive(offer, now) {
    if (offer.startsAt && new Date(offer.startsAt) > now) return false;
    if (offer.endsAt && new Date(offer.endsAt) <= now) return false;
    return true;
  }

  function findOffer(offers, product) {
    var now = new Date();
    var collections = product.collections || [];
    for (var i = 0; i < offers.length; i++) {
      var o = offers[i];
      if (!isLive(o, now) || !o.tiers || !o.tiers.length) continue;
      if (o.scope === "all") return o;
      if (o.scope === "products" && o.productIds.indexOf(product.id) !== -1) return o;
      if (
        o.scope === "collections" &&
        o.collectionIds.some(function (id) {
          return collections.indexOf(id) !== -1;
        })
      ) {
        return o;
      }
    }
    return null;
  }

  // Shopify money formats: https://help.shopify.com/manual/payments/currency-formatting
  function formatMoney(cents, format) {
    cents = Math.round(cents);
    function withDelimiters(number, precision, thousands, decimal) {
      thousands = thousands === undefined ? "," : thousands;
      decimal = decimal === undefined ? "." : decimal;
      var parts = (number / 100).toFixed(precision).split(".");
      var dollars = parts[0].replace(/(\d)(?=(\d\d\d)+(?!\d))/g, "$1" + thousands);
      return dollars + (parts[1] ? decimal + parts[1] : "");
    }
    return (format || "${{amount}}").replace(/\{\{\s*(\w+)\s*\}\}/, function (_, key) {
      switch (key) {
        case "amount_no_decimals":
          return withDelimiters(cents, 0);
        case "amount_with_comma_separator":
          return withDelimiters(cents, 2, ".", ",");
        case "amount_no_decimals_with_comma_separator":
          return withDelimiters(cents, 0, ".", ",");
        case "amount_with_apostrophe_separator":
          return withDelimiters(cents, 2, "'", ".");
        case "amount_with_space_separator":
          return withDelimiters(cents, 2, " ", ",");
        default:
          return withDelimiters(cents, 2);
      }
    });
  }

  function currencySymbol(code) {
    try {
      var parts = new Intl.NumberFormat("en", { style: "currency", currency: code, currencyDisplay: "narrowSymbol" }).formatToParts(0);
      for (var i = 0; i < parts.length; i++) if (parts[i].type === "currency") return parts[i].value;
    } catch (e) {
      // Unknown code: fall back to the code itself.
    }
    return code;
  }

  /** Money format from the app's Settings, as a Shopify-style format string. Null = the store's own. */
  function appMoneyFormat(setting, code) {
    if (!setting || setting === "store" || !code) return null;
    var symbol = currencySymbol(code);
    switch (setting) {
      case "symbol":
        return symbol + "{{amount}}";
      case "symbol_code":
        return symbol + "{{amount}} " + code;
      case "code":
        return code + " {{amount}}";
      case "symbol_after":
        return "{{amount_with_comma_separator}} " + symbol;
      default:
        return null;
    }
  }

  function currencyRate() {
    var s = window.Shopify;
    var rate = s && s.currency && Number(s.currency.rate);
    return rate > 0 ? rate : 1;
  }

  /** Rounds a price in cents down to an ending like ".99" (same as the Function). */
  function applyPriceEnding(cents, ending) {
    if (!ending) return cents;
    var end = Math.round(Number(ending) * 100);
    var rounded = Math.floor((cents - end) / 100) * 100 + end;
    return rounded > 0 && rounded <= cents ? rounded : cents;
  }

  /** Unit price in cents after the tier (same maths as the Function). */
  function tierUnitPrice(unit, tier) {
    if (!tier || tier.type === "none") return unit;
    var amount = tier.value * 100 * currencyRate();
    var price = unit;
    if (tier.type === "percentage") price = unit * (1 - Math.min(tier.value, 100) / 100);
    else if (tier.type === "amountOff") price = unit - amount;
    else if (tier.type === "fixedPrice") price = Math.min(unit, amount);
    return applyPriceEnding(Math.round(Math.max(0, price)), tier.rounding);
  }

  /** Total in cents for `qty` items. Unrounded % tiers apply to the line total, like checkout. */
  function tierTotal(unit, tier, qty) {
    if (tier && tier.type === "percentage" && !tier.rounding) {
      return Math.round(unit * qty * (1 - Math.min(tier.value, 100) / 100));
    }
    return tierUnitPrice(unit, tier) * qty;
  }

  /** "18 - 35 mugs", "36+ mugs". `bands` is sorted by quantity. */
  function rangeTitle(bands, i, unitName) {
    var from = bands[i].minQty;
    var next = bands[i + 1] && bands[i + 1].minQty;
    var range = next === undefined ? from + "+" : next - 1 <= from ? String(from) : from + " - " + (next - 1);
    var unit = (unitName || "").trim();
    return unit ? range + " " + unit : range;
  }

  function discountTag(template, tier, unit, moneyFormat) {
    if (!tier || tier.type === "none") return "";
    var amount;
    if (tier.type === "percentage") amount = tier.value + "%";
    else if (tier.type === "amountOff") amount = formatMoney(tier.value * 100 * currencyRate(), moneyFormat);
    else {
      var pct = unit > 0 ? Math.round((1 - tierUnitPrice(unit, tier) / unit) * 100) : 0;
      if (pct <= 0) return "";
      amount = pct + "%";
    }
    return (template || "{discount} OFF").replace(/\{discount\}/g, amount);
  }

  var STYLE_VARS = {
    accentColor: "--vdp-accent",
    textColor: "--vdp-text",
    backgroundColor: "--vdp-bg",
    selectedBackgroundColor: "--vdp-bg-selected",
    badgeColor: "--vdp-badge",
    badgeTextColor: "--vdp-badge-text",
    tagColor: "--vdp-tag",
    tagTextColor: "--vdp-tag-text",
  };

  function applyStyle(root, style) {
    if (!style) return;
    Object.keys(STYLE_VARS).forEach(function (key) {
      if (style[key]) root.style.setProperty(STYLE_VARS[key], style[key]);
    });
    if (style.borderRadius != null) root.style.setProperty("--vdp-radius", style.borderRadius + "px");
    if (style.spacing != null) root.style.setProperty("--vdp-space", style.spacing + "px");
    root.classList.remove("vdp-tiers--stack", "vdp-tiers--grid");
    root.classList.add("vdp-tiers--" + (style.layout === "grid" ? "grid" : "stack"));
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function findProductForm(root) {
    var section = root.closest("[id^='shopify-section-']") || document;
    var forms = section.querySelectorAll("form[action*='/cart/add']");
    if (!forms.length) forms = document.querySelectorAll("form[action*='/cart/add']");
    // Skip hidden installment / quick-add forms if a visible one exists.
    for (var i = 0; i < forms.length; i++) {
      if (forms[i].querySelector("[name='id']") && forms[i].offsetParent !== null) return forms[i];
    }
    return forms[0] || null;
  }

  function quantityInputs(form) {
    if (!form) return [];
    var inputs = Array.prototype.slice.call(form.querySelectorAll("[name='quantity']"));
    if (form.id) {
      inputs = inputs.concat(
        Array.prototype.slice.call(document.querySelectorAll("[name='quantity'][form='" + form.id + "']")),
      );
    }
    if (!inputs.length) {
      var hidden = document.createElement("input");
      hidden.type = "hidden";
      hidden.name = "quantity";
      hidden.value = "1";
      form.appendChild(hidden);
      inputs = [hidden];
    }
    return inputs;
  }

  function init(root) {
    var data = readJson(root, "[data-vdp-offers]");
    var product = readJson(root, "[data-vdp-product]");
    if (!data || !product || !data.offers) return;

    var offer = findOffer(data.offers, product);
    if (!offer) return;

    var display = offer.display || {};
    applyStyle(root, offer.style || data.settings);
    var shopSettings = data.settings || {};
    var activeCurrency =
      (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) || root.getAttribute("data-currency");
    var moneyFormat =
      appMoneyFormat(shopSettings.currencyFormat, activeCurrency) ||
      root.getAttribute("data-money-format") ||
      "${{amount}}";
    var displayFormat = display.hideDecimals
      ? moneyFormat.replace(/\{\{\s*amount(_with_comma_separator)?\s*\}\}/, function (_, comma) {
          return comma ? "{{amount_no_decimals_with_comma_separator}}" : "{{amount_no_decimals}}";
        })
      : moneyFormat;
    var text = {
      each: display.eachPriceText != null ? display.eachPriceText : root.getAttribute("data-text-each") || "each",
      total: display.totalText != null ? display.totalText : "Total:",
    };

    var sorted = offer.tiers
      .map(function (t, i) {
        return { tier: t, index: i };
      })
      .sort(function (a, b) {
        return a.tier.minQty - b.tier.minQty;
      });

    // Bands in quantity order; null = full-price card below the first tier.
    var bands = sorted.slice();
    if (offer.showSingleTier && sorted[0].tier.minQty > 1) bands.unshift(null);
    var bandQty = bands.map(function (b) {
      return { minQty: b ? b.tier.minQty : 1 };
    });
    var rows = bands.map(function (b, i) {
      return {
        qty: bandQty[i].minQty,
        tier: b ? b.tier : null,
        index: b ? b.index : -1,
        title: (b && b.tier.title) || rangeTitle(bandQty, i, display.unitName),
        subtitle: (b && b.tier.subtitle) || "",
        badge: (b && b.tier.badge) || "",
      };
    });

    var form = findProductForm(root);
    var list = root.querySelector("[data-vdp-list]");
    var heading = root.querySelector("[data-vdp-heading]");
    heading.textContent = offer.heading || "";
    if (offer.headingLines === false) heading.classList.add("vdp-tiers__heading--plain");
    var totalEl = root.querySelector("[data-vdp-total]");
    var footer = root.querySelector("[data-vdp-footer]");
    if (footer) {
      footer.textContent = display.footerText || "";
      footer.hidden = !display.footerText;
    }

    var buttons = rows.map(function (row, i) {
      var btn = el("button", "vdp-tier" + (row.badge ? " vdp-tier--has-badge" : ""));
      btn.type = "button";
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-checked", "false");
      if (row.badge) btn.appendChild(el("span", "vdp-tier__badge", row.badge));
      btn.appendChild(el("span", "vdp-tier__radio"));
      var main = el("span", "vdp-tier__main");
      var title = el("span", "vdp-tier__title");
      title.appendChild(el("span", "vdp-tier__name", row.title));
      var tag = el("span", "vdp-tier__tag");
      title.appendChild(tag);
      main.appendChild(title);
      if (row.subtitle) main.appendChild(el("span", "vdp-tier__subtitle", row.subtitle));
      btn.appendChild(main);
      var prices = el("span", "vdp-tier__prices");
      var price = el("span", "vdp-tier__price");
      var suffix = el("span", "vdp-tier__each");
      var compare = el("span", "vdp-tier__compare");
      prices.appendChild(price);
      prices.appendChild(suffix);
      prices.appendChild(compare);
      btn.appendChild(prices);
      btn.addEventListener("click", function () {
        select(i, true);
      });
      btn.addEventListener("keydown", function (e) {
        var next = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
        if (!next) return;
        e.preventDefault();
        var j = (i + next + rows.length) % rows.length;
        select(j, true);
        buttons[j].el.focus();
      });
      list.appendChild(btn);
      return { el: btn, tag: tag, price: price, suffix: suffix, compare: compare };
    });

    var current = -1;

    function variantPrice() {
      var idInput = form && form.querySelector("[name='id']");
      var id = Number(idInput && idInput.value) || product.selectedVariant;
      for (var i = 0; i < product.variants.length; i++) {
        if (product.variants[i].id === id) return product.variants[i].price;
      }
      return product.variants.length ? product.variants[0].price : 0;
    }

    function renderTotal() {
      if (!totalEl) return;
      var show = display.showTotal && current >= 0;
      totalEl.hidden = !show;
      if (!show) return;
      var row = rows[current];
      totalEl.textContent = text.total + " " + formatMoney(tierTotal(variantPrice(), row.tier, row.qty), displayFormat);
    }

    function renderPrices() {
      var unit = variantPrice();
      var showEach = display.priceDisplay === "each";
      rows.forEach(function (row, i) {
        var b = buttons[i];
        var eachPrice = tierUnitPrice(unit, row.tier);
        var discounted = eachPrice < unit;
        b.price.textContent = formatMoney(showEach ? eachPrice : tierTotal(unit, row.tier, row.qty), displayFormat);
        b.suffix.textContent = showEach && text.each ? " " + text.each : "";
        b.suffix.hidden = !b.suffix.textContent;
        var showCompare = display.showCompareAt !== false && discounted;
        b.compare.textContent = showCompare ? formatMoney(showEach ? unit : unit * row.qty, displayFormat) : "";
        b.compare.hidden = !showCompare;
        b.tag.textContent =
          display.showDiscountTag !== false ? discountTag(display.discountTagText, row.tier, unit, moneyFormat) : "";
        b.tag.hidden = !b.tag.textContent;
      });
      renderTotal();
    }

    function select(i, updateQuantity) {
      current = i;
      buttons.forEach(function (b, j) {
        b.el.setAttribute("aria-checked", j === i ? "true" : "false");
        b.el.tabIndex = j === i ? 0 : -1;
      });
      renderTotal();
      if (!updateQuantity) return;
      quantityInputs(form).forEach(function (input) {
        input.value = String(rows[i].qty);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
      root.dispatchEvent(new CustomEvent("vdp:tier-selected", { bubbles: true, detail: { quantity: rows[i].qty } }));
    }

    // When the shopper types a quantity, highlight the tier it falls into.
    function syncFromQuantity(e) {
      if (!e.target || e.target.name !== "quantity") return;
      var qty = Number(e.target.value) || 1;
      var match = 0;
      rows.forEach(function (row, i) {
        if (qty >= row.qty) match = i;
      });
      if (match !== current) select(match, false);
    }
    document.addEventListener("change", syncFromQuantity);

    // Themes swap the variant id without firing events, so watch it.
    var lastVariant = null;
    function watchVariant() {
      var idInput = form && form.querySelector("[name='id']");
      var id = idInput && idInput.value;
      if (id !== lastVariant) {
        lastVariant = id;
        renderPrices();
      }
    }
    document.addEventListener("change", watchVariant);
    setInterval(watchVariant, 600);

    var initial = 0;
    rows.forEach(function (row, i) {
      if (row.tier && row.index === offer.preselectTier) initial = i;
    });
    renderPrices();
    root.hidden = false;
    select(initial, true);
  }

  function boot() {
    document.querySelectorAll("[data-vdp-root]").forEach(function (root) {
      if (root.__vdpInit) return;
      root.__vdpInit = true;
      init(root);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
  // Re-run when the block is added or moved in the theme editor.
  document.addEventListener("shopify:section:load", boot);
})();
