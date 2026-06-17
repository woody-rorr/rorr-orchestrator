export type MessageRole = "user" | "assistant";

export interface ContentBlock {
  type: "text" | "tool_use" | "image";
  text?: string;
  name?: string;
  input?: unknown;
  source?: { type: string; media_type: string; data: string };
}

export interface Message {
  role: MessageRole;
  content: ContentBlock[] | string;
  ts?: number;
}

export interface PendingAttachment {
  name: string;
  isText?: boolean;
  textContent?: string;
  dataUrl?: string;
  mediaType?: string;
  base64?: string;
}
