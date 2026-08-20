import crypto from "node:crypto";

export const COMPANY_ENTITY_TYPES = new Set([
  "internal_person",
  "partner_organization",
  "supplier_organization",
  "external_person",
  "external_organization",
]);

const normalize = (value = "") => String(value).trim().toLowerCase().replace(/[\s·•（）()_-]+/g, "");
const unique = (values = []) => Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
const organizationLike = (name = "") => /(公司|单位|集团|中心|院|厂|队|局|所|部|供应商|合作方)$/u.test(String(name).trim());

export function readCompanyAppData(db, key, fallback) {
  try {
    const row = db?.prepare("SELECT value FROM app_data WHERE key = ?").get(key);
    return row ? JSON.parse(row.value) : fallback;
  } catch {
    return fallback;
  }
}

export function flattenProjects(board = []) {
  if (!Array.isArray(board)) return [];
  const values = board.flatMap((entry) => Array.isArray(entry?.projects) ? entry.projects : [entry]);
  return values.filter((project) => project && (project.id || project.name || project.projectName)).map((project) => ({
    id: String(project.id || project.projectId || ""),
    name: String(project.name || project.projectName || "").trim(),
    projectNumber: String(project.projectNumber || project.code || "").trim(),
    aliases: unique([project.alias, ...(Array.isArray(project.aliases) ? project.aliases : [])]),
  }));
}

function glossaryAliases(glossary = [], category, standardName) {
  const target = normalize(standardName);
  return glossary.filter((entry) => entry?.enabled !== false && entry?.category === category && normalize(entry.standardName) === target)
    .flatMap((entry) => Array.isArray(entry.aliases) ? entry.aliases : []);
}

export function buildCompanyEntityIndex({ personnel = [], partners = [], suppliers = [], glossary = [] } = {}) {
  const entities = [];
  for (const person of Array.isArray(personnel) ? personnel : []) {
    const name = String(person?.name || "").trim();
    if (!name) continue;
    entities.push({
      entityId: String(person.id || `person:${crypto.createHash("sha1").update(name).digest("hex").slice(0, 12)}`),
      entityType: "internal_person",
      name,
      organizationId: String(person.organizationId || ""),
      organizationName: String(person.companyName || person.organizationName || ""),
      role: String(person.role || person.position || ""),
      projectIds: unique(person.projectIds || person.projects || []),
      aliases: unique([person.nickname, person.shortName, ...(Array.isArray(person.aliases) ? person.aliases : []), ...glossaryAliases(glossary, "person", name)]),
      notificationEligible: Boolean(person.accountId || person.loginEnabled),
    });
  }
  for (const partner of Array.isArray(partners) ? partners : []) {
    const name = String(partner?.name || partner?.companyName || "").trim();
    if (!name) continue;
    const id = String(partner.id || `partner:${crypto.createHash("sha1").update(name).digest("hex").slice(0, 12)}`);
    entities.push({
      entityId: id,
      entityType: "partner_organization",
      name,
      contactName: String(partner.contact || partner.contactName || ""),
      projectIds: unique(partner.projectIds || []),
      projectNames: unique(partner.projectNames || []),
      aliases: unique([partner.shortName, ...(Array.isArray(partner.aliases) ? partner.aliases : []), ...glossaryAliases(glossary, "organization", name)]),
      notificationEligible: Boolean(partner.contactEntityId || partner.accountId),
      contactEntityId: String(partner.contactEntityId || ""),
    });
  }
  for (const supplier of Array.isArray(suppliers) ? suppliers : []) {
    const name = String(supplier?.name || supplier?.companyName || "").trim();
    if (!name) continue;
    entities.push({
      entityId: String(supplier.id || `supplier:${crypto.createHash("sha1").update(name).digest("hex").slice(0, 12)}`),
      entityType: "supplier_organization",
      name,
      contactName: String(supplier.contact || supplier.contactName || ""),
      aliases: unique([supplier.shortName, ...(Array.isArray(supplier.aliases) ? supplier.aliases : []), ...glossaryAliases(glossary, "organization", name)]),
      notificationEligible: Boolean(supplier.contactEntityId || supplier.accountId),
      contactEntityId: String(supplier.contactEntityId || ""),
    });
  }
  return entities;
}

export function getCompanyKnowledge(db, glossary = []) {
  const personnel = readCompanyAppData(db, "personnelData", []);
  const partners = readCompanyAppData(db, "externalPartners", []);
  const suppliers = readCompanyAppData(db, "suppliers", []);
  const projects = flattenProjects(readCompanyAppData(db, "projectBoardData", []));
  return { projects, entities: buildCompanyEntityIndex({ personnel, partners, suppliers, glossary }) };
}

function publicResponsible(entity, matchType = "existing", confidence = 1) {
  return {
    entityId: entity.entityId,
    entityType: entity.entityType,
    name: entity.name,
    ...(entity.organizationId ? { organizationId: entity.organizationId } : {}),
    ...(entity.organizationName ? { organizationName: entity.organizationName } : {}),
    ...(entity.contactEntityId ? { contactEntityId: entity.contactEntityId } : {}),
    ...(entity.contactName ? { contactName: entity.contactName } : {}),
    matchType,
    confidence,
    notificationEligible: Boolean(entity.notificationEligible),
  };
}

export function matchResponsibleEntity(reference, entities = [], context = {}) {
  const rawName = String(reference?.name || reference?.entityName || reference || "").trim();
  const requestedId = String(reference?.entityId || "");
  if (!rawName && !requestedId) return [];
  const exact = entities.filter((entity) => requestedId && entity.entityId === requestedId || normalize(entity.name) === normalize(rawName));
  if (exact.length === 1) return [publicResponsible(exact[0], "existing", 1)];
  if (exact.length > 1) return exact.map((entity) => publicResponsible(entity, "ambiguous", 0.5));
  const aliases = entities.filter((entity) => (entity.aliases || []).some((alias) => normalize(alias) === normalize(rawName)));
  if (aliases.length === 1) return [publicResponsible(aliases[0], "existing", 0.92)];
  if (aliases.length > 1) return aliases.map((entity) => publicResponsible(entity, "ambiguous", 0.5));
  const requestedProjectId = String(context.projectId || reference?.projectId || "");
  const requestedProjectName = normalize(context.projectName || reference?.projectName || "");
  const contextual = entities.filter((entity) => {
    const projectMatch = (requestedProjectId && (entity.projectIds || []).map(String).includes(requestedProjectId))
      || (requestedProjectName && (entity.projectNames || []).some((name) => normalize(name) === requestedProjectName));
    if (!projectMatch) return false;
    const needle = normalize(rawName);
    return [entity.name, entity.role, entity.contactName, ...(entity.aliases || [])]
      .filter(Boolean)
      .some((value) => normalize(value).includes(needle) || needle.includes(normalize(value)));
  });
  if (contextual.length === 1) return [publicResponsible(contextual[0], "existing", 0.78)];
  if (contextual.length > 1) return contextual.map((entity) => publicResponsible(entity, "ambiguous", 0.45));
  if (!rawName) return [];
  const entityType = organizationLike(rawName) ? "external_organization" : "external_person";
  const entityId = `pending:${crypto.createHash("sha1").update(`${entityType}:${rawName}`).digest("hex").slice(0, 16)}`;
  return [{ entityId, entityType, name: rawName, matchType: "pending", confidence: 0.35, notificationEligible: false }];
}

export function resolveResponsibleEntities(references = [], entities = [], context = {}) {
  const resolved = references.flatMap((reference) => matchResponsibleEntity(reference, entities, context));
  const seen = new Set();
  return resolved.filter((item) => { const key = `${item.entityId}:${item.matchType}`; if (seen.has(key)) return false; seen.add(key); return true; });
}
