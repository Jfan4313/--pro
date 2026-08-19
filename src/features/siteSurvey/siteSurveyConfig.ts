import { formatLocalDate } from "@/src/lib/management";
import type { PhotoCategory, SurveyForm, SurveyPhoto, SurveyRecord } from "./types";

export const CURRENT_DRAFT_KEY = "site-survey-current-draft";
export const PENDING_SURVEYS_RESOURCE = "site-survey-pending-uploads";
export const MAX_SURVEY_PHOTOS = 30;

export const PROJECT_TYPES = ["绿色建筑", "市政景观", "储能系统", "智能微电网", "光伏发电", "风力发电", "综合能源"];

export const ROOM_TYPES = [
  { id: "high-voltage", label: "高压电房" },
  { id: "low-voltage", label: "低压电房" },
];

export const photoCategoryGroups: Array<{ name: string; categories: PhotoCategory[] }> = [
  {
    name: "现场与结构",
    categories: [
      { id: "site-overview", label: "现场全景", hint: "建筑外观及周边环境" },
      { id: "building-structure", label: "建筑结构", hint: "墙体、楼板、门窗与基础" },
      { id: "access-route", label: "进场通道", hint: "车辆道路、吊装及搬运路线" },
      { id: "room-layout", label: "空间布局", hint: "电房尺寸、通道与设备位置" },
    ],
  },
  {
    name: "电房内部与设备",
    categories: [
      { id: "room-overview", label: "电房内部", hint: "室内整体环境与设备分布" },
      { id: "high-voltage-cabinet", label: "高压柜", hint: "柜体正面、内部及状态" },
      { id: "low-voltage-cabinet", label: "低压柜", hint: "柜体、开关及母排" },
      { id: "metering-cabinet", label: "计量/仪表柜", hint: "仪表、计量装置及读数" },
      { id: "wiring-diagram", label: "仪表接线图", hint: "二次接线、图纸与端子" },
      { id: "transformer", label: "变压器", hint: "本体、铭牌、进出线及温控" },
      { id: "cable-system", label: "电缆沟/桥架", hint: "电缆走向、沟槽及桥架" },
      { id: "grounding-safety", label: "接地与安全", hint: "接地、消防及安全设施" },
      { id: "nameplate", label: "设备铭牌", hint: "型号、参数与设备细节" },
      { id: "other", label: "其他", hint: "其他需要补充的现场信息" },
    ],
  },
];

export const photoCategories = photoCategoryGroups.flatMap((group) =>
  group.categories.map((category) => ({ ...category, group: group.name })),
);

export const emptyForm: SurveyForm = {
  projectId: "",
  surveyDate: formatLocalDate(),
  surveyor: "项目经理",
  surveyScope: "electrical",
  roomId: "",
  roomType: "high-voltage",
  roomName: "",
  address: "",
  voltageLevel: "10kV",
  transformerCapacity: "",
  meterPosition: "",
  accessCondition: "车辆可达",
  networkSignal: "良好",
  notes: "",
  materialsToCollect: "12个月电费单\n产权证\n村委同意书\n村物业租赁合同",
  nextSteps: "了解业主屋面建设需求\n评估折扣电价",
};

export function getRoomTypeLabel(roomType?: string) {
  return ROOM_TYPES.find((type) => type.id === roomType)?.label || "未分类电房";
}

export function getSurveySubject(record: Pick<SurveyRecord, "surveyScope" | "roomType" | "roomName">) {
  return record.surveyScope === "building" || record.roomType === "building-structure"
    ? `天面/建筑结构 · ${record.roomName || "未命名区域"}`
    : `${getRoomTypeLabel(record.roomType)} · ${record.roomName || "未命名电房"}`;
}

export function getPhotoCategory(categoryId?: string) {
  return photoCategories.find((category) => category.id === categoryId)
    || { id: "other", label: "其他/未分类", hint: "历史照片或其他现场信息", group: "其他" };
}

export function getPhotoCategoryCount(photos: Array<Pick<SurveyPhoto, "category">>) {
  return new Set(photos.map((photo) => getPhotoCategory(photo.category).id)).size;
}
