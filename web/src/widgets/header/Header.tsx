interface Props {
  title: string;
}

export function Header({ title }: Props) {
  return (
    <header className="flex items-center gap-3 px-6 py-3.5 border-b border-border-subtle shrink-0">
      <div className="text-[15px] font-semibold flex-1">{title}</div>
    </header>
  );
}
