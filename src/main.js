import { Engine } from "./core/Engine.js";

(async () => {
  const engine = new Engine();
  await engine.init();
  console.log("Engine ready");
})();
