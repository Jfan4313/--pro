export type MaterialSourceType = "project" | "purchase" | "other";

export interface InboundMaterialForm {
  sourceType: MaterialSourceType;
  sourceProject: string;
  name: string;
  spec: string;
  quantity: string;
  unit: string;
  location: string;
  supplier: string;
  type: string;
  inboundAt: string;
  photos: string[];
  remark: string;
}

export interface OutboundMaterialForm {
  items: Array<{
    id: string;
    materialId: string;
    quantity: string;
    batch: string;
  }>;
  destinationProject: string;
  receiver: string;
  outboundAt: string;
  photos: string[];
  remark: string;
}

function currentLocalDateTime() {
  return new Date().toISOString().slice(0, 16);
}

export function createEmptyInboundForm(selectedProject: string): InboundMaterialForm {
  return {
    sourceType: "project",
    sourceProject: selectedProject !== "全部项目" ? selectedProject : "",
    name: "",
    spec: "",
    quantity: "",
    unit: "",
    location: "",
    supplier: "",
    type: "",
    inboundAt: currentLocalDateTime(),
    photos: [],
    remark: "",
  };
}

export function createEmptyOutboundForm(): OutboundMaterialForm {
  return {
    items: [{ id: `line-${Date.now()}`, materialId: "", quantity: "", batch: "" }],
    destinationProject: "",
    receiver: "",
    outboundAt: currentLocalDateTime(),
    photos: [],
    remark: "",
  };
}
