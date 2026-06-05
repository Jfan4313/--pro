import { useState, useMemo } from 'react';
import { DollarSign, TrendingUp, TrendingDown, AlertCircle, Download, PieChart as PieChartIcon, BarChart3, Wallet, Receipt, Edit2, X, Save, Plus, Calendar, CheckCircle, Clock } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useFirebaseSync } from '../hooks/useFirebaseSync';
import { cn } from '../lib/utils';

const initialCostData = [
  {
    id: "p1",
    project: "A区商业综合体",
    budget: {
      material: 2500,
      labor: 1500,
      management: 500,
      risk: 500,
    },
    actualLedger: [
      { id: "AL-1", date: "2026-03-01", type: "material", amount: 500, description: "第一批组件采购" },
      { id: "AL-2", date: "2026-03-10", type: "labor", amount: 300, description: "基础施工人工费" }
    ],
    expectedLedger: [
      { id: "EL-1", date: "2026-04-01", type: "material", amount: 1000, description: "第二批组件及逆变器" },
      { id: "EL-2", date: "2026-04-15", type: "labor", amount: 500, description: "安装调试人工费" }
    ],
    collection: {
      totalExpected: 6000,
      records: [
        { id: "C-1", date: "2026-02-01", amount: 1200, description: "预付款", status: "received" },
        { id: "C-2", date: "2026-05-01", amount: 3000, description: "进度款", status: "pending" }
      ]
    }
  },
  {
    id: "p3",
    project: "B区住宅一期",
    budget: {
      material: 4000,
      labor: 2000,
      management: 1000,
      risk: 1000,
    },
    actualLedger: [
      { id: "AL-3", date: "2026-02-15", type: "material", amount: 2000, description: "钢筋水泥采购" },
      { id: "AL-4", date: "2026-03-05", type: "labor", amount: 1000, description: "主体结构人工费" }
    ],
    expectedLedger: [
      { id: "EL-3", date: "2026-05-01", type: "material", amount: 1500, description: "二次结构材料" },
    ],
    collection: {
      totalExpected: 10000,
      records: [
        { id: "C-3", date: "2026-01-15", amount: 2000, description: "预付款", status: "received" },
        { id: "C-4", date: "2026-06-01", amount: 4000, description: "进度款", status: "pending" }
      ]
    }
  }
];

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

const typeLabels: Record<string, string> = {
  material: "材料费用",
  labor: "人工费用",
  management: "管理成本",
  risk: "风险金"
};

export function CostDashboard() {
  const [costData, setCostData] = useFirebaseSync("costDataV2", initialCostData);
  const [projectBoardData] = useFirebaseSync("projectBoardData", []);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");

  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [isLedgerModalOpen, setIsLedgerModalOpen] = useState(false);
  const [ledgerModalType, setLedgerModalType] = useState<"actual" | "expected" | "collection">("actual");

  const [budgetForm, setBudgetForm] = useState({ material: 0, labor: 0, management: 0, risk: 0, collectionExpected: 0 });
  const [ledgerForm, setLedgerForm] = useState({ date: "", type: "material", amount: 0, description: "", status: "pending" });

  const allProjects = projectBoardData.flatMap((col: any) => col.projects || []);

  // Ensure all projects from projectBoardData exist in costData
  const mergedCostData = useMemo(() => {
    let merged = [...costData];
    allProjects.forEach((p: any) => {
      if (!merged.some(c => c.id === p.id)) {
        merged.push({
          id: p.id,
          project: p.name,
          budget: { material: 0, labor: 0, management: 0, risk: 0 },
          actualLedger: [],
          expectedLedger: [],
          collection: { totalExpected: 0, records: [] }
        });
      }
    });
    return merged;
  }, [costData, allProjects]);

  const selectedProjectData = mergedCostData.find((p: any) => p.id === selectedProjectId);

  // Global Stats
  const globalStats = useMemo(() => {
    let totalBudget = 0;
    let totalActual = 0;
    let totalExpected = 0;
    let totalCollected = 0;
    let totalCollectionExpected = 0;
    let totalAdvancedFunds = 0;
    let delayedCollectionsCount = 0;
    let delayedCollectionsAmount = 0;

    const todayStr = new Date().toISOString().split('T')[0];

    const summaryData = mergedCostData.map((p: any) => {
      const budgetTotal = p.budget.material + p.budget.labor + p.budget.management + p.budget.risk;
      const actualTotal = p.actualLedger.reduce((sum: number, item: any) => sum + item.amount, 0);
      const expectedTotal = p.expectedLedger.reduce((sum: number, item: any) => sum + item.amount, 0);
      const collectedTotal = p.collection.records.filter((r: any) => r.status === 'received').reduce((sum: number, item: any) => sum + item.amount, 0);
      
      const advancedFunds = Math.max(0, actualTotal - collectedTotal);
      
      const delayedRecords = p.collection.records.filter((r: any) => r.status === 'pending' && r.date < todayStr);
      const delayedAmount = delayedRecords.reduce((sum: number, item: any) => sum + item.amount, 0);

      totalBudget += budgetTotal;
      totalActual += actualTotal;
      totalExpected += expectedTotal;
      totalCollected += collectedTotal;
      totalCollectionExpected += p.collection.totalExpected;
      totalAdvancedFunds += advancedFunds;
      delayedCollectionsCount += delayedRecords.length;
      delayedCollectionsAmount += delayedAmount;

      return {
        id: p.id,
        project: p.project,
        budget: budgetTotal,
        actual: actualTotal,
        expected: expectedTotal,
        collected: collectedTotal,
        collectionExpected: p.collection.totalExpected,
        advancedFunds,
        delayedAmount
      };
    });

    return {
      totalBudget,
      totalActual,
      totalExpected,
      totalCollected,
      totalCollectionExpected,
      totalAdvancedFunds,
      delayedCollectionsCount,
      delayedCollectionsAmount,
      summaryData
    };
  }, [mergedCostData]);

  const handleSaveBudget = () => {
    if (!selectedProjectData) return;
    
    // Check if project exists in costData, if not, add it
    const exists = costData.some((p: any) => p.id === selectedProjectId);
    let newData;
    
    if (exists) {
      newData = costData.map((p: any) => {
        if (p.id === selectedProjectId) {
          return { 
            ...p, 
            budget: { 
              material: budgetForm.material,
              labor: budgetForm.labor,
              management: budgetForm.management,
              risk: budgetForm.risk
            },
            collection: {
              ...p.collection,
              totalExpected: budgetForm.collectionExpected
            }
          };
        }
        return p;
      });
    } else {
      newData = [...costData, { 
        ...selectedProjectData, 
        budget: { 
          material: budgetForm.material,
          labor: budgetForm.labor,
          management: budgetForm.management,
          risk: budgetForm.risk
        },
        collection: {
          ...selectedProjectData.collection,
          totalExpected: budgetForm.collectionExpected
        }
      }];
    }
    
    setCostData(newData);
    setIsBudgetModalOpen(false);
    window.dispatchEvent(new CustomEvent('show-toast', { detail: '预算已更新' }));
  };

  const handleSaveLedger = () => {
    if (!selectedProjectData) return;
    if (!ledgerForm.date || !ledgerForm.amount || !ledgerForm.description) {
      window.dispatchEvent(new CustomEvent('show-toast', { detail: '请填写完整信息' }));
      return;
    }

    const newItem = {
      id: `L-${Date.now()}`,
      date: ledgerForm.date,
      type: ledgerForm.type,
      amount: Number(ledgerForm.amount),
      description: ledgerForm.description,
      status: ledgerForm.status
    };

    const exists = costData.some((p: any) => p.id === selectedProjectId);
    let newData;

    if (exists) {
      newData = costData.map((p: any) => {
        if (p.id === selectedProjectId) {
          if (ledgerModalType === "actual") {
            return { ...p, actualLedger: [newItem, ...p.actualLedger] };
          } else if (ledgerModalType === "expected") {
            return { ...p, expectedLedger: [newItem, ...p.expectedLedger] };
          } else if (ledgerModalType === "collection") {
            return { ...p, collection: { ...p.collection, records: [newItem, ...p.collection.records] } };
          }
        }
        return p;
      });
    } else {
      const newProject = { ...selectedProjectData };
      if (ledgerModalType === "actual") {
        newProject.actualLedger = [newItem];
      } else if (ledgerModalType === "expected") {
        newProject.expectedLedger = [newItem];
      } else if (ledgerModalType === "collection") {
        newProject.collection.records = [newItem];
      }
      newData = [...costData, newProject];
    }

    setCostData(newData);
    setIsLedgerModalOpen(false);
    setLedgerForm({ date: "", type: "material", amount: 0, description: "", status: "pending" });
    window.dispatchEvent(new CustomEvent('show-toast', { detail: '台账已更新' }));
  };

  const handleExportCSV = () => {
    window.dispatchEvent(new CustomEvent('show-toast', { detail: '已导出成本报表' }));
  };

  const openBudgetModal = () => {
    if (selectedProjectData) {
      setBudgetForm({ 
        ...selectedProjectData.budget,
        collectionExpected: selectedProjectData.collection.totalExpected
      });
      setIsBudgetModalOpen(true);
    }
  };

  const openLedgerModal = (type: "actual" | "expected" | "collection") => {
    setLedgerModalType(type);
    setLedgerForm({ date: new Date().toISOString().split('T')[0], type: "material", amount: 0, description: "", status: "pending" });
    setIsLedgerModalOpen(true);
  };

  const renderSummaryView = () => (
    <div className="space-y-8">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Wallet className="w-16 h-16 text-indigo-600" />
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <DollarSign className="w-5 h-5" />
            </div>
            <h3 className="font-medium text-slate-600">项目总预算 (万元)</h3>
          </div>
          <p className="text-3xl font-bold text-slate-900">¥{globalStats.totalBudget.toLocaleString()}</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Receipt className="w-16 h-16 text-emerald-600" />
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <BarChart3 className="w-5 h-5" />
            </div>
            <h3 className="font-medium text-slate-600">已发生成本 (万元)</h3>
          </div>
          <p className="text-3xl font-bold text-slate-900">¥{globalStats.totalActual.toLocaleString()}</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <TrendingUp className="w-16 h-16 text-amber-600" />
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
              <TrendingUp className="w-5 h-5" />
            </div>
            <h3 className="font-medium text-slate-600">预计未来成本 (万元)</h3>
          </div>
          <p className="text-3xl font-bold text-slate-900">¥{globalStats.totalExpected.toLocaleString()}</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <PieChartIcon className="w-16 h-16 text-blue-600" />
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <PieChartIcon className="w-5 h-5" />
            </div>
            <h3 className="font-medium text-slate-600">已回款总额 (万元)</h3>
          </div>
          <div className="flex items-end gap-2">
            <p className="text-3xl font-bold text-slate-900">¥{globalStats.totalCollected.toLocaleString()}</p>
          </div>
          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mt-3">
            <div 
              className="h-full rounded-full bg-blue-500" 
              style={{ width: `${Math.min((globalStats.totalCollected / (globalStats.totalCollectionExpected || 1)) * 100, 100)}%` }} 
            />
          </div>
        </div>
      </div>

      {/* Risk and Cash Flow Alerts */}
      {(globalStats.totalAdvancedFunds > 0 || globalStats.delayedCollectionsCount > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {globalStats.totalAdvancedFunds > 0 && (
            <div className="bg-amber-50/80 border border-amber-200/60 rounded-2xl p-5 flex items-start gap-4">
              <div className="bg-amber-100 p-2.5 rounded-xl text-amber-600 shrink-0 mt-1">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-amber-900 text-lg mb-1">资金垫付预警</h4>
                <p className="text-amber-800/80 text-sm leading-relaxed">
                  当前已发生成本大于已回款总额，存在 <span className="font-bold text-amber-700">¥{globalStats.totalAdvancedFunds.toLocaleString()}</span> 万的垫付资金缺口，请关注公司整体现金流，并可能涉及材料提前采购带来的资金占用问题。
                </p>
              </div>
            </div>
          )}

          {globalStats.delayedCollectionsCount > 0 && (
            <div className="bg-rose-50/80 border border-rose-200/60 rounded-2xl p-5 flex items-start gap-4">
              <div className="bg-rose-100 p-2.5 rounded-xl text-rose-600 shrink-0 mt-1">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-rose-900 text-lg mb-1">收款节点延后</h4>
                <p className="text-rose-800/80 text-sm leading-relaxed">
                  检测到 <span className="font-bold text-rose-700">{globalStats.delayedCollectionsCount}</span> 笔已超期的预计收款未达账，涉及金额 <span className="font-bold text-rose-700">¥{globalStats.delayedCollectionsAmount.toLocaleString()}</span> 万。建议尽快催款以保证项目正常运营。
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Chart */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-indigo-500" />
          各项目预算与成本对比
        </h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={globalStats.summaryData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="project" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(value) => `¥${value}`} />
              <Tooltip 
                cursor={{ fill: '#f8fafc' }}
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                formatter={(value: number) => [`¥${value} 万`, '']}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
              <Bar dataKey="budget" name="项目总预算" fill="#cbd5e1" radius={[4, 4, 0, 0]} maxBarSize={40} />
              <Bar dataKey="actual" name="已发生成本" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={40} />
              <Bar dataKey="expected" name="预计未来成本" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900">项目汇总明细</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">项目名称</th>
                <th className="px-6 py-4 text-right">项目总预算 (万)</th>
                <th className="px-6 py-4 text-right">已发生成本 (万)</th>
                <th className="px-6 py-4 text-right">预计未来成本 (万)</th>
                <th className="px-6 py-4 text-right">预测总成本 (万)</th>
                <th className="px-6 py-4 w-48">预算执行率</th>
                <th className="px-6 py-4 text-center">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {globalStats.summaryData.map((project: any) => {
                const totalEstimated = project.actual + project.expected;
                const utilization = project.budget > 0 ? (totalEstimated / project.budget) * 100 : 0;
                const isOverrun = utilization > 100;
                const isWarning = utilization > 90 && utilization <= 100;

                return (
                  <tr key={project.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-900">{project.project}</td>
                    <td className="px-6 py-4 text-right text-slate-600">¥{project.budget.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right text-slate-900 font-medium">¥{project.actual.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right text-amber-600">¥{project.expected.toLocaleString()}</td>
                    <td className={cn("px-6 py-4 text-right font-bold", isOverrun ? "text-rose-600" : "text-slate-900")}>
                      ¥{totalEstimated.toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className={cn("h-full rounded-full", isOverrun ? "bg-rose-500" : isWarning ? "bg-amber-500" : "bg-emerald-500")}
                            style={{ width: `${Math.min(utilization, 100)}%` }}
                          />
                        </div>
                        <span className={cn("text-xs font-medium w-10 text-right", isOverrun ? "text-rose-600" : "text-slate-600")}>
                          {utilization.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {isOverrun ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-600 border border-rose-100">
                          <AlertCircle className="w-3 h-3" /> 超支风险
                        </span>
                      ) : isWarning ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-600 border border-amber-100">
                          <AlertCircle className="w-3 h-3" /> 预警
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-600 border border-emerald-100">
                          正常
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderProjectView = () => {
    if (!selectedProjectData) return null;
    
    const p = selectedProjectData;
    const budgetTotal = p.budget.material + p.budget.labor + p.budget.management + p.budget.risk;
    const actualTotal = p.actualLedger.reduce((sum: number, item: any) => sum + item.amount, 0);
    const expectedTotal = p.expectedLedger.reduce((sum: number, item: any) => sum + item.amount, 0);
    const collectedTotal = p.collection.records.filter((r: any) => r.status === 'received').reduce((sum: number, item: any) => sum + item.amount, 0);

    const advancedFunds = Math.max(0, actualTotal - collectedTotal);
    const delayedRecords = p.collection.records.filter((r: any) => r.status === 'pending' && r.date < new Date().toISOString().split('T')[0]);
    const delayedAmount = delayedRecords.reduce((sum: number, item: any) => sum + item.amount, 0);

    const budgetBreakdown = [
      { name: '材料预算', value: p.budget.material },
      { name: '人工预算', value: p.budget.labor },
      { name: '管理成本', value: p.budget.management },
      { name: '风险金', value: p.budget.risk }
    ].filter(item => item.value > 0);

    return (
      <div className="space-y-8">
        {(advancedFunds > 0 || delayedRecords.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {advancedFunds > 0 && (
              <div className="bg-amber-50/80 border border-amber-200/60 rounded-2xl p-5 flex items-start gap-4">
                <div className="bg-amber-100 p-2.5 rounded-xl text-amber-600 shrink-0 mt-1">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-amber-900 text-lg mb-1">资金垫付</h4>
                  <p className="text-amber-800/80 text-sm leading-relaxed">
                    当前项目发生成本已超出已回款总额，存在垫资情况。金额差距为 <span className="font-bold text-amber-700">¥{advancedFunds.toLocaleString()}</span> 万，需关注回款进度或材料预付款进度。
                  </p>
                </div>
              </div>
            )}
            {delayedRecords.length > 0 && (
              <div className="bg-rose-50/80 border border-rose-200/60 rounded-2xl p-5 flex items-start gap-4">
                <div className="bg-rose-100 p-2.5 rounded-xl text-rose-600 shrink-0 mt-1">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-rose-900 text-lg mb-1">收款节点延后</h4>
                  <p className="text-rose-800/80 text-sm leading-relaxed">
                    当前项目有 <span className="font-bold text-rose-700">{delayedRecords.length}</span> 笔预计收款已越过节点日期但尚未到账，共计 <span className="font-bold text-rose-700">¥{delayedAmount.toLocaleString()}</span> 万。
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <Wallet className="w-5 h-5" />
              </div>
              <button onClick={openBudgetModal} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center">
                <Edit2 className="w-3 h-3 mr-1" /> 编辑预算
              </button>
            </div>
            <h3 className="font-medium text-slate-600 mb-1">项目总预算 (万元)</h3>
            <p className="text-3xl font-bold text-slate-900">¥{budgetTotal.toLocaleString()}</p>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                <Receipt className="w-5 h-5" />
              </div>
              <button onClick={() => openLedgerModal("actual")} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center">
                <Plus className="w-3 h-3 mr-1" /> 记一笔
              </button>
            </div>
            <h3 className="font-medium text-slate-600 mb-1">已发生成本 (万元)</h3>
            <p className="text-3xl font-bold text-slate-900">¥{actualTotal.toLocaleString()}</p>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                <TrendingUp className="w-5 h-5" />
              </div>
              <button onClick={() => openLedgerModal("expected")} className="text-xs text-amber-600 hover:text-amber-700 font-medium flex items-center">
                <Plus className="w-3 h-3 mr-1" /> 记一笔
              </button>
            </div>
            <h3 className="font-medium text-slate-600 mb-1">预计未来成本 (万元)</h3>
            <p className="text-3xl font-bold text-slate-900">¥{expectedTotal.toLocaleString()}</p>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                <DollarSign className="w-5 h-5" />
              </div>
              <button onClick={() => openLedgerModal("collection")} className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center">
                <Plus className="w-3 h-3 mr-1" /> 记一笔
              </button>
            </div>
            <h3 className="font-medium text-slate-600 mb-1">已回款 / 应回款 (万元)</h3>
            <p className="text-3xl font-bold text-slate-900">¥{collectedTotal.toLocaleString()} <span className="text-lg text-slate-400 font-normal">/ {p.collection.totalExpected}</span></p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Budget Breakdown */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
              <PieChartIcon className="w-5 h-5 text-indigo-500" />
              成本预算划分
            </h3>
            <div className="h-[250px] flex flex-col">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={budgetBreakdown}
                    cx="50%"
                    cy="45%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {budgetBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number) => [`¥${value} 万`, '金额']}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Actual Ledger */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Receipt className="w-5 h-5 text-emerald-500" />
                实际已发生费用台账
              </h3>
            </div>
            <div className="overflow-y-auto flex-1 max-h-[300px]">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100 sticky top-0">
                  <tr>
                    <th className="px-6 py-3">日期</th>
                    <th className="px-6 py-3">费用类型</th>
                    <th className="px-6 py-3">费用说明</th>
                    <th className="px-6 py-3 text-right">金额 (万元)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {p.actualLedger.map((item: any) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3 text-slate-500 font-mono">{item.date}</td>
                      <td className="px-6 py-3">
                        <span className="inline-flex items-center px-2 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-medium">
                          {typeLabels[item.type] || item.type}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-slate-900">{item.description}</td>
                      <td className="px-6 py-3 text-right font-medium text-slate-900">¥{item.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                  {p.actualLedger.length === 0 && (
                    <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-500">暂无记录</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Expected Ledger */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-amber-500" />
                预计未来发生费用台账
              </h3>
            </div>
            <div className="overflow-y-auto flex-1 max-h-[300px]">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100 sticky top-0">
                  <tr>
                    <th className="px-6 py-3">预计日期</th>
                    <th className="px-6 py-3">费用类型</th>
                    <th className="px-6 py-3">费用说明</th>
                    <th className="px-6 py-3 text-right">金额 (万元)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {p.expectedLedger.map((item: any) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3 text-slate-500 font-mono flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5" /> {item.date}
                      </td>
                      <td className="px-6 py-3">
                        <span className="inline-flex items-center px-2 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-medium">
                          {typeLabels[item.type] || item.type}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-slate-900">{item.description}</td>
                      <td className="px-6 py-3 text-right font-medium text-amber-600">¥{item.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                  {p.expectedLedger.length === 0 && (
                    <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-500">暂无记录</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Collection Progress */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-blue-500" />
                收款节点与回款进度
              </h3>
            </div>
            <div className="overflow-y-auto flex-1 max-h-[300px]">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100 sticky top-0">
                  <tr>
                    <th className="px-6 py-3">日期</th>
                    <th className="px-6 py-3">款项说明</th>
                    <th className="px-6 py-3 text-right">金额 (万元)</th>
                    <th className="px-6 py-3 text-center">状态</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {p.collection.records.map((item: any) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3 text-slate-500 font-mono">{item.date}</td>
                      <td className="px-6 py-3 text-slate-900">{item.description}</td>
                      <td className="px-6 py-3 text-right font-medium text-slate-900">¥{item.amount.toLocaleString()}</td>
                      <td className="px-6 py-3 text-center">
                        {item.status === 'received' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-600">
                            <CheckCircle className="w-3 h-3" /> 已回款
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-600">
                            <Clock className="w-3 h-3" /> 待回款
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {p.collection.records.length === 0 && (
                    <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-500">暂无记录</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">成本与预算管理</h2>
          <p className="text-slate-500 mt-1">项目预算划分、费用台账与回款进度追踪</p>
        </div>
        <div className="flex items-center gap-4">
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-sm"
          >
            <option value="all">汇总视图 (所有项目)</option>
            {allProjects.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
            {/* Fallback for initial data if not in project board */}
            {!allProjects.some((p: any) => p.id === "p1") && <option value="p1">A区商业综合体</option>}
            {!allProjects.some((p: any) => p.id === "p3") && <option value="p3">B区住宅一期</option>}
          </select>
          <button 
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 hover:text-indigo-600 transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" /> 导出报表
          </button>
        </div>
      </div>

      {selectedProjectId === "all" ? renderSummaryView() : renderProjectView()}

      {/* Budget Modal */}
      {isBudgetModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">编辑项目预算</h3>
              <button onClick={() => setIsBudgetModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">材料预算 (万元)</label>
                  <input type="number" value={budgetForm.material} onChange={(e) => setBudgetForm({...budgetForm, material: Number(e.target.value)})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">人工预算 (万元)</label>
                  <input type="number" value={budgetForm.labor} onChange={(e) => setBudgetForm({...budgetForm, labor: Number(e.target.value)})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">管理成本 (万元)</label>
                  <input type="number" value={budgetForm.management} onChange={(e) => setBudgetForm({...budgetForm, management: Number(e.target.value)})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">风险金 (万元)</label>
                  <input type="number" value={budgetForm.risk} onChange={(e) => setBudgetForm({...budgetForm, risk: Number(e.target.value)})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                </div>
                <div className="col-span-2 pt-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">应回款总额 (万元)</label>
                  <input type="number" value={budgetForm.collectionExpected} onChange={(e) => setBudgetForm({...budgetForm, collectionExpected: Number(e.target.value)})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                </div>
              </div>
              <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
                <span className="text-sm font-medium text-slate-600">项目总预算:</span>
                <span className="text-lg font-bold text-indigo-600">
                  ¥{(Number(budgetForm.material) + Number(budgetForm.labor) + Number(budgetForm.management) + Number(budgetForm.risk)).toLocaleString()} 万
                </span>
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setIsBudgetModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors">取消</button>
              <button onClick={handleSaveBudget} className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2">
                <Save className="w-4 h-4" /> 保存预算
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ledger Modal */}
      {isLedgerModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">
                {ledgerModalType === "actual" ? "录入实际费用" : ledgerModalType === "expected" ? "录入预计未来费用" : "录入回款记录"}
              </h3>
              <button onClick={() => setIsLedgerModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">日期</label>
                <input type="date" value={ledgerForm.date} onChange={(e) => setLedgerForm({...ledgerForm, date: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
              </div>
              
              {ledgerModalType !== "collection" && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">费用类型</label>
                  <select value={ledgerForm.type} onChange={(e) => setLedgerForm({...ledgerForm, type: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
                    <option value="material">材料费用</option>
                    <option value="labor">人工费用</option>
                    <option value="management">管理成本</option>
                    <option value="risk">风险金</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">说明</label>
                <input type="text" placeholder="款项说明..." value={ledgerForm.description} onChange={(e) => setLedgerForm({...ledgerForm, description: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">金额 (万元)</label>
                <input type="number" value={ledgerForm.amount} onChange={(e) => setLedgerForm({...ledgerForm, amount: Number(e.target.value)})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
              </div>

              {ledgerModalType === "collection" && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">状态</label>
                  <select value={ledgerForm.status} onChange={(e) => setLedgerForm({...ledgerForm, status: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
                    <option value="received">已回款</option>
                    <option value="pending">待回款</option>
                  </select>
                </div>
              )}
            </div>
            <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setIsLedgerModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors">取消</button>
              <button onClick={handleSaveLedger} className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2">
                <Save className="w-4 h-4" /> 保存记录
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
