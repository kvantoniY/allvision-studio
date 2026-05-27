import Image from 'next/image';

type BrandLogoProps = {
  className?: string;
};

/**
 * Allvision Studio brand mark. Source asset: /public/logo.png (stylized eye).
 * Size it via className, e.g. `h-6 w-auto`.
 */
export function BrandLogo({ className }: BrandLogoProps) {
  return (
    <Image
      src="/logo.png"
      alt="Allvision Studio"
      width={1911}
      height={1017}
      priority
      className={className}
    />
  );
}
