import { API_BASE } from "./api";

function resolveWsUrl(): string {
  if (process.env.NEXT_PUBLIC_WS_URL && process.env.NEXT_PUBLIC_WS_URL.trim()) {
    return process.env.NEXT_PUBLIC_WS_URL.trim();
  }
  try {
    const url = new URL(API_BASE);
    const protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${url.host}/ws/traffic`;
  } catch {
    return "ws://localhost:8000/ws/traffic";
  }
}

const WS_URL = resolveWsUrl();

type MessageHandler = (data: unknown) => void;

class TrafficWebSocket {
  private ws: WebSocket | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = false;

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.shouldReconnect = true;
    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      console.log("[WS] Connected to traffic feed");
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handlers.forEach((handler) => handler(data));
      } catch {
        // Ignore non-JSON messages (e.g., ack)
      }
    };

    this.ws.onclose = () => {
      console.log("[WS] Disconnected");
      if (this.shouldReconnect) {
        this.reconnectTimer = setTimeout(() => this.connect(), 2000);
      }
    };

    this.ws.onerror = (err) => {
      console.error("[WS] Error:", err);
    };
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  subscribe(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const trafficWS = new TrafficWebSocket();
