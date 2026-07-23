import { eventRenderer } from "../dist/services/events/EventRenderer.js";
import { normalizeGoogleFormUrl } from "../dist/services/events/EventApplicationSettings.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function event(overrides = {}) {
  return {
    id: 42,
    eventNumber: 7,
    guildId: "guild",
    messageId: "message",
    channelId: "channel",
    hostId: "host",
    title: "Hunger Games",
    description: "Event description",
    location: null,
    startTimestamp: 0,
    endTimestamp: 0,
    maxPlayers: null,
    pingRole: null,
    goingRole: null,
    verifyRequired: true,
    googleFormsEnabled: false,
    googleFormUrl: null,
    status: "scheduled",
    createdAt: Date.now(),
    ...overrides,
  };
}

function firstButton(record) {
  return eventRenderer.renderEventComponents(record)[0].toJSON().components[0];
}

function applicationField(record) {
  return eventRenderer
    .renderEventEmbed(record, { going: 0, cant: 0 })
    .toJSON()
    .fields
    ?.find(field => field.name === "📝 Applications")
    ?.value;
}

const validForm = "https://forms.gle/exampleForm";

const discordVerified = event({ verifyRequired: true, googleFormsEnabled: false });
assert(firstButton(discordVerified).custom_id === "event_apply:42", "Verified Discord application should use the application modal button.");
assert(applicationField(discordVerified) === "Discord • Verification required", "Verified Discord application label mismatch.");

const discordOptional = event({ verifyRequired: false, googleFormsEnabled: false });
assert(firstButton(discordOptional).custom_id === "event_apply:42", "Optional Discord application should use the application modal button.");
assert(applicationField(discordOptional) === "Discord • Verification optional", "Optional Discord application label mismatch.");

const formsVerified = event({ verifyRequired: true, googleFormsEnabled: true, googleFormUrl: validForm });
assert(firstButton(formsVerified).custom_id === "event_apply_form:42", "Verified Google Forms application should use the gated interaction button.");
assert(!("url" in firstButton(formsVerified)), "Verified Google Forms application must not expose a direct public link button.");
assert(applicationField(formsVerified) === "Google Forms • Verification required", "Verified Google Forms label mismatch.");

const formsOptional = event({ verifyRequired: false, googleFormsEnabled: true, googleFormUrl: validForm });
assert(firstButton(formsOptional).style === 5, "Optional Google Forms application should use a link button.");
assert(firstButton(formsOptional).url === validForm, "Optional Google Forms application should link to the configured form.");
assert(applicationField(formsOptional) === "Google Forms • Verification optional", "Optional Google Forms label mismatch.");

const endedForms = event({ status: "ended", verifyRequired: false, googleFormsEnabled: true, googleFormUrl: validForm });
assert(firstButton(endedForms).disabled === true, "Ended Google Forms events should disable Apply.");
assert(!("url" in firstButton(endedForms)), "Ended Google Forms events should not keep a live link button.");

assert(normalizeGoogleFormUrl("https://example.com/form") === null, "Non-Google Forms URLs should be rejected.");
assert(normalizeGoogleFormUrl("https://docs.google.com/forms/d/e/example/viewform"), "docs.google.com/forms URLs should be accepted.");

console.log("✓ Event application settings smoke checks passed");
