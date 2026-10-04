module.exports = {
  plugins: [
    require("@tailwindcss/postcss")(),
    require("autoprefixer")(),
    require("postcss-prefix-selector")({
      prefix: ".bitsnap-react",
      // Checkout and returns appearance rules are scoped to
      // `[data-bitsnap-checkout]`/`[data-bitsnap-returns]` themselves and have
      // to match the theme boundary element, so they must not be rewritten
      // into descendant selectors.
      exclude: [/\[data-bitsnap-(checkout|returns)/],
    }),
  ],
};
