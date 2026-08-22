type SpeechEntity = {
  entityType?: string;
  name?: string;
  aliases?: string[];
};

type SpeechProject = {
  name?: string;
  projectName?: string;
  projectNumber?: string;
  aliases?: string[];
};

const normalize = (value: string) => String(value || "")
  .toLowerCase()
  .replace(/[鼓谷顾]/gu, "古")
  .replace(/[\s·•（）()_\-]/gu, "");

const speechVariantPattern = (value: string) => value
  .split("")
  .map((char) => char === "古" ? "[古鼓谷顾]" : char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("");

function entries(projects: SpeechProject[] = [], entities: SpeechEntity[] = []) {
  const result: Array<{ standard: string; aliases: string[] }> = [];
  for (const project of projects) {
    const standard = String(project.name || project.projectName || "").trim();
    if (standard) result.push({ standard, aliases: [standard, project.projectNumber || "", ...(project.aliases || [])].filter(Boolean) });
  }
  for (const entity of entities.filter((item) => item.entityType === "internal_person")) {
    const standard = String(entity.name || "").trim();
    if (standard) result.push({ standard, aliases: [standard, ...(entity.aliases || [])].filter(Boolean) });
  }
  return result.sort((a, b) => Math.max(...b.aliases.map((item) => item.length)) - Math.max(...a.aliases.map((item) => item.length)));
}

/** Apply only company-known names; never invents or changes ordinary words. */
export function correctBrowserTranscript(text: string, projects: SpeechProject[] = [], entities: SpeechEntity[] = []) {
  let corrected = String(text || "");
  for (const entry of entries(projects, entities)) {
    const standardPattern = speechVariantPattern(entry.standard);
    corrected = corrected.replace(new RegExp(standardPattern, "gu"), entry.standard);
    for (const alias of entry.aliases.sort((a, b) => b.length - a.length)) {
      if (!alias || alias === entry.standard) continue;
      const source = normalize(corrected);
      const target = normalize(alias);
      if (target.length >= 2 && source.includes(target)) {
        const pattern = new RegExp(speechVariantPattern(alias), "gu");
        corrected = corrected.replace(pattern, entry.standard);
        break;
      }
    }
  }
  return corrected;
}

export function browserSpeechPhrases(projects: SpeechProject[] = [], entities: SpeechEntity[] = []) {
  return entries(projects, entities).flatMap((entry) => entry.aliases).filter(Boolean).slice(0, 200);
}
