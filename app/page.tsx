"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

const howItWorks = [
  {
    title: "Create a room",
    description: "Start a private chat instantly. No account, email, or phone number required.",
  },
  {
    title: "Share the link",
    description: "Send the room link to the person you want in the conversation.",
  },
  {
    title: "Talk in real time",
    description: "Messages appear instantly while the room is active.",
  },
  {
    title: "Let it vanish",
    description: "Rooms auto-delete after 10 minutes, or you can destroy everything now.",
  },
];

const features = [
  {
    title: "No signup required",
    description: "Skip accounts, passwords, profiles, and onboarding. Open a room and start.",
  },
  {
    title: "Anonymous by default",
    description: "No names, no identity setup, and no personal details needed to enter a chat.",
  },
  {
    title: "Auto-deletes in 10 minutes",
    description: "Every room has a short life by design, so conversations do not linger.",
  },
  {
    title: "Destroy anytime",
    description: "Use Destroy Now to instantly delete the room and its messages permanently.",
  },
  {
    title: "Real-time private rooms",
    description: "Create a temporary space for fast, focused messaging through a shared link.",
  },
  {
    title: "No long-term storage",
    description: "Built for ephemeral conversations, not permanent records or searchable history.",
  },
];

const useCases = [
  "Quick private discussions without creating a permanent message thread.",
  "Temporary collaboration around a link, decision, task, or idea.",
  "Anonymous conversations without usernames, profiles, or contact exchange.",
  "One-time rooms for sensitive details that only need to exist briefly.",
  "Instant cleanup when a chat needs to disappear before the timer ends.",
];

export default function Home() {
  const router = useRouter();
  const [roomId, setRoomId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateRoom = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/room/create", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to create room");

      router.push(`/room/${data.roomId}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create room";
      setError(message);
      setLoading(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomId) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/room/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "This room no longer exists.");

      router.push(`/room/${roomId}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "This room no longer exists.";
      setError(message);
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#07080b] text-white">
      <motion.header
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="border-b border-[#1a1d22]"
      >
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-8">
            <p className="font-[var(--font-space-grotesk)] text-sm text-[#ff5248]">AnonChat</p>
            <nav className="hidden items-center gap-6 text-[10px] uppercase tracking-[0.16em] text-zinc-500 md:flex">
              <a href="#how" className="hover:text-zinc-200">
                How it works
              </a>
              <a href="#features" className="hover:text-zinc-200">
                Features
              </a>
              <a href="#privacy" className="hover:text-zinc-200">
                Privacy
              </a>
            </nav>
          </div>
          <button
            onClick={handleCreateRoom}
            disabled={loading}
            className="h-8 bg-[#ff5248] px-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-black disabled:opacity-60"
          >
            {loading ? "Creating..." : "Create Room"}
          </button>
        </div>
      </motion.header>

      <section className="relative border-b border-[#14171b] py-20 md:py-24">
        <motion.div
          initial="hidden"
          animate="visible"
          transition={{ staggerChildren: 0.11 }}
          className="mx-auto flex w-full max-w-7xl flex-col items-center px-4 text-center"
        >
          <motion.p
            variants={fadeUp}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="mb-6 border border-[#2a2e35] bg-[#101318] px-4 py-1 text-[10px] uppercase tracking-[0.2em] text-zinc-400"
          >
            No login // 10-minute rooms // Destroy anytime
          </motion.p>
          <motion.h1
            variants={fadeUp}
            transition={{ duration: 0.55, ease: "easeOut" }}
            className="font-[var(--font-space-grotesk)] text-5xl font-bold uppercase leading-[0.95] md:text-8xl"
          >
            <span className="block text-zinc-100">Private chats</span>
            <span className="block text-[#ff5248]">that disappear</span>
            <span className="block text-zinc-100">on purpose.</span>
          </motion.h1>
          <motion.p
            variants={fadeUp}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="mt-5 max-w-2xl text-sm leading-6 text-zinc-400 md:text-base"
          >
            Create an anonymous chat room in seconds, share the link, and message in real time.
            No profiles, no permanent history, no long-term storage.
          </motion.p>

          <motion.div
            variants={fadeUp}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="mt-8 flex flex-col gap-3 sm:flex-row"
          >
            <button
              onClick={handleCreateRoom}
              disabled={loading}
              className="h-12 bg-[#ff5248] px-8 text-[11px] font-semibold uppercase tracking-[0.14em] text-black disabled:opacity-60"
            >
              {loading ? "Creating..." : "Create Private Room"}
            </button>
            <a
              href="#how"
              className="flex h-12 items-center justify-center border border-[#32363d] px-8 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-200 hover:border-[#ff5248]"
            >
              See How It Works
            </a>
          </motion.div>

          <motion.form
            variants={fadeUp}
            transition={{ duration: 0.5, ease: "easeOut" }}
            onSubmit={handleJoinRoom}
            className="mt-10 flex w-full max-w-xl"
          >
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value.trim())}
              maxLength={8}
              disabled={loading}
              autoComplete="off"
              placeholder="Enter room code"
              className="h-12 flex-1 border border-[#32363d] bg-[#0d1015] px-4 text-sm tracking-[0.08em] text-zinc-200 placeholder:text-zinc-500 focus:border-[#ff5248] focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading || roomId.length !== 8}
              className="h-12 bg-[#ff5248] px-7 text-[11px] font-semibold uppercase tracking-[0.14em] text-black disabled:opacity-60"
            >
              Join Room
            </button>
          </motion.form>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 text-sm text-rose-400"
            >
              {error}
            </motion.p>
          )}
        </motion.div>
      </section>

      <section className="border-b border-[#14171b]">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-2 md:grid-cols-4">
          {[
            ["Signup", "Never"],
            ["Room life", "10 min"],
            ["Chat type", "Real time"],
            ["Control", "Destroy now"],
          ].map(([label, value], index) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.4, delay: index * 0.08 }}
              className="border-r border-[#14171b] px-5 py-5 last:border-r-0"
            >
              <p className="text-[9px] uppercase tracking-[0.14em] text-[#ff5248]">{label}</p>
              <p className="mt-2 font-[var(--font-space-grotesk)] text-xl">{value}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section id="how" className="mx-auto w-full max-w-7xl px-4 py-16">
        <SectionHeading eyebrow="Simple by design" title="How it works" />
        <div className="mt-8 grid gap-4 md:grid-cols-4">
          {howItWorks.map((step, index) => (
            <motion.article
              key={step.title}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.35 }}
              transition={{ duration: 0.45, delay: index * 0.05 }}
              className="border border-[#252a31] bg-[#12151b] p-6"
            >
              <p className="font-[var(--font-space-grotesk)] text-4xl text-[#ff5248]">
                0{index + 1}
              </p>
              <h3 className="mt-5 font-[var(--font-space-grotesk)] text-xl">{step.title}</h3>
              <p className="mt-3 text-sm leading-6 text-zinc-400">{step.description}</p>
            </motion.article>
          ))}
        </div>
      </section>

      <section id="features" className="border-y border-[#14171b] bg-[#0b0d11]">
        <div className="mx-auto w-full max-w-7xl px-4 py-16">
          <SectionHeading eyebrow="What you get" title="Private when it matters" />
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {features.map((feature, index) => (
              <motion.article
                key={feature.title}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.45, delay: index * 0.04 }}
                className="border border-[#252a31] bg-[#12151b] p-6"
              >
                <h3 className="font-[var(--font-space-grotesk)] text-xl">{feature.title}</h3>
                <p className="mt-3 text-sm leading-6 text-zinc-400">{feature.description}</p>
                <div className="mt-6 h-1 w-full bg-gradient-to-r from-[#ff5248] to-transparent" />
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-4 px-4 py-16 md:grid-cols-[1.15fr_0.85fr]">
        <motion.article
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.45 }}
          className="border border-[#252a31] bg-[#12151b] p-7 md:p-9"
        >
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#ff5248]">
            Why not WhatsApp or Discord?
          </p>
          <h2 className="mt-4 font-[var(--font-space-grotesk)] text-3xl uppercase md:text-5xl">
            Use it when the chat should not become a record.
          </h2>
          <p className="mt-5 max-w-2xl text-sm leading-6 text-zinc-400 md:text-base">
            Most chat apps are built around accounts, histories, groups, and searchable archives.
            AnonChat is built for the opposite: a quick private room, a shared link, and a clean
            ending.
          </p>
        </motion.article>

        <motion.article
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.45, delay: 0.08 }}
          className="border border-[#252a31] bg-black p-7"
        >
          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            Good for short-lived talks
          </p>
          <ul className="mt-5 space-y-4 text-sm leading-6 text-zinc-300">
            {useCases.map((useCase) => (
              <li key={useCase} className="border-l border-[#ff5248] pl-4">
                {useCase}
              </li>
            ))}
          </ul>
        </motion.article>
      </section>

      <section id="privacy" className="mx-auto w-full max-w-7xl px-4 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5 }}
          className="border border-[#252a31] bg-black"
        >
          <div className="border-b border-[#252a31] bg-[#14171b] px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            Privacy defaults
          </div>
          <div className="grid gap-8 px-5 py-7 md:grid-cols-[0.8fr_1.2fr] md:px-8">
            <div>
              <p className="font-[var(--font-space-grotesk)] text-3xl uppercase">
                No tracking. No stored history. Full control.
              </p>
            </div>
            <div className="space-y-4 text-sm leading-6 text-zinc-400">
              <p>
                AnonChat is for temporary conversations. There are no logins to connect, no
                profiles to maintain, and no long-term message history to browse later.
              </p>
              <p>
                When the 10-minute timer ends, the room disappears. When you press Destroy Now, the
                room and its messages are deleted immediately.
              </p>
            </div>
          </div>
        </motion.div>
      </section>

      <section className="border-t border-[#14171b] px-4 py-16 text-center">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.45 }}
          className="mx-auto max-w-3xl"
        >
          <h2 className="font-[var(--font-space-grotesk)] text-4xl font-bold uppercase leading-tight md:text-6xl">
            Say what you need. Then erase the room.
          </h2>
          <p className="mt-5 text-sm leading-6 text-zinc-400 md:text-base">
            Start a private conversation that knows when to disappear.
          </p>
          <button
            onClick={handleCreateRoom}
            disabled={loading}
            className="mt-8 h-12 bg-[#ff5248] px-8 text-[11px] font-semibold uppercase tracking-[0.14em] text-black disabled:opacity-60"
          >
            {loading ? "Creating..." : "Start Anonymous Chat"}
          </button>
        </motion.div>
      </section>
    </main>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <motion.p
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.7 }}
        transition={{ duration: 0.35 }}
        className="text-[10px] uppercase tracking-[0.2em] text-[#ff5248]"
      >
        {eyebrow}
      </motion.p>
      <motion.h2
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.7 }}
        transition={{ duration: 0.45 }}
        className="mt-2 font-[var(--font-space-grotesk)] text-3xl uppercase md:text-4xl"
      >
        {title}
      </motion.h2>
      <motion.div
        initial={{ width: 0, opacity: 0 }}
        whileInView={{ width: 64, opacity: 1 }}
        viewport={{ once: true, amount: 0.7 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="mt-3 h-[2px] bg-[#ff5248]"
      />
    </div>
  );
}
