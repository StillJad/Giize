import "./globals.css";
import { getSession } from "../lib/session";

const nav = [
  ["📊 Overview", "/overview"],
  ["👋 Welcome", "/welcome"],
  ["🎟️ Tickets", "/tickets"],
  ["✨ Events", "/events"],
  ["🛡️ AutoMod", "/automod"],
  ["📜 Logging", "/logging"],
  ["💜 Bot Health", "/health"],
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  return (
    <html lang="en">
      <body>
        {session ? (
          <div className="shell">
            <aside className="sidebar">
              <div className="brand">Giize Bot</div>
              <nav className="nav">
                {nav.map(([label, href]) => <a key={href} href={href}>{label}</a>)}
              </nav>
            </aside>
            <main className="main">
              <div className="topbar">
                <div>
                  <strong>{session.guildName}</strong>
                  <div className="muted">{session.accessLevel}</div>
                </div>
                <div className="user">
                  {session.avatar ? <img className="avatar" src={session.avatar} alt="" /> : <div className="avatar" />}
                  <span>{session.username}</span>
                  <a href="/api/auth/logout">Log Out</a>
                </div>
              </div>
              {children}
            </main>
          </div>
        ) : children}
      </body>
    </html>
  );
}
