import React, { useState } from "react";
import { Plus, Save, X, Building2, Package, DollarSign, Calendar, Truck } from "lucide-react";
import { useFirebaseSync } from "../hooks/useFirebaseSync";

export function ProcurementEntry({ onClose }: { onClose: () => void }) {
  const [projectBoardData] = useFirebaseSync("projectBoardData", []);
  const [supplyOrders, setSupplyOrders] = useFirebaseSync("supplyOrders", []);
  const [costData, setCostData] = useFirebaseSync("costDataV2", []);
  const [materialsData, setMaterialsData] = useFirebaseSync("materialsData", []);
  const [scheduleData, setScheduleData] = useFirebaseSync("scheduleData", []);

  const allProjects = projectBoardData.flatMap((col: any) => col.projects || []);

  const [form, setForm] = useState({
    projectId: "",
    supplier: "",
    items: "",
    spec: "",
    quantity: 0,
    unit: "个",
    totalAmount: 0, // in Yuan
    orderDate: new Date().toISOString().split('T')[0],
    expectedDate: "",
    materialType: "未分类"
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.projectId || !form.items || form.totalAmount <= 0) {
      window.dispatchEvent(new CustomEvent('show-toast', { detail: '请填写完整采购信息' }));
      return;
    }

    const project = allProjects.find((p: any) => p.id === form.projectId);
    const projectName = project ? project.name : "未知项目";

    // 1. Add to Supply Chain Orders
    const newOrderId = `PO-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
    const newOrder = {
      id: newOrderId,
      projectId: form.projectId,
      supplier: form.supplier || "未知供应商",
      items: form.items,
      amount: `¥${form.totalAmount.toLocaleString()}`,
      orderDate: form.orderDate,
      expectedDate: form.expectedDate || form.orderDate,
      status: "in-transit"
    };
    setSupplyOrders([newOrder, ...supplyOrders]);

    // 2. Add to Cost Data (actualLedger)
    const amountInWan = form.totalAmount / 10000;
    const newCostRecord = {
      date: form.orderDate,
      type: "material",
      amount: amountInWan,
      description: `采购单 ${newOrderId}: ${form.items}`,
      status: "pending"
    };

    const costExists = costData.some((p: any) => p.id === form.projectId);
    if (costExists) {
      setCostData(costData.map((p: any) => {
        if (p.id === form.projectId) {
          return { ...p, actualLedger: [newCostRecord, ...(p.actualLedger || [])] };
        }
        return p;
      }));
    } else {
      setCostData([...costData, {
        id: form.projectId,
        project: projectName,
        budget: { material: 0, labor: 0, management: 0, risk: 0 },
        actualLedger: [newCostRecord],
        expectedLedger: [],
        collection: { totalExpected: 0, records: [] }
      }]);
    }

    // 3. Add to Materials Inventory (as in-transit)
    const newMaterialId = `M-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
    const newMaterial = {
      id: newMaterialId,
      name: form.items,
      spec: form.spec,
      stock: form.quantity,
      unit: form.unit,
      location: "在途 (待入库)",
      status: "in-transit",
      supplier: form.supplier || "未知供应商",
      project: projectName,
      type: form.materialType
    };
    setMaterialsData([newMaterial, ...materialsData]);

    // 4. Add to Schedule Data (as a milestone task)
    const scheduleExists = scheduleData.some((p: any) => p.id === form.projectId);
    const newTask = {
      id: `t-${Math.floor(Math.random() * 10000)}`,
      name: `[采购到货] ${form.items}`,
      deadline: form.expectedDate || form.orderDate,
      status: "pending",
      assignee: "供应链组"
    };

    if (scheduleExists) {
      setScheduleData(scheduleData.map((p: any) => {
        if (p.id === form.projectId) {
          return { ...p, tasks: [...(p.tasks || []), newTask] };
        }
        return p;
      }));
    } else {
      setScheduleData([...scheduleData, {
        id: form.projectId,
        name: projectName,
        startDate: form.orderDate,
        endDate: form.expectedDate || form.orderDate,
        progress: 0,
        status: "on-track",
        tasks: [newTask]
      }]);
    }

    window.dispatchEvent(new CustomEvent('show-toast', { detail: '采购单已录入，并同步至成本、库存与施工计划' }));
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <h3 className="text-xl font-bold text-slate-900">录入采购单</h3>
            <p className="text-sm text-slate-500 mt-1">录入信息将自动同步至供应链、材料库及成本台账</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          <form id="procurement-form" onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                  <Building2 className="w-4 h-4 text-slate-400" /> 所属项目
                </label>
                <select 
                  required
                  value={form.projectId} 
                  onChange={(e) => setForm({...form, projectId: e.target.value})} 
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
                >
                  <option value="">请选择项目...</option>
                  {allProjects.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="col-span-2 sm:col-span-1">
                <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                  <Truck className="w-4 h-4 text-slate-400" /> 供应商
                </label>
                <input 
                  type="text" 
                  required
                  placeholder="例如: 隆基绿能"
                  value={form.supplier} 
                  onChange={(e) => setForm({...form, supplier: e.target.value})} 
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" 
                />
              </div>

              <div className="col-span-2 sm:col-span-1">
                <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                  <Package className="w-4 h-4 text-slate-400" /> 材料名称
                </label>
                <input 
                  type="text" 
                  required
                  placeholder="例如: 单晶硅光伏组件"
                  value={form.items} 
                  onChange={(e) => setForm({...form, items: e.target.value})} 
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" 
                />
              </div>

              <div className="col-span-2 sm:col-span-1">
                <label className="block text-sm font-medium text-slate-700 mb-1">规格型号</label>
                <input 
                  type="text" 
                  placeholder="例如: 550Wp"
                  value={form.spec} 
                  onChange={(e) => setForm({...form, spec: e.target.value})} 
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" 
                />
              </div>

              <div className="col-span-2 sm:col-span-1">
                <label className="block text-sm font-medium text-slate-700 mb-1">采购数量</label>
                <div className="flex gap-2">
                  <input 
                    type="number" 
                    required
                    min="1"
                    value={form.quantity || ""} 
                    onChange={(e) => setForm({...form, quantity: Number(e.target.value)})} 
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" 
                  />
                  <select 
                    value={form.unit} 
                    onChange={(e) => setForm({...form, unit: e.target.value})} 
                    className="w-24 px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
                  >
                    <option value="个">个</option>
                    <option value="块">块</option>
                    <option value="米">米</option>
                    <option value="吨">吨</option>
                    <option value="套">套</option>
                  </select>
                </div>
              </div>

              <div className="col-span-2 sm:col-span-1">
                <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                  <DollarSign className="w-4 h-4 text-slate-400" /> 采购总额 (元)
                </label>
                <input 
                  type="number" 
                  required
                  min="0"
                  value={form.totalAmount || ""} 
                  onChange={(e) => setForm({...form, totalAmount: Number(e.target.value)})} 
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" 
                />
                <p className="text-xs text-slate-500 mt-1">
                  成本台账将自动折算为: {(form.totalAmount / 10000).toFixed(2)} 万元
                </p>
              </div>

              <div className="col-span-2 sm:col-span-1">
                <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                  <Calendar className="w-4 h-4 text-slate-400" /> 下单日期
                </label>
                <input 
                  type="date" 
                  required
                  value={form.orderDate} 
                  onChange={(e) => setForm({...form, orderDate: e.target.value})} 
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" 
                />
              </div>

              <div className="col-span-2 sm:col-span-1">
                <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                  <Calendar className="w-4 h-4 text-slate-400" /> 预计到货日期
                </label>
                <input 
                  type="date" 
                  required
                  value={form.expectedDate} 
                  onChange={(e) => setForm({...form, expectedDate: e.target.value})} 
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" 
                />
              </div>
            </div>
          </form>
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3">
          <button 
            type="button"
            onClick={onClose} 
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-200/50 rounded-lg transition-colors"
          >
            取消
          </button>
          <button 
            type="submit"
            form="procurement-form"
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors flex items-center gap-2 shadow-sm shadow-indigo-600/20"
          >
            <Save className="w-4 h-4" /> 确认录入
          </button>
        </div>
      </div>
    </div>
  );
}
