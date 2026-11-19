import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    tailwindcss: {
      config: path.join(__dirname, "tailwind.config.ts"),
    },
    autoprefixer: {
      overrideBrowserslist: [">0.2%", "not dead"],
    },
  },
};

export default config;
