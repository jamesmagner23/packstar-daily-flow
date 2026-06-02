export type ProjectType = "lump_sum" | "plant_hire" | "labour_hire" | "dry_hire";

export const PROJECT_TYPE_OPTIONS: { value: ProjectType; label: string; hint: string }[] = [
  { value: "lump_sum", label: "Lump sum", hint: "Drainage, FRP — fixed-price contracts with BOQ + variations" },
  { value: "labour_hire", label: "Labour hire (wet)", hint: "Piling and similar — we supply labour + operated plant on schedule rates" },
  { value: "plant_hire", label: "Plant hire", hint: "Operated plant only, hired by the day/week" },
  { value: "dry_hire", label: "Dry hire", hint: "Plant only, no operator" },
];

export function projectTypeLabel(t: string | null | undefined): string {
  return PROJECT_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? "Lump sum";
}

// Legacy/normalization: tolerate old DB values that haven't been migrated.
export function normalizeProjectType(t: string | null | undefined): ProjectType {
  if (t === "piling_labour") return "labour_hire";
  if (t === "drainage") return "lump_sum";
  if (t === "lump_sum" || t === "labour_hire" || t === "plant_hire" || t === "dry_hire") return t;
  return "lump_sum";
}
