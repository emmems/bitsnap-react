module.exports = {
  plugins: [
    require("@tailwindcss/postcss")(),
    require("autoprefixer")(),
    require("postcss-prefix-selector")({
      prefix: ".bitsnap-react",
      // Checkout appearance rules are scoped to `[data-bitsnap-checkout]`
      // themselves and have to match the theme boundary element, so they must
      // not be rewritten into descendant selectors.
      exclude: [/\[data-bitsnap-checkout/],
    }),
  ],
};
