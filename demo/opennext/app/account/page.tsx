import { csrfToken } from "../csrf";
import Link from "next/link";
import { db, owner } from "../db";
export const dynamic = "force-dynamic";
export default async function Account() {
  const user = await owner();
  const csrf = await csrfToken();
  if (!user)
    return (
      <>
        <h1>Sign in</h1>
        <p>
          Demo only: use alice / demo. Do not deploy this login for real
          accounts.
        </p>
        <form action="/api/session" method="post">
          <input type="hidden" name="csrf" value={csrf} />
          <label>
            User
            <input name="user" defaultValue="alice" required />
          </label>
          <label>
            Password
            <input name="password" type="password" required />
          </label>
          <button>Sign in</button>
        </form>
        <Link href="/">Home</Link>
      </>
    );
  const note = await db()
    .prepare("SELECT value FROM notes WHERE owner = ?")
    .bind(user)
    .first<{ value: string }>();
  return (
    <>
      <h1>Account</h1>
      <p id="owner">{user}</p>
      <p id="saved-note">{note?.value}</p>
      <form action="/api/notes" method="post">
        <input type="hidden" name="csrf" value={csrf} />
        <label>
          Note
          <input
            name="value"
            defaultValue={note?.value}
            required
            maxLength={100}
          />
        </label>
        <button>Save</button>
      </form>
      <form action="/api/session" method="post">
        <input type="hidden" name="csrf" value={csrf} />
        <input type="hidden" name="logout" value="1" />
        <button>Sign out</button>
      </form>
      <Link href="/">Home</Link>
    </>
  );
}
