import {
  defineFeature,
  FeatureImplementation,
  openFeature,
} from "../../src/shared/contracts/index";
import { runContract, type ContractSuite } from "../../src/shared/contracts/testing";
const text = defineFeature<{ read(key: string): Promise<string | null> }>()(
  "text",
  ["read"],
);
const other = defineFeature<{ read(key: string): Promise<string | null> }>()(
  "other",
  ["read"],
);
class Text extends FeatureImplementation<typeof text> {
  constructor() {
    super(text, { read: { status: "supported" } });
  }
  create() {
    return { read: async (_key: string) => null };
  }
}
class Invalid extends FeatureImplementation<typeof text> {
  // @ts-expect-error Missing required API operation.
  create() {
    return {};
  }
}
class WrongReturn extends FeatureImplementation<typeof text> {
  // @ts-expect-error Return type must follow the feature API.
  create() {
    return { read: async (_key: string) => 1 };
  }
}
class WrongArgs extends FeatureImplementation<typeof text> {
  // @ts-expect-error Arguments must follow the feature API.
  create() {
    return { read: async (_key: number) => null };
  }
}
function compileOnly() {
  // @ts-expect-error Coverage cannot omit a declared case.
  new TextWithCoverage(text, {});
  new TextWithCoverage(text, {
    read: { status: "supported" },
    // @ts-expect-error Coverage cannot invent cases.
    typo: { status: "supported" },
  });
  const implementation = new Text();
  const wrongSuite: ContractSuite<typeof other> = {
    feature: other,
    cases: {
      read: async (api) => {
        await api.read("k");
      },
    },
  };
  // @ts-expect-error Even identical API shapes cannot connect a different feature identity.
  void runContract(implementation, wrongSuite);
  void openFeature(implementation).then((session) => {
    const value: Promise<string | null> = session.api.read("key");
    // @ts-expect-error API type is inferred, not chosen by the consumer.
    session.api.write("key", "value");
    return value;
  });
  // @ts-expect-error Missing contract case.
  const missing: ContractSuite<typeof text> = { feature: text, cases: {} };
  void missing;
}
class TextWithCoverage extends FeatureImplementation<typeof text> {
  create() {
    return { read: async (_key: string) => null };
  }
}
void compileOnly;

const incompatible = defineFeature<{ read(key: string): Promise<number> }>()(
  "text",
  ["read"],
);
// @ts-expect-error Identical IDs and case names cannot erase the API type.
const sameIdentityWrongAPI: typeof text = incompatible;
void sameIdentityWrongAPI;
