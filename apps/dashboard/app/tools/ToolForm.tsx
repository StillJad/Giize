"use client";

import { useState, useTransition } from "react";

export function ToolForm({ endpoint, fields, children }: { endpoint: string; fields: { name: string; label: string; type?: string; options?: { value: string; label: string }[] }[]; children?: React.ReactNode }) {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setMessage("");
    startTransition(async () => {
      const response = await fetch(`/api/dashboard/${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(formData)),
      });
      setMessage(response.ok ? "Saved." : "Changes could not be saved. Please try again.");
    });
  }

  return (
    <form className="form" action={submit}>
      {fields.map(field => (
        <label key={field.name}>
          <span>{field.label}</span>
          {field.options ? (
            <select name={field.name}>{field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
          ) : (
            <input name={field.name} type={field.type ?? "text"} />
          )}
        </label>
      ))}
      {children}
      <button disabled={pending}>{pending ? "Saving..." : "Submit"}</button>
      {message ? <div className={`toast ${message === "Saved." ? "success" : "error"}`}>{message}</div> : null}
    </form>
  );
}
