#!/usr/bin/env node
// Cria/atualiza no CRM WhatsApp os usuários da equipe do CRM RHOCAL.
//
//   Origem  (SOMENTE LEITURA): Supabase do CRM RHOCAL (RHOCAL_ENV_PATH ou caminho padrão abaixo).
//   Destino : Supabase deste projeto (.env.local daqui).
//
// Uso:
//   DEFAULT_PASSWORD=... SKIP_EMAILS=a@x.com,b@y.com node scripts/seed-rhocal-users.mjs          # teste (não grava)
//   DEFAULT_PASSWORD=... SKIP_EMAILS=... node scripts/seed-rhocal-users.mjs --apply              # grava
//
// Nunca imprime senhas nem chaves; e-mails aparecem mascarados.

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const APPLY = process.argv.includes("--apply");

const SOURCE_ENV_PATH =
  process.env.RHOCAL_ENV_PATH ||
  path.join(os.homedir(), "OneDrive", "Área de Trabalho", "rhocal-crm", ".env.local");
const DEST_ENV_PATH = path.resolve(process.cwd(), ".env.local");

// setor do CRM RHOCAL -> { role no CRM WhatsApp, setor (nome) }
// CS não tem papel próprio aqui (roles: gestor | comercial | compras): usa "comercial" só como permissão.
const MAPPING = {
  gestor: { role: "gestor", sector: null },
  comercial: { role: "comercial", sector: "Comercial" },
  compras: { role: "compras", sector: "Compras" },
  cs: { role: "comercial", sector: "Administrativo" },
};

// Sempre GESTOR, independentemente do setor no CRM RHOCAL.
const FORCE_GESTOR = [
  { label: "Gabriela Da Hora", tokens: ["gabriela", "hora"] },
  { label: "Rodrigo Da Hora", tokens: ["rodrigo", "hora"] },
];

function loadEnv(file) {
  if (!fs.existsSync(file)) throw new Error(`Arquivo não encontrado: ${file}`);
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

function mask(email) {
  const [u, d] = String(email).split("@");
  return `${u.slice(0, 2)}***@${d ?? ""}`;
}

const norm = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

async function listAllAuthUsers(client) {
  const all = [];
  for (let page = 1; ; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error("Falha ao listar usuários do Auth.");
    all.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return all;
}

async function main() {
  const password = process.env.DEFAULT_PASSWORD;
  if (!password) throw new Error("Defina DEFAULT_PASSWORD no ambiente.");
  const skip = new Set(
    (process.env.SKIP_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );

  const srcEnv = loadEnv(SOURCE_ENV_PATH);
  const dstEnv = loadEnv(DEST_ENV_PATH);

  const srcUrl = srcEnv.NEXT_PUBLIC_SUPABASE_URL;
  const dstUrl = dstEnv.NEXT_PUBLIC_SUPABASE_URL;
  if (!srcUrl || !srcEnv.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Credenciais do CRM RHOCAL ausentes.");
  if (!dstUrl || !dstEnv.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Credenciais deste projeto ausentes.");
  if (srcUrl === dstUrl) throw new Error("Origem e destino são o mesmo Supabase. Abortando.");

  const opts = { auth: { persistSession: false, autoRefreshToken: false } };
  const src = createClient(srcUrl, srcEnv.SUPABASE_SERVICE_ROLE_KEY, opts); // só leitura
  const dst = createClient(dstUrl, dstEnv.SUPABASE_SERVICE_ROLE_KEY, opts);

  // ---- leitura da origem ----
  const srcUsers = await listAllAuthUsers(src);
  const { data: srcProfiles, error: spErr } = await src.from("profiles").select("id, nome, setor, ativo");
  if (spErr) throw new Error("Falha ao ler profiles do CRM RHOCAL.");
  const profById = new Map(srcProfiles.map((p) => [p.id, p]));

  // ---- destino: organização, setores, usuários existentes ----
  const { data: gestores, error: gErr } = await dst
    .from("profiles")
    .select("org_id")
    .eq("role", "gestor")
    .eq("active", true);
  if (gErr) throw new Error("Falha ao ler gestores do destino.");
  const orgIds = [...new Set(gestores.map((g) => g.org_id))];
  if (orgIds.length !== 1) throw new Error(`Esperava 1 organização com gestor, encontrei ${orgIds.length}.`);
  const orgId = orgIds[0];

  const { data: sectors, error: sErr } = await dst
    .from("sectors")
    .select("id, name")
    .eq("org_id", orgId)
    .eq("archived", false);
  if (sErr) throw new Error("Falha ao ler setores do destino.");
  const sectorByName = new Map(sectors.map((s) => [norm(s.name), s.id]));

  const dstUsers = await listAllAuthUsers(dst);
  const dstByEmail = new Map(dstUsers.filter((u) => u.email).map((u) => [u.email.toLowerCase(), u]));

  // ---- plano ----
  const plan = [];
  const unknown = [];
  const forcedFound = new Set();

  for (const u of srcUsers) {
    const email = (u.email ?? "").toLowerCase();
    if (!email) continue;
    const p = profById.get(u.id);
    const nome = (p?.nome ?? "").trim() || email.split("@")[0];

    if (!p) {
      unknown.push({ email, nome, motivo: "sem profile no CRM RHOCAL" });
      continue;
    }
    if (p.ativo === false) {
      plan.push({ email, nome, action: "ignorar (inativo)", role: "-", sector: "-" });
      continue;
    }
    if (skip.has(email)) {
      plan.push({ email, nome, action: "ignorar (SKIP_EMAILS)", role: "-", sector: "-" });
      continue;
    }

    const forced = FORCE_GESTOR.find((f) => f.tokens.every((t) => norm(nome).includes(t)));
    if (forced) forcedFound.add(forced.label);

    const mapped = forced ? MAPPING.gestor : MAPPING[norm(p.setor)];
    if (!mapped) {
      unknown.push({ email, nome, motivo: `setor desconhecido: "${p.setor ?? ""}"` });
      continue;
    }

    let sectorId = null;
    if (mapped.sector) {
      sectorId = sectorByName.get(norm(mapped.sector)) ?? null;
      if (!sectorId) {
        unknown.push({ email, nome, motivo: `setor "${mapped.sector}" não existe no destino` });
        continue;
      }
    }

    const existing = dstByEmail.get(email);
    plan.push({
      email,
      nome,
      action: existing ? "resetar senha" : "criar",
      existingId: existing?.id ?? null,
      role: mapped.role,
      sector: mapped.sector ?? "(todos)",
      sectorId,
    });
  }

  const missing = FORCE_GESTOR.filter((f) => !forcedFound.has(f.label)).map((f) => f.label);

  // ---- tabela ----
  console.log(APPLY ? "\n=== APLICANDO ===" : "\n=== MODO TESTE (nada será gravado) ===");
  console.table(
    plan.map((r) => ({ nome: r.nome, email: mask(r.email), ação: r.action, papel: r.role, setor: r.sector }))
  );
  const count = (a) => plan.filter((r) => r.action === a).length;
  console.log(
    `Total: ${plan.length} | criar: ${count("criar")} | resetar senha: ${count("resetar senha")} | ` +
      `ignorar: ${plan.filter((r) => r.action.startsWith("ignorar")).length} | ` +
      `não criados (setor desconhecido etc.): ${unknown.length}`
  );
  if (unknown.length) {
    console.log("\nNão criados:");
    for (const x of unknown) console.log(` - ${x.nome} <${mask(x.email)}>: ${x.motivo}`);
  }
  if (missing.length) console.log(`\nFaltando (esperado como gestor): ${missing.join(", ")}`);

  if (!APPLY) {
    console.log("\nModo teste concluído. Rode com --apply para gravar.");
    return;
  }

  // ---- gravação (somente no destino) ----
  const report = { criados: [], resetados: [], ignorados: [], erros: [] };
  for (const r of plan) {
    if (r.action.startsWith("ignorar")) {
      report.ignorados.push(r);
      continue;
    }
    try {
      let userId = r.existingId;
      if (r.action === "criar") {
        const { data, error } = await dst.auth.admin.createUser({
          email: r.email,
          password,
          email_confirm: true,
        });
        if (error || !data?.user) throw new Error("createUser falhou");
        userId = data.user.id;
      } else {
        const { error } = await dst.auth.admin.updateUserById(userId, { password });
        if (error) throw new Error("updateUserById falhou");
      }

      const { error: pErr } = await dst.from("profiles").upsert(
        {
          id: userId,
          org_id: orgId,
          full_name: r.nome,
          role: r.role,
          active: true,
          must_change_password: true,
        },
        { onConflict: "id" }
      );
      if (pErr) throw new Error("profiles: " + pErr.message);

      if (r.sectorId) {
        const { data: link } = await dst
          .from("profile_sectors")
          .select("profile_id")
          .eq("profile_id", userId)
          .eq("sector_id", r.sectorId)
          .maybeSingle();
        if (!link) {
          const { error: lErr } = await dst
            .from("profile_sectors")
            .insert({ profile_id: userId, sector_id: r.sectorId });
          if (lErr) throw new Error("profile_sectors: " + lErr.message);
        }
      }
      (r.action === "criar" ? report.criados : report.resetados).push(r);
    } catch (e) {
      report.erros.push({ ...r, erro: e.message });
    }
  }

  console.log("\n=== RELATÓRIO ===");
  const names = (l) => (l.length ? l.map((x) => `${x.nome} <${mask(x.email)}>`).join("; ") : "-");
  console.log(`Criados (${report.criados.length}): ${names(report.criados)}`);
  console.log(`Resetados (${report.resetados.length}): ${names(report.resetados)}`);
  console.log(`Ignorados (${report.ignorados.length}): ${names(report.ignorados)}`);
  console.log(`Não criados (${unknown.length}): ${unknown.map((x) => `${x.nome}: ${x.motivo}`).join("; ") || "-"}`);
  console.log(`Faltando (${missing.length}): ${missing.join(", ") || "-"}`);
  console.log(
    `Erros (${report.erros.length}): ${report.erros.map((x) => `${x.nome} <${mask(x.email)}>: ${x.erro}`).join("; ") || "-"}`
  );
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
