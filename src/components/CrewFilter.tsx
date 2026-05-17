type Crew = { id: string; name: string };

type Props = {
  crews: Crew[];
  value: string; // "all" or crew id
  onChange: (id: string) => void;
};

export function CrewFilter({ crews, value, onChange }: Props) {
  return (
    <div className="flex items-center gap-2">
      <span className="t-eyebrow text-meta">Crew</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border border-rule px-2 py-1 text-xs bg-white"
      >
        <option value="all">All crews</option>
        {crews.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
