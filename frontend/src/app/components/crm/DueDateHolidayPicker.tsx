"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";
import {
  getIndianHoliday,
  calculateDaysDifference,
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
  required?: boolean;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const WEEK_DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export const DueDateHolidayPicker: React.FC<DueDateHolidayPickerProps> = ({
  label = "Due Date",
  value,
  startDate,
  onChange,
  className = "",
  disabled = false,
  id,
  ariaLabel,
  required = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  const effectiveStartDate = useMemo(() => {
    return toIsoDateString(startDate) || new Date().toISOString().slice(0, 10);
  }, [startDate]);

  const sanitizedValue = useMemo(() => {
    return toIsoDateString(value);
  }, [value]);

  const initialDate = sanitizedValue ? new Date(sanitizedValue) : new Date();
  const [viewYear, setViewYear] = useState<number>(initialDate.getFullYear() || new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(
    initialDate.getMonth() !== undefined ? initialDate.getMonth() : new Date().getMonth()
  );

  useEffect(() => {
    if (sanitizedValue) {
      const [y, m] = sanitizedValue.split("-").map(Number);
      if (y && m) {
        setViewYear(y);
        setViewMonth(m - 1);
      }
    }
  }, [sanitizedValue]);

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

  const holidayInfo: HolidayInfo | null = useMemo(() => {
    if (!sanitizedValue) return null;
    return getIndianHoliday(sanitizedValue);
  }, [sanitizedValue]);

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleSelectDate = (dateIso: string) => {
    const daysDiff = calculateDaysDifference(effectiveStartDate, dateIso);
    onChange(dateIso, daysDiff);
    setIsOpen(false); // auto-close on select
  };

  const calendarCells = useMemo(() => {
    const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells = [];

    for (let i = 0; i < firstDayOfMonth; i++) {
      cells.push({ empty: true, key: `empty-${i}` });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const mStr = String(viewMonth + 1).padStart(2, "0");
      const dStr = String(d).padStart(2, "0");
      const iso = `${viewYear}-${mStr}-${dStr}`;
      const holiday = getIndianHoliday(iso);
      const isSelected = iso === sanitizedValue;
      const isPast = effectiveStartDate ? iso < effectiveStartDate : false;

      cells.push({
        empty: false,
        key: iso,
        dateIso: iso,
        dayNum: d,
        holiday,
        isSelected,
        isPast,
      });
    }

    return cells;
  }, [viewYear, viewMonth, sanitizedValue, effectiveStartDate]);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-gray-600">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}

      {/* Input Box */}
      <button
        type="button"
        id={id}
        aria-label={ariaLabel || label}
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={`mt-1 w-full flex items-center justify-between px-3 py-2 text-sm rounded-md border border-gray-300 bg-white text-gray-900 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${
          disabled ? "bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed" : ""
        }`}
      >
        <span className={sanitizedValue ? "text-gray-900" : "text-gray-400"}>
          {sanitizedValue ? formatDisplayDate(sanitizedValue) : "Select date"}
        </span>
        <CalendarIcon className="w-4 h-4 text-gray-400 shrink-0 ml-2" />
      </button>

      {/* Simple, unobtrusive holiday warning ONLY if selected day is holiday */}
      {holidayInfo && (
        <p className="mt-1 text-xs font-medium text-amber-700 flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
          <span>{holidayInfo.name}</span>
        </p>
      )}

      {/* Clean, Small Popover Calendar */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-64 bg-white rounded-lg shadow-lg border border-gray-200 p-2.5 left-0 top-full">
          {/* Header */}
          <div className="flex items-center justify-between px-1 pb-2 mb-1 border-b border-gray-100">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800"
              title="Previous"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-semibold text-gray-800">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800"
              title="Next"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-gray-400 mb-1">
            {WEEK_DAYS.map((wd, i) => (
              <span key={wd} className={i === 0 ? "text-red-400" : ""}>
                {wd}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {calendarCells.map((cell) => {
              if (cell.empty) {
                return <div key={cell.key} className="h-7 w-7" />;
              }

              const { dateIso, dayNum, holiday, isSelected, isPast } = cell;

              let btnClass =
                "h-7 w-7 mx-auto rounded text-xs flex flex-col items-center justify-center relative transition ";

              if (isSelected) {
                btnClass += "bg-blue-600 text-white font-bold ";
              } else if (holiday) {
                btnClass += "text-red-600 hover:bg-red-50 ";
              } else if (isPast) {
                btnClass += "text-gray-400 hover:bg-gray-100 ";
              } else {
                btnClass += "text-gray-700 hover:bg-blue-50 ";
              }

              return (
                <button
                  key={cell.key}
                  type="button"
                  onClick={() => handleSelectDate(dateIso)}
                  className={btnClass}
                  title={holiday ? `${holiday.name}` : undefined}
                >
                  <span>{dayNum}</span>
                  {/* Subtle tiny dot for holiday */}
                  {holiday && !isSelected && (
                    <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-red-500" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default DueDateHolidayPicker;
