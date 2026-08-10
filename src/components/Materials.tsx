import React, { useState, useMemo, useRef } from "react";
import { Package, AlertTriangle, CheckCircle, Search, Filter, Plus, X, Download, Upload, History, FileSpreadsheet, ListTodo, TrendingUp, DollarSign, Users, Truck, Camera, Trash2, ArrowUpFromLine, ArrowDownToLine, ClipboardList } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { useFirebaseSync } from "@/src/hooks/useFirebaseSync";
import { useProjectBoardData } from "@/src/hooks/useProjectBoardData";
import { apiClient, API_BASE_URL } from "@/src/lib/apiClient";
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { SupplyChain } from "./SupplyChain";

type InventoryStatus = "sufficient" | "warning" | "critical";

interface InventoryMaterial {
  id: string;
  name: string;
  spec: string;
  stock: number;
  unit: string;
  location: string;
  status: InventoryStatus;
  supplier: string;
  project: string;
  type: string;
  sourceProject?: string;
  inboundAt?: string;
  photos?: string[];
  sourceType?: "project" | "purchase" | "other";
}

interface WarehouseTransaction {
  id: string;
  direction: "inbound" | "outbound";
  materialId: string;
  materialName: string;
  spec: string;
  quantity: number;
  unit: string;
  occurredAt: string;
  sourceProject?: string;
  destinationProject?: string;
  location: string;
  supplier?: string;
  photos: string[];
  remark?: string;
  sourceType?: "project" | "purchase" | "other";
}

const materialsDataInitial: InventoryMaterial[] = [
  { id: "M-001", name: "单晶硅光伏组件", spec: "550Wp", stock: 1200, unit: "块", location: "A区露天堆场", status: "sufficient", supplier: "隆基绿能", project: "A区商业综合体", type: "光伏组件" },
  { id: "M-002", name: "磷酸铁锂电池簇", spec: "280Ah/1P52S", stock: 4, unit: "套", location: "B区恒温库", status: "warning", supplier: "宁德时代", project: "B区住宅一期", type: "储能设备" },
  { id: "M-003", name: "热镀锌钢支架", spec: "C型钢 41x41x2.0", stock: 500, unit: "米", location: "A区钢材库", status: "sufficient", supplier: "宝钢股份", project: "A区商业综合体", type: "钢材构件" },
  { id: "M-004", name: "交联聚乙烯电缆", spec: "YJV22-8.7/15kV 3x70", stock: 150, unit: "米", location: "C区线缆库", status: "critical", supplier: "远东电缆", project: "C区地下车库", type: "线缆" },
  { id: "M-005", name: "智能逆变器", spec: "100kW 组串式", stock: 12, unit: "台", location: "B区设备库", status: "sufficient", supplier: "华为技术", project: "B区住宅一期", type: "逆变设备" },
  { id: "M-006", name: "高强度螺栓", spec: "M12x40 8.8级", stock: 5000, unit: "套", location: "A区五金库", status: "sufficient", supplier: "晋亿实业", project: "市政道路标段", type: "五金辅材" },
];

const initialBomData = [
  { id: "BOM-001", name: "单晶硅光伏组件", spec: "550Wp", plannedQty: 2000, procuredQty: 1200, unit: "块", project: "A区商业综合体" },
  { id: "BOM-002", name: "热镀锌钢支架", spec: "C型钢 41x41x2.0", plannedQty: 1000, procuredQty: 500, unit: "米", project: "A区商业综合体" },
];

const initialBomHistory = [
  { id: "H-001", date: "2026-03-01 10:00", user: "张工 (技术部)", action: "初始导入", details: "导入了A区商业综合体初始材料清单 (BOM v1.0)" },
  { id: "H-002", date: "2026-03-10 14:30", user: "李工 (采购部)", action: "采购单导入", details: "导入采购单 PO-2026-001，更新光伏组件已采购数量 +1200" },
];

const initialPriceData = [
  { id: "M-001", name: "单晶硅光伏组件", spec: "550Wp", price: 0.95, unit: "元/W", date: "2026-03-01", supplier: "隆基绿能" },
  { id: "M-003", name: "热镀锌钢支架", spec: "C型钢 41x41x2.0", price: 5200, unit: "元/吨", date: "2026-02-15", supplier: "宝钢股份" },
];

const initialPriceHistory = [
  { id: "M-001", price: 0.98, unit: "元/W", date: "2026-01-15", supplier: "隆基绿能" },
  { id: "M-001", price: 0.95, unit: "元/W", date: "2026-03-01", supplier: "隆基绿能" },
  { id: "M-003", price: 5000, unit: "元/吨", date: "2026-01-10", supplier: "宝钢股份" },
  { id: "M-003", price: 5200, unit: "元/吨", date: "2026-02-15", supplier: "宝钢股份" },
];

const materialTypes = ["全部类型", "光伏组件", "储能设备", "钢材构件", "线缆", "逆变设备", "五金辅材"];

export function Materials({ setActiveTab }: { setActiveTab?: (tab: string, subTab?: string) => void }) {
  const [data, setData] = useFirebaseSync("materialsData", materialsDataInitial);
  const [warehouseTransactions, setWarehouseTransactions] = useFirebaseSync<WarehouseTransaction[]>("warehouseTransactions", []);
  const [bomData, setBomData] = useFirebaseSync("bomData", initialBomData);
  const [bomHistory, setBomHistory] = useFirebaseSync("bomHistory", initialBomHistory);
  const [currentBomVersion, setCurrentBomVersion] = useFirebaseSync("bomVersion", "v1.0");
  const [priceData, setPriceData] = useFirebaseSync("materialPrices", initialPriceData);
  const [priceHistory, setPriceHistory] = useFirebaseSync("materialPriceHistory", initialPriceHistory);
  
  const [projectBoardData] = useProjectBoardData();
  const allProjects = useMemo(() => {
    const p = projectBoardData.flatMap((col: any) => col.projects || []);
    return ["全部项目", ...p.map((proj: any) => proj.name)];
  }, [projectBoardData]);

  const [activeView, setActiveView] = useState<"inventory" | "ledger" | "pricing" | "supply">("inventory");
  const [selectedProject, setSelectedProject] = useState("全部项目");
  const [selectedType, setSelectedType] = useState("全部类型");
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isOutboundModalOpen, setIsOutboundModalOpen] = useState(false);
  const [isWarehouseHistoryOpen, setIsWarehouseHistoryOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isEditBomModalOpen, setIsEditBomModalOpen] = useState(false);
  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
  const [isPriceHistoryModalOpen, setIsPriceHistoryModalOpen] = useState(false);
  const [selectedMaterialForHistory, setSelectedMaterialForHistory] = useState<any>(null);
  const [editingBomItem, setEditingBomItem] = useState<any>(null);
  const [importPreview, setImportPreview] = useState<{isOpen: boolean, type: 'BOM' | 'PO' | 'INVENTORY' | 'PRICE', data: any[], file: File | null, addToInventory: boolean}>({isOpen: false, type: 'BOM', data: [], file: null, addToInventory: false});
  const [showAlertsOnly, setShowAlertsOnly] = useState(false);
  const [supplyTabContext, setSupplyTabContext] = useState<"orders" | "reconciliation">("orders");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const poFileInputRef = useRef<HTMLInputElement>(null);
  const inventoryFileInputRef = useRef<HTMLInputElement>(null);
  const priceFileInputRef = useRef<HTMLInputElement>(null);
  const inboundPhotoInputRef = useRef<HTMLInputElement>(null);
  const outboundPhotoInputRef = useRef<HTMLInputElement>(null);

  const emptyInboundForm = () => ({
    sourceType: "project" as "project" | "purchase" | "other",
    sourceProject: selectedProject !== "全部项目" ? selectedProject : "",
    name: "",
    spec: "",
    quantity: "",
    unit: "",
    location: "",
    supplier: "",
    type: "",
    inboundAt: new Date().toISOString().slice(0, 16),
    photos: [] as string[],
    remark: "",
  });
  const emptyOutboundForm = () => ({
    materialId: "",
    quantity: "",
    destinationProject: "",
    outboundAt: new Date().toISOString().slice(0, 16),
    photos: [] as string[],
    remark: "",
  });
  const [inboundForm, setInboundForm] = useState(emptyInboundForm);
  const [outboundForm, setOutboundForm] = useState(emptyOutboundForm);

  const filteredData = useMemo(() => {
    return data.filter(m => {
      const matchesProject = selectedProject === "全部项目" || (m.sourceProject || m.project) === selectedProject;
      const matchesType = selectedType === "全部类型" || m.type === selectedType;
      const matchesSearch = m.name.includes(searchQuery) || m.id.toLowerCase().includes(searchQuery.toLowerCase()) || m.spec.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesAlerts = showAlertsOnly ? m.status !== 'sufficient' : true;
      return matchesProject && matchesType && matchesSearch && matchesAlerts;
    });
  }, [data, selectedProject, selectedType, searchQuery, showAlertsOnly]);

  const filteredBomData = useMemo(() => {
    return bomData.filter((m: any) => {
      const matchesProject = selectedProject === "全部项目" || m.project === selectedProject;
      const matchesSearch = m.name.includes(searchQuery) || m.id.toLowerCase().includes(searchQuery.toLowerCase()) || m.spec.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesProject && matchesSearch;
    });
  }, [bomData, selectedProject, searchQuery]);

  const filteredPriceData = useMemo(() => {
    return priceData.filter((m: any) => {
      const matchesSearch = m.name.includes(searchQuery) || m.id.toLowerCase().includes(searchQuery.toLowerCase()) || m.spec.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSearch;
    });
  }, [priceData, searchQuery]);

  const handleExportCSV = () => {
    const headers = ["物资编号", "物资名称", "规格型号", "来源项目", "当前库存", "单位", "存放位置", "供应商", "最近入库时间", "照片数量", "状态"];
    const rows = filteredData.map(m => [
      m.id,
      m.name,
      m.spec,
      m.sourceProject || m.project,
      m.stock.toString(),
      m.unit,
      m.location,
      m.supplier,
      m.inboundAt || "",
      String(m.photos?.length || 0),
      m.status === 'sufficient' ? '充足' : m.status === 'warning' ? '预警' : '短缺'
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `物资清单_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    window.dispatchEvent(new CustomEvent('show-toast', { detail: '已导出物资清单' }));
  };

  const handleAction = (action: string) => {
    window.dispatchEvent(new CustomEvent('show-toast', { detail: `${action} 操作已执行` }));
  };

  const makeMaterialId = () => `M-${Date.now().toString().slice(-8)}`;

  const handlePhotoUpload = async (files: FileList | null, direction: "inbound" | "outbound") => {
    if (!files?.length) return;
    const currentPhotos = direction === "inbound" ? inboundForm.photos : outboundForm.photos;
    const availableSlots = 3 - currentPhotos.length;
    const selectedFiles = Array.from(files).slice(0, availableSlots);
    if (selectedFiles.some(file => file.size > 5 * 1024 * 1024)) {
      window.dispatchEvent(new CustomEvent('show-toast', { detail: '单张照片不能超过 5MB' }));
      return;
    }
    try {
      const uploadedPhotos = await Promise.all(selectedFiles.map(async file => {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        const contentBase64 = dataUrl.split(',')[1] || '';
        const uploaded = await apiClient.uploadFile(file.name, contentBase64);
        return `${API_BASE_URL}${uploaded.url}`;
      }));
      if (direction === "inbound") {
        setInboundForm(prev => ({ ...prev, photos: [...prev.photos, ...uploadedPhotos].slice(0, 3) }));
      } else {
        setOutboundForm(prev => ({ ...prev, photos: [...prev.photos, ...uploadedPhotos].slice(0, 3) }));
      }
      window.dispatchEvent(new CustomEvent('show-toast', { detail: `已上传 ${uploadedPhotos.length} 张照片` }));
    } catch {
      window.dispatchEvent(new CustomEvent('show-toast', { detail: '照片上传失败，请检查网络后重试' }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const quantity = Number(inboundForm.quantity);
    if (!inboundForm.sourceProject || !inboundForm.name.trim() || !inboundForm.spec.trim() || quantity <= 0 || !inboundForm.unit.trim() || !inboundForm.location.trim() || !inboundForm.inboundAt) {
      window.dispatchEvent(new CustomEvent('show-toast', { detail: '请完整填写入库必填信息' }));
      return;
    }

    const existing = data.find(item => item.name.trim() === inboundForm.name.trim() && item.spec.trim() === inboundForm.spec.trim() && item.location.trim() === inboundForm.location.trim());
    const materialId = existing?.id || makeMaterialId();
    if (existing) {
      setData(data.map(item => item.id === existing.id ? {
        ...item,
        stock: item.stock + quantity,
        sourceProject: inboundForm.sourceProject,
        sourceType: inboundForm.sourceType,
        project: inboundForm.sourceProject,
        inboundAt: inboundForm.inboundAt,
        supplier: inboundForm.supplier || item.supplier,
        type: inboundForm.type || item.type,
        photos: inboundForm.photos.length ? inboundForm.photos : item.photos,
        status: "sufficient" as InventoryStatus,
      } : item));
    } else {
      setData([{
        id: materialId,
        name: inboundForm.name.trim(),
        spec: inboundForm.spec.trim(),
        stock: quantity,
        unit: inboundForm.unit.trim(),
        location: inboundForm.location.trim(),
        status: "sufficient",
        supplier: inboundForm.supplier.trim() || "未填写",
        project: inboundForm.sourceProject,
        sourceProject: inboundForm.sourceProject,
        sourceType: inboundForm.sourceType,
        type: inboundForm.type || "未分类",
        inboundAt: inboundForm.inboundAt,
        photos: inboundForm.photos,
      }, ...data]);
    }

    setWarehouseTransactions([{
      id: `WIN-${Date.now()}`,
      direction: "inbound",
      materialId,
      materialName: inboundForm.name.trim(),
      spec: inboundForm.spec.trim(),
      quantity,
      unit: inboundForm.unit.trim(),
      occurredAt: inboundForm.inboundAt,
      sourceProject: inboundForm.sourceProject,
      sourceType: inboundForm.sourceType,
      location: inboundForm.location.trim(),
      supplier: inboundForm.supplier.trim(),
      photos: inboundForm.photos,
      remark: inboundForm.remark.trim(),
    }, ...warehouseTransactions]);
    setInboundForm(emptyInboundForm());
    setIsModalOpen(false);
    window.dispatchEvent(new CustomEvent('show-toast', { detail: '入库登记成功' }));
  };

  const handleOutboundSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const material = data.find(item => item.id === outboundForm.materialId);
    const quantity = Number(outboundForm.quantity);
    if (!material || quantity <= 0 || !outboundForm.destinationProject || !outboundForm.outboundAt) {
      window.dispatchEvent(new CustomEvent('show-toast', { detail: '请完整填写出库必填信息' }));
      return;
    }
    if (quantity > material.stock) {
      window.dispatchEvent(new CustomEvent('show-toast', { detail: `出库数量不能超过当前库存 ${material.stock} ${material.unit}` }));
      return;
    }

    const remaining = material.stock - quantity;
    setData(data.map(item => item.id === material.id ? {
      ...item,
      stock: remaining,
      status: remaining === 0 ? "critical" : remaining <= Math.max(5, quantity * 0.2) ? "warning" : item.status,
    } : item));
    setWarehouseTransactions([{
      id: `WOUT-${Date.now()}`,
      direction: "outbound",
      materialId: material.id,
      materialName: material.name,
      spec: material.spec,
      quantity,
      unit: material.unit,
      occurredAt: outboundForm.outboundAt,
      sourceProject: material.sourceProject || material.project,
      destinationProject: outboundForm.destinationProject,
      location: material.location,
      photos: outboundForm.photos,
      remark: outboundForm.remark.trim(),
    }, ...warehouseTransactions]);
    setOutboundForm(emptyOutboundForm());
    setIsOutboundModalOpen(false);
    window.dispatchEvent(new CustomEvent('show-toast', { detail: '出库登记成功，库存已同步扣减' }));
  };

  const handleImportBOM = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: 'binary' });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const data = XLSX.utils.sheet_to_json(ws);
          
          const parsedData = data.map((row: any, index) => {
            let errors = [];
            if (!row['材料编号']) errors.push('缺少材料编号');
            if (!row['方案计划数量'] || isNaN(Number(row['方案计划数量']))) errors.push('计划数量无效');
            return { ...row, _errors: errors, _rowIndex: index + 1 };
          });
          setImportPreview({ isOpen: true, type: 'BOM', data: parsedData, file, addToInventory: false });
        } catch (error) {
          window.dispatchEvent(new CustomEvent('show-toast', { detail: '文件解析失败，请确保格式正确' }));
        }
      };
      reader.readAsBinaryString(file);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleImportPO = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: 'binary' });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const data = XLSX.utils.sheet_to_json(ws);

          const parsedData = data.map((row: any, index) => {
            let errors = [];
            if (!row['材料编号']) errors.push('缺少材料编号');
            if (!row['采购数量'] || isNaN(Number(row['采购数量']))) errors.push('采购数量无效');
            return { ...row, _errors: errors, _rowIndex: index + 1 };
          });
          setImportPreview({ isOpen: true, type: 'PO', data: parsedData, file, addToInventory: true });
        } catch (error) {
          window.dispatchEvent(new CustomEvent('show-toast', { detail: '文件解析失败，请确保格式正确' }));
        }
      };
      reader.readAsBinaryString(file);
      if (poFileInputRef.current) poFileInputRef.current.value = '';
    }
  };

  const handleImportInventory = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: 'binary' });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const data = XLSX.utils.sheet_to_json(ws);
          
          const parsedData = data.map((row: any, index) => {
            let errors = [];
            if (!row['材料编号']) errors.push('缺少材料编号');
            if (!row['入库数量'] || isNaN(Number(row['入库数量']))) errors.push('入库数量无效');
            return { ...row, _errors: errors, _rowIndex: index + 1 };
          });
          setImportPreview({ isOpen: true, type: 'INVENTORY', data: parsedData, file, addToInventory: false });
        } catch (error) {
          window.dispatchEvent(new CustomEvent('show-toast', { detail: '文件解析失败，请确保格式正确' }));
        }
      };
      reader.readAsBinaryString(file);
      if (inventoryFileInputRef.current) inventoryFileInputRef.current.value = '';
    }
  };

  const handleImportPrice = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: 'binary' });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const data = XLSX.utils.sheet_to_json(ws);
          
          const parsedData = data.map((row: any, index) => {
            let errors = [];
            if (!row['材料编号']) errors.push('缺少材料编号');
            if (!row['单价'] || isNaN(Number(row['单价']))) errors.push('单价无效');
            return { ...row, _errors: errors, _rowIndex: index + 1 };
          });
          setImportPreview({ isOpen: true, type: 'PRICE', data: parsedData, file, addToInventory: false });
        } catch (error) {
          window.dispatchEvent(new CustomEvent('show-toast', { detail: '文件解析失败，请确保格式正确' }));
        }
      };
      reader.readAsBinaryString(file);
      if (priceFileInputRef.current) priceFileInputRef.current.value = '';
    }
  };

  const downloadTemplate = (type: 'BOM' | 'PO' | 'INVENTORY' | 'PRICE') => {
    let headers = [];
    let filename = '';
    if (type === 'BOM') {
      headers = ['材料编号', '材料名称', '规格型号', '方案计划数量', '单位', '所属项目'];
      filename = '材料清单(BOM)导入模板.xlsx';
    } else if (type === 'PO') {
      headers = ['材料编号', '采购数量', '供应商'];
      filename = '采购单导入模板.xlsx';
    } else if (type === 'INVENTORY') {
      headers = ['材料编号', '材料名称', '规格型号', '入库数量', '单位', '存放区域', '供应商', '来源项目', '材料类型', '入库时间'];
      filename = '入库登记导入模板.xlsx';
    } else if (type === 'PRICE') {
      headers = ['材料编号', '材料名称', '规格型号', '单价', '单位', '登记日期', '供应商'];
      filename = '价格登记导入模板.xlsx';
    }
    
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, filename);
  };

  const confirmImport = () => {
    const { type, data: parsedData, addToInventory, file } = importPreview;
    const hasErrors = parsedData.some(d => d._errors.length > 0);
    if (hasErrors) {
      window.dispatchEvent(new CustomEvent('show-toast', { detail: '请先修正表格中的错误数据' }));
      return;
    }

    if (type === 'BOM') {
      const newVersionNum = parseFloat(currentBomVersion.replace('v', '')) + 0.1;
      const newVersion = `v${newVersionNum.toFixed(1)}`;
      setCurrentBomVersion(newVersion);

      let newBomData = [...bomData];
      let addedCount = 0;
      let updatedCount = 0;

      parsedData.forEach(row => {
        const existingIndex = newBomData.findIndex(b => b.id === row['材料编号']);
        if (existingIndex >= 0) {
          newBomData[existingIndex] = {
            ...newBomData[existingIndex],
            plannedQty: Number(row['方案计划数量']),
            spec: row['规格型号'] || newBomData[existingIndex].spec,
          };
          updatedCount++;
        } else {
          newBomData.push({
            id: row['材料编号'],
            name: row['材料名称'] || '未知材料',
            spec: row['规格型号'] || '',
            plannedQty: Number(row['方案计划数量']),
            procuredQty: 0,
            unit: row['单位'] || '个',
            project: row['所属项目'] || selectedProject
          });
          addedCount++;
        }
      });
      setBomData(newBomData);

      setBomHistory([{
        id: `H-${Date.now()}`,
        date: new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
        user: "当前用户",
        action: `BOM 升级至 ${newVersion}`,
        details: `导入了材料清单 ${file?.name}，新增 ${addedCount} 项，更新 ${updatedCount} 项`
      }, ...bomHistory]);

    } else if (type === 'PO') {
      let newBomData = [...bomData];
      let newInventoryData = [...data];
      let procuredCount = 0;

      parsedData.forEach(row => {
        const bomIndex = newBomData.findIndex(b => b.id === row['材料编号']);
        const qty = Number(row['采购数量']);
        if (bomIndex >= 0) {
          newBomData[bomIndex].procuredQty += qty;
          procuredCount++;
        }

        if (addToInventory) {
          const invIndex = newInventoryData.findIndex(m => m.id === row['材料编号']);
          if (invIndex >= 0) {
            newInventoryData[invIndex].stock += qty;
          } else if (bomIndex >= 0) {
            newInventoryData.push({
              id: row['材料编号'],
              name: newBomData[bomIndex].name,
              spec: newBomData[bomIndex].spec,
              stock: qty,
              unit: newBomData[bomIndex].unit,
              location: '待分配区域',
              status: 'sufficient',
              supplier: row['供应商'] || '未知供应商',
              project: newBomData[bomIndex].project
            });
          }
        }
      });
      setBomData(newBomData);
      if (addToInventory) setData(newInventoryData);

      setBomHistory([{
        id: `H-${Date.now()}`,
        date: new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
        user: "当前用户",
        action: "采购单导入",
        details: `导入了采购单 ${file?.name}，更新了 ${procuredCount} 项材料的采购进度${addToInventory ? '，并同步入库' : ''}`
      }, ...bomHistory]);
    } else if (type === 'INVENTORY') {
      let newInventoryData = [...data];
      const importedTransactions: WarehouseTransaction[] = [];
      let addedCount = 0;
      let updatedCount = 0;

      parsedData.forEach(row => {
        const existingIndex = newInventoryData.findIndex(m => m.id === row['材料编号']);
        const qty = Number(row['入库数量']);
        
        if (existingIndex >= 0) {
          newInventoryData[existingIndex].stock += qty;
          newInventoryData[existingIndex].location = row['存放区域'] || newInventoryData[existingIndex].location;
          newInventoryData[existingIndex].sourceProject = row['来源项目'] || row['所属项目'] || newInventoryData[existingIndex].sourceProject || newInventoryData[existingIndex].project;
          newInventoryData[existingIndex].inboundAt = row['入库时间'] || new Date().toISOString().slice(0, 16);
          updatedCount++;
        } else {
          newInventoryData.push({
            id: row['材料编号'],
            name: row['材料名称'] || '未知材料',
            spec: row['规格型号'] || '',
            stock: qty,
            unit: row['单位'] || '个',
            location: row['存放区域'] || '待分配区域',
            status: 'sufficient',
            supplier: row['供应商'] || '未知供应商',
            project: row['来源项目'] || row['所属项目'] || selectedProject,
            sourceProject: row['来源项目'] || row['所属项目'] || selectedProject,
            type: row['材料类型'] || '未分类',
            inboundAt: row['入库时间'] || new Date().toISOString().slice(0, 16),
            photos: []
          });
          addedCount++;
        }
        const inventoryItem = newInventoryData.find(m => m.id === row['材料编号']);
        importedTransactions.push({
          id: `WIN-${Date.now()}-${row._rowIndex}`,
          direction: "inbound",
          materialId: row['材料编号'],
          materialName: row['材料名称'] || inventoryItem?.name || '未知材料',
          spec: row['规格型号'] || inventoryItem?.spec || '',
          quantity: qty,
          unit: row['单位'] || inventoryItem?.unit || '个',
          occurredAt: row['入库时间'] || new Date().toISOString().slice(0, 16),
          sourceProject: row['来源项目'] || row['所属项目'] || inventoryItem?.sourceProject || inventoryItem?.project || '未填写',
          location: row['存放区域'] || inventoryItem?.location || '待分配区域',
          supplier: row['供应商'] || inventoryItem?.supplier || '',
          photos: [],
          remark: `批量导入：${file?.name || ''}`,
        });
      });
      setData(newInventoryData);
      setWarehouseTransactions([...importedTransactions, ...warehouseTransactions]);
    } else if (type === 'PRICE') {
      let newPriceData = [...priceData];
      let newPriceHistory = [...priceHistory];

      parsedData.forEach(row => {
        const newPrice = {
          id: row['材料编号'],
          name: row['材料名称'] || '未知材料',
          spec: row['规格型号'] || '',
          price: Number(row['单价']),
          unit: row['单位'] || '元',
          date: row['登记日期'] || new Date().toISOString().split('T')[0],
          supplier: row['供应商'] || '未知供应商',
        };

        const existingIndex = newPriceData.findIndex((p: any) => p.id === newPrice.id);
        if (existingIndex >= 0) {
          newPriceData[existingIndex] = newPrice;
        } else {
          newPriceData.unshift(newPrice);
        }
        newPriceHistory.unshift(newPrice);
      });
      setPriceData(newPriceData);
      setPriceHistory(newPriceHistory);
    }

    setImportPreview({ isOpen: false, type: 'BOM', data: [], file: null, addToInventory: false });
    window.dispatchEvent(new CustomEvent('show-toast', { detail: '导入成功' }));
  };

  const handleEditBomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBomItem) return;

    const originalItem = bomData.find((item: any) => item.id === editingBomItem.id);
    const updatedBomData = bomData.map((item: any) => 
      item.id === editingBomItem.id ? editingBomItem : item
    );
    setBomData(updatedBomData);

    let changes = [];
    if (originalItem.plannedQty !== editingBomItem.plannedQty) changes.push(`计划数量由 ${originalItem.plannedQty} 改为 ${editingBomItem.plannedQty}`);
    if (originalItem.spec !== editingBomItem.spec) changes.push(`规格由 ${originalItem.spec} 改为 ${editingBomItem.spec}`);

    if (changes.length > 0) {
      const newHistory = {
        id: `H-00${bomHistory.length + 1}`,
        date: new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
        user: "当前用户",
        action: "手动修改清单",
        details: `修改了 ${editingBomItem.name} (${editingBomItem.id}): ${changes.join('，')}`
      };
      setBomHistory([newHistory, ...bomHistory]);
    }

    setIsEditBomModalOpen(false);
    setEditingBomItem(null);
    window.dispatchEvent(new CustomEvent('show-toast', { detail: '材料清单修改成功' }));
  };

  return (
    <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-[1600px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">材料与供应链管理</h2>
          <p className="text-slate-500 text-sm mt-1">工程物料库存、清单、价格监控与供应链协同</p>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex bg-slate-100/80 p-1 rounded-xl border border-slate-200/60 mr-2 backdrop-blur-sm">
            <button 
              onClick={() => setActiveView('inventory')} 
              className={cn("px-4 py-2 rounded-lg text-sm font-medium flex items-center transition-all duration-200", activeView === 'inventory' ? "bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200/50" : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50")}
            >
              <Package className="w-4 h-4 mr-2" />
              库存管理
            </button>
            <button 
              onClick={() => setActiveView('ledger')} 
              className={cn("px-4 py-2 rounded-lg text-sm font-medium flex items-center transition-all duration-200", activeView === 'ledger' ? "bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200/50" : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50")}
            >
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              材料台账 (BOM)
            </button>
            <button 
              onClick={() => setActiveView('pricing')} 
              className={cn("px-4 py-2 rounded-lg text-sm font-medium flex items-center transition-all duration-200", activeView === 'pricing' ? "bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200/50" : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50")}
            >
              <TrendingUp className="w-4 h-4 mr-2" />
              价格追踪
            </button>
            <button 
              onClick={() => setActiveView('supply')} 
              className={cn("px-4 py-2 rounded-lg text-sm font-medium flex items-center transition-all duration-200", activeView === 'supply' ? "bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200/50" : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50")}
            >
              <Truck className="w-4 h-4 mr-2" />
              供应链管理
            </button>
          </div>

          {activeView !== 'pricing' && activeView !== 'supply' && (
            <select 
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-medium outline-none hover:border-slate-300 transition-colors shadow-sm focus:ring-2 focus:ring-indigo-500/20"
            >
              {allProjects.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          )}

          {activeView === 'inventory' && (
            <select 
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-medium outline-none hover:border-slate-300 transition-colors shadow-sm focus:ring-2 focus:ring-indigo-500/20"
            >
              {materialTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}

          {activeView === 'inventory' ? (
            <div className="flex items-center gap-2">
              <button onClick={handleExportCSV} className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm flex items-center">
                <Download className="w-4 h-4 mr-2" />
                导出
              </button>
              
              <div className="flex items-center bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <button onClick={() => downloadTemplate('INVENTORY')} className="px-3 py-2 text-slate-500 hover:text-slate-700 hover:bg-slate-50 border-r border-slate-200 transition-colors" title="下载入库模板">
                  <Download className="w-4 h-4" />
                </button>
                <input type="file" ref={inventoryFileInputRef} onChange={handleImportInventory} className="hidden" accept=".xlsx,.xls,.csv" />
                <button onClick={() => inventoryFileInputRef.current?.click()} className="px-4 py-2 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors flex items-center">
                  <Upload className="w-4 h-4 mr-2" />
                  批量入库
                </button>
              </div>

              <button onClick={() => setIsWarehouseHistoryOpen(true)} className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm flex items-center">
                <ClipboardList className="w-4 h-4 mr-2" />
                出入库记录
              </button>
              <button onClick={() => setIsOutboundModalOpen(true)} className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm flex items-center">
                <ArrowUpFromLine className="w-4 h-4 mr-2" />
                出库登记
              </button>
              <button onClick={() => setIsModalOpen(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-all shadow-sm shadow-indigo-600/20 flex items-center active:scale-95">
                <Plus className="w-4 h-4 mr-2" />
                入库登记
              </button>
            </div>
          ) : activeView === 'ledger' ? (
            <div className="flex items-center gap-2">
              <button 
                onClick={() => {
                  setSupplyTabContext('reconciliation');
                  setActiveView('supply');
                }} 
                className="px-4 py-2 bg-white border border-slate-200 text-indigo-600 rounded-xl text-sm font-medium hover:bg-indigo-50 transition-colors shadow-sm flex items-center"
              >
                <ListTodo className="w-4 h-4 mr-2" />
                前往清单核对
              </button>
              <button onClick={() => setIsHistoryModalOpen(true)} className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm flex items-center">
                <History className="w-4 h-4 mr-2" />
                更新记录
              </button>
              
              <div className="flex items-center bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <button onClick={() => downloadTemplate('PO')} className="px-3 py-2 text-slate-500 hover:text-slate-700 hover:bg-slate-50 border-r border-slate-200 transition-colors" title="下载采购单模板">
                  <Download className="w-4 h-4" />
                </button>
                <input type="file" ref={poFileInputRef} onChange={handleImportPO} className="hidden" accept=".xlsx,.xls,.csv" />
                <button onClick={() => poFileInputRef.current?.click()} className="px-4 py-2 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors flex items-center">
                  <Upload className="w-4 h-4 mr-2" />
                  导入采购单
                </button>
              </div>

              <div className="flex items-center bg-indigo-600 rounded-xl shadow-sm shadow-indigo-600/20 overflow-hidden">
                <button onClick={() => downloadTemplate('BOM')} className="px-3 py-2 text-indigo-200 hover:text-white hover:bg-indigo-700 border-r border-indigo-500/50 transition-colors" title="下载BOM模板">
                  <Download className="w-4 h-4" />
                </button>
                <input type="file" ref={fileInputRef} onChange={handleImportBOM} className="hidden" accept=".xlsx,.xls,.csv" />
                <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 text-white text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center">
                  <Upload className="w-4 h-4 mr-2" />
                  导入材料清单
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <button onClick={() => downloadTemplate('PRICE')} className="px-3 py-2 text-slate-500 hover:text-slate-700 hover:bg-slate-50 border-r border-slate-200 transition-colors" title="下载价格登记模板">
                  <Download className="w-4 h-4" />
                </button>
                <input type="file" ref={priceFileInputRef} onChange={handleImportPrice} className="hidden" accept=".xlsx,.xls,.csv" />
                <button onClick={() => priceFileInputRef.current?.click()} className="px-4 py-2 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors flex items-center">
                  <Upload className="w-4 h-4 mr-2" />
                  批量登记
                </button>
              </div>

              <button onClick={() => setIsPriceModalOpen(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-all shadow-sm shadow-indigo-600/20 flex items-center active:scale-95">
                <Plus className="w-4 h-4 mr-2" />
                登记价格
              </button>
            </div>
          )}
        </div>
      </div>

      {activeView === 'inventory' ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] flex items-center hover:shadow-[0_8px_30px_-4px_rgba(0,0,0,0.08)] transition-all duration-300">
              <div className="p-4 bg-indigo-50/80 text-indigo-600 rounded-2xl mr-5 ring-1 ring-indigo-100/50">
                <Package className="w-7 h-7" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">在库物资总类</p>
                <p className="text-3xl font-bold text-slate-900 tracking-tight">
                  {data.filter(m => {
                    const matchesProject = selectedProject === "全部项目" || (m.sourceProject || m.project) === selectedProject;
                    const matchesType = selectedType === "全部类型" || m.type === selectedType;
                    const matchesSearch = m.name.includes(searchQuery) || m.id.toLowerCase().includes(searchQuery.toLowerCase()) || m.spec.toLowerCase().includes(searchQuery.toLowerCase());
                    return matchesProject && matchesType && matchesSearch;
                  }).length} <span className="text-sm font-normal text-slate-400 ml-1">项</span>
                </p>
              </div>
            </div>
            <div 
              onClick={() => setShowAlertsOnly(!showAlertsOnly)}
              className={cn(
                "bg-white p-6 rounded-2xl border shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] flex items-center relative overflow-hidden hover:shadow-[0_8px_30px_-4px_rgba(0,0,0,0.08)] transition-all duration-300 cursor-pointer",
                showAlertsOnly ? "border-rose-500 ring-1 ring-rose-500 bg-rose-50/30" : "border-rose-100"
              )}
            >
              <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-rose-400 to-rose-600"></div>
              <div className="p-4 bg-rose-50/80 text-rose-600 rounded-2xl mr-5 ring-1 ring-rose-100/50">
                <AlertTriangle className="w-7 h-7" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">库存预警</p>
                <p className="text-3xl font-bold text-rose-600 tracking-tight">
                  {data.filter(m => {
                    const matchesProject = selectedProject === "全部项目" || (m.sourceProject || m.project) === selectedProject;
                    const matchesType = selectedType === "全部类型" || m.type === selectedType;
                    const matchesSearch = m.name.includes(searchQuery) || m.id.toLowerCase().includes(searchQuery.toLowerCase()) || m.spec.toLowerCase().includes(searchQuery.toLowerCase());
                    return matchesProject && matchesType && matchesSearch && m.status !== 'sufficient';
                  }).length} <span className="text-sm font-normal text-rose-400 ml-1">项</span>
                </p>
              </div>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] flex items-center hover:shadow-[0_8px_30px_-4px_rgba(0,0,0,0.08)] transition-all duration-300">
              <div className="p-4 bg-emerald-50/80 text-emerald-600 rounded-2xl mr-5 ring-1 ring-emerald-100/50">
                <CheckCircle className="w-7 h-7" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">本周已检验入库</p>
                <p className="text-3xl font-bold text-slate-900 tracking-tight">{warehouseTransactions.filter(record => record.direction === 'inbound' && Date.now() - new Date(record.occurredAt).getTime() <= 7 * 24 * 60 * 60 * 1000).length} <span className="text-sm font-normal text-slate-400 ml-1">批次</span></p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between bg-white/50 backdrop-blur-sm gap-4">
              <div className="flex items-center bg-slate-50/80 border border-slate-200/80 rounded-xl px-4 py-2.5 w-full sm:w-96 focus-within:ring-4 focus-within:ring-indigo-500/10 focus-within:border-indigo-500/50 transition-all duration-300">
                <Search className="w-4 h-4 text-slate-400 mr-3" />
                <input 
                  type="text" 
                  placeholder="搜索材料名称、编号或规格..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent border-none outline-none text-sm w-full text-slate-700 placeholder:text-slate-400"
                />
              </div>
              <button onClick={() => handleAction('筛选')} className="p-2.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors ring-1 ring-transparent hover:ring-indigo-100">
                <Filter className="w-4 h-4" />
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50/80 text-slate-500 font-medium border-b border-slate-200/60">
                  <tr>
                    <th className="px-6 py-4">材料编号</th>
                    <th className="px-6 py-4">材料名称</th>
                    <th className="px-6 py-4">材料类型</th>
                    <th className="px-6 py-4">来源项目</th>
                    <th className="px-6 py-4">规格型号</th>
                    <th className="px-6 py-4">当前库存</th>
                    <th className="px-6 py-4">存放区域</th>
                    <th className="px-6 py-4">状态</th>
                    <th className="px-6 py-4">供应商</th>
                    <th className="px-6 py-4">最近入库/凭证</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/80">
                  {filteredData.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="px-6 py-4 font-mono text-slate-500 text-xs">{item.id}</td>
                      <td className="px-6 py-4 font-medium text-slate-900">{item.name}</td>
                      <td className="px-6 py-4 text-slate-600">
                        <span className="px-2.5 py-1 bg-slate-100/80 text-slate-600 rounded-lg text-xs font-medium border border-slate-200/60">
                          {item.type || '未分类'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600">{item.sourceProject || item.project}</td>
                      <td className="px-6 py-4 text-slate-600">{item.spec}</td>
                      <td className="px-6 py-4 font-mono font-medium text-slate-700">
                        {item.stock} <span className="text-slate-400 font-sans text-xs ml-1">{item.unit}</span>
                      </td>
                      <td className="px-6 py-4 text-slate-600">{item.location}</td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-3 py-1 rounded-full text-xs font-medium inline-flex items-center",
                          item.status === 'sufficient' ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60" : 
                          item.status === 'warning' ? "bg-amber-50 text-amber-700 border border-amber-200/60" : "bg-rose-50 text-rose-700 border border-rose-200/60"
                        )}>
                          {item.status === 'sufficient' ? <CheckCircle className="w-3 h-3 mr-1" /> : item.status === 'warning' ? <AlertTriangle className="w-3 h-3 mr-1" /> : <AlertTriangle className="w-3 h-3 mr-1" />}
                          {item.status === 'sufficient' ? '充足' : item.status === 'warning' ? '预警' : '缺货'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-500">{item.supplier}</td>
                      <td className="px-6 py-4 text-slate-500">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs">{item.inboundAt ? item.inboundAt.replace('T', ' ') : '-'}</span>
                          {!!item.photos?.length && (
                            <span className="inline-flex items-center px-2 py-1 rounded-md bg-indigo-50 text-indigo-600 text-xs">
                              <Camera className="w-3 h-3 mr-1" />{item.photos.length}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredData.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-6 py-16 text-center text-slate-500">
                        <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Package className="w-8 h-8 text-slate-400" />
                        </div>
                        <p className="text-base font-medium text-slate-700 mb-1">暂无库存数据</p>
                        <p className="text-sm">请点击右上角“入库登记”添加材料</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : activeView === 'ledger' ? (
        <>
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between bg-white/50 backdrop-blur-sm gap-4">
              <div className="flex items-center bg-slate-50/80 border border-slate-200/80 rounded-xl px-4 py-2.5 w-full sm:w-96 focus-within:ring-4 focus-within:ring-indigo-500/10 focus-within:border-indigo-500/50 transition-all duration-300">
                <Search className="w-4 h-4 text-slate-400 mr-3" />
                <input 
                  type="text" 
                  placeholder="搜索清单材料名称、编号..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent border-none outline-none text-sm w-full text-slate-700 placeholder:text-slate-400"
                />
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <span className="px-3 py-1.5 bg-indigo-50/80 text-indigo-700 rounded-lg font-mono font-medium border border-indigo-200/60 shadow-sm">当前版本: {currentBomVersion}</span>
                <div className="flex items-center gap-3 bg-slate-50/50 px-3 py-1.5 rounded-lg border border-slate-100">
                  <span className="flex items-center text-slate-600"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 mr-2 shadow-sm"></span>采购完成</span>
                  <span className="flex items-center text-slate-600"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 mr-2 shadow-sm"></span>部分采购</span>
                  <span className="flex items-center text-slate-600"><span className="w-2.5 h-2.5 rounded-full bg-slate-300 mr-2 shadow-sm"></span>未采购</span>
                </div>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50/80 text-slate-500 font-medium border-b border-slate-200/60">
                  <tr>
                    <th className="px-6 py-4">清单编号</th>
                    <th className="px-6 py-4">材料名称</th>
                    <th className="px-6 py-4">所属项目</th>
                    <th className="px-6 py-4">规格型号</th>
                    <th className="px-6 py-4 text-right">方案计划数量</th>
                    <th className="px-6 py-4 text-right">已采购数量</th>
                    <th className="px-6 py-4 text-right">采购进度</th>
                    <th className="px-6 py-4 text-center">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/80">
                  {filteredBomData.map((item: any) => {
                    const progress = item.plannedQty > 0 ? Math.round((item.procuredQty / item.plannedQty) * 100) : 0;
                    const isOverProcured = item.procuredQty > item.plannedQty;
                    const statusColor = isOverProcured ? 'bg-rose-500' : progress >= 100 ? 'bg-emerald-500' : progress > 0 ? 'bg-amber-500' : 'bg-slate-300';
                    
                    return (
                      <tr key={item.id} className={cn("hover:bg-slate-50/80 transition-colors group", isOverProcured && "bg-rose-50/30")}>
                        <td className="px-6 py-4 font-mono text-slate-500 text-xs">{item.id}</td>
                        <td className="px-6 py-4 font-medium text-slate-900">{item.name}</td>
                        <td className="px-6 py-4 text-slate-600">{item.project}</td>
                        <td className="px-6 py-4 text-slate-600">{item.spec}</td>
                        <td className="px-6 py-4 font-mono font-medium text-right text-slate-700">
                          {item.plannedQty} <span className="text-slate-400 font-sans text-xs ml-1">{item.unit}</span>
                        </td>
                        <td className="px-6 py-4 font-mono font-medium text-right">
                          <span className={isOverProcured ? "text-rose-600 font-bold" : "text-indigo-600"}>{item.procuredQty}</span> <span className="text-slate-400 font-sans text-xs ml-1">{item.unit}</span>
                          {isOverProcured && <AlertTriangle className="w-4 h-4 text-rose-500 inline-block ml-1.5" title="超量采购" />}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-3">
                            <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                              <div className={cn("h-full rounded-full transition-all duration-500", statusColor)} style={{ width: `${Math.min(progress, 100)}%` }} />
                            </div>
                            <span className={cn("text-xs font-mono w-9 text-right font-medium", isOverProcured ? "text-rose-600" : "text-slate-600")}>{progress}%</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button 
                            onClick={() => {
                              setEditingBomItem({...item});
                              setIsEditBomModalOpen(true);
                            }}
                            className="text-indigo-600 hover:text-indigo-800 font-medium text-xs opacity-0 group-hover:opacity-100 transition-opacity bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg"
                          >
                            修改方案
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredBomData.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-6 py-16 text-center text-slate-500">
                        <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                          <ListTodo className="w-8 h-8 text-slate-400" />
                        </div>
                        <p className="text-base font-medium text-slate-700 mb-1">暂无材料清单数据</p>
                        <p className="text-sm">请点击右上角“导入材料清单”开始管理</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : activeView === 'pricing' ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] flex items-center hover:shadow-[0_8px_30px_-4px_rgba(0,0,0,0.08)] transition-all duration-300">
              <div className="p-4 bg-emerald-50/80 text-emerald-600 rounded-2xl mr-5 ring-1 ring-emerald-100/50">
                <DollarSign className="w-7 h-7" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">已登记材料</p>
                <p className="text-3xl font-bold text-slate-900 tracking-tight">{priceData.length} <span className="text-sm font-normal text-slate-400 ml-1">项</span></p>
              </div>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] flex items-center hover:shadow-[0_8px_30px_-4px_rgba(0,0,0,0.08)] transition-all duration-300">
              <div className="p-4 bg-indigo-50/80 text-indigo-600 rounded-2xl mr-5 ring-1 ring-indigo-100/50">
                <TrendingUp className="w-7 h-7" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">本月价格更新</p>
                <p className="text-3xl font-bold text-slate-900 tracking-tight">{priceHistory.filter((h: any) => h.date.startsWith(new Date().toISOString().substring(0, 7))).length} <span className="text-sm font-normal text-slate-400 ml-1">次</span></p>
              </div>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] flex items-center hover:shadow-[0_8px_30px_-4px_rgba(0,0,0,0.08)] transition-all duration-300">
              <div className="p-4 bg-amber-50/80 text-amber-600 rounded-2xl mr-5 ring-1 ring-amber-100/50">
                <Users className="w-7 h-7" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">合作供应商</p>
                <p className="text-3xl font-bold text-slate-900 tracking-tight">{new Set(priceData.map((p: any) => p.supplier)).size} <span className="text-sm font-normal text-slate-400 ml-1">家</span></p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between bg-white/50 backdrop-blur-sm gap-4">
              <div className="flex items-center bg-slate-50/80 border border-slate-200/80 rounded-xl px-4 py-2.5 w-full sm:w-96 focus-within:ring-4 focus-within:ring-indigo-500/10 focus-within:border-indigo-500/50 transition-all duration-300">
                <Search className="w-4 h-4 text-slate-400 mr-3" />
                <input 
                  type="text" 
                  placeholder="搜索材料名称、编号..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent border-none outline-none text-sm w-full text-slate-700 placeholder:text-slate-400"
                />
              </div>
              <button onClick={() => handleAction('筛选')} className="p-2.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors ring-1 ring-transparent hover:ring-indigo-100">
                <Filter className="w-4 h-4" />
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50/80 text-slate-500 font-medium border-b border-slate-200/60">
                  <tr>
                    <th className="px-6 py-4">材料编号</th>
                    <th className="px-6 py-4">材料名称</th>
                    <th className="px-6 py-4">规格型号</th>
                    <th className="px-6 py-4">最新单价</th>
                    <th className="px-6 py-4">登记日期</th>
                    <th className="px-6 py-4">供应商</th>
                    <th className="px-6 py-4 text-center">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/80">
                  {filteredPriceData.map((item: any) => (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="px-6 py-4 font-mono text-slate-500 text-xs">{item.id}</td>
                      <td className="px-6 py-4 font-medium text-slate-900">{item.name}</td>
                      <td className="px-6 py-4 text-slate-600">{item.spec}</td>
                      <td className="px-6 py-4 font-mono font-medium text-indigo-600 text-base">
                        {item.price} <span className="text-slate-400 font-sans text-xs ml-1">{item.unit}</span>
                      </td>
                      <td className="px-6 py-4 text-slate-500 font-mono text-xs">{item.date}</td>
                      <td className="px-6 py-4 text-slate-500">{item.supplier}</td>
                      <td className="px-6 py-4 text-center">
                        <button 
                          onClick={() => {
                            setSelectedMaterialForHistory(item);
                            setIsPriceHistoryModalOpen(true);
                          }}
                          className="text-indigo-600 hover:text-indigo-800 font-medium text-xs opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center justify-center bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg"
                        >
                          <History className="w-3.5 h-3.5 mr-1.5" />
                          历史价格
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredPriceData.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-16 text-center text-slate-500">
                        <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                          <TrendingUp className="w-8 h-8 text-slate-400" />
                        </div>
                        <p className="text-base font-medium text-slate-700 mb-1">暂无材料价格数据</p>
                        <p className="text-sm">请点击右上角“登记价格”开始追踪</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : activeView === 'supply' ? (
        <SupplyChain defaultTab={supplyTabContext} hideHeader={true} />
      ) : null}

      {/* 登记价格 Modal */}
      {isPriceModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">登记材料价格</h3>
              <button onClick={() => setIsPriceModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const newPrice = {
                id: formData.get('id') as string,
                name: formData.get('name') as string,
                spec: formData.get('spec') as string,
                price: Number(formData.get('price')),
                unit: formData.get('unit') as string,
                date: formData.get('date') as string,
                supplier: formData.get('supplier') as string,
              };
              
              const existingIndex = priceData.findIndex((p: any) => p.id === newPrice.id);
              if (existingIndex >= 0) {
                const updatedData = [...priceData];
                updatedData[existingIndex] = newPrice;
                setPriceData(updatedData);
              } else {
                setPriceData([newPrice, ...priceData]);
              }
              
              setPriceHistory([newPrice, ...priceHistory]);
              setIsPriceModalOpen(false);
              window.dispatchEvent(new CustomEvent('show-toast', { detail: '价格登记成功' }));
            }} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">材料编号</label>
                <input name="id" type="text" required className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" placeholder="例如：M-001" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">材料名称</label>
                  <input name="name" type="text" required className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" placeholder="输入材料名称" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">规格型号</label>
                  <input name="spec" type="text" required className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" placeholder="输入规格型号" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">单价</label>
                  <input name="price" type="number" step="0.01" required className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">单位</label>
                  <input name="unit" type="text" required className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" placeholder="如：元/W" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">登记日期</label>
                  <input name="date" type="date" required defaultValue={new Date().toISOString().split('T')[0]} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">供应商</label>
                  <input name="supplier" type="text" required className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" placeholder="输入供应商名称" />
                </div>
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setIsPriceModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                  取消
                </button>
                <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm">
                  确认登记
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 历史价格 Modal */}
      {isPriceHistoryModalOpen && selectedMaterialForHistory && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-3xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-indigo-600" />
                <h3 className="text-lg font-bold text-slate-900">历史价格记录 - {selectedMaterialForHistory.name}</h3>
              </div>
              <button onClick={() => setIsPriceHistoryModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-8">
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={priceHistory
                      .filter((h: any) => h.id === selectedMaterialForHistory.id)
                      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())}
                    margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="date" 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#64748b', fontSize: 12 }}
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#64748b', fontSize: 12 }}
                      dx={-10}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
                      formatter={(value: any) => [`${value} ${selectedMaterialForHistory.unit}`, '单价']}
                      labelStyle={{ color: '#64748b', marginBottom: '4px' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="price" 
                      stroke="#4f46e5" 
                      strokeWidth={3}
                      dot={{ r: 4, fill: '#4f46e5', strokeWidth: 2, stroke: '#fff' }}
                      activeDot={{ r: 6, fill: '#4f46e5', strokeWidth: 0 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
                {priceHistory
                  .filter((h: any) => h.id === selectedMaterialForHistory.id)
                  .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map((record: any, index: number) => (
                  <div key={index} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-indigo-100 text-indigo-600 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                      <DollarSign className="w-4 h-4" />
                    </div>
                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-slate-100 bg-white shadow-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-slate-900 text-lg">{record.price} <span className="text-sm font-normal text-slate-500">{record.unit}</span></span>
                        <span className="text-xs font-mono text-slate-400">{record.date}</span>
                      </div>
                      <div className="text-sm text-slate-600 flex items-center gap-1">
                        供应商: {record.supplier}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 入库登记 Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">入库登记</h3>
                <p className="text-sm text-slate-500 mt-1">登记材料来源、规格和现场照片，提交后自动增加库存</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">来源类型 <span className="text-rose-500">*</span></label>
                  <select value={inboundForm.sourceType} onChange={(e) => setInboundForm({...inboundForm, sourceType: e.target.value as any, sourceProject: ""})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white">
                    <option value="project">项目调拨</option>
                    <option value="purchase">新采购材料</option>
                    <option value="other">其他来源</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">入库时间 <span className="text-rose-500">*</span></label>
                  <input type="datetime-local" required value={inboundForm.inboundAt} onChange={(e) => setInboundForm({...inboundForm, inboundAt: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{inboundForm.sourceType === 'project' ? '来源项目' : inboundForm.sourceType === 'purchase' ? '采购批次/来源' : '来源说明'} <span className="text-rose-500">*</span></label>
                <input list={inboundForm.sourceType === 'project' ? "warehouse-source-projects" : undefined} required value={inboundForm.sourceProject} onChange={(e) => setInboundForm({...inboundForm, sourceProject: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" placeholder={inboundForm.sourceType === 'project' ? '选择或直接输入未登记项目名称' : inboundForm.sourceType === 'purchase' ? '如：临时采购 / PO-2026-008' : '请输入材料来源'} />
                <datalist id="warehouse-source-projects">{allProjects.filter(p => p !== "全部项目").map(p => <option key={p} value={p} />)}</datalist>
                {inboundForm.sourceType === 'project' && <p className="mt-1 text-xs text-slate-400">项目未登记时可直接输入名称，不会阻止入库</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">材料名称 <span className="text-rose-500">*</span></label>
                  <input type="text" required value={inboundForm.name} onChange={(e) => setInboundForm({...inboundForm, name: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" placeholder="输入材料名称" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">材料类型</label>
                  <select value={inboundForm.type} onChange={(e) => setInboundForm({...inboundForm, type: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white">
                    <option value="">请选择类型</option>
                    {materialTypes.filter(t => t !== "全部类型").map(t => <option key={t}>{t}</option>)}
                    <option value="其他">其他</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">规格型号 <span className="text-rose-500">*</span></label>
                  <input type="text" required value={inboundForm.spec} onChange={(e) => setInboundForm({...inboundForm, spec: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" placeholder="如：M12×40 / 550Wp" />
                </div>
                <div className="grid grid-cols-[2fr_1fr] gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">入库数量 <span className="text-rose-500">*</span></label>
                    <input type="number" min="0.0001" step="any" required value={inboundForm.quantity} onChange={(e) => setInboundForm({...inboundForm, quantity: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" placeholder="0" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">单位 <span className="text-rose-500">*</span></label>
                    <input type="text" required value={inboundForm.unit} onChange={(e) => setInboundForm({...inboundForm, unit: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" placeholder="个/米/吨" />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">存放区域 <span className="text-rose-500">*</span></label>
                  <input type="text" required value={inboundForm.location} onChange={(e) => setInboundForm({...inboundForm, location: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" placeholder="如：A区钢材库" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">供应商/承运方</label>
                  <input type="text" value={inboundForm.supplier} onChange={(e) => setInboundForm({...inboundForm, supplier: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" placeholder="可选" />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-slate-700">入库照片</label>
                  <span className="text-xs text-slate-400">最多 3 张，单张不超过 5MB</span>
                </div>
                <div className="flex flex-wrap gap-3">
                  {inboundForm.photos.map((photo, index) => (
                    <div key={index} className="relative w-24 h-24 rounded-xl overflow-hidden border border-slate-200 group">
                      <img src={photo} alt={`入库照片 ${index + 1}`} className="w-full h-full object-cover" />
                      <button type="button" onClick={() => setInboundForm({...inboundForm, photos: inboundForm.photos.filter((_, i) => i !== index)})} className="absolute top-1 right-1 p-1.5 rounded-full bg-slate-900/70 text-white opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                  {inboundForm.photos.length < 3 && (
                    <button type="button" onClick={() => inboundPhotoInputRef.current?.click()} className="w-24 h-24 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/50 flex flex-col items-center justify-center transition-colors">
                      <Camera className="w-6 h-6 mb-1" /><span className="text-xs">拍照/上传</span>
                    </button>
                  )}
                  <input ref={inboundPhotoInputRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => { handlePhotoUpload(e.target.files, "inbound"); e.target.value = ''; }} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">备注</label>
                <textarea rows={2} value={inboundForm.remark} onChange={(e) => setInboundForm({...inboundForm, remark: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none" placeholder="验收情况、车牌号等补充信息" />
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                  取消
                </button>
                <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm">
                  确认入库
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 出库登记 Modal */}
      {isOutboundModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">出库登记</h3>
                <p className="text-sm text-slate-500 mt-1">登记出库时间和去向项目，提交后自动扣减库存</p>
              </div>
              <button onClick={() => setIsOutboundModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleOutboundSubmit} className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">选择在库材料 <span className="text-rose-500">*</span></label>
                <select required value={outboundForm.materialId} onChange={(e) => setOutboundForm({...outboundForm, materialId: e.target.value, quantity: ""})} className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
                  <option value="">请选择材料</option>
                  {data.filter(item => item.stock > 0).map(item => <option key={item.id} value={item.id}>{item.name}｜{item.spec}｜库存 {item.stock} {item.unit}｜{item.location}</option>)}
                </select>
              </div>
              {outboundForm.materialId && (() => {
                const material = data.find(item => item.id === outboundForm.materialId);
                return material ? (
                  <div className="grid grid-cols-3 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100 text-sm">
                    <div><p className="text-slate-400 text-xs mb-1">材料规格</p><p className="font-medium text-slate-700">{material.spec}</p></div>
                    <div><p className="text-slate-400 text-xs mb-1">当前库存</p><p className="font-medium text-slate-700">{material.stock} {material.unit}</p></div>
                    <div><p className="text-slate-400 text-xs mb-1">材料来源</p><p className="font-medium text-slate-700">{material.sourceProject || material.project}</p></div>
                  </div>
                ) : null;
              })()}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">出库数量 <span className="text-rose-500">*</span></label>
                  <input type="number" min="0.0001" step="any" required value={outboundForm.quantity} onChange={(e) => setOutboundForm({...outboundForm, quantity: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" placeholder="0" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">出库时间 <span className="text-rose-500">*</span></label>
                  <input type="datetime-local" required value={outboundForm.outboundAt} onChange={(e) => setOutboundForm({...outboundForm, outboundAt: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">去向项目 <span className="text-rose-500">*</span></label>
                <input list="warehouse-destination-projects" required value={outboundForm.destinationProject} onChange={(e) => setOutboundForm({...outboundForm, destinationProject: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" placeholder="选择或输入材料运往的项目" />
                <datalist id="warehouse-destination-projects">{allProjects.filter(p => p !== "全部项目").map(p => <option key={p} value={p} />)}</datalist>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-slate-700">出库照片</label>
                  <span className="text-xs text-slate-400">最多 3 张，单张不超过 5MB</span>
                </div>
                <div className="flex flex-wrap gap-3">
                  {outboundForm.photos.map((photo, index) => (
                    <div key={index} className="relative w-24 h-24 rounded-xl overflow-hidden border border-slate-200 group">
                      <img src={photo} alt={`出库照片 ${index + 1}`} className="w-full h-full object-cover" />
                      <button type="button" onClick={() => setOutboundForm({...outboundForm, photos: outboundForm.photos.filter((_, i) => i !== index)})} className="absolute top-1 right-1 p-1.5 rounded-full bg-slate-900/70 text-white opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                  {outboundForm.photos.length < 3 && (
                    <button type="button" onClick={() => outboundPhotoInputRef.current?.click()} className="w-24 h-24 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/50 flex flex-col items-center justify-center transition-colors">
                      <Camera className="w-6 h-6 mb-1" /><span className="text-xs">拍照/上传</span>
                    </button>
                  )}
                  <input ref={outboundPhotoInputRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => { handlePhotoUpload(e.target.files, "outbound"); e.target.value = ''; }} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">备注</label>
                <textarea rows={2} value={outboundForm.remark} onChange={(e) => setOutboundForm({...outboundForm, remark: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none" placeholder="领用人、车牌号、交接情况等" />
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setIsOutboundModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">取消</button>
                <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm">确认出库</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 出入库记录 Modal */}
      {isWarehouseHistoryOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-5xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[88vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-900">出入库记录</h3>
                <p className="text-sm text-slate-500 mt-1">共 {warehouseTransactions.length} 条流转记录，包含项目去向与照片凭证</p>
              </div>
              <button onClick={() => setIsWarehouseHistoryOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-auto flex-1">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 text-slate-500 sticky top-0 border-b border-slate-200">
                  <tr><th className="px-5 py-3">类型/时间</th><th className="px-5 py-3">材料</th><th className="px-5 py-3">数量</th><th className="px-5 py-3">流转项目</th><th className="px-5 py-3">存放区域</th><th className="px-5 py-3">照片</th><th className="px-5 py-3">备注</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {warehouseTransactions.map(record => (
                    <tr key={record.id} className="hover:bg-slate-50 align-top">
                      <td className="px-5 py-4"><span className={cn("inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium mb-2", record.direction === 'inbound' ? "bg-emerald-50 text-emerald-700" : "bg-indigo-50 text-indigo-700")}>{record.direction === 'inbound' ? <ArrowDownToLine className="w-3 h-3 mr-1" /> : <ArrowUpFromLine className="w-3 h-3 mr-1" />}{record.direction === 'inbound' ? '入库' : '出库'}</span><p className="font-mono text-xs text-slate-500">{record.occurredAt.replace('T', ' ')}</p></td>
                      <td className="px-5 py-4"><p className="font-medium text-slate-900">{record.materialName}</p><p className="text-xs text-slate-500 mt-1">{record.spec} · {record.materialId}</p></td>
                      <td className="px-5 py-4 font-mono font-medium">{record.direction === 'inbound' ? '+' : '-'}{record.quantity} {record.unit}</td>
                      <td className="px-5 py-4"><p className="text-xs text-slate-400">{record.direction === 'inbound' ? '来源' : '去向'}</p><p className="text-slate-700 mt-1">{record.direction === 'inbound' ? record.sourceProject : record.destinationProject}</p></td>
                      <td className="px-5 py-4 text-slate-600">{record.location}</td>
                      <td className="px-5 py-4"><div className="flex -space-x-2">{record.photos.map((photo, index) => <a key={index} href={photo} target="_blank" rel="noreferrer"><img src={photo} alt="流转凭证" className="w-9 h-9 rounded-lg object-cover border-2 border-white shadow-sm" /></a>)}{record.photos.length === 0 && <span className="text-slate-400">-</span>}</div></td>
                      <td className="px-5 py-4 text-slate-500 max-w-48 truncate" title={record.remark}>{record.remark || '-'}</td>
                    </tr>
                  ))}
                  {warehouseTransactions.length === 0 && <tr><td colSpan={7} className="px-6 py-16 text-center text-slate-500"><ClipboardList className="w-9 h-9 mx-auto mb-3 text-slate-300" />暂无出入库记录</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 修改清单 Modal */}
      {isEditBomModalOpen && editingBomItem && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">修改方案材料清单</h3>
              <button onClick={() => setIsEditBomModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleEditBomSubmit} className="p-6 space-y-4">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 mb-4">
                <p className="text-sm font-medium text-slate-800">{editingBomItem.name} <span className="text-slate-400 font-mono text-xs ml-2">{editingBomItem.id}</span></p>
                <p className="text-xs text-slate-500 mt-1">所属项目: {editingBomItem.project}</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">规格型号</label>
                <input 
                  type="text" 
                  required 
                  value={editingBomItem.spec}
                  onChange={(e) => setEditingBomItem({...editingBomItem, spec: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" 
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">方案计划数量</label>
                  <input 
                    type="number" 
                    required 
                    value={editingBomItem.plannedQty}
                    onChange={(e) => setEditingBomItem({...editingBomItem, plannedQty: Number(e.target.value)})}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">单位</label>
                  <input 
                    type="text" 
                    disabled
                    value={editingBomItem.unit}
                    className="w-full px-3 py-2 border border-slate-100 bg-slate-50 text-slate-500 rounded-lg" 
                  />
                </div>
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setIsEditBomModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                  取消
                </button>
                <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm">
                  保存修改
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 更新记录 Modal */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-indigo-600" />
                <h3 className="text-lg font-bold text-slate-900">材料清单更新记录</h3>
              </div>
              <button onClick={() => setIsHistoryModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
                {bomHistory.map((record: any, index: number) => (
                  <div key={record.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-indigo-100 text-indigo-600 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                      <FileSpreadsheet className="w-4 h-4" />
                    </div>
                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-slate-100 bg-white shadow-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-slate-900 text-sm">{record.action}</span>
                        <span className="text-xs font-mono text-slate-400">{record.date}</span>
                      </div>
                      <p className="text-sm text-slate-600 mb-2">{record.details}</p>
                      <div className="text-xs text-slate-400 flex items-center gap-1">
                        <span className="w-4 h-4 rounded-full bg-slate-100 flex items-center justify-center text-[10px] text-slate-600 font-bold">{record.user.charAt(0)}</span>
                        {record.user}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 导入预览 Modal */}
      {importPreview.isOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-4xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {importPreview.type === 'BOM' ? '导入材料清单 (BOM) 预览' : 
                   importPreview.type === 'PO' ? '导入采购单 (PO) 预览' : 
                   importPreview.type === 'INVENTORY' ? '批量入库导入预览' : '批量价格登记预览'}
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  文件: {importPreview.file?.name} | 共解析到 {importPreview.data.length} 条数据
                </p>
              </div>
              <button onClick={() => setImportPreview({ ...importPreview, isOpen: false })} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50">
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 w-16 text-center">行号</th>
                      <th className="px-4 py-3">材料编号</th>
                      {importPreview.type === 'BOM' ? (
                        <>
                          <th className="px-4 py-3">材料名称</th>
                          <th className="px-4 py-3">规格型号</th>
                          <th className="px-4 py-3 text-right">方案计划数量</th>
                        </>
                      ) : importPreview.type === 'PO' ? (
                        <>
                          <th className="px-4 py-3 text-right">采购数量</th>
                          <th className="px-4 py-3">供应商</th>
                        </>
                      ) : importPreview.type === 'INVENTORY' ? (
                        <>
                          <th className="px-4 py-3">材料名称</th>
                          <th className="px-4 py-3">规格型号</th>
                          <th className="px-4 py-3 text-right">入库数量</th>
                          <th className="px-4 py-3">存放区域</th>
                        </>
                      ) : (
                        <>
                          <th className="px-4 py-3">材料名称</th>
                          <th className="px-4 py-3 text-right">单价</th>
                          <th className="px-4 py-3">登记日期</th>
                          <th className="px-4 py-3">供应商</th>
                        </>
                      )}
                      <th className="px-4 py-3">校验状态</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {importPreview.data.map((row, idx) => (
                      <tr key={idx} className={row._errors.length > 0 ? "bg-rose-50/50" : ""}>
                        <td className="px-4 py-3 text-center text-slate-400">{row._rowIndex}</td>
                        <td className="px-4 py-3 font-mono">{row['材料编号'] || '-'}</td>
                        {importPreview.type === 'BOM' ? (
                          <>
                            <td className="px-4 py-3">{row['材料名称'] || '-'}</td>
                            <td className="px-4 py-3">{row['规格型号'] || '-'}</td>
                            <td className="px-4 py-3 text-right font-mono">{row['方案计划数量'] || '-'}</td>
                          </>
                        ) : importPreview.type === 'PO' ? (
                          <>
                            <td className="px-4 py-3 text-right font-mono">{row['采购数量'] || '-'}</td>
                            <td className="px-4 py-3">{row['供应商'] || '-'}</td>
                          </>
                        ) : importPreview.type === 'INVENTORY' ? (
                          <>
                            <td className="px-4 py-3">{row['材料名称'] || '-'}</td>
                            <td className="px-4 py-3">{row['规格型号'] || '-'}</td>
                            <td className="px-4 py-3 text-right font-mono text-indigo-600 font-medium">+{row['入库数量'] || '-'}</td>
                            <td className="px-4 py-3">{row['存放区域'] || '-'}</td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3">{row['材料名称'] || '-'}</td>
                            <td className="px-4 py-3 text-right font-mono text-emerald-600 font-medium">¥{row['单价'] || '-'}</td>
                            <td className="px-4 py-3">{row['登记日期'] || '-'}</td>
                            <td className="px-4 py-3">{row['供应商'] || '-'}</td>
                          </>
                        )}
                        <td className="px-4 py-3">
                          {row._errors.length > 0 ? (
                            <span className="flex items-center text-rose-600 text-xs font-medium">
                              <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                              {row._errors.join(', ')}
                            </span>
                          ) : (
                            <span className="flex items-center text-emerald-600 text-xs font-medium">
                              <CheckCircle className="w-3.5 h-3.5 mr-1" />
                              正常
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 bg-white shrink-0 flex items-center justify-between">
              <div>
                {importPreview.type === 'PO' && (
                  <label className="flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={importPreview.addToInventory}
                      onChange={(e) => setImportPreview({...importPreview, addToInventory: e.target.checked})}
                      className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                    />
                    <span className="ml-2 text-sm font-medium text-slate-700">同时更新至实际库存 (入库登记)</span>
                  </label>
                )}
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setImportPreview({ ...importPreview, isOpen: false })} 
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button 
                  onClick={confirmImport}
                  disabled={importPreview.data.some(d => d._errors.length > 0)}
                  className="px-6 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-lg transition-colors shadow-sm"
                >
                  确认导入
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
