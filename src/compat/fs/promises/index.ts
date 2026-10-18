import { promises } from "../index.js";
export const {
  readFile,
  readdir,
  stat,
  lstat,
  realpath,
  access,
} = promises;
export default promises;
