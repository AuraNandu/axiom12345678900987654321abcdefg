
export interface Env {
  DB: D1Database;
  CHAT_ROOMS: DurableObjectNamespace;
}

const reply = (x: unknown, s = 200) =>
  Response.json(x, {
    status: s,
    headers: { "Cache-Control": "no-store" }
  });

const id = () => crypto.randomUUID();

async function digest(s: string) {
  const b = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(s)
  );
  return [...new Uint8Array(b)]
    .map(x => x.toString(16).padStart(2, "0"))
    .join("");
}

async function passhash(p: string, salt: string) {
  const k = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(p),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const b = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(salt),
      iterations: 100000,
      hash: "SHA-256"
    },
    k,
    256
  );

  return [...new Uint8Array(b)]
    .map(x => x.toString(16).padStart(2, "0"))
    .join("");
}

async function getUser(r: Request, e: Env) {
  const c = r.headers.get("Cookie") || "";
  const t = c.split(";")
    .map(x => x.trim())
    .find(x => x.startsWith("axiom_session="))
    ?.slice(14);

  if (!t) return null;

  return await e.DB.prepare(
    "SELECT u.id,u.username FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?"
  )
    .bind(await digest(t), Date.now())
    .first<any>();
}

const cookie = (t: string, age: number) =>
  `axiom_session=${t}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${age}`;

export default {
  async fetch(r: Request, e: Env) {
    const u = new URL(r.url);
    const p = u.pathname;

    try {
      if (p === "/api/health") {
        return reply({ ok: true });
      }

      // REGISTER AND LOGIN
      if (p === "/api/register" || p === "/api/login") {
        const b = await r.json<any>();
        const n = String(b.username || "").trim();
        const pw = String(b.password || "");

        if (!/^[A-Za-z0-9_]{3,24}$/.test(n)) {
          return reply({
            error: "Username must be 3–24 letters, numbers or underscores."
          }, 400);
        }

        if (pw.length < 8 || pw.length > 128) {
          return reply({
            error: "Password must be 8–128 characters."
          }, 400);
        }

        let user: any;

        if (p === "/api/register") {
          const salt = id();
          const uid = id();

          try {
            await e.DB.prepare(
              "INSERT INTO users(id,username,password_hash,password_salt,created_at) VALUES(?,?,?,?,?)"
            )
              .bind(
                uid,
                n,
                await passhash(pw, salt),
                salt,
                Date.now()
              )
              .run();

          } catch (error) {
            const message = error instanceof Error
              ? error.message
              : String(error);

            console.error("AXIOM registration error:", message);

            if (
              message.includes("UNIQUE constraint failed: users.username")
            ) {
              return reply({
                error: "That username is already taken."
              }, 409);
            }

            // Do not disguise other database errors as duplicate usernames.
            throw error;
          }

          user = { id: uid, username: n };

        } else {
          user = await e.DB.prepare(
            "SELECT * FROM users WHERE username=? COLLATE NOCASE"
          )
            .bind(n)
            .first<any>();

          if (
            !user ||
            await passhash(pw, user.password_salt) !== user.password_hash
          ) {
            return reply({
              error: "Incorrect username or password."
            }, 401);
          }
        }

        const t = id() + id();

        await e.DB.prepare(
          "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)"
        )
          .bind(
            await digest(t),
            user.id,
            Date.now() + 2592000000
          )
          .run();

        return new Response(
          JSON.stringify({
            user: {
              id: user.id,
              username: user.username
            }
          }),
          {
            headers: {
              "Content-Type": "application/json",
              "Set-Cookie": cookie(t, 2592000),
              "Cache-Control": "no-store"
            }
          }
        );
      }

      // LOGOUT
      if (p === "/api/logout") {
        const t = (r.headers.get("Cookie") || "")
          .split(";")
          .map(x => x.trim())
          .find(x => x.startsWith("axiom_session="))
          ?.slice(14);

        if (t) {
          await e.DB.prepare(
            "DELETE FROM sessions WHERE token_hash=?"
          ).bind(await digest(t)).run();
        }

        return new Response('{"ok":true}', {
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": cookie("", 0)
          }
        });
      }

      // AUTHENTICATION
      const user = await getUser(r, e);

      if (p === "/api/me") {
        return reply({
          user: user
            ? { id: user.id, username: user.username }
            : null
        });
      }

      if (!user) {
        return reply({ error: "Please sign in." }, 401);
      }

      // GET GROUPS
      if (p === "/api/groups" && r.method === "GET") {
        const q = await e.DB.prepare(
          "SELECT g.id,g.name,g.description FROM groups g JOIN group_members m ON m.group_id=g.id WHERE m.user_id=? ORDER BY g.created_at DESC"
        )
          .bind(user.id)
          .all();

        return reply({ groups: q.results });
      }

      // CREATE GROUP
      if (p === "/api/groups" && r.method === "POST") {
        const b = await r.json<any>();
        const n = String(b.name || "").trim();

        if (!n || n.length > 40) {
          return reply({
            error: "Channel name must be 1–40 characters."
          }, 400);
        }

        const gid = id();

        await e.DB.batch([
          e.DB.prepare(
            "INSERT INTO groups(id,name,description,created_by,created_at) VALUES(?,?,?,?,?)"
          ).bind(
            gid,
            n,
            "A place to chat",
            user.id,
            Date.now()
          ),

          e.DB.prepare(
            "INSERT INTO group_members(group_id,user_id,role,joined_at) VALUES(?,?,?,?)"
          ).bind(
            gid,
            user.id,
            "owner",
            Date.now()
          )
        ]);

        return reply({
          group: {
            id: gid,
            name: n,
            description: "A place to chat"
          }
        });
      }

      // GROUP MESSAGES
      const m = p.match(/^\/api\/groups\/([\w-]+)\/messages$/);

      if (m) {
        const gid = m[1];

        const member = await e.DB.prepare(
          "SELECT 1 FROM group_members WHERE group_id=? AND user_id=?"
        )
          .bind(gid, user.id)
          .first();

        if (!member) {
          return reply({
            error: "Not a member of this channel."
          }, 403);
        }

        // GET MESSAGES
        if (r.method === "GET") {
          const q = await e.DB.prepare(
            "SELECT m.id,u.username,m.body,m.created_at FROM messages m JOIN users u ON u.id=m.user_id WHERE m.group_id=? ORDER BY m.created_at DESC LIMIT 100"
          )
            .bind(gid)
            .all<any>();

          return reply({
            messages: (q.results || []).reverse()
          });
        }

        // SEND MESSAGE
        if (r.method === "POST") {
          const b = await r.json<any>();
          const messageText = String(b.body || "").trim();

          if (!messageText || messageText.length > 4000) {
            return reply({
              error: "Message must be 1–4000 characters."
            }, 400);
          }

          const msg = {
            id: id(),
            username: user.username,
            body: messageText,
            created_at: new Date().toISOString()
          };

          await e.DB.prepare(
            "INSERT INTO messages(id,group_id,user_id,body,created_at) VALUES(?,?,?,?,?)"
          )
            .bind(
              msg.id,
              gid,
              user.id,
              messageText,
              msg.created_at
            )
            .run();

          await e.CHAT_ROOMS
            .get(e.CHAT_ROOMS.idFromName(gid))
            .fetch("https://room/broadcast", {
              method: "POST",
              body: JSON.stringify({
                type: "message",
                message: msg
              })
            });

          return reply({ message: msg });
        }
      }

      // LIVE MESSAGING
      if (p === "/api/live") {
        const gid = u.searchParams.get("group") || "";

        const member = await e.DB.prepare(
          "SELECT 1 FROM group_members WHERE group_id=? AND user_id=?"
        )
          .bind(gid, user.id)
          .first();

        if (!member) {
          return reply({
            error: "Not a channel member."
          }, 403);
        }

        return e.CHAT_ROOMS
          .get(e.CHAT_ROOMS.idFromName(gid))
          .fetch(r);
      }

      return reply({ error: "Not found" }, 404);

    } catch (err) {
      console.error("AXIOM API ERROR:", err);

      return reply({
        error: err instanceof Error
          ? err.message
          : "Server error"
      }, 500);
    }
  }
};

// DURABLE OBJECT FOR LIVE CHAT
export class ChatRoom {
  state: DurableObjectState;

  constructor(s: DurableObjectState) {
    this.state = s;
  }

  async fetch(r: Request) {
    if (r.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];

      this.state.acceptWebSocket(server);

      return new Response(null, {
        status: 101,
        webSocket: client
      });
    }

    if (new URL(r.url).pathname === "/broadcast") {
      const data = await r.text();

      for (const ws of this.state.getWebSockets()) {
        try {
          ws.send(data);
        } catch (error) {
          console.error("WebSocket broadcast error:", error);
        }
      }

      return new Response("ok");
    }

    return new Response("Not found", { status: 404 });
  }
}
