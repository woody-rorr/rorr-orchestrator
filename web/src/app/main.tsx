import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./globals.css";
import { ChatPage } from "@/pages/chat/ChatPage";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ChatPage />
  </StrictMode>
);
