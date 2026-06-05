import React, { useState, useEffect } from "react";
import { Truck, Clock, FileText, Search, Filter, ArrowRight, X, Building2, Phone, Star, Plus, MapPin } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { useFirebaseSync } from "@/src/hooks/useFirebaseSync";

const initialSupplyData = [
  { id: "PO-2026-001", projectId: "p5", supplier: "隆基绿能科技股份有限公司", items: "单晶硅光伏组件 550Wp", amount: "¥1,250,000", orderDate: "2026-02-15", expectedDate: "2026-03-20", status: "in-transit" },
  { id: "PO-2026-002", projectId: "p3", supplier: "宁德时代新能源科技", items: "储能电池预制舱 2MWh", amount: "¥3,800,000", orderDate: "2026-01-10", expectedDate: "2026-03-15", status: "delayed" },
  { id: "PO-2026-003", projectId: "p4", supplier: "华为技术有限公司", items: "智能组串式逆变器 100kW", amount: "¥450,000", orderDate: "2026-02-20", expectedDate: "2026-03-10", status: "delivered" },
  { id: "PO-2026-004", projectId: "p1", supplier: "远东电缆有限公司", items: "交联聚乙烯电力电缆", amount: "¥180,000", orderDate: "2026-03-01", expectedDate: "2026-03-25", status: "production" },
  { id: "PO-2026-005", projectId: "p2", supplier: "宝山钢铁股份有限公司", items: "热镀锌C型钢支架", amount: "¥320,000", orderDate: "2026-02-28", expectedDate: "2026-03-18", status: "in-transit" },
];

const initialSupplierData = [
  { id: "SUP-001", name: "隆基绿能科技股份有限公司", category: "光伏组件", contact: "张经理", phone: "13800138000", rating: 4.8, status: "active", shippingAddress: "陕西省西安市长安区航天中路388号" },
  { id: "SUP-002", name: "宁德时代新能源科技", category: "储能设备", contact: "李总", phone: "13900139000", rating: 4.9, status: "active", shippingAddress: "福建省宁德市蕉城区漳湾镇新能路2号" },
  { id: "SUP-003", name: "华为技术有限公司", category: "逆变器", contact: "王工", phone: "13700137000", rating: 5.0, status: "active", shippingAddress: "广东省深圳市龙岗区坂田华为基地" },
  { id: "SUP-004", name: "远东电缆有限公司", category: "线缆辅材", contact: "赵经理", phone: "13600136000", rating: 4.5, status: "active", shippingAddress: "江苏省宜兴市高塍镇远东大道6号" },
  { id: "SUP-005", name: "宝山钢铁股份有限公司", category: "钢材支架", contact: "刘总", phone: "13500135000", rating: 4.7, status: "active", shippingAddress: "上海市宝山区富锦路885号" },
];

const statusConfig = {
  "delivered": { label: "已交付", color: "text-emerald-700 bg-emerald-100" },
  "in-transit": { label: "运输中", color: "text-blue-700 bg-blue-100" },
  "production": { label: "生产中", color: "text-amber-700 bg-amber-100" },
  "delayed": { label: "逾期风险", color: "text-rose-700 bg-rose-100" },
};

export function SupplyChain({ defaultTab = "orders", hideHeader = false }: { defaultTab?: "orders" | "reconciliation", hideHeader?: boolean }) {
  const [orders, setOrders] = useFirebaseSync("supplyOrders", initialSupplyData);
  const [suppliers, setSuppliers] = useFirebaseSync("suppliers", initialSupplierData);
  const [projectBoardData] = useFirebaseSync("projectBoardData", []);
  const [bomData] = useFirebaseSync("bomData", [
    { id: "BOM-001", name: "单晶硅光伏组件", spec: "550Wp", plannedQty: 2000, procuredQty: 1200, unit: "块", project: "A区商业综合体" },
    { id: "BOM-002", name: "热镀锌钢支架", spec: "C型钢 41x41x2.0", plannedQty: 1000, procuredQty: 500, unit: "米", project: "A区商业综合体" },
  ]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"orders" | "reconciliation">(defaultTab);

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  const allProjects = projectBoardData.flatMap((col: any) => col.projects || []);

  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [isNewSupplierModalOpen, setIsNewSupplierModalOpen] = useState(false);
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);

  const [newSupplierForm, setNewSupplierForm] = useState({
    name: "",
    category: "",
    contact: "",
    phone: "",
    shippingAddress: "",
  });

  const [newOrderForm, setNewOrderForm] = useState({
    projectId: "",
    supplier: "",
    items: "",
    amount: "",
    expectedDate: "",
  });

  const filteredOrders = orders.filter((order: any) => {
    const matchesSearch = order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.supplier.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.items.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesProject = selectedProjectId === "all" || order.projectId === selectedProjectId;
    return matchesSearch && matchesProject;
  });

  const handleCreateOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrderForm.supplier || !newOrderForm.items || !newOrderForm.amount || !newOrderForm.expectedDate || !newOrderForm.projectId) {
      window.dispatchEvent(new CustomEvent('show-toast', { detail: '请填写完整信息' }));
      return;
    }

    const newOrder = {
      id: `PO-${new Date().getFullYear()}-${String(orders.length + 1).padStart(3, '0')}`,
      projectId: newOrderForm.projectId,
      supplier: newOrderForm.supplier,
      items: newOrderForm.items,
      amount: `¥${Number(newOrderForm.amount).toLocaleString()}`,
      orderDate: new Date().toISOString().split('T')[0],
      expectedDate: newOrderForm.expectedDate,
      status: "production"
    };

    setOrders([newOrder, ...orders]);
    setIsNewOrderModalOpen(false);
    setNewOrderForm({ projectId: "", supplier: "", items: "", amount: "", expectedDate: "" });
    window.dispatchEvent(new CustomEvent('show-toast', { detail: '采购单已创建' }));
  };

  const handleCreateSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplierForm.name || !newSupplierForm.category || !newSupplierForm.contact || !newSupplierForm.phone) {
      window.dispatchEvent(new CustomEvent('show-toast', { detail: '请填写完整信息' }));
      return;
    }

    const newSupplier = {
      id: `SUP-${String(suppliers.length + 1).padStart(3, '0')}`,
      name: newSupplierForm.name,
      category: newSupplierForm.category,
      contact: newSupplierForm.contact,
      phone: newSupplierForm.phone,
      shippingAddress: newSupplierForm.shippingAddress,
      rating: 5.0, // Default rating for new suppliers
      status: "active"
    };

    setSuppliers([newSupplier, ...suppliers]);
    setIsNewSupplierModalOpen(false);
    setNewSupplierForm({ name: "", category: "", contact: "", phone: "", shippingAddress: "" });
    window.dispatchEvent(new CustomEvent('show-toast', { detail: '供应商已添加' }));
  };

  return (
    <div className={cn("animate-in fade-in slide-in-from-bottom-4 duration-500", hideHeader ? "space-y-6" : "p-8 space-y-8")}>
        <div className="flex items-center justify-between">
          {!hideHeader ? (
            <div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">供应链管理</h2>
              <p className="text-slate-500 text-sm mt-1">供应商协同、采购订单与物流追踪</p>
            </div>
          ) : (
            <div className="flex-1"></div>
          )}
          <div className="flex gap-3 items-center">
            <div className="flex bg-slate-100 p-1 rounded-lg mr-2">
              <button
                onClick={() => setActiveTab("orders")}
                className={cn("px-4 py-2 rounded-md text-sm font-medium transition-colors", activeTab === "orders" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-600 hover:text-slate-900")}
              >
                采购订单
              </button>
              <button
                onClick={() => setActiveTab("reconciliation")}
                className={cn("px-4 py-2 rounded-md text-sm font-medium transition-colors", activeTab === "reconciliation" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-600 hover:text-slate-900")}
              >
                清单核对
              </button>
            </div>
            <button 
              onClick={() => setIsSupplierModalOpen(true)}
              className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm flex items-center"
            >
              <Building2 className="w-4 h-4 mr-2" />
              供应商名录
            </button>
            <button 
              onClick={() => setIsNewOrderModalOpen(true)}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-600/20 flex items-center"
            >
              <Plus className="w-4 h-4 mr-2" />
              新建采购单
            </button>
          </div>
        </div>

      {activeTab === "orders" ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center">
              <div className="p-4 bg-slate-100 text-slate-600 rounded-xl mr-4">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">执行中订单</p>
                <p className="text-2xl font-bold text-slate-900">{orders.filter((o: any) => o.status !== 'delivered').length} <span className="text-sm font-normal text-slate-400">单</span></p>
              </div>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center">
              <div className="p-4 bg-blue-50 text-blue-600 rounded-xl mr-4">
                <Truck className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">物流运输中</p>
                <p className="text-2xl font-bold text-slate-900">{orders.filter((o: any) => o.status === 'in-transit').length} <span className="text-sm font-normal text-slate-400">批次</span></p>
              </div>
            </div>
            <div className="bg-white p-6 rounded-xl border border-rose-200 shadow-sm flex items-center relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-rose-500"></div>
              <div className="p-4 bg-rose-50 text-rose-600 rounded-xl mr-4">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">逾期交付风险</p>
                <p className="text-2xl font-bold text-rose-600">{orders.filter((o: any) => o.status === 'delayed').length} <span className="text-sm font-normal text-rose-400">单</span></p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between bg-slate-50/50 gap-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center bg-white border border-slate-200 rounded-lg px-3 py-1.5 w-80">
                  <Search className="w-4 h-4 text-slate-400 mr-2" />
                  <input 
                    type="text" 
                    placeholder="搜索订单号、供应商或物品..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-transparent border-none outline-none text-sm w-full text-slate-700"
                  />
                </div>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                >
                  <option value="all">所有项目</option>
                  {allProjects.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <button className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors">
                <Filter className="w-4 h-4" />
              </button>
            </div>
            
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/50 text-slate-500 font-medium border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3">订单编号</th>
                  <th className="px-6 py-3">关联项目</th>
                  <th className="px-6 py-3">供应商</th>
                  <th className="px-6 py-3">采购物品</th>
                  <th className="px-6 py-3">订单金额</th>
                  <th className="px-6 py-3">下单日期</th>
                  <th className="px-6 py-3">预计交期</th>
                  <th className="px-6 py-3">状态</th>
                  <th className="px-6 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.map((order: any) => {
                  const status = statusConfig[order.status as keyof typeof statusConfig];
                  const project = allProjects.find((p: any) => p.id === order.projectId);
                  return (
                    <tr key={order.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-6 py-4 font-mono font-medium text-slate-700">{order.id}</td>
                      <td className="px-6 py-4">
                        {project ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-md bg-indigo-50 text-indigo-700 text-xs font-medium border border-indigo-100">
                            {project.name}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-900">{order.supplier}</td>
                      <td className="px-6 py-4 text-slate-600 truncate max-w-[200px]" title={order.items}>{order.items}</td>
                      <td className="px-6 py-4 font-mono text-slate-700">{order.amount}</td>
                      <td className="px-6 py-4 text-slate-500 font-mono">{order.orderDate}</td>
                      <td className="px-6 py-4 text-slate-500 font-mono">{order.expectedDate}</td>
                      <td className="px-6 py-4">
                        <span className={cn("px-2.5 py-1 rounded-full text-xs font-medium", status?.color || "bg-slate-100 text-slate-700")}>
                          {status?.label || order.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button className="text-emerald-600 hover:text-emerald-700 font-medium flex items-center justify-end w-full opacity-0 group-hover:opacity-100 transition-opacity">
                          详情 <ArrowRight className="w-3.5 h-3.5 ml-1" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filteredOrders.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-6 py-8 text-center text-slate-500">
                      没有找到匹配的订单
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-200 bg-slate-50/50">
            <h3 className="text-lg font-bold text-slate-900 mb-2">材料清单与采购核对 (BOM vs PO)</h3>
            <p className="text-sm text-slate-500">双向核对项目计划材料与实际采购订单，自动识别漏项、数量差异及规格不符。</p>
          </div>
          
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center bg-white border border-slate-200 rounded-lg px-3 py-1.5 w-80">
                <Search className="w-4 h-4 text-slate-400 mr-2" />
                <input 
                  type="text" 
                  placeholder="搜索材料名称、规格..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent border-none outline-none text-sm w-full text-slate-700"
                />
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="flex items-center text-slate-600"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 mr-2"></span>数量匹配</span>
              <span className="flex items-center text-slate-600"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 mr-2"></span>采购不足</span>
              <span className="flex items-center text-slate-600"><span className="w-2.5 h-2.5 rounded-full bg-rose-500 mr-2"></span>漏项/未采购</span>
              <span className="flex items-center text-slate-600"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 mr-2"></span>超买/计划外</span>
            </div>
          </div>

          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/50 text-slate-500 font-medium border-b border-slate-200">
              <tr>
                <th className="px-6 py-3">清单编号</th>
                <th className="px-6 py-3">材料名称</th>
                <th className="px-6 py-3">规格型号</th>
                <th className="px-6 py-3 text-right">计划数量</th>
                <th className="px-6 py-3 text-right">实际采购</th>
                <th className="px-6 py-3 text-right">差异</th>
                <th className="px-6 py-3">关联采购单</th>
                <th className="px-6 py-3 text-center">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bomData.filter((b: any) => {
                const matchesSearch = b.name.includes(searchQuery) || b.spec.includes(searchQuery);
                const matchesProject = selectedProjectId === "all" || b.project === allProjects.find((p: any) => p.id === selectedProjectId)?.name;
                return matchesSearch && matchesProject;
              }).map((bom: any) => {
                // Fuzzy match POs for this BOM item
                const linkedOrders = orders.filter((o: any) => o.items.includes(bom.name) && (selectedProjectId === "all" || o.projectId === selectedProjectId));
                
                // If we had structured items, we would sum them up. For now, we use procuredQty from BOM or estimate from POs.
                // Since bomData already has procuredQty, we'll use that for demonstration, but ideally it's calculated from POs.
                const actualQty = bom.procuredQty || 0;
                const diff = actualQty - bom.plannedQty;
                
                let statusColor = "bg-emerald-500";
                let statusText = "匹配";
                if (actualQty === 0) {
                  statusColor = "bg-rose-500";
                  statusText = "漏项";
                } else if (diff < 0) {
                  statusColor = "bg-amber-500";
                  statusText = "不足";
                } else if (diff > 0) {
                  statusColor = "bg-blue-500";
                  statusText = "超买";
                }

                return (
                  <tr key={bom.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-mono font-medium text-slate-700">{bom.id}</td>
                    <td className="px-6 py-4 font-medium text-slate-900">{bom.name}</td>
                    <td className="px-6 py-4 text-slate-600">{bom.spec}</td>
                    <td className="px-6 py-4 text-right font-mono text-slate-700">{bom.plannedQty} {bom.unit}</td>
                    <td className="px-6 py-4 text-right font-mono text-slate-900 font-medium">{actualQty} {bom.unit}</td>
                    <td className={cn("px-6 py-4 text-right font-mono font-medium", diff < 0 ? "text-rose-600" : diff > 0 ? "text-blue-600" : "text-emerald-600")}>
                      {diff > 0 ? "+" : ""}{diff}
                    </td>
                    <td className="px-6 py-4">
                      {linkedOrders.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {linkedOrders.map((o: any) => (
                            <span key={o.id} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-600 border border-slate-200" title={o.supplier}>
                              {o.id}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={cn("inline-flex items-center px-2 py-1 rounded-full text-xs font-medium text-white", statusColor)}>
                        {statusText}
                      </span>
                    </td>
                  </tr>
                );
              })}
              
              {/* Show Unplanned/Extra POs */}
              {orders.filter((o: any) => {
                const matchesProject = selectedProjectId === "all" || o.projectId === selectedProjectId;
                const isExtra = !bomData.some((b: any) => o.items.includes(b.name));
                return matchesProject && isExtra;
              }).map((order: any) => (
                <tr key={`extra-${order.id}`} className="hover:bg-slate-50 transition-colors bg-blue-50/30">
                  <td className="px-6 py-4 font-mono font-medium text-slate-500">-</td>
                  <td className="px-6 py-4 font-medium text-slate-900">{order.items.split(' ')[0] || order.items}</td>
                  <td className="px-6 py-4 text-slate-600">{order.items.split(' ')[1] || '-'}</td>
                  <td className="px-6 py-4 text-right font-mono text-slate-500">0</td>
                  <td className="px-6 py-4 text-right font-mono text-slate-900 font-medium">未知</td>
                  <td className="px-6 py-4 text-right font-mono font-medium text-blue-600">计划外</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-600 border border-slate-200" title={order.supplier}>
                      {order.id}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium text-white bg-blue-500">
                      计划外
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Supplier Directory Modal */}
      {isSupplierModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-4xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                  <Building2 className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">供应商名录</h3>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setIsNewSupplierModalOpen(true)}
                  className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm flex items-center"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  新增供应商
                </button>
                <button onClick={() => setIsSupplierModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {suppliers.map((supplier: any) => (
                  <div key={supplier.id} className="border border-slate-200 rounded-xl p-4 hover:border-indigo-300 transition-colors bg-slate-50/50">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="font-bold text-slate-900">{supplier.name}</h4>
                        <span className="inline-block px-2 py-1 bg-slate-200/50 text-slate-600 rounded text-xs mt-1">
                          {supplier.category}
                        </span>
                      </div>
                      <div className="flex items-center text-amber-500 bg-amber-50 px-2 py-1 rounded-md text-xs font-medium">
                        <Star className="w-3 h-3 mr-1 fill-current" />
                        {supplier.rating.toFixed(1)}
                      </div>
                    </div>
                    <div className="space-y-2 mt-4 text-sm">
                      <div className="flex items-center text-slate-600">
                        <span className="w-16 text-slate-400">联系人：</span>
                        {supplier.contact}
                      </div>
                      <div className="flex items-center text-slate-600">
                        <span className="w-16 text-slate-400">电话：</span>
                        <span className="flex items-center">
                          <Phone className="w-3 h-3 mr-1 text-slate-400" />
                          {supplier.phone}
                        </span>
                      </div>
                      {supplier.shippingAddress && (
                        <div className="flex items-start text-slate-600">
                          <span className="w-16 text-slate-400 shrink-0">发货地址：</span>
                          <span className="flex items-start">
                            <MapPin className="w-3 h-3 mr-1 mt-1 shrink-0 text-slate-400" />
                            <span className="flex-1">{supplier.shippingAddress}</span>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Supplier Modal */}
      {isNewSupplierModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                  <Plus className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">新增供应商</h3>
              </div>
              <button onClick={() => setIsNewSupplierModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateSupplier} className="p-6 overflow-y-auto space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">供应商名称 <span className="text-rose-500">*</span></label>
                <input 
                  type="text" 
                  required
                  placeholder="例如：某某科技有限公司"
                  value={newSupplierForm.name}
                  onChange={(e) => setNewSupplierForm({...newSupplierForm, name: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">主营品类 <span className="text-rose-500">*</span></label>
                <input 
                  type="text" 
                  required
                  placeholder="例如：光伏组件"
                  value={newSupplierForm.category}
                  onChange={(e) => setNewSupplierForm({...newSupplierForm, category: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">联系人 <span className="text-rose-500">*</span></label>
                  <input 
                    type="text" 
                    required
                    placeholder="例如：张经理"
                    value={newSupplierForm.contact}
                    onChange={(e) => setNewSupplierForm({...newSupplierForm, contact: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">联系电话 <span className="text-rose-500">*</span></label>
                  <input 
                    type="text" 
                    required
                    placeholder="例如：13800138000"
                    value={newSupplierForm.phone}
                    onChange={(e) => setNewSupplierForm({...newSupplierForm, phone: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">发货地址</label>
                <input 
                  type="text" 
                  placeholder="例如：XX省XX市XX区XX路XX号"
                  value={newSupplierForm.shippingAddress}
                  onChange={(e) => setNewSupplierForm({...newSupplierForm, shippingAddress: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 mt-6">
                <button 
                  type="button" 
                  onClick={() => setIsNewSupplierModalOpen(false)} 
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button 
                  type="submit" 
                  className="px-6 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm"
                >
                  确认添加
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Purchase Order Modal */}
      {isNewOrderModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                  <FileText className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">新建采购单</h3>
              </div>
              <button onClick={() => setIsNewOrderModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateOrder} className="p-6 overflow-y-auto space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">关联项目 <span className="text-rose-500">*</span></label>
                <select 
                  required
                  value={newOrderForm.projectId}
                  onChange={(e) => setNewOrderForm({...newOrderForm, projectId: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white"
                >
                  <option value="">请选择关联项目</option>
                  {allProjects.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">供应商 <span className="text-rose-500">*</span></label>
                <select 
                  required
                  value={newOrderForm.supplier}
                  onChange={(e) => setNewOrderForm({...newOrderForm, supplier: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white"
                >
                  <option value="">请选择供应商</option>
                  {suppliers.map((s: any) => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">采购物品 <span className="text-rose-500">*</span></label>
                <input 
                  type="text" 
                  required
                  placeholder="例如：单晶硅光伏组件 550Wp"
                  value={newOrderForm.items}
                  onChange={(e) => setNewOrderForm({...newOrderForm, items: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">订单金额 (元) <span className="text-rose-500">*</span></label>
                <input 
                  type="number" 
                  required
                  min="0"
                  step="0.01"
                  placeholder="例如：1250000"
                  value={newOrderForm.amount}
                  onChange={(e) => setNewOrderForm({...newOrderForm, amount: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">预计交期 <span className="text-rose-500">*</span></label>
                <input 
                  type="date" 
                  required
                  value={newOrderForm.expectedDate}
                  onChange={(e) => setNewOrderForm({...newOrderForm, expectedDate: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 mt-6">
                <button 
                  type="button" 
                  onClick={() => setIsNewOrderModalOpen(false)} 
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button 
                  type="submit" 
                  className="px-6 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-sm"
                >
                  确认创建
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

