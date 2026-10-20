import { workersCapacitor } from "cf-workers-mobile/capacitor";
localStorage.removeItem("packaged-stop");
let app = workersCapacitor({
  baseURL: "https://worker.invalid",
  render: "/pages/home",
});
await app.ready;
// iOS keeps this window alive as the runtime host. Exercise public disposal
// here, and after the update stage reinitialize through the same public API.
if ((window as any).Capacitor?.getPlatform() === "ios") {
  const timer = setInterval(async () => {
    if (localStorage.getItem("packaged-stop") !== "requested") return;
    localStorage.removeItem("packaged-stop");
    try {
      await app.dispose();
      console.log("PACKAGED_STOP", "ios public dispose completed");
      if (localStorage.getItem("packaged-stage") !== "reinit") {
        clearInterval(timer);
        return;
      }
      app = workersCapacitor({
        baseURL: "https://worker.invalid",
        render: "/pages/home",
      });
      await app.ready;
      console.log("PACKAGED_RESTART", "ios public reinitialization completed");
    } catch (error) {
      clearInterval(timer);
      console.log(
        "PACKAGED_LIFECYCLE",
        JSON.stringify({
          stage: "reinit",
          passed: false,
          error: String(error),
        }),
      );
    }
  }, 100);
}
