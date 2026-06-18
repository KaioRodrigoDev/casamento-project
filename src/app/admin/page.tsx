import Image from "next/image";
import type { Prisma } from "@/generated/prisma/client";
import { AdminLoginForm } from "@/components/admin-login-form";
import {
  AdminPhotoFilters,
  type AdminPersonFilter,
} from "@/components/admin-photo-filters";
import { DeveloperStoragePanel } from "@/components/developer-storage-panel";
import { isAdminAuthenticated, logoutAdmin } from "@/app/admin/actions";
import { prisma } from "@/lib/prisma";
import {
  getActiveStorageTargetKey,
  getStorageDiskStatus,
  getStorageTargets,
  isRemoteStorageConfigured,
  toDisplayUrl,
} from "@/lib/storage";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatFileSize(size: number) {
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatCurrency(amountInCents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amountInCents / 100);
}

function getParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getParamList(value: string | string[] | undefined) {
  const values = Array.isArray(value) ? value : value ? [value] : [];

  return values
    .flatMap((item) => item.split(","))
    .map((item) => item.trim())
    .filter(Boolean);
}

type AdminPageProps = {
  searchParams?: Promise<{
    sender?: string | string[];
    people?: string | string[];
  }>;
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const isAuthenticated = await isAdminAuthenticated();

  if (!isAuthenticated) {
    return (
      <main className="min-h-svh bg-[#faf5f0] px-5 py-16">
        <div className="mx-auto max-w-md">
          <AdminLoginForm />
        </div>
      </main>
    );
  }

  const params = (await searchParams) ?? {};
  const selectedSenderId = getParamValue(params.sender);
  const selectedTaggedIds = Array.from(new Set(getParamList(params.people)));
  const photoWhere: Prisma.PhotoGiftWhereInput = {
    ...(selectedSenderId ? { senderId: selectedSenderId } : {}),
    ...(selectedTaggedIds.length > 0
      ? {
          AND: selectedTaggedIds.map((personId) => ({
            tags: { some: { personId } },
          })),
        }
      : {}),
  };

  const people = await prisma.person.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: {
          gifts: true,
          taggedIn: true,
        },
      },
    },
  });

  const peopleFilters: AdminPersonFilter[] = people.map((person) => ({
    id: person.id,
    name: person.name,
    sentCount: person._count.gifts,
    taggedCount: person._count.taggedIn,
  }));

  const photos = await prisma.photoGift.findMany({
    where: photoWhere,
    orderBy: { createdAt: "desc" },
    include: {
      sender: true,
      tags: {
        include: { person: true },
        orderBy: { person: { name: "asc" } },
      },
    },
  });

  const pixGenerations = await prisma.pixGeneration.findMany({
    orderBy: { createdAt: "desc" },
  });
  const pixTotalCents = pixGenerations.reduce((sum, pix) => sum + pix.amount, 0);

  const selectedSender = people.find((person) => person.id === selectedSenderId);
  const selectedTaggedPeople = selectedTaggedIds
    .map((personId) => people.find((person) => person.id === personId))
    .filter((person): person is (typeof people)[number] => Boolean(person));
  const hasActiveFilters = Boolean(selectedSender || selectedTaggedPeople.length);
  const storageTargets = getStorageTargets();
  const activeStorageTargetKey = await getActiveStorageTargetKey();
  const storageTargetsWithStatus = await Promise.all(
    storageTargets.map(async (target) => ({
      key: target.key,
      label: target.label,
      host: target.host,
      uploadPath: target.uploadPath,
      publicBaseUrl: target.publicBaseUrl,
      configured: isRemoteStorageConfigured(target),
      status: await getStorageDiskStatus(target),
    })),
  );

  return (
    <main className="min-h-svh bg-[#faf5f0] px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-[#b08870]">
              Davi & Mirna
            </p>
            <h1 className="mt-3 font-serif text-3xl text-[#9f5f4d]">
              Fotos recebidas
            </h1>
            <p className="mt-2 text-sm text-[#7a6a61]">
              {photos.length} {photos.length === 1 ? "foto encontrada" : "fotos encontradas"}
            </p>
          </div>

          <form action={logoutAdmin}>
            <button className="rounded-xl border border-[#d9c2b1] bg-white px-4 py-2.5 text-sm font-semibold text-[#5d493f] transition hover:border-[#a76554]">
              Sair
            </button>
          </form>
        </header>

        <DeveloperStoragePanel
          activeTargetKey={activeStorageTargetKey}
          targets={storageTargetsWithStatus}
        />

        <section className="mb-6 rounded-2xl border border-[#e8d8cc] bg-white p-5 shadow-lg shadow-[#c4a08620] sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-serif text-xl text-[#9f5f4d]">Presentes em Pix</h2>
              <p className="mt-1 text-sm text-[#7a6a61]">
                {pixGenerations.length}{" "}
                {pixGenerations.length === 1
                  ? "código gerado"
                  : "códigos gerados"}
              </p>
            </div>
            <div className="rounded-xl bg-[#f5ece4] px-4 py-2.5 text-right">
              <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-[#a48070]">
                Total gerado
              </p>
              <p className="font-serif text-2xl text-[#2f2925]">
                {formatCurrency(pixTotalCents)}
              </p>
            </div>
          </div>

          {pixGenerations.length === 0 ? (
            <p className="mt-4 rounded-xl bg-[#fdf6f1] px-4 py-6 text-center text-sm text-[#8f7c71]">
              Nenhum Pix foi gerado ainda.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-136 border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[#efe3da] text-xs uppercase tracking-wide text-[#a48070]">
                    <th className="py-2 pr-4 font-semibold">Data</th>
                    <th className="py-2 pr-4 font-semibold">Convidado</th>
                    <th className="py-2 pr-4 text-right font-semibold">Valor</th>
                    <th className="py-2 font-semibold">ID da transação</th>
                  </tr>
                </thead>
                <tbody>
                  {pixGenerations.map((pix) => (
                    <tr
                      key={pix.id}
                      className="border-b border-[#f3ebe4] last:border-0"
                    >
                      <td className="py-2.5 pr-4 whitespace-nowrap text-[#5d493f]">
                        {formatDate(pix.createdAt)}
                      </td>
                      <td className="py-2.5 pr-4 text-[#2f2925]">
                        {pix.senderName ?? (
                          <span className="text-[#b0a098]">—</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-right font-semibold text-[#2f2925] whitespace-nowrap">
                        {formatCurrency(pix.amount)}
                      </td>
                      <td className="py-2.5 font-mono text-xs text-[#8f7c71]">
                        {pix.transactionId}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <AdminPhotoFilters
            people={peopleFilters}
            selectedSenderId={selectedSenderId}
            selectedTaggedIds={selectedTaggedIds}
          />

          <section className="min-w-0">
            {hasActiveFilters && (
              <div className="mb-5 flex flex-wrap gap-2">
                {selectedSender && (
                  <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#5d493f] shadow-sm shadow-[#c4a08620]">
                    Enviadas por {selectedSender.name}
                  </span>
                )}
                {selectedTaggedPeople.map((person) => (
                  <span
                    key={person.id}
                    className="rounded-full bg-[#f0ded3] px-3 py-1.5 text-xs font-semibold text-[#533d33]"
                  >
                    Com {person.name}
                  </span>
                ))}
              </div>
            )}

            {photos.length === 0 ? (
              <div className="rounded-2xl border border-[#e8d8cc] bg-white px-6 py-10 text-center text-[#7a6a61]">
                {hasActiveFilters
                  ? "Nenhuma foto corresponde aos filtros selecionados."
                  : "Nenhuma foto foi enviada ainda."}
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {photos.map((photo) => (
                  <article
                    key={photo.id}
                    className="overflow-hidden rounded-2xl border border-[#e8d8cc] bg-white shadow-lg shadow-[#c4a08620]"
                  >
                    <a href={toDisplayUrl(photo.url)} target="_blank" rel="noreferrer">
                      <div className="relative aspect-[4/3] bg-[#eee0d7]">
                        <Image
                          src={toDisplayUrl(photo.url)}
                          alt={photo.originalName}
                          fill
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                    </a>

                    <div className="space-y-3 p-4">
                      <div>
                        <p className="text-sm font-semibold text-[#2f2925]">
                          {photo.sender.name}
                        </p>
                        <p className="mt-1 text-xs text-[#8f7c71]">
                          {formatDate(photo.createdAt)} · {formatFileSize(photo.size)}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-[#9f5f4d]">
                          {photo.storageTarget === "contabo"
                            ? "Contabo VPS"
                            : photo.storageTarget === "oracle"
                              ? "Oracle VPS"
                              : "Local"}
                        </p>
                      </div>

                      {photo.message && (
                        <p className="rounded-xl bg-[#f7eadf] px-3 py-2 text-sm leading-6 text-[#5d493f]">
                          {photo.message}
                        </p>
                      )}

                      {photo.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {photo.tags.map((tag) => (
                            <span
                              key={tag.id}
                              className="rounded-full bg-[#f0ded3] px-3 py-1 text-xs text-[#533d33]"
                            >
                              {tag.person.name}
                            </span>
                          ))}
                        </div>
                      )}

                      <a
                        href={toDisplayUrl(photo.url)}
                        download={photo.originalName}
                        className="inline-flex text-sm font-semibold text-[#9f5f4d] underline-offset-2 hover:underline"
                      >
                        Baixar foto
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
