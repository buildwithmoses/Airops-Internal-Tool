import React, { useState, useMemo, useEffect } from 'react';
import {
  Calendar,
  List,
  Users,
  Settings as SettingsIcon,
  Plus,
  X,
  Check,
  ChevronRight,
  ChevronLeft,
  Search,
  Filter,
  MoreHorizontal,
  Clock,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  LayoutGrid,
  Menu
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---

type Status = 'NOT STARTED' | 'IN PROGRESS' | 'AT RISK' | 'COMPLETE';

interface Kickoff {
  id: string;
  customerName: string;
  aeName: string;
  saName: string;
  week: string; // e.g., "2026-W10"
  status: Status;
  tasks: boolean[]; // 7 tasks
  notes: string;
  booked: boolean;
  createdAt: number;
}

interface SA {
  name: string;
  activeProjects: number;
  earlyStage: number;
  midStage: number;
  lateStage: number;
  notes: string;
}

// --- Constants & Seed Data ---

const STANDARD_TASKS = [
  "Intro email sent to customer",
  "Kickoff agenda shared",
  "Internal prep call completed",
  "SA briefed on account",
  "Customer confirmed attendance",
  "Tool access provisioned",
  "Success metrics defined"
];

const INITIAL_SAS: SA[] = [
  { name: "Aaron Lit", activeProjects: 0, earlyStage: 0, midStage: 0, lateStage: 0, notes: "" },
  { name: "AJ Diaz", activeProjects: 0, earlyStage: 0, midStage: 0, lateStage: 0, notes: "" },
  { name: "Andreea Volzer", activeProjects: 0, earlyStage: 0, midStage: 0, lateStage: 0, notes: "" },
  { name: "Anton O'Malley", activeProjects: 0, earlyStage: 0, midStage: 0, lateStage: 0, notes: "" },
  { name: "Arnett Shen", activeProjects: 0, earlyStage: 0, midStage: 0, lateStage: 0, notes: "" },
  { name: "Diana Shiling", activeProjects: 0, earlyStage: 0, midStage: 0, lateStage: 0, notes: "" },
  { name: "Elmi Abdullahi", activeProjects: 0, earlyStage: 0, midStage: 0, lateStage: 0, notes: "" },
  { name: "Henry Moses Jr", activeProjects: 0, earlyStage: 0, midStage: 0, lateStage: 0, notes: "" },
  { name: "Henry Young", activeProjects: 0, earlyStage: 0, midStage: 0, lateStage: 0, notes: "" },
  { name: "Jeremy Kao", activeProjects: 0, earlyStage: 0, midStage: 0, lateStage: 0, notes: "" },
  { name: "Joel Fazecas", activeProjects: 0, earlyStage: 0, midStage: 0, lateStage: 0, notes: "" },
  { name: "John Sellers", activeProjects: 0, earlyStage: 0, midStage: 0, lateStage: 0, notes: "" },
  { name: "Melanie Dell'Olio", activeProjects: 0, earlyStage: 0, midStage: 0, lateStage: 0, notes: "" },
  { name: "Palmer Jones", activeProjects: 0, earlyStage: 0, midStage: 0, lateStage: 0, notes: "" },
  { name: "Richard Li", activeProjects: 0, earlyStage: 0, midStage: 0, lateStage: 0, notes: "" },
  { name: "Shahbaz Mahmood", activeProjects: 0, earlyStage: 0, midStage: 0, lateStage: 0, notes: "" },
  { name: "William Reed", activeProjects: 0, earlyStage: 0, midStage: 0, lateStage: 0, notes: "" },
  { name: "Zoe Febrero", activeProjects: 0, earlyStage: 0, midStage: 0, lateStage: 0, notes: "" },
];

const INITIAL_AES: string[] = [];

// Helper to get week string from date
const getWeekString = (date: Date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNo.toString().padStart(2, '0')}`;
};

// Generate next 8 weeks
const getNextWeeks = () => {
  const weeks = [];
  const now = new Date();
  for (let i = 0; i < 8; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + (i * 7));
    weeks.push(getWeekString(d));
  }
  return weeks;
};

const SEED_KICKOFFS: Kickoff[] = [];

// Helper to get the Monday of an ISO week
const getWeekStartDate = (weekStr: string): Date => {
  const [yearStr, weekNumStr] = weekStr.split('-W');
  const year = parseInt(yearStr);
  const weekNum = parseInt(weekNumStr);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1 + (weekNum - 1) * 7);
  return monday;
};

// Get calendar grid for a given month (weekdays only, Mon-Fri)
const getCalendarDays = (year: number, month: number) => {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  // Monday-based offset, but only count weekdays (Mon=0, Tue=1, Wed=2, Thu=3, Fri=4)
  const dayOfWeek = (firstDay.getDay() + 6) % 7; // 0=Mon, 6=Sun
  const startOffset = Math.min(dayOfWeek, 5); // Cap at 5 (if starts on weekend, no offset needed)
  const days: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const date = new Date(year, month, d);
    const dow = date.getDay();
    if (dow !== 0 && dow !== 6) days.push(date); // Skip Sat & Sun
  }
  while (days.length % 5 !== 0) days.push(null);
  return days;
};

// --- Components ---

const StatusBadge = ({ status }: { status: Status }) => {
  const styles: Record<Status, string> = {
    'NOT STARTED': 'bg-[#dfeae3] text-[#676c79]',
    'IN PROGRESS': 'bg-[#CCFFE0] text-[#008c44]',
    'AT RISK': 'bg-[#FFF3CD] text-[#856404]',
    'COMPLETE': 'bg-[#000d05] text-[#ffffff]'
  };

  return (
    <span className={`mono-label px-2 py-0.5 inline-block ${styles[status]}`}>
      {status}
    </span>
  );
};

const CapacityBadge = ({ score }: { score: 'HIGH' | 'MEDIUM' | 'LOW' }) => {
  const styles = {
    HIGH: 'bg-[#CCFFE0] text-[#008c44]',
    MEDIUM: 'bg-[#EEFF8C] text-[#000d05]',
    LOW: 'bg-[#FFE5E5] text-[#991b1b]'
  };

  return (
    <span className={`mono-label px-2 py-0.5 inline-block ${styles[score]}`}>
      {score}
    </span>
  );
};

const ProgressBar = ({ current, total, compact = false }: { current: number, total: number, compact?: boolean }) => {
  const percentage = (current / total) * 100;
  const fillClass = percentage > 80 ? 'bg-[#00ff64]' : 'bg-[#008c44]';
  
  return (
    <div className="flex items-center gap-2">
      <div className={`flex-1 bg-[#dfeae3] ${compact ? 'h-1' : 'h-1.5'}`}>
        <div 
          className={`${fillClass} h-full transition-all duration-500`} 
          style={{ width: `${percentage}%` }}
        />
      </div>
      {!compact && <span className="mono-label text-[#676c79] min-w-[30px]">{current}/{total}</span>}
    </div>
  );
};

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string; badge?: React.ReactNode }[];
  placeholder?: string;
  className?: string;
  labelClassName?: string;
}

const CustomSelect = ({ value, onChange, options, placeholder, className, labelClassName }: CustomSelectProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = options.find(o => o.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isOpen) setIsOpen(false);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isOpen]);

  return (
    <div className={`relative ${className}`} onClick={(e) => e.stopPropagation()}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-4 py-2 bg-white border border-[#d4e8da] text-sm flex items-center justify-between gap-2 hover:border-[#008c44] transition-colors ${labelClassName || 'mono-label'}`}
      >
        <span className="truncate">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronRight size={14} className={`transition-transform ${isOpen ? 'rotate-90' : ''} text-[#a5aab6]`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full left-0 w-full bg-white border border-[#d4e8da] z-50 shadow-xl mt-1 max-h-60 overflow-y-auto"
          >
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`w-full px-4 py-2 text-left text-sm flex items-center justify-between hover:bg-[#f0faf4] transition-colors ${value === option.value ? 'bg-[#f0faf4] font-bold' : ''} ${labelClassName || 'mono-label'}`}
              >
                <span>{option.label}</span>
                {option.badge}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function App() {
  const [view, setView] = useState<'schedule' | 'all' | 'capacity' | 'settings'>('schedule');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [kickoffs, setKickoffs] = useState<Kickoff[]>(SEED_KICKOFFS);
  const [sas, setSas] = useState<SA[]>(INITIAL_SAS);
  const [saLoadingState, setSaLoadingState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [aes, setAes] = useState<string[]>(INITIAL_AES);
  const [maxSlots, setMaxSlots] = useState(10);

  // Fetch SA data from Asana API
  useEffect(() => {
    setSaLoadingState('loading');
    fetch('/api/asana-sa-data')
      .then(res => res.json())
      .then(json => {
        if (json.data && json.data.length > 0) {
          setSas(json.data.map((sa: any) => ({
            name: sa.name,
            activeProjects: sa.activeProjects,
            earlyStage: sa.earlyStage,
            midStage: sa.midStage,
            lateStage: sa.lateStage,
            notes: sa.notes || '',
          })));
          setSaLoadingState('loaded');
        } else {
          setSaLoadingState('error');
        }
      })
      .catch(() => setSaLoadingState('error'));
  }, []);

  const [selectedKickoffId, setSelectedKickoffId] = useState<string | null>(null);
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [bookingWeek, setBookingWeek] = useState<string>('');
  const [scheduleViewMode, setScheduleViewMode] = useState<'list' | 'calendar'>('calendar');
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  // Filters for All Kickoffs view
  const [filterStatus, setFilterStatus] = useState<Status | 'ALL'>('ALL');
  const [filterSA, setFilterSA] = useState<string | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const nextWeeks = useMemo(() => getNextWeeks(), []);

  const selectedKickoff = useMemo(() => 
    kickoffs.find(k => k.id === selectedKickoffId), 
    [kickoffs, selectedKickoffId]
  );

  // Capacity Score Heuristic
  const getCapacityScore = (saName: string) => {
    const sa = sas.find(s => s.name === saName);
    const upcoming = kickoffs.filter(k => k.saName === saName && k.status !== 'COMPLETE').length;
    if (!sa) return 'HIGH';
    
    if (sa.activeProjects <= 2 && upcoming <= 1) return 'HIGH';
    if (sa.activeProjects >= 5 || upcoming >= 3) return 'LOW';
    return 'MEDIUM';
  };

  const handleToggleTask = (kickoffId: string, taskIndex: number) => {
    setKickoffs(prev => prev.map(k => {
      if (k.id === kickoffId) {
        const newTasks = [...k.tasks];
        newTasks[taskIndex] = !newTasks[taskIndex];
        
        // Auto-update status based on tasks
        let newStatus = k.status;
        const completedCount = newTasks.filter(t => t).length;
        if (completedCount === 7) newStatus = 'COMPLETE';
        else if (completedCount > 0 && k.status === 'NOT STARTED') newStatus = 'IN PROGRESS';
        
        return { ...k, tasks: newTasks, status: newStatus };
      }
      return k;
    }));
  };

  const handleUpdateKickoff = (kickoffId: string, updates: Partial<Kickoff>) => {
    setKickoffs(prev => prev.map(k => k.id === kickoffId ? { ...k, ...updates } : k));
  };

  const handleAddKickoff = (newKickoff: Omit<Kickoff, 'id' | 'createdAt' | 'tasks' | 'booked'>) => {
    const kickoff: Kickoff = {
      ...newKickoff,
      id: Math.random().toString(36).substr(2, 9),
      tasks: new Array(7).fill(false),
      booked: true,
      createdAt: Date.now()
    };
    setKickoffs(prev => [kickoff, ...prev]);
    setIsBookingOpen(false);
  };

  const filteredKickoffs = useMemo(() => {
    return kickoffs.filter(k => {
      const matchesStatus = filterStatus === 'ALL' || k.status === filterStatus;
      const matchesSA = filterSA === 'ALL' || k.saName === filterSA;
      const matchesSearch = k.customerName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           k.aeName.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesStatus && matchesSA && matchesSearch;
    });
  }, [kickoffs, filterStatus, filterSA, searchQuery]);

  // --- Views ---

  const calendarDays = useMemo(() => getCalendarDays(calendarMonth.year, calendarMonth.month), [calendarMonth]);

  const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri"];

  const WeeklyScheduleView = () => (
    <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-4">
        <div>
          <h1 className="text-2xl md:text-4xl mb-1">Weekly Schedule</h1>
          <p className="text-[#676c79] text-sm">Manage kickoff volume and slot availability.</p>
        </div>
        <div className="flex items-center gap-1 bg-[#F8FFFA] border border-[#d4e8da] p-1 self-start">
          <button
            onClick={() => setScheduleViewMode('list')}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm font-sans transition-colors ${scheduleViewMode === 'list' ? 'bg-white text-[#000d05] shadow-sm' : 'text-[#676c79] hover:text-[#000d05]'}`}
          >
            <List size={16} /> List
          </button>
          <button
            onClick={() => setScheduleViewMode('calendar')}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm font-sans transition-colors ${scheduleViewMode === 'calendar' ? 'bg-white text-[#000d05] shadow-sm' : 'text-[#676c79] hover:text-[#000d05]'}`}
          >
            <LayoutGrid size={16} /> Calendar
          </button>
        </div>
      </div>

      {scheduleViewMode === 'list' ? (
        <div className="space-y-4">
          {nextWeeks.map(week => {
            const weekKickoffs = kickoffs.filter(k => k.week === week);
            const slotsUsed = weekKickoffs.length;

            return (
              <div key={week} className="border border-[#d4e8da] bg-white p-4 md:p-6 space-y-4 md:space-y-6">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                  <div className="flex items-center gap-4 md:gap-6">
                    <div className="min-w-[100px] md:min-w-[120px]">
                      <h3 className="text-base md:text-lg font-sans font-medium text-[#09090b]">{week}</h3>
                      <p className="mono-label text-[#676c79]">{slotsUsed} / {maxSlots} SLOTS</p>
                    </div>
                    <div className="w-32 md:w-48">
                      <ProgressBar current={slotsUsed} total={maxSlots} />
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setBookingWeek(week);
                      setIsBookingOpen(true);
                    }}
                    className="bg-[#00ff64] text-[#000d05] px-4 py-2 font-sans font-medium text-sm flex items-center gap-2 hover:opacity-90 transition-opacity self-start sm:self-auto"
                  >
                    <Plus size={16} /> Book Slot
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {weekKickoffs.map(k => (
                    <div
                      key={k.id}
                      onClick={() => setSelectedKickoffId(k.id)}
                      className="border border-[#ecedef] p-4 hover:bg-[#f0faf4] cursor-pointer transition-colors group"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h4 className="font-sans font-bold text-sm">{k.customerName}</h4>
                          <p className="text-xs text-[#676c79]">{k.aeName}</p>
                        </div>
                        <StatusBadge status={k.status} />
                      </div>
                      <div className="flex items-center justify-between mt-auto">
                        <span className="mono-label bg-[#CCFFE0] text-[#000d05] px-2 py-0.5">
                          {k.saName}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="mono-label text-[#676c79]">
                            {k.tasks.filter(t => t).length}/7
                          </span>
                          <div className="w-12 h-1 bg-[#dfeae3]">
                            <div
                              className="h-full bg-[#008c44]"
                              style={{ width: `${(k.tasks.filter(t => t).length / 7) * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {weekKickoffs.length === 0 && (
                    <div className="col-span-full py-8 border border-dashed border-[#d4e8da] flex flex-col items-center justify-center text-[#a5aab6]">
                      <Calendar size={24} className="mb-2 opacity-50" />
                      <p className="text-sm">No kickoffs booked for this week</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="border border-[#d4e8da] bg-white">
          {/* Calendar header */}
          <div className="flex items-center justify-between p-4 border-b border-[#d4e8da]">
            <button
              onClick={() => setCalendarMonth(prev => {
                const newMonth = prev.month - 1;
                return newMonth < 0
                  ? { year: prev.year - 1, month: 11 }
                  : { ...prev, month: newMonth };
              })}
              className="p-2 hover:bg-[#f0faf4] transition-colors text-[#676c79] hover:text-[#000d05]"
            >
              <ChevronLeft size={20} />
            </button>
            <h3 className="text-lg font-sans font-medium text-[#09090b]">
              {MONTH_NAMES[calendarMonth.month]} {calendarMonth.year}
            </h3>
            <button
              onClick={() => setCalendarMonth(prev => {
                const newMonth = prev.month + 1;
                return newMonth > 11
                  ? { year: prev.year + 1, month: 0 }
                  : { ...prev, month: newMonth };
              })}
              className="p-2 hover:bg-[#f0faf4] transition-colors text-[#676c79] hover:text-[#000d05]"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          {/* Day labels */}
          <div className="grid grid-cols-5 border-b border-[#d4e8da]">
            {DAY_NAMES.map(day => (
              <div key={day} className="p-2 text-center mono-label text-[#676c79] text-xs">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-5">
            {calendarDays.map((day, idx) => {
              const isToday = day && day.toDateString() === new Date().toDateString();
              const dayWeek = day ? getWeekString(day) : '';
              const dayKickoffs = day ? kickoffs.filter(k => k.week === dayWeek && day.getDay() === 1) : [];
              // Show kickoffs on Mondays of their week, show dot indicators on other weekdays
              const weekHasKickoffs = day ? kickoffs.filter(k => k.week === dayWeek).length : 0;
              const isMonday = day && day.getDay() === 1;

              return (
                <div
                  key={idx}
                  className={`min-h-[60px] md:min-h-[110px] border-b border-r border-[#ecedef] p-1 md:p-2 transition-colors ${
                    day ? 'hover:bg-[#f0faf4]' : 'bg-[#fafafa]'
                  } ${isToday ? 'bg-[#f0faf4]' : ''}`}
                  onClick={() => {
                    if (day) {
                      setBookingWeek(dayWeek);
                      setIsBookingOpen(true);
                    }
                  }}
                >
                  {day && (
                    <>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-sm font-sans ${
                          isToday
                            ? 'bg-[#008c44] text-white w-6 h-6 flex items-center justify-center rounded-full font-bold'
                            : 'text-[#09090b]'
                        }`}>
                          {day.getDate()}
                        </span>
                        {isMonday && weekHasKickoffs > 0 && (
                          <span className="mono-label text-[10px] text-[#676c79]">
                            {weekHasKickoffs} kickoff{weekHasKickoffs !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      {isMonday && dayKickoffs.map(k => (
                        <div
                          key={k.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedKickoffId(k.id);
                          }}
                          className="mb-1 px-1 md:px-1.5 py-0.5 text-[9px] md:text-[11px] truncate cursor-pointer rounded-sm border-l-2 border-[#008c44] bg-[#CCFFE0] text-[#000d05] hover:bg-[#b3f5d0] transition-colors"
                        >
                          {k.customerName}
                        </div>
                      ))}
                      {!isMonday && weekHasKickoffs > 0 && (
                        <div className="flex gap-1 mt-1">
                          {kickoffs.filter(k => k.week === dayWeek).slice(0, 3).map(k => {
                            const dotColor = k.status === 'AT RISK' ? 'bg-[#856404]' : k.status === 'COMPLETE' ? 'bg-[#000d05]' : 'bg-[#008c44]';
                            return <div key={k.id} className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />;
                          })}
                          {kickoffs.filter(k => k.week === dayWeek).length > 3 && (
                            <span className="text-[9px] text-[#676c79]">+{kickoffs.filter(k => k.week === dayWeek).length - 3}</span>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  const AllKickoffsView = () => (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl md:text-4xl mb-1">All Kickoffs</h1>
        <p className="text-[#676c79] text-sm">Full database of all customer kickoff projects.</p>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 md:gap-4 bg-[#F8FFFA] p-3 md:p-4 border border-[#d4e8da]">
        <div className="relative flex-1 min-w-[150px] sm:min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a5aab6]" />
          <input 
            type="text"
            placeholder="Search customer or AE..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-[#d4e8da] text-sm focus:border-[#008c44] outline-none"
          />
        </div>
        
        <CustomSelect
          value={filterStatus}
          onChange={(val) => setFilterStatus(val as any)}
          className="min-w-[140px] sm:min-w-[180px]"
          options={[
            { label: 'ALL STATUSES', value: 'ALL' },
            { label: 'NOT STARTED', value: 'NOT STARTED', badge: <StatusBadge status="NOT STARTED" /> },
            { label: 'IN PROGRESS', value: 'IN PROGRESS', badge: <StatusBadge status="IN PROGRESS" /> },
            { label: 'AT RISK', value: 'AT RISK', badge: <StatusBadge status="AT RISK" /> },
            { label: 'COMPLETE', value: 'COMPLETE', badge: <StatusBadge status="COMPLETE" /> },
          ]}
        />

        <CustomSelect
          value={filterSA}
          onChange={(val) => setFilterSA(val)}
          className="min-w-[140px] sm:min-w-[180px]"
          options={[
            { label: 'ALL SAs', value: 'ALL' },
            ...sas.map(sa => ({ label: sa.name.toUpperCase(), value: sa.name }))
          ]}
        />

        {(filterStatus !== 'ALL' || filterSA !== 'ALL' || searchQuery) && (
          <button 
            onClick={() => {
              setFilterStatus('ALL');
              setFilterSA('ALL');
              setSearchQuery('');
            }}
            className="text-xs text-[#008c44] hover:underline flex items-center gap-1"
          >
            <X size={12} /> Clear Filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="border border-[#d4e8da] overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#F8FFFA] border-bottom border-[#d4e8da]">
              <th className="p-4 mono-label text-[#676c79] font-medium">Customer</th>
              <th className="p-4 mono-label text-[#676c79] font-medium">AE Owner</th>
              <th className="p-4 mono-label text-[#676c79] font-medium">Assigned SA</th>
              <th className="p-4 mono-label text-[#676c79] font-medium">Week</th>
              <th className="p-4 mono-label text-[#676c79] font-medium">Status</th>
              <th className="p-4 mono-label text-[#676c79] font-medium">Tasks</th>
              <th className="p-4 mono-label text-[#676c79] font-medium">Slot</th>
            </tr>
          </thead>
          <tbody>
            {filteredKickoffs.map(k => (
              <tr 
                key={k.id}
                onClick={() => setSelectedKickoffId(k.id)}
                className="border-t border-[#ecedef] hover:bg-[#f0faf4] cursor-pointer transition-colors group"
              >
                <td className="p-4 font-sans font-bold text-sm">{k.customerName}</td>
                <td className="p-4 text-sm text-[#676c79]">{k.aeName}</td>
                <td className="p-4">
                  <span className="mono-label bg-[#CCFFE0] text-[#000d05] px-2 py-0.5">{k.saName}</span>
                </td>
                <td className="p-4 text-sm font-mono">{k.week}</td>
                <td className="p-4"><StatusBadge status={k.status} /></td>
                <td className="p-4 w-32">
                  <ProgressBar current={k.tasks.filter(t => t).length} total={7} compact />
                </td>
                <td className="p-4 text-center">
                  {k.booked ? <Check size={16} className="text-[#008c44] mx-auto" /> : <span className="text-[#a5aab6]">—</span>}
                </td>
              </tr>
            ))}
            {filteredKickoffs.length === 0 && (
              <tr>
                <td colSpan={7} className="p-12 text-center text-[#a5aab6]">
                  <p className="text-sm">No kickoffs match your filters</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const SACapacityView = () => (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl md:text-4xl mb-1">SA Capacity</h1>
        <p className="text-[#676c79] text-sm">Real-time visibility into Solutions Architect workload.</p>
      </div>

      <div className="border border-[#d4e8da] overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#F8FFFA] border-bottom border-[#d4e8da]">
              <th className="p-4 mono-label text-[#676c79] font-medium">SA Name</th>
              <th className="p-4 mono-label text-[#676c79] font-medium">Active Projects</th>
              <th className="p-4 mono-label text-[#676c79] font-medium">Stage Breakdown</th>
              <th className="p-4 mono-label text-[#676c79] font-medium">Upcoming Kickoffs</th>
              <th className="p-4 mono-label text-[#676c79] font-medium">Capacity Score</th>
              <th className="p-4 mono-label text-[#676c79] font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {sas.map(sa => {
              const upcoming = kickoffs.filter(k => k.saName === sa.name && k.status !== 'COMPLETE').length;
              const score = getCapacityScore(sa.name);
              
              return (
                <tr key={sa.name} className="border-t border-[#ecedef] hover:bg-[#f0faf4] transition-colors">
                  <td className="p-4 font-sans font-bold text-sm">{sa.name}</td>
                  <td className="p-4 text-sm font-mono">{sa.activeProjects}</td>
                  <td className="p-4 text-xs text-[#676c79]">
                    <div className="flex items-center gap-1">
                      <span className="text-[#008c44] font-bold">{sa.earlyStage}</span> early / 
                      <span className="text-[#008c44] font-bold">{sa.midStage}</span> mid / 
                      <span className="text-[#008c44] font-bold">{sa.lateStage}</span> late
                    </div>
                  </td>
                  <td className="p-4 text-sm font-mono">{upcoming}</td>
                  <td className="p-4"><CapacityBadge score={score} /></td>
                  <td className="p-4">
                    <input 
                      type="text"
                      value={sa.notes}
                      onChange={(e) => {
                        const newSas = [...sas];
                        const idx = newSas.findIndex(s => s.name === sa.name);
                        newSas[idx].notes = e.target.value;
                        setSas(newSas);
                      }}
                      placeholder="Add note..."
                      className="w-full bg-transparent border-none text-sm text-[#676c79] focus:ring-0 outline-none italic"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  const SettingsView = () => (
    <div className="max-w-2xl space-y-6 md:space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl md:text-4xl mb-1">Settings</h1>
        <p className="text-[#676c79] text-sm">Configure tool defaults and team lists.</p>
      </div>

      <div className="space-y-6">
        <div className="space-y-2">
          <label className="mono-label text-[#676c79]">Max Kickoffs Per Week</label>
          <input 
            type="number"
            value={maxSlots}
            onChange={(e) => setMaxSlots(parseInt(e.target.value))}
            className="w-full p-3 border border-[#d4e8da] focus:border-[#008c44] outline-none"
          />
        </div>

        <button className="bg-[#000d05] text-white px-8 py-3 font-sans font-medium hover:opacity-90 transition-opacity">
          Save Changes
        </button>
      </div>
    </div>
  );

  // --- Side Panels ---

  const BookingPanel = () => {
    const [customerName, setCustomerName] = useState('');
    const [aeName, setAeName] = useState(aes[0]);
    const [saName, setSaName] = useState(sas[0].name);
    const [notes, setNotes] = useState('');

    return (
      <motion.div 
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="fixed top-0 right-0 h-full w-full sm:w-[420px] bg-white border-l border-[#d4e8da] z-50 shadow-2xl p-6 sm:p-8 overflow-y-auto"
      >
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-3xl font-serif">Book Slot</h2>
          <button onClick={() => setIsBookingOpen(false)} className="text-[#676c79] hover:text-[#000d05]">
            <X size={24} />
          </button>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <label className="mono-label text-[#676c79]">Customer Name</label>
            <input 
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g. Acme Corp"
              className="w-full p-3 border border-[#d4e8da] focus:border-[#008c44] outline-none"
            />
          </div>

          <div className="space-y-2">
            <label className="mono-label text-[#676c79]">AE Name</label>
            <CustomSelect 
              value={aeName}
              onChange={setAeName}
              labelClassName="font-sans"
              options={aes.map(ae => ({ label: ae, value: ae }))}
            />
          </div>

          <div className="space-y-2">
            <label className="mono-label text-[#676c79]">Preferred SA</label>
            <CustomSelect 
              value={saName}
              onChange={setSaName}
              labelClassName="font-sans"
              options={sas.map(sa => ({ 
                label: sa.name, 
                value: sa.name,
                badge: <CapacityBadge score={getCapacityScore(sa.name)} />
              }))}
            />
          </div>

          <div className="space-y-2">
            <label className="mono-label text-[#676c79]">Kickoff Week</label>
            <input 
              type="text"
              value={bookingWeek}
              readOnly
              className="w-full p-3 border border-[#d4e8da] bg-[#F8FFFA] text-[#676c79] outline-none cursor-not-allowed"
            />
          </div>

          <div className="space-y-2">
            <label className="mono-label text-[#676c79]">Notes</label>
            <textarea 
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any specific requirements..."
              className="w-full p-3 border border-[#d4e8da] focus:border-[#008c44] outline-none"
            />
          </div>

          <button 
            onClick={() => handleAddKickoff({ customerName, aeName, saName, week: bookingWeek, status: 'NOT STARTED', notes })}
            disabled={!customerName}
            className="w-full bg-[#00ff64] text-[#000d05] py-4 font-sans font-bold text-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Plus size={20} /> Confirm Kickoff
          </button>
        </div>
      </motion.div>
    );
  };

  const DetailPanel = () => {
    if (!selectedKickoff) return null;

    const completedTasks = selectedKickoff.tasks.filter(t => t).length;

    return (
      <motion.div 
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="fixed top-0 right-0 h-full w-full sm:w-[420px] bg-white border-l border-[#d4e8da] z-50 shadow-2xl flex flex-col"
      >
        <div className="p-6 sm:p-8 border-b border-[#ecedef] flex justify-between items-start">
          <div>
            <h2 className="text-2xl sm:text-3xl font-serif mb-2">{selectedKickoff.customerName}</h2>
            <div className="flex gap-2">
              <StatusBadge status={selectedKickoff.status} />
              <span className="mono-label bg-[#EEFF8C] text-[#000d05] px-2 py-0.5">{selectedKickoff.week}</span>
            </div>
          </div>
          <button onClick={() => setSelectedKickoffId(null)} className="text-[#676c79] hover:text-[#000d05]">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 sm:space-y-8">
          {/* Progress Summary */}
          <div className="bg-[#F8FFFA] p-4 border border-[#d4e8da]">
            <div className="flex justify-between items-center mb-2">
              <span className="mono-label text-[#008c44]">{completedTasks}/7 TASKS COMPLETE</span>
              <span className="mono-label text-[#676c79]">{Math.round((completedTasks/7)*100)}%</span>
            </div>
            <div className="h-2 bg-[#dfeae3]">
              <div 
                className="h-full bg-[#008c44] transition-all duration-500" 
                style={{ width: `${(completedTasks/7)*100}%` }}
              />
            </div>
          </div>

          {/* Fields */}
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className="mono-label text-[#a5aab6]">AE OWNER</label>
              <p className="text-sm font-medium">{selectedKickoff.aeName}</p>
            </div>
            <div className="space-y-1">
              <label className="mono-label text-[#a5aab6]">ASSIGNED SA</label>
              <p className="text-sm font-medium">{selectedKickoff.saName}</p>
            </div>
          </div>

          {/* Checklist */}
          <div className="space-y-4">
            <label className="mono-label text-[#676c79]">PRE-KICKOFF CHECKLIST</label>
            <div className="space-y-2">
              {STANDARD_TASKS.map((task, idx) => (
                <div 
                  key={idx}
                  onClick={() => handleToggleTask(selectedKickoff.id, idx)}
                  className="flex items-center gap-3 group cursor-pointer"
                >
                  <div className={`w-5 h-5 border flex items-center justify-center transition-colors ${selectedKickoff.tasks[idx] ? 'bg-[#008c44] border-[#008c44]' : 'border-[#d4e8da] group-hover:border-[#008c44]'}`}>
                    {selectedKickoff.tasks[idx] && <Check size={14} className="text-white" />}
                  </div>
                  <span className={`text-sm transition-all ${selectedKickoff.tasks[idx] ? 'text-[#a5aab6] line-through' : 'text-[#09090b]'}`}>
                    {task}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <label className="mono-label text-[#676c79]">NOTES</label>
            <textarea 
              rows={4}
              value={selectedKickoff.notes}
              onChange={(e) => handleUpdateKickoff(selectedKickoff.id, { notes: e.target.value })}
              placeholder="Add internal notes..."
              className="w-full p-3 border border-[#d4e8da] focus:border-[#008c44] outline-none text-sm"
            />
          </div>

          {/* Activity Log */}
          <div className="space-y-4 pt-4 border-t border-[#ecedef]">
            <label className="mono-label text-[#676c79]">ACTIVITY LOG</label>
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-[#008c44] mt-1.5" />
                <div>
                  <p className="text-xs text-[#676c79]">Today, 2:25 PM</p>
                  <p className="text-sm">Kickoff record created by {selectedKickoff.aeName}</p>
                </div>
              </div>
              {selectedKickoff.tasks.some(t => t) && (
                <div className="flex gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#008c44] mt-1.5" />
                  <div>
                    <p className="text-xs text-[#676c79]">Yesterday, 10:15 AM</p>
                    <p className="text-sm">Checklist items updated by {selectedKickoff.saName}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  const handleNavClick = (newView: typeof view) => {
    setView(newView);
    setMobileSidebarOpen(false);
  };

  return (
    <div className="flex min-h-screen bg-white font-sans">
      {/* Mobile Header */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-30 bg-[#F8FFFA] border-b border-[#d4e8da] flex items-center justify-between px-4 py-3">
        <button onClick={() => setMobileSidebarOpen(true)} className="text-[#000d05] p-1">
          <Menu size={24} />
        </button>
        <img
          src="https://mms.businesswire.com/media/20251110823725/en/2637492/4/AirOps_logo.jpg"
          alt="AirOps Logo"
          className="w-[90px] h-auto mix-blend-multiply"
          referrerPolicy="no-referrer"
        />
        <div className="w-8 h-8 bg-[#000d05] text-white flex items-center justify-center text-xs font-bold">KH</div>
      </header>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {mobileSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileSidebarOpen(false)}
              className="md:hidden fixed inset-0 bg-black/20 backdrop-blur-[2px] z-40"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="md:hidden fixed top-0 left-0 h-full w-[260px] bg-[#F8FFFA] border-r border-[#d4e8da] flex flex-col z-50 shadow-2xl"
            >
              <div className="p-6 mb-4 flex items-center justify-between">
                <div>
                  <img
                    src="https://mms.businesswire.com/media/20251110823725/en/2637492/4/AirOps_logo.jpg"
                    alt="AirOps Logo"
                    className="w-[120px] h-auto mix-blend-multiply"
                    referrerPolicy="no-referrer"
                  />
                  <div className="mt-4 mono-label text-[#676c79]">Kickoff Hub</div>
                </div>
                <button onClick={() => setMobileSidebarOpen(false)} className="text-[#676c79] hover:text-[#000d05]">
                  <X size={24} />
                </button>
              </div>
              <nav className="flex-1">
                <button onClick={() => handleNavClick('schedule')} className={`w-full flex items-center gap-3 px-6 py-3 text-sm font-sans transition-all ${view === 'schedule' ? 'border-l-[3px] border-[#008c44] bg-[#f0faf4] text-[#000d05]' : 'text-[#676c79] hover:bg-[#f0faf4] hover:text-[#000d05]'}`}>
                  <Calendar size={18} /> Weekly Schedule
                </button>
                <button onClick={() => handleNavClick('all')} className={`w-full flex items-center gap-3 px-6 py-3 text-sm font-sans transition-all ${view === 'all' ? 'border-l-[3px] border-[#008c44] bg-[#f0faf4] text-[#000d05]' : 'text-[#676c79] hover:bg-[#f0faf4] hover:text-[#000d05]'}`}>
                  <List size={18} /> All Kickoffs
                </button>
                <button onClick={() => handleNavClick('capacity')} className={`w-full flex items-center gap-3 px-6 py-3 text-sm font-sans transition-all ${view === 'capacity' ? 'border-l-[3px] border-[#008c44] bg-[#f0faf4] text-[#000d05]' : 'text-[#676c79] hover:bg-[#f0faf4] hover:text-[#000d05]'}`}>
                  <Users size={18} /> SA Capacity
                </button>
                <button onClick={() => handleNavClick('settings')} className={`w-full flex items-center gap-3 px-6 py-3 text-sm font-sans transition-all ${view === 'settings' ? 'border-l-[3px] border-[#008c44] bg-[#f0faf4] text-[#000d05]' : 'text-[#676c79] hover:bg-[#f0faf4] hover:text-[#000d05]'}`}>
                  <SettingsIcon size={18} /> Settings
                </button>
              </nav>
              <div className="p-6 border-t border-[#d4e8da]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-[#000d05] text-white flex items-center justify-center text-xs font-bold">KH</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate">Kickoff Hub</p>
                    <p className="text-[10px] text-[#676c79] truncate">Solutions Architect</p>
                  </div>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-[220px] bg-[#F8FFFA] border-r border-[#d4e8da] flex-col fixed h-full">
        <div className="p-6 mb-4">
          <img
            src="https://mms.businesswire.com/media/20251110823725/en/2637492/4/AirOps_logo.jpg"
            alt="AirOps Logo"
            className="w-[120px] h-auto mix-blend-multiply"
            referrerPolicy="no-referrer"
          />
          <div className="mt-8 mono-label text-[#676c79]">Kickoff Hub</div>
        </div>

        <nav className="flex-1">
          <button
            onClick={() => setView('schedule')}
            className={`w-full flex items-center gap-3 px-6 py-3 text-sm font-sans transition-all ${view === 'schedule' ? 'border-l-[3px] border-[#008c44] bg-[#f0faf4] text-[#000d05]' : 'text-[#676c79] hover:bg-[#f0faf4] hover:text-[#000d05]'}`}
          >
            <Calendar size={18} /> Weekly Schedule
          </button>
          <button
            onClick={() => setView('all')}
            className={`w-full flex items-center gap-3 px-6 py-3 text-sm font-sans transition-all ${view === 'all' ? 'border-l-[3px] border-[#008c44] bg-[#f0faf4] text-[#000d05]' : 'text-[#676c79] hover:bg-[#f0faf4] hover:text-[#000d05]'}`}
          >
            <List size={18} /> All Kickoffs
          </button>
          <button
            onClick={() => setView('capacity')}
            className={`w-full flex items-center gap-3 px-6 py-3 text-sm font-sans transition-all ${view === 'capacity' ? 'border-l-[3px] border-[#008c44] bg-[#f0faf4] text-[#000d05]' : 'text-[#676c79] hover:bg-[#f0faf4] hover:text-[#000d05]'}`}
          >
            <Users size={18} /> SA Capacity
          </button>
          <button
            onClick={() => setView('settings')}
            className={`w-full flex items-center gap-3 px-6 py-3 text-sm font-sans transition-all ${view === 'settings' ? 'border-l-[3px] border-[#008c44] bg-[#f0faf4] text-[#000d05]' : 'text-[#676c79] hover:bg-[#f0faf4] hover:text-[#000d05]'}`}
          >
            <SettingsIcon size={18} /> Settings
          </button>
        </nav>

        <div className="p-6 border-t border-[#d4e8da]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#000d05] text-white flex items-center justify-center text-xs font-bold">HL</div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold truncate">Henry Lee</p>
              <p className="text-[10px] text-[#676c79] truncate">Solutions Architect</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 md:ml-[220px] p-4 pt-16 md:pt-12 md:p-12">
        {view === 'schedule' && <WeeklyScheduleView />}
        {view === 'all' && <AllKickoffsView />}
        {view === 'capacity' && <SACapacityView />}
        {view === 'settings' && <SettingsView />}
      </main>

      {/* Overlays */}
      <AnimatePresence>
        {isBookingOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsBookingOpen(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-40"
            />
            <BookingPanel />
          </>
        )}
        {selectedKickoffId && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedKickoffId(null)}
              className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-40"
            />
            <DetailPanel />
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
