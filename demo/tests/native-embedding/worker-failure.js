throw new Error("Native embedding startup failure probe");
export default {
  fetch() {
    throw new Error("Failed startup must not serve requests");
  },
};
