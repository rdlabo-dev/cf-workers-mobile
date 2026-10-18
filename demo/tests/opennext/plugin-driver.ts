import { Capacitor, registerPlugin } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";
type Reply = { value: string; platform: string };
const plugin = registerPlugin<{
  echo(options: { value?: string }): Promise<Reply>;
  addListener(
    name: "echoed",
    callback: (event: Reply) => void,
  ): Promise<PluginListenerHandle>;
}>("BridgeProbe");
Object.assign(window, {
  async checkNativePlugin() {
    if (!Capacitor.isNativePlatform())
      throw new Error("Native bridge unavailable");
    const value = crypto.randomUUID();
    let timeout: ReturnType<typeof setTimeout>;
    let receive!: (reply: Reply) => void;
    const event = new Promise<Reply>((resolve, reject) => {
      receive = resolve;
      timeout = setTimeout(
        () => reject(new Error("Native event missing")),
        5000,
      );
    });
    // Observe timeout even if the bridge method rejects before event is awaited.
    void event.catch(() => {});
    let listener: PluginListenerHandle | undefined;
    try {
      listener = await plugin.addListener("echoed", (reply) => {
        if (reply.value === value) receive(reply);
      });
      const reply = await plugin.echo({ value });
      const notified = await event;
      if (
        reply.value !== value ||
        reply.platform !== Capacitor.getPlatform() ||
        notified.value !== value ||
        notified.platform !== reply.platform
      )
        throw new Error("Native reply/event mismatch");
      let rejected = false;
      try {
        await plugin.echo({});
      } catch {
        rejected = true;
      }
      if (!rejected) throw new Error("Native rejection lost");
      return { platform: reply.platform, reply: true, event: true, rejected };
    } finally {
      clearTimeout(timeout!);
      await listener?.remove();
    }
  },
});
