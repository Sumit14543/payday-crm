type FaviconVariant = "default" | "geetpay";

type IconConfig = {
  rel: string;
  href: string;
  type?: string;
  sizes?: string;
};

const DEFAULT_ICONS: IconConfig[] = [
  { rel: "icon", type: "image/webp", href: "/logo.webp" },
  { rel: "shortcut icon", type: "image/webp", href: "/logo.webp" },
];

const GEETPAY_ICONS: IconConfig[] = [
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
  { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png" },
  { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16x16.png" },
  { rel: "shortcut icon", href: "/favicon.ico" },
];

function iconMatches(icon: HTMLLinkElement, iconConfig: IconConfig) {
  if (iconConfig.sizes) return icon.sizes.value === iconConfig.sizes;
  return icon.rel === iconConfig.rel;
}

export function setPublicFavicons(title?: string, variant: FaviconVariant = "default") {
  if (title) document.title = title;

  const nextIcons = variant === "geetpay" ? GEETPAY_ICONS : DEFAULT_ICONS;
  const existingIcons = Array.from(document.querySelectorAll("link[rel*='icon']") as NodeListOf<HTMLLinkElement>);

  existingIcons.forEach((icon) => icon.remove());

  nextIcons.forEach((iconConfig) => {
    let icon = existingIcons.find((candidate) => iconMatches(candidate, iconConfig));
    if (!icon) icon = document.createElement("link");

    icon.rel = iconConfig.rel;
    icon.href = iconConfig.href;
    if (iconConfig.type) icon.type = iconConfig.type;
    if (iconConfig.sizes) icon.sizes.value = iconConfig.sizes;
    document.head.appendChild(icon);
  });
}
