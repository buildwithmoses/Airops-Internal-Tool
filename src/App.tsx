import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
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
  Menu,
  LogOut,
  Loader2
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
  eventDate?: string; // ISO date string from Google Calendar
  eventLink?: string; // Link to Google Calendar event
}

interface SA {
  name: string;
  activeProjects: number;
  preActivation: number;
  earlyStage: number;
  midStage: number;
  lateStage: number;
  notes: string;
}

// --- Constants & Seed Data ---

const STANDARD_TASKS = [
  "AEO Workspace ID - UPGRADE",
  "Set Tasks in Admin",
  "Intake Checklist Sent (AE)",
  "Internal Sync with AE (add Lead)",
  "Kickoff Booked (AE)",
  "Intro Email Sent? (AE)",
  "Deck Created",
  "Slack Channel Created",
  "Add Hubspot ID to Admin"
];

const INITIAL_SAS: SA[] = [
  { name: "Aaron Lit", activeProjects: 0, preActivation: 0, earlyStage: 0, midStage: 0, lateStage: 0, notes: ""},
  { name: "AJ Diaz", activeProjects: 0, preActivation: 0, earlyStage: 0, midStage: 0, lateStage: 0, notes: ""},
  { name: "Andreea Volzer", activeProjects: 0, preActivation: 0, earlyStage: 0, midStage: 0, lateStage: 0, notes: ""},
  { name: "Anton O'Malley", activeProjects: 0, preActivation: 0, earlyStage: 0, midStage: 0, lateStage: 0, notes: ""},
  { name: "Arnett Shen", activeProjects: 0, preActivation: 0, earlyStage: 0, midStage: 0, lateStage: 0, notes: ""},
  { name: "Diana Shiling", activeProjects: 0, preActivation: 0, earlyStage: 0, midStage: 0, lateStage: 0, notes: ""},
  { name: "Elmi Abdullahi", activeProjects: 0, preActivation: 0, earlyStage: 0, midStage: 0, lateStage: 0, notes: ""},
  { name: "Henry Moses Jr", activeProjects: 0, preActivation: 0, earlyStage: 0, midStage: 0, lateStage: 0, notes: ""},
  { name: "Henry Young", activeProjects: 0, preActivation: 0, earlyStage: 0, midStage: 0, lateStage: 0, notes: ""},
  { name: "Jeremy Kao", activeProjects: 0, preActivation: 0, earlyStage: 0, midStage: 0, lateStage: 0, notes: ""},
  { name: "Joel Fazecas", activeProjects: 0, preActivation: 0, earlyStage: 0, midStage: 0, lateStage: 0, notes: ""},
  { name: "John Sellers", activeProjects: 0, preActivation: 0, earlyStage: 0, midStage: 0, lateStage: 0, notes: ""},
  { name: "Melanie Dell'Olio", activeProjects: 0, preActivation: 0, earlyStage: 0, midStage: 0, lateStage: 0, notes: ""},
  { name: "Palmer Jones", activeProjects: 0, preActivation: 0, earlyStage: 0, midStage: 0, lateStage: 0, notes: ""},
  { name: "Richard Li", activeProjects: 0, preActivation: 0, earlyStage: 0, midStage: 0, lateStage: 0, notes: ""},
  { name: "Shahbaz Mahmood", activeProjects: 0, preActivation: 0, earlyStage: 0, midStage: 0, lateStage: 0, notes: ""},
  { name: "William Reed", activeProjects: 0, preActivation: 0, earlyStage: 0, midStage: 0, lateStage: 0, notes: ""},
  { name: "Zoe Febrero", activeProjects: 0, preActivation: 0, earlyStage: 0, midStage: 0, lateStage: 0, notes: ""},
];


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

const CapacityBadge = ({ count }: { count: number }) => {
  const style = count < 3
    ? 'bg-[#CCFFE0] text-[#008c44]'
    : count <= 4
      ? 'bg-[#EEFF8C] text-[#000d05]'
      : 'bg-[#FFE5E5] text-[#991b1b]';

  return (
    <span className={`mono-label px-2 py-0.5 inline-block ${style}`}>
      {count} active
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
  const [authState, setAuthState] = useState<'checking' | 'authenticated' | 'unauthenticated'>('checking');
  const [currentUser, setCurrentUser] = useState<{ email: string; name: string; picture: string } | null>(null);
  const [view, setView] = useState<'schedule' | 'all' | 'capacity' | 'settings'>('schedule');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [kickoffs, setKickoffs] = useState<Kickoff[]>(SEED_KICKOFFS);
  const [sas, setSas] = useState<SA[]>(INITIAL_SAS);
  const [saLoadingState, setSaLoadingState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [gcalConnected, setGcalConnected] = useState(false);
  const [maxSlots, setMaxSlots] = useState(10);
  const [showWelcome, setShowWelcome] = useState(false);

  // Check authentication on load
  useEffect(() => {
    if (window.location.search.includes('gcal=connected')) {
      window.history.replaceState({}, '', '/');
    }
    fetch('/api/auth-check')
      .then(res => res.json())
      .then(json => {
        if (json.authenticated) {
          setAuthState('authenticated');
          setCurrentUser(json.user);
          setGcalConnected(true);
          // Show welcome modal on first visit
          if (!localStorage.getItem('kickoff-hub-welcomed')) {
            setShowWelcome(true);
            localStorage.setItem('kickoff-hub-welcomed', 'true');
          }
        } else {
          setAuthState('unauthenticated');
        }
      })
      .catch(() => setAuthState('unauthenticated'));
  }, []);

  // Load saved kickoffs from Redis, then merge calendar kickoffs
  useEffect(() => {
    if (authState !== 'authenticated') return;

    // Load persisted kickoffs first
    fetch('/api/kickoffs-list')
      .then(res => res.json())
      .then(json => {
        if (json.kickoffs?.length > 0) {
          setKickoffs(json.kickoffs);
        }
      })
      .catch(() => {});

    // Then merge Google Calendar kickoffs
    fetch('/api/google-calendar-kickoffs')
      .then(res => res.json())
      .then(json => {
        if (json.connected && json.kickoffs?.length > 0) {
          setKickoffs(prev => {
            const existingIds = new Set(prev.map(k => k.id));
            const newKickoffs = json.kickoffs.filter((k: any) => !existingIds.has(k.id));
            return [...prev, ...newKickoffs];
          });
        }
      })
      .catch(() => {});
  }, [authState]);

  // Fetch SA data from Asana API
  useEffect(() => {
    setSaLoadingState('loading');
    fetch('/api/asana-sa-data')
      .then(res => res.json())
      .then(json => {
        if (json.data && json.data.length > 0) {
          const saData = json.data.map((sa: any) => ({
            name: sa.name,
            activeProjects: sa.activeProjects,
            preActivation: sa.preActivation || 0,
            earlyStage: sa.earlyStage,
            midStage: sa.midStage,
            lateStage: sa.lateStage,
            notes: '',
          }));
          // Load persisted SA notes and merge
          fetch('/api/sa-notes-list')
            .then(r => r.json())
            .then(notesJson => {
              if (notesJson.notes) {
                saData.forEach((sa: any) => {
                  if (notesJson.notes[sa.name]) sa.notes = notesJson.notes[sa.name];
                });
              }
              setSas(saData);
            })
            .catch(() => setSas(saData));
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
  const [scheduleViewMode, setScheduleViewMode] = useState<'list' | 'calendar'>('list');
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  // Filters for All Kickoffs view
  const [filterStatus, setFilterStatus] = useState<Status | 'ALL'>('ALL');
  const [filterSA, setFilterSA] = useState<string | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [deckGenerating, setDeckGenerating] = useState<string | null>(null);

  const nextWeeks = useMemo(() => getNextWeeks(), []);

  const selectedKickoff = useMemo(() => 
    kickoffs.find(k => k.id === selectedKickoffId), 
    [kickoffs, selectedKickoffId]
  );

  // Capacity Score Heuristic
  const getActiveCount = (saName: string) => {
    const sa = sas.find(s => s.name === saName);
    if (!sa) return 0;
    return sa.preActivation + sa.earlyStage;
  };

  const sasSortedByCapacity = [...sas].sort((a, b) => (a.preActivation + a.earlyStage) - (b.preActivation + b.earlyStage));

  // Debounced SA notes save
  const saNotesTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const saveSaNote = useCallback((saName: string, notes: string) => {
    if (saNotesTimers.current[saName]) clearTimeout(saNotesTimers.current[saName]);
    saNotesTimers.current[saName] = setTimeout(() => {
      fetch('/api/sa-notes-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saName, notes }),
      }).catch(() => {});
    }, 800);
  }, []);

  const saveKickoffToRedis = (kickoff: Kickoff) => {
    fetch('/api/kickoffs-save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(kickoff),
    }).catch(() => {});
  };

  const handleToggleTask = (kickoffId: string, taskIndex: number) => {
    setKickoffs(prev => prev.map(k => {
      if (k.id === kickoffId) {
        const newTasks = [...k.tasks];
        newTasks[taskIndex] = !newTasks[taskIndex];

        // Auto-update status based on tasks
        let newStatus = k.status;
        const completedCount = newTasks.filter(t => t).length;
        if (completedCount === STANDARD_TASKS.length) newStatus = 'COMPLETE';
        else if (completedCount > 0 && k.status === 'NOT STARTED') newStatus = 'IN PROGRESS';

        const updated = { ...k, tasks: newTasks, status: newStatus };
        saveKickoffToRedis(updated);
        return updated;
      }
      return k;
    }));
  };

  const handleUpdateKickoff = (kickoffId: string, updates: Partial<Kickoff>) => {
    setKickoffs(prev => prev.map(k => {
      if (k.id === kickoffId) {
        const updated = { ...k, ...updates };
        saveKickoffToRedis(updated);
        return updated;
      }
      return k;
    }));
  };

  const handleAddKickoff = (newKickoff: Omit<Kickoff, 'id' | 'createdAt' | 'tasks' | 'booked'>) => {
    const kickoff: Kickoff = {
      ...newKickoff,
      id: Math.random().toString(36).substr(2, 9),
      tasks: new Array(STANDARD_TASKS.length).fill(false),
      booked: true,
      createdAt: Date.now()
    };
    setKickoffs(prev => [kickoff, ...prev]);
    saveKickoffToRedis(kickoff);
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
        <div className="flex items-center gap-3 self-start">
          {!gcalConnected ? (
            <a
              href="/api/google-auth"
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-sans bg-white border border-[#d4e8da] text-[#000d05] hover:bg-[#F8FFFA] transition-colors shadow-sm"
            >
              <Calendar size={16} /> Connect Google Calendar
            </a>
          ) : (
            <span className="flex items-center gap-2 px-3 py-1.5 text-sm font-sans text-[#008c44] bg-[#CCFFE0]">
              <CheckCircle2 size={16} /> Calendar Connected
            </span>
          )}
          <div className="flex items-center gap-1 bg-[#F8FFFA] border border-[#d4e8da] p-1">
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
                  {slotsUsed >= maxSlots ? (
                    <span className="bg-[#FFE5E5] text-[#991b1b] px-4 py-2 font-sans font-medium text-sm flex items-center gap-2 self-start sm:self-auto">
                      <AlertCircle size={16} /> Week Full
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        setBookingWeek(week);
                        setIsBookingOpen(true);
                      }}
                      className="bg-[#00ff64] text-[#000d05] px-4 py-2 font-sans font-medium text-sm flex items-center gap-2 hover:opacity-90 transition-opacity self-start sm:self-auto"
                    >
                      <Plus size={16} /> Book Slot ({maxSlots - slotsUsed} left)
                    </button>
                  )}
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
                            {k.tasks.filter(t => t).length}/{STANDARD_TASKS.length}
                          </span>
                          <div className="w-12 h-1 bg-[#dfeae3]">
                            <div
                              className="h-full bg-[#008c44]"
                              style={{ width: `${(k.tasks.filter(t => t).length / STANDARD_TASKS.length) * 100}%` }}
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
              // Match kickoffs by actual event date, or fall back to week for manually created ones
              const dayStr = day ? `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}` : '';
              const dayKickoffs = day ? kickoffs.filter(k => {
                if (k.eventDate) {
                  return k.eventDate.startsWith(dayStr);
                }
                // For manually created kickoffs, show on Monday of their week
                return k.week === dayWeek && day.getDay() === 1;
              }) : [];

              return (
                <div
                  key={idx}
                  className={`min-h-[60px] md:min-h-[110px] border-b border-r border-[#ecedef] p-1 md:p-2 transition-colors ${
                    day ? 'hover:bg-[#f0faf4]' : 'bg-[#fafafa]'
                  } ${isToday ? 'bg-[#f0faf4]' : ''}`}
                  onClick={() => {
                    if (day) {
                      const weekKickoffCount = kickoffs.filter(k => k.week === dayWeek).length;
                      if (weekKickoffCount >= maxSlots) return; // week is full
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
                        {dayKickoffs.length > 0 && (
                          <span className="mono-label text-[10px] text-[#676c79]">
                            {dayKickoffs.length} kickoff{dayKickoffs.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      {dayKickoffs.map(k => (
                        <div
                          key={k.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedKickoffId(k.id);
                          }}
                          className="mb-1 px-1 md:px-1.5 py-0.5 text-[9px] md:text-[11px] truncate cursor-pointer rounded-sm border-l-2 border-[#008c44] bg-[#CCFFE0] text-[#000d05] hover:bg-[#b3f5d0] transition-colors"
                        >
                          {k.customerName}{k.saName ? ` · ${k.saName}` : ''}
                        </div>
                      ))}
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
                  <ProgressBar current={k.tasks.filter(t => t).length} total={STANDARD_TASKS.length} compact />
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
            {sasSortedByCapacity.map(sa => {
              const upcoming = kickoffs.filter(k => k.saName === sa.name && k.status !== 'COMPLETE').length;
              const activeCount = getActiveCount(sa.name);

              return (
                <tr key={sa.name} className="border-t border-[#ecedef] hover:bg-[#f0faf4] transition-colors">
                  <td className="p-4 font-sans font-bold text-sm">{sa.name}</td>
                  <td className="p-4 text-sm font-mono">{sa.activeProjects}</td>
                  <td className="p-4 text-xs text-[#676c79]">
                    <div className="flex items-center gap-1">
                      <span className="text-[#008c44] font-bold">{sa.preActivation}</span> pre /
                      <span className="text-[#008c44] font-bold">{sa.earlyStage}</span> early /
                      <span className="text-[#008c44] font-bold">{sa.midStage}</span> mid /
                      <span className="text-[#008c44] font-bold">{sa.lateStage}</span> late
                    </div>
                  </td>
                  <td className="p-4 text-sm font-mono">{upcoming}</td>
                  <td className="p-4"><CapacityBadge count={activeCount} /></td>
                  <td className="p-4">
                    <input 
                      type="text"
                      value={sa.notes}
                      onChange={(e) => {
                        const newSas = [...sas];
                        const idx = newSas.findIndex(s => s.name === sa.name);
                        newSas[idx].notes = e.target.value;
                        setSas(newSas);
                        saveSaNote(sa.name, e.target.value);
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
    const [aeName, setAeName] = useState(currentUser?.name || '');
    const [saName, setSaName] = useState(sasSortedByCapacity[0]?.name || sas[0]?.name);
    const [kickoffDate, setKickoffDate] = useState('');
    const [notes, setNotes] = useState('');

    const derivedWeek = kickoffDate ? getWeekString(new Date(kickoffDate + 'T00:00:00')) : bookingWeek;
    const weekSlotsUsed = kickoffs.filter(k => k.week === derivedWeek).length;
    const weekIsFull = weekSlotsUsed >= maxSlots;
    const selectedSaActiveCount = getActiveCount(saName);

    // Min date = today, max date = 8 weeks out
    const today = new Date().toISOString().split('T')[0];
    const maxDate = new Date(Date.now() + 56 * 86400000).toISOString().split('T')[0];

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

        {weekIsFull && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded flex items-center gap-2 text-red-700 text-sm">
            <AlertCircle size={16} /> This week is full ({maxSlots}/{maxSlots} slots used). Choose a different week.
          </div>
        )}

        {selectedSaActiveCount >= 5 && (
          <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded flex items-center gap-2 text-amber-700 text-sm">
            <AlertCircle size={16} /> {saName} has low capacity. Consider choosing a different SA.
          </div>
        )}

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
            <input
              type="text"
              value={aeName}
              onChange={(e) => setAeName(e.target.value)}
              placeholder="Your name"
              className="w-full p-3 border border-[#d4e8da] focus:border-[#008c44] outline-none"
            />
          </div>

          <div className="space-y-2">
            <label className="mono-label text-[#676c79]">SA</label>
            <CustomSelect
              value={saName}
              onChange={setSaName}
              labelClassName="font-sans"
              options={sasSortedByCapacity.map((sa, idx) => ({
                label: idx === 0 ? `${sa.name} — Recommended` : sa.name,
                value: sa.name,
                badge: <CapacityBadge count={sa.preActivation + sa.earlyStage} />
              }))}
            />
            {saName === sasSortedByCapacity[0]?.name && (
              <p className="text-xs text-[#008c44] flex items-center gap-1">
                <CheckCircle2 size={12} /> Lowest active workload ({sasSortedByCapacity[0]?.preActivation + sasSortedByCapacity[0]?.earlyStage} active use-cases)
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="mono-label text-[#676c79]">Kickoff Date</label>
            <input
              type="date"
              value={kickoffDate}
              onChange={(e) => setKickoffDate(e.target.value)}
              min={today}
              max={maxDate}
              className="w-full p-3 border border-[#d4e8da] focus:border-[#008c44] outline-none"
            />
            <p className="text-xs text-[#676c79]">Week {derivedWeek} — {weekSlotsUsed} / {maxSlots} slots used</p>
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
            onClick={() => handleAddKickoff({
              customerName,
              aeName,
              saName,
              week: derivedWeek,
              status: 'NOT STARTED',
              notes,
              eventDate: kickoffDate ? new Date(kickoffDate + 'T00:00:00').toISOString() : undefined,
            })}
            disabled={!customerName || !kickoffDate || weekIsFull}
            className="w-full bg-[#00ff64] text-[#000d05] py-4 font-sans font-bold text-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Plus size={20} /> {weekIsFull ? 'Week Full' : 'Confirm Kickoff'}
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
              <span className="mono-label text-[#008c44]">{completedTasks}/{STANDARD_TASKS.length} TASKS COMPLETE</span>
              <span className="mono-label text-[#676c79]">{Math.round((completedTasks/STANDARD_TASKS.length)*100)}%</span>
            </div>
            <div className="h-2 bg-[#dfeae3]">
              <div
                className="h-full bg-[#008c44] transition-all duration-500"
                style={{ width: `${(completedTasks/STANDARD_TASKS.length)*100}%` }}
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
                  className="flex items-center gap-3 group"
                >
                  <div
                    onClick={() => handleToggleTask(selectedKickoff.id, idx)}
                    className={`w-5 h-5 border flex items-center justify-center transition-colors cursor-pointer ${selectedKickoff.tasks[idx] ? 'bg-[#008c44] border-[#008c44]' : 'border-[#d4e8da] group-hover:border-[#008c44]'}`}
                  >
                    {selectedKickoff.tasks[idx] && <Check size={14} className="text-white" />}
                  </div>
                  <span
                    onClick={() => handleToggleTask(selectedKickoff.id, idx)}
                    className={`text-sm transition-all cursor-pointer ${selectedKickoff.tasks[idx] ? 'text-[#a5aab6] line-through' : 'text-[#09090b]'}`}
                  >
                    {task}
                  </span>
                  {task === 'Deck Created' && (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        setDeckGenerating(selectedKickoff.id);
                        try {
                          const res = await fetch('/api/trigger-deck', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              kickoffId: selectedKickoff.id,
                              clientName: selectedKickoff.customerName,
                              aeName: selectedKickoff.aeName,
                              saName: selectedKickoff.saName,
                              week: selectedKickoff.week,
                            }),
                          });
                          if (!res.ok) throw new Error('Failed to trigger agent');
                        } catch (err) {
                          console.error('Agent trigger failed:', err);
                        } finally {
                          setDeckGenerating(null);
                        }
                      }}
                      disabled={deckGenerating === selectedKickoff.id}
                      className="ml-auto flex items-center gap-1.5 px-3 py-1 bg-[#00ff64] text-[#000d05] text-xs font-bold hover:opacity-90 transition-opacity disabled:opacity-50 rounded-sm"
                    >
                      {deckGenerating === selectedKickoff.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <ArrowRight size={12} />
                      )}
                      Use Agent
                    </button>
                  )}
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

  // Auth gate - show login screen if not authenticated
  if (authState === 'checking') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F8FFFA]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#008c44] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#676c79] text-sm font-sans">Loading...</p>
        </div>
      </div>
    );
  }

  if (authState === 'unauthenticated') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F8FFFA]">
        <div className="text-center max-w-md mx-auto p-8">
          <img
            src="https://mms.businesswire.com/media/20251110823725/en/2637492/4/AirOps_logo.jpg"
            alt="AirOps Logo"
            className="h-10 mx-auto mb-6"
          />
          <h1 className="text-2xl font-sans font-bold text-[#000d05] mb-2">Kickoff Management Hub</h1>
          <p className="text-[#676c79] text-sm mb-8">Sign in with your AirOps Google account to access the dashboard.</p>
          <a
            href="/api/google-auth"
            className="inline-flex items-center gap-3 px-6 py-3 bg-[#000d05] text-white font-sans text-sm hover:bg-[#1a2a1f] transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
              <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            Sign in with Google
          </a>
          <p className="text-[#676c79] text-xs mt-4">Only @airops.com accounts are allowed.</p>
        </div>
      </div>
    );
  }

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
            {currentUser?.picture ? (
              <img src={currentUser.picture} alt="" className="w-8 h-8 rounded-full" />
            ) : (
              <div className="w-8 h-8 bg-[#000d05] text-white flex items-center justify-center text-xs font-bold rounded-full">
                {currentUser?.name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '?'}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold truncate">{currentUser?.name || 'User'}</p>
              <p className="text-[10px] text-[#676c79] truncate">{currentUser?.email || ''}</p>
            </div>
          </div>
          <a
            href="/api/logout"
            className="flex items-center gap-2 mt-3 px-3 py-1.5 text-xs font-sans text-[#676c79] hover:text-[#000d05] hover:bg-[#f0faf4] transition-colors w-full"
          >
            <LogOut size={14} /> Sign out
          </a>
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

      {/* Welcome Modal */}
      <AnimatePresence>
        {showWelcome && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
            onClick={() => setShowWelcome(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white max-w-lg w-full mx-4 p-8 shadow-2xl border border-[#d4e8da]"
            >
              <h2 className="text-2xl font-serif text-[#000d05] mb-1">Welcome to Kickoff Management Hub</h2>
              <p className="text-sm text-[#676c79] mb-6">Here's a quick overview of what you can do.</p>

              <div className="space-y-4 mb-8">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-[#CCFFE0] flex items-center justify-center flex-shrink-0">
                    <Calendar size={16} className="text-[#008c44]" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#000d05]">Schedule</p>
                    <p className="text-xs text-[#676c79]">View upcoming kickoffs by week or on a calendar. Your Google Calendar kickoffs sync automatically.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-[#CCFFE0] flex items-center justify-center flex-shrink-0">
                    <Plus size={16} className="text-[#008c44]" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#000d05]">Book a Kickoff</p>
                    <p className="text-xs text-[#676c79]">Click "Book Slot" on any week to schedule a new kickoff. SAs are sorted by availability so you can pick the best fit.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-[#CCFFE0] flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 size={16} className="text-[#008c44]" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#000d05]">Track Progress</p>
                    <p className="text-xs text-[#676c79]">Click any kickoff to open its checklist. Track prep tasks, update status, and add notes.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-[#CCFFE0] flex items-center justify-center flex-shrink-0">
                    <Users size={16} className="text-[#008c44]" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#000d05]">SA Capacity</p>
                    <p className="text-xs text-[#676c79]">View each SA's workload pulled live from Asana — pre-activation, early, mid, and late stage breakdowns.</p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowWelcome(false)}
                className="w-full bg-[#00ff64] text-[#000d05] py-3 font-sans font-bold text-sm hover:opacity-90 transition-opacity"
              >
                Get Started
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
