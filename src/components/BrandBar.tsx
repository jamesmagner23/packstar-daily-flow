export function BrandBarTop({ section }: { section: string }) {
  return (
    <div className="brand-bar">
      <span>{section}</span>
      <span className="brand-wordmark text-xs tracking-wider">PACC</span>
    </div>
  );
}

export function BrandBarBottom({ section, page }: { section: string; page?: string }) {
  return (
    <div className="brand-bar">
      <span>{section}</span>
      <span>{page ?? ""}</span>
    </div>
  );
}
