export interface SurveyPhoto {
  id: string;
  name: string;
  url: string;
  createdAt: string;
  category?: string;
  categoryLabel?: string;
  categoryGroup?: string;
}

export interface SurveyRecord {
  id?: string;
  projectId: string;
  projectName: string;
  surveyDate: string;
  surveyor: string;
  surveyScope: "building" | "electrical";
  roomId: string;
  roomType: string;
  roomName: string;
  address: string;
  voltageLevel: string;
  transformerCapacity: string;
  meterPosition: string;
  accessCondition: string;
  networkSignal: string;
  notes: string;
  photos: SurveyPhoto[];
  status: "completed" | "pending";
  createdAt: string;
}

export interface DraftPhoto {
  id: string;
  name: string;
  preview: string;
  category: string;
}

export interface SurveyForm {
  projectId: string;
  surveyDate: string;
  surveyor: string;
  surveyScope: "building" | "electrical";
  roomId: string;
  roomType: string;
  roomName: string;
  address: string;
  voltageLevel: string;
  transformerCapacity: string;
  meterPosition: string;
  accessCondition: string;
  networkSignal: string;
  notes: string;
}

export interface PendingSurveyPhoto {
  id: string;
  name: string;
  dataUrl: string;
  category: string;
  uploaded?: SurveyPhoto;
}

export interface PendingSurvey {
  id: string;
  form: SurveyForm;
  projectName: string;
  createdAt: string;
  photos: PendingSurveyPhoto[];
}

export interface SurveyRoom {
  id: string;
  name: string;
  type: string;
}

export interface PhotoCategory {
  id: string;
  label: string;
  hint: string;
}
