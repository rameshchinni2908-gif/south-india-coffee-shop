import {
  Alert,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Button,
} from "@mui/material";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";

import {
  createSipRoom,
  forgetSipIdentity,
  joinSipRoom,
  loadSipIdentity,
  pingSip,
  saveSipIdentity,
} from "./sip-api.js";
import {
  SIP_NAME,
  SIP_PATH,
  type SipAction,
  type SipPlayer,
  type SipState,
} from "./sip-contract.js";
import { useSipRoom } from "./use-sip-room.js";
import "./secret-sip.css";

const EMOJI = ["☕", "🥥", "🌶️", "🍋", "🍪", "🥭", "🫖", "🍯"];
const cupName = (players: SipPlayer[], id: string | null) =>
  `Cup ${players.find((p) => p.id === id)?.seat ?? "?"}`;
const Shell = ({ children }: { children: ReactNode }) => (
  <main className="sip">
    <div className="sip-shell">
      <header className="sip-header">
        <Link to="/games" className="sip-back">
          ← Games
        </Link>
        <span className="sip-brand">
          JRG <span>TABLE CLUB</span>
        </span>
        <span className="sip-edition">NO. 04</span>
      </header>
      {children}
      <footer className="sip-footer">
        Good coffee. Questionable alibis.
        <br />
        <span>Just for fun. Your order and bill stay separate.</span>
      </footer>
    </div>
  </main>
);

const Rules = () => (
  <details className="sip-rules">
    <summary>How to play & scoring</summary>
    <ol>
      <li>Everyone uses their own phone. Join the same table and tap Ready.</li>
      <li>All regulars see the same secret word. One bluffer sees only the category.</li>
      <li>
        Take turns saying one clue aloud. Be convincing without saying the word. The bluffer
        improvises!
      </li>
      <li>
        Discuss, then vote privately. The unique top vote catches a suspect; a tie lets the bluffer
        escape.
      </li>
      <li>
        A caught bluffer gets one final guess. An exact answer or a common spelling wins the escape.
      </li>
    </ol>
    <p>
      Bluffer escapes: +3 points. Table catches them and stops their guess: +2 to each regular. No
      eliminations. Everyone plays again.
    </p>
    <p>
      12 seconds to check roles, 12 seconds per clue, 35 to discuss, 25 to vote, 15 for the last
      guess. Missing turns and votes time out automatically.
    </p>
  </details>
);

export const SecretSipStart = () => {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const health = useQuery({
    queryKey: ["sip", "health"],
    queryFn: ({ signal }) => pingSip(signal),
    retry: 1,
    staleTime: 30_000,
  });
  const mutation = useMutation({
    mutationFn: async (joinCode: string | null) =>
      joinCode ? (loadSipIdentity(joinCode) ?? (await joinSipRoom(joinCode))) : createSipRoom(),
    onSuccess: (identity) => {
      saveSipIdentity(identity);
      void navigate(`${SIP_PATH}/${identity.code}`);
    },
  });
  return (
    <Shell>
      <section className="sip-hero">
        <div className="sip-eyebrow">
          <span /> A LITTLE SUSPICION WITH YOUR COFFEE
        </div>
        <h1 aria-label={SIP_NAME}>
          Secret <em>Sip.</em>
        </h1>
        <p className="sip-tagline">
          One friend is bluffing.
          <br />
          The whole table is watching.
        </p>
        <div className="sip-art" aria-hidden="true">
          <div className="sip-mini-card sip-card-left">
            <span>☕</span>
            <b>
              I know
              <br />
              the word.
            </b>
            <small>THE REGULAR</small>
          </div>
          <div className="sip-mini-card sip-card-center">
            <span>?</span>
            <b>Act natural.</b>
            <small>THE BLUFFER</small>
          </div>
          <div className="sip-mini-card sip-card-right">
            <span>☕</span>
            <b>
              That sounded
              <br />
              suspicious.
            </b>
            <small>THE REGULAR</small>
          </div>
        </div>
        <div className="sip-tags">
          <span>3–8 friends</span>
          <span>About 3 minutes</span>
          <span>Your own phones</span>
        </div>
      </section>
      <section className="sip-entry" aria-label="Play Secret Sip">
        <div>
          <span className="sip-kicker">YOUR TABLE. YOUR SUSPECTS.</span>
          <h2>Who can keep a straight face?</h2>
          <p>Create a table, share the code, and find out.</p>
          <button
            className="sip-button"
            disabled={mutation.isPending || !health.isSuccess}
            onClick={() => mutation.mutate(null)}
          >
            Create a table <span>↗</span>
          </button>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate(code.trim().toUpperCase());
          }}
        >
          <label htmlFor="sip-code">Got a table code?</label>
          <div className="sip-join">
            <input
              id="sip-code"
              placeholder="ABCDE"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              maxLength={5}
              minLength={5}
              pattern="[A-HJ-NP-Z2-9]{5}"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              required
            />
            <button
              className="sip-button sip-button-light"
              disabled={mutation.isPending || !/^[A-HJ-NP-Z2-9]{5}$/.test(code)}
              type="submit"
            >
              Join →
            </button>
          </div>
        </form>
        {health.isPending && (
          <p role="status" className="sip-status">
            <CircularProgress size={16} /> Waking the café game server. This can take a minute.
          </p>
        )}
        {health.isError && (
          <Alert
            severity="warning"
            action={<Button onClick={() => void health.refetch()}>Retry</Button>}
          >
            The table server did not answer yet.
          </Alert>
        )}
        {mutation.isPending && <p role="status">Getting your seat ready…</p>}
        {mutation.isError && <Alert severity="error">{mutation.error.message}</Alert>}
      </section>
      <div className="sip-steps">
        <div>
          <b>01 / PEEK</b>
          <p>Keep your role private.</p>
        </div>
        <div>
          <b>02 / BLUFF</b>
          <p>Give a clue. Sell the story.</p>
        </div>
        <div>
          <b>03 / REVEAL</b>
          <p>Vote. Gasp. Play again.</p>
        </div>
      </div>
      <Rules />
    </Shell>
  );
};

const SecretCard = ({ state }: { state: SipState }) => {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const hide = () => setOpen(false);
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("blur", hide);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("blur", hide);
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => setOpen(false), 5000);
    return () => clearTimeout(timer);
  }, [open]);
  return (
    <button
      className={`sip-secret ${open && state.role === "BLUFFER" ? "sip-secret-bluffer" : ""}`}
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      aria-label={open ? "Hide your secret role" : "Reveal your secret role"}
    >
      <span className="sip-kicker">{open ? "FOR YOUR EYES ONLY" : "YOUR PRIVATE CARD"}</span>
      <strong>
        {open ? (state.role === "BLUFFER" ? "You’re the bluffer." : state.word) : "Tap to peek."}
      </strong>
      <span>
        {open
          ? state.role === "BLUFFER"
            ? `Category: ${state.category}. Listen closely. Blend in.`
            : "You’re a regular. Give a clue without saying this word."
          : "Keep your screen close. Your friends are watching."}
      </span>
      <small>
        {open ? "Tap to hide · hides automatically in 5 seconds" : "◈ Secret role inside"}
      </small>
    </button>
  );
};

const Players = ({ state }: { state: SipState }) => (
  <ul className="sip-players" aria-label="Players at your table">
    {state.players.map((player) => (
      <li key={player.id} className={state.turnId === player.id ? "sip-player-turn" : ""}>
        <span aria-hidden="true" className="sip-avatar">
          {EMOJI[player.seat - 1]}
        </span>
        <div>
          <b>
            Cup {player.seat}
            {player.id === state.youId ? " · You" : ""}
          </b>
          <small>
            {player.id === state.hostId ? "Host · " : ""}
            {!player.connected
              ? "Reconnecting"
              : state.phase === "LOBBY"
                ? player.ready
                  ? "Ready"
                  : "Not ready"
                : state.phase === "VOTING"
                  ? player.voted
                    ? "Vote locked"
                    : "Thinking…"
                  : `${player.score} pts`}
          </small>
        </div>
        {state.phase === "LOBBY" && player.ready && (
          <span className="sip-ready" aria-label="Ready">
            ✓
          </span>
        )}
      </li>
    ))}
  </ul>
);

const PHASE_LABEL = {
  LOBBY: "Gather your friends",
  REVEAL: "Check your secret role",
  CLUES: "One clue. No giveaways.",
  DISCUSS: "Someone is acting natural.",
  VOTING: "Trust your gut.",
  GUESS: "One last chance.",
  RESULTS: "The truth is served.",
};
export const SipRound = ({
  state,
  connected,
  pending,
  send,
  seconds,
}: {
  state: SipState;
  connected: boolean;
  pending: boolean;
  send: (action: SipAction) => void;
  seconds: number;
}) => {
  const [target, setTarget] = useState<string | null>(null);
  const [guess, setGuess] = useState("");
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const host = state.youId === state.hostId;
  const you = state.players.find((p) => p.id === state.youId)!;
  const disabled = !connected || pending;
  const act = (type: "start" | "clue" | "discussed" | "rematch" | "leave") =>
    send({ type, round: state.round });
  const result = state.result;
  const shareUrl = `${window.location.origin}${SIP_PATH}/${state.code}`;
  return (
    <>
      <div className="sip-room-top">
        <div>
          <span className="sip-kicker">TABLE CODE</span>
          <strong className="sip-room-code">{state.code}</strong>
        </div>
        <div className="sip-you">
          <span aria-hidden="true">{EMOJI[you.seat - 1]}</span> You are Cup {you.seat}
          <small>{host ? "You’re hosting" : `Host: ${cupName(state.players, state.hostId)}`}</small>
        </div>
      </div>
      <div className="sip-phase">
        <span>
          ROUND {state.round || "—"} / {state.phase === "LOBBY" ? "THE GATHERING" : state.phase}
        </span>
        {state.deadline !== null && (
          <strong role="timer" aria-label={`${seconds} seconds remaining`}>
            {seconds}s
          </strong>
        )}
      </div>
      <h1 className="sip-room-title">{PHASE_LABEL[state.phase]}</h1>
      <div className="sip-room-layout">
        <section className="sip-play-area" aria-label="Current round">
          {state.phase === "LOBBY" ? (
            <>
              <div className="sip-lobby-art" aria-hidden="true">
                ☕ <span>?</span> ☕
              </div>
              <h2>
                {state.players.length < 3
                  ? `${3 - state.players.length} more ${state.players.length === 2 ? "friend" : "friends"} to start.`
                  : "The table is almost ready."}
              </h2>
              <p>
                Share the code. Everyone joins on their own phone and taps Ready. Use cup numbers to
                know who’s who.
              </p>
              <button
                className="sip-button sip-button-light"
                onClick={() => {
                  void (
                    navigator.clipboard?.writeText(shareUrl) ??
                    Promise.reject(new Error("Clipboard unavailable"))
                  )
                    .then(() => {
                      setCopied(true);
                      setShareError(false);
                    })
                    .catch(() => setShareError(true));
                }}
              >
                {copied ? "Link copied ✓" : "Copy invite link"}
              </button>
              {shareError && (
                <p role="status">
                  Share this link:{" "}
                  <a className="sip-share-fallback" href={shareUrl}>
                    {shareUrl}
                  </a>
                </p>
              )}
              <div className="sip-actions">
                <button
                  className="sip-button"
                  disabled={disabled}
                  onClick={() => send({ type: "ready", round: state.round, ready: !you.ready })}
                >
                  {you.ready ? "Ready ✓ · tap to undo" : "I’m ready"}
                </button>
                {host ? (
                  <button
                    className="sip-button sip-button-coral"
                    disabled={
                      disabled ||
                      state.players.length < 3 ||
                      !state.players.every((p) => p.ready && p.connected)
                    }
                    onClick={() => act("start")}
                  >
                    Deal secret roles →
                  </button>
                ) : (
                  <p className="sip-hint">Your host will deal once everyone is ready.</p>
                )}
              </div>
            </>
          ) : null}
          {["REVEAL", "CLUES", "DISCUSS", "VOTING"].includes(state.phase) && (
            <SecretCard key={state.round} state={state} />
          )}
          {state.phase === "REVEAL" && (
            <p className="sip-prompt" role="status">
              Peek now. Clue turns begin when the timer ends.
            </p>
          )}
          {state.phase === "CLUES" && (
            <div className="sip-prompt">
              <span className="sip-kicker">THE SPOTLIGHT IS ON</span>
              <h2>
                {state.turnId === state.youId
                  ? "You. Make it convincing."
                  : `${cupName(state.players, state.turnId)}. Listen closely.`}
              </h2>
              <p>Say one short clue aloud. Don’t say the secret word.</p>
              {state.turnId === state.youId && (
                <button
                  className="sip-button sip-button-coral"
                  disabled={disabled}
                  onClick={() => act("clue")}
                >
                  I’ve given my clue →
                </button>
              )}
            </div>
          )}
          {state.phase === "DISCUSS" && (
            <div className="sip-prompt">
              <h2>Who sounded suspicious?</h2>
              <p>
                Talk around the table. Ask about each other’s clues. Keep the actual word secret:
                the bluffer can still steal the win.
              </p>
              {host && (
                <button className="sip-button" disabled={disabled} onClick={() => act("discussed")}>
                  We’re ready to vote →
                </button>
              )}
            </div>
          )}
          {state.phase === "VOTING" && (
            <div className="sip-voting">
              <h2>{state.yourVote ? "Your vote is locked." : "Who is the bluffer?"}</h2>
              <p>
                {state.yourVote
                  ? `You chose ${cupName(state.players, state.yourVote)}. Votes stay private until the reveal.`
                  : "Choose a cup, then lock it in. You cannot change your vote."}
              </p>
              {!state.yourVote && (
                <>
                  <div className="sip-vote-grid">
                    {state.players
                      .filter((p) => p.id !== state.youId)
                      .map((p) => (
                        <button
                          className={`sip-vote ${target === p.id ? "sip-selected" : ""}`}
                          key={p.id}
                          aria-pressed={target === p.id}
                          disabled={disabled}
                          onClick={() => setTarget(p.id)}
                        >
                          <span aria-hidden="true">{EMOJI[p.seat - 1]}</span>Cup {p.seat}
                        </button>
                      ))}
                  </div>
                  <button
                    className="sip-button sip-button-coral"
                    disabled={disabled || !target}
                    onClick={() =>
                      target && send({ type: "vote", round: state.round, targetId: target })
                    }
                  >
                    Lock my vote
                  </button>
                </>
              )}
              <p role="status" className="sip-hint">
                {state.players.filter((p) => p.voted).length} / {state.players.length} votes locked
              </p>
            </div>
          )}
          {state.phase === "GUESS" && (
            <div className="sip-final-guess">
              <div className="sip-big-symbol" aria-hidden="true">
                !
              </div>
              <h2>The bluffer was caught.</h2>
              {state.role === "BLUFFER" ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    send({ type: "guess", round: state.round, word: guess.trim() });
                  }}
                >
                  <p>Steal the win. What was the secret word?</p>
                  <label htmlFor="sip-guess">Your one final guess</label>
                  <input
                    id="sip-guess"
                    value={guess}
                    onChange={(event) => setGuess(event.target.value)}
                    maxLength={40}
                    pattern="[a-zA-Z0-9 '\-]+"
                    autoComplete="off"
                    required
                  />
                  <button
                    className="sip-button sip-button-coral"
                    type="submit"
                    disabled={disabled || !guess.trim()}
                  >
                    Make my final guess
                  </button>
                </form>
              ) : (
                <p>
                  Keep quiet! The bluffer has one chance to guess the word. Don’t help them now.
                </p>
              )}
            </div>
          )}
          {state.phase === "RESULTS" && result && (
            <div className="sip-result">
              <span className="sip-kicker">
                {result.winner === "TABLE"
                  ? "TEAMWORK TASTES GOOD"
                  : "A VERY CONVINCING PERFORMANCE"}
              </span>
              <div className="sip-big-symbol" aria-hidden="true">
                {result.winner === "TABLE" ? "✦" : "?"}
              </div>
              <h2>{result.winner === "TABLE" ? "The table wins!" : "The bluffer wins!"}</h2>
              <p>
                <b>{cupName(state.players, result.blufferId)}</b> was the bluffer.
              </p>
              <div className="sip-answer">
                <small>THE SECRET WORD</small>
                <strong>{result.word}</strong>
              </div>
              <p>
                {result.reason === "TIE"
                  ? "The vote tied. The bluffer slipped away."
                  : result.reason === "ESCAPED"
                    ? "The table accused the wrong cup."
                    : result.reason === "GUESSED"
                      ? "Caught, but they guessed the word and stole the win."
                      : "Caught! The secret stayed safe."}
                {result.guess ? ` Final guess: “${result.guess}”.` : ""}
              </p>
              <h3>Table scoreboard</h3>
              <ol className="sip-scoreboard">
                {[...state.players]
                  .sort((a, b) => b.score - a.score || a.seat - b.seat)
                  .map((p) => (
                    <li key={p.id}>
                      <span>
                        {EMOJI[p.seat - 1]} Cup {p.seat}
                        {p.id === state.youId ? " · You" : ""}
                      </span>
                      <b>{p.score} pts</b>
                    </li>
                  ))}
              </ol>
              <details className="sip-rules">
                <summary>Reveal the votes</summary>
                {state.players.map((p) => (
                  <p key={p.id}>
                    Cup {p.seat} →{" "}
                    {result.votes.find((vote) => vote.voterId === p.id)
                      ? cupName(
                          state.players,
                          result.votes.find((vote) => vote.voterId === p.id)!.targetId,
                        )
                      : "No vote"}
                  </p>
                ))}
              </details>
              {host ? (
                <button
                  className="sip-button sip-button-coral"
                  disabled={disabled}
                  onClick={() => act("rematch")}
                >
                  Another round →
                </button>
              ) : (
                <p className="sip-hint">Waiting for the host to open the next round.</p>
              )}
            </div>
          )}
        </section>
        <aside className="sip-table">
          <h2>
            At the table <span>{state.players.length}/8</span>
          </h2>
          <Players state={state} />
          {host &&
            state.phase === "LOBBY" &&
            state.players
              .filter((p) => !p.connected && p.id !== state.youId)
              .map((p) => (
                <button
                  key={p.id}
                  className="sip-text-button sip-remove"
                  disabled={disabled}
                  onClick={() => send({ type: "remove", round: state.round, targetId: p.id })}
                >
                  Remove disconnected Cup {p.seat}
                </button>
              ))}
          <Rules />
          {["LOBBY", "RESULTS"].includes(state.phase) && (
            <button
              className="sip-text-button"
              disabled={disabled}
              onClick={() => setLeaving(true)}
            >
              Leave table
            </button>
          )}
        </aside>
      </div>
      <Dialog open={leaving} onClose={() => setLeaving(false)}>
        <DialogTitle>Leave this table?</DialogTitle>
        <DialogContent>Your seat will be released. Join again for a fresh score.</DialogContent>
        <DialogActions>
          <Button onClick={() => setLeaving(false)}>Stay</Button>
          <Button
            onClick={() => {
              setLeaving(false);
              act("leave");
            }}
          >
            Leave table
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

const SecretSipRoom = ({ code }: { code: string }) => {
  const [identity, setIdentity] = useState(() => loadSipIdentity(code));
  const join = useMutation({
    mutationFn: () => joinSipRoom(code),
    onSuccess: (value) => {
      saveSipIdentity(value);
      setIdentity(value);
    },
  });
  const room = useSipRoom(identity);
  const deadline = room.state?.deadline;
  const serverNow = room.serverNow;
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const update = () => setSeconds(Math.max(0, Math.ceil(((deadline ?? 0) - serverNow()) / 1000)));
    update();
    const timer = setInterval(update, 200);
    return () => clearInterval(timer);
  }, [deadline, serverNow]);
  useEffect(() => {
    if (room.closed) forgetSipIdentity(code);
  }, [room.closed, code]);
  if (!/^[A-HJ-NP-Z2-9]{5}$/.test(code)) return <Navigate to={SIP_PATH} replace />;
  return (
    <Shell>
      {room.closed ? (
        <section className="sip-entry">
          <h1>This table has closed.</h1>
          <p>
            You left, the room expired, or the server restarted. Your next round is one tap away.
          </p>
          <Link className="sip-button" to={SIP_PATH}>
            Back to Secret Sip
          </Link>
        </section>
      ) : !identity ? (
        <section className="sip-entry">
          <span className="sip-kicker">YOU’RE INVITED</span>
          <h1>Take a seat at {code}.</h1>
          <p>Keep this phone with you. Your secret role will appear here.</p>
          <button className="sip-button" disabled={join.isPending} onClick={() => join.mutate()}>
            {join.isPending ? "Getting your seat…" : "Join this table"}
          </button>
          {join.isError && <Alert severity="error">{join.error.message}</Alert>}
          <Rules />
        </section>
      ) : (
        <>
          {!room.connected && (
            <Alert severity="warning" action={<Button onClick={room.retry}>Retry</Button>}>
              {room.error ??
                "Connecting to your table. The café server may take a minute to wake up."}
            </Alert>
          )}
          {room.connected && room.error && <Alert severity="error">{room.error}</Alert>}
          {room.state ? (
            <SipRound
              key={room.state.round}
              state={room.state}
              connected={room.connected}
              pending={room.pending}
              send={room.send}
              seconds={seconds}
            />
          ) : (
            <section className="sip-entry">
              <h1>Finding your table…</h1>
              <p role="status">
                <CircularProgress size={20} /> Restoring your private seat.
              </p>
              <button
                className="sip-text-button"
                onClick={() => {
                  forgetSipIdentity(code);
                  setIdentity(null);
                }}
              >
                Join with a new seat instead
              </button>
            </section>
          )}
        </>
      )}
    </Shell>
  );
};
const RoomRoute = () => {
  const { code = "" } = useParams();
  return <SecretSipRoom key={code} code={code.toUpperCase()} />;
};
export const SecretSipRoutes = () => (
  <Routes>
    <Route index element={<SecretSipStart />} />
    <Route path=":code" element={<RoomRoute />} />
    <Route path="*" element={<Navigate to={SIP_PATH} replace />} />
  </Routes>
);
