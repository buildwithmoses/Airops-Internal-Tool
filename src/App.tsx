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
  Loader2,
  ExternalLink,
  FileText,
  FolderOpen,
  Trash2,
  Copy,
  Hash,
  ChevronDown
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
  useCaseType?: string; // e.g., "Content Creation", "Offsite"
  timezone?: string;
  arr?: string;       // Annual Recurring Revenue
  isPoc?: boolean;    // Proof of Concept
  slackInternalChannelId?: string;
  slackExternalChannelId?: string;
  slackConnectInviteLink?: string;
  // Scheduling fields
  internalMeetingRunId?: string;
  internalMeetingTime?: string;
  externalMeetingRunId?: string;
  externalMeetingTime?: string;
  externalBookingLink?: string;
  schedulingStatus?: {
    internal: 'not_started' | 'finding_times' | 'waiting' | 'confirmed';
    external: 'not_started' | 'finding_times' | 'waiting' | 'confirmed';
  };
}

const USE_CASE_TYPES = ['Content Creation', 'Content Refresh', 'Offsite'] as const;

interface HubSpotDeal {
  id: string;
  name: string;
  amount: string;
  closedate: string;
  ownerId: string;
  aeName?: string;
}

interface HubSpotAE {
  id: string;
  name: string;
  email: string;
}

interface DeckResult {
  deckUrl: string;
  deckId: string;
  folderId: string;
  folderUrl: string;
  clientName: string;
}

interface SlackUser {
  id: string;
  real_name: string;
  avatar: string;
}

interface UseCase {
  customer: string;
  name: string;
  month: 1 | 2 | 3 | null;
  hours: number;
  customerStatus?: string;
}

interface SA {
  name: string;
  useCases: UseCase[];
  totalHours: number;
  monthBreakdown: { m1: number; m2: number; m3: number };
  capacity: number;
  utilizationPct: number;
  notes: string;
}

// --- Constants & Seed Data ---

// Pod → SA Lead mapping
const SA_POD_MAP: Record<string, { pod: string; lead: string }> = {
  // Pod Sqod (Richard's Pod)
  "Anton O'Malley": { pod: "Pod Sqod", lead: "Richard Li" },
  "Henry Moses Jr": { pod: "Pod Sqod", lead: "Richard Li" },
  "Jeremy Kao": { pod: "Pod Sqod", lead: "Richard Li" },
  "John Sellers": { pod: "Pod Sqod", lead: "Richard Li" },
  "Palmer Jones": { pod: "Pod Sqod", lead: "Richard Li" },
  "Richard Li": { pod: "Pod Sqod", lead: "Richard Li" },
  // Melanie's Pod
  "Aaron Lit": { pod: "Melanie's Pod", lead: "Melanie Dell'Olio" },
  "AJ Diaz": { pod: "Melanie's Pod", lead: "Melanie Dell'Olio" },
  "Diana Shiling": { pod: "Melanie's Pod", lead: "Melanie Dell'Olio" },
  "Elmi Abdullahi": { pod: "Melanie's Pod", lead: "Melanie Dell'Olio" },
  "Henry Young": { pod: "Melanie's Pod", lead: "Melanie Dell'Olio" },
  "Melanie Dell'Olio": { pod: "Melanie's Pod", lead: "Melanie Dell'Olio" },
  "William Reed": { pod: "Melanie's Pod", lead: "Melanie Dell'Olio" },
  "Zoe Febrero": { pod: "Melanie's Pod", lead: "Melanie Dell'Olio" },
  // Andreea's Pod
  "Andreea Volzer": { pod: "Andreea's Pod", lead: "Andreea Volzer" },
  "Arnett Shen": { pod: "Andreea's Pod", lead: "Andreea Volzer" },
  "Joel Fazecas": { pod: "Andreea's Pod", lead: "Andreea Volzer" },
  "Shahbaz Mahmood": { pod: "Andreea's Pod", lead: "Andreea Volzer" },
  // Offsite
  "Charles Ellenburg": { pod: "Offsite", lead: "Charles Ellenburg" },
};

const getSALead = (saName: string): string | null => SA_POD_MAP[saName]?.lead || null;

// SA name → email mapping for calendar lookups
const SA_EMAIL_MAP: Record<string, string> = {
  "Aaron Lit": "aaron@airops.com",
  "AJ Diaz": "aj@airops.com",
  "Andreea Volzer": "andreea.elena@airops.com",
  "Anton O'Malley": "anton@airops.com",
  "Arnett Shen": "arnett.shen@airops.com",
  "Diana Shiling": "diana@airops.com",
  "Elmi Abdullahi": "elmi@airops.com",
  "Henry Moses Jr": "henry.moses@airops.com",
  "Henry Young": "henry@airops.com",
  "Jeremy Kao": "jeremy@airops.com",
  "Joel Fazecas": "joel@airops.com",
  "John Sellers": "john@airops.com",
  "Melanie Dell'Olio": "melanie@airops.com",
  "Palmer Jones": "palmer@airops.com",
  "Richard Li": "richard@airops.com",
  "Charles Ellenburg": "charles@airops.com",
  "Shahbaz Mahmood": "shahbaz@airops.com",
  "William Reed": "will@airops.com",
  "Zoe Febrero": "zoe@airops.com",
};

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

// SAs excluded from kickoff assignment (e.g. pod leads not taking new kickoffs)
// Note: Asana uses a curly apostrophe (') in her name — both variants included
const SA_ASSIGNMENT_EXCLUDED = new Set(["Melanie Dell'Olio", "Melanie Dell\u2019Olio"]);

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

const emptySA = (name: string): SA => ({ name, useCases: [], totalHours: 0, monthBreakdown: { m1: 0, m2: 0, m3: 0 }, capacity: 128, utilizationPct: 0, notes: '' });

const INITIAL_SAS: SA[] = [
  emptySA("Aaron Lit"), emptySA("AJ Diaz"), emptySA("Andreea Volzer"), emptySA("Anton O'Malley"),
  emptySA("Arnett Shen"), emptySA("Charles Ellenburg"), emptySA("Diana Shiling"), emptySA("Elmi Abdullahi"),
  emptySA("Henry Moses Jr"), emptySA("Henry Young"), emptySA("Jeremy Kao"), emptySA("Joel Fazecas"),
  emptySA("John Sellers"), emptySA("Palmer Jones"), emptySA("Richard Li"), emptySA("Shahbaz Mahmood"),
  emptySA("William Reed"), emptySA("Zoe Febrero"),
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

// Format week date range (e.g., "Mar 9 – Mar 13")
const getWeekDateRange = (weekStr: string): string => {
  const mon = getWeekStartDate(weekStr);
  const fri = new Date(mon);
  fri.setUTCDate(mon.getUTCDate() + 4);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${fmt(mon)} – ${fmt(fri)}`;
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

const CapacityBadge = ({ pct }: { pct: number }) => {
  const style = pct <= 80
    ? 'bg-[#CCFFE0] text-[#008c44]'
    : pct <= 100
      ? 'bg-[#EEFF8C] text-[#000d05]'
      : 'bg-[#FFE5E5] text-[#991b1b]';

  return (
    <span className={`mono-label px-2 py-0.5 inline-block ${style}`}>
      {pct}%
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
  options: { label: string; value: string; badge?: React.ReactNode; image?: string }[];
  placeholder?: string;
  className?: string;
  labelClassName?: string;
  searchable?: boolean;
  loading?: boolean;
}

const CustomSelect = ({ value, onChange, options, placeholder, className, labelClassName, searchable, loading }: CustomSelectProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const selectedOption = options.find(o => o.value === value);

  const filtered = searchable && search
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isOpen) setIsOpen(false);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && searchable && searchRef.current) {
      searchRef.current.focus();
    }
    if (!isOpen) setSearch('');
  }, [isOpen, searchable]);

  return (
    <div className={`relative ${className}`} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-4 py-2 bg-white border border-[#d4e8da] text-sm flex items-center justify-between gap-2 hover:border-[#008c44] transition-colors ${labelClassName || 'mono-label'}`}
      >
        <span className="truncate flex items-center gap-2">
          {loading ? 'Loading...' : selectedOption ? (
            <>
              {selectedOption.image && <img src={selectedOption.image} alt="" className="w-5 h-5 rounded-full flex-shrink-0" />}
              {selectedOption.label}
            </>
          ) : placeholder}
        </span>
        <ChevronRight size={14} className={`transition-transform ${isOpen ? 'rotate-90' : ''} text-[#a5aab6]`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full left-0 w-full bg-white border border-[#d4e8da] z-50 shadow-xl mt-1 max-h-60 overflow-hidden flex flex-col"
          >
            {searchable && (
              <div className="p-2 border-b border-[#ecedef]">
                <div className="flex items-center gap-2 px-2 py-1.5 bg-[#f8f8f8] border border-[#d4e8da]">
                  <Search size={14} className="text-[#a5aab6] flex-shrink-0" />
                  <input
                    ref={searchRef}
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search..."
                    className="w-full bg-transparent outline-none text-sm"
                  />
                </div>
              </div>
            )}
            <div className="overflow-y-auto max-h-48">
              {filtered.length === 0 ? (
                <div className="px-4 py-3 text-sm text-[#a5aab6] text-center">No results</div>
              ) : (
                filtered.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                    className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 hover:bg-[#f0faf4] transition-colors ${value === option.value ? 'bg-[#f0faf4] font-bold' : ''} ${labelClassName || 'mono-label'}`}
                  >
                    {option.image && <img src={option.image} alt="" className="w-5 h-5 rounded-full flex-shrink-0" />}
                    <span className="flex-1">{option.label}</span>
                    {option.badge}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// --- Public Booking Page (no auth) ---
interface BookingSlot {
  start: string; // ISO datetime
  end: string;
}

function BookingPage({ kickoffId }: { kickoffId: string }) {
  const [slots, setSlots] = useState<BookingSlot[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [timezone, setTimezone] = useState('ET');
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<BookingSlot | null>(null);
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/trigger-deck?action=booking-slots&kickoffId=${kickoffId}`)
      .then(r => r.json())
      .then(json => {
        setSlots(json.slots || []);
        setCustomerName(json.customerName || '');
        setTimezone(json.timezone || 'ET');
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load available times');
        setLoading(false);
      });
  }, [kickoffId]);

  const handleConfirm = async () => {
    if (!selectedSlot || !clientName.trim() || !clientEmail.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/trigger-deck?action=booking-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kickoffId,
          selectedTime: selectedSlot.start,
          clientName: clientName.trim(),
          clientEmail: clientEmail.trim(),
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setConfirmed(true);
      } else {
        setError(json.error || 'Failed to confirm booking');
      }
    } catch {
      setError('Failed to confirm booking');
    }
    setSubmitting(false);
  };

  // Group slots by date
  const slotsByDate: [string, BookingSlot[]][] = useMemo(() => {
    const grouped: Record<string, BookingSlot[]> = {};
    for (const slot of slots) {
      const dateKey = new Date(slot.start).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(slot);
    }
    return Object.entries(grouped);
  }, [slots]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F8FFFA]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#008c44] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#676c79] text-sm font-sans">Loading available times...</p>
        </div>
      </div>
    );
  }

  if (confirmed) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F8FFFA]">
        <div className="text-center max-w-md mx-auto p-8">
          <img
            src="https://mms.businesswire.com/media/20251110823725/en/2637492/4/AirOps_logo.jpg"
            alt="AirOps Logo"
            className="h-10 mx-auto mb-6"
          />
          <div className="w-16 h-16 bg-[#008c44] rounded-full flex items-center justify-center mx-auto mb-4">
            <Check size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-sans font-bold text-[#000d05] mb-2">Meeting Confirmed!</h1>
          <p className="text-[#676c79] text-sm mb-4">
            Your kickoff meeting has been scheduled for:
          </p>
          <p className="text-lg font-bold text-[#000d05] mb-1">
            {selectedSlot && new Date(selectedSlot.start).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
          <p className="text-[#008c44] font-medium">
            {selectedSlot && new Date(selectedSlot.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            {' - '}
            {selectedSlot && new Date(selectedSlot.end).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            {' '}({timezone})
          </p>
          <p className="text-[#676c79] text-xs mt-6">A calendar invite will be sent to {clientEmail}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FFFA]">
      {/* Header */}
      <header className="bg-white border-b border-[#d4e8da] px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <img
            src="https://mms.businesswire.com/media/20251110823725/en/2637492/4/AirOps_logo.jpg"
            alt="AirOps Logo"
            className="h-8"
          />
          <span className="text-xs text-[#676c79]">Kickoff Scheduling</span>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-sans font-bold text-[#000d05] mb-1">
            Schedule Your Kickoff{customerName ? ` — ${customerName}` : ''}
          </h1>
          <p className="text-[#676c79] text-sm">
            Select an available time slot below. All times shown in {timezone}.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded">
            {error}
          </div>
        )}

        {slots.length === 0 ? (
          <div className="text-center py-16">
            <Clock size={48} className="text-[#d4e8da] mx-auto mb-4" />
            <p className="text-[#676c79] text-sm">No available time slots at the moment.</p>
            <p className="text-[#a5aab6] text-xs mt-1">Please check back later or contact your AirOps representative.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Time slots grouped by date */}
            <div className="space-y-4">
              {slotsByDate.map(([dateLabel, dateSlots]) => (
                <div key={dateLabel} className="bg-white border border-[#d4e8da] overflow-hidden">
                  <div className="px-4 py-2 bg-[#f0faf4] border-b border-[#d4e8da]">
                    <p className="text-sm font-bold text-[#000d05]">{dateLabel}</p>
                  </div>
                  <div className="p-4 flex flex-wrap gap-2">
                    {dateSlots.map((slot, i) => {
                      const isSelected = selectedSlot?.start === slot.start;
                      return (
                        <button
                          key={i}
                          onClick={() => setSelectedSlot(slot)}
                          className={`px-4 py-2 text-sm font-medium border transition-all ${
                            isSelected
                              ? 'bg-[#008c44] text-white border-[#008c44]'
                              : 'bg-white text-[#09090b] border-[#d4e8da] hover:border-[#008c44] hover:bg-[#f0faf4]'
                          }`}
                        >
                          {new Date(slot.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Confirmation form */}
            {selectedSlot && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white border border-[#d4e8da] p-6 space-y-4"
              >
                <div>
                  <p className="text-sm font-bold text-[#000d05] mb-1">Confirm Your Meeting</p>
                  <p className="text-xs text-[#676c79]">
                    {new Date(selectedSlot.start).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                    {' at '}
                    {new Date(selectedSlot.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    {' '}({timezone})
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#676c79] uppercase tracking-wide mb-1">Your Name</label>
                    <input
                      type="text"
                      value={clientName}
                      onChange={e => setClientName(e.target.value)}
                      placeholder="John Smith"
                      className="w-full p-3 border border-[#d4e8da] focus:border-[#008c44] outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#676c79] uppercase tracking-wide mb-1">Your Email</label>
                    <input
                      type="email"
                      value={clientEmail}
                      onChange={e => setClientEmail(e.target.value)}
                      placeholder="john@company.com"
                      className="w-full p-3 border border-[#d4e8da] focus:border-[#008c44] outline-none text-sm"
                    />
                  </div>
                </div>
                <button
                  onClick={handleConfirm}
                  disabled={!clientName.trim() || !clientEmail.trim() || submitting}
                  className="w-full py-3 bg-[#008c44] text-white text-sm font-bold hover:bg-[#006d35] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 size={14} className="animate-spin" />
                      Confirming...
                    </span>
                  ) : (
                    'Confirm Meeting'
                  )}
                </button>
              </motion.div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [authState, setAuthState] = useState<'checking' | 'authenticated' | 'unauthenticated'>('checking');
  const [currentUser, setCurrentUser] = useState<{ email: string; name: string; picture: string } | null>(null);
  const [view, setView] = useState<'schedule' | 'all' | 'capacity' | 'settings' | 'booking'>('schedule');
  const [bookingKickoffId, setBookingKickoffId] = useState<string | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [kickoffs, setKickoffs] = useState<Kickoff[]>(SEED_KICKOFFS);
  const [sas, setSas] = useState<SA[]>(INITIAL_SAS);
  const [saLoadingState, setSaLoadingState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [gcalConnected, setGcalConnected] = useState(false);
  const [maxSlots, setMaxSlots] = useState(10);
  const [hoursM1, setHoursM1] = useState(35);
  const [hoursM2, setHoursM2] = useState(25);
  const [hoursM3, setHoursM3] = useState(10);
  const [capacityHours, setCapacityHours] = useState(128);
  const [showWelcome, setShowWelcome] = useState(false);
  const [hubspotDeals, setHubspotDeals] = useState<HubSpotDeal[]>([]);
  const [hubspotAEs, setHubspotAEs] = useState<HubSpotAE[]>([]);
  const [excludedPeople, setExcludedPeople] = useState<string[]>([]);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [dragKickoffId, setDragKickoffId] = useState<string | null>(null);
  const [dragOverWeek, setDragOverWeek] = useState<string | null>(null);

  // Detect /book/{id} URL for public booking page (no auth required)
  useEffect(() => {
    const bookMatch = window.location.pathname.match(/^\/book\/(.+)$/);
    if (bookMatch) {
      setBookingKickoffId(bookMatch[1]);
      setView('booking');
    }
  }, []);

  // Check authentication on load
  useEffect(() => {
    if (window.location.search.includes('gcal=connected')) {
      window.history.replaceState({}, '', '/');
    }
    // Skip auth check if on booking page (public)
    if (view === 'booking') {
      setAuthState('authenticated'); // Allow rendering without login
      return;
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

  // Load settings from Redis on mount
  useEffect(() => {
    if (authState !== 'authenticated') return;
    fetch('/api/trigger-deck?action=get-settings')
      .then(res => res.json())
      .then(json => {
        if (typeof json.maxSlots === 'number') setMaxSlots(json.maxSlots);
        if (typeof json.hoursM1 === 'number') setHoursM1(json.hoursM1);
        if (typeof json.hoursM2 === 'number') setHoursM2(json.hoursM2);
        if (typeof json.hoursM3 === 'number') setHoursM3(json.hoursM3);
        if (typeof json.capacityHours === 'number') setCapacityHours(json.capacityHours);
      })
      .catch(() => {});
  }, [authState]);

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

    // Fetch HubSpot closed-won deals with localStorage caching
    const cachedDeals = localStorage.getItem('hubspot-deals');
    if (cachedDeals) {
      try {
        setHubspotDeals(JSON.parse(cachedDeals));
      } catch {}
    }
    // Fetch fresh deals in background
    fetch(`/api/trigger-deck?action=hubspot-deals&t=${Date.now()}`)
      .then(res => res.json())
      .then(json => {
        if (json.deals?.length > 0) {
          setHubspotDeals(json.deals);
          localStorage.setItem('hubspot-deals', JSON.stringify(json.deals));
        }
      })
      .catch(() => {});

    // Fetch HubSpot AE list with localStorage caching
    const cachedAEs = localStorage.getItem('hubspot-aes');
    if (cachedAEs) {
      try {
        setHubspotAEs(JSON.parse(cachedAEs));
      } catch {}
    }
    // Fetch fresh AEs in background
    fetch(`/api/trigger-deck?action=hubspot-aes&t=${Date.now()}`)
      .then(res => res.json())
      .then(json => {
        if (json.aes?.length > 0) {
          setHubspotAEs(json.aes);
          localStorage.setItem('hubspot-aes', JSON.stringify(json.aes));
        }
      })
      .catch(() => {});

    // Google Calendar kickoff import disabled for now
    // fetch('/api/google-calendar-kickoffs')
    //   .then(res => res.json())
    //   .then(json => {
    //     if (json.connected && json.kickoffs?.length > 0) {
    //       setKickoffs(prev => {
    //         const existingIds = new Set(prev.map(k => k.id));
    //         const newKickoffs = json.kickoffs.filter((k: any) => !existingIds.has(k.id));
    //         return [...prev, ...newKickoffs];
    //       });
    //     }
    //   })
    //   .catch(() => {});
  }, [authState]);

  // Fetch SA data from Asana API
  useEffect(() => {
    setSaLoadingState('loading');
    fetch('/api/asana-sa-data')
      .then(res => res.json())
      .then(json => {
        if (json.data && json.data.length > 0) {
          const saData: SA[] = json.data.filter((sa: any) => !SA_ASSIGNMENT_EXCLUDED.has(sa.name)).map((sa: any) => ({
            name: sa.name,
            useCases: sa.useCases || [],
            totalHours: sa.totalHours || 0,
            monthBreakdown: sa.monthBreakdown || { m1: 0, m2: 0, m3: 0 },
            capacity: sa.capacity || 128,
            utilizationPct: sa.utilizationPct || 0,
            notes: '',
          }));
          // Store excluded people (IE and CMS)
          if (json.excludedPeople) {
            setExcludedPeople(json.excludedPeople);
          }
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
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [slackUsers, setSlackUsers] = useState<SlackUser[]>([]);
  const [slackUsersLoading, setSlackUsersLoading] = useState(false);
  const [agentForm, setAgentForm] = useState({
    aeName: '',
    seName: '',
    csLead: '',
    kickoffDate: '',
    notionContent: '',
  });
  const [agentRunId, setAgentRunId] = useState<string | null>(null);
  const [agentResult, setAgentResult] = useState<DeckResult | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [deckResults, setDeckResults] = useState<Record<string, DeckResult>>({});
  const [slackRunId, setSlackRunId] = useState<string | null>(null);
  const [slackKickoffId, setSlackKickoffId] = useState<string | null>(null);
  const [scheduleInternalRunId, setScheduleInternalRunId] = useState<string | null>(null);
  const [scheduleExternalRunId, setScheduleExternalRunId] = useState<string | null>(null);
  const [scheduleKickoffId, setScheduleKickoffId] = useState<string | null>(null);

  const nextWeeks = useMemo(() => getNextWeeks(), []);

  const selectedKickoff = useMemo(() => 
    kickoffs.find(k => k.id === selectedKickoffId), 
    [kickoffs, selectedKickoffId]
  );

  // Load persisted deck result when a kickoff is selected
  useEffect(() => {
    if (!selectedKickoffId || deckResults[selectedKickoffId]) return;
    fetch(`/api/trigger-deck?action=get-deck&kickoffId=${selectedKickoffId}`)
      .then(r => r.json())
      .then(json => {
        if (json.result) {
          setDeckResults(prev => ({ ...prev, [selectedKickoffId]: json.result }));
        }
      })
      .catch(() => {});
  }, [selectedKickoffId]);

  // Poll for agent run completion
  useEffect(() => {
    if (!agentRunId || !selectedKickoffId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/trigger-deck?action=status&runId=${agentRunId}&kickoffId=${selectedKickoffId}`);
        const json = await res.json();
        if (json.status === 'COMPLETED' && json.output) {
          setAgentResult(json.output);
          setDeckResults(prev => ({ ...prev, [selectedKickoffId]: json.output }));
          setAgentRunId(null);
        } else if (json.status === 'FAILED' || json.status === 'CANCELED') {
          setAgentError(`Agent run ${json.status.toLowerCase()}`);
          setAgentRunId(null);
        }
      } catch {
        // keep polling
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [agentRunId, selectedKickoffId]);

  // Auto-check "Deck Created" task when a deck is created
  useEffect(() => {
    if (!selectedKickoff || !deckResults[selectedKickoff.id]) return;
    const deckTaskIndex = STANDARD_TASKS.indexOf('Deck Created');
    if (deckTaskIndex !== -1 && !selectedKickoff.tasks[deckTaskIndex]) {
      handleToggleTask(selectedKickoff.id, deckTaskIndex);
    }
  }, [deckResults, selectedKickoff?.id]);

  // Poll for Slack channel creation completion
  useEffect(() => {
    if (!slackRunId || !slackKickoffId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/trigger-deck?action=slack-status&runId=${slackRunId}&kickoffId=${slackKickoffId}`);
        const json = await res.json();
        if (json.status === 'COMPLETED' && json.output) {
          const output = json.output;
          setKickoffs(prev => prev.map(k => {
            if (k.id === slackKickoffId) {
              const newTasks = [...k.tasks];
              newTasks[7] = true; // Auto-check "Slack Channel Created"
              return {
                ...k,
                tasks: newTasks,
                status: k.status === 'NOT STARTED' ? 'IN PROGRESS' : k.status,
                slackInternalChannelId: output.slackInternalChannelId,
                slackExternalChannelId: output.slackExternalChannelId,
                slackConnectInviteLink: output.slackConnectInviteLink,
              };
            }
            return k;
          }));
          setSlackRunId(null);
          setSlackKickoffId(null);
        } else if (json.status === 'FAILED' || json.status === 'CANCELED') {
          setSlackRunId(null);
          setSlackKickoffId(null);
        }
      } catch {
        // keep polling
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [slackRunId, slackKickoffId]);

  // Poll for internal scheduling agent completion
  useEffect(() => {
    if (!scheduleInternalRunId || !scheduleKickoffId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/trigger-deck?action=schedule-status&runId=${scheduleInternalRunId}&kickoffId=${scheduleKickoffId}&type=internal`);
        const json = await res.json();
        if (json.status === 'COMPLETED' && json.output) {
          const output = json.output;
          setKickoffs(prev => prev.map(k => {
            if (k.id === scheduleKickoffId) {
              return {
                ...k,
                internalMeetingTime: output.internalMeetingTime,
                schedulingStatus: {
                  ...(k.schedulingStatus || { internal: 'not_started', external: 'not_started' }),
                  internal: 'confirmed',
                },
              };
            }
            return k;
          }));
          setScheduleInternalRunId(null);
          if (!scheduleExternalRunId) setScheduleKickoffId(null);
        } else if (json.status === 'FAILED' || json.status === 'CANCELED') {
          setScheduleInternalRunId(null);
          if (!scheduleExternalRunId) setScheduleKickoffId(null);
        } else if (json.status === 'EXECUTING') {
          // Update to 'waiting' once agent has been running (times posted in Slack)
          setKickoffs(prev => prev.map(k => {
            if (k.id === scheduleKickoffId && k.schedulingStatus?.internal === 'finding_times') {
              return {
                ...k,
                schedulingStatus: {
                  ...(k.schedulingStatus || { internal: 'not_started', external: 'not_started' }),
                  internal: 'waiting',
                },
              };
            }
            return k;
          }));
        }
      } catch {
        // keep polling
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [scheduleInternalRunId, scheduleKickoffId, scheduleExternalRunId]);

  // Poll for external scheduling agent completion
  useEffect(() => {
    if (!scheduleExternalRunId || !scheduleKickoffId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/trigger-deck?action=schedule-status&runId=${scheduleExternalRunId}&kickoffId=${scheduleKickoffId}&type=external`);
        const json = await res.json();
        if (json.status === 'COMPLETED' && json.output) {
          const output = json.output;
          setKickoffs(prev => prev.map(k => {
            if (k.id === scheduleKickoffId) {
              return {
                ...k,
                externalMeetingTime: output.externalMeetingTime,
                externalBookingLink: output.externalBookingLink,
                schedulingStatus: {
                  ...(k.schedulingStatus || { internal: 'not_started', external: 'not_started' }),
                  external: output.externalMeetingTime ? 'confirmed' : 'waiting',
                },
              };
            }
            return k;
          }));
          setScheduleExternalRunId(null);
          if (!scheduleInternalRunId) setScheduleKickoffId(null);
        } else if (json.status === 'FAILED' || json.status === 'CANCELED') {
          setScheduleExternalRunId(null);
          if (!scheduleInternalRunId) setScheduleKickoffId(null);
        } else if (json.status === 'EXECUTING') {
          setKickoffs(prev => prev.map(k => {
            if (k.id === scheduleKickoffId && k.schedulingStatus?.external === 'finding_times') {
              return {
                ...k,
                schedulingStatus: {
                  ...(k.schedulingStatus || { internal: 'not_started', external: 'not_started' }),
                  external: 'waiting',
                },
              };
            }
            return k;
          }));
        }
      } catch {
        // keep polling
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [scheduleExternalRunId, scheduleKickoffId, scheduleInternalRunId]);

  // Find the closest matching Slack user name
  const findSlackUserName = useCallback((name: string, users: SlackUser[]): string => {
    if (!name || users.length === 0) return name;
    // Exact match first
    const exact = users.find(u => u.real_name === name);
    if (exact) return exact.real_name;
    // Case-insensitive match
    const lower = name.toLowerCase();
    const caseMatch = users.find(u => u.real_name.toLowerCase() === lower);
    if (caseMatch) return caseMatch.real_name;
    // Partial match (name contained in Slack name or vice versa)
    const partial = users.find(u =>
      u.real_name.toLowerCase().includes(lower) || lower.includes(u.real_name.toLowerCase())
    );
    if (partial) return partial.real_name;
    return name;
  }, []);

  // Fetch Slack users when modal opens
  useEffect(() => {
    if (!showAgentModal || slackUsers.length > 0) return;
    setSlackUsersLoading(true);
    fetch('/api/trigger-deck?action=slack-users')
      .then(r => r.json())
      .then(json => {
        console.log('Slack users response:', json);
        const users: SlackUser[] = json.users || [];
        setSlackUsers(users);
        // Re-resolve form names against loaded Slack users
        setAgentForm(f => ({
          ...f,
          aeName: findSlackUserName(f.aeName, users),
          seName: findSlackUserName(f.seName, users),
          csLead: findSlackUserName(f.csLead, users),
        }));
      })
      .catch((err) => console.error('Slack users fetch failed:', err))
      .finally(() => setSlackUsersLoading(false));
  }, [showAgentModal, findSlackUserName]);

  const openAgentModal = useCallback(() => {
    if (!selectedKickoff) return;
    setAgentForm({
      aeName: selectedKickoff.aeName || '',
      seName: selectedKickoff.saName || '',
      csLead: (selectedKickoff.saName && SA_POD_MAP[selectedKickoff.saName]?.lead) || '',
      kickoffDate: selectedKickoff.eventDate
        ? new Date(selectedKickoff.eventDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
        : '',
      notionContent: '',
    });
    setAgentResult(null);
    setAgentError(null);
    setAgentRunId(null);
    setShowAgentModal(true);
  }, [selectedKickoff]);

  const submitAgentForm = useCallback(async () => {
    if (!selectedKickoff) return;
    setAgentError(null);
    setDeckGenerating(selectedKickoff.id);
    try {
      const res = await fetch('/api/trigger-deck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kickoffId: selectedKickoff.id,
          aeName: agentForm.aeName,
          seName: agentForm.seName,
          csLead: agentForm.csLead,
          kickoffDate: agentForm.kickoffDate,
          notionContent: agentForm.notionContent,
          slackChannel: 'C0ABV8P5PUJ',
          slackThreadTs: '1772657939.513619',
          slackUserId: 'U09A0PWL6KW',
        }),
      });
      if (!res.ok) throw new Error('Failed to trigger agent');
      const json = await res.json();
      setAgentRunId(json.runId);
    } catch (err: any) {
      setAgentError(err.message);
    } finally {
      setDeckGenerating(null);
    }
  }, [selectedKickoff, agentForm]);

  // Recalculate hours/utilization using the configurable M1/M2/M3 values from Settings
  const sasWithRecalcHours = sas.map(sa => {
    const nonPlaceholder = sa.useCases.filter(uc => !uc.isPlaceholder);
    const totalHours = nonPlaceholder.reduce((sum, uc) => {
      if (uc.month === 1) return sum + hoursM1;
      if (uc.month === 2) return sum + hoursM2;
      if (uc.month === 3) return sum + hoursM3;
      return sum;
    }, 0);
    return { ...sa, totalHours, capacity: capacityHours, utilizationPct: Math.round((totalHours / capacityHours) * 100) };
  });

  const sasSortedByCapacity = [...sasWithRecalcHours].sort((a, b) => a.totalHours - b.totalHours);

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

  const handleMoveKickoff = (kickoffId: string, newWeek: string) => {
    setKickoffs(prev => prev.map(k => {
      if (k.id !== kickoffId || k.week === newWeek) return k;
      const updated = { ...k, week: newWeek };
      saveKickoffToRedis(updated);
      return updated;
    }));
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

  const triggerSlackChannels = (kickoff: Kickoff) => {
    fetch('/api/trigger-deck?action=trigger-slack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kickoffId: kickoff.id,
        customerName: kickoff.customerName,
        aeName: kickoff.aeName,
        saName: kickoff.saName,
        saLeadName: getSALead(kickoff.saName) || '',
        kickoffDate: kickoff.eventDate,
        useCase: kickoff.useCaseType,
        pod: SA_POD_MAP[kickoff.saName]?.pod || '',
      }),
    })
      .then(r => r.json())
      .then(json => {
        if (json.ok && json.runId) {
          setSlackRunId(json.runId);
          setSlackKickoffId(kickoff.id);
        }
      })
      .catch(() => {});
  };

  const triggerScheduleInternal = (kickoff: Kickoff) => {
    const saLead = getSALead(kickoff.saName) || '';
    fetch('/api/trigger-deck?action=schedule-internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kickoffId: kickoff.id,
        customerName: kickoff.customerName,
        aeName: kickoff.aeName,
        aeEmail: SA_EMAIL_MAP[kickoff.aeName] || '',
        saName: kickoff.saName,
        saEmail: SA_EMAIL_MAP[kickoff.saName] || '',
        saLeadName: saLead,
        saLeadEmail: SA_EMAIL_MAP[saLead] || '',
        slackInternalChannelId: kickoff.slackInternalChannelId || '',
        timezone: kickoff.timezone || 'ET',
      }),
    })
      .then(r => r.json())
      .then(json => {
        if (json.ok && json.runId) {
          setScheduleInternalRunId(json.runId);
          setScheduleKickoffId(kickoff.id);
          setKickoffs(prev => prev.map(k =>
            k.id === kickoff.id
              ? { ...k, internalMeetingRunId: json.runId, schedulingStatus: { ...(k.schedulingStatus || { internal: 'not_started', external: 'not_started' }), internal: 'finding_times' } }
              : k
          ));
        }
      })
      .catch(() => {});
  };

  const triggerScheduleExternal = (kickoff: Kickoff) => {
    fetch('/api/trigger-deck?action=schedule-external', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kickoffId: kickoff.id,
        customerName: kickoff.customerName,
        aeName: kickoff.aeName,
        aeEmail: SA_EMAIL_MAP[kickoff.aeName] || '',
        saName: kickoff.saName,
        saEmail: SA_EMAIL_MAP[kickoff.saName] || '',
        slackInternalChannelId: kickoff.slackInternalChannelId || '',
        timezone: kickoff.timezone || 'ET',
      }),
    })
      .then(r => r.json())
      .then(json => {
        if (json.ok && json.runId) {
          setScheduleExternalRunId(json.runId);
          setScheduleKickoffId(kickoff.id);
          setKickoffs(prev => prev.map(k =>
            k.id === kickoff.id
              ? { ...k, externalMeetingRunId: json.runId, schedulingStatus: { ...(k.schedulingStatus || { internal: 'not_started', external: 'not_started' }), external: 'finding_times' } }
              : k
          ));
        }
      })
      .catch(() => {});
  };

  const isAdmin = currentUser?.email === 'henry.moses@airops.com';

  const handleDeleteKickoff = (kickoffId: string) => {
    if (!isAdmin) return;
    if (!confirm('Are you sure you want to delete this kickoff? This cannot be undone.')) return;
    setKickoffs(prev => prev.filter(k => k.id !== kickoffId));
    setSelectedKickoffId(null);
    fetch('/api/kickoffs-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: kickoffId }),
    }).catch(() => {});
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
          {(() => {
            // Collect all weeks from kickoffs + next 8 weeks, dedupe, sort chronologically
            const allWeekSet = new Set([...nextWeeks, ...kickoffs.map(k => k.week)]);
            return Array.from(allWeekSet).sort();
          })().map(week => {
            const weekKickoffs = kickoffs.filter(k => k.week === week);
            const slotsUsed = weekKickoffs.length;
            const currentWeek = getWeekString(new Date());
            const isPast = week < currentWeek;

            return (
              <div
                key={week}
                className={`border bg-white p-4 md:p-6 space-y-4 md:space-y-6 transition-colors ${dragOverWeek === week ? 'border-[#008c44] bg-[#f0faf4]' : 'border-[#d4e8da]'}`}
                onDragOver={(e) => { e.preventDefault(); setDragOverWeek(week); }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverWeek(null); }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragKickoffId) handleMoveKickoff(dragKickoffId, week);
                  setDragKickoffId(null);
                  setDragOverWeek(null);
                }}
              >
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                  <div className="flex items-center gap-4 md:gap-6">
                    <div className="min-w-[140px] md:min-w-[200px]">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base md:text-lg font-sans font-medium text-[#09090b]">{week}</h3>
                        {isPast && <span className="mono-label px-1.5 py-0.5 bg-[#ecedef] text-[#676c79] text-[10px]">PAST</span>}
                      </div>
                      <p className="text-xs text-[#676c79]">{getWeekDateRange(week)}</p>
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
                      onClick={(e) => {
                        e.stopPropagation();
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
                      draggable
                      onDragStart={(e) => { setDragKickoffId(k.id); e.dataTransfer.effectAllowed = 'move'; }}
                      onDragEnd={() => { setDragKickoffId(null); setDragOverWeek(null); }}
                      onClick={() => setSelectedKickoffId(k.id)}
                      className={`border border-[#ecedef] p-4 hover:bg-[#f0faf4] cursor-grab active:cursor-grabbing transition-colors group ${dragKickoffId === k.id ? 'opacity-40' : ''}`}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h4 className="font-sans font-bold text-sm">{k.customerName}</h4>
                          <p className="text-xs text-[#676c79]">{k.aeName}</p>
                        </div>
                        <StatusBadge status={k.status} />
                      </div>
                      <div className="flex items-center justify-between mt-auto">
                        <div className="flex items-center gap-1.5">
                          <span className="mono-label bg-[#CCFFE0] text-[#000d05] px-2 py-0.5">
                            {k.saName}
                          </span>
                          {k.useCaseType && (
                            <span className="mono-label bg-[#EDE9FE] text-[#5B21B6] px-1.5 py-0.5 text-[9px]">
                              {k.useCaseType}
                            </span>
                          )}
                        </div>
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
                  onClick={(e) => {
                    e.stopPropagation();
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
                          {k.customerName}{k.saName ? ` · ${k.saName}` : ''}{k.useCaseType ? ` · ${k.useCaseType}` : ''}
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

  const [capacityPodFilter, setCapacityPodFilter] = useState<string>('all');
  const [expandedSA, setExpandedSA] = useState<string | null>(null);
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());

  const pods = [...new Set(
    Object.entries(SA_POD_MAP)
      .filter(([name]) => !SA_ASSIGNMENT_EXCLUDED.has(name))
      .map(([, v]) => v.pod)
  )];

  const capacityFilteredSAs = (capacityPodFilter === 'all'
    ? sas
    : sas.filter(sa => SA_POD_MAP[sa.name]?.pod === capacityPodFilter)
  ).filter(sa => !SA_ASSIGNMENT_EXCLUDED.has(sa.name));

  const capacitySorted = [...capacityFilteredSAs].sort((a, b) => b.utilizationPct - a.utilizationPct);

  const totalM1 = capacityFilteredSAs.reduce((s, sa) => s + sa.monthBreakdown.m1, 0);
  const totalM2 = capacityFilteredSAs.reduce((s, sa) => s + sa.monthBreakdown.m2, 0);
  const totalM3 = capacityFilteredSAs.reduce((s, sa) => s + sa.monthBreakdown.m3, 0);
  const totalActHrs = capacityFilteredSAs.reduce((s, sa) => s + sa.totalHours, 0);
  const totalCapacity = capacityFilteredSAs.length * capacityHours;
  const totalUCs = totalM1 + totalM2 + totalM3;

  const currentMonth = new Date().toLocaleString('en-US', { month: 'long' });
  const currentYear = new Date().getFullYear();

  const SACapacityLoadingSkeleton = () => (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header Skeleton */}
      <div>
        <div className="h-4 w-24 bg-[#e0e0e0] rounded mb-3" />
        <div className="h-10 w-64 bg-[#e0e0e0] rounded mb-2" />
        <div className="h-4 w-96 bg-[#f0f0f0] rounded" />
      </div>

      {/* Pod Filter Skeleton */}
      <div className="flex gap-0 border border-[#d4e8da] w-fit">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className={`px-5 py-2.5 bg-[#f0f0f0] ${i > 0 ? 'border-l border-[#d4e8da]' : ''} w-24 h-10 rounded-none`} />
        ))}
      </div>

      {/* Summary Cards Skeleton */}
      <div className="grid grid-cols-4 gap-0 border border-[#d4e8da]">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className={`p-5 ${i < 3 ? 'border-r border-[#d4e8da]' : ''}`}>
            <div className="h-3 w-20 bg-[#f0f0f0] rounded mb-2" />
            <div className="h-8 w-12 bg-[#e0e0e0] rounded mb-1" />
            <div className="h-3 w-32 bg-[#f0f0f0] rounded" />
          </div>
        ))}
      </div>

      {/* Legend Skeleton */}
      <div className="flex items-center gap-6">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-4 w-32 bg-[#f0f0f0] rounded" />
        ))}
      </div>

      {/* SA Rows Skeleton */}
      <div className="space-y-0 border border-[#d4e8da]">
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} className="border-b border-[#ecedef] last:border-b-0 px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3 flex-1">
                <div className="h-4 w-32 bg-[#e0e0e0] rounded" />
                <div className="h-4 w-24 bg-[#f0f0f0] rounded" />
                <div className="h-5 w-16 border border-[#d4e8da] rounded bg-[#f0f0f0]" />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-5 w-12 bg-[#f0f0f0] rounded" />
                <div className="h-5 w-12 bg-[#f0f0f0] rounded" />
                <div className="h-4 w-16 bg-[#f0f0f0] rounded" />
              </div>
            </div>
            <div className="h-5 bg-[#f0f0f0] rounded w-full" />
          </div>
        ))}
      </div>

      {/* Footer Skeleton */}
      <div className="flex gap-3 bg-[#f8faf9] border border-[#d4e8da] p-4">
        <div className="h-6 w-24 bg-[#e0e0e0] rounded shrink-0" />
        <div className="h-4 w-full bg-[#f0f0f0] rounded" />
      </div>
    </div>
  );

  const SACapacityView = () => (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <span className="mono-label px-2 py-0.5 bg-[#000d05] text-white text-[10px] inline-block mb-3">CX CAPACITY</span>
        <h1 className="text-2xl md:text-4xl mb-1">Activation capacity by SA</h1>
        <p className="text-[#676c79] text-sm">
          Use-case level from Asana — {totalUCs} activations in months 1–3 across {capacityFilteredSAs.length} SAs — {currentMonth} {currentYear}
        </p>
      </div>

      {/* Pod Filter Tabs */}
      <div className="flex gap-0 border border-[#d4e8da] w-fit">
        <button
          onClick={() => setCapacityPodFilter('all')}
          className={`px-5 py-2.5 mono-label text-xs transition-colors ${capacityPodFilter === 'all' ? 'bg-[#008c44] text-white' : 'bg-white text-[#000d05] hover:bg-[#f0faf4]'}`}
        >
          ALL PODS
        </button>
        {pods.map(pod => {
          const shortName = pod.replace("'s Pod", '').replace('Pod ', '').toUpperCase() + ' POD';
          return (
            <button
              key={pod}
              onClick={() => setCapacityPodFilter(pod)}
              className={`px-5 py-2.5 mono-label text-xs border-l border-[#d4e8da] transition-colors ${capacityPodFilter === pod ? 'bg-[#008c44] text-white' : 'bg-white text-[#000d05] hover:bg-[#f0faf4]'}`}
            >
              {shortName}
            </button>
          );
        })}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-0 border border-[#d4e8da]">
        <div className="p-5 border-r border-[#d4e8da]">
          <p className="mono-label text-[#676c79] text-[10px] mb-2">MONTH 1 UCS</p>
          <p className="text-3xl font-sans text-[#008c44] font-bold">{totalM1}</p>
          <p className="text-xs text-[#676c79] mt-1">{totalM1 * hoursM1}h @ {hoursM1}h each</p>
        </div>
        <div className="p-5 border-r border-[#d4e8da]">
          <p className="mono-label text-[#676c79] text-[10px] mb-2">MONTH 2 UCS</p>
          <p className="text-3xl font-sans text-[#008c44] font-bold">{totalM2}</p>
          <p className="text-xs text-[#676c79] mt-1">{totalM2 * hoursM2}h @ {hoursM2}h each</p>
        </div>
        <div className="p-5 border-r border-[#d4e8da]">
          <p className="mono-label text-[#676c79] text-[10px] mb-2">MONTH 3 UCS</p>
          <p className="text-3xl font-sans text-[#008c44] font-bold">{totalM3}</p>
          <p className="text-xs text-[#676c79] mt-1">{totalM3 * hoursM3}h @ {hoursM3}h each</p>
        </div>
        <div className="p-5">
          <p className="mono-label text-[#676c79] text-[10px] mb-2">TOTAL ACT. HRS</p>
          <p className="text-3xl font-sans font-bold">{totalActHrs}</p>
          <p className="text-xs text-[#676c79] mt-1">of {totalCapacity} capacity</p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 text-xs text-[#676c79] mono-label">
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 bg-[#66d99a] inline-block" /> MONTH 1 ({hoursM1}H)</div>
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 bg-[#00b85c] inline-block" /> MONTH 2 ({hoursM2}H)</div>
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 bg-[#008c44] inline-block" /> MONTH 3 ({hoursM3}H)</div>
        <div className="flex items-center gap-1.5"><span className="w-6 border-t-2 border-[#676c79] inline-block" /> {capacityHours}H CAPACITY</div>
      </div>

      {/* SA Rows */}
      <div className="space-y-0 border border-[#d4e8da]">
        {capacitySorted.map(sa => {
          const pod = SA_POD_MAP[sa.name]?.pod;
          const podShort = pod ? pod.replace("'s Pod", '').replace('Pod ', '').toUpperCase() : '';
          const ucCount = sa.useCases.length;
          const isExpanded = expandedSA === sa.name;

          // Bar widths as percentage of max (use 200h as max bar width reference, or capacity * 1.2)
          const maxBarHours = Math.max(capacityHours * 1.2, sa.totalHours * 1.05, capacityHours);
          const m1Hours = sa.monthBreakdown.m1 * 35;
          const m2Hours = sa.monthBreakdown.m2 * 25;
          const m3Hours = sa.monthBreakdown.m3 * 10;
          const m1Pct = (m1Hours / maxBarHours) * 100;
          const m2Pct = (m2Hours / maxBarHours) * 100;
          const m3Pct = (m3Hours / maxBarHours) * 100;
          const capacityLinePct = (capacityHours / maxBarHours) * 100;

          return (
            <div key={sa.name} className="border-b border-[#ecedef] last:border-b-0">
              <div className="px-5 pt-4 pb-2">
                {/* Top row: name, UC count, pod, month pills, hours, pct */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="font-sans font-bold text-sm">{sa.name}</span>
                    <span className="text-xs text-[#676c79]">{ucCount} USE CASES</span>
                    {podShort && (
                      <span className="mono-label text-[10px] px-2 py-0.5 border border-[#008c44] text-[#008c44]">
                        {podShort}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {sa.monthBreakdown.m1 > 0 && (
                      <span className="mono-label text-[10px] px-2 py-0.5 bg-[#e6f7ee] text-[#008c44]">
                        {sa.monthBreakdown.m1} M1
                      </span>
                    )}
                    {sa.monthBreakdown.m2 > 0 && (
                      <span className="mono-label text-[10px] px-2 py-0.5 bg-[#ccf0dc] text-[#008c44]">
                        {sa.monthBreakdown.m2} M2
                      </span>
                    )}
                    {sa.monthBreakdown.m3 > 0 && (
                      <span className="mono-label text-[10px] px-2 py-0.5 bg-[#b3e8cc] text-[#008c44]">
                        {sa.monthBreakdown.m3} M3
                      </span>
                    )}
                    <span className="text-xs font-mono text-[#676c79]">{sa.totalHours}H/{capacityHours}H</span>
                    <CapacityBadge pct={sa.utilizationPct} />
                    <button
                      onClick={() => setExpandedSA(isExpanded ? null : sa.name)}
                      className="text-[#676c79] hover:text-[#000d05] transition-colors ml-1"
                    >
                      <ChevronDown size={14} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                </div>

                {/* Capacity Bar */}
                <div className="relative h-5 bg-[#f0faf4] w-full mb-2">
                  <div className="absolute inset-0 flex">
                    {m1Pct > 0 && <div className="h-full bg-[#66d99a]" style={{ width: `${m1Pct}%` }} />}
                    {m2Pct > 0 && <div className="h-full bg-[#00b85c]" style={{ width: `${m2Pct}%` }} />}
                    {m3Pct > 0 && <div className="h-full bg-[#008c44]" style={{ width: `${m3Pct}%` }} />}
                  </div>
                  {/* 128h capacity line */}
                  <div
                    className="absolute top-0 bottom-0 border-r-2 border-[#000d05]"
                    style={{ left: `${Math.min(capacityLinePct, 100)}%` }}
                  />
                </div>
              </div>

              {/* Expanded: Flat use case table with company column */}
              {isExpanded && sa.useCases.length > 0 && (() => {
                const statusColors: Record<string, string> = {
                  'Pre-Activation': 'bg-[#b3e5fc] text-[#01579b]',
                  'Activation': 'bg-[#f8bbd0] text-[#880e4f]',
                  'Live but Syncs': 'bg-[#ffe0b2] text-[#e65100]',
                  'Async Support': 'bg-[#c8e6c9] text-[#1b5e20]',
                  'Churned': 'bg-[#ffccbc] text-[#d84315]',
                };

                return (
                  <div className="px-5 pb-4 bg-[#f8faf9]">
                    <table className="w-full text-xs">
                      <tbody>
                        {sa.useCases.map((uc, ucIdx) => {
                          const statusClass = uc.customerStatus ? statusColors[uc.customerStatus] || 'bg-[#f0f0f0] text-[#676c79]' : 'bg-[#f0f0f0] text-[#a5aab6]';
                          const isPlaceholder = (uc as any).isPlaceholder;

                          return (
                            <tr key={ucIdx} className={`border-t border-[#ecedef] ${isPlaceholder ? 'bg-[#f5f5f5]' : 'bg-[#fafbfa]'}`}>
                              <td className="py-2 px-2 font-sans text-[#676c79]">
                                {uc.customer}
                              </td>
                              <td className="py-2 px-2 font-sans">
                                <div className="flex flex-col gap-1">
                                  <span className={`${isPlaceholder ? 'text-[#a5aab6] italic' : 'text-[#000d05]'}`}>{uc.name}</span>
                                  {uc.customerStatus && !isPlaceholder && (
                                    <span className={`mono-label text-[9px] px-1.5 py-0.5 w-fit rounded ${statusClass}`}>
                                      {uc.customerStatus}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2 px-2">
                                {!isPlaceholder && (uc.month ? (
                                  <span className={`mono-label text-[10px] px-1.5 py-0.5 ${
                                    uc.month === 1 ? 'bg-[#e6f7ee]' : uc.month === 2 ? 'bg-[#ccf0dc]' : 'bg-[#b3e8cc]'
                                  } text-[#008c44]`}>
                                    M{uc.month}
                                  </span>
                                ) : uc.customerStatus !== 'Pre-Activation' ? (
                                  <span className="mono-label text-[10px] px-1.5 py-0.5 bg-[#fde8e8] text-[#cc0000]">
                                    NO DATE
                                  </span>
                                ) : null)}
                              </td>
                              <td className="py-2 px-2 text-right font-mono">{!isPlaceholder ? `${uc.hours}h` : ''}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>

      {/* Assumptions footer */}
      <div className="flex items-start gap-3 bg-[#f8faf9] border border-[#d4e8da] p-4">
        <span className="mono-label text-[10px] px-2 py-1 bg-[#000d05] text-white shrink-0">ASSUMPTIONS</span>
        <p className="text-xs text-[#676c79]">
          {capacityHours} hrs effective capacity per SA — M1: {hoursM1}h — M2: {hoursM2}h — M3: {hoursM3}h — Capacity counted per use case (subtask)
        </p>
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

        <div className="space-y-2">
          <label className="mono-label text-[#676c79]">SA Capacity (Hours per SA)</label>
          <p className="text-xs text-[#676c79]">Total effective hours available per SA. Default: 128 (160 hrs/mo × 80% util).</p>
          <input
            type="number"
            value={capacityHours}
            onChange={(e) => setCapacityHours(parseInt(e.target.value) || 128)}
            className="w-full p-3 border border-[#d4e8da] focus:border-[#008c44] outline-none"
          />
        </div>

        <div className="space-y-3">
          <label className="mono-label text-[#676c79]">SA Capacity Hours by Month</label>
          <p className="text-xs text-[#676c79]">Hours assigned per use case depending on how many months since kickoff.</p>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-[#676c79] font-sans">Month 1 (0–30 days)</label>
              <input
                type="number"
                value={hoursM1}
                onChange={(e) => setHoursM1(parseInt(e.target.value) || 0)}
                className="w-full p-3 border border-[#d4e8da] focus:border-[#008c44] outline-none text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-[#676c79] font-sans">Month 2 (31–60 days)</label>
              <input
                type="number"
                value={hoursM2}
                onChange={(e) => setHoursM2(parseInt(e.target.value) || 0)}
                className="w-full p-3 border border-[#d4e8da] focus:border-[#008c44] outline-none text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-[#676c79] font-sans">Month 3 (61–90 days)</label>
              <input
                type="number"
                value={hoursM3}
                onChange={(e) => setHoursM3(parseInt(e.target.value) || 0)}
                className="w-full p-3 border border-[#d4e8da] focus:border-[#008c44] outline-none text-sm"
              />
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            fetch('/api/trigger-deck?action=save-settings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ maxSlots, hoursM1, hoursM2, hoursM3, capacityHours }),
            })
              .then(() => {
                setSettingsSaved(true);
                setTimeout(() => setSettingsSaved(false), 3000);
              })
              .catch(() => {
                setSettingsSaved(true);
                setTimeout(() => setSettingsSaved(false), 3000);
              });
          }}
          className="bg-[#000d05] text-white px-8 py-3 font-sans font-medium hover:opacity-90 transition-opacity"
        >
          Save Changes
        </button>
      </div>
    </div>
  );

  // --- Side Panels ---

  const BookingPanel = () => {
    const [customerName, setCustomerName] = useState('');
    const [aeName, setAeName] = useState('');
    const [selectedUseCases, setSelectedUseCases] = useState<string[]>([]);
    const [dealSearch, setDealSearch] = useState('');
    const [dealDropdownOpen, setDealDropdownOpen] = useState(false);
    const dealRef = useRef<HTMLDivElement>(null);
    const [aeSearch, setAeSearch] = useState('');
    const [aeDropdownOpen, setAeDropdownOpen] = useState(false);
    const aeRef = useRef<HTMLDivElement>(null);
    const [notes, setNotes] = useState('');
    const [timezone, setTimezone] = useState('');
    const [arr, setArr] = useState('');
    const [isPoc, setIsPoc] = useState(false);

    const [date1, setDate1] = useState('');

    const derivedWeek1 = date1 ? getWeekString(new Date(date1 + 'T00:00:00')) : bookingWeek;
    const week1SlotsUsed = kickoffs.filter(k => k.week === derivedWeek1).length;
    const week1IsFull = week1SlotsUsed >= maxSlots;

    // Count ALL kickoffs per SA across all weeks (includes ones not yet in Asana)
    const saAllCounts = kickoffs.reduce<Record<string, number>>((acc, k) => {
      acc[k.saName] = (acc[k.saName] || 0) + 1;
      return acc;
    }, {});

    // Auto-assign: lowest utilization SA with fewer than 2 total kickoffs
    const autoAssignedSA = sasSortedByCapacity.find(sa => (saAllCounts[sa.name] || 0) < 2)?.name
      || sasSortedByCapacity[0]?.name;

    const [sa1, setSa1] = useState(autoAssignedSA);

    // Re-derive SA when date or use case changes (don't override manual picks)
    const [userPickedSA, setUserPickedSA] = useState(false);
    useEffect(() => {
      if (!userPickedSA) {
        if (selectedUseCases.includes('Offsite')) {
          setSa1('Charles Ellenburg');
        } else {
          const best = sasSortedByCapacity.find(sa => (saAllCounts[sa.name] || 0) < 2)?.name
            || sasSortedByCapacity[0]?.name;
          setSa1(best);
        }
      }
    }, [derivedWeek1, selectedUseCases]);

    const sa1TotalCount = saAllCounts[sa1] || 0;
    const sa1AtLimit = sa1TotalCount >= 2;

    const today = new Date().toISOString().split('T')[0];
    const maxDate = new Date(Date.now() + 56 * 86400000).toISOString().split('T')[0];

    const handleSubmit = () => {
      handleAddKickoff({
        customerName,
        aeName,
        saName: sa1,
        week: derivedWeek1,
        status: 'NOT STARTED',
        notes,
        eventDate: date1 ? new Date(date1 + 'T00:00:00').toISOString() : undefined,
        useCaseType: selectedUseCases.length > 0 ? selectedUseCases.join(', ') : undefined,
        timezone: timezone || undefined,
        arr: arr || undefined,
        isPoc,
      });
    };

    const filteredDeals = hubspotDeals.filter((d: HubSpotDeal) =>
      (d.name || '').toLowerCase().includes(dealSearch.toLowerCase())
    );

    const filteredAEs = hubspotAEs.filter((a: HubSpotAE) =>
      (a.name || '').toLowerCase().includes(aeSearch.toLowerCase()) &&
      !excludedPeople.includes(a.name)
    );

    useEffect(() => {
      const handler = (e: MouseEvent) => {
        if (dealRef.current && !dealRef.current.contains(e.target as Node)) {
          setDealDropdownOpen(false);
        }
        if (aeRef.current && !aeRef.current.contains(e.target as Node)) {
          setAeDropdownOpen(false);
        }
      };
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }, []);

    const canSubmit = customerName && aeName && date1 && selectedUseCases.length > 0 && !week1IsFull && !sa1AtLimit;

    return (
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        onClick={(e) => e.stopPropagation()}
        className="fixed top-0 right-0 h-full w-full sm:w-[420px] bg-white border-l border-[#d4e8da] z-50 shadow-2xl p-6 sm:p-8 overflow-y-auto"
      >
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-3xl font-serif">Book Slot</h2>
          <button onClick={() => setIsBookingOpen(false)} className="text-[#676c79] hover:text-[#000d05]">
            <X size={24} />
          </button>
        </div>

        <div className="space-y-6">
          {/* Use Case Type */}
          <div className="space-y-2">
            <label className="mono-label text-[#676c79]">Use Case Type</label>
            <div className="space-y-2">
              {USE_CASE_TYPES.map(type => {
                const isSelected = selectedUseCases.includes(type);
                const isOffsite = type === 'Offsite';
                const hasOffsite = selectedUseCases.includes('Offsite');
                const hasNonOffsite = selectedUseCases.some(t => t !== 'Offsite');
                const isDisabled = (isOffsite && hasNonOffsite) || (!isOffsite && hasOffsite);
                return (
                  <label
                    key={type}
                    className={`flex items-center gap-3 p-3 border cursor-pointer transition-all ${
                      isSelected ? 'border-[#008c44] bg-[#f0faf4]' : 'border-[#d4e8da] hover:border-[#008c44]'
                    } ${isDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <div
                      className={`w-5 h-5 border flex items-center justify-center transition-colors ${
                        isSelected ? 'bg-[#008c44] border-[#008c44]' : 'border-[#d4e8da]'
                      }`}
                    >
                      {isSelected && <Check size={14} className="text-white" />}
                    </div>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={isSelected}
                      disabled={isDisabled}
                      onChange={() => {
                        if (isDisabled) return;
                        if (isSelected) {
                          setSelectedUseCases(prev => prev.filter(t => t !== type));
                        } else {
                          if (isOffsite) {
                            setSelectedUseCases(['Offsite']);
                          } else {
                            setSelectedUseCases(prev => [...prev.filter(t => t !== 'Offsite'), type]);
                          }
                        }
                      }}
                    />
                    <span className="text-sm font-sans text-[#09090b]">{type}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <label className="mono-label text-[#676c79]">Customer Name</label>
            {hubspotDeals.length > 0 ? (
              <div ref={dealRef} className="relative">
                <div
                  onClick={() => setDealDropdownOpen(!dealDropdownOpen)}
                  className="w-full p-3 border border-[#d4e8da] focus-within:border-[#008c44] cursor-pointer flex items-center justify-between"
                >
                  <span className={`text-sm ${customerName ? 'text-[#09090b]' : 'text-[#a5aab6]'}`}>
                    {customerName || 'Select a deal...'}
                  </span>
                  <ChevronRight size={16} className={`text-[#676c79] transition-transform ${dealDropdownOpen ? 'rotate-90' : ''}`} />
                </div>
                {dealDropdownOpen && (
                  <div className="absolute top-full left-0 w-full bg-white border border-[#d4e8da] z-50 shadow-xl mt-1 max-h-72 overflow-hidden flex flex-col">
                    <div className="p-2 border-b border-[#ecedef]">
                      <div className="flex items-center gap-2 px-2 py-1.5 bg-[#f8f8f8] border border-[#d4e8da]">
                        <Search size={14} className="text-[#a5aab6] flex-shrink-0" />
                        <input
                          type="text"
                          value={dealSearch}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDealSearch(e.target.value)}
                          placeholder="Search deals..."
                          className="w-full bg-transparent outline-none text-sm"
                          autoFocus
                        />
                      </div>
                    </div>
                    <div className="overflow-y-auto max-h-56">
                      {filteredDeals.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-[#a5aab6] text-center">No deals found</div>
                      ) : (
                        filteredDeals.map((deal: HubSpotDeal) => (
                          <button
                            key={deal.id}
                            onClick={() => {
                              setCustomerName(deal.name);
                              if (deal.amount) setArr(deal.amount);
                              if (deal.aeName) setAeName(deal.aeName);
                              setDealDropdownOpen(false);
                              setDealSearch('');
                            }}
                            className={`w-full px-4 py-2.5 text-left text-sm hover:bg-[#f0faf4] transition-colors flex items-center justify-between ${customerName === deal.name ? 'bg-[#f0faf4] font-bold' : ''}`}
                          >
                            <span className="font-sans">{deal.name}</span>
                            {deal.amount && (
                              <span className="text-xs text-[#676c79] ml-2">${Number(deal.amount).toLocaleString()}</span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Acme Corp"
                className="w-full p-3 border border-[#d4e8da] focus:border-[#008c44] outline-none"
              />
            )}
          </div>

          <div className="space-y-2">
            <label className="mono-label text-[#676c79]">AE Name</label>
            <input
              type="text"
              value={aeName}
              onChange={(e) => setAeName(e.target.value)}
              placeholder="Enter AE name"
              className="w-full p-3 border border-[#d4e8da] focus:border-[#008c44] outline-none"
            />
          </div>

          {/* SA — auto-assigned but overridable */}
          <div className="space-y-2">
            <label className="mono-label text-[#676c79]">SA</label>
            <select
              value={sa1}
              onChange={(e) => { setSa1(e.target.value); setUserPickedSA(true); }}
              className={`w-full p-3 border outline-none bg-white text-sm font-sans ${sa1AtLimit ? 'border-red-300' : 'border-[#d4e8da] focus:border-[#008c44]'}`}
            >
              {sasSortedByCapacity.filter(sa => !SA_ASSIGNMENT_EXCLUDED.has(sa.name)).map(sa => {
                const atLimit = (saAllCounts[sa.name] || 0) >= 2;
                return (
                  <option key={sa.name} value={sa.name}>
                    {sa.name}{atLimit ? ' ⚠️ at limit' : ''} ({sa.utilizationPct}% util)
                  </option>
                );
              })}
            </select>
            {sa1AtLimit ? (
              <p className="text-xs text-red-500 flex items-center gap-1">
                <AlertCircle size={12} /> {sa1} is at the kickoff limit — pick someone else
              </p>
            ) : (
              <p className="text-xs text-[#008c44] flex items-center gap-1">
                <CheckCircle2 size={12} /> {userPickedSA ? 'Manually selected' : 'Auto-assigned'} — {sasSortedByCapacity.find(s => s.name === sa1)?.utilizationPct ?? 0}% utilization
              </p>
            )}
          </div>

          {/* SA Lead */}
          <div className="space-y-2">
            <label className="mono-label text-[#676c79]">SA Lead</label>
            <div className="w-full p-3 border border-[#d4e8da] bg-[#F8FFFA] text-sm">
              {getSALead(sa1) ? (
                <span className="font-sans">{getSALead(sa1)} <span className="text-[#676c79]">({SA_POD_MAP[sa1]?.pod})</span></span>
              ) : (
                <span className="text-[#a5aab6] italic">No pod assigned</span>
              )}
            </div>
          </div>

          {/* Kickoff Date */}
          <div className="space-y-2">
            <label className="mono-label text-[#676c79]">Kickoff Date</label>
            <input
              type="date"
              value={date1}
              onChange={(e) => setDate1(e.target.value)}
              min={today}
              max={maxDate}
              className="w-full p-3 border border-[#d4e8da] focus:border-[#008c44] outline-none"
            />
            <p className="text-xs text-[#676c79]">Week {derivedWeek1} — {week1SlotsUsed} / {maxSlots} slots used</p>
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

          {/* Time Zone */}
          <div className="space-y-2">
            <label className="mono-label text-[#676c79]">Time Zone (Main Contact)</label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full p-3 border border-[#d4e8da] focus:border-[#008c44] outline-none bg-white text-sm"
            >
              <option value="">Select time zone...</option>
              <option value="ET">Eastern (ET)</option>
              <option value="CT">Central (CT)</option>
              <option value="MT">Mountain (MT)</option>
              <option value="PT">Pacific (PT)</option>
              <option value="AKT">Alaska (AKT)</option>
              <option value="HT">Hawaii (HT)</option>
              <option value="GMT">GMT / UTC</option>
              <option value="CET">Central European (CET)</option>
              <option value="IST">India (IST)</option>
              <option value="JST">Japan (JST)</option>
              <option value="AEST">Australia Eastern (AEST)</option>
            </select>
          </div>

          {/* ARR */}
          <div className="space-y-2">
            <label className="mono-label text-[#676c79]">ARR</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#676c79] text-sm">$</span>
              <input
                type="text"
                value={arr}
                onChange={(e) => setArr(e.target.value)}
                placeholder="e.g. 50,000"
                className="w-full p-3 pl-7 border border-[#d4e8da] focus:border-[#008c44] outline-none text-sm"
              />
            </div>
          </div>

          {/* POC */}
          <div className="flex items-center gap-3">
            <div
              onClick={() => setIsPoc(!isPoc)}
              className={`w-5 h-5 border flex items-center justify-center transition-colors cursor-pointer ${isPoc ? 'bg-[#008c44] border-[#008c44]' : 'border-[#d4e8da] hover:border-[#008c44]'}`}
            >
              {isPoc && <Check size={14} className="text-white" />}
            </div>
            <label onClick={() => setIsPoc(!isPoc)} className="mono-label text-[#676c79] cursor-pointer">
              This is a Proof of Concept (POC)
            </label>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full bg-[#00ff64] text-[#000d05] py-4 font-sans font-bold text-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Plus size={20} /> Confirm Kickoff
          </button>
        </div>
      </motion.div>
    );
  };

  const detailPanel = (() => {
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
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={selectedKickoff.status} />
              <span className="mono-label bg-[#EEFF8C] text-[#000d05] px-2 py-0.5">{selectedKickoff.week}</span>
              {selectedKickoff.useCaseType && (
                <span className="mono-label bg-[#EDE9FE] text-[#5B21B6] px-2 py-0.5">{selectedKickoff.useCaseType}</span>
              )}
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
              <select
                value={selectedKickoff.saName}
                onChange={(e) => handleUpdateKickoff(selectedKickoff.id, { saName: e.target.value })}
                className="w-full p-2 border border-[#d4e8da] focus:border-[#008c44] outline-none bg-white text-sm font-sans"
              >
                {Object.keys(SA_POD_MAP).filter(name => !SA_ASSIGNMENT_EXCLUDED.has(name)).map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="mono-label text-[#a5aab6]">SA LEAD</label>
              <p className="text-sm font-medium">{getSALead(selectedKickoff.saName) || <span className="text-[#a5aab6] italic">—</span>}</p>
            </div>
            <div className="space-y-1">
              <label className="mono-label text-[#a5aab6]">POD</label>
              <p className="text-sm font-medium">{SA_POD_MAP[selectedKickoff.saName]?.pod || <span className="text-[#a5aab6] italic">—</span>}</p>
            </div>
            <div className="space-y-1">
              <label className="mono-label text-[#a5aab6]">TIME ZONE</label>
              <p className="text-sm font-medium">{selectedKickoff.timezone || <span className="text-[#a5aab6] italic">—</span>}</p>
            </div>
            <div className="space-y-1">
              <label className="mono-label text-[#a5aab6]">ARR</label>
              <p className="text-sm font-medium">{selectedKickoff.arr ? `$${selectedKickoff.arr}` : <span className="text-[#a5aab6] italic">—</span>}</p>
            </div>
            <div className="space-y-1">
              <label className="mono-label text-[#a5aab6]">POC</label>
              <p className="text-sm font-medium">{selectedKickoff.isPoc ? 'Yes' : 'No'}</p>
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
                  {task === 'Deck Created' && !deckResults[selectedKickoff.id] && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openAgentModal();
                      }}
                      className="ml-auto flex items-center gap-1.5 px-3 py-1 bg-[#00ff64] text-[#000d05] text-xs font-bold hover:opacity-90 transition-opacity rounded-sm"
                    >
                      <ArrowRight size={12} />
                      Use Agent
                    </button>
                  )}
                  {task === 'Internal Sync with AE (add Lead)' && (
                    <span className="ml-auto relative group/sync">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          triggerScheduleInternal(selectedKickoff);
                        }}
                        disabled={!selectedKickoff.slackInternalChannelId || scheduleKickoffId === selectedKickoff.id}
                        className="flex items-center gap-1.5 px-3 py-1 bg-[#00ff64] text-[#000d05] text-xs font-bold hover:opacity-90 transition-opacity rounded-sm disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {scheduleKickoffId === selectedKickoff.id && selectedKickoff.schedulingStatus?.internal === 'finding_times' ? (
                          <><Loader2 size={12} className="animate-spin" /> Scheduling...</>
                        ) : selectedKickoff.schedulingStatus?.internal === 'confirmed' ? (
                          <><CheckCircle2 size={12} /> Scheduled</>
                        ) : (
                          <><ArrowRight size={12} /> Use Agent</>
                        )}
                      </button>
                      {!selectedKickoff.slackInternalChannelId && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-[#000d05] text-white text-xs font-medium rounded-md whitespace-nowrap opacity-0 group-hover/sync:opacity-100 transition-opacity pointer-events-none shadow-lg">
                          Create Slack channels first
                          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#000d05]" />
                        </div>
                      )}
                    </span>
                  )}
                  {task === 'Slack Channel Created' && !selectedKickoff.slackInternalChannelId && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerSlackChannels(selectedKickoff);
                      }}
                      disabled={slackRunId === selectedKickoff.id || slackKickoffId === selectedKickoff.id}
                      className="ml-auto flex items-center gap-1.5 px-3 py-1 bg-[#00ff64] text-[#000d05] text-xs font-bold hover:opacity-90 transition-opacity rounded-sm disabled:opacity-50"
                    >
                      {slackKickoffId === selectedKickoff.id ? (
                        <><Loader2 size={12} className="animate-spin" /> Creating...</>
                      ) : (
                        <><ArrowRight size={12} /> Use Agent</>
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Deck Result */}
          {deckResults[selectedKickoff.id] && (
            <div className="space-y-3">
              <label className="mono-label text-[#676c79]">DECK</label>
              <div className="p-4 bg-[#F8FFFA] border border-[#d4e8da] space-y-2">
                <p className="text-sm font-bold text-[#000d05]">{deckResults[selectedKickoff.id].clientName}</p>
                <a
                  href={deckResults[selectedKickoff.id].deckUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-[#008c44] hover:underline"
                >
                  <FileText size={14} />
                  Open Deck
                  <ExternalLink size={12} />
                </a>
                <a
                  href={deckResults[selectedKickoff.id].folderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-[#008c44] hover:underline"
                >
                  <FolderOpen size={14} />
                  Open Folder
                  <ExternalLink size={12} />
                </a>
              </div>
            </div>
          )}

          {/* Slack Channels */}
          {(selectedKickoff.slackInternalChannelId || selectedKickoff.slackExternalChannelId || slackKickoffId === selectedKickoff.id) && (
            <div className="space-y-3">
              <label className="mono-label text-[#676c79]">SLACK CHANNELS</label>
              {slackKickoffId === selectedKickoff.id && slackRunId ? (
                <div className="p-4 bg-[#F8FFFA] border border-[#d4e8da] flex items-center gap-2 text-sm text-[#676c79]">
                  <Loader2 size={14} className="animate-spin" />
                  Creating Slack channels...
                </div>
              ) : (
                <div className="p-4 bg-[#F8FFFA] border border-[#d4e8da] space-y-3">
                  {selectedKickoff.slackInternalChannelId && (
                    <a
                      href={`https://slack.com/app_redirect?channel=${selectedKickoff.slackInternalChannelId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-[#008c44] hover:underline"
                    >
                      <Hash size={14} />
                      c-internal-{slugify(selectedKickoff.customerName)}
                      <ExternalLink size={12} />
                    </a>
                  )}
                  {selectedKickoff.slackExternalChannelId && (
                    <a
                      href={`https://slack.com/app_redirect?channel=${selectedKickoff.slackExternalChannelId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-[#008c44] hover:underline"
                    >
                      <Hash size={14} />
                      airops-{slugify(selectedKickoff.customerName)}
                      <ExternalLink size={12} />
                    </a>
                  )}
                  {selectedKickoff.slackConnectInviteLink && (
                    <div className="pt-2 border-t border-[#d4e8da]">
                      <p className="mono-label text-[#a5aab6] mb-1">CLIENT INVITE LINK</p>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={selectedKickoff.slackConnectInviteLink}
                          className="flex-1 p-2 border border-[#d4e8da] bg-white text-xs text-[#676c79] outline-none"
                        />
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(selectedKickoff.slackConnectInviteLink!);
                          }}
                          className="p-2 border border-[#d4e8da] hover:bg-[#f0faf4] transition-colors"
                          title="Copy link"
                        >
                          <Copy size={14} className="text-[#676c79]" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

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

          {/* Delete (admin only) */}
          {isAdmin && (
            <div className="pt-4 border-t border-[#ecedef]">
              <button
                onClick={() => handleDeleteKickoff(selectedKickoff.id)}
                className="w-full flex items-center justify-center gap-2 py-3 text-sm font-sans font-medium text-red-600 border border-red-200 hover:bg-red-50 transition-colors"
              >
                <Trash2 size={16} />
                Delete Kickoff
              </button>
            </div>
          )}
        </div>
      </motion.div>
    );
  })();

  const handleNavClick = (newView: typeof view) => {
    setView(newView);
    setMobileSidebarOpen(false);
  };

  // Auth gate - show login screen if not authenticated
  // Public booking page — no auth required
  if (view === 'booking' && bookingKickoffId) {
    return <BookingPage kickoffId={bookingKickoffId} />;
  }

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
      {/* Settings saved toast */}
      {settingsSaved && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#000d05] text-white px-6 py-3 text-sm font-medium shadow-lg pointer-events-none"
          style={{ animation: 'fadeInUp 0.2s ease' }}>
          Settings saved
        </div>
      )}

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
        {view === 'capacity' && (saLoadingState === 'loading' ? <SACapacityLoadingSkeleton /> : <SACapacityView />)}
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
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  setIsBookingOpen(false);
                }
              }}
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
            {detailPanel}
          </>
        )}
      </AnimatePresence>

      {/* Agent Modal */}
      <AnimatePresence>
        {showAgentModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
            onClick={() => { if (!agentRunId) setShowAgentModal(false); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white max-w-2xl w-full mx-4 shadow-2xl border border-[#d4e8da] max-h-[90vh] flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-[#ecedef]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-[#CCFFE0] flex items-center justify-center rounded">
                    <FileText size={18} className="text-[#008c44]" />
                  </div>
                  <h2 className="text-lg font-bold text-[#000d05]">Deck Details</h2>
                </div>
                {!agentRunId && (
                  <button onClick={() => setShowAgentModal(false)} className="text-[#676c79] hover:text-[#000d05]">
                    <X size={18} />
                  </button>
                )}
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                {agentResult ? (
                  /* Success State */
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-[#008c44]">
                      <CheckCircle2 size={20} />
                      <span className="text-sm font-bold">Deck created successfully</span>
                    </div>
                    <div className="p-4 bg-[#F8FFFA] border border-[#d4e8da] rounded space-y-3">
                      <p className="text-sm font-bold text-[#000d05]">{agentResult.clientName}</p>
                      <a
                        href={agentResult.deckUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-[#008c44] hover:underline"
                      >
                        <FileText size={14} />
                        Open Deck
                        <ExternalLink size={12} />
                      </a>
                      <a
                        href={agentResult.folderUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-[#008c44] hover:underline"
                      >
                        <FolderOpen size={14} />
                        Open Folder
                        <ExternalLink size={12} />
                      </a>
                    </div>
                    <button
                      onClick={() => setShowAgentModal(false)}
                      className="w-full bg-[#008c44] text-white py-3 font-sans font-bold text-sm rounded hover:opacity-90 transition-opacity"
                    >
                      Done
                    </button>
                  </div>
                ) : agentRunId ? (
                  /* Polling State */
                  <div className="flex flex-col items-center justify-center py-12 gap-4">
                    <Loader2 size={32} className="animate-spin text-[#008c44]" />
                    <p className="text-sm text-[#676c79]">Running agent... This may take a few minutes.</p>
                  </div>
                ) : (
                  /* Form State */
                  <>
                    <div className="space-y-1.5">
                      <label className="text-sm font-bold text-[#000d05]">Account Executive</label>
                      <CustomSelect
                        value={agentForm.aeName}
                        onChange={(v) => setAgentForm(f => ({ ...f, aeName: v }))}
                        options={slackUsers.map(u => ({ label: u.real_name, value: u.real_name, image: u.avatar }))}
                        placeholder="Select the AE"
                        labelClassName="font-sans"
                        searchable
                        loading={slackUsersLoading}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-bold text-[#000d05]">SA</label>
                      <CustomSelect
                        value={agentForm.seName}
                        onChange={(v) => setAgentForm(f => ({ ...f, seName: v }))}
                        options={slackUsers.map(u => ({ label: u.real_name, value: u.real_name, image: u.avatar }))}
                        placeholder="Select an SA"
                        labelClassName="font-sans"
                        searchable
                        loading={slackUsersLoading}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-bold text-[#000d05]">SA Lead</label>
                      <CustomSelect
                        value={agentForm.csLead}
                        onChange={(v) => setAgentForm(f => ({ ...f, csLead: v }))}
                        options={slackUsers.map(u => ({ label: u.real_name, value: u.real_name, image: u.avatar }))}
                        placeholder="Select an SA Lead"
                        labelClassName="font-sans"
                        searchable
                        loading={slackUsersLoading}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-bold text-[#000d05]">
                        Kickoff Date <span className="font-normal text-[#a5aab6]">(optional)</span>
                      </label>
                      <input
                        type="date"
                        value={agentForm.kickoffDate}
                        onChange={(e) => setAgentForm(f => ({ ...f, kickoffDate: e.target.value }))}
                        className="w-full px-4 py-2 border border-[#d4e8da] focus:border-[#008c44] outline-none text-sm rounded-sm"
                      />
                      <p className="text-xs text-[#a5aab6]">Leave blank to auto-detect from Calendar/Email.</p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-bold text-[#000d05]">Notion Page Content</label>
                      <textarea
                        rows={6}
                        value={agentForm.notionContent}
                        onChange={(e) => setAgentForm(f => ({ ...f, notionContent: e.target.value }))}
                        placeholder="Copy & paste your Notion intake page content"
                        className="w-full px-4 py-3 border border-[#d4e8da] focus:border-[#008c44] outline-none text-sm rounded-sm"
                      />
                      <p className="text-xs text-[#a5aab6]">Copy & paste your Notion intake page content.</p>
                    </div>

                    {agentError && (
                      <div className="flex items-center gap-2 text-red-600 text-sm">
                        <AlertCircle size={14} />
                        {agentError}
                      </div>
                    )}

                    <div className="flex items-center gap-3 pt-2">
                      <button
                        onClick={() => setShowAgentModal(false)}
                        className="flex-1 py-3 border border-[#d4e8da] text-[#000d05] font-sans font-bold text-sm rounded-sm hover:bg-[#f0faf4] transition-colors"
                      >
                        Back
                      </button>
                      <button
                        onClick={submitAgentForm}
                        disabled={deckGenerating === selectedKickoff?.id || !agentForm.aeName}
                        className="flex-1 py-3 bg-[#008c44] text-white font-sans font-bold text-sm rounded-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                      >
                        {deckGenerating === selectedKickoff?.id ? (
                          <span className="flex items-center justify-center gap-2">
                            <Loader2 size={16} className="animate-spin" />
                            Submitting...
                          </span>
                        ) : (
                          'Submit'
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
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
