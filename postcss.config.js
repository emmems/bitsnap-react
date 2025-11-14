module.exports = {
  plugins: [
    require("@tailwindcss/postcss")(),
    require("autoprefixer")(),
    require("postcss-prefix-selector")({
      prefix: ".bitsnap-checkout",
    }),
  ],
};
