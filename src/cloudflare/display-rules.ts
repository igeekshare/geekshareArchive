export const DISPLAY_BLOCK_RULE_TYPES = ["tag", "keyword"] as const;

export type DisplayBlockRuleType = (typeof DISPLAY_BLOCK_RULE_TYPES)[number];

export type NormalizedDisplayBlockRule = {
  type: DisplayBlockRuleType;
  value: string;
  normalizedValue: string;
};

export function normalizeDisplayBlockRule(
  type: unknown,
  value: unknown,
):
  | { ok: true; rule: NormalizedDisplayBlockRule }
  | { ok: false; error: string } {
  if (type !== "tag" && type !== "keyword") {
    return { ok: false, error: "规则类型无效" };
  }
  if (typeof value !== "string") {
    return { ok: false, error: type === "tag" ? "标签必须是字符串" : "关键词必须是字符串" };
  }

  if (type === "tag") {
    const normalized = value.trim().replace(/^#+/, "").toLocaleLowerCase();
    if (!normalized || [...normalized].length > 64 || !/^[\p{L}\p{N}_-]+$/u.test(normalized)) {
      return { ok: false, error: "标签需为 1–64 个汉字、字母、数字、下划线或连字符" };
    }
    return {
      ok: true,
      rule: { type, value: normalized, normalizedValue: normalized },
    };
  }

  const trimmed = value.trim();
  if (!trimmed) return { ok: false, error: "关键词不能为空" };
  if ([...trimmed].length > 100) return { ok: false, error: "关键词最多 100 个字符" };
  return {
    ok: true,
    rule: {
      type,
      value: trimmed,
      normalizedValue: trimmed.toLocaleLowerCase(),
    },
  };
}

export function displayRuleMatchesMessage(
  ruleAlias = "display_rule",
  messageAlias = "m",
): string {
  return `((${ruleAlias}.type = 'tag' AND EXISTS (
    SELECT 1 FROM message_tags display_rule_tag
    WHERE display_rule_tag.message_id = ${messageAlias}.id
      AND display_rule_tag.tag = ${ruleAlias}.normalized_value
  )) OR (${ruleAlias}.type = 'keyword'
    AND instr(lower(${messageAlias}.plain_text), ${ruleAlias}.normalized_value) > 0))`;
}

export function publicMessageVisibilityClause(messageAlias = "m"): string {
  return `${messageAlias}.status = 'published' AND NOT EXISTS (
    SELECT 1 FROM display_block_rules display_rule
    WHERE ${displayRuleMatchesMessage("display_rule", messageAlias)}
  )`;
}
