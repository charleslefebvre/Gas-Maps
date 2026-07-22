import { useEffect, useRef, useState } from "react";
import { suggestAddresses, AddressSuggestion } from "./geo";
import { hasGooglePlaces, googleSuggest, googleResolvePlace } from "./googlePlaces";

interface Suggestion extends AddressSuggestion {
  placeId?: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onResolve?: (coords: AddressSuggestion | null) => void;
  placeholder?: string;
  ariaLabel?: string;
}

const MIN_CHARS = 2;
const DEBOUNCE_MS = 140;

const cache = new Map<string, Suggestion[]>();

async function fetchSuggestions(query: string): Promise<Suggestion[]> {
  const key = query.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;

  let results: Suggestion[] = [];
  if (hasGooglePlaces) {
    try {
      results = await googleSuggest(query);
    } catch {
      results = [];
    }
  }
  if (results.length === 0) {
    results = await suggestAddresses(query);
  }

  if (results.length > 0) {
    cache.set(key, results);
    if (cache.size > 60) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
  }
  return results;
}

export default function AddressAutocomplete({
  value,
  onChange,
  onResolve,
  placeholder,
  ariaLabel,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const userTyped = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userTyped.current) return;
    if (value.trim().length < MIN_CHARS) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const results = await fetchSuggestions(value.trim());
        if (cancelled) return;
        setSuggestions(results);
        setOpen(results.length > 0);
        setActive(-1);
      } catch {
        if (!cancelled) {
          setSuggestions([]);
          setOpen(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const select = async (suggestion: Suggestion) => {
    userTyped.current = false;
    onChange(suggestion.displayName);
    setOpen(false);
    setSuggestions([]);
    setActive(-1);

    if (!onResolve) return;
    if (suggestion.placeId) {
      const resolved = await googleResolvePlace(suggestion.placeId);
      onResolve(resolved);
    } else {
      onResolve(suggestion);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      select(suggestions[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const handleChange = (next: string) => {
    userTyped.current = true;
    onChange(next);
    onResolve?.(null);
  };

  return (
    <div className="autocomplete" ref={containerRef}>
      <input
        type="text"
        className="search-input"
        placeholder={placeholder}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
      />
      {loading && <span className="autocomplete-spinner" aria-hidden="true" />}
      {open && (
        <ul className="autocomplete-list" role="listbox">
          {suggestions.map((s, i) => (
            <li
              key={`${s.placeId ?? ""}${s.lat},${s.lng},${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? "active" : ""}
              onMouseDown={(e) => {
                e.preventDefault();
                select(s);
              }}
              onMouseEnter={() => setActive(i)}
            >
              {s.displayName}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
