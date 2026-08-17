export type RiskAction = "complete" | "deadline" | "train" | "delivered" | "create-contract" | "assign";

export const RISK_FOCUS_EVENT = "focus-risk";

export function dispatchRiskFocus(risk: any, action?: RiskAction) {
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent(RISK_FOCUS_EVENT, {
      detail: action ? { ...risk, action } : risk,
    }));
  }, 0);
}

export function getRiskQuickActions(risk: any): RiskAction[] {
  const actions: RiskAction[] = [];
  if (risk?.taskId) {
    actions.push("deadline");
    if (risk.type === "任务逾期") actions.push("complete");
  }
  if (risk?.personId) actions.push("train");
  if (risk?.orderId) actions.push("delivered");
  if (risk?.type === "合同缺失") actions.push("create-contract");
  return actions;
}

export const RISK_ACTION_LABELS: Record<RiskAction, string> = {
  complete: "标记完成",
  deadline: "调整截止日期",
  train: "标记已培训",
  delivered: "标记已到货",
  "create-contract": "新建合同",
  assign: "指派负责人",
};
