import { Bell, Search, Briefcase, Users, Package, Calendar } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useFirebaseSync } from "../hooks/useFirebaseSync";

export function Header({ setActiveTab }: { setActiveTab?: (tab: string) => void }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const searchRef = useRef<HTMLDivElement>(null);

  const [projectBoardData] = useFirebaseSync<any[]>("projectBoardData", []);
  const [personnelData] = useFirebaseSync<any[]>("personnelData", []);
  const [materialsData] = useFirebaseSync<any[]>("materialsData", []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    const query = searchQuery.toLowerCase();
    const newResults = [];

    // Search Projects
    try {
      projectBoardData.forEach((col: any) => {
        col.projects?.forEach((p: any) => {
          if (p.name.toLowerCase().includes(query) || p.manager.toLowerCase().includes(query)) {
            newResults.push({ type: 'project', title: p.name, subtitle: `负责人: ${p.manager}`, icon: Briefcase, tab: 'board' });
          }
        });
      });
    } catch(e) {}

    // Search Personnel
    try {
      personnelData.forEach((p: any) => {
        if (p.name.toLowerCase().includes(query) || p.id.toLowerCase().includes(query)) {
          newResults.push({ type: 'personnel', title: p.name, subtitle: `${p.role} - ${p.projects?.[0]?.name || ''}`, icon: Users, tab: 'personnel' });
        }
      });
    } catch(e) {}

    // Search Materials
    try {
      materialsData.forEach((m: any) => {
        if (m.name.toLowerCase().includes(query) || m.id.toLowerCase().includes(query)) {
          newResults.push({ type: 'material', title: m.name, subtitle: `库存: ${m.stock} ${m.unit} - ${m.location}`, icon: Package, tab: 'materials' });
        }
      });
    } catch(e) {}

    setResults(newResults.slice(0, 5)); // Limit to 5 results
  }, [searchQuery, projectBoardData, personnelData, materialsData]);

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 sticky top-0 z-10">
      <div className="relative" ref={searchRef}>
        <div className={`flex items-center bg-slate-100 rounded-lg px-3 py-2 w-96 transition-shadow ${isFocused ? 'ring-2 ring-indigo-500/50 bg-white border border-indigo-200' : 'border border-transparent'}`}>
          <Search className="w-4 h-4 text-slate-400 mr-2" />
          <input 
            type="text" 
            placeholder="搜索项目、人员或物资..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setIsFocused(true)}
            className="bg-transparent border-none outline-none text-sm w-full text-slate-700 placeholder:text-slate-400"
          />
        </div>

        {/* Search Dropdown */}
        {isFocused && searchQuery.trim() && (
          <div className="absolute top-full left-0 mt-2 w-full bg-white rounded-xl shadow-lg border border-slate-100 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
            {results.length > 0 ? (
              <div className="py-2">
                {results.map((result, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      if (setActiveTab) setActiveTab(result.tab);
                      setIsFocused(false);
                      setSearchQuery("");
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-start gap-3 transition-colors"
                  >
                    <div className="p-2 bg-slate-100 rounded-lg text-slate-500 shrink-0">
                      <result.icon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{result.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{result.subtitle}</p>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-sm text-slate-500">
                未找到相关结果
              </div>
            )}
          </div>
        )}
      </div>
      
      <div className="flex items-center gap-4">
        <button className="relative p-2 text-slate-400 hover:text-slate-600 transition-colors rounded-full hover:bg-slate-100">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
        </button>
      </div>
    </header>
  );
}
