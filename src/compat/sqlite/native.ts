// The pinned production workerd profile exposes non-operational SQLite bindings.
// DatabaseSync has no callable methods or successful construction in this profile.
function DatabaseSync() {
  throw new TypeError("Illegal constructor");
}
function StatementSync() {
  throw new TypeError("Illegal constructor");
}
// Public native constructor names remain observable after application minification.
Object.defineProperty(DatabaseSync, "name", {
  value: "DatabaseSync",
  configurable: true,
});
Object.defineProperty(StatementSync, "name", {
  value: "StatementSync",
  configurable: true,
});
const native = {
  DatabaseSync,
  StatementSync,
  backup() {
    throw new Error("backup is not implemented");
  },
  SQLITE_CHANGESET_OMIT: 0,
  SQLITE_CHANGESET_REPLACE: 1,
  SQLITE_CHANGESET_ABORT: 2,
  SQLITE_CHANGESET_DATA: 1,
  SQLITE_CHANGESET_NOTFOUND: 2,
  SQLITE_CHANGESET_CONFLICT: 3,
  SQLITE_CHANGESET_CONSTRAINT: 4,
  SQLITE_CHANGESET_FOREIGN_KEY: 5,
};
export default native;
