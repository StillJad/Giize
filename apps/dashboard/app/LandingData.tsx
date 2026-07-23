"use client";

import { useEffect, useState } from "react";

type PublicStatus = {
  online: boolean;
  unavailable?: boolean;
  playersOnline: number;
  playersMax: number;
  version: string;
  edition: string;
  address: string;
};

type UpcomingEvent = {
  event: null | {
    id: number;
    title: string;
    description: string;
    startTimestamp: number | null;
    applicationMethod: "Discord" | "Google Forms";
    verifyRequired: boolean;
    apply: {
      label: string;
      url: string | null;
      note: string | null;
    };
  };
};

type Props = {
  discordInviteUrl: string;
  minecraftAddress: string;
};

export function LandingData({ discordInviteUrl, minecraftAddress }: Props) {
  const [status, setStatus] = useState<PublicStatus | null>(null);
  const [event, setEvent] = useState<UpcomingEvent["event"] | null | undefined>(undefined);

  useEffect(() => {
    let active = true;

    Promise.all([
      fetch("/api/public/status").then(response => response.json() as Promise<PublicStatus>),
      fetch("/api/public/upcoming-event").then(response => response.json() as Promise<UpcomingEvent>),
    ])
      .then(([statusData, eventData]) => {
        if (!active) return;
        setStatus(statusData);
        setEvent(eventData.event);
      })
      .catch(() => {
        if (!active) return;
        setStatus({ online: false, unavailable: true, playersOnline: 0, playersMax: 0, version: "Unknown", edition: "Java + Bedrock", address: minecraftAddress });
        setEvent(null);
      });

    return () => {
      active = false;
    };
  }, [minecraftAddress]);

  return (
    <>
      <section className="landing-section">
        <div className="landing-section-head">
          <p className="landing-kicker">Server Status</p>
          <h2>{status?.unavailable ? "Server status is currently unavailable." : status?.online ? "Server is online." : "Server is offline."}</h2>
        </div>
        <div className="status-grid">
          <StatusCard label="Status" value={status ? status.online ? "Online" : "Offline" : "Checking..."} />
          <StatusCard label="Players" value={status ? `${status.playersOnline}/${status.playersMax}` : "..." } />
          <StatusCard label="Version" value={status?.version ?? "..."} />
          <StatusCard label="Edition" value={status?.edition ?? "Java + Bedrock"} />
          <StatusCard label="Address" value={status?.address ?? minecraftAddress} />
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-section-head">
          <p className="landing-kicker">Upcoming Event</p>
          <h2>{event === undefined ? "Checking the schedule..." : event ? event.title : "No event has been announced yet."}</h2>
        </div>
        {event ? (
          <article className="upcoming-event-card">
            <p>{event.description}</p>
            <div className="event-meta">
              <span>{event.startTimestamp ? new Date(event.startTimestamp).toLocaleString() : "TBA"}</span>
              <span>{event.applicationMethod}</span>
              <span>Verification {event.verifyRequired ? "required" : "optional"}</span>
            </div>
            {event.apply.note ? <p className="muted">{event.apply.note}</p> : null}
            <a className="landing-button" href={event.apply.url || discordInviteUrl || "#community"}>{event.apply.label}</a>
          </article>
        ) : event === null ? (
          <p className="landing-empty">No event has been announced yet.</p>
        ) : (
          <div className="landing-card skeleton" />
        )}
      </section>
    </>
  );
}

export function CopyButton({ address, label }: { address: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copyAddress() {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  }

  return (
    <button className="landing-button secondary" type="button" onClick={copyAddress}>
      {copied ? "Server address copied." : label}
    </button>
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="landing-card compact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
