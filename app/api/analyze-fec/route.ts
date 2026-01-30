import { NextRequest, NextResponse } from "next/server";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";

export interface AnalyzeFECPayload {
  validationResult: {
    isValid: boolean;
    unbalancedEcritures: Array<{
      ecritureNum: string;
      totalDebit: number;
      totalCredit: number;
      difference: number;
    }>;
  } | null;
  globalBalance: {
    totalDebit: number;
    totalCredit: number;
    netBalance: number;
    isBalanced: boolean;
  } | null;
  mappingHealth: {
    mapped: number;
    total: number;
    mappedPct: number;
    unbalancedCount: number;
    netDelta: number;
  };
  unmappedAccountsSummary: Array<{
    compteNum: string;
    compteLib: string;
    netAmount: number;
    count: number;
  }>;
  operatingModelSummary: Array<{
    category: string;
    amount: number;
    subCount?: number;
  }>;
  fecEntryCount: number;
}

export interface AIInsight {
  id: string;
  title: string;
  body: string;
  tone?: "info" | "warning" | "success" | "neutral";
  buttons?: Array<{ label: string; primary?: boolean }>;
}

const SYSTEM_PROMPT = `Tu es un assistant expert en analyse comptable française (FEC, plan comptable). Tu reçois un résumé d'analyse d'un fichier FEC et tu dois produire des "insights" pour l'utilisateur : des retours courts, pertinents et actionnables qui s'afficheront dans des toasts (notifications) après l'analyse.

Règles :
- Réponds UNIQUEMENT avec un JSON valide, sans texte avant ou après.
- Le JSON doit être un objet avec une clé "insights" qui est un tableau d'objets.
- Chaque objet d'insight a : id (string, ex: "mapping", "balance", "recurrent"), title (string, court), body (string, 1-3 phrases en français), tone ("info" | "warning" | "success" | "neutral"), et optionnellement buttons (tableau de { label: string, primary?: boolean }).
- Génère entre 3 et 6 insights selon ce qui est pertinent dans les données. Ignore les sujets sans donnée utile.
- Sois concis : title et body courts, ton professionnel.
- id possibles suggérés : "mapping" (santé du mapping comptes), "balance" (équilibre global / écritures déséquilibrées), "unmapped" (comptes non mappés), "recurrent" (dépenses récurrentes si détectables), "opportunity", "risk", "summary".
- Si tout est vert (équilibré, bien mappé), propose au moins un insight "summary" positif.`;

function buildUserPrompt(payload: AnalyzeFECPayload): string {
  return `Voici le résumé d'analyse du FEC :

- Nombre d'écritures : ${payload.fecEntryCount}
- Validation des écritures : ${payload.validationResult?.isValid ?? "N/A"} (déséquilibrées : ${payload.validationResult?.unbalancedEcritures?.length ?? 0})
- Équilibre global : Débit total = ${payload.globalBalance?.totalDebit ?? 0} €, Crédit total = ${payload.globalBalance?.totalCredit ?? 0} €, Net = ${payload.globalBalance?.netBalance ?? 0} €, équilibré = ${payload.globalBalance?.isBalanced ?? "N/A"}
- Mapping : ${payload.mappingHealth.mapped} / ${payload.mappingHealth.total} comptes mappés (${payload.mappingHealth.mappedPct}%), écritures déséquilibrées = ${payload.mappingHealth.unbalancedCount}, delta net = ${payload.mappingHealth.netDelta} €
- Comptes non mappés (top 10) : ${JSON.stringify(payload.unmappedAccountsSummary.slice(0, 10))}
- Résumé du modèle opératoire (catégories et montants) : ${JSON.stringify(payload.operatingModelSummary.slice(0, 15))}

Génère les insights au format JSON demandé.`;
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY non configurée" },
      { status: 500 }
    );
  }

  let payload: AnalyzeFECPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Body JSON invalide" },
      { status: 400 }
    );
  }

  const userPrompt = buildUserPrompt(payload);

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    return NextResponse.json(
      { error: "Erreur Anthropic", details: errText },
      { status: response.status }
    );
  }

  const data = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text =
    data.content?.find((b) => b.type === "text")?.text?.trim() ?? "";

  let parsed: { insights: AIInsight[] };
  try {
    // Strip possible markdown code block
    const jsonStr = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    parsed = JSON.parse(jsonStr);
  } catch {
    return NextResponse.json(
      { error: "Réponse Claude invalide (JSON)", raw: text.slice(0, 500) },
      { status: 502 }
    );
  }

  if (!Array.isArray(parsed.insights)) {
    return NextResponse.json(
      { error: "Réponse Claude : clé insights manquante ou invalide" },
      { status: 502 }
    );
  }

  return NextResponse.json({ insights: parsed.insights });
}
