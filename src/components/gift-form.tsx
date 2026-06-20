"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { generatePix, searchPeople, submitGift } from "@/app/actions";

type PersonOption = { id: string; name: string };

const STORAGE_KEY = "wedding-guest-name";
const normalizeName = (name: string) => name.toLocaleLowerCase("pt-BR");

function usePeopleSearch(query: string) {
  const [results, setResults] = useState<PersonOption[]>([]);
  const [isPending, startTransition] = useTransition();
  const shouldSearch = query.trim().length >= 2;

  useEffect(() => {
    if (!shouldSearch) return;
    const timeout = window.setTimeout(() => {
      startTransition(async () => {
        setResults(await searchPeople(query));
      });
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [query, shouldSearch]);

  return { results: shouldSearch ? results : [], isPending };
}

// ── Sub-componentes ──────────────────────────────────────────────────────────

function Steps({ current }: { current: 1 | 2 }) {
  return (
    <div className="mb-10 flex items-center gap-3">
      <Step num={1} label="Seu nome" active={current === 1} done={current > 1} />
      <div className="h-px flex-1 bg-[#ddd0c6]" />
      <Step num={2} label="Fotos" active={current === 2} done={false} />
    </div>
  );
}

function Step({
  num,
  label,
  active,
  done,
}: {
  num: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={[
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors",
          active || done
            ? "bg-[#9f5f4d] text-white"
            : "border border-[#d4c3b8] text-[#b0a098]",
        ].join(" ")}
      >
        {done ? "✓" : num}
      </span>
      <span
        className={[
          "text-sm font-medium",
          active ? "text-[#1e1a18]" : "text-[#b0a098]",
        ].join(" ")}
      >
        {label}
      </span>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#e8d8cc] bg-white px-6 py-7 shadow-lg shadow-[#c4a08630] sm:px-8 sm:py-8">
      {children}
    </div>
  );
}

function PhotoIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth="1.3"
      stroke="currentColor"
      className="h-9 w-9 text-[#c4a28d]"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function PillButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-[#d9c2b1] bg-white px-3.5 py-1.5 text-sm text-[#4c3b33] transition active:scale-95 hover:border-[#a76554] hover:bg-[#fdf4ef]"
    >
      {children}
    </button>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────

export function GiftForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<1 | 2>(1);
  const [nameInput, setNameInput] = useState("");
  const [confirmedName, setConfirmedName] = useState("");
  const [tagQuery, setTagQuery] = useState("");
  const [taggedNames, setTaggedNames] = useState<string[]>([]);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusOk, setStatusOk] = useState(false);
  const [isSubmitting, startSubmitTransition] = useTransition();

  const [pixAmount, setPixAmount] = useState("");
  const [pixCode, setPixCode] = useState("");
  const [pixError, setPixError] = useState("");
  const [pixCopied, setPixCopied] = useState(false);
  const [isGeneratingPix, startPixTransition] = useTransition();

  const nameSearch = usePeopleSearch(step === 1 ? nameInput : "");
  const tagSearch = usePeopleSearch(tagQuery);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const normalizedName = normalizeName(saved);
        setNameInput(normalizedName);
        setConfirmedName(normalizedName);
        setStep(2);
      }
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  function confirmName() {
    const name = normalizeName(nameInput.trim().replace(/\s+/g, " "));
    if (!name) return;
    localStorage.setItem(STORAGE_KEY, name);
    setConfirmedName(name);
    setStatusMessage("");
    setStep(2);
  }

  function generatePixCode() {
    const value = pixAmount.replace(",", ".").trim();
    const amount = Number.parseFloat(value);
    if (!Number.isFinite(amount) || amount <= 0) {
      setPixError("Informe um valor maior que zero.");
      return;
    }

    setPixError("");
    setPixCopied(false);

    startPixTransition(async () => {
      const formData = new FormData();
      formData.set("senderName", confirmedName);
      formData.set("amount", value);
      const result = await generatePix(formData);
      if (result.ok && result.code) {
        setPixCode(result.code);
      } else {
        setPixError(result.message);
      }
    });
  }

  async function copyPix() {
    try {
      await navigator.clipboard.writeText(pixCode);
      setPixCopied(true);
      window.setTimeout(() => setPixCopied(false), 2000);
    } catch {
      setPixError("Nao foi possivel copiar. Selecione o codigo manualmente.");
    }
  }

  function addTag(name: string) {
    const n = name.trim().replace(/\s+/g, " ");
    if (!n) return;
    setTaggedNames((cur) =>
      cur.some((t) => t.toLowerCase() === n.toLowerCase()) ? cur : [...cur, n],
    );
    setTagQuery("");
  }

  // ── Etapa 1: Nome ──────────────────────────────────────────────────────────

  if (step === 1) {
    return (
      <div>
        <Steps current={1} />

        <Card>
          <label htmlFor="nameInput">
            <span className="font-serif text-xl text-[#1e1a18]">
              Como você se chama?
            </span>
            <p className="mt-2 text-sm leading-6 text-[#7a6a61]">
              Usaremos seu nome para identificar suas fotos no álbum.
            </p>
            <input
              id="nameInput"
              value={nameInput}
              onChange={(e) => setNameInput(normalizeName(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); confirmName(); }
              }}
              placeholder="Seu nome completo"
              autoComplete="off"
              autoFocus
              className="mt-5 w-full rounded-xl border border-[#d9c2b1] bg-[#fdfaf7] px-4 py-3.5 text-base text-[#1e1a18] outline-none placeholder:text-[#b0a098] transition focus:border-[#a76554] focus:ring-4 focus:ring-[#eacdc4]/50"
            />
          </label>

          {nameInput.trim().length >= 2 && (
            <div className="mt-4 rounded-xl border border-[#ead8cc] bg-[#fdfaf7] p-3">
              {nameSearch.isPending ? (
                <p className="px-1 py-0.5 text-sm text-[#806c60]">Buscando...</p>
              ) : nameSearch.results.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {nameSearch.results.map((p) => (
                    <PillButton
                      key={p.id}
                      onClick={() => setNameInput(normalizeName(p.name))}
                    >
                      {p.name}
                    </PillButton>
                  ))}
                </div>
              ) : (
                <p className="px-1 py-0.5 text-sm text-[#806c60]">
                  Novo convidado:{" "}
                  <strong className="font-semibold text-[#3a302a]">
                    {nameInput.trim()}
                  </strong>
                </p>
              )}
            </div>
          )}
        </Card>

        <button
          type="button"
          onClick={confirmName}
          disabled={!nameInput.trim()}
          className="mt-5 w-full rounded-xl bg-[#2f2925] px-5 py-4 text-base font-semibold text-white transition active:scale-[0.99] hover:bg-[#4a3d35] disabled:cursor-not-allowed disabled:opacity-35"
        >
          Continuar
        </button>
      </div>
    );
  }

  // ── Etapa 2: Fotos ─────────────────────────────────────────────────────────

  return (
    <form
      ref={formRef}
      action={(formData) => {
        formData.set("senderName", confirmedName);
        taggedNames.forEach((n) => formData.append("taggedNames", n));

        startSubmitTransition(async () => {
          const result = await submitGift(formData);
          setStatusMessage(result.message);
          setStatusOk(result.ok);
          if (result.ok) {
            formRef.current?.reset();
            setTaggedNames([]);
            setFileNames([]);
          }
        });
      }}
    >
      <Steps current={2} />

      {/* Nome confirmado */}
      <div className="mb-5 flex items-center justify-between rounded-xl bg-[#f5ece4] px-5 py-3.5">
        <p className="text-sm text-[#5d493f]">
          Enviando como{" "}
          <strong className="font-semibold text-[#2c2520]">{confirmedName}</strong>
        </p>
        <button
          type="button"
          onClick={() => { setStep(1); setStatusMessage(""); }}
          className="ml-4 shrink-0 text-xs font-medium text-[#9f5f4d] underline-offset-2 hover:underline"
        >
          Alterar
        </button>
      </div>

      <Card>
        <div className="space-y-7">

          {/* Upload */}
          <div>
            <p className="text-sm font-semibold text-[#3a302a]">Fotos</p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-3 flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[#d4b9a8] bg-[#fdfaf7] px-4 py-11 text-center transition active:scale-[0.99] hover:border-[#a76554] hover:bg-white"
            >
              <PhotoIcon />
              <span>
                <span className="block text-sm font-semibold text-[#3d312b]">
                  Toque para escolher imagens
                </span>
                <span className="mt-1 block text-xs text-[#9a8880]">
                  JPG, PNG ou HEIC · até 10 MB cada
                </span>
              </span>
            </button>
            <input
              ref={fileInputRef}
              name="photos"
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(e) =>
                setFileNames(Array.from(e.target.files ?? []).map((f) => f.name))
              }
            />
            {fileNames.length > 0 && (
              <ul className="mt-4 space-y-2">
                {fileNames.map((name) => (
                  <li key={name} className="flex items-center gap-2.5 text-sm text-[#67584f]">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#c4a28d]" />
                    <span className="min-w-0 truncate">{name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Tags */}
          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-[#3a302a]">
                Marcar pessoas
                <span className="ml-1.5 font-normal text-[#a48070]">(opcional)</span>
              </p>
              <div className="mt-3 flex gap-2.5">
                <input
                  value={tagQuery}
                  onChange={(e) => setTagQuery(e.target.value)}
                  placeholder="Nome de quem aparece"
                  autoComplete="off"
                  className="min-w-0 flex-1 rounded-xl border border-[#d9c2b1] bg-[#fdfaf7] px-4 py-3.5 text-base text-[#1e1a18] outline-none placeholder:text-[#b0a098] transition focus:border-[#a76554] focus:ring-4 focus:ring-[#eacdc4]/50"
                />
                <button
                  type="button"
                  onClick={() => addTag(tagQuery)}
                  className="shrink-0 rounded-xl bg-[#9f5f4d] px-4 py-3.5 text-sm font-semibold text-white transition active:scale-95 hover:bg-[#834938]"
                >
                  Adicionar
                </button>
              </div>
            </div>

            {tagQuery.trim().length >= 2 && (
              <div className="flex flex-wrap gap-2 rounded-xl border border-[#ead8cc] bg-[#fdfaf7] p-3">
                {tagSearch.results.map((p) => (
                  <PillButton key={p.id} onClick={() => addTag(p.name)}>
                    {p.name}
                  </PillButton>
                ))}
                {!tagSearch.results.some(
                  (p) => p.name.toLowerCase() === tagQuery.trim().toLowerCase(),
                ) && (
                  <PillButton onClick={() => addTag(tagQuery)}>
                    Criar &quot;{tagQuery.trim()}&quot;
                  </PillButton>
                )}
              </div>
            )}

            {taggedNames.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {taggedNames.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() =>
                      setTaggedNames((cur) => cur.filter((n) => n !== name))
                    }
                    className="flex items-center gap-1.5 rounded-full bg-[#f0ded3] px-3.5 py-1.5 text-sm text-[#533d33] transition active:scale-95 hover:bg-[#e5cfbf]"
                  >
                    {name}
                    <span className="text-[#9d6b5a]" aria-hidden="true">×</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Mensagem */}
          <div>
            <p className="text-sm font-semibold text-[#3a302a]">
              Mensagem
              <span className="ml-1.5 font-normal text-[#a48070]">(opcional)</span>
            </p>
            <textarea
              name="message"
              rows={3}
              placeholder="Deixe uma mensagem para os noivos"
              className="mt-3 w-full resize-none rounded-xl border border-[#d9c2b1] bg-[#fdfaf7] px-4 py-3.5 text-base text-[#1e1a18] outline-none placeholder:text-[#b0a098] transition focus:border-[#a76554] focus:ring-4 focus:ring-[#eacdc4]/50"
            />
          </div>

          {/* Pix */}
          <div className="border-t border-[#efe3da] pt-7">
            <p className="text-sm font-semibold text-[#3a302a]">
              Presente em dinheiro
              <span className="ml-1.5 font-normal text-[#a48070]">(opcional)</span>
            </p>
            <p className="mt-1 text-xs leading-5 text-[#9a8880]">
              Gere um código Pix com o valor que quiser e use o copia e cola no app do seu banco.
            </p>

            <div className="mt-3 flex gap-2.5">
              <div className="relative flex-1">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-base text-[#9a8880]">
                  R$
                </span>
                <input
                  value={pixAmount}
                  onChange={(e) => {
                    setPixAmount(e.target.value.replace(/[^0-9.,]/g, ""));
                    setPixCode("");
                    setPixError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); generatePixCode(); }
                  }}
                  inputMode="decimal"
                  placeholder="0,00"
                  autoComplete="off"
                  className="w-full min-w-0 rounded-xl border border-[#d9c2b1] bg-[#fdfaf7] py-3.5 pl-11 pr-4 text-base text-[#1e1a18] outline-none placeholder:text-[#b0a098] transition focus:border-[#a76554] focus:ring-4 focus:ring-[#eacdc4]/50"
                />
              </div>
              <button
                type="button"
                onClick={generatePixCode}
                disabled={isGeneratingPix || !pixAmount.trim()}
                className="flex shrink-0 items-center gap-2 rounded-xl bg-[#9f5f4d] px-4 py-3.5 text-sm font-semibold text-white transition active:scale-95 hover:bg-[#834938] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isGeneratingPix ? <Spinner /> : "Gerar Pix"}
              </button>
            </div>

            {pixError && (
              <p className="mt-2 text-sm text-[#a14b3a]">{pixError}</p>
            )}

            {pixCode && (
              <div className="mt-4 rounded-xl border border-[#ead8cc] bg-[#fdf6f1] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#a48070]">
                  Pix copia e cola
                </p>
                <p className="mt-2 break-all font-mono text-xs leading-5 text-[#5d493f]">
                  {pixCode}
                </p>
                <button
                  type="button"
                  onClick={copyPix}
                  className="mt-3 w-full rounded-lg border border-[#d9c2b1] bg-white py-2.5 text-sm font-semibold text-[#834938] transition active:scale-[0.99] hover:border-[#a76554] hover:bg-[#fdf4ef]"
                >
                  {pixCopied ? "Copiado ✓" : "Copiar código"}
                </button>
              </div>
            )}
          </div>

        </div>
      </Card>

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#2f2925] px-5 py-4 text-base font-semibold text-white transition active:scale-[0.99] hover:bg-[#4a3d35] disabled:opacity-50"
      >
        {isSubmitting ? (
          <><Spinner /> Enviando...</>
        ) : (
          "Presentear os noivos"
        )}
      </button>

      {statusMessage && (
        <p
          className={[
            "mt-5 rounded-xl px-5 py-4 text-sm leading-6",
            statusOk
              ? "bg-[#edf7ed] text-[#2e5d30]"
              : "bg-[#f7eadf] text-[#5d493f]",
          ].join(" ")}
        >
          {statusMessage}
        </p>
      )}
    </form>
  );
}
