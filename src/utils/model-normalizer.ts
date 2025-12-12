const PREFIX_REGEX = /^(models|model|m)\//i;
const SEPARATOR_REGEX = /[-_\s]+/;
const VARIANT_TOKENS = new Set([
  "latest",
  "default",
  "stable",
  "fast",
  "turbo",
  "slow",
  "high",
  "low",
  "medium",
  "mini",
  "lite",
  "light",
  "pro",
  "ultra",
  "think",
  "thinking",
  "instruct",
  "chat",
  "online",
  "beta",
  "preview",
]);

export type VersionParts = number[];

export interface NormalizedModel {
  raw: string;
  cleaned: string;
  canonical: string; // 去除變體標記後的名稱 (保留版本)
  familyKey: string; // 去除版本與變體標記後的名稱
  versionParts: VersionParts; // 數字化版本，用於排序
}

const parseVersion = (token: string): VersionParts | null => {
  const match = token.match(/^v?(\d+(?:\.\d+)+|\d+)$/);
  if (!match) return null;
  return match[1].split(".").map(n => parseInt(n, 10));
};

const compareVersionParts = (a: VersionParts, b: VersionParts): number => {
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
};

// 規則：
// - 移除前綴 models/model/m/
// - 全小寫，分隔符 -/_/空格 視為相同
// - canonical: 保留版本，移除變體標記 (latest/high/low/mini 等)
// - familyKey: 移除版本與變體，便於將同一系列聚合
export function normalizeModelName(raw: string): NormalizedModel {
  const cleaned = raw.trim().replace(PREFIX_REGEX, "").toLowerCase();
  // 去掉廠商前綴 (如 openai/, meta/, qwen/)
  const withoutVendor = cleaned.includes("/") ? cleaned.split("/").pop() || cleaned : cleaned;
  const tokens = withoutVendor.split(SEPARATOR_REGEX).filter(Boolean);

  const versionTokens: VersionParts[] = [];
  const canonicalTokens: string[] = [];
  const familyTokens: string[] = [];

  for (const token of tokens) {
    // 長數字（如日期/批次號 2507）視為變體標記，避免污染 canonical
    const isLongNumericTag = /^\d{4,}$/.test(token);
    if (isLongNumericTag) continue;

    const version = parseVersion(token);
    if (version) {
      versionTokens.push(version);
      canonicalTokens.push(token); // 版本保留在 canonical
      continue;
    }
    if (VARIANT_TOKENS.has(token)) {
      // 變體標記不進入 canonical/family
      continue;
    }
    canonicalTokens.push(token);
    familyTokens.push(token);
  }

  // 若未檢出版本，versionParts 為空；若有多個，取第一個
  const versionParts = versionTokens[0] ?? [];

  const canonicalBase = canonicalTokens.join("-");
  const familyBase = familyTokens.join("-");

  const canonical = canonicalBase || withoutVendor;
  const familyKey = familyBase || withoutVendor;

  return {
    raw,
    cleaned,
    canonical,
    familyKey,
    versionParts,
  };
}

export interface ModelAliasMaps {
  canonicalToVariants: Map<string, Set<string>>; // canonical -> 實際可用的原始模型列表
  variantToCanonical: Map<string, string>; // 任意變體/規範名 -> canonical
}

export function buildModelAliasMaps(modelsByProvider: { models: string[] }[]): ModelAliasMaps {
  const familyMap = new Map<
    string,
    {
      variants: Set<string>;
      candidates: { canonical: string; version: VersionParts }[];
    }
  >();

  for (const provider of modelsByProvider) {
    for (const rawModel of provider.models) {
      const info = normalizeModelName(rawModel);
      const familyKey = info.familyKey || info.canonical || info.cleaned;
      const entry = familyMap.get(familyKey) ?? { variants: new Set<string>(), candidates: [] };
      entry.variants.add(rawModel); // 保留原始名稱用于實際調用
      entry.candidates.push({ canonical: info.canonical || info.cleaned, version: info.versionParts });
      familyMap.set(familyKey, entry);
    }
  }

  const canonicalToVariants = new Map<string, Set<string>>();
  const variantToCanonical = new Map<string, string>();

  for (const [, entry] of familyMap) {
    // 選擇首選 canonical：有版本的選最大版本，否則取第一個候選
    const withVersion = entry.candidates.filter(c => c.version.length > 0);
    let preferred = entry.candidates[0];
    if (withVersion.length > 0) {
      preferred = withVersion.sort((a, b) => compareVersionParts(b.version, a.version))[0];
    }

    const variantSet = entry.variants;
    canonicalToVariants.set(preferred.canonical, variantSet);

    for (const variant of variantSet) {
      const norm = normalizeModelName(variant).canonical || variant.toLowerCase();
      variantToCanonical.set(norm, preferred.canonical);
      variantToCanonical.set(variant, preferred.canonical);
    }

    // 也將 canonical 本身映射回自身
    const preferredNorm = normalizeModelName(preferred.canonical).canonical;
    variantToCanonical.set(preferred.canonical, preferred.canonical);
    variantToCanonical.set(preferredNorm, preferred.canonical);
  }

  return { canonicalToVariants, variantToCanonical };
}
