import logoUrl from "../../assets/logo.png";

interface Props {
  size?: "sm" | "md" | "lg" | "xl";
  showName?: boolean;
  className?: string;
}

const sizes = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-16 w-16",
  xl: "h-32 w-32 sm:h-40 sm:w-40",
};

const imageSizes = { sm: 32, md: 40, lg: 64, xl: 160 };

export function BrandLogo({ size = "md", showName = false, className = "" }: Props) {
  return <span className={`inline-flex items-center gap-2.5 ${className}`}>
    <span className={`${sizes[size]} shrink-0 overflow-hidden bg-white`}>
      <img width={imageSizes[size]} height={imageSizes[size]} className="h-full w-full scale-[1.38] object-cover object-center mix-blend-multiply" src={logoUrl} alt="Impromptu Logo" />
    </span>
    {showName && <span className="text-[17px] font-semibold text-ink">Impromptu</span>}
  </span>;
}
