import { cn } from "@/shared/lib/utils";
import type { TagType } from "@/entities/chat/model";

const TAG_STYLES: Record<TagType, { label: string; className: string }> = {
  backend: { label: "Backend", className: "bg-purple-500/15 text-purple-300 border-purple-500/20" },
  web: { label: "Web", className: "bg-blue-500/15 text-blue-300 border-blue-500/20" },
  extension: { label: "Extension", className: "bg-cyan-500/15 text-cyan-300 border-cyan-500/20" },
  notion: { label: "Notion", className: "bg-amber-500/15 text-amber-300 border-amber-500/20" },
  infra: { label: "Infra", className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20" },
};

interface Props {
  title: string;
  tags?: TagType[];
}

export function Header({ title, tags = [] }: Props) {
  return (
    <header className="flex items-center gap-3 px-6 py-3.5 border-b border-[hsl(var(--border))] shrink-0 bg-[hsl(var(--background))]">
      <h1 className="text-[15px] font-semibold text-[hsl(var(--foreground))] truncate">
        {title}
      </h1>
      {tags.length > 0 && (
        <div className="flex items-center gap-1.5 shrink-0">
          {tags.map((t) => (
            <span
              key={t}
              className={cn(
                "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border",
                TAG_STYLES[t].className
              )}
            >
              {TAG_STYLES[t].label}
            </span>
          ))}
        </div>
      )}
    </header>
  );
}
