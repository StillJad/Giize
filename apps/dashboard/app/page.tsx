import { dashboardConfig } from "../lib/config";
import { CopyButton, LandingData } from "./LandingData";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <main className="landing">
      <section className="landing-hero">
        <div className="landing-hero-copy">
          <p className="landing-kicker">Java + Bedrock Minecraft events</p>
          <h1>Glurps Events</h1>
          <p className="landing-subtitle">Minecraft civilization events built for Java and Bedrock players.</p>
          <div className="landing-actions">
            <a className="landing-button" href={dashboardConfig.discordInviteUrl || "#community"}>Join Discord</a>
            <CopyButton address={dashboardConfig.minecraftAddress} label="Connect to Server" />
          </div>
          <div className="server-address">
            <span>Server address</span>
            <strong>{dashboardConfig.minecraftAddress}</strong>
          </div>
        </div>
        <div className="hero-panel">
          <span className="hero-panel-label">Next civilization starts here</span>
          <img className="hero-banner" src="https://i.imgur.com/4M34hi2.png" alt="Glurps Events banner" />
          <p>Teams, diplomacy, stories, chaos, and the kind of Minecraft moments people remember after the server closes.</p>
        </div>
      </section>

      <LandingData discordInviteUrl={dashboardConfig.discordInviteUrl} minecraftAddress={dashboardConfig.minecraftAddress} />

      <section className="landing-section" id="community">
        <div className="landing-section-head">
          <p className="landing-kicker">About</p>
          <h2>Built for big community moments.</h2>
        </div>
        <div className="landing-card-grid">
          <article className="landing-card">
            <h3>Java + Bedrock Crossplay</h3>
            <p>Players can join from both editions and still be part of the same event story.</p>
          </article>
          <article className="landing-card">
            <h3>Civilization Events</h3>
            <p>Groups rise, trade, fight, explore, negotiate, and write their own history.</p>
          </article>
          <article className="landing-card">
            <h3>Community-Driven Events</h3>
            <p>Events are shaped around players, teams, and the moments people actually care about.</p>
          </article>
          <article className="landing-card">
            <h3>Custom Maps and Scenarios</h3>
            <p>Fresh worlds, themed rules, and scenarios built to make every event feel distinct.</p>
          </article>
        </div>
      </section>

      <section className="landing-final">
        <h2>Ready to join the next civilization?</h2>
        <div className="landing-actions">
          <a className="landing-button" href={dashboardConfig.discordInviteUrl || "#community"}>Join Discord</a>
          <CopyButton address={dashboardConfig.minecraftAddress} label="Copy Server IP" />
        </div>
      </section>
    </main>
  );
}
