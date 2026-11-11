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

  function currencyRate() {
    var s = window.Shopify;
    var rate = s && s.currency && Number(s.currency.rate);
    return rate > 0 ? rate : 1;
  }

  /** Unit price in cents after the tier (same maths as the Function). */
  function tierUnitPrice(unit, tier) {
    if (!tier) return unit;
    var amount = tier.value * 100 * currencyRate();
    if (tier.type === "percentage") return Math.max(0, unit * (1 - Math.min(tier.value, 100) / 100));
    if (tier.type === "amountOff") return Math.max(0, unit - amount);
    if (tier.type === "fixedPrice") return Math.min(unit, amount);
    return unit;
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

    var settings = data.settings || {};
    var moneyFormat = root.getAttribute("data-money-format");
    var text = {
      each: root.getAttribute("data-text-each") || "each",
      save: root.getAttribute("data-text-save") || "Save {{amount}}",
      standard: root.getAttribute("data-text-standard") || "Standard price",
      buyOne: root.getAttribute("data-text-buy-one") || "Buy 1",
    };

    var sorted = offer.tiers
      .map(function (t, i) {
        return { tier: t, index: i };
      })
      .sort(function (a, b) {
        return a.tier.minQty - b.tier.minQty;
      });

    var rows = [];
    if (offer.showSingleTier && sorted[0].tier.minQty > 1) {
      rows.push({ qty: 1, tier: null, title: text.buyOne, subtitle: text.standard, badge: "" });
    }
    sorted.forEach(function (s) {
      rows.push({
        qty: s.tier.minQty,
        tier: s.tier,
        index: s.index,
        title: s.tier.title || "Buy " + s.tier.minQty,
        subtitle: s.tier.subtitle || "",
        badge: s.tier.badge || "",
      });
    });

    var form = findProductForm(root);
    var list = root.querySelector("[data-vdp-list]");
    var heading = root.querySelector("[data-vdp-heading]");
    heading.textContent = offer.heading || "";

    var buttons = rows.map(function (row, i) {
      var btn = el("button", "vdp-tier" + (row.badge ? " vdp-tier--has-badge" : ""));
      btn.type = "button";
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-checked", "false");
      if (row.badge) btn.appendChild(el("span", "vdp-tier__badge", row.badge));
      btn.appendChild(el("span", "vdp-tier__radio"));
      var main = el("span", "vdp-tier__main");
      var title = el("span", "vdp-tier__title", row.title);
      var save = el("span", "vdp-tier__save");
      title.appendChild(save);
      main.appendChild(title);
      if (row.subtitle) main.appendChild(el("span", "vdp-tier__subtitle", row.subtitle));
      btn.appendChild(main);
      var prices = el("span", "vdp-tier__prices");
      var total = el("span", "vdp-tier__total");
      var compare = el("span", "vdp-tier__compare");
      var each = el("span", "vdp-tier__each");
      prices.appendChild(total);
      prices.appendChild(compare);
      prices.appendChild(each);
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
      return { el: btn, save: save, total: total, compare: compare, each: each };
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

    function renderPrices() {
      var unit = variantPrice();
      rows.forEach(function (row, i) {
        var b = buttons[i];
        var eachPrice = tierUnitPrice(unit, row.tier);
        var full = unit * row.qty;
        var totalPrice = eachPrice * row.qty;
        var saving = full - totalPrice;
        b.total.textContent = formatMoney(totalPrice, moneyFormat);
        b.compare.textContent = saving >= 1 ? formatMoney(full, moneyFormat) : "";
        b.compare.hidden = saving < 1;
        b.each.textContent =
          settings.showPerItemPrice !== false && row.qty > 1 ? formatMoney(eachPrice, moneyFormat) + " " + text.each : "";
        b.each.hidden = !b.each.textContent;
        b.save.textContent =
          settings.showSavings !== false && saving >= 1 ? text.save.replace("{{amount}}", formatMoney(saving, moneyFormat)) : "";
        b.save.hidden = !b.save.textContent;
      });
    }

    function select(i, updateQuantity) {
      current = i;
      buttons.forEach(function (b, j) {
        b.el.setAttribute("aria-checked", j === i ? "true" : "false");
        b.el.tabIndex = j === i ? 0 : -1;
      });
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
