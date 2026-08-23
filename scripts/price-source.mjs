/**
 * Lifetime list prices from assets/js/config.js (site display source of truth).
 * Charge amounts still come from Cloud Functions env at payment time.
 */
import fs from "fs";
import path from "path";

export function readSitePrices(root) {
  const raw = fs.readFileSync(path.join(root, "assets/js/config.js"), "utf8");
  const grab = (key) => {
    const m = raw.match(new RegExp(`${key}:\\s*"([^"]+)"`));
    return m ? m[1] : "";
  };
  const krValue = grab("priceValueKr") || grab("priceValue") || "129000";
  const usdValue = grab("priceValueGlobal") || "89.00";
  return {
    krValue,
    krDisplay: grab("priceDisplayKr") || grab("priceDisplay") || "129,000원",
    usdValue,
    usdDisplay: grab("priceDisplayGlobal") || "$89 USD",
  };
}

export function pricesMatch(schemaPrice, expected) {
  const a = Number(String(schemaPrice).replace(/,/g, ""));
  const b = Number(String(expected).replace(/,/g, ""));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return a === b;
}
