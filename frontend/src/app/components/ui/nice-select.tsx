import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";
import { cn } from "./utils";

export type NiceSelectOption = {
  label: string;
  value: string;
};

export function NiceSelect({
  ariaLabel,
  className,
  contentClassName,
  disabled,
  onValueChange,
  options,
  placeholder,
  value,
}: {
  ariaLabel: string;
  className?: string;
  contentClassName?: string;
  disabled?: boolean;
  onValueChange: (value: string) => void;
  options: NiceSelectOption[];
  placeholder?: string;
  value: string;
}) {
  return (
    <Select disabled={disabled} value={value} onValueChange={onValueChange}>
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn(
          "nice-select h-10 rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-800 dark:text-slate-100 shadow-none outline-none transition hover:border-slate-400 dark:hover:border-slate-600 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/30 data-[state=open]:border-blue-500 data-[state=open]:ring-2 data-[state=open]:ring-blue-100 dark:data-[state=open]:ring-blue-900/30",
          className
        )}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className={cn("z-[10000] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1 shadow-lg", contentClassName)}>
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            className="cursor-pointer rounded-md px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:bg-blue-50 dark:focus:bg-slate-800 focus:text-blue-700 dark:focus:text-white data-[state=checked]:bg-blue-50 dark:data-[state=checked]:bg-slate-800 data-[state=checked]:font-semibold data-[state=checked]:text-blue-700 dark:data-[state=checked]:text-white"
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
