"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Sparkles,
  Info,
  CalendarCheck,
  CalendarX,
} from "lucide-react";
import {
  getIndianHoliday,
  calculateDaysDifference,
  addDaysToDate,
  formatDisplayDate,
  toIsoDateString,
  type HolidayInfo,
} from "../../lib/indianHolidays";

export interface DueDateHolidayPickerProps {
  label?: string;
  value: string; // YYYY-MM-DD
  startDate?: string; // YYYY-MM-DD, defaults to today
  onChange: (newDateIso: string, calculatedTenureDays: number) => void;
  className?: string;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
  showPresets?: boolean;
  helperText?: string;
  required?: boolean;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const DueDateHolidayPicker: React.FC<DueDateHolidayPickerProps> = ({
  label = "Due Date",
  value,
  startDate,
  onChange,
  className = "",
  disabled = false,
  id,
  ariaLabel,
  showPresets = true,
  helperText,
  required = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  // Fallback to today if startDate is not provided or invalid
  const effectiveStartDate = useMemo(() => {
    return toIsoDateString(startDate) || new Date().toISOString().slice(0, 10);
  }, [startDate]);

  const sanitizedValue = useMemo(() => {
    return toIsoDateString(value);
  }, [value]);

  // Current calendar view month & year
  const initialDate = sanitizedValue ? new Date(sanitizedValue) : new Date();
  const [viewYear, setViewYear] = useState<number>(initialDate.getFullYear() || new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(
    initialDate.getMonth() !== undefined ? initialDate.getMonth() : new Date().getMonth()
  );

  // Sync calendar month/year if value changes externally
  useEffect(() => {
    if (sanitizedValue) {
      const [y, m] = sanitizedValue.split("-").map(Number);
      if (y && m) {
        setViewYear(y);
        setViewMonth(m - 1);
      }
    }
  }, [sanitizedValue]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Selected date holiday details
  const selectedHolidayInfo: HolidayInfo | null = useMemo(() => {
    if (!sanitizedValue) return null;
    return getIndianHoliday(sanitizedValue);
  }, [sanitizedValue]);

  // Tenure in days from start date
  const calculatedTenure = useMemo(() => {
    if (!sanitizedValue || !effectiveStartDate) return 0;
    return calculateDaysDifference(effectiveStartDate, sanitizedValue);
  }, [sanitizedValue, effectiveStartDate]);

  // Navigation handlers
  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  // Select date handler
  const handleSelectDate = (dateIso: string) => {
    const daysDiff = calculateDaysDifference(effectiveStartDate, dateIso);
    onChange(dateIso, daysDiff);
  };

  // Fast forward to next working day if holiday
  const handleShiftToNextWorkingDay = () => {
    if (!sanitizedValue) return;
    let nextDate = sanitizedValue;
    for (let i = 1; i <= 10; i++) {
      const candidate = addDaysToDate(sanitizedValue, i);
      const hol = getIndianHoliday(candidate);
      if (!hol) {
        nextDate = candidate;
        break;
      }
    }
    if (nextDate !== sanitizedValue) {
      handleSelectDate(nextDate);
    }
  };

  // Calendar cells generation for viewMonth & viewYear
  const calendarCells = useMemo(() => {
    const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay(); // 0 is Sunday
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells = [];

    // Empty lead cells
    for (let i = 0; i < firstDayOfMonth; i++) {
      cells.push({ empty: true, key: `empty-${i}` });
    }

    // Days of current month
    for (let d = 1; d <= daysInMonth; d++) {
      const mStr = String(viewMonth + 1).padStart(2, "0");
      const dStr = String(d).padStart(2, "0");
      const iso = `${viewYear}-${mStr}-${dStr}`;
      const holiday = getIndianHoliday(iso);
      const isSelected = iso === sanitizedValue;
      const isStart = iso === effectiveStartDate;
      const isPast = effectiveStartDate ? iso < effectiveStartDate : false;

      cells.push({
        empty: false,
        key: iso,
        dateIso: iso,
        dayNum: d,
        holiday,
        isSelected,
        isStart,
        isPast,
      });
    }

    return cells;
  }, [viewYear, viewMonth, sanitizedValue, effectiveStartDate]);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <div className="flex items-center justify-between mb-1">
          <label htmlFor={id} className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
            <CalendarIcon className="w-4 h-4 text-blue-600" />
            <span>{label}</span>
            {required && <span className="text-red-500">*</span>}
          </label>
          {calculatedTenure > 0 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              {calculatedTenure} {calculatedTenure === 1 ? "day term" : "days term"}
            </span>
          )}
        </div>
      )}

      {/* Trigger Display / Input */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel || label}
        onClick={() => {
          if (!disabled) setIsOpen((prev) => !prev);
        }}
        onKeyDown={(e) => {
          if (!disabled && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setIsOpen((prev) => !prev);
          }
        }}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-all text-left cursor-pointer ${
          disabled
            ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
            : selectedHolidayInfo
            ? "border-amber-400 bg-amber-50/50 hover:bg-amber-50 ring-1 ring-amber-300"
            : "border-gray-300 bg-white hover:border-blue-400 hover:shadow-xs focus:ring-2 focus:ring-blue-500"
        }`}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <CalendarIcon
            className={`w-4 h-4 shrink-0 ${
              selectedHolidayInfo ? "text-amber-600" : "text-gray-500"
            }`}
          />
          <div className="flex flex-col truncate">
            <span className="text-sm font-medium text-gray-800">
              {sanitizedValue ? formatDisplayDate(sanitizedValue) : "Select Due Date"}
            </span>
          </div>
        </div>

        {/* Holiday / Status Badge in Trigger */}
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {selectedHolidayInfo ? (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-300"
              title={`${selectedHolidayInfo.name} - ${selectedHolidayInfo.description || ""}`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
              <span className="truncate max-w-[140px]">{selectedHolidayInfo.name}</span>
            </span>
          ) : sanitizedValue ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              <span>Working Day</span>
            </span>
          ) : null}
        </div>
      </div>

      {helperText && <p className="mt-1 text-xs text-gray-500">{helperText}</p>}

      {/* Holiday Warning Banner directly below input trigger when selected is a holiday */}
      {selectedHolidayInfo && (
        <div className="mt-1.5 p-2 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-amber-800">
              Selected due date falls on {selectedHolidayInfo.name}
            </p>
            <p className="text-amber-700 mt-0.5">
              Banking transactions & NACH/eMandate debits are closed on this date.
            </p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleShiftToNextWorkingDay();
              }}
              className="mt-1.5 inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded shadow-xs transition"
            >
              <Sparkles className="w-3 h-3" />
              Auto-shift to next working day
            </button>
          </div>
        </div>
      )}

      {/* Dropdown Calendar Panel */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-[320px] sm:w-[350px] bg-white rounded-xl shadow-2xl border border-gray-200 p-3.5 left-0 top-full animate-in fade-in zoom-in-95 duration-150">
          {/* Calendar Header with Month/Year Navigation */}
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1.5 rounded-md hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1 text-sm font-bold text-gray-800">
              <span>{MONTH_NAMES[viewMonth]}</span>
              <span>{viewYear}</span>
            </div>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1.5 rounded-md hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Presets */}
          {showPresets && (
            <div className="py-2 flex items-center gap-1.5 overflow-x-auto border-b border-gray-100 no-scrollbar">
              <span className="text-[11px] font-medium text-gray-400 shrink-0 mr-0.5">Presets:</span>
              {[7, 15, 30, 45, 60].map((days) => {
                const targetDate = addDaysToDate(effectiveStartDate, days);
                const isHol = getIndianHoliday(targetDate);
                const isCurr = targetDate === sanitizedValue;
                return (
                  <button
                    key={days}
                    type="button"
                    onClick={() => handleSelectDate(targetDate)}
                    className={`text-xs px-2 py-0.5 rounded-full border transition shrink-0 ${
                      isCurr
                        ? "bg-blue-600 text-white border-blue-600 font-semibold"
                        : isHol
                        ? "bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100"
                        : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                    }`}
                    title={isHol ? `${days}d lands on ${isHol.name}` : `${days} days from start`}
                  >
                    +{days}d {isHol ? "⚠️" : ""}
                  </button>
                );
              })}
            </div>
          )}

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 mt-2 mb-1 text-center text-xs font-semibold text-gray-500">
            {WEEK_DAYS.map((wd, idx) => (
              <span
                key={wd}
                className={idx === 0 ? "text-red-500" : idx === 6 ? "text-amber-600" : "text-gray-600"}
              >
                {wd}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {calendarCells.map((cell) => {
              if (cell.empty) {
                return <div key={cell.key} className="h-8 w-full" />;
              }

              const { dateIso, dayNum, holiday, isSelected, isStart, isPast } = cell;

              let cellClasses =
                "h-8 w-full rounded-md text-xs font-medium flex flex-col items-center justify-center relative transition-all cursor-pointer ";

              if (isSelected) {
                cellClasses += "bg-blue-600 text-white font-bold shadow-sm ring-2 ring-blue-400 ";
              } else if (holiday) {
                if (holiday.type === "national" || holiday.type === "gazetted") {
                  cellClasses +=
                    "bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200 font-semibold ";
                } else if (holiday.type === "weekend") {
                  cellClasses += "bg-red-50/70 text-red-700 hover:bg-red-100 ";
                } else {
                  // Bank holiday (2nd/4th Saturday or Annual closing)
                  cellClasses +=
                    "bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 font-medium ";
                }
              } else {
                cellClasses += "text-gray-700 hover:bg-blue-50 hover:text-blue-700 ";
              }

              if (isStart) {
                cellClasses += "ring-1 ring-emerald-500 ";
              }

              if (isPast && !isSelected) {
                cellClasses += "opacity-40 ";
              }

              return (
                <button
                  key={cell.key}
                  type="button"
                  onClick={() => handleSelectDate(dateIso)}
                  className={cellClasses}
                  title={
                    holiday
                      ? `${formatDisplayDate(dateIso)}: ${holiday.name} (${holiday.description || holiday.type})`
                      : formatDisplayDate(dateIso)
                  }
                >
                  <span>{dayNum}</span>
                  {/* Indicator Dot for Holidays */}
                  {holiday && (
                    <span
                      className={`absolute bottom-0.5 w-1 h-1 rounded-full ${
                        isSelected
                          ? "bg-amber-200"
                          : holiday.type === "national" || holiday.type === "gazetted"
                          ? "bg-red-600"
                          : holiday.type === "weekend"
                          ? "bg-red-400"
                          : "bg-amber-500"
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Holiday Legend & Details */}
          <div className="mt-3 pt-2.5 border-t border-gray-100 text-[11px] space-y-1.5">
            <div className="flex items-center justify-between text-gray-500">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-600 inline-block" />
                Gazetted / Festival
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                2nd/4th Sat Bank Off
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                Sunday
              </span>
            </div>

            {/* Currently hovered or selected holiday note */}
            {selectedHolidayInfo ? (
              <div className="p-2 rounded bg-amber-50 border border-amber-200 text-amber-900">
                <div className="font-semibold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>{selectedHolidayInfo.name}</span>
                </div>
                <div className="text-[10px] text-amber-700 mt-0.5">
                  {selectedHolidayInfo.description || "Official holiday. Avoid loan due dates on non-banking days."}
                </div>
              </div>
            ) : sanitizedValue ? (
              <div className="p-1.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between">
                <span className="font-medium">Selected Date is a Banking Day</span>
                <span className="text-[10px] text-emerald-600">{calculatedTenure} days loan term</span>
              </div>
            ) : null}
          </div>

          {/* Footer Close Button */}
          <div className="mt-2.5 flex justify-end">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-xs px-3 py-1 font-semibold text-blue-600 hover:bg-blue-50 rounded transition"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
export default DueDateHolidayPicker;
