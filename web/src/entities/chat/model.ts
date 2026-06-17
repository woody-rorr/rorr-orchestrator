import type { Message } from "@/entities/message/model";

export interface Chat {
  id: string;
  title: string;
  history: Message[];
}

export type TagType = "backend" | "web" | "extension" | "notion" | "infra";

export function detectTags(history: Message[]): TagType[] {
  const tags = new Set<TagType>();
  const dump = JSON.stringify(history);
  if (/\bbackend-new__|\bbackend__/i.test(dump)) tags.add("backend");
  if (/\bweb__/i.test(dump)) tags.add("web");
  if (/\bextension__/i.test(dump)) tags.add("extension");
  if (/\bnotion__/i.test(dump)) tags.add("notion");
  if (/\binfra__/.test(dump) || /terraform|EC2|RDS|ECS|S3/i.test(dump)) tags.add("infra");
  return [...tags];
}
