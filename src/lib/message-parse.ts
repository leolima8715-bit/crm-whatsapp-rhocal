/* eslint-disable @typescript-eslint/no-explicit-any */
// Interpreta o conteúdo de uma mensagem da Evolution (sem dependências de servidor).

function unwrap(message: any): any {
  let m = message ?? {};
  for (let i = 0; i < 4; i++) {
    const inner =
      m.ephemeralMessage?.message ??
      m.viewOnceMessage?.message ??
      m.viewOnceMessageV2?.message ??
      m.documentWithCaptionMessage?.message ??
      null;
    if (!inner) break;
    m = inner;
  }
  return m;
}

export type Parsed = { type: string; body: string | null; mime: string | null };

const UNSUPPORTED = "Mensagem não suportada (abra no celular)";
// Chaves que acompanham outras mensagens e não têm conteúdo próprio.
const NO_CONTENT_KEYS = new Set(["messageContextInfo", "senderKeyDistributionMessage"]);

function mapLink(lat: unknown, lng: unknown) {
  const la = Number(lat);
  const lo = Number(lng);
  return Number.isFinite(la) && Number.isFinite(lo) ? `https://www.google.com/maps?q=${la},${lo}` : null;
}

// null = evento interno sem conteúdo para mostrar (não vira mensagem).
export function parseContent(message: any): Parsed | null {
  const m = unwrap(message);
  if (typeof m.conversation === "string") return { type: "text", body: m.conversation, mime: null };
  if (m.extendedTextMessage)
    return { type: "text", body: m.extendedTextMessage.text ?? null, mime: null };
  if (m.imageMessage)
    return { type: "image", body: m.imageMessage.caption ?? null, mime: m.imageMessage.mimetype ?? null };
  if (m.videoMessage)
    return { type: "video", body: m.videoMessage.caption ?? null, mime: m.videoMessage.mimetype ?? null };
  if (m.ptvMessage) return { type: "video", body: null, mime: m.ptvMessage.mimetype ?? null };
  if (m.audioMessage) return { type: "audio", body: null, mime: m.audioMessage.mimetype ?? null };
  if (m.documentMessage)
    return {
      type: "document",
      body: m.documentMessage.fileName ?? m.documentMessage.caption ?? null,
      mime: m.documentMessage.mimetype ?? null,
    };
  if (m.stickerMessage) return { type: "sticker", body: null, mime: m.stickerMessage.mimetype ?? null };

  const loc = m.locationMessage ?? m.liveLocationMessage;
  if (loc) {
    const link = mapLink(loc.degreesLatitude, loc.degreesLongitude);
    const title = typeof loc.name === "string" && loc.name.trim() ? `Localização: ${loc.name.trim()}` : "Localização";
    return { type: "location", body: link ? `${title}\n${link}` : title, mime: null };
  }

  if (m.contactMessage) {
    const name = String(m.contactMessage.displayName ?? "").trim();
    return { type: "contact", body: name ? `Contato: ${name}` : "Contato", mime: null };
  }
  if (m.contactsArrayMessage) {
    const list: any[] = Array.isArray(m.contactsArrayMessage.contacts) ? m.contactsArrayMessage.contacts : [];
    const first = String(list[0]?.displayName ?? m.contactsArrayMessage.displayName ?? "").trim();
    const extra = list.length > 1 ? ` (+${list.length - 1})` : "";
    return { type: "contact", body: first ? `Contato: ${first}${extra}` : "Contato", mime: null };
  }

  if (m.reactionMessage) {
    const emoji = String(m.reactionMessage.text ?? "").trim();
    return { type: "other", body: emoji ? `Reagiu com ${emoji}` : "Removeu a reação", mime: null };
  }

  const poll = m.pollCreationMessage ?? m.pollCreationMessageV2 ?? m.pollCreationMessageV3;
  if (poll) {
    const q = String(poll.name ?? "").trim();
    return { type: "other", body: q ? `Enquete: ${q}` : "Enquete", mime: null };
  }
  if (m.pollUpdateMessage) return { type: "other", body: "Votou em uma enquete", mime: null };

  if (m.protocolMessage) {
    // 0 = REVOKE (apagada para todos). Os demais tipos são eventos internos (edição, sincronização...).
    if (m.protocolMessage.type === 0 || m.protocolMessage.type === "REVOKE") {
      return { type: "other", body: "Mensagem apagada", mime: null };
    }
    console.warn(`[webhook] evento interno ignorado: protocolMessage.type=${String(m.protocolMessage.type)}`);
    return null;
  }

  // Respostas a botões/listas têm o texto escolhido.
  const picked =
    m.buttonsResponseMessage?.selectedDisplayText ??
    m.listResponseMessage?.title ??
    m.templateButtonReplyMessage?.selectedDisplayText;
  if (typeof picked === "string" && picked) return { type: "text", body: picked, mime: null };

  // Modelos, mensagens interativas, listas e produtos: mostra o texto principal.
  const tpl = m.templateMessage?.hydratedTemplate ?? m.templateMessage?.hydratedFourRowTemplate;
  const rich =
    tpl?.hydratedContentText ??
    m.interactiveMessage?.body?.text ??
    m.listMessage?.description ??
    m.listMessage?.title;
  if (typeof rich === "string" && rich.trim()) return { type: "text", body: rich, mime: null };
  if (m.productMessage) {
    const title = String(m.productMessage.product?.title ?? "").trim();
    return { type: "other", body: title ? `Produto: ${title}` : "Produto", mime: null };
  }
  // Álbum: só agrupa as imagens/vídeos, que chegam como mensagens próprias.
  if (m.albumMessage) return null;

  const keys = Object.keys(m).filter((k) => !NO_CONTENT_KEYS.has(k));
  if (keys.length === 0) return null;
  // Só o nome do tipo é registrado, nunca o conteúdo.
  console.warn(`[webhook] tipo de mensagem desconhecido: ${keys.join(",")}`);
  return { type: "other", body: UNSUPPORTED, mime: null };
}
