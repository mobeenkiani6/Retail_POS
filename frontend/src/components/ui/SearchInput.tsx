import { forwardRef, type InputHTMLAttributes } from 'react';
import { Search } from 'lucide-react';

export type SearchInputProps = InputHTMLAttributes<HTMLInputElement> & {
  wrapperClassName?: string;
};

const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className = '', wrapperClassName = '', ...props }, ref) => (
    <div className={`relative ${wrapperClassName}`.trim()}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        aria-hidden="true"
      />
      <input
        ref={ref}
        type="search"
        className={`input-search ${className}`.trim()}
        {...props}
      />
    </div>
  ),
);

SearchInput.displayName = 'SearchInput';
export default SearchInput;
