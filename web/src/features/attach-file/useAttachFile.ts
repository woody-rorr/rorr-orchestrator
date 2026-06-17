import { useState, useRef } from "react";
import type { PendingAttachment } from "@/entities/message/model";

export function useAttachFile() {
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const inputRef = useRef<HTMLInputElement>(null!);

  function open() {
    inputRef.current?.click();
  }

  async function handleFiles(files: FileList) {
    const next: PendingAttachment[] = [];
    for (const f of Array.from(files)) {
      const isMd =
        /\.md$/i.test(f.name) ||
        f.type === "text/markdown" ||
        f.type === "text/x-markdown";
      if (isMd) {
        const textContent = await f.text();
        next.push({ name: f.name, isText: true, textContent });
      } else {
        const reader = new FileReader();
        const dataUrl = await new Promise<string>((res) => {
          reader.onload = () => res(reader.result as string);
          reader.readAsDataURL(f);
        });
        const base64 = dataUrl.split(",")[1];
        next.push({ name: f.name, dataUrl, mediaType: f.type, base64 });
      }
    }
    setPending((p) => [...p, ...next]);
  }

  function remove(idx: number) {
    setPending((p) => p.filter((_, i) => i !== idx));
  }

  function clear() {
    setPending([]);
  }

  return { pending, inputRef, open, handleFiles, remove, clear };
}
