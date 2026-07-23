export function normalizeGoogleFormUrl(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    const isFormsShortLink = url.protocol === "https:" && url.hostname === "forms.gle";
    const isGoogleFormsLink = url.protocol === "https:"
      && url.hostname === "docs.google.com"
      && url.pathname.startsWith("/forms/");

    return isFormsShortLink || isGoogleFormsLink ? url.toString() : null;
  } catch {
    return null;
  }
}

export function applicationMethodLabel(googleFormsEnabled: boolean) {
  return googleFormsEnabled ? "Google Forms" : "Discord";
}
