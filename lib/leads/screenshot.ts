export function buildScreenshotUrl(website?: string | null) {
  if (!website) return null;
  const url = /^https?:\/\//i.test(website) ? website : `https://${website}`;
  return `https://image.thum.io/get/width/900/crop/700/noanimate/${encodeURIComponent(url)}`;
}
