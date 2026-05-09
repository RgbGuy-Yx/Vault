"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useChat, type RoomState } from "@/hooks/useChat";

function formatClock(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = String(params.id ?? "");
  const {
    messages,
    roomState,
    connectionState,
    statusText,
    roomCode,
    guestName,
    remainingMs,
    sendMessage: sendChatMessage,
    destroyRoom: destroyChatRoom,
  } = useChat(roomId);

  const [draft, setDraft] = useState("");
  const [showDestroyConfirm, setShowDestroyConfirm] = useState(false);
  const [stickToBottom, setStickToBottom] = useState(true);
  const [hasUnread, setHasUnread] = useState(false);
  const [didCopyCode, setDidCopyCode] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);

  const dangerLevel =
    remainingMs <= 30 * 1000 ? "critical" : remainingMs <= 2 * 60 * 1000 ? "warning" : "normal";
  const progress = Math.max(0, Math.min(100, (remainingMs / (10 * 60 * 1000)) * 100));
  const inputDisabled = roomState !== "active" || connectionState !== "CONNECTED";

  const scrollToBottom = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;

    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
    setHasUnread(false);
    setStickToBottom(true);
  }, []);

  const copyRoomCode = useCallback(async () => {
    const currentRoomCode = roomCode?.trim() || roomId;

    if (!currentRoomCode) {
      return;
    }

    try {
      await navigator.clipboard.writeText(currentRoomCode);
      setDidCopyCode(true);
      window.setTimeout(() => setDidCopyCode(false), 1500);
    } catch {
      setDidCopyCode(false);
    }
  }, [roomCode, roomId]);

  useEffect(() => {
    stickToBottomRef.current = stickToBottom;
  }, [stickToBottom]);
  useEffect(() => {
    if (stickToBottom) {
      scrollToBottom();
    }
  }, [messages, scrollToBottom, stickToBottom]);

  useEffect(() => {
    if (roomState !== "active") {
      setShowDestroyConfirm(false);
    }
  }, [roomState]);

  const handleScroll = () => {
    const node = scrollRef.current;
    if (!node) return;

    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    const isNearBottom = distanceFromBottom < 80;
    setStickToBottom(isNearBottom);

    if (isNearBottom) {
      setHasUnread(false);
    }
  };

  const handleSendMessage = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || inputDisabled) {
      return;
    }

    if (sendChatMessage(text)) {
      setDraft("");
    }
    setStickToBottom(true);
  };

  const handleDestroyRoom = async () => {
    setShowDestroyConfirm(false);
    await destroyChatRoom();
  };

  const createNewRoom = async () => {
    try {
      const res = await fetch("/api/room/create", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error("Failed to create room");
      router.push(`/room/${data.roomId}`);
    } catch {
      router.push("/");
    }
  };

  return (
    <main className="min-h-screen overflow-hidden bg-black text-white">
      <div className="flex min-h-screen flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-[#3b1111] bg-black px-4 md:px-6">
          <div className="flex h-full items-center gap-8">
            <p
              className="text-xl font-bold uppercase text-[#ff3434] drop-shadow-[0_0_12px_rgba(255,52,52,0.55)]"
              style={{ fontFamily: "var(--font-space-grotesk)" }}
            >
              Signal_Terminal
            </p>
            <div className="hidden h-full items-center gap-7 font-mono text-xs uppercase tracking-[0.22em] text-zinc-600 md:flex">
              <span className="flex h-full items-center border-b-2 border-[#ff3434] text-[#ff3434]">
                Terminal
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.18em] text-[#ff3434]">
            <span className="hidden md:inline">Private_Link</span>
            <button
              onClick={() => router.push("/")}
              className="border border-[#3b1111] px-3 py-2 hover:border-[#ff3434]"
            >
              Exit
            </button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[220px_minmax(0,1fr)_300px]">
          <aside className="hidden border-r border-[#3b1111] bg-[#050505] lg:flex lg:flex-col">
            <div className="border-b border-[#3b1111] p-6">
              <p
                className="text-xl font-bold uppercase text-[#ff3434]"
                style={{ fontFamily: "var(--font-space-grotesk)" }}
              >
                Anonymous
              </p>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">
                No_Login_Session
              </p>
            </div>
            <div className="space-y-2 p-4 font-mono text-xs uppercase tracking-[0.14em] text-zinc-600">
              <div className="border-l-4 border-[#ff3434] bg-[#2a0909] px-4 py-4 text-[#ff3434]">
                Terminal
              </div>
            </div>
            <div className="mt-auto p-4">
              <div className="border border-[#3b1111] p-4 font-mono text-[10px] uppercase leading-5 tracking-[0.12em] text-zinc-600">
                Room closes automatically. Destroy command removes the session immediately.
              </div>
            </div>
          </aside>

          <section className="flex min-h-0 flex-col border-r border-[#3b1111] bg-[#030303]">
            <div className="flex shrink-0 flex-col border-b border-[#3b1111] bg-[#090606] md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 items-center gap-4 px-4 py-3 font-mono text-xs uppercase tracking-[0.18em] md:px-6">
                <span className="text-[#ff3434]">Secure_Pipe_001</span>
                <span className="hidden text-emerald-500 md:inline">Latency: 12ms</span>
                <span className="truncate text-zinc-600">
                  {roomCode ? roomCode.toUpperCase() : `Room_${roomId.toUpperCase()}`}
                </span>
              </div>
              <div className="flex items-center gap-2 px-4 pb-3 md:px-6 md:pb-0">
                <span className="border border-[#3b1111] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                  {statusText}
                </span>
              </div>
            </div>

            <div className="grid shrink-0 gap-3 border-b border-[#3b1111] bg-black/40 p-4 md:hidden">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">
                  Expires_In
                </span>
                <span className="text-3xl text-[#ff3434]" style={{ fontFamily: "var(--font-space-grotesk)" }}>
                  {formatClock(remainingMs)}
                </span>
              </div>
              <div className="h-1 bg-[#221010]">
                <div className="h-full bg-[#ff3434]" style={{ width: `${progress}%` }} />
              </div>
              <button
                onClick={() => setShowDestroyConfirm(true)}
                disabled={roomState !== "active" || connectionState !== "CONNECTED"}
                className="h-11 border border-[#ff3434] font-mono text-xs font-bold uppercase tracking-[0.18em] text-[#ff3434] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Destroy_Session
              </button>
            </div>

            <div className="relative flex min-h-0 flex-1 flex-col">
              <div className="pointer-events-none absolute inset-0 opacity-45 bg-[linear-gradient(rgba(255,52,52,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,52,52,0.08)_1px,transparent_1px)] bg-size-[24px_24px]" />
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.9)_78%)]" />
              <div className="pointer-events-none absolute inset-x-0 top-16 text-center font-mono text-[10px] uppercase tracking-[0.45em] text-zinc-700">
                Secure_Handshake_Complete
              </div>

              <div className="relative z-10 flex min-h-0 flex-1 flex-col">
                {roomState === "expired" || roomState === "destroyed" || roomState === "invalid" ? (
                  <FinalState state={roomState} onCreateNewRoom={createNewRoom} onGoHome={() => router.push("/")} />
                ) : (
                  <>
                    <div ref={scrollRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto px-4 py-12 md:px-8">
                      {messages.length === 0 ? (
                        <div className="flex min-h-full items-center justify-center text-center">
                          <div className="max-w-md border border-[#3b1111] bg-black/70 p-8">
                            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#ff3434]">
                              Awaiting_Input
                            </p>
                            <p
                              className="mt-3 text-3xl uppercase text-zinc-100"
                              style={{ fontFamily: "var(--font-space-grotesk)" }}
                            >
                              No messages yet.
                            </p>
                            <p className="mt-4 text-sm leading-6 text-zinc-500">
                              Share the room link to start a private conversation. Messages disappear when
                              the timer ends.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-8">
                          {messages.map((message) =>
                            message.system ? (
                              <p
                                key={message.id}
                                className="mx-auto w-fit border border-[#3b1111] bg-black/80 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#ff3434]"
                              >
                                {message.body}
                              </p>
                            ) : (
                              <div key={message.id} className={message.mine ? "flex justify-end" : "flex justify-start"}>
                                <article
                                  className={`max-w-[82%] md:max-w-[72%] ${message.mine ? "text-right" : "text-left"
                                    }`}
                                >
                                  <div
                                    className={`mb-2 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-600 ${message.mine ? "justify-end" : "justify-start"
                                      }`}
                                  >
                                    <span className="text-[#ff3434]">{message.sender}</span>
                                    <time>{formatTime(message.at)}</time>
                                  </div>
                                  <div
                                    className={`border bg-[#121212]/95 px-5 py-4 text-base leading-7 shadow-[0_0_28px_rgba(0,0,0,0.45)] md:text-lg ${message.mine
                                        ? "border-[#ff3434] text-zinc-100"
                                        : "border-[#ff3434] text-zinc-100"
                                      }`}
                                  >
                                    <p className="whitespace-pre-wrap wrap-break-word">{message.body}</p>
                                  </div>
                                  <div
                                    className={`mt-2 flex gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-[#ff3434] ${message.mine ? "justify-end" : "justify-start"
                                      }`}
                                  >
                                    <span className="border border-[#3b1111] px-2 py-1">Private</span>
                                    <span className="border border-[#3b1111] px-2 py-1">Ephemeral</span>
                                  </div>
                                </article>
                              </div>
                            ),
                          )}
                        </div>
                      )}
                    </div>

                    {hasUnread && (
                      <button
                        onClick={scrollToBottom}
                        className="mx-auto mb-3 border border-[#ff3434] bg-black px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#ff3434]"
                      >
                        New_Messages
                      </button>
                    )}

                    {roomState === "disconnected" && (
                      <div className="border-t border-[#3b1111] bg-[#2a0909] px-4 py-2 font-mono text-xs uppercase tracking-[0.12em] text-[#ff3434]">
                        Connection lost. Messages are paused until the room reconnects.
                      </div>
                    )}

                    <form onSubmit={handleSendMessage} className="shrink-0 border-t border-[#3b1111] bg-black p-4">
                      <div className="flex items-end gap-2">
                        <textarea
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              e.currentTarget.form?.requestSubmit();
                            }
                          }}
                          disabled={inputDisabled}
                          rows={1}
                          maxLength={800}
                          placeholder={
                            inputDisabled
                              ? "SESSION_NOT_ACCEPTING_MESSAGES..."
                              : "ENTER_COMMAND_OR_MESSAGE_HERE..."
                          }
                          className="max-h-28 min-h-16 flex-1 resize-none border-l-4 border-[#ff3434] bg-[#0d0d0d] px-5 py-4 font-mono text-sm leading-6 text-zinc-100 placeholder:text-[#7a2323] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                        />
                        <button
                          type="submit"
                          disabled={inputDisabled || draft.trim().length === 0}
                          className="h-16 bg-[#e92727] px-6 font-mono text-xs font-bold uppercase tracking-[0.22em] text-black shadow-[0_0_22px_rgba(233,39,39,0.28)] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Execute
                        </button>
                      </div>
                      <div className="mt-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-700">
                        <span>No_Login // No_Permanent_History</span>
                        <span>{draft.length}/800</span>
                      </div>
                    </form>
                  </>
                )}
              </div>
            </div>
          </section>

          <aside className="hidden bg-[#0b0b0b] lg:flex lg:flex-col">
            <div className="space-y-7 p-6">
              <section>
                <p className="border-b border-[#3b1111] pb-3 font-mono text-xs uppercase tracking-[0.22em] text-[#ff3434]">
                  Session_Metadata
                </p>
                <div className="mt-5 space-y-5">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-700">
                      Room_Code
                    </p>
                    <p
                      className="mt-1 text-xl text-zinc-100"
                      suppressHydrationWarning
                      style={{ fontFamily: "var(--font-space-grotesk)" }}
                    >
                      {roomCode || roomId}
                    </p>
                    <button
                      onClick={copyRoomCode}
                      disabled={!roomCode && !roomId}
                      className="mt-3 inline-flex h-10 items-center justify-center border border-[#3b1111] px-4 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#ff3434] transition-colors hover:border-[#ff3434] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {didCopyCode ? "Copied" : "Copy Code"}
                    </button>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-700">
                      Session_Time_Remaining
                    </p>
                    <p
                      className={`mt-1 text-5xl ${dangerLevel === "normal" ? "text-[#ff3434]" : "text-[#ff3434]"
                        }`}
                      style={{ fontFamily: "var(--font-space-grotesk)" }}
                    >
                      {formatClock(remainingMs)}
                    </p>
                    <div className="mt-4 h-1 bg-[#221010]">
                      <div
                        className={`h-full transition-all duration-300 ${dangerLevel === "warning" ? "bg-amber-300" : "bg-[#ff3434]"
                          }`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-700">
                      Privacy_Level
                    </p>
                    <p className="mt-2 border border-[#3b1111] px-3 py-2 font-mono text-xs uppercase tracking-[0.14em] text-[#ff3434]">
                      Anonymous // Ephemeral
                    </p>
                  </div>
                </div>
              </section>

              <section>
                <p className="border-b border-[#3b1111] pb-3 font-mono text-xs uppercase tracking-[0.22em] text-[#ff3434]">
                  Active_Identity
                </p>
                <div className="mt-5 border border-[#3b1111] bg-[#170b0b] px-4 py-3 font-mono text-sm uppercase tracking-[0.12em] text-zinc-200">
                  <span className="mr-2 inline-block h-2 w-2 bg-[#ff3434] shadow-[0_0_10px_rgba(255,52,52,0.8)]" />
                  {guestName}
                </div>
              </section>
            </div>

            <div className="mt-auto space-y-5 p-6">
              <div className="border border-[#3b1111] p-4 font-mono text-[10px] uppercase leading-5 tracking-[0.12em] text-[#d76c6c]">
                Warning: Destroying this room deletes the current session immediately.
              </div>
              <button
                onClick={() => setShowDestroyConfirm(true)}
                disabled={roomState !== "active" || connectionState !== "CONNECTED"}
                className="h-16 w-full border-2 border-[#ff3434] text-lg font-bold uppercase tracking-[0.2em] text-[#ff3434] shadow-[0_0_28px_rgba(255,52,52,0.18)] hover:bg-[#ff3434] hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
                style={{ fontFamily: "var(--font-space-grotesk)" }}
              >
                Destroy_Session
              </button>
            </div>
          </aside>
        </div>
      </div>

      {showDestroyConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
          <div className="w-full max-w-md border border-[#ff3434] bg-[#090909] p-6 shadow-[0_0_50px_rgba(255,52,52,0.2)]">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#ff3434]">
              Destructive_Command
            </p>
            <h2 className="mt-3 text-3xl uppercase" style={{ fontFamily: "var(--font-space-grotesk)" }}>
              Destroy this room?
            </h2>
            <p className="mt-4 text-sm leading-6 text-zinc-400">
              All messages will be deleted immediately. This cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowDestroyConfirm(false)}
                className="h-11 border border-[#3b1111] px-5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-300 hover:border-zinc-200"
              >
                Keep Chat
              </button>
              <button
                onClick={handleDestroyRoom}
                className="h-11 bg-[#ff3434] px-5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-black"
              >
                Destroy Room
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function FinalState({
  state,
  onCreateNewRoom,
  onGoHome,
}: {
  state: RoomState;
  onCreateNewRoom: () => void;
  onGoHome: () => void;
}) {
  const copy = {
    expired: {
      eyebrow: "Room expired",
      title: "This room has expired.",
      body: "The 10-minute timer ended, so the chat and messages were deleted.",
      action: "Create New Room",
      onAction: onCreateNewRoom,
    },
    destroyed: {
      eyebrow: "Room destroyed",
      title: "This room was destroyed.",
      body: "All messages were permanently deleted.",
      action: "Create New Room",
      onAction: onCreateNewRoom,
    },
    invalid: {
      eyebrow: "Invalid link",
      title: "This room link is not valid.",
      body: "The room may have expired, been destroyed, or never existed.",
      action: "Return Home",
      onAction: onGoHome,
    },
  }[state as "expired" | "destroyed" | "invalid"];

  return (
    <div className="flex flex-1 items-center justify-center p-6 text-center">
      <div className="max-w-md">
        <p className="text-[10px] uppercase tracking-[0.2em] text-[#ff5248]">{copy.eyebrow}</p>
        <h2 className="mt-3 text-4xl uppercase" style={{ fontFamily: "var(--font-space-grotesk)" }}>
          {copy.title}
        </h2>
        <p className="mt-4 text-sm leading-6 text-zinc-400">{copy.body}</p>
        <button
          onClick={copy.onAction}
          className="mt-7 h-12 bg-[#ff5248] px-7 text-[11px] font-semibold uppercase tracking-[0.14em] text-black"
        >
          {copy.action}
        </button>
      </div>
    </div>
  );
}
