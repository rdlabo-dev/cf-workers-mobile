import { getExecutionEnvironment } from "workers-capacitor/environment";
import { AsyncLocalStorage } from "node:async_hooks";
export default {
  async fetch() {
    const als = new AsyncLocalStorage<string>();
    const values = await Promise.all(
      ["first", "second"].map((value) =>
        als.run(value, async () => {
          await Promise.resolve();
          return als.getStore();
        }),
      ),
    );
    return Response.json({
      environment: getExecutionEnvironment(),
      values,
      after: als.getStore() ?? null,
    });
  },
};
