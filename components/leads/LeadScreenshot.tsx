export default function LeadScreenshot({ src, name }: { src?: string | null; name: string }) {
  if (!src) return <div className="shot emptyShot">sem screenshot</div>;
  return <img className="shot" src={src} alt={`Screenshot de ${name}`} loading="lazy" />;
}
