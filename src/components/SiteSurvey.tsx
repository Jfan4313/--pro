import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { ArrowLeft, Building2, Camera, CheckCircle2, Clock3, Cloud, CloudOff, Edit2, FileDown, FileImage, ImagePlus, Loader2, MapPin, Merge, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { apiClient } from "@/src/lib/apiClient";
import { useEntityList } from "@/src/hooks/useEntityList";
import { useSyncedAppData } from "@/src/hooks/useSyncedAppData";
import { useProjectBoardData } from "@/src/hooks/useProjectBoardData";
import { useProjectNumbering } from "@/src/hooks/useProjectNumbering";
import { flattenProjects } from "@/src/lib/management";
import { sortProjectsNaturally } from "@/src/lib/projectNumbering";
import { offlineDb } from "@/src/lib/offlineDb";
import { queueEntityOperation } from "@/src/lib/syncEngine";
import { STAGES } from "./ProjectLifecycle";
import {
  CURRENT_DRAFT_KEY,
  MAX_SURVEY_PHOTOS,
  PENDING_SURVEYS_RESOURCE,
  PROJECT_TYPES,
  ROOM_TYPES,
  emptyForm,
  getPhotoCategory,
  getPhotoCategoryCount,
  getRoomTypeLabel,
  getSurveySubject,
  photoCategories,
  photoCategoryGroups,
} from "@/src/features/siteSurvey/siteSurveyConfig";
import { fileToDataUrl, isStorageQuotaError, pendingToRecord, uploadedUrl } from "@/src/features/siteSurvey/siteSurveyUtils";
import { compressPhoto } from "@/src/features/siteSurvey/photoProcessing";
import type { DraftPhoto, PendingSurvey, SurveyForm, SurveyPhoto, SurveyRecord, SurveyRoom } from "@/src/features/siteSurvey/types";

export function SiteSurvey({ onBack, initialProjectId = null }: { onBack: () => void; initialProjectId?: string | null }) {
  const [boardData, setBoardData, , boardSeed] = useProjectBoardData();
  const projects = useMemo(() => sortProjectsNaturally(flattenProjects(boardData)), [boardData]);
  const { reserveProjectNumber } = useProjectNumbering();
  const { data: records, deleteDocument } = useEntityList<SurveyRecord>("site-surveys", []);
  const [form, setForm] = useState(emptyForm);
  const [draftPhotos, setDraftPhotos] = useState<DraftPhoto[]>([]);
  const [pendingSurveys, setPendingSurveys] = useState<PendingSurvey[]>([]);
  const [recentlySavedRecords, setRecentlySavedRecords] = useState<SurveyRecord[]>([]);
  const [activePhotoCategory, setActivePhotoCategory] = useState("room-overview");
  const [photoViewCategory, setPhotoViewCategory] = useState("all");
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<SurveyRecord | null>(null);
  const [selectedArchiveIds, setSelectedArchiveIds] = useState<string[]>([]);
  const [removedRecordIds, setRemovedRecordIds] = useState<string[]>([]);
  const [editingRecord, setEditingRecord] = useState<SurveyRecord | null>(null);
  const [retainedPhotos, setRetainedPhotos] = useState<SurveyPhoto[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [cameraFlash, setCameraFlash] = useState(false);
  const [captureNotice, setCaptureNotice] = useState("");
  const [isCapturing, setIsCapturing] = useState(false);
  const [isProcessingPhotos, setIsProcessingPhotos] = useState(false);
  const [storageWarning, setStorageWarning] = useState("");
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [newProject, setNewProject] = useState({ name: "", type: "光伏发电" });
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [roomBeingEdited, setRoomBeingEdited] = useState<SurveyRoom | null>(null);
  const [newRoom, setNewRoom] = useState({ name: "", type: "high-voltage" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const syncInProgressRef = useRef(false);

  const allRecords = useMemo(() => {
    const pendingRecords = pendingSurveys.map(pendingToRecord);
    const preferredRecords = [...pendingRecords, ...recentlySavedRecords, ...records];
    const seen = new Set<string>();
    return preferredRecords.filter((record) => {
      const id = String(record.id || "");
      if (!id || seen.has(id) || removedRecordIds.includes(id)) return false;
      seen.add(id);
      return true;
    });
  }, [pendingSurveys, recentlySavedRecords, records, removedRecordIds]);
  const selectedProject = useMemo(
    () => projects.find((project: any) => project.id === form.projectId),
    [form.projectId, projects],
  );
  const selectedProjectRecords = useMemo(
    () => allRecords.filter((record) => record.projectId === form.projectId),
    [allRecords, form.projectId],
  );
  const projectRooms = useMemo(() => {
    const registered = Array.isArray((selectedProject as any)?.surveyRooms) ? (selectedProject as any).surveyRooms : [];
    const fromRecords = selectedProjectRecords.filter((record) => record.roomName).map((record) => ({
      id: record.roomId || `legacy-${record.roomType || "unknown"}-${record.roomName}`,
      name: record.roomName,
      type: record.roomType || "high-voltage",
    }));
    const seen = new Set<string>();
    return [...registered, ...fromRecords].filter((room: SurveyRoom) => {
      const key = room.id || `${room.type}:${room.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [selectedProject, selectedProjectRecords]);
  const availablePhotoCategoryGroups = form.surveyScope === "building" ? [photoCategoryGroups[0]] : [photoCategoryGroups[1]];
  const availablePhotoCategories = availablePhotoCategoryGroups.flatMap((group) => group.categories);
  const availablePhotoCategoryIds = new Set(availablePhotoCategories.map((category) => category.id));
  const capturedPhotoCategories = useMemo(() => photoCategories.map((category) => ({
    ...category,
    count: draftPhotos.filter((photo) => photo.category === category.id).length + retainedPhotos.filter((photo) => getPhotoCategory(photo.category).id === category.id).length,
  })).filter((category) => category.count > 0 && availablePhotoCategoryIds.has(category.id)), [draftPhotos, retainedPhotos, form.surveyScope]);

  const syncPendingSurveys = useCallback(async (source?: PendingSurvey[]) => {
    if (!navigator.onLine || syncInProgressRef.current) return;
    syncInProgressRef.current = true;
    setIsSyncing(true);
    let remaining = source || await offlineDb.listEntities<PendingSurvey>(PENDING_SURVEYS_RESOURCE);
    let syncFailed = false;

    try {
      for (const pending of [...remaining]) {
        let working = pending;
        for (let index = 0; index < working.photos.length; index += 1) {
          const photo = working.photos[index];
          if (photo.uploaded) continue;
          const category = getPhotoCategory(photo.category);
          const uploaded = await apiClient.uploadFile(
            `survey-${working.form.projectId}-${category.id}-${Date.now()}-${photo.name}`,
            photo.dataUrl.split(",")[1] || photo.dataUrl,
          );
          const uploadedPhoto: SurveyPhoto = {
            id: uploaded.id,
            name: photo.name,
            url: uploaded.url,
            createdAt: uploaded.createdAt,
            category: category.id,
            categoryLabel: category.label,
            categoryGroup: category.group,
          };
          working = { ...working, photos: working.photos.map((item, photoIndex) => photoIndex === index ? { ...item, uploaded: uploadedPhoto } : item) };
          remaining = remaining.map((item) => item.id === working.id ? working : item);
          await offlineDb.putEntity(PENDING_SURVEYS_RESOURCE, working);
          setPendingSurveys((current) => current.map((item) => item.id === working.id ? working : item));
        }

        await queueEntityOperation("site-surveys", "upsert", {
          id: working.id,
          ...working.form,
          projectName: working.projectName,
          photos: working.photos.map((photo) => photo.uploaded),
          status: "completed",
          createdAt: working.createdAt,
        });
        remaining = remaining.filter((item) => item.id !== working.id);
        await offlineDb.deleteEntity(PENDING_SURVEYS_RESOURCE, working.id);
        setPendingSurveys((current) => current.filter((item) => item.id !== working.id));
      }
      if (source?.length) window.dispatchEvent(new CustomEvent("show-toast", { detail: "现场勘察已同步到云端" }));
    } catch {
      syncFailed = true;
      setIsOnline(navigator.onLine);
    } finally {
      syncInProgressRef.current = false;
      setIsSyncing(false);
      if (!syncFailed) {
        const newlyQueued = await offlineDb.listEntities<PendingSurvey>(PENDING_SURVEYS_RESOURCE);
        if (newlyQueued.length) queueMicrotask(() => void syncPendingSurveys(newlyQueued));
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      offlineDb.getAppData<{ form: SurveyForm; photos: DraftPhoto[]; activeCategory?: string; editingRecord?: SurveyRecord | null; retainedPhotos?: SurveyPhoto[] }>(CURRENT_DRAFT_KEY),
      offlineDb.listEntities<PendingSurvey>(PENDING_SURVEYS_RESOURCE),
    ]).then(([savedDraft, savedPending]) => {
      if (cancelled) return;
      const pendingPhotoIds = new Set((savedPending || []).flatMap((pending) => pending.photos.map((photo) => photo.id)));
      const draftPhotosWithoutDuplicates = (savedDraft?.photos || []).filter((photo) => !pendingPhotoIds.has(photo.id));
      const removedDuplicatePhotos = (savedDraft?.photos?.length || 0) - draftPhotosWithoutDuplicates.length;
      if (savedDraft?.form && (draftPhotosWithoutDuplicates.length > 0 || removedDuplicatePhotos === 0)) setForm({ ...emptyForm, ...savedDraft.form });
      if (draftPhotosWithoutDuplicates.length) setDraftPhotos(draftPhotosWithoutDuplicates);
      if (savedDraft?.activeCategory) setActivePhotoCategory(savedDraft.activeCategory);
      if (savedDraft?.editingRecord?.id) setEditingRecord(savedDraft.editingRecord);
      if (savedDraft?.retainedPhotos?.length) setRetainedPhotos(savedDraft.retainedPhotos);
      if (removedDuplicatePhotos > 0) {
        if (draftPhotosWithoutDuplicates.length) {
          void offlineDb.putAppData(CURRENT_DRAFT_KEY, { ...savedDraft, photos: draftPhotosWithoutDuplicates });
        } else {
          void offlineDb.deleteAppData(CURRENT_DRAFT_KEY);
        }
      }
      setPendingSurveys(savedPending || []);
      setDraftLoaded(true);
      if (navigator.onLine && savedPending?.length) void syncPendingSurveys(savedPending);
    });

    const handleOnline = () => {
      setIsOnline(true);
      void syncPendingSurveys();
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [syncPendingSurveys]);

  useEffect(() => {
    if (!draftLoaded) return;
    const timer = window.setTimeout(() => {
      void offlineDb.putAppData(CURRENT_DRAFT_KEY, { form, photos: draftPhotos, activeCategory: activePhotoCategory, editingRecord, retainedPhotos })
        .then(() => setStorageWarning(""))
        .catch((error) => setStorageWarning(isStorageQuotaError(error) ? "浏览器分配给本系统的本地空间不足，请先保存并同步已有记录" : "草稿暂时无法写入本机"));
    }, 450);
    return () => window.clearTimeout(timer);
  }, [activePhotoCategory, draftLoaded, draftPhotos, editingRecord, form, retainedPhotos]);

  useEffect(() => {
    if (!form.projectId && projects[0]?.id) setForm((current) => ({ ...current, projectId: projects[0].id }));
  }, [projects, form.projectId]);

  useEffect(() => {
    if (!draftLoaded || !initialProjectId || draftPhotos.length > 0 || form.roomName || form.address || form.notes) return;
    setForm((current) => ({ ...current, projectId: initialProjectId }));
  }, [draftLoaded, draftPhotos.length, form.address, form.notes, form.roomName, initialProjectId]);

  const addPhotos = async (files: File[]) => {
    if (!files.length) return;
    setIsProcessingPhotos(true);
    const remaining = Math.max(0, MAX_SURVEY_PHOTOS - draftPhotos.length - retainedPhotos.length);
    const selected = files.slice(0, remaining);
    try {
      const results = await Promise.allSettled(selected.map(async (file): Promise<DraftPhoto> => {
        const compressed = await compressPhoto(file);
        let preview = "";
        try {
          preview = await fileToDataUrl(compressed);
        } catch {
          preview = await fileToDataUrl(file);
        }
        if (!preview.startsWith("data:image/")) throw new Error("invalid_image");
        return {
          id: globalThis.crypto?.randomUUID?.() || `photo-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          name: compressed.name || file.name || `现场照片-${Date.now()}.jpg`,
          preview,
          category: activePhotoCategory,
        };
      }));
      const prepared: DraftPhoto[] = [];
      for (const result of results) {
        if (result.status === "fulfilled") prepared.push(result.value);
      }
      if (prepared.length) {
        setDraftPhotos((current) => [...current, ...prepared].slice(0, MAX_SURVEY_PHOTOS));
        window.dispatchEvent(new CustomEvent("show-toast", { detail: `已添加 ${prepared.length} 张照片` }));
      }
      if (prepared.length !== selected.length) {
        window.dispatchEvent(new CustomEvent("show-toast", { detail: `${selected.length - prepared.length} 张照片无法读取，请改用拍照或 JPEG 格式` }));
      }
    } finally {
      setIsProcessingPhotos(false);
    }
  };

  const handlePhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      await addPhotos(Array.from(files));
    } catch {
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "照片处理失败，请重新拍摄" }));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (galleryInputRef.current) galleryInputRef.current.value = "";
    }
  };

  const closeCamera = useCallback(() => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    setCameraFlash(false);
    setCaptureNotice("");
    setIsCapturing(false);
    setCameraOpen(false);
    setCameraError("");
  }, []);

  useEffect(() => () => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
  }, []);

  useEffect(() => {
    if (!cameraOpen || !videoRef.current || !cameraStreamRef.current) return;
    videoRef.current.srcObject = cameraStreamRef.current;
    void videoRef.current.play().catch(() => setCameraError("摄像头画面无法播放，请改用系统相机"));
  }, [cameraOpen]);

  const openCamera = async () => {
    setCameraError("");
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      window.dispatchEvent(new CustomEvent("show-toast", {
        detail: window.isSecureContext ? "当前浏览器不支持实时相机，已切换到系统相机" : "实时相机需要 HTTPS，已切换到系统相机",
      }));
      fileInputRef.current?.click();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      cameraStreamRef.current = stream;
      setCameraOpen(true);
    } catch (error: any) {
      const denied = error?.name === "NotAllowedError" || error?.name === "SecurityError";
      setCameraError(denied ? "未获得摄像头权限，请在浏览器设置中允许访问" : "摄像头暂时不可用，请改用系统相机");
      window.dispatchEvent(new CustomEvent("show-toast", { detail: denied ? "请允许浏览器使用摄像头" : "摄像头打开失败，已切换到系统相机" }));
      fileInputRef.current?.click();
    }
  };

  const playShutterSound = () => {
    try {
      const AudioContextConstructor = window.AudioContext
        || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextConstructor) return;

      const audioContext = new AudioContextConstructor();
      const startedAt = audioContext.currentTime;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(1050, startedAt);
      oscillator.frequency.exponentialRampToValueAtTime(180, startedAt + 0.075);
      gain.gain.setValueAtTime(0.0001, startedAt);
      gain.gain.exponentialRampToValueAtTime(0.2, startedAt + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + 0.09);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(startedAt);
      oscillator.stop(startedAt + 0.1);
      void audioContext.resume().catch(() => undefined);
      window.setTimeout(() => void audioContext.close().catch(() => undefined), 220);
    } catch {
      // 部分手机在静音或省电模式下会禁止声音，闪屏和提示仍会正常显示。
    }
  };

  const triggerCaptureEffects = (categoryLabel: string) => {
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);

    setCameraFlash(true);
    setCaptureNotice(`已拍摄 · ${categoryLabel}`);
    playShutterSound();
    navigator.vibrate?.(35);

    flashTimerRef.current = window.setTimeout(() => setCameraFlash(false), 140);
    noticeTimerRef.current = window.setTimeout(() => setCaptureNotice(""), 1300);
  };

  const capturePhoto = async () => {
    if (isCapturing) return;
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) {
      setCameraError("摄像头画面还未准备好，请稍后再拍");
      return;
    }
    if (draftPhotos.length + retainedPhotos.length >= MAX_SURVEY_PHOTOS) {
      setCameraError(`最多可保存 ${MAX_SURVEY_PHOTOS} 张照片`);
      return;
    }
    const category = getPhotoCategory(activePhotoCategory);
    setIsCapturing(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      triggerCaptureEffects(category.label);

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (!blob) {
        setCameraError("照片生成失败，请重新拍摄");
        return;
      }
      const file = new File([blob], `${category.id}-${Date.now()}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
      await addPhotos([file]);
      setCameraError("");
      window.dispatchEvent(new CustomEvent("show-toast", { detail: `已保存到本机：${category.label}` }));
    } finally {
      setIsCapturing(false);
    }
  };

  const openProjectModal = () => {
    setNewProject({ name: "", type: "光伏发电" });
    setIsProjectModalOpen(true);
  };

  const createProject = async (event: FormEvent) => {
    event.preventDefault();
    const name = newProject.name.trim();
    if (!name) return;
    if (projects.some((project: any) => String(project.name).trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "项目名称已存在，请直接从列表选择" }));
      return;
    }

    const project = {
      id: globalThis.crypto?.randomUUID?.() || `p${Date.now()}`,
      projectNumber: await reserveProjectNumber(),
      name,
      type: newProject.type,
      manager: "待确定",
      dueDate: "",
      constructProgress: 0,
      supplyProgress: 0,
      status: "normal",
    };

    setBoardData((current: any) => {
      const source = Array.isArray(current) && current.length > 0 ? current : boardSeed;
      const next = source.map((column: any) => ({ ...column, projects: [...(column.projects || [])] }));
      let firstStageIndex = next.findIndex((column: any) => column.id === STAGES[0].id);
      if (firstStageIndex < 0) firstStageIndex = 0;
      if (!next[firstStageIndex]) return source;
      next[firstStageIndex].projects = sortProjectsNaturally([project, ...next[firstStageIndex].projects]);
      next[firstStageIndex].count = next[firstStageIndex].projects.length;
      return next;
    });

    setForm((current) => ({ ...current, projectId: project.id }));
    setIsProjectModalOpen(false);
    void apiClient.initProjectFolders(project.id, { project, stages: [STAGES[0]] }).catch(() => undefined);
    window.dispatchEvent(new CustomEvent("show-toast", { detail: "项目已创建并选中，可以开始现场勘察" }));
  };

  const openRoomModal = () => {
    if (!form.projectId) {
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "请先选择或新增项目" }));
      return;
    }
    setRoomBeingEdited(null);
    setNewRoom({ name: "", type: "high-voltage" });
    setIsRoomModalOpen(true);
  };

  const openRoomRenameModal = () => {
    const room = projectRooms.find((item: SurveyRoom) => item.id === form.roomId);
    if (!room) {
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "请先选择要修正名称的电房" }));
      return;
    }
    setRoomBeingEdited(room);
    setNewRoom({ name: room.name, type: room.type });
    setIsRoomModalOpen(true);
  };

  const clearSubjectFields = (current: SurveyForm, overrides: Partial<SurveyForm> = {}): SurveyForm => ({
    ...current,
    address: "",
    voltageLevel: emptyForm.voltageLevel,
    transformerCapacity: "",
    meterPosition: "",
    accessCondition: emptyForm.accessCondition,
    networkSignal: emptyForm.networkSignal,
    notes: "",
    ...overrides,
  });

  const selectProject = (projectId: string) => {
    if (projectId !== form.projectId && draftPhotos.length > 0) {
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "当前已有未保存照片，请先保存当前记录后再切换项目" }));
      return;
    }
    if (projectId !== form.projectId && (editingRecord || retainedPhotos.length > 0)) {
      setEditingRecord(null);
      setRetainedPhotos([]);
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "已结束原记录调整，切换后的内容将作为新勘察记录保存，原照片保持不变" }));
    }
    setForm((current) => clearSubjectFields(current, { projectId, roomId: "", roomName: "" }));
  };

  const createRoom = (event: FormEvent) => {
    event.preventDefault();
    const name = newRoom.name.trim();
    if (!name) return;
    if (projectRooms.some((room: SurveyRoom) => room.type === newRoom.type && room.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "该电房已存在，请直接选择" }));
      return;
    }
    const room: SurveyRoom = {
      id: globalThis.crypto?.randomUUID?.() || `room-${Date.now()}`,
      name,
      type: newRoom.type,
    };
    setBoardData((current: any) => (Array.isArray(current) ? current.map((column: any) => ({
      ...column,
      projects: (column.projects || []).map((project: any) => project.id === form.projectId
        ? { ...project, surveyRooms: [...(project.surveyRooms || []), room] }
        : project),
    })) : current));
    setForm((current) => clearSubjectFields(current, { surveyScope: "electrical", roomId: room.id, roomName: room.name, roomType: room.type }));
    setActivePhotoCategory("room-overview");
    setPhotoViewCategory("all");
    setIsRoomModalOpen(false);
    window.dispatchEvent(new CustomEvent("show-toast", { detail: `${getRoomTypeLabel(room.type)}“${room.name}”已新增并选中` }));
  };

  const renameRoom = async (event: FormEvent) => {
    event.preventDefault();
    if (!roomBeingEdited) return;
    const name = newRoom.name.trim();
    if (!name) return;
    if (projectRooms.some((room: SurveyRoom) => room.id !== roomBeingEdited.id && room.type === newRoom.type && room.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "该电房名称已存在，请换一个名称" }));
      return;
    }

    const updatedRoom = { ...roomBeingEdited, name, type: newRoom.type };
    await setBoardData((current: any) => (Array.isArray(current) ? current.map((column: any) => ({
      ...column,
      projects: (column.projects || []).map((project: any) => {
        if (project.id !== form.projectId) return project;
        const rooms = Array.isArray(project.surveyRooms) ? project.surveyRooms : [];
        const exists = rooms.some((room: SurveyRoom) => room.id === updatedRoom.id);
        return { ...project, surveyRooms: exists ? rooms.map((room: SurveyRoom) => room.id === updatedRoom.id ? updatedRoom : room) : [...rooms, updatedRoom] };
      }),
    })) : current));

    const matchingRecords = allRecords.filter((record) => record.projectId === form.projectId && (record.roomId || `legacy-${record.roomType || "unknown"}-${record.roomName}`) === updatedRoom.id);
    const matchingRecordIds = new Set(matchingRecords.map((record) => String(record.id)));
    const updatedPending = pendingSurveys.map((pending) => matchingRecordIds.has(String(pending.id))
      ? { ...pending, form: { ...pending.form, roomName: name, roomType: updatedRoom.type } }
      : pending);
    for (const pending of updatedPending) {
      if (pending !== pendingSurveys.find((item) => item.id === pending.id)) await offlineDb.putEntity(PENDING_SURVEYS_RESOURCE, pending);
    }
    setPendingSurveys(updatedPending);

    for (const record of matchingRecords.filter((item) => item.status !== "pending" && item.id)) {
      const updatedRecord = { ...record, roomName: name, roomType: updatedRoom.type };
      await queueEntityOperation("site-surveys", "upsert", updatedRecord);
      setRecentlySavedRecords((current) => current.map((item) => item.id === updatedRecord.id ? updatedRecord : item));
      setSelectedRecord((current) => current?.id === updatedRecord.id ? updatedRecord : current);
      setEditingRecord((current) => current?.id === updatedRecord.id ? updatedRecord : current);
    }
    if (form.roomId === updatedRoom.id) setForm((current) => ({ ...current, roomName: name, roomType: updatedRoom.type }));
    setIsRoomModalOpen(false);
    setRoomBeingEdited(null);
    window.dispatchEvent(new CustomEvent("show-toast", { detail: `电房名称已修正为“${name}”，历史记录保持原照片归属` }));
  };

  const selectSurveyScope = (scope: "building" | "electrical") => {
    if (scope === form.surveyScope) return;
    if (draftPhotos.length > 0) {
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "当前已有未保存照片，请先保存当前记录后再切换勘察类型" }));
      return;
    }
    if (editingRecord || retainedPhotos.length > 0) {
      setEditingRecord(null);
      setRetainedPhotos([]);
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "已结束原记录调整，切换后的内容将作为新勘察记录保存，原照片保持不变" }));
    }
    setForm((current) => clearSubjectFields(current, {
      surveyScope: scope,
      roomId: "",
      roomName: "",
      roomType: scope === "building" ? "building-structure" : "high-voltage",
    }));
    setActivePhotoCategory(scope === "building" ? "site-overview" : "room-overview");
    setPhotoViewCategory("all");
  };

  const selectRoom = (roomId: string) => {
    if (draftPhotos.length > 0 && roomId !== form.roomId) {
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "当前电房已有未保存照片，请先保存后再切换电房" }));
      return;
    }
    const room = projectRooms.find((item: SurveyRoom) => item.id === roomId);
    if (roomId !== form.roomId && (editingRecord || retainedPhotos.length > 0)) {
      // Photos retained while editing belong to the old room. Never reuse the
      // old record id after changing rooms, otherwise the save updates the old
      // room and effectively moves its photos to the new room.
      setEditingRecord(null);
      setRetainedPhotos([]);
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "已切换电房，当前内容将作为新记录保存，原电房照片保持不变" }));
    }
    setForm((current) => clearSubjectFields(current, { roomId: room?.id || "", roomName: room?.name || "", roomType: room?.type || "high-voltage" }));
  };

  const editSurveyRecord = (record: SurveyRecord) => {
    const surveyScope = record.surveyScope || (record.roomType === "building-structure" ? "building" : "electrical");
    const roomId = surveyScope === "electrical"
      ? record.roomId || `legacy-${record.roomType || "unknown"}-${record.roomName}`
      : "";
    setEditingRecord(record);
    setRetainedPhotos(record.photos || []);
    setDraftPhotos([]);
    setForm({
      ...emptyForm,
      projectId: record.projectId,
      surveyDate: record.surveyDate,
      surveyor: record.surveyor,
      surveyScope,
      roomId,
      roomType: surveyScope === "building" ? "building-structure" : record.roomType || "high-voltage",
      roomName: record.roomName,
      address: record.address,
      voltageLevel: record.voltageLevel,
      transformerCapacity: record.transformerCapacity,
      meterPosition: record.meterPosition,
      accessCondition: record.accessCondition,
      networkSignal: record.networkSignal,
      notes: record.notes,
      materialsToCollect: record.materialsToCollect || emptyForm.materialsToCollect,
      nextSteps: record.nextSteps || emptyForm.nextSteps,
    });
    setActivePhotoCategory(surveyScope === "building" ? "site-overview" : "room-overview");
    setPhotoViewCategory("all");
    setSelectedRecord(null);
    document.querySelector<HTMLElement>(".app-main")?.scrollTo({ top: 0, behavior: "smooth" });
    window.dispatchEvent(new CustomEvent("show-toast", { detail: "已载入旧记录，可调整信息和照片" }));
  };

  const cancelEditingRecord = () => {
    if ((draftPhotos.length > 0 || retainedPhotos.length !== (editingRecord?.photos?.length || 0)) && !window.confirm("确定取消调整吗？尚未保存的照片修改将丢失。")) return;
    setEditingRecord(null);
    setRetainedPhotos([]);
    setDraftPhotos([]);
    setForm({ ...emptyForm, projectId: form.projectId, surveyor: form.surveyor });
    void offlineDb.deleteAppData(CURRENT_DRAFT_KEY).catch(() => undefined);
  };

  const saveSurvey = async () => {
    const project = projects.find((item: any) => item.id === form.projectId);
    if (!project || !form.roomName.trim() || (form.surveyScope === "electrical" && !form.roomId)) {
      window.dispatchEvent(new CustomEvent("show-toast", { detail: form.surveyScope === "building" ? "请选择项目并填写建筑区域/单体" : "请选择项目和电房" }));
      return;
    }
    if (draftPhotos.length + retainedPhotos.length === 0) {
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "请至少拍摄一张现场照片" }));
      return;
    }

    setIsSaving(true);
    try {
      const projectTransformerCapacity = String((project as any).surveyTransformerCapacity || "").trim();
      const pending: PendingSurvey = {
        id: editingRecord?.id || crypto.randomUUID(),
        form: {
          ...form,
          // Voltage and meter position are no longer collected. Keep the
          // project-level capacity as the single source of truth for legacy
          // records that still carry these fields.
          voltageLevel: "",
          transformerCapacity: projectTransformerCapacity || form.transformerCapacity || "",
          meterPosition: "",
        },
        projectName: project.name,
        createdAt: editingRecord?.createdAt || new Date().toISOString(),
        photos: [
          ...retainedPhotos.map((photo) => ({ id: photo.id, name: photo.name, dataUrl: "", category: getPhotoCategory(photo.category).id, uploaded: photo })),
          ...draftPhotos.map((photo) => ({ id: photo.id, name: photo.name, dataUrl: photo.preview, category: photo.category })),
        ],
      };

      try {
        const uploadedPhotos: SurveyPhoto[] = [];
        for (const photo of pending.photos) {
          if (photo.uploaded) {
            uploadedPhotos.push(photo.uploaded);
            continue;
          }
          const category = getPhotoCategory(photo.category);
          const uploaded = await apiClient.uploadFile(
            `survey-${pending.form.projectId}-${category.id}-${Date.now()}-${photo.name}`,
            photo.dataUrl.split(",")[1] || photo.dataUrl,
          );
          uploadedPhotos.push({
            id: uploaded.id,
            name: photo.name,
            url: uploaded.url,
            createdAt: uploaded.createdAt,
            category: category.id,
            categoryLabel: category.label,
            categoryGroup: category.group,
          });
        }

        const recordPayload = {
          id: pending.id,
          ...pending.form,
          projectName: pending.projectName,
          photos: uploadedPhotos,
          status: "completed",
          createdAt: pending.createdAt,
        } as SurveyRecord;
        const savedRecord = editingRecord?.id
          ? await apiClient.update<SurveyRecord>("site-surveys", editingRecord.id, recordPayload)
          : await apiClient.create<SurveyRecord>("site-surveys", recordPayload);
        await offlineDb.deleteAppData(CURRENT_DRAFT_KEY).catch(() => undefined);
        await offlineDb.putEntity("site-surveys", savedRecord).catch(() => undefined);
        await consolidateProjectArchive(form.projectId, savedRecord);
        setRecentlySavedRecords((current) => [savedRecord, ...current.filter((record) => record.id !== savedRecord.id)]);
        setForm({ ...emptyForm, projectId: form.projectId, surveyor: form.surveyor, surveyScope: form.surveyScope, roomType: form.surveyScope === "building" ? "building-structure" : "high-voltage" });
        setDraftPhotos([]);
        setRetainedPhotos([]);
        setEditingRecord(null);
        setStorageWarning("");
        window.dispatchEvent(new CustomEvent("show-toast", { detail: editingRecord ? `${getSurveySubject(form)}已完成调整` : `${getSurveySubject(form)}已保存，可继续新增下一条记录` }));
        if (pendingSurveys.length) void syncPendingSurveys();
        return;
      } catch {
        window.dispatchEvent(new CustomEvent("show-toast", { detail: "后台无法连接，正在改为离线保存" }));
      }

      const nextPending = [pending, ...pendingSurveys.filter((item) => item.id !== pending.id)];
      await offlineDb.moveAppDataToEntity(CURRENT_DRAFT_KEY, PENDING_SURVEYS_RESOURCE, pending);
      setPendingSurveys(nextPending);
      setForm({ ...emptyForm, projectId: form.projectId, surveyor: form.surveyor, surveyScope: form.surveyScope, roomType: form.surveyScope === "building" ? "building-structure" : "high-voltage" });
      setDraftPhotos([]);
      setRetainedPhotos([]);
      setEditingRecord(null);
      setStorageWarning("");
      window.dispatchEvent(new CustomEvent("show-toast", { detail: editingRecord ? `${getSurveySubject(form)}的调整已离线保存` : `${getSurveySubject(form)}已离线保存，可继续新增下一条记录` }));
      if (navigator.onLine) void syncPendingSurveys(nextPending);
    } catch (error) {
      const message = isStorageQuotaError(error) ? "浏览器本地空间不足，请联网同步已有记录或减少本次照片数量" : "勘察记录保存失败，请稍后重试";
      setStorageWarning(message);
      window.dispatchEvent(new CustomEvent("show-toast", { detail: message }));
    } finally {
      setIsSaving(false);
    }
  };

  const consolidateProjectArchive = async (projectId: string, savedRecord: SurveyRecord) => {
    // `allRecords` can still be one render behind immediately after a save.
    // Read the latest local entity cache as well, otherwise a subsequent room
    // save can rebuild the project archive from only the newest room and drop
    // rooms that were saved moments earlier.
    const cachedRecords = await offlineDb.listEntities<SurveyRecord>("site-surveys");
    const recordsById = new Map<string, SurveyRecord>();
    [...cachedRecords, ...allRecords, savedRecord].forEach((record) => {
      if (record.projectId === projectId && record.id) recordsById.set(String(record.id), record);
    });
    const projectRecords = [...recordsById.values()];
    const existingArchive = projectRecords.find((record) => record.archiveType === "project");
    const existingSubjects = projectRecords.filter((record) => record.archiveType !== "project");
    if (!existingArchive && existingSubjects.length === 0) return;

    const children = [
      savedRecord,
      ...(existingArchive?.childRecords || []),
      ...existingSubjects,
    ].filter((record, index, source) => source.findIndex((item) => String(item.id) === String(record.id)) === index);
    if (children.length < 2 && !existingArchive) return;

    const project = projects.find((item: any) => item.id === projectId);
    const isAllBuilding = children.every((record) => record.surveyScope === "building" || record.roomType === "building-structure");
    const merged: SurveyRecord = {
      ...(existingArchive || children[0]),
      id: existingArchive?.id || globalThis.crypto?.randomUUID?.() || `survey-project-${Date.now()}`,
      projectId,
      projectName: project?.name || savedRecord.projectName,
      roomId: `project-${projectId}`,
      roomType: "project-summary",
      roomName: `项目综合档案（${project?.name || savedRecord.projectName}）`,
      surveyScope: isAllBuilding ? "building" : "electrical",
      archiveType: "project",
      childRecords: children.map((record) => ({ ...record, childRecords: undefined })),
      notes: [`项目档案包含 ${children.length} 个独立子档案：${children.map((record) => record.roomName).filter(Boolean).join("、")}`, ...children.map((record) => record.notes).filter(Boolean)].join("\n"),
      photos: children.flatMap((record) => record.photos || []).filter((photo, index, photos) => photos.findIndex((item) => item.id === photo.id) === index),
      createdAt: existingArchive?.createdAt || new Date().toISOString(),
      status: children.some((record) => record.status === "pending") ? "pending" : "completed",
    };

    await queueEntityOperation("site-surveys", "upsert", merged);
    await offlineDb.putEntity("site-surveys", merged);
    const recordsToDelete = [
      ...projectRecords.filter((record) => record.archiveType !== "project" && record.id),
      ...(savedRecord.id && !projectRecords.some((record) => String(record.id) === String(savedRecord.id)) ? [savedRecord] : []),
    ];
    const deletedIds = recordsToDelete.map((record) => String(record.id));
    await Promise.all(recordsToDelete.map(async (record) => {
      await deleteDocument(String(record.id));
      await offlineDb.deleteEntity("site-surveys", String(record.id)).catch(() => undefined);
      await offlineDb.deleteEntity(PENDING_SURVEYS_RESOURCE, String(record.id)).catch(() => undefined);
    }));
    setRecentlySavedRecords((current) => [merged, ...current.filter((record) => !deletedIds.includes(String(record.id)) && record.id !== merged.id)]);
    setPendingSurveys((current) => current.filter((record) => !deletedIds.includes(String(record.id))));
    setRemovedRecordIds((current) => [...new Set([...current, ...deletedIds])]);
    setSelectedArchiveIds([]);
  };

  const toggleArchiveSelection = (recordId: string) => {
    setSelectedArchiveIds((current) => current.includes(recordId) ? current.filter((id) => id !== recordId) : [...current, recordId]);
  };

  const deleteSurveyRecord = async (record: SurveyRecord) => {
    if (!window.confirm(`确定删除“${getSurveySubject(record)}”这条测试/勘察档案吗？删除后不可恢复。`)) return;
    await deleteDocument(String(record.id));
    await offlineDb.deleteEntity("site-surveys", String(record.id)).catch(() => undefined);
    await offlineDb.deleteEntity(PENDING_SURVEYS_RESOURCE, String(record.id)).catch(() => undefined);
    setPendingSurveys((current) => current.filter((item) => item.id !== record.id));
    setRecentlySavedRecords((current) => current.filter((item) => item.id !== record.id));
    setRemovedRecordIds((current) => [...new Set([...current, String(record.id)])]);
    setSelectedArchiveIds((current) => current.filter((id) => id !== record.id));
    setSelectedRecord(null);
    window.dispatchEvent(new CustomEvent("show-toast", { detail: "勘察档案已删除" }));
  };

  const mergeSelectedArchives = async () => {
    const selected = allRecords.filter((record) => selectedArchiveIds.includes(String(record.id)));
    if (selected.length < 2) return;
    const projectIds = new Set(selected.map((record) => record.projectId));
    if (projectIds.size !== 1 || selected.some((record) => record.archiveType === "project")) {
      window.dispatchEvent(new CustomEvent("show-toast", { detail: "只能合并同一项目下的电房或建筑子档案，项目档案不能重复合并" }));
      return;
    }
    const roomNames = selected.map((record) => record.roomName).filter(Boolean);
    if (!window.confirm(`将 ${selected.length} 个电房/建筑子档案汇总为一条项目档案，并保留每个子档案的独立信息和全部照片。原档案会被归入项目档案，是否继续？`)) return;
    const isAllBuilding = selected.every((record) => record.surveyScope === "building" || record.roomType === "building-structure");
    const merged: SurveyRecord = {
      ...selected[0],
      id: globalThis.crypto?.randomUUID?.() || `survey-merge-${Date.now()}`,
      roomId: `merged-${Date.now()}`,
      roomType: "project-summary",
      roomName: `项目综合档案（${selected[0].projectName}）`,
      surveyScope: isAllBuilding ? "building" : "electrical",
      archiveType: "project",
      childRecords: selected.map((record) => ({ ...record, childRecords: undefined })),
      notes: [`项目档案包含 ${selected.length} 个独立子档案：${roomNames.join("、")}`, ...selected.map((record) => record.notes).filter(Boolean)].join("\n"),
      photos: selected.flatMap((record) => record.photos || []).filter((photo, index, photos) => photos.findIndex((item) => item.id === photo.id) === index),
      createdAt: new Date().toISOString(),
      status: selected.some((record) => record.status === "pending") ? "pending" : "completed",
    };
    await queueEntityOperation("site-surveys", "upsert", merged);
    await offlineDb.putEntity("site-surveys", merged);
    await Promise.all(selected.map(async (record) => {
      await deleteDocument(String(record.id));
      await offlineDb.deleteEntity("site-surveys", String(record.id)).catch(() => undefined);
      await offlineDb.deleteEntity(PENDING_SURVEYS_RESOURCE, String(record.id)).catch(() => undefined);
    }));
    setRecentlySavedRecords((current) => [merged, ...current.filter((record) => !selectedArchiveIds.includes(String(record.id)))]);
    setPendingSurveys((current) => current.filter((record) => !selectedArchiveIds.includes(String(record.id))));
    setRemovedRecordIds((current) => [...new Set([...current, ...selectedArchiveIds])]);
    setSelectedArchiveIds([]);
    window.dispatchEvent(new CustomEvent("show-toast", { detail: "项目档案已生成，电房与建筑子档案信息均已保留" }));
  };

  return (
    <div className="min-h-full bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-5 md:space-y-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <button onClick={onBack} className="mt-0.5 rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 shadow-sm" aria-label="返回"><ArrowLeft className="h-5 w-5" /></button>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">现场勘察</h2>
              <p className="mt-1 text-sm text-slate-500">调用手机相机拍摄，弱网先存本机再自动同步</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!selectedProjectRecords.length) {
                window.dispatchEvent(new CustomEvent("show-toast", { detail: "当前项目还没有已保存的勘察记录" }));
                return;
              }
              openSurveySummaryPdfReport(selectedProjectRecords, selectedProject?.name || selectedProjectRecords[0].projectName, (selectedProject as any)?.surveyNotes || "", (selectedProject as any)?.surveyTransformerCapacity || "");
            }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-slate-900/10 sm:w-auto"
          >
            <FileDown className="h-4 w-4" />输出项目汇总报告
          </button>
        </header>

        <div className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${isOnline ? "border-emerald-100 bg-emerald-50" : "border-amber-100 bg-amber-50"}`}>
          <div className="flex min-w-0 items-center gap-3">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isOnline ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : isOnline ? <Cloud className="h-4 w-4" /> : <CloudOff className="h-4 w-4" />}</span>
            <div className="min-w-0"><p className={`text-sm font-bold ${isOnline ? "text-emerald-800" : "text-amber-800"}`}>{isSyncing ? "正在同步云端" : !isOnline ? "当前处于离线模式" : pendingSurveys.length ? `${pendingSurveys.length} 条记录等待上传` : "所有记录已同步"}</p><p className={`mt-0.5 truncate text-xs ${isOnline ? "text-emerald-600" : "text-amber-600"}`}>{isOnline ? "拍摄内容会先保存在本机，再上传云端" : "照片与表单已保存在这台手机，恢复网络后自动上传"}</p></div>
          </div>
          {isOnline && pendingSurveys.length > 0 && <button type="button" onClick={() => void syncPendingSurveys()} disabled={isSyncing} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-bold text-emerald-700 shadow-sm disabled:opacity-60"><RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />同步</button>}
        </div>
        {storageWarning && <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{storageWarning}</div>}

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <section className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-950 p-5 text-white md:p-6">
              <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10"><Camera className="h-5 w-5" /></span><div><h3 className="font-bold">新建勘察记录</h3><p className="mt-0.5 text-xs text-slate-400">每次修改自动保存草稿，关闭页面也不会丢失</p></div></div>
            </div>
            <div className="space-y-5 p-4 md:p-6">
              {editingRecord && <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3"><div><p className="text-sm font-bold text-amber-800">正在调整旧记录</p><p className="mt-0.5 text-xs text-amber-600">{getSurveySubject(editingRecord)} · 保存后覆盖原记录</p></div><button type="button" onClick={cancelEditingRecord} className="shrink-0 rounded-xl bg-white px-3 py-2 text-xs font-bold text-amber-700 shadow-sm">取消调整</button></div>}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="block">
                  <div className="mb-1.5 flex items-center justify-between gap-3"><label htmlFor="survey-project" className="text-sm font-semibold text-slate-700">所属项目</label><button type="button" onClick={openProjectModal} className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700"><Plus className="h-3.5 w-3.5" />新增项目</button></div>
                  <select id="survey-project" value={form.projectId} onChange={(event) => selectProject(event.target.value)} className="survey-input"><option value="">请选择项目</option>{projects.map((project: any) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
                  {projects.length === 0 && <p className="mt-1.5 text-xs text-amber-600">还没有项目，请先新增项目再开始勘察</p>}
                </div>
                <Field label="勘察日期"><input type="date" value={form.surveyDate} onChange={(event) => setForm({ ...form, surveyDate: event.target.value })} className="survey-input" /></Field>
                <Field label="勘察人员"><input value={form.surveyor} onChange={(event) => setForm({ ...form, surveyor: event.target.value })} className="survey-input" /></Field>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field label="项目变压器总容量"><input value={(selectedProject as any)?.surveyTransformerCapacity || ""} onChange={(event) => { const capacity = event.target.value; void setBoardData((current: any) => (Array.isArray(current) ? current.map((column: any) => ({ ...column, projects: (column.projects || []).map((project: any) => project.id === form.projectId ? { ...project, surveyTransformerCapacity: capacity } : project) })) : current)); }} placeholder="例如：2×630kVA" className="survey-input" /></Field><div /></div>
              <Field label="项目现场情况"><textarea value={(selectedProject as any)?.surveyNotes || ""} onChange={(event) => { const notes = event.target.value; void setBoardData((current: any) => (Array.isArray(current) ? current.map((column: any) => ({ ...column, projects: (column.projects || []).map((project: any) => project.id === form.projectId ? { ...project, surveyNotes: notes } : project) })) : current)); }} placeholder="填写项目整体情况、施工限制、周边环境和统一备注，不需要按电房重复填写" className="survey-input min-h-28 resize-none" /></Field>
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5"><button type="button" onClick={() => selectSurveyScope("building")} className={`rounded-xl px-3 py-3 text-sm font-bold transition-colors ${form.surveyScope === "building" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"}`}>天面/建筑结构</button><button type="button" onClick={() => selectSurveyScope("electrical")} className={`rounded-xl px-3 py-3 text-sm font-bold transition-colors ${form.surveyScope === "electrical" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"}`}>电气电房</button></div>
              {form.surveyScope === "building" ? <Field label="天面/建筑区域"><input value={form.roomName} onChange={(event) => setForm({ ...form, roomName: event.target.value, roomId: "", roomType: "building-structure" })} placeholder="例如：1号厂房天面、办公楼东侧屋顶" className="survey-input" /></Field> : <div>
                <div className="mb-2 flex items-center justify-between gap-3"><label htmlFor="survey-room" className="text-sm font-semibold text-slate-700">所属电房</label><div className="flex items-center gap-2"><button type="button" onClick={openRoomRenameModal} disabled={!form.roomId} className="flex items-center gap-1 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"><Edit2 className="h-3.5 w-3.5" />修正名称</button><button type="button" onClick={openRoomModal} className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white shadow-sm shadow-indigo-600/20"><Plus className="h-3.5 w-3.5" />新增电房</button></div></div>
                <select id="survey-room" value={form.roomId} onChange={(event) => selectRoom(event.target.value)} className="survey-input"><option value="">请选择电房</option>{projectRooms.map((room: SurveyRoom) => <option key={room.id} value={room.id}>{getRoomTypeLabel(room.type)} · {room.name}</option>)}</select>
                {form.projectId && projectRooms.length === 0 && <p className="mt-1.5 text-xs text-amber-600">该项目还没有电房，请先新增电房</p>}
              </div>}
              <div className="flex items-start gap-2 rounded-2xl border border-indigo-100 bg-indigo-50 px-3.5 py-3 text-xs leading-5 text-indigo-700"><Building2 className="mt-0.5 h-4 w-4 shrink-0" /><p>当前照片仅归入 <strong>{form.surveyScope === "building" ? `建筑结构 · ${form.roomName.trim() || "待填写区域"}` : `${getRoomTypeLabel(form.roomType)} · ${form.roomName.trim() || "待选择电房"}`}</strong>，建筑结构与各电房照片分别保存。</p></div>
              <Field label="现场地址"><input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder={form.surveyScope === "building" ? "填写建筑区域所在位置" : "填写电房所在位置"} className="survey-input" /></Field>
              {form.surveyScope === "electrical" && <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="车辆进场条件"><select value={form.accessCondition} onChange={(event) => setForm({ ...form, accessCondition: event.target.value })} className="survey-input"><option>车辆可达</option><option>小型车辆可达</option><option>需人工搬运</option><option>待确认</option></select></Field>
                <Field label="现场网络信号"><select value={form.networkSignal} onChange={(event) => setForm({ ...form, networkSignal: event.target.value })} className="survey-input"><option>良好</option><option>一般</option><option>较弱</option><option>无信号</option></select></Field>
              </div>}
              {form.surveyScope === "building" && <Field label="建筑结构补充说明"><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="记录建筑结构本身的补充信息" className="survey-input min-h-28 resize-none" /></Field>}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="收资内容"><textarea value={form.materialsToCollect} onChange={(event) => setForm({ ...form, materialsToCollect: event.target.value })} placeholder="填写后续需要收集的资料，每行一项" className="survey-input min-h-32 resize-none" /></Field>
                <Field label="下一步工作安排"><textarea value={form.nextSteps} onChange={(event) => setForm({ ...form, nextSteps: event.target.value })} placeholder="填写后续工作安排，每行一项" className="survey-input min-h-32 resize-none" /></Field>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between"><div><label className="text-sm font-semibold text-slate-700">分类拍摄 <span className="text-rose-500">*</span></label><p className="mt-0.5 text-[11px] font-medium text-indigo-600">{form.surveyScope === "building" ? `建筑结构 · ${form.roomName.trim() || "请填写区域"}` : `${getRoomTypeLabel(form.roomType)} · ${form.roomName.trim() || "请选择电房"}`}</p></div><span className="text-xs text-slate-400">{draftPhotos.length + retainedPhotos.length}/{MAX_SURVEY_PHOTOS}</span></div>
                <div className="mb-4 space-y-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                    <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">本次拍摄类目</span><select value={activePhotoCategory} onChange={(event) => { setActivePhotoCategory(event.target.value); setPhotoViewCategory(event.target.value); }} className="survey-input bg-white">{availablePhotoCategoryGroups.map((group) => <optgroup key={group.name} label={group.name}>{group.categories.map((category) => <option key={category.id} value={category.id}>{category.label} · {draftPhotos.filter((photo) => photo.category === category.id).length} 张</option>)}</optgroup>)}</select></label>
                    <div className="rounded-xl bg-white px-3 py-2.5 text-center shadow-sm"><p className="text-lg font-bold text-indigo-600">{capturedPhotoCategories.length}<span className="ml-1 text-xs font-medium text-slate-400">/{availablePhotoCategories.length} 类</span></p><p className="text-[10px] text-slate-400">已完成类目</p></div>
                  </div>
                  <p className="rounded-xl bg-indigo-50 px-3 py-2 text-xs leading-5 text-indigo-600"><span className="font-bold">{getPhotoCategory(activePhotoCategory).label}：</span>{getPhotoCategory(activePhotoCategory).hint}</p>
                  <div>
                    <div className="mb-2 flex items-center justify-between"><p className="text-xs font-bold text-slate-600">已拍概览</p><button type="button" onClick={() => setPhotoViewCategory("all")} className="text-xs font-semibold text-indigo-600">查看全部 {draftPhotos.length + retainedPhotos.length} 张</button></div>
                    {capturedPhotoCategories.length > 0 ? <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"><button type="button" onClick={() => setPhotoViewCategory("all")} className={`shrink-0 rounded-full border px-3 py-2 text-xs font-semibold ${photoViewCategory === "all" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600"}`}>全部 {draftPhotos.length + retainedPhotos.length}</button>{capturedPhotoCategories.map((category) => <button type="button" key={category.id} onClick={() => { setActivePhotoCategory(category.id); setPhotoViewCategory(category.id); }} className={`shrink-0 rounded-full border px-3 py-2 text-xs font-semibold ${photoViewCategory === category.id ? "border-indigo-600 bg-indigo-600 text-white" : "border-indigo-100 bg-white text-indigo-600"}`}>{category.label} {category.count}</button>)}</div> : <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-4 text-center text-xs text-slate-400">还没有已拍照片，选择类目后直接拍摄</div>}
                  </div>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => void handlePhotos(event.target.files)} />
                <input ref={galleryInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => void handlePhotos(event.target.files)} />
                <button type="button" onClick={() => void openCamera()} disabled={isProcessingPhotos} className="flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/60 px-4 py-6 text-indigo-700 transition-colors hover:bg-indigo-50 disabled:opacity-60">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-sm">{isProcessingPhotos ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}</span>
                  <span className="text-left"><span className="block text-sm font-bold">{isProcessingPhotos ? "正在处理照片…" : `打开相机：${getPhotoCategory(activePhotoCategory).label}`}</span><span className="mt-0.5 block text-xs text-indigo-500">{isProcessingPhotos ? "处理完成后会立即显示在下方" : `${getPhotoCategory(activePhotoCategory).hint} · 优先使用后置摄像头`}</span></span>
                </button>
                <button type="button" onClick={() => galleryInputRef.current?.click()} disabled={isProcessingPhotos} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 disabled:opacity-60">
                  <FileImage className="h-4 w-4" />从手机相册选择
                </button>
                {retainedPhotos.length > 0 && <div className="mt-4"><div className="mb-2 flex items-center justify-between"><p className="text-xs font-bold text-slate-600">原记录照片</p><span className="text-[11px] text-slate-400">保留 {retainedPhotos.length} 张</span></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{retainedPhotos.map((photo) => <div key={photo.id} className="overflow-hidden rounded-xl border border-amber-100 bg-white"><div className="relative aspect-square overflow-hidden bg-slate-100"><img src={uploadedUrl(photo.url)} alt={photo.categoryLabel || "原记录照片"} className="h-full w-full object-cover" /><span className="absolute left-1.5 top-1.5 rounded-full bg-amber-500/90 px-2 py-1 text-[10px] font-bold text-white">原照片</span><button type="button" onClick={() => setRetainedPhotos((current) => current.filter((item) => item.id !== photo.id))} className="absolute right-1.5 top-1.5 rounded-full bg-slate-950/70 p-1.5 text-white" aria-label="从记录中移除照片"><X className="h-3.5 w-3.5" /></button></div><select value={getPhotoCategory(photo.category).id} onChange={(event) => setRetainedPhotos((current) => current.map((item) => item.id === photo.id ? { ...item, category: event.target.value, categoryLabel: getPhotoCategory(event.target.value).label, categoryGroup: getPhotoCategory(event.target.value).group } : item))} className="w-full border-0 bg-white px-2 py-2 text-[11px] font-medium text-slate-600 outline-none">{availablePhotoCategoryGroups.map((group) => <optgroup key={group.name} label={group.name}>{group.categories.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</optgroup>)}</select></div>)}</div></div>}
                {(draftPhotos.length > 0 || photoViewCategory !== "all") && <div className="mt-4 space-y-4">{availablePhotoCategories.filter((category) => photoViewCategory === "all" || category.id === photoViewCategory).map((category) => { const categoryPhotos = draftPhotos.filter((photo) => photo.category === category.id); if (!categoryPhotos.length) return null; return <div key={category.id}><div className="mb-2 flex items-center justify-between"><p className="text-xs font-bold text-slate-600">{category.label}</p><span className="text-[11px] text-slate-400">{categoryPhotos.length} 张</span></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{categoryPhotos.map((photo) => <div key={photo.id} className="overflow-hidden rounded-xl border border-slate-100 bg-white"><div className="relative aspect-square overflow-hidden bg-slate-100"><img src={photo.preview} alt={`${category.label}待上传照片`} className="h-full w-full object-cover" /><span className="absolute bottom-1.5 left-1.5 rounded-full bg-slate-950/75 px-2 py-1 text-[10px] font-medium text-white">{category.label}</span><button onClick={() => setDraftPhotos((current) => current.filter((item) => item.id !== photo.id))} className="absolute right-1.5 top-1.5 rounded-full bg-slate-950/70 p-1.5 text-white" aria-label="删除照片"><X className="h-3.5 w-3.5" /></button></div><select value={photo.category} onChange={(event) => setDraftPhotos((current) => current.map((item) => item.id === photo.id ? { ...item, category: event.target.value } : item))} className="w-full border-0 bg-white px-2 py-2 text-[11px] font-medium text-slate-600 outline-none">{availablePhotoCategoryGroups.map((group) => <optgroup key={group.name} label={group.name}>{group.categories.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</optgroup>)}</select></div>)}</div></div>; })}{photoViewCategory !== "all" && draftPhotos.every((photo) => photo.category !== photoViewCategory) && <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center"><FileImage className="mx-auto h-6 w-6 text-slate-300" /><p className="mt-2 text-sm font-medium text-slate-500">当前类目还没有照片</p><p className="mt-1 text-xs text-slate-400">点击上方“打开相机”开始拍摄</p></div>}</div>}
              </div>

              <button onClick={saveSurvey} disabled={isSaving} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 disabled:opacity-60">
                {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}{isSaving ? "正在保存到本机..." : editingRecord ? "保存记录调整" : form.surveyScope === "building" ? "保存建筑结构记录" : "保存当前电房并继续"}
              </button>
              <p className="text-center text-xs text-slate-400">没有网络也可以保存；联网后系统会自动上传云端</p>
            </div>
          </section>

          <section>
            <div className="mb-4 flex items-center justify-between"><div><h3 className="text-lg font-bold text-slate-900">勘察档案</h3><p className="mt-1 text-xs text-slate-500">共 {allRecords.length} 条记录{pendingSurveys.length > 0 ? ` · ${pendingSurveys.length} 条待上传` : ""}</p></div></div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-500">可勾选同一项目的多个电房或建筑档案，汇总为一个项目档案；汇总后仍会保留每个子档案的独立信息。</p>
              {selectedArchiveIds.length >= 2 && <button type="button" onClick={() => void mergeSelectedArchives()} className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white"><Merge className="h-4 w-4" />合并已选 {selectedArchiveIds.length} 条</button>}
            </div>
            <div className="space-y-3">
              {allRecords.map((record) => (
                <div key={record.id} className="w-full rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm transition-colors hover:border-indigo-200">
                  <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><input type="checkbox" checked={selectedArchiveIds.includes(String(record.id))} onChange={() => toggleArchiveSelection(String(record.id))} className="mt-3 h-4 w-4 shrink-0 accent-indigo-600" aria-label={`选择${record.roomName}档案`} /><button type="button" onClick={() => setSelectedRecord(record)} className="flex min-w-0 flex-1 items-start gap-3 text-left"><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${record.status === "pending" ? "bg-amber-50 text-amber-600" : record.archiveType === "project" ? "bg-indigo-50 text-indigo-600" : record.surveyScope === "building" || record.roomType === "building-structure" ? "bg-emerald-50 text-emerald-600" : record.roomType === "low-voltage" ? "bg-sky-50 text-sky-600" : "bg-indigo-50 text-indigo-600"}`}><Building2 className="h-5 w-5" /></span><div className="min-w-0"><div className="flex items-center gap-2"><h4 className="truncate text-sm font-bold text-slate-900">{record.roomName}</h4><span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{record.archiveType === "project" ? `项目档案 · ${record.childRecords?.length || 0} 个子档案` : record.surveyScope === "building" || record.roomType === "building-structure" ? "天面/建筑结构" : getRoomTypeLabel(record.roomType)}</span></div><p className="mt-1 truncate text-xs text-slate-500">{record.projectName}</p>{record.archiveType === "project" && <p className="mt-1 truncate text-xs text-indigo-600">{record.childRecords?.map((child) => child.roomName).join("、")}</p>}</div></button></div><div className="flex items-center gap-2"><span className={`flex shrink-0 items-center gap-1 text-xs font-medium ${record.status === "pending" ? "text-amber-600" : "text-emerald-600"}`}>{record.status === "pending" ? <><CloudOff className="h-3.5 w-3.5" />待上传</> : <><CheckCircle2 className="h-3.5 w-3.5" />已归档</>}</span><button type="button" onClick={() => void deleteSurveyRecord(record)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="删除档案" aria-label="删除档案"><Trash2 className="h-4 w-4" /></button></div></div>
                  <div className="mt-3 flex items-center gap-4 text-xs text-slate-400"><span className="flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{record.surveyDate}</span><span className="flex items-center gap-1"><FileImage className="h-3.5 w-3.5" />{getPhotoCategoryCount(record.photos || [])} 类 · {record.photos?.length || 0} 张</span></div>
                  {record.photos?.[0] && <div className="mt-3 h-32 overflow-hidden rounded-xl bg-slate-100"><img src={uploadedUrl(record.photos[0].url)} alt={record.roomName} className="h-full w-full object-cover" /></div>}
                </div>
              ))}
              {allRecords.length === 0 && <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center"><Camera className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-medium text-slate-500">还没有现场勘察记录</p><p className="mt-1 text-xs text-slate-400">完成第一次拍照后会显示在这里</p></div>}
            </div>
          </section>
        </div>
      </div>

      {selectedRecord && <SurveyDetail record={selectedRecord} onEdit={() => editSurveyRecord(selectedRecord)} onEditChild={(child) => editSurveyRecord(child)} onOpenProjectReport={() => { const projectRecords = allRecords.filter((record) => record.projectId === selectedRecord.projectId); const project = projects.find((item: any) => item.id === selectedRecord.projectId) as any; openSurveySummaryPdfReport(projectRecords, selectedRecord.projectName, project?.surveyNotes || "", project?.surveyTransformerCapacity || ""); }} onClose={() => setSelectedRecord(null)} />}
      {isProjectModalOpen && <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="survey-new-project-title">
        <div className="w-full max-w-md overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
          <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4 sm:px-6 sm:py-5">
            <div><h3 id="survey-new-project-title" className="text-lg font-bold text-slate-900">新增前期勘察项目</h3><p className="mt-1 text-xs text-slate-500">先建立勘察档案，是否实施、负责人和工期可稍后确认</p></div>
            <button type="button" onClick={() => setIsProjectModalOpen(false)} className="rounded-full bg-slate-100 p-2 text-slate-500" aria-label="关闭新增项目窗口"><X className="h-4 w-4" /></button>
          </div>
          <form onSubmit={createProject} className="space-y-4 p-5 sm:p-6">
            <Field label="项目名称"><input autoFocus required value={newProject.name} onChange={(event) => setNewProject((current) => ({ ...current, name: event.target.value }))} className="survey-input" placeholder="例如：XX园区光伏改造" /></Field>
            <Field label="项目类型"><select value={newProject.type} onChange={(event) => setNewProject((current) => ({ ...current, type: event.target.value }))} className="survey-input">{PROJECT_TYPES.map((type) => <option key={type}>{type}</option>)}</select></Field>
            <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-700">当前仅作为前期勘察项目，不要求确定项目经理和预计竣工日期。</p>
            <div className="flex gap-3 pt-2"><button type="button" onClick={() => setIsProjectModalOpen(false)} className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600">取消</button><button type="submit" className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/20"><Plus className="h-4 w-4" />创建并选中</button></div>
          </form>
        </div>
      </div>}
      {isRoomModalOpen && <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="survey-new-room-title">
        <div className="w-full max-w-md overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
          <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4 sm:px-6 sm:py-5"><div><h3 id="survey-new-room-title" className="text-lg font-bold text-slate-900">{roomBeingEdited ? "修正电房名称" : "新增电房"}</h3><p className="mt-1 text-xs text-slate-500">归属于 {selectedProject?.name || "当前项目"}，每个电房的照片独立保存</p></div><button type="button" onClick={() => { setIsRoomModalOpen(false); setRoomBeingEdited(null); }} className="rounded-full bg-slate-100 p-2 text-slate-500" aria-label="关闭电房窗口"><X className="h-4 w-4" /></button></div>
          <form onSubmit={roomBeingEdited ? renameRoom : createRoom} className="space-y-4 p-5 sm:p-6">
            <Field label="电房类型"><select value={newRoom.type} onChange={(event) => setNewRoom((current) => ({ ...current, type: event.target.value }))} className="survey-input">{ROOM_TYPES.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}</select></Field>
            <Field label="电房名称/编号"><input autoFocus required value={newRoom.name} onChange={(event) => setNewRoom((current) => ({ ...current, name: event.target.value }))} className="survey-input" placeholder={newRoom.type === "high-voltage" ? "例如：1号高压电房" : "例如：2号低压电房"} /></Field>
            <div className="flex gap-3 pt-2"><button type="button" onClick={() => { setIsRoomModalOpen(false); setRoomBeingEdited(null); }} className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600">取消</button><button type="submit" className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white">{roomBeingEdited ? <><Save className="h-4 w-4" />保存名称</> : <><Plus className="h-4 w-4" />新增并选中</>}</button></div>
          </form>
        </div>
      </div>}
      {cameraOpen && <div className="fixed inset-0 z-[100] flex flex-col bg-black text-white">
        <div aria-hidden className={`pointer-events-none absolute inset-0 z-50 bg-white transition-opacity duration-150 ${cameraFlash ? "opacity-95" : "opacity-0"}`} />
        {captureNotice && <div className="pointer-events-none absolute left-1/2 top-[max(5.5rem,env(safe-area-inset-top))] z-40 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-emerald-500/95 px-4 py-2 text-sm font-bold text-white shadow-xl">
          <CheckCircle2 className="h-4 w-4" />{captureNotice}
        </div>}
        <div className="flex items-center justify-between px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
          <div>
            <p className="text-sm font-bold">拍摄：{getPhotoCategory(activePhotoCategory).label}</p>
            <p className="mt-0.5 text-xs text-white/60">{getPhotoCategory(activePhotoCategory).hint}</p>
          </div>
          <button type="button" onClick={closeCamera} className="rounded-full bg-white/15 p-2.5" aria-label="关闭相机"><X className="h-5 w-5" /></button>
        </div>
        <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
          <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
          <div className="pointer-events-none absolute inset-4 rounded-3xl border border-white/25" />
          <span className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1.5 text-xs">{draftPhotos.length + retainedPhotos.length}/{MAX_SURVEY_PHOTOS} 张</span>
        </div>
        <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
          {cameraError && <p className="mb-3 rounded-xl bg-rose-500/20 px-3 py-2 text-center text-xs text-rose-100">{cameraError}</p>}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <button type="button" onClick={() => galleryInputRef.current?.click()} className="justify-self-start rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold">相册</button>
            <button type="button" onClick={() => void capturePhoto()} disabled={isCapturing} className={`flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-white/20 shadow-lg transition-transform active:scale-90 disabled:opacity-80 ${isCapturing ? "scale-90" : ""}`} aria-label="拍摄照片">
              <span className={`h-16 w-16 rounded-full bg-white transition-transform ${isCapturing ? "scale-90" : ""}`} />
            </button>
            <button type="button" onClick={closeCamera} className="justify-self-end rounded-xl bg-indigo-500 px-4 py-2 text-xs font-bold">完成</button>
          </div>
        </div>
      </div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</span>{children}</label>;
}

function escapeReportHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function naturalReportCompare(left: unknown, right: unknown) {
  return String(left || "").localeCompare(String(right || ""), "zh-CN", {
    numeric: true,
    sensitivity: "base",
  });
}

function joinReportItems(records: SurveyRecord[], field: "materialsToCollect" | "nextSteps") {
  return [...new Set(records.flatMap((record) => String(record[field] || "").split("\n").map((item) => item.trim()).filter(Boolean)))].join("\n");
}

function openSurveyPdfReport(record: SurveyRecord) {
  const reportWindow = window.open("", "_blank");
  if (!reportWindow) {
    window.dispatchEvent(new CustomEvent("show-toast", { detail: "浏览器阻止了报告窗口，请允许弹出窗口后重试" }));
    return;
  }

  const photosByCategory = (record.photos || []).reduce<Record<string, SurveyPhoto[]>>((groups, photo) => {
    const category = getPhotoCategory(photo.category);
    (groups[category.id] ||= []).push(photo);
    return groups;
  }, {});
  const reportNumber = `KC-${String(record.surveyDate || "").replace(/-/g, "")}-${String(record.id || "LOCAL").slice(0, 6).toUpperCase()}`;
  const infoRows = record.surveyScope === "building" ? [
    ["所属项目", record.projectName || "未填写", "建筑区域/单体", record.roomName || "未填写"],
    ["勘察日期", record.surveyDate || "未填写", "勘察人员", record.surveyor || "未填写"],
    ["现场地址", record.address || "未填写", "记录类型", "建筑结构"],
  ] : [
    ["所属项目", record.projectName || "未填写", "电房", getSurveySubject(record)],
    ["变压器容量", record.transformerCapacity || "未填写", "记录类型", "电气电房"],
    ["勘察日期", record.surveyDate || "未填写", "勘察人员", record.surveyor || "未填写"],
    ["现场地址", record.address || "未填写", "车辆进场条件", record.accessCondition || "未填写"],
    ["现场网络", record.networkSignal || "未填写", "照片数量", `${record.photos?.length || 0} 张`],
  ];
  const photoSections = Object.entries(photosByCategory).map(([categoryId, photos]) => {
    const category = getPhotoCategory(categoryId);
    return `<section class="photo-section">
      <div class="section-heading"><div><h3>${escapeReportHtml(category.label)}</h3><p>${escapeReportHtml(category.group)} · ${escapeReportHtml(category.hint)}</p></div><span>${photos.length} 张</span></div>
      <div class="photo-grid">${photos.map((photo, index) => `<figure><img src="${escapeReportHtml(uploadedUrl(photo.url))}" alt="${escapeReportHtml(category.label)}"><figcaption>${escapeReportHtml(category.label)} ${index + 1}</figcaption></figure>`).join("")}</div>
    </section>`;
  }).join("");

  reportWindow.document.write(`<!doctype html>
  <html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeReportHtml(record.projectName)} - 现场勘察报告</title>
  <style>
    @page { size: A4; margin: 14mm 13mm 16mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #172033; background: #fff; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; font-size: 12px; line-height: 1.55; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .report { max-width: 184mm; margin: 0 auto; }
    .cover { border-radius: 18px; background: linear-gradient(135deg,#0f172a,#1e293b); color: #fff; padding: 24px 26px; margin-bottom: 16px; }
    .brand { color: #a5b4fc; font-size: 10px; font-weight: 700; letter-spacing: 1.8px; }
    h1 { margin: 8px 0 4px; font-size: 25px; line-height: 1.25; }
    .subtitle { margin: 0; color: #cbd5e1; }
    .meta { display: flex; justify-content: space-between; gap: 12px; margin-top: 18px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,.14); color: #cbd5e1; font-size: 10px; }
    .section { margin-top: 16px; break-inside: avoid; }
    .title { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 15px; font-weight: 800; }
    .title:before { content:""; width: 4px; height: 16px; border-radius: 3px; background: #4f46e5; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th,td { border: 1px solid #e2e8f0; padding: 8px 9px; vertical-align: top; }
    th { width: 14%; color: #64748b; background: #f8fafc; text-align: left; font-weight: 600; }
    td { width: 36%; font-weight: 600; }
    .notes { min-height: 64px; white-space: pre-wrap; border: 1px solid #e2e8f0; border-radius: 10px; padding: 11px; background: #f8fafc; color: #475569; }
    .photo-summary { display: flex; gap: 10px; margin: 8px 0 12px; }
    .badge { border-radius: 999px; background: #eef2ff; color: #4338ca; padding: 5px 10px; font-weight: 700; }
    .photo-section { margin-top: 15px; break-inside: avoid; }
    .section-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
    .section-heading h3 { margin: 0; font-size: 14px; }
    .section-heading p { margin: 2px 0 0; color: #64748b; font-size: 9px; }
    .section-heading span { color: #4f46e5; font-weight: 700; }
    .photo-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px; }
    figure { margin: 0; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; break-inside: avoid; }
    figure img { display: block; width: 100%; height: 66mm; object-fit: cover; background: #f1f5f9; }
    figcaption { padding: 6px 8px; color: #475569; font-size: 9px; }
    .signatures { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; margin-top: 22px; break-inside: avoid; }
    .signature { height: 62px; border: 1px solid #cbd5e1; border-radius: 10px; padding: 8px; color: #64748b; font-size: 10px; }
    footer { margin-top: 18px; border-top: 1px solid #e2e8f0; padding-top: 8px; color: #94a3b8; text-align: center; font-size: 9px; }
    .actions { position: fixed; right: 16px; bottom: 16px; display: flex; gap: 8px; z-index: 5; }
    .actions button { border: 0; border-radius: 10px; padding: 11px 16px; font-weight: 700; cursor: pointer; }
    .actions .print { background: #4f46e5; color: #fff; }
    .actions .close { background: #e2e8f0; color: #334155; }
    @media print { .actions { display:none; } .photo-section { break-before: auto; } }
  </style></head><body>
  <main class="report">
    <section class="cover"><div class="brand">智建协同 PRO · SITE SURVEY</div><h1>现场勘察报告</h1><p class="subtitle">${escapeReportHtml(record.projectName)} · ${escapeReportHtml(getSurveySubject(record))}</p><div class="meta"><span>报告编号：${escapeReportHtml(reportNumber)}</span><span>生成时间：${escapeReportHtml(new Date().toLocaleString("zh-CN"))}</span></div></section>
    <section class="section"><div class="title">现场基本信息</div><table>${infoRows.map((row) => `<tr>${row.map((cell, index) => index % 2 === 0 ? `<th>${escapeReportHtml(cell)}</th>` : `<td>${escapeReportHtml(cell)}</td>`).join("")}</tr>`).join("")}</table></section>
    <section class="section"><div class="title">现场情况与勘察结论</div><div class="notes">${escapeReportHtml(record.notes || "暂无补充说明。")}</div></section>
    <section class="section"><div class="title">分类影像记录</div><div class="photo-summary"><span class="badge">${getPhotoCategoryCount(record.photos || [])} 个类目</span><span class="badge">${record.photos?.length || 0} 张照片</span></div>${photoSections || '<div class="notes">暂无现场照片。</div>'}</section>
    <section class="section"><div class="title">后续跟进工作需要</div><div class="notes"><strong>收资内容</strong>\n${escapeReportHtml(record.materialsToCollect || "暂无收资内容。")}\n\n<strong>下一步工作安排</strong>\n${escapeReportHtml(record.nextSteps || "暂无下一步工作安排。")}</div></section>
    <section class="signatures"><div class="signature">勘察人员签字：</div><div class="signature">项目负责人确认：</div><div class="signature">确认日期：</div></section>
    <footer>本报告由智建协同 Pro 根据现场勘察记录自动整理 · PDF 仅在当前设备生成，不占用云端存储</footer>
  </main>
  <div class="actions"><button class="close" onclick="window.close()">关闭</button><button class="print" onclick="window.print()">保存/打印 PDF</button></div>
  <script>
    window.addEventListener("load", function () {
      var images = Array.prototype.slice.call(document.images);
      Promise.all(images.map(function (image) {
        if (image.complete) return Promise.resolve();
        return new Promise(function (resolve) { image.onload = resolve; image.onerror = resolve; });
      })).then(function () { document.body.setAttribute("data-report-ready", "true"); });
    });
  </script>
  </body></html>`);
  reportWindow.document.close();
}

function openSurveySummaryPdfReport(records: SurveyRecord[], projectName: string, projectNotes = "", projectTransformerCapacity = "") {
  const reportWindow = window.open("", "_blank");
  if (!reportWindow) {
    window.dispatchEvent(new CustomEvent("show-toast", { detail: "浏览器阻止了报告窗口，请允许弹出窗口后重试" }));
    return;
  }

  // Project archives are containers. Export their child records as independent
  // sections so the PDF remains an information report instead of a photo bundle.
  const reportRecords = records.flatMap((record) => (
    record.archiveType === "project" && record.childRecords?.length
      ? record.childRecords
      : [record]
  )).filter((record, index, source) => !record.id || source.findIndex((item) => String(item.id) === String(record.id)) === index);
  const sortedRecords = [...reportRecords].sort((a, b) => (
    naturalReportCompare(getSurveySubject(a), getSurveySubject(b))
    || naturalReportCompare(a.surveyDate, b.surveyDate)
  ));
  const buildingRecords = sortedRecords.filter((record) => record.surveyScope === "building" || record.roomType === "building-structure");
  const electricalRecords = sortedRecords.filter((record) => !buildingRecords.includes(record));
  const totalPhotos = sortedRecords.reduce((total, record) => total + (record.photos?.length || 0), 0);
  const completedRecords = sortedRecords.filter((record) => record.status === "completed").length;
  const allPhotos = sortedRecords.flatMap((record) => record.photos || []);
  const projectSituation = projectNotes.trim() || [...new Set(sortedRecords.map((record) => record.notes?.trim()).filter(Boolean))].join("\n\n") || "暂无现场情况说明。";
  const materialsToCollect = joinReportItems(sortedRecords, "materialsToCollect") || "暂无收资内容。";
  const nextSteps = joinReportItems(sortedRecords, "nextSteps") || "暂无下一步工作安排。";
  const reportNumber = `HZ-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(sortedRecords[0]?.projectId || "LOCAL").slice(0, 6).toUpperCase()}`;

  const categoryRows = photoCategoryGroups.map((group) => {
    const cells = group.categories.map((category) => {
      const count = allPhotos.filter((photo) => getPhotoCategory(photo.category).id === category.id).length;
      return `<div class="coverage-item ${count ? "done" : ""}"><span>${escapeReportHtml(category.label)}</span><strong>${count ? `${count} 张` : "未拍"}</strong></div>`;
    }).join("");
    return `<section class="coverage-group"><h3>${escapeReportHtml(group.name)}</h3><div class="coverage-grid">${cells}</div></section>`;
  }).join("");

  const buildRecordRows = (source: SurveyRecord[]) => source.map((record, index) => `<tr>
    <td>${index + 1}</td>
    <td><strong>${escapeReportHtml(getSurveySubject(record))}</strong><br><span class="muted">${escapeReportHtml(record.address || "未填写地址")}</span></td>
    <td>${escapeReportHtml(record.surveyDate || "未填写")}<br><span class="muted">${escapeReportHtml(record.surveyor || "未填写")}</span></td>
    <td>${record.surveyScope === "building" || record.roomType === "building-structure" ? "天面/建筑结构" : "电气电房"}</td>
    <td>${getPhotoCategoryCount(record.photos || [])} 类 / ${record.photos?.length || 0} 张</td>
    <td><span class="status ${record.status === "completed" ? "synced" : "pending"}">${record.status === "completed" ? "已归档" : "本机待上传"}</span></td>
  </tr>`).join("");
  const buildingRecordRows = buildRecordRows(buildingRecords);
  const electricalRecordRows = buildRecordRows(electricalRecords);

  const buildRecordSections = (source: SurveyRecord[]) => source.map((record, index) => {
    const isBuildingRecord = record.surveyScope === "building" || record.roomType === "building-structure";
    const photosByCategory = (record.photos || []).reduce<Record<string, SurveyPhoto[]>>((groups, photo) => {
      const category = getPhotoCategory(photo.category);
      (groups[category.id] ||= []).push(photo);
      return groups;
    }, {});
    const sortedPhotoCategories = Object.entries(photosByCategory).sort(([left], [right]) => naturalReportCompare(getPhotoCategory(left).label, getPhotoCategory(right).label));
    return `<section class="record-card">
      <div class="record-heading">
        <div><span class="record-index">${String(index + 1).padStart(2, "0")}</span><h2>${escapeReportHtml(getSurveySubject(record))}</h2></div>
        <span>${escapeReportHtml(record.surveyDate || "未填写日期")}</span>
      </div>
      <div class="record-info ${isBuildingRecord ? "building-info" : "electrical-info"}">
        ${isBuildingRecord ? `
          <div><label>天面/建筑区域</label><p>${escapeReportHtml(record.roomName || "未填写")}</p></div>
          <div><label>现场地址</label><p>${escapeReportHtml(record.address || "未填写")}</p></div>
          <div><label>勘察人员</label><p>${escapeReportHtml(record.surveyor || "未填写")}</p></div>
        ` : `
          <div><label>现场地址</label><p>${escapeReportHtml(record.address || "未填写")}</p></div>
          <div><label>勘察人员</label><p>${escapeReportHtml(record.surveyor || "未填写")}</p></div>
          <div><label>进场条件</label><p>${escapeReportHtml(record.accessCondition || "未填写")}</p></div>
          <div><label>网络信号</label><p>${escapeReportHtml(record.networkSignal || "未填写")}</p></div>
        `}
      </div>
      <div class="representative-heading"><strong>分类现场照片</strong><span>全部 ${record.photos?.length || 0} 张</span></div>
      ${sortedPhotoCategories.length ? sortedPhotoCategories.map(([categoryId, photos]) => { const category = getPhotoCategory(categoryId); return `<div class="photo-category"><div class="photo-category-heading"><strong>${escapeReportHtml(category.label)}</strong><span>${photos.length} 张</span></div><div class="photo-grid">${photos.map((photo, photoIndex) => `<figure>
        <img src="${escapeReportHtml(uploadedUrl(photo.url))}" alt="${escapeReportHtml(category.label)} ${photoIndex + 1}">
        <figcaption><strong>${escapeReportHtml(category.label)} ${photoIndex + 1}</strong><span>现场照片</span></figcaption>
      </figure>`).join("")}</div></div>`; }).join("") : '<div class="empty">暂无现场照片</div>'}
    </section>`;
  }).join("");
  const buildingRecordSections = buildRecordSections(buildingRecords);
  const electricalRecordSections = buildRecordSections(electricalRecords);

  reportWindow.document.write(`<!doctype html>
  <html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeReportHtml(projectName)} - 项目现场勘察汇总报告</title>
  <style>
    @page { size: A4; margin: 13mm 12mm 15mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #172033; background: #fff; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; font-size: 11px; line-height: 1.5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .report { max-width: 186mm; margin: 0 auto; }
    .cover { border-radius: 18px; background: linear-gradient(135deg,#0f172a,#312e81); color: #fff; padding: 24px 26px; }
    .brand { color: #c7d2fe; font-size: 9px; font-weight: 800; letter-spacing: 1.8px; }
    h1 { margin: 8px 0 4px; font-size: 25px; line-height: 1.25; }
    .subtitle { margin: 0; color: #cbd5e1; font-size: 13px; }
    .meta { display: flex; justify-content: space-between; gap: 12px; margin-top: 17px; border-top: 1px solid rgba(255,255,255,.16); padding-top: 11px; color: #cbd5e1; font-size: 9px; }
    .metrics { display: grid; grid-template-columns: repeat(4,1fr); gap: 8px; margin: 12px 0 18px; }
    .metric { border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px 11px; background: #f8fafc; }
    .metric strong { display: block; color: #312e81; font-size: 19px; line-height: 1.2; }
    .metric span { color: #64748b; font-size: 9px; }
    .project-summary { display: grid; grid-template-columns: minmax(0, 1fr); border: 1px solid #c7d2fe; border-radius: 12px; padding: 11px 13px; background: #eef2ff; }
    .project-summary p { margin: 3px 0 0; color: #312e81; font-size: 15px; font-weight: 800; }
    .section { margin-top: 16px; }
    .title { display: flex; align-items: center; gap: 7px; margin-bottom: 8px; font-size: 15px; font-weight: 800; }
    .title:before { content:""; width: 4px; height: 16px; border-radius: 3px; background: #4f46e5; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th,td { border: 1px solid #e2e8f0; padding: 7px; vertical-align: top; text-align: left; }
    th { color: #64748b; background: #f8fafc; font-size: 9px; }
    th:first-child,td:first-child { width: 6%; text-align: center; }
    th:nth-child(2),td:nth-child(2) { width: 26%; }
    .muted { color: #64748b; font-size: 9px; }
    .status { display: inline-block; border-radius: 999px; padding: 3px 6px; white-space: nowrap; font-size: 8px; font-weight: 700; }
    .synced { color: #047857; background: #ecfdf5; }
    .pending { color: #b45309; background: #fffbeb; }
    .coverage-group { margin-top: 10px; break-inside: avoid; }
    .coverage-group h3 { margin: 0 0 6px; color: #475569; font-size: 11px; }
    .coverage-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 6px; }
    .coverage-item { display: flex; justify-content: space-between; gap: 5px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px 7px; color: #94a3b8; background: #f8fafc; }
    .coverage-item strong { white-space: nowrap; font-size: 9px; }
    .coverage-item.done { border-color: #c7d2fe; color: #3730a3; background: #eef2ff; }
    .record-card { margin-top: 18px; border-top: 2px solid #1e293b; padding-top: 10px; break-before: page; }
    .record-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 9px; }
    .record-heading > div { display: flex; align-items: center; gap: 8px; }
    .record-heading h2 { margin: 0; font-size: 17px; }
    .record-heading > span { color: #64748b; }
    .record-index { display: flex; width: 27px; height: 27px; align-items: center; justify-content: center; border-radius: 8px; color: #fff; background: #4f46e5; font-weight: 800; }
    .record-info { display: grid; grid-template-columns: repeat(3,1fr); border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
    .record-info.electrical-info { grid-template-columns: repeat(4,1fr); }
    .record-info > div { min-height: 48px; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; padding: 7px 8px; }
    .record-info > div:nth-child(3n) { border-right: 0; }
    .record-info > div:nth-last-child(-n+3) { border-bottom: 0; }
    .electrical-info > div:nth-child(3n) { border-right: 1px solid #e2e8f0; }
    .electrical-info > div:nth-child(4n) { border-right: 0; }
    .electrical-info > div:nth-last-child(-n+4) { border-bottom: 0; }
    label { display: block; color: #64748b; font-size: 8px; }
    .record-info p,.record-notes p { margin: 2px 0 0; font-weight: 600; }
    .record-notes { margin-top: 8px; border-radius: 9px; padding: 8px 9px; background: #f8fafc; white-space: pre-wrap; }
    .representative-heading { display: flex; justify-content: space-between; gap: 10px; margin: 11px 0 7px; }
    .representative-heading span { color: #64748b; font-size: 9px; }
    .photo-category { margin-top: 10px; }
    .photo-category-heading { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 5px; color: #475569; font-size: 10px; }
    .photo-category-heading span { color: #94a3b8; }
    .photo-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 7px; }
    figure { margin: 0; border: 1px solid #e2e8f0; border-radius: 9px; overflow: hidden; break-inside: avoid; }
    figure img { display: block; width: 100%; height: 45mm; object-fit: cover; background: #f1f5f9; }
    figcaption { display: flex; justify-content: space-between; gap: 5px; padding: 5px 6px; color: #475569; font-size: 8px; }
    figcaption span { color: #94a3b8; }
    .empty { border: 1px dashed #cbd5e1; border-radius: 9px; padding: 18px; color: #94a3b8; text-align: center; }
    .signatures { display: grid; grid-template-columns: repeat(3,1fr); gap: 9px; margin-top: 20px; break-inside: avoid; }
    .signature { height: 58px; border: 1px solid #cbd5e1; border-radius: 9px; padding: 8px; color: #64748b; font-size: 9px; }
    footer { margin-top: 16px; border-top: 1px solid #e2e8f0; padding-top: 7px; color: #94a3b8; text-align: center; font-size: 8px; }
    .actions { position: fixed; right: 16px; bottom: 16px; display: flex; gap: 8px; z-index: 5; }
    .actions button { border: 0; border-radius: 10px; padding: 11px 16px; font-weight: 700; cursor: pointer; }
    .actions .print { background: #4f46e5; color: #fff; }
    .actions .close { background: #e2e8f0; color: #334155; }
    @media print { .actions { display:none; } }
    @media (max-width: 640px) { .metrics,.coverage-grid { grid-template-columns: repeat(2,1fr); } .photo-grid { grid-template-columns: repeat(2,1fr); } .record-info,.record-info.electrical-info { grid-template-columns: repeat(2,1fr); } .record-info > div { border-right: 1px solid #e2e8f0 !important; border-bottom: 1px solid #e2e8f0 !important; } .record-info > div:nth-child(2n) { border-right: 0 !important; } .record-info > div:nth-last-child(-n+2) { border-bottom: 0 !important; } }
  </style></head><body>
  <main class="report">
    <section class="cover"><div class="brand">智建协同 PRO · PROJECT SITE SURVEY</div><h1>项目现场勘察汇总报告</h1><p class="subtitle">${escapeReportHtml(projectName)}</p><div class="meta"><span>报告编号：${escapeReportHtml(reportNumber)}</span><span>生成时间：${escapeReportHtml(new Date().toLocaleString("zh-CN"))}</span></div></section>
    <section class="metrics">
      <div class="metric"><strong>${buildingRecords.length}</strong><span>天面 / 建筑区域</span></div>
      <div class="metric"><strong>${electricalRecords.length}</strong><span>高低压电房</span></div>
      <div class="metric"><strong>${totalPhotos}</strong><span>现场照片</span></div>
      <div class="metric"><strong>${completedRecords}/${sortedRecords.length}</strong><span>已同步归档</span></div>
    </section>
    <section class="section"><div class="title">项目基础信息</div><div class="project-summary"><div><label>变压器总容量</label><p>${escapeReportHtml(projectTransformerCapacity.trim() || "未填写")}</p></div></div></section>
    <section class="section"><div class="title">天面与建筑结构总览</div>${buildingRecords.length ? `<table><thead><tr><th>序号</th><th>天面/建筑区域</th><th>日期与人员</th><th>类型</th><th>照片</th><th>状态</th></tr></thead><tbody>${buildingRecordRows}</tbody></table>` : '<div class="empty">暂无天面或建筑结构勘察记录</div>'}</section>
    <section class="section"><div class="title">电房总览</div>${electricalRecords.length ? `<table><thead><tr><th>序号</th><th>电房与位置</th><th>日期与人员</th><th>类型</th><th>照片</th><th>状态</th></tr></thead><tbody>${electricalRecordRows}</tbody></table>` : '<div class="empty">暂无电房勘察记录</div>'}</section>
    <section class="section"><div class="title">分类拍摄完成度</div>${categoryRows}</section>
    <section class="section"><div class="title">项目现场情况</div><div class="record-notes"><p>${escapeReportHtml(projectSituation)}</p></div></section>
    <section class="section"><div class="title">天面与建筑结构详细信息</div></section>
    ${buildingRecordSections || '<div class="empty">暂无天面或建筑结构详细信息</div>'}
    <section class="section"><div class="title">各电房详细信息</div></section>
    ${electricalRecordSections || '<div class="empty">暂无电房详细信息</div>'}
    <section class="section"><div class="title">后续跟进工作需要</div><div class="record-notes"><p><strong>收资内容</strong></p><p>${escapeReportHtml(materialsToCollect)}</p><p><strong>下一步工作安排</strong></p><p>${escapeReportHtml(nextSteps)}</p></div></section>
    <section class="signatures"><div class="signature">汇总人员签字：</div><div class="signature">项目负责人确认：</div><div class="signature">确认日期：</div></section>
    <footer>本报告由智建协同 Pro 根据当前项目的现场勘察记录自动整理 · PDF 仅在当前设备生成，不占用云端存储</footer>
  </main>
  <div class="actions"><button class="close" onclick="window.close()">关闭</button><button class="print" onclick="window.print()">保存/打印 PDF</button></div>
  <script>
    window.addEventListener("load", function () {
      var images = Array.prototype.slice.call(document.images);
      Promise.all(images.map(function (image) {
        if (image.complete) return Promise.resolve();
        return new Promise(function (resolve) { image.onload = resolve; image.onerror = resolve; });
      })).then(function () { document.body.setAttribute("data-report-ready", "true"); });
    });
  </script>
  </body></html>`);
  reportWindow.document.close();
}

function SurveyDetail({ record, onEdit, onEditChild, onOpenProjectReport, onClose }: { record: SurveyRecord; onEdit: () => void; onEditChild: (record: SurveyRecord) => void; onOpenProjectReport: () => void; onClose: () => void }) {
  const [photoCategoryFilter, setPhotoCategoryFilter] = useState("all");
  const photosByCategory = (record.photos || []).reduce<Record<string, SurveyPhoto[]>>((groups, photo) => {
    const category = getPhotoCategory(photo.category);
    (groups[category.id] ||= []).push(photo);
    return groups;
  }, {});

  return <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/50 backdrop-blur-sm md:items-center md:p-6"><div className="mobile-sheet max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-t-[28px] bg-white shadow-2xl md:rounded-3xl"><div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur"><div className="min-w-0 flex-1"><h3 className="truncate font-bold text-slate-900">{getSurveySubject(record)}</h3><p className="mt-0.5 truncate text-xs text-slate-500">{record.projectName} · {record.surveyDate}</p></div>{record.archiveType !== "project" && <button type="button" onClick={onEdit} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700"><Edit2 className="h-4 w-4" />调整</button>}<button type="button" onClick={onOpenProjectReport} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-600"><FileDown className="h-4 w-4" /><span className="hidden sm:inline">项目报告</span></button><button onClick={onClose} className="shrink-0 rounded-full bg-slate-100 p-2 text-slate-500"><X className="h-5 w-5" /></button></div><div className="space-y-5 p-5">{record.archiveType === "project" && <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4"><p className="text-sm font-bold text-indigo-900">项目档案包含 {record.childRecords?.length || 0} 个独立子档案</p><p className="mt-1 text-xs text-indigo-600">可直接调整下方任一电房，新增电房请关闭此窗口后在勘察表单中选择电房并拍摄。</p><div className="mt-3 space-y-2">{record.childRecords?.map((child) => <div key={child.id} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{child.roomName}</p><p className="mt-0.5 text-xs text-slate-500">{child.surveyScope === "building" || child.roomType === "building-structure" ? "建筑结构" : getRoomTypeLabel(child.roomType)} · {child.photos?.length || 0} 张</p></div><button type="button" onClick={() => onEditChild(child)} className="flex shrink-0 items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-700"><Edit2 className="h-3.5 w-3.5" />调整</button></div>)}</div></div>}{record.archiveType !== "project" && record.surveyScope !== "building" && <div className="grid grid-cols-2 gap-3 text-sm"><Info label="电压等级" value={record.voltageLevel} /><Info label="变压器容量" value={record.transformerCapacity || "未填写"} /><Info label="车辆条件" value={record.accessCondition} /><Info label="网络信号" value={record.networkSignal} /></div>}{record.address && <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{record.address}</div>}{record.notes && <div><h4 className="text-sm font-bold text-slate-800">现场备注</h4><p className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-600">{record.notes}</p></div>}<div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div><h4 className="text-sm font-bold text-slate-800">收资内容</h4><p className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-600">{record.materialsToCollect || "暂无收资内容"}</p></div><div><h4 className="text-sm font-bold text-slate-800">下一步工作安排</h4><p className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-600">{record.nextSteps || "暂无下一步工作安排"}</p></div></div><div><div className="mb-3 flex items-center justify-between"><h4 className="text-sm font-bold text-slate-800">分类照片</h4><span className="text-xs text-slate-400">{getPhotoCategoryCount(record.photos || [])} 类 · {record.photos?.length || 0} 张</span></div><div className="mb-4 flex gap-2 overflow-x-auto pb-1"><button type="button" onClick={() => setPhotoCategoryFilter("all")} className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold ${photoCategoryFilter === "all" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}>全部 {record.photos?.length || 0}</button>{Object.entries(photosByCategory).map(([categoryId, photos]) => <button type="button" key={categoryId} onClick={() => setPhotoCategoryFilter(categoryId)} className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold ${photoCategoryFilter === categoryId ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-600"}`}>{getPhotoCategory(categoryId).label} {photos.length}</button>)}</div><div className="space-y-5">{Object.entries(photosByCategory).filter(([categoryId]) => photoCategoryFilter === "all" || categoryId === photoCategoryFilter).map(([categoryId, photos]) => { const category = getPhotoCategory(categoryId); return <section key={categoryId}><div className="mb-2 flex items-center justify-between"><div><p className="text-sm font-bold text-slate-700">{category.label}</p><p className="mt-0.5 text-[11px] text-slate-400">{category.group}</p></div><span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-600">{photos.length} 张</span></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{photos.map((photo) => <a key={photo.id} href={uploadedUrl(photo.url)} target="_blank" rel="noreferrer" className="relative aspect-square overflow-hidden rounded-xl bg-slate-100"><img src={uploadedUrl(photo.url)} alt={photo.categoryLabel || category.label} className="h-full w-full object-cover" /><span className="absolute bottom-1.5 left-1.5 rounded-full bg-slate-950/70 px-2 py-1 text-[10px] text-white">{photo.categoryLabel || category.label}</span></a>)}</div></section>; })}</div></div></div></div></div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-100 p-3"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 font-semibold text-slate-800">{value}</p></div>;
}
