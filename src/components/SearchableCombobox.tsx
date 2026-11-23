import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useMasterData, MasterCategory } from "@/hooks/useMasterData";

interface Props {
  category: MasterCategory;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function SearchableCombobox({ category, value, onChange, placeholder = "Select...", disabled, className }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { items, addValue } = useMasterData(category);

  const exactMatch = useMemo(
    () => items.some((i) => i.value.toLowerCase() === search.trim().toLowerCase()),
    [items, search],
  );

  const currentValueMissing = useMemo(() => {
    const v = value.trim();
    if (!v) return false;
    return !items.some((i) => i.value.toLowerCase() === v.toLowerCase());
  }, [items, value]);

  const handleAdd = async () => {
    const v = search.trim();
    if (!v) return;
    const added = await addValue(category, v);
    if (added) {
      onChange(added);
      setSearch("");
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("h-9 w-full justify-between text-sm font-normal", className)}
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value || placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-popover" align="start">
        <Command shouldFilter={true}>
          <CommandInput
            placeholder="Search..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              <div className="py-2 text-sm text-muted-foreground">No matches</div>
            </CommandEmpty>
            <CommandGroup>
              {currentValueMissing && (
                <CommandItem
                  key="__current_value__"
                  value={value}
                  onSelect={() => {
                    onChange(value);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === value ? "opacity-100" : "opacity-0")} />
                  {value}
                </CommandItem>
              )}
              {items.map((i) => (
                <CommandItem
                  key={i.id}
                  value={i.value}
                  onSelect={() => {
                    onChange(i.value);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === i.value ? "opacity-100" : "opacity-0")} />
                  {i.value}
                </CommandItem>
              ))}
            </CommandGroup>
            {search.trim() && !exactMatch && (
              <div className="border-t p-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={handleAdd}
                >
                  <Plus className="h-4 w-4 mr-2" /> Add new "{search.trim()}"
                </Button>
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
