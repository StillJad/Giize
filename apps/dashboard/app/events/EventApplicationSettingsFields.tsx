"use client";

import { useState } from "react";

type Props = {
  defaultVerifyRequired?: boolean;
  defaultGoogleForms?: boolean;
  defaultGoogleFormUrl?: string | null;
};

export function EventApplicationSettingsFields({
  defaultVerifyRequired = true,
  defaultGoogleForms = false,
  defaultGoogleFormUrl = null,
}: Props) {
  const [googleForms, setGoogleForms] = useState(defaultGoogleForms);

  return (
    <div className="card subtle" style={{ marginTop: "0.75rem" }}>
      <div className="row">
        <label className="check">
          <input type="hidden" name="verifyRequired" value="false" />
          <input name="verifyRequired" type="checkbox" defaultChecked={defaultVerifyRequired} />
          <span>
            <strong>Verify Required</strong>
            <small>Applicants must have a verified Minecraft account before applying.</small>
          </span>
        </label>
        <label className="check">
          <input type="hidden" name="googleForms" value="false" />
          <input
            name="googleForms"
            type="checkbox"
            defaultChecked={defaultGoogleForms}
            onChange={event => setGoogleForms(event.currentTarget.checked)}
          />
          <span>
            <strong>Use Google Forms</strong>
            <small>The Apply button will open an external Google Form instead of creating an application ticket.</small>
          </span>
        </label>
      </div>
      <label style={{ display: googleForms ? "block" : "none", marginTop: "0.75rem" }}>
        <span>Google Forms URL</span>
        <input
          name="googleFormUrl"
          type="url"
          defaultValue={defaultGoogleFormUrl ?? ""}
          disabled={!googleForms}
          placeholder="https://forms.gle/..."
        />
      </label>
    </div>
  );
}
