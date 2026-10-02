import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The example consumes the packaged library (`bitsnap-react/dist/index.css`),
// exactly like a real shop would, so the checkout appearance has to work
// without the library's Tailwind source being compiled by this app.
export default defineConfig({
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  // The library ships an already prefixed stylesheet. Re-running a PostCSS
  // prefixer over it would scope every rule to `.bitsnap-react` twice, so no
  // PostCSS plugins are used here.
  css: {
    postcss: {
      plugins: [],
    },
  },
  plugins: [react()],
  server: {
    port: 5199,
  },
});
