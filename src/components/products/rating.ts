import { pickLocaleLanguage } from "@/src/lib/texts";
import { DEFAULT_LOCALE } from "../checkout/locale";
import type { PublicListProduct } from "./fetch";
import { fillProductListText, type ProductListTexts } from "./texts";

/** What a card shows for a product's reviews. */
export type FormattedProductRating = {
  /** Average with one decimal, in the locale's notation ("4,8", "4.8"). */
  average: string;
  /** Number of reviews in the locale's notation. */
  count: string;
  /** One accessible sentence: "Ocena 4,8 na 5, 12 opinii". */
  label: string;
};

/**
 * `true` for a rating a card can show: an average from 0 to 5 and at least one
 * review. The list is not validated with zod on fetch, so the card checks it.
 */
export function isShowableRating(
  rating: PublicListProduct["rating"],
): rating is NonNullable<PublicListProduct["rating"]> {
  return (
    rating != null &&
    typeof rating.average === "number" &&
    Number.isFinite(rating.average) &&
    rating.average >= 0 &&
    rating.average <= 5 &&
    Number.isInteger(rating.count) &&
    rating.count >= 1
  );
}

type RatingFormatters = {
  average: Intl.NumberFormat;
  count: Intl.NumberFormat;
};

/*
 * `Intl` instances are costly to build and a page renders one card per
 * product, so they are kept per locale (and per language for plural rules).
 * Locales on a page are few, so the caches stay small.
 */
const formattersByLocale = new Map<string, RatingFormatters>();
const pluralRulesByLanguage = new Map<string, Intl.PluralRules>();

function numberFormat(
  locale: string,
  options: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  try {
    return new Intl.NumberFormat(locale, options);
  } catch {
    // RangeError: invalid locale; the price falls back the same way.
    return new Intl.NumberFormat(DEFAULT_LOCALE, options);
  }
}

function ratingFormatters(locale: string): RatingFormatters {
  let formatters = formattersByLocale.get(locale);
  if (formatters == null) {
    formatters = {
      average: numberFormat(locale, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
      count: numberFormat(locale, { maximumFractionDigits: 0 }),
    };
    formattersByLocale.set(locale, formatters);
  }
  return formatters;
}

/** Plural category of the text table's language (`en` or `pl`). */
function reviewsText(count: number, locale: string, texts: ProductListTexts) {
  const language = pickLocaleLanguage(locale);
  let rules = pluralRulesByLanguage.get(language);
  if (rules == null) {
    rules = new Intl.PluralRules(language);
    pluralRulesByLanguage.set(language, rules);
  }
  switch (rules.select(count)) {
    case "one":
      return texts.reviewsOne;
    case "few":
      return texts.reviewsFew;
    case "many":
      return texts.reviewsMany;
    default:
      return texts.reviewsOther;
  }
}

/**
 * Formats a product's rating for its card, or returns `null` when the card
 * shows nothing (no rating, no reviews or a value out of range).
 */
export function formatProductRating(
  rating: PublicListProduct["rating"],
  locale: string,
  texts: ProductListTexts,
): FormattedProductRating | null {
  if (!isShowableRating(rating)) {
    return null;
  }
  const formatters = ratingFormatters(locale);
  const average = formatters.average.format(rating.average);
  const count = formatters.count.format(rating.count);
  const reviews = fillProductListText(
    reviewsText(rating.count, locale, texts),
    { count },
  );
  return {
    average,
    count,
    label: fillProductListText(texts.ratingLabel, { average, reviews, count }),
  };
}
