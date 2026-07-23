import "./globals.css";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { getSession } from "../lib/session";

const nav: [string, [string, string][]][] = [
  ["Overview", [["📊 Overview", "/overview"]]],
  ["Community", [["👋 Welcome", "/welcome"], ["✅ Verification", "/verification"], ["🎟️ Tickets", "/tickets"], ["✨ Events", "/events"]]],
  ["Safety", [["🛡️ AutoMod", "/automod"], ["📜 Logging", "/logging"]]],
  ["Tools", [["👤 Members", "/tools/members"], ["🎭 Roles", "/tools/roles"], ["🏷️ Nicknames", "/tools/nicknames"], ["⚠️ Warnings", "/tools/warnings"], ["⏱️ Timeouts", "/tools/timeouts"], ["#️⃣ Channels", "/tools/channels"], ["📢 Announcements", "/tools/announcements"]]],
  ["System", [["⚙️ Settings", "/settings"], ["💜 Bot Health", "/health"]]],
];

export const metadata: Metadata = {
  title: "Glurps Events",
  description: "Minecraft civilization events built for Java and Bedrock players.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const headerStore = await headers();
  const pathname = headerStore.get("x-pathname") ?? "/";
  const publicPage = pathname === "/";

  return (
    <html lang="en">
      <body>
        {session && !publicPage ? (
          <div className="shell">
            <aside className="sidebar">
              <div className="brand">Glurps Bot</div>
              <nav className="nav">
                {nav.map(([section, links]) => (
                  <div key={section} className="nav-section">
                    <span>{section}</span>
                    {links.map(([label, href]) => <a key={href} href={href}>{label}</a>)}
                  </div>
                ))}
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
